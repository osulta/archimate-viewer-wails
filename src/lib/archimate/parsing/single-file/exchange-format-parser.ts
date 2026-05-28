import type { ParsedModel, ParsedElement, ParsedRelationship, ParsedDiagram } from '../../../../types/model'
import {
  getName,
  getId,
  getDirectChildrenByTag,
  getDirectChildByTag,
  getType,
  parseProperties,
  getDocumentation,
} from '../../xml-utils'
import { createParsedModel } from '../../domain/parsed-model'
import { parseExchangeDiagramFromXmlNode } from '../diagram/parse-diagram-tree'

export function parseExchangeFormat(modelNode: Element): ParsedModel {
  const elementsContainer = getDirectChildByTag(modelNode, 'elements')
  const relationshipsContainer = getDirectChildByTag(modelNode, 'relationships')
  const viewsContainer = getDirectChildByTag(modelNode, 'views')
  const diagramsContainer = getDirectChildByTag(viewsContainer, 'diagrams')

  const elementNodes = getDirectChildrenByTag(elementsContainer, 'element')
  const relationshipNodes = getDirectChildrenByTag(relationshipsContainer, 'relationship')
  const diagramNodes = getDirectChildrenByTag(diagramsContainer, 'view')

  const elements: ParsedElement[] = elementNodes.map((node) => ({
    id: getId(node),
    name: getName(node) || getId(node),
    type: getType(node, 'Element'),
    documentation: getDocumentation(node),
    properties: parseProperties(node),
  }))

  const relationships: ParsedRelationship[] = relationshipNodes.map((node) => {
    const relId = getId(node)
    const relName = getName(node)
    return {
      id: relId,
      name: relName && relName !== relId ? relName : '',
      type: getType(node, 'Relationship'),
      source: node.getAttribute('source') ?? '',
      target: node.getAttribute('target') ?? '',
      accessType: node.getAttribute('accessType') ?? undefined,
    }
  })

  const diagrams: ParsedDiagram[] = diagramNodes.map((viewNode) => parseExchangeDiagramFromXmlNode(viewNode))

  return createParsedModel({
    modelName: getName(modelNode) || 'ArchiMate model',
    format: 'exchange',
    elements,
    relationships,
    diagrams,
  })
}
