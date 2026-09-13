import { adjustBendpointsForNodeResize } from '../../archimate/connection-geometry'
import { generateArchimateModelId } from '../../archimate/model-id'
import {
  applyOverridesToNodes,
  findInnermostContainingNodeExcluding,
  findDirectParentNodeId,
  reparentNodeInTree,
  findNodeById,
  collectSubtreeIds,
  getSelectionOverrideRoots,
  roundDiagramCoord,
  isDiagramReferenceNode,
} from '../../archimate/diagram-model'
import type {
  ParsedDiagram,
  ParsedRelationship,
  DiagramNode,
  DiagramConnection,
  NodeOverride,
  CreatedRelationship,
  ParsedModel,
  DiagramOverridesMap,
  RelationshipOverridesMap,
} from '../../../types/model'

const AGGREGATION_RELATIONSHIP_TYPE = 'archimate:AggregationRelationship'

export function cloneDiagramNodes(nodes: DiagramNode[]): DiagramNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneDiagramNodes(node.children ?? []),
  }))
}

export function cloneNodeOverrideMap(source: DiagramOverridesMap): DiagramOverridesMap {
  return new Map(Array.from(source.entries(), ([diagramId, nodeMap]) => [diagramId, new Map(nodeMap)]))
}

export function cloneBendpointMap(source: RelationshipOverridesMap): RelationshipOverridesMap {
  return new Map(
    Array.from(source.entries(), ([diagramId, relMap]) => [
      diagramId,
      new Map(
        Array.from(relMap.entries(), ([ref, ov]) => [
          ref,
          {
            bendpoints: [...ov.bendpoints],
            ...(ov.lineColor !== undefined ? { lineColor: ov.lineColor } : {}),
          },
        ]),
      ),
    ]),
  )
}

interface NestAggregationUpdate {
  relationships: ParsedRelationship[]
  relationshipById: Map<string, ParsedRelationship>
  connections: DiagramConnection[]
  createdRelationship?: CreatedRelationship
}

export function buildNestAggregationUpdate(
  model: ParsedModel,
  diagramId: string,
  diagram: ParsedDiagram,
  containerNodeId: string,
  childNodeId: string,
): NestAggregationUpdate | null {
  if (containerNodeId === childNodeId) {
    return null
  }

  const containerNode = findNodeById(diagram.nodes, containerNodeId)
  const childNode = findNodeById(diagram.nodes, childNodeId)
  if (!containerNode?.elementRef || !childNode?.elementRef) {
    return null
  }
  if (containerNode.elementRef === childNode.elementRef) {
    return null
  }
  if (isDiagramReferenceNode(containerNode) || isDiagramReferenceNode(childNode)) {
    return null
  }

  const hasConnection = diagram.connections.some(
    (connection) =>
      (connection.source === containerNodeId && connection.target === childNodeId) ||
      (connection.source === childNodeId && connection.target === containerNodeId),
  )
  if (hasConnection) {
    return null
  }

  const existingAggregation = model.relationships.find(
    (relationship) =>
      relationship.type.includes('AggregationRelationship') &&
      ((relationship.source === containerNode.elementRef &&
        relationship.target === childNode.elementRef) ||
        (relationship.source === childNode.elementRef &&
          relationship.target === containerNode.elementRef)),
  )

  if (existingAggregation) {
    if (diagram.connections.some((connection) => connection.relationshipRef === existingAggregation.id)) {
      return null
    }
    const connId = generateArchimateModelId()
    const sourceIsContainer = existingAggregation.source === containerNode.elementRef
    const newConn: DiagramConnection = {
      id: connId,
      relationshipRef: existingAggregation.id,
      source: sourceIsContainer ? containerNodeId : childNodeId,
      target: sourceIsContainer ? childNodeId : containerNodeId,
      bendpoints: [],
    }
    return {
      relationships: model.relationships,
      relationshipById: model.relationshipById,
      connections: [...diagram.connections, newConn],
      createdRelationship: {
        diagramId,
        relationship: existingAggregation,
        connection: newConn,
        format: model.format,
      },
    }
  }

  const relId = generateArchimateModelId()
  const connId = generateArchimateModelId()
  const newRel: ParsedRelationship = {
    id: relId,
    name: '',
    type: AGGREGATION_RELATIONSHIP_TYPE,
    source: containerNode.elementRef,
    target: childNode.elementRef,
  }
  const newConn: DiagramConnection = {
    id: connId,
    relationshipRef: relId,
    source: containerNodeId,
    target: childNodeId,
    bendpoints: [],
  }
  const nextRelationshipById = new Map(model.relationshipById)
  nextRelationshipById.set(relId, newRel)
  return {
    relationships: [...model.relationships, newRel],
    relationshipById: nextRelationshipById,
    connections: [...diagram.connections, newConn],
    createdRelationship: {
      diagramId,
      relationship: newRel,
      connection: newConn,
      format: model.format,
    },
  }
}

export function applyNestAggregationToDiagrams(
  model: ParsedModel,
  diagramId: string,
  diagrams: ParsedDiagram[],
  containerNodeId: string,
  childNodeId: string,
): {
  diagrams: ParsedDiagram[]
  relationships: ParsedRelationship[]
  relationshipById: Map<string, ParsedRelationship>
  createdRelationship?: CreatedRelationship
} | null {
  const diagram = diagrams.find((item) => item.id === diagramId)
  if (!diagram) {
    return null
  }
  const aggregationUpdate = buildNestAggregationUpdate(
    model,
    diagramId,
    diagram,
    containerNodeId,
    childNodeId,
  )
  if (!aggregationUpdate) {
    return null
  }
  return {
    diagrams: diagrams.map((item) =>
      item.id === diagramId ? { ...item, connections: aggregationUpdate.connections } : item,
    ),
    relationships: aggregationUpdate.relationships,
    relationshipById: aggregationUpdate.relationshipById,
    createdRelationship: aggregationUpdate.createdRelationship,
  }
}

export interface MoveNodesUpdate {
  nextDiagramOverrides: DiagramOverridesMap
  beforeDiagramOverrides: DiagramOverridesMap
  nestingChanged: boolean
  nextDiagramNodes: DiagramNode[]
  nextConnections: DiagramConnection[]
  nextRelationships: ParsedRelationship[]
  nextRelationshipById: Map<string, ParsedRelationship>
  beforeDiagramNodes: DiagramNode[]
  beforeConnections: DiagramConnection[]
  beforeRelationships: ParsedRelationship[]
  beforeRelationshipById: Map<string, ParsedRelationship>
  createdRelationship?: CreatedRelationship
  roots: string[]
}

export function computeMoveNodesUpdate(
  model: ParsedModel,
  diagramId: string,
  nodeIds: string[],
  dx: number,
  dy: number,
  diagramOverrides: DiagramOverridesMap,
): MoveNodesUpdate | null {
  if (!diagramId || !nodeIds.length || (dx === 0 && dy === 0)) {
    return null
  }
  const diagram = model.diagrams.find((item) => item.id === diagramId)
  if (!diagram) {
    return null
  }

  const roots = getSelectionOverrideRoots(new Set(nodeIds), diagram.nodes)
  if (!roots.length) {
    return null
  }

  const beforeDiagramOverrides = cloneNodeOverrideMap(diagramOverrides)
  const overrides = diagramOverrides.get(diagramId) ?? new Map()
  const nextOverrides = new Map(overrides)
  for (const nodeId of roots) {
    const prev = nextOverrides.get(nodeId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
    nextOverrides.set(nodeId, {
      ...prev,
      dx: roundDiagramCoord((prev.dx ?? 0) + dx),
      dy: roundDiagramCoord((prev.dy ?? 0) + dy),
    })
  }
  const nextDiagramOverrides = new Map(diagramOverrides)
  nextDiagramOverrides.set(diagramId, nextOverrides)

  const layoutNodes = applyOverridesToNodes(diagram.nodes, nextOverrides)
  const primaryNodeId = roots[0]
  const movedNode = findNodeById(layoutNodes, primaryNodeId)

  let nextDiagramNodes = diagram.nodes
  let nextRelationships = model.relationships
  let nextRelationshipById = model.relationshipById
  let nextConnections = diagram.connections
  let createdRelationship: CreatedRelationship | undefined
  let nestingChanged = false

  const canReparentOnMove =
    roots.length === 1 &&
    movedNode &&
    (Boolean(movedNode.elementRef) || isDiagramReferenceNode(movedNode))
  if (canReparentOnMove && movedNode) {
    const excludeIds = new Set(collectSubtreeIds(movedNode))
    const containerNode = findInnermostContainingNodeExcluding(layoutNodes, movedNode, excludeIds)
    if (
      containerNode?.elementRef &&
      !isDiagramReferenceNode(containerNode) &&
      containerNode.id !== primaryNodeId
    ) {
      const currentParentId = findDirectParentNodeId(diagram.nodes, primaryNodeId)
      if (containerNode.id !== currentParentId) {
        nextDiagramNodes = reparentNodeInTree(diagram.nodes, primaryNodeId, containerNode.id)
        nestingChanged = true
      }
      if (!isDiagramReferenceNode(movedNode)) {
        const aggregationResult = applyNestAggregationToDiagrams(
          model,
          diagramId,
          model.diagrams.map((item) =>
            item.id === diagramId ? { ...item, nodes: nextDiagramNodes } : item,
          ),
          containerNode.id,
          primaryNodeId,
        )
        if (aggregationResult) {
          nextDiagramNodes =
            aggregationResult.diagrams.find((item) => item.id === diagramId)?.nodes ?? nextDiagramNodes
          nextConnections =
            aggregationResult.diagrams.find((item) => item.id === diagramId)?.connections ??
            nextConnections
          nextRelationships = aggregationResult.relationships
          nextRelationshipById = aggregationResult.relationshipById
          createdRelationship = aggregationResult.createdRelationship
          nestingChanged = true
        }
      }
    }
  }

  return {
    nextDiagramOverrides,
    beforeDiagramOverrides,
    nestingChanged,
    nextDiagramNodes,
    nextConnections,
    nextRelationships,
    nextRelationshipById,
    beforeDiagramNodes: cloneDiagramNodes(diagram.nodes),
    beforeConnections: [...diagram.connections],
    beforeRelationships: model.relationships,
    beforeRelationshipById: new Map(model.relationshipById),
    createdRelationship,
    roots,
  }
}

export interface ResizeNodeUpdate {
  nextDiagramOverrides: DiagramOverridesMap
  nextRelOverrides: RelationshipOverridesMap
  beforeDiagramOverrides: DiagramOverridesMap
  beforeRelOverrides: RelationshipOverridesMap
  relChanged: boolean
}

export function computeResizeNodeUpdate(
  diagram: ParsedDiagram,
  diagramId: string,
  nodeId: string,
  dw: number,
  dh: number,
  diagramOverrides: DiagramOverridesMap,
  relationshipOverrides: RelationshipOverridesMap,
): ResizeNodeUpdate | null {
  if (!nodeId || (dw === 0 && dh === 0)) {
    return null
  }
  const node = findNodeById(diagram.nodes, nodeId)
  if (!node) {
    return null
  }

  const nextWidth = Math.max(30, node.width + dw)
  const nextHeight = Math.max(24, node.height + dh)
  const appliedDw = nextWidth - node.width
  const appliedDh = nextHeight - node.height
  if (appliedDw === 0 && appliedDh === 0) {
    return null
  }

  const beforeDiagramOverrides = cloneNodeOverrideMap(diagramOverrides)
  const beforeRelOverrides = cloneBendpointMap(relationshipOverrides)

  const overrides = diagramOverrides.get(diagramId) ?? new Map()
  const prev = overrides.get(nodeId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
  const nextOverrides = new Map(overrides)
  nextOverrides.set(nodeId, {
    ...prev,
    dw: (prev.dw ?? 0) + appliedDw,
    dh: (prev.dh ?? 0) + appliedDh,
  })
  const nextDiagramOverrides = new Map(diagramOverrides)
  nextDiagramOverrides.set(diagramId, nextOverrides)

  const relMap = new Map(relationshipOverrides.get(diagramId) ?? new Map())
  let relChanged = false
  diagram.connections.forEach((connection) => {
    if (connection.source !== nodeId && connection.target !== nodeId) {
      return
    }
    if (!connection.bendpoints?.length) {
      return
    }
    const prevOv = relMap.get(connection.relationshipRef)
    const current = prevOv?.bendpoints ?? connection.bendpoints
    const next = adjustBendpointsForNodeResize(current, connection, nodeId, appliedDw, appliedDh)
    relMap.set(connection.relationshipRef, {
      bendpoints: next,
      ...(prevOv?.lineColor !== undefined ? { lineColor: prevOv.lineColor } : {}),
    })
    relChanged = true
  })
  const nextRelOverrides = new Map(relationshipOverrides)
  if (relChanged) {
    nextRelOverrides.set(diagramId, relMap)
  }

  return {
    nextDiagramOverrides,
    nextRelOverrides,
    beforeDiagramOverrides,
    beforeRelOverrides,
    relChanged,
  }
}

export interface NodeFillColorUpdate {
  nextDiagramOverrides: DiagramOverridesMap
  beforeDiagramOverrides: DiagramOverridesMap
}

export function computeNodeFillColorUpdate(
  diagramId: string,
  nodeId: string,
  fillColor: string | null,
  diagramOverrides: DiagramOverridesMap,
): NodeFillColorUpdate | null {
  if (!diagramId || !nodeId) {
    return null
  }
  const beforeDiagramOverrides = cloneNodeOverrideMap(diagramOverrides)
  const overrides = diagramOverrides.get(diagramId) ?? new Map()
  const prev = overrides.get(nodeId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
  const nextOverrides = new Map(overrides)
  const nextEntry: NodeOverride = { ...prev, fillColor }
  const layoutEmpty =
    (nextEntry.dx ?? 0) === 0 &&
    (nextEntry.dy ?? 0) === 0 &&
    (nextEntry.dw ?? 0) === 0 &&
    (nextEntry.dh ?? 0) === 0
  if (layoutEmpty && fillColor === undefined) {
    nextOverrides.delete(nodeId)
  } else {
    nextOverrides.set(nodeId, nextEntry)
  }
  const nextDiagramOverrides = new Map(diagramOverrides)
  nextDiagramOverrides.set(diagramId, nextOverrides)
  return { nextDiagramOverrides, beforeDiagramOverrides }
}

export interface ConnectionLineColorUpdate {
  nextOverrides: RelationshipOverridesMap
  beforeOverrides: RelationshipOverridesMap
}

export function computeConnectionLineColorUpdate(
  diagram: ParsedDiagram,
  diagramId: string,
  relationshipRef: string,
  lineColor: string | null,
  relationshipOverrides: RelationshipOverridesMap,
): ConnectionLineColorUpdate | null {
  if (!diagramId || !relationshipRef) {
    return null
  }
  const currentConnection = diagram.connections.find((c) => c.relationshipRef === relationshipRef)
  if (!currentConnection) {
    return null
  }
  const beforeOverrides = cloneBendpointMap(relationshipOverrides)
  const diagramMap = new Map(relationshipOverrides.get(diagramId) ?? new Map())
  const prev = diagramMap.get(relationshipRef)
  diagramMap.set(relationshipRef, {
    bendpoints: prev?.bendpoints ? [...prev.bendpoints] : [...(currentConnection.bendpoints ?? [])],
    lineColor,
  })
  const nextOverrides = new Map(relationshipOverrides)
  nextOverrides.set(diagramId, diagramMap)
  return { nextOverrides, beforeOverrides }
}
