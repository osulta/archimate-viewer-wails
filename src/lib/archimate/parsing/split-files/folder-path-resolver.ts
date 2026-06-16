import { getId, getName } from '../../xml-utils'
import { normalizeDiagramFolderFullPath } from '../../model-folder-tree'
import { getDocumentRootElement, getRootLocalName, parseXmlDocument } from '../xml/parse-xml-document'
import { classifySplitModelFile } from './split-file-classifier'

interface SplitModelFile {
  relativePath: string
  content: string
}

export interface DiagramFolderPathMaps {
  folderIdsByFullPath: Record<string, string>
  folderSourceFilesByFullPath: Record<string, string>
}

export function buildFolderPathResolver(
  files: SplitModelFile[],
  branchName = 'Views',
): {
  resolveFolderPath: (relativePath: string) => string
  folderMaps: DiagramFolderPathMaps
} {
  const folderNameByDir = new Map<string, string>()
  const folderIdByDir = new Map<string, string>()
  const folderSourceFileByDir = new Map<string, string>()

  for (const file of files) {
    let rootLocalName = ''
    try {
      const doc = parseXmlDocument(file.content)
      rootLocalName = getRootLocalName(getDocumentRootElement(doc))
    } catch {
      continue
    }

    if (classifySplitModelFile(file.relativePath, rootLocalName) !== 'folder') {
      continue
    }

    const normalized = file.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
    const dir = normalized.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/'))
      : ''

    try {
      const doc = parseXmlDocument(file.content)
      const folderNode = getDocumentRootElement(doc)
      const name = getName(folderNode) || dir || 'Folder'
      const id = getId(folderNode) || dir
      folderNameByDir.set(dir, name)
      folderIdByDir.set(dir, id)
      folderSourceFileByDir.set(dir, normalized)
    } catch {
      // ignore malformed folder metadata
    }
  }

  function resolveFolderPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
    const dir = normalized.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/'))
      : ''

    if (!dir) {
      return ''
    }

    const parts: string[] = []
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

  const folderIdsByFullPath: Record<string, string> = {}
  const folderSourceFilesByFullPath: Record<string, string> = {}

  for (const [dir, sourceFile] of folderSourceFileByDir.entries()) {
    const logicalPath = resolveFolderPath(sourceFile)
    if (!logicalPath) {
      continue
    }
    const fullPath = normalizeDiagramFolderFullPath(logicalPath, branchName)
    const id = folderIdByDir.get(dir)
    if (id) {
      folderIdsByFullPath[fullPath] = id
    }
    folderSourceFilesByFullPath[fullPath] = sourceFile
  }

  return {
    resolveFolderPath,
    folderMaps: {
      folderIdsByFullPath,
      folderSourceFilesByFullPath,
    },
  }
}
