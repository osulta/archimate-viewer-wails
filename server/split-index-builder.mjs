import fs from 'node:fs/promises'
import path from 'node:path'
import { DOMParser as LinkedomDOMParser } from 'linkedom'

if (!globalThis.DOMParser) {
  globalThis.DOMParser = LinkedomDOMParser
}

const HEAD_BYTES = 4096
const READ_CONCURRENCY = 48

/**
 * @param {string} head
 */
function extractAttributesFromXmlHead(head) {
  const id = head.match(/\bid="([^"]+)"/)?.[1] ?? ''
  const name = head.match(/\bname="([^"]+)"/)?.[1] ?? ''
  return { id, name }
}

/**
 * @param {string} fileName
 */
function extractIdFromArchimateFileName(fileName) {
  const match = fileName.match(/_((?:id-)?[a-f0-9-]+)\.xml$/i)
  return match?.[1] ?? ''
}

/**
 * @param {string} head
 */
function extractElementTypeFromXmlHead(head) {
  const match = head.match(/<(?:[\w-]+:)?([A-Z][A-Za-z0-9]+)/)
  return match?.[1] ? `archimate:${match[1]}` : 'archimate:Element'
}

/**
 * @param {string} content
 */
function scanDiagramRefsFromXml(content) {
  const elementRefs = []
  const relationshipRefs = []
  const elementPattern = /archimateElement[^>]*href="[^"#]*#([^"]+)"/g
  const relationshipPattern = /archimateRelationship[^>]*href="[^"#]*#([^"]+)"/g

  let match = elementPattern.exec(content)
  while (match) {
    elementRefs.push(match[1])
    match = elementPattern.exec(content)
  }

  match = relationshipPattern.exec(content)
  while (match) {
    relationshipRefs.push(match[1])
    match = relationshipPattern.exec(content)
  }

  return { elementRefs, relationshipRefs }
}

/**
 * @param {string} relativePath
 * @param {Map<string, string>} folderNameByDir
 */
function resolveFolderPath(relativePath, folderNameByDir) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const dir = normalized.includes('/')
    ? normalized.slice(0, normalized.lastIndexOf('/'))
    : ''

  if (!dir) {
    return ''
  }

  const parts = []
  let current = dir
  while (current) {
    const name = folderNameByDir.get(current)
    if (name) {
      parts.unshift(name)
    }
    const slash = current.lastIndexOf('/')
    current = slash >= 0 ? current.slice(0, slash) : ''
  }

  return parts.join(' / ')
}

/**
 * @param {string} relativePath
 */
function classifySplitFile(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  const fileName = segments.at(-1) ?? normalized

  if (fileName === 'folder.xml') {
    return segments.length <= 1 ? 'manifest' : 'folder'
  }
  if (segments[0] === 'relations') {
    return 'relationship'
  }
  if (segments[0] === 'diagrams') {
    return fileName.startsWith('ArchimateDiagramModel_') ? 'diagram' : 'folder'
  }
  return 'element'
}

/**
 * @param {Array<() => Promise<void>>} tasks
 * @param {number} concurrency
 */
async function runPool(tasks, concurrency) {
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const task = tasks[index]
      index += 1
      await task()
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
}

/**
 * @param {string[]} relativePaths paths inside model root
 * @param {(relativePath: string) => Promise<string>} readFull
 */
export async function buildSplitModelIndexFromRelativePaths(relativePaths, readFull) {
  const fileEntries = relativePaths.map((relativePath) => ({
    relativePath: relativePath.replace(/\\/g, '/'),
    category: classifySplitFile(relativePath),
  }))

  /** @type {Map<string, string>} */
  const folderNameByDir = new Map()

  for (const entry of fileEntries) {
    if (entry.category !== 'folder') {
      continue
    }
    try {
      const head = (await readFull(entry.relativePath)).slice(0, HEAD_BYTES)
      const { name } = extractAttributesFromXmlHead(head)
      const normalized = entry.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
      const dir = normalized.includes('/')
        ? normalized.slice(0, normalized.lastIndexOf('/'))
        : ''
      folderNameByDir.set(dir, name || dir || 'Folder')
    } catch {
      // ignore malformed folder metadata
    }
  }

  const manifestEntry = fileEntries.find((f) => f.category === 'manifest')
  let modelName = 'ArchiMate model'
  if (manifestEntry) {
    try {
      const head = (await readFull(manifestEntry.relativePath)).slice(0, HEAD_BYTES)
      modelName = extractAttributesFromXmlHead(head).name || modelName
    } catch {
      // keep default
    }
  }

  /** @type {Record<string, string[]>} */
  const elementRefToDiagramIds = {}
  /** @type {Record<string, string[]>} */
  const relationshipRefToDiagramIds = {}

  function addToIndex(index, key, diagramId) {
    if (!key) {
      return
    }
    const list = index[key]
    if (!list) {
      index[key] = [diagramId]
      return
    }
    if (!list.includes(diagramId)) {
      list.push(diagramId)
    }
  }

  /** @type {object[]} */
  const diagrams = []
  const diagramTasks = fileEntries
    .filter((f) => f.category === 'diagram')
    .map((entry) => async () => {
      const folderPath = resolveFolderPath(entry.relativePath, folderNameByDir)
      let content = ''
      try {
        content = await readFull(entry.relativePath)
      } catch {
        return
      }

      const head = content.slice(0, HEAD_BYTES)
      const attrs = extractAttributesFromXmlHead(head)
      const fileName = entry.relativePath.split('/').pop() ?? ''
      const diagramId = attrs.id || extractIdFromArchimateFileName(fileName)
      if (!diagramId) {
        return
      }

      const { elementRefs, relationshipRefs } = scanDiagramRefsFromXml(content)
      for (const ref of elementRefs) {
        addToIndex(elementRefToDiagramIds, ref, diagramId)
      }
      for (const ref of relationshipRefs) {
        addToIndex(relationshipRefToDiagramIds, ref, diagramId)
      }

      diagrams.push({
        id: diagramId,
        name: attrs.name || diagramId,
        type: 'archimate:ArchimateDiagramModel',
        folderPath: folderPath || undefined,
        sourceFile: entry.relativePath.replace(/\\/g, '/'),
        loaded: false,
        nodes: [],
        connections: [],
      })
    })

  await runPool(diagramTasks, Math.min(8, diagramTasks.length || 1))

  /** @type {object[]} */
  const elements = []
  const elementTasks = fileEntries
    .filter((f) => f.category === 'element')
    .map((entry) => async () => {
      const folderPath = resolveFolderPath(entry.relativePath, folderNameByDir)
      try {
        const head = (await readFull(entry.relativePath)).slice(0, HEAD_BYTES)
        const attrs = extractAttributesFromXmlHead(head)
        const fileName = entry.relativePath.split('/').pop() ?? ''
        const elementId = attrs.id || extractIdFromArchimateFileName(fileName)
        if (!elementId) {
          return
        }
        elements.push({
          id: elementId,
          name: attrs.name || elementId,
          type: extractElementTypeFromXmlHead(head),
          folderPath: folderPath || undefined,
          sourceFile: entry.relativePath.replace(/\\/g, '/'),
          lite: true,
        })
      } catch {
        // skip unreadable element
      }
    })

  await runPool(elementTasks, READ_CONCURRENCY)

  /** @type {object[]} */
  const relationships = []
  const { parseRelationshipFile } = await import(
    '../src/lib/archimate/parsing/split-files/relationship-file-parser.js'
  )

  const relationshipTasks = fileEntries
    .filter((f) => f.category === 'relationship')
    .map((entry) => async () => {
      try {
        const content = await readFull(entry.relativePath)
        const relativePath = entry.relativePath.replace(/\\/g, '/')
        relationships.push(parseRelationshipFile(content, relativePath))
      } catch {
        // skip
      }
    })

  await runPool(relationshipTasks, READ_CONCURRENCY)

  elements.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
  diagrams.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
  relationships.sort((a, b) =>
    (a.name ?? a.id ?? '').localeCompare(b.name ?? b.id ?? '', undefined, { sensitivity: 'base' }),
  )

  return {
    modelName,
    format: 'split-files',
    elements,
    relationships,
    diagrams,
    indexes: {
      elementRefToDiagramIds,
      relationshipRefToDiagramIds,
    },
  }
}

/**
 * @param {string} modelRootAbs
 */
export async function buildSplitModelIndex(modelRootAbs) {
  /** @type {string[]} */
  const relativePaths = []

  async function walk(dirAbs, relPrefix) {
    const entries = await fs.readdir(dirAbs, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue
      }
      const full = path.join(dirAbs, entry.name)
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(full, rel)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
        relativePaths.push(rel)
      }
    }
  }

  await walk(modelRootAbs, '')

  return buildSplitModelIndexFromRelativePaths(relativePaths, (relativePath) =>
    fs.readFile(path.join(modelRootAbs, relativePath), 'utf8'),
  )
}
