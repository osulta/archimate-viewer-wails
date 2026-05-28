import type { ParsedElement } from '../../../../types/model'
import {
  getName,
  getId,
  getType,
  parseProperties,
  getDocumentation,
} from '../../xml-utils'
import { getDocumentRootElement, getRootLocalName, parseXmlDocument } from '../xml/parse-xml-document'

export function parseElementFile(content: string, relativePath: string, folderPath: string): ParsedElement | null {
  const documentNode = parseXmlDocument(content)
  const root = getDocumentRootElement(documentNode)
  const rootLocalName = getRootLocalName(root)

  if (rootLocalName === 'Folder' || rootLocalName === 'ArchimateModel') {
    return null
  }

  const documentation =
    getDocumentation(root) || root.getAttribute('documentation')?.trim() || ''

  return {
    id: getId(root),
    name: getName(root) || getId(root),
    type: getType(root, `archimate:${rootLocalName}`),
    documentation,
    properties: parseProperties(root),
    folderPath: folderPath || undefined,
    sourceFile: relativePath,
  }
}
