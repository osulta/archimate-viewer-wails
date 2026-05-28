import type { ParsedModel, ParsedElement, ParsedRelationship, ParsedDiagram } from '../../../../types/model'
import {
  getName,
  getId,
  getDirectChildrenByTag,
  getType,
  parseProperties,
  getDocumentation,
} from '../../xml-utils'
import { createParsedModel } from '../../domain/parsed-model'
import { parseDiagramFromXmlNode } from '../diagram/parse-diagram-tree'

export function parseArchiToolFormat(modelNode: Element): ParsedModel {
  const modelName = getName(modelNode) || 'ArchiMate model'

  const elements: ParsedElement[] = []
  const relationships: ParsedRelationship[] = []
  const diagrams: ParsedDiagram[] = []

  function walkFolder(folderNode: Element, pathParts: string[], inDiagramsBranch = false): void {
    const folderName = getName(folderNode) || 'Folder'
    const folderType = folderNode.getAttribute('type') ?? ''
    const nextPath = [...pathParts, folderName]
    const isDiagramsBranch = inDiagramsBranch || folderType === 'diagrams'

    const childFolders = getDirectChildrenByTag(folderNode, 'folder')
    childFolders.forEach((child) => walkFolder(child, nextPath, isDiagramsBranch))

    const elementNodes = getDirectChildrenByTag(folderNode, 'element')

    if (folderType === 'relations') {
      elementNodes.forEach((node) => {
        const relName = getName(node)
        relationships.push({
          id: getId(node),
          name: relName && relName !== getId(node) ? relName : '',
          type: getType(node, 'Relationship'),
          source: node.getAttribute('source') ?? '',
          target: node.getAttribute('target') ?? '',
          accessType: node.getAttribute('accessType') ?? undefined,
        })
      })
      return
    }

    if (isDiagramsBranch) {
      const folderPath = nextPath.join(' / ')
      elementNodes.forEach((diagramNode) => {
        if (getType(diagramNode, '') !== 'archimate:ArchimateDiagramModel') {
          return
        }
        diagrams.push(parseDiagramFromXmlNode(diagramNode, folderPath))
      })
      return
    }

    elementNodes.forEach((node) => {
      const type = getType(node, 'Element')
      if (type === 'archimate:ArchimateDiagramModel') {
        return
      }
      elements.push({
        id: getId(node),
        name: getName(node) || getId(node),
        type,
        documentation: getDocumentation(node),
        properties: parseProperties(node),
      })
    })
  }

  getDirectChildrenByTag(modelNode, 'folder').forEach((folder) => walkFolder(folder, []))

  return createParsedModel({
    modelName,
    format: 'archi-tool',
    elements,
    relationships,
    diagrams,
  })
}
