import type { ParsedDiagram, ParsedElement, DiagramNode, DiagramConnection, Bendpoint } from '../../types/model'
import { flattenNodes } from './diagram-model'

const BOUNDS_EPS = 0.5

interface NodeBounds {
  x: number
  y: number
  width: number
  height: number
}

interface NodeViewState extends NodeBounds {
  elementRef: string
  label: string
  elementName: string
  elementType: string
}

interface ConnectionViewState {
  relationshipRef: string
  sourceElementRef: string
  targetElementRef: string
  sourceNodeId: string
  targetNodeId: string
  bendpoints: Bendpoint[]
}

function boundsEqual(a: NodeBounds, b: NodeBounds): boolean {
  return (
    Math.abs(a.x - b.x) <= BOUNDS_EPS &&
    Math.abs(a.y - b.y) <= BOUNDS_EPS &&
    Math.abs(a.width - b.width) <= BOUNDS_EPS &&
    Math.abs(a.height - b.height) <= BOUNDS_EPS
  )
}

function bendpointsEqual(left: Bendpoint[] = [], right: Bendpoint[] = []): boolean {
  if (left.length !== right.length) {
    return false
  }
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]
    const b = right[i]
    if (
      Math.abs((a.startX ?? 0) - (b.startX ?? 0)) > BOUNDS_EPS ||
      Math.abs((a.startY ?? 0) - (b.startY ?? 0)) > BOUNDS_EPS ||
      Math.abs((a.endX ?? 0) - (b.endX ?? 0)) > BOUNDS_EPS ||
      Math.abs((a.endY ?? 0) - (b.endY ?? 0)) > BOUNDS_EPS
    ) {
      return false
    }
  }
  return true
}

function nodeViewState(node: DiagramNode, elementById?: Map<string, ParsedElement>): NodeViewState {
  const element = node.elementRef ? elementById?.get(node.elementRef) : null
  return {
    elementRef: node.elementRef ?? '',
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    label: node.label?.trim() ?? '',
    elementName: element?.name?.trim() ?? '',
    elementType: element?.type ?? '',
  }
}

function indexNodesByElementRef(diagram: ParsedDiagram): {
  byRef: Map<string, DiagramNode[]>
  byId: Map<string, DiagramNode>
} {
  const byRef = new Map<string, DiagramNode[]>()
  const byId = new Map<string, DiagramNode>()
  flattenNodes(diagram.nodes).forEach((node: DiagramNode) => {
    byId.set(node.id, node)
    if (node.elementRef) {
      const list = byRef.get(node.elementRef) ?? []
      list.push(node)
      byRef.set(node.elementRef, list)
    }
  })
  return { byRef, byId }
}

function connectionViewState(
  connection: DiagramConnection,
  nodeById: Map<string, DiagramNode>,
  elementById?: Map<string, ParsedElement>,
): ConnectionViewState {
  const source = nodeById.get(connection.source)
  const target = nodeById.get(connection.target)
  return {
    relationshipRef: connection.relationshipRef ?? '',
    sourceElementRef: source?.elementRef ?? '',
    targetElementRef: target?.elementRef ?? '',
    sourceNodeId: connection.source,
    targetNodeId: connection.target,
    bendpoints: connection.bendpoints ?? [],
  }
}

function indexConnections(
  diagram: ParsedDiagram,
  nodeById: Map<string, DiagramNode>,
  elementById?: Map<string, ParsedElement>,
): Map<string, ConnectionViewState[]> {
  const byRel = new Map<string, ConnectionViewState[]>()
  diagram.connections.forEach((connection) => {
    const key = connection.relationshipRef || connection.id
    if (!key) {
      return
    }
    const list = byRel.get(key) ?? []
    list.push(connectionViewState(connection, nodeById, elementById))
    byRel.set(key, list)
  })
  return byRel
}

function pickPeer<T>(states: T[], peerList: T[] | undefined): T | null {
  if (!peerList?.length) {
    return null
  }
  if (states.length === 1 && peerList.length === 1) {
    return peerList[0]
  }
  return peerList[0]
}

function statesEqual(left: NodeViewState, right: NodeViewState): boolean {
  return (
    boundsEqual(left, right) &&
    left.label === right.label &&
    left.elementName === right.elementName &&
    left.elementType === right.elementType
  )
}

function connectionsEqual(left: ConnectionViewState, right: ConnectionViewState): boolean {
  return (
    left.sourceElementRef === right.sourceElementRef &&
    left.targetElementRef === right.targetElementRef &&
    bendpointsEqual(left.bendpoints, right.bendpoints)
  )
}

export function computeDiagramCompareDiff(
  currentDiagram: ParsedDiagram | null | undefined,
  compareDiagram: ParsedDiagram | null | undefined,
  currentElementById?: Map<string, ParsedElement>,
  compareElementById?: Map<string, ParsedElement>,
): { changedNodeIds: Set<string>; changedConnectionIds: Set<string> } {
  const changedNodeIds = new Set<string>()
  const changedConnectionIds = new Set<string>()

  if (!currentDiagram || !compareDiagram) {
    return { changedNodeIds, changedConnectionIds }
  }

  const currentNodes = indexNodesByElementRef(currentDiagram)
  const compareNodes = indexNodesByElementRef(compareDiagram)
  const compareNodeById = compareNodes.byId

  flattenNodes(currentDiagram.nodes).forEach((node: DiagramNode) => {
    const left = nodeViewState(node, currentElementById)
    if (!left.elementRef) {
      return
    }
    const peers = compareNodes.byRef.get(left.elementRef)
    const rightState = pickPeer([left], peers?.map((n: DiagramNode) => nodeViewState(n, compareElementById)))
    if (!rightState || !statesEqual(left, rightState)) {
      changedNodeIds.add(node.id)
    }
  })

  const compareConnections = indexConnections(
    compareDiagram,
    compareNodeById,
    compareElementById,
  )

  currentDiagram.connections.forEach((connection) => {
    const left = connectionViewState(connection, currentNodes.byId, currentElementById)
    if (!left.relationshipRef) {
      return
    }
    const peers = compareConnections.get(left.relationshipRef)
    const rightState = pickPeer([left], peers)
    if (!rightState || !connectionsEqual(left, rightState)) {
      changedConnectionIds.add(connection.id)
    }
  })

  return { changedNodeIds, changedConnectionIds }
}
