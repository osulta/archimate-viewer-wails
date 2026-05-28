import { getName } from '../../xml-utils'
import { getDocumentRootElement, getRootLocalName, parseXmlDocument } from '../xml/parse-xml-document'
import { classifySplitModelFile } from './split-file-classifier'

interface SplitModelFile {
  relativePath: string
  content: string
}

export function buildFolderPathResolver(files: SplitModelFile[]): (relativePath: string) => string {
  const folderNameByDir = new Map<string, string>()

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
      folderNameByDir.set(dir, name)
    } catch {
      // ignore malformed folder metadata
    }
  }

  return function resolveFolderPath(relativePath: string): string {
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
}
