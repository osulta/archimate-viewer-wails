import type { ParsedRelationship } from '../../../../types/model'
import {
  getName,
  getId,
  getType,
  parseProperties,
  getDocumentation,
} from '../../xml-utils'
import { getDocumentRootElement, getRootLocalName, parseXmlDocument } from '../xml/parse-xml-document'
import { parseRelationshipEndpoints } from '../diagram/parse-diagram-tree'

export function parseRelationshipFile(content: string, relativePath: string): ParsedRelationship {
  const documentNode = parseXmlDocument(content)
  const root = getDocumentRootElement(documentNode)
  const { source, target } = parseRelationshipEndpoints(root)

  const documentation =
    getDocumentation(root) || root.getAttribute('documentation')?.trim() || ''

  const id = getId(root)
  const rootLocalName = getRootLocalName(root)
  const rawName = getName(root)
  return {
    id,
    name: rawName && rawName !== id ? rawName : '',
    type: getType(root, `archimate:${rootLocalName}`),
    source,
    target,
    accessType: root.getAttribute('accessType') ?? undefined,
    documentation,
    properties: parseProperties(root),
    folderPath: 'Relations',
    sourceFile: relativePath,
  }
}
