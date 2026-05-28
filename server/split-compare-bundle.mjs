import path from 'node:path'
import { DOMParser as LinkedomDOMParser } from 'linkedom'

if (!globalThis.DOMParser) {
  globalThis.DOMParser = LinkedomDOMParser
}

const READ_CONCURRENCY = 24

/**
 * @param {string} content
 * @returns {string[]}
 */
export function extractModelFileNamesFromDiagramXml(content) {
  const files = new Set()
  const pattern = /href="([^"?#]+\.xml)(?:[#?]|")/gi
  let match = pattern.exec(content)
  while (match) {
    const fileName = match[1].split('/').pop()?.trim()
    if (fileName) {
      files.add(fileName)
    }
    match = pattern.exec(content)
  }
  return [...files]
}

/**
 * @param {string[]} modelRelativePaths paths inside model root from git ls-tree
 * @returns {Map<string, string>}
 */
export function buildFileNameToRelativePathMap(modelRelativePaths) {
  const map = new Map()
  for (const relativePath of modelRelativePaths) {
    const fileName = relativePath.split('/').pop()
    if (fileName && !map.has(fileName)) {
      map.set(fileName, relativePath.replace(/\\/g, '/'))
    }
  }
  return map
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
  const workers = Array.from({ length: Math.min(concurrency, tasks.length || 1) }, () => worker())
  await Promise.all(workers)
}

/**
 * @param {object} options
 * @param {string} options.modelRootInWorkTree e.g. model
 * @param {string} options.diagramSourceFile e.g. diagrams/id-…/ArchimateDiagramModel_….xml
 * @param {string[]} options.modelRelativePaths
 * @param {(gitPathInWorkTree: string) => string} options.readGitFile
 */
export async function buildSplitCompareBundle({
  modelRootInWorkTree,
  diagramSourceFile,
  modelRelativePaths,
  readGitFile,
}) {
  const normalizedSource = String(diagramSourceFile ?? '')
    .trim()
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
  if (!normalizedSource) {
    throw new Error('Не указан файл диаграммы')
  }

  const diagramGitPath = `${modelRootInWorkTree}/${normalizedSource}`.replace(/\\/g, '/')
  const diagramContent = readGitFile(diagramGitPath)
  if (!diagramContent?.trim()) {
    throw new Error(`Диаграмма не найдена в ветке: ${normalizedSource}`)
  }

  const { parseDiagramFile } = await import(
    '../src/lib/archimate/parsing/split-files/diagram-file-parser.js'
  )
  const { parseElementFile } = await import(
    '../src/lib/archimate/parsing/split-files/element-file-parser.js'
  )
  const { parseRelationshipFile } = await import(
    '../src/lib/archimate/parsing/split-files/relationship-file-parser.js'
  )

  const diagram = parseDiagramFile(diagramContent, normalizedSource, '')
  if (!diagram) {
    throw new Error(`Не удалось разобрать диаграмму ${normalizedSource}`)
  }

  const fileNameIndex = buildFileNameToRelativePathMap(modelRelativePaths)
  const hrefFileNames = extractModelFileNamesFromDiagramXml(diagramContent)
  const relatedPaths = []
  for (const fileName of hrefFileNames) {
    const relativePath = fileNameIndex.get(fileName)
    if (relativePath) {
      relatedPaths.push(relativePath)
    }
  }

  /** @type {object[]} */
  const elements = []
  /** @type {object[]} */
  const relationships = []

  const tasks = relatedPaths.map((relativePath) => async () => {
    const gitPath = `${modelRootInWorkTree}/${relativePath}`.replace(/\\/g, '/')
    let content = ''
    try {
      content = readGitFile(gitPath)
    } catch {
      return
    }
    if (!content?.trim()) {
      return
    }
    try {
      if (relativePath.startsWith('relations/')) {
        relationships.push(parseRelationshipFile(content, relativePath))
      } else {
        const parsed = parseElementFile(content, relativePath, '')
        if (parsed) {
          elements.push({ ...parsed, lite: false })
        }
      }
    } catch {
      // skip malformed file
    }
  })

  await runPool(tasks, READ_CONCURRENCY)

  return {
    diagram: { ...diagram, loaded: true },
    elements,
    relationships,
  }
}
