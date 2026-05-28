import type { ParsedDiagram } from '../../../../types/model'
import { getDocumentRootElement, getRootLocalName, parseXmlDocument } from '../xml/parse-xml-document'
import { parseDiagramFromXmlNode } from '../diagram/parse-diagram-tree'

export function parseDiagramFile(content: string, relativePath: string, folderPath: string): ParsedDiagram | null {
  const documentNode = parseXmlDocument(content)
  const root = getDocumentRootElement(documentNode)
  const rootLocalName = getRootLocalName(root)

  if (rootLocalName !== 'ArchimateDiagramModel') {
    return null
  }

  const diagram = parseDiagramFromXmlNode(root, folderPath)
  return {
    ...diagram,
    sourceFile: relativePath,
  }
}
