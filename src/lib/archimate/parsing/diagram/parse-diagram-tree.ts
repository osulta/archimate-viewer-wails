import type { DiagramNode, DiagramConnection, ParsedDiagram } from '../../../../types/model'
import {
  getName,
  getId,
  getDirectChildrenByTag,
  getDirectChildByTag,
  getType,
  getDiagramObjectLabel,
  parseConnectionBendpoints,
  parseDiagramObjectColors,
} from '../../xml-utils'
import {
  idFromArchimateChildHref,
} from '../xml/href-utils'

const DIAGRAM_OBJECT_TAGS = ['child', 'children']
const CONNECTION_TAGS = ['sourceConnection', 'sourceConnections']

function getDiagramObjectChildren(parent: Element): Element[] {
  const out: Element[] = []
  for (const tag of DIAGRAM_OBJECT_TAGS) {
    out.push(...getDirectChildrenByTag(parent, tag))
  }
  return out
}

function getConnectionChildren(parent: Element): Element[] {
  const out: Element[] = []
  for (const tag of CONNECTION_TAGS) {
    out.push(...getDirectChildrenByTag(parent, tag))
  }
  return out
}

function getDiagramObjectElementRef(diagramObjectNode: Element): string {
  const attrRef = diagramObjectNode.getAttribute('archimateElement')
  if (attrRef?.trim()) {
    return attrRef.trim()
  }
  return idFromArchimateChildHref(diagramObjectNode, 'archimateElement')
}

function getConnectionRelationshipRef(connectionNode: Element): string {
  const attrRef = connectionNode.getAttribute('archimateRelationship')
  if (attrRef?.trim()) {
    return attrRef.trim()
  }
  return idFromArchimateChildHref(connectionNode, 'archimateRelationship')
}

function getConnectionRelationshipType(connectionNode: Element): string {
  const relNode = getDirectChildByTag(connectionNode, 'archimateRelationship')
  if (!relNode) {
    return ''
  }
  const fromAttr = getType(relNode, '')
  if (fromAttr?.trim()) {
    return fromAttr.trim()
  }
  const href = relNode.getAttribute('href') ?? ''
  const fileName = href.split('#')[0]?.split('/').pop() ?? ''
  const match = fileName.match(/^([A-Za-z]+Relationship)_/)
  return match ? `archimate:${match[1]}` : ''
}

export function parseDiagramFromXmlNode(diagramNode: Element, folderPath?: string): ParsedDiagram {
  function parseDiagramObject(childNode: Element, parentAbsX: number, parentAbsY: number): DiagramNode {
    const boundsNode = getDirectChildByTag(childNode, 'bounds')
    const x = Number(boundsNode?.getAttribute('x') ?? 0)
    const y = Number(boundsNode?.getAttribute('y') ?? 0)
    const width = Number(boundsNode?.getAttribute('width') ?? 120)
    const height = Number(boundsNode?.getAttribute('height') ?? 55)

    const absX = parentAbsX + x
    const absY = parentAbsY + y

    const children = getDiagramObjectChildren(childNode).map((nested) =>
      parseDiagramObject(nested, absX, absY),
    )
    const colors = parseDiagramObjectColors(childNode)

    return {
      id: getId(childNode),
      elementRef: getDiagramObjectElementRef(childNode),
      type: getType(childNode, 'DiagramObject'),
      label: getDiagramObjectLabel(childNode),
      x: absX,
      y: absY,
      width,
      height,
      children,
      ...colors,
    }
  }

  function collectConnections(childNode: Element, out: DiagramConnection[]): void {
    getConnectionChildren(childNode).forEach((conn) => {
      const bendpoints = parseConnectionBendpoints(conn)

      out.push({
        id: getId(conn),
        relationshipRef: getConnectionRelationshipRef(conn),
        relationshipType: getConnectionRelationshipType(conn),
        source: conn.getAttribute('source') ?? '',
        target: conn.getAttribute('target') ?? '',
        bendpoints,
      })
    })

    getDiagramObjectChildren(childNode).forEach((nested) => collectConnections(nested, out))
  }

  const topChildren = getDiagramObjectChildren(diagramNode)
  const nodes = topChildren.map((child) => parseDiagramObject(child, 0, 0))

  const connections: DiagramConnection[] = []
  topChildren.forEach((child) => collectConnections(child, connections))

  return {
    id: getId(diagramNode),
    name: getName(diagramNode) || getId(diagramNode),
    type: getType(diagramNode, 'View'),
    folderPath,
    nodes,
    connections,
  }
}

export function parseExchangeDiagramFromXmlNode(viewNode: Element): ParsedDiagram {
  function parseNodeTree(node: Element): DiagramNode {
    const boundsNode = getDirectChildByTag(node, 'bounds')
    const children = getDirectChildrenByTag(node, 'node').map(parseNodeTree)
    const colors = parseDiagramObjectColors(node)

    return {
      id: getId(node),
      elementRef: node.getAttribute('elementRef') ?? '',
      type: getType(node, 'Node'),
      label: getDiagramObjectLabel(node),
      x: Number(boundsNode?.getAttribute('x') ?? 0),
      y: Number(boundsNode?.getAttribute('y') ?? 0),
      width: Number(boundsNode?.getAttribute('w') ?? 120),
      height: Number(boundsNode?.getAttribute('h') ?? 55),
      children,
      ...colors,
    }
  }

  const nodeTree = getDirectChildrenByTag(viewNode, 'node').map(parseNodeTree)

  const connections: DiagramConnection[] = getDirectChildrenByTag(viewNode, 'connection').map((connectionNode) => ({
    id: getId(connectionNode),
    relationshipRef: connectionNode.getAttribute('relationshipRef') ?? '',
    source: connectionNode.getAttribute('source') ?? '',
    target: connectionNode.getAttribute('target') ?? '',
    bendpoints: [],
  }))

  return {
    id: getId(viewNode),
    name: getName(viewNode) || getId(viewNode),
    type: getType(viewNode, 'View'),
    nodes: nodeTree,
    connections,
  }
}

export function parseRelationshipEndpoints(relationshipNode: Element): { source: string; target: string } {
  const sourceAttr = relationshipNode.getAttribute('source')
  const targetAttr = relationshipNode.getAttribute('target')
  if (sourceAttr && targetAttr) {
    return { source: sourceAttr, target: targetAttr }
  }

  const sourceHref = idFromArchimateChildHref(relationshipNode, 'source')
  const targetHref = idFromArchimateChildHref(relationshipNode, 'target')
  return { source: sourceHref, target: targetHref }
}
