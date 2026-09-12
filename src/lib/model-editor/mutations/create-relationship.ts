import { generateArchimateModelId } from '../../archimate/model-id'
import {
  findNodeById,
  findNodeByElementRefInDiagram,
  isDiagramReferenceNode,
} from '../../archimate/diagram-model'
import type { ConnectionEndpointKind } from '../../diagram-canvas/types'
import type {
  ParsedRelationship,
  DiagramNode,
  Bendpoint,
  CreatedRelationship,
  ParsedModel,
  RelationshipOverridesMap,
} from '../../../types/model'
import { cloneBendpointMap } from './layout'

export type CreateRelationshipFailure =
  | 'invalid-input'
  | 'same-node'
  | 'missing-diagram'
  | 'missing-nodes'
  | 'same-element'
  | 'duplicate'

export interface CreateRelationshipSuccess {
  ok: true
  nextModel: ParsedModel
  createdRelationship: CreatedRelationship
  targetNode: DiagramNode
  relationshipId: string
}

export interface CreateRelationshipFailureResult {
  ok: false
  reason: CreateRelationshipFailure
}

export type CreateRelationshipResult = CreateRelationshipSuccess | CreateRelationshipFailureResult

export function computeCreateRelationshipBetweenNodes(
  model: ParsedModel,
  selectedDiagramId: string,
  relationshipType: string,
  sourceNodeId: string,
  targetNodeId: string,
): CreateRelationshipResult {
  if (!relationshipType || !sourceNodeId || !targetNodeId) {
    return { ok: false, reason: 'invalid-input' }
  }
  if (sourceNodeId === targetNodeId) {
    return { ok: false, reason: 'same-node' }
  }

  const diagram = model.diagrams.find((d) => d.id === selectedDiagramId)
  if (!diagram) {
    return { ok: false, reason: 'missing-diagram' }
  }

  const sourceNode = findNodeById(diagram.nodes, sourceNodeId)
  const targetNode = findNodeById(diagram.nodes, targetNodeId)
  if (!sourceNode?.elementRef || !targetNode?.elementRef) {
    return { ok: false, reason: 'missing-nodes' }
  }

  if (sourceNode.elementRef === targetNode.elementRef) {
    return { ok: false, reason: 'same-element' }
  }

  const dup = diagram.connections.some(
    (c) =>
      (c.source === sourceNodeId && c.target === targetNodeId) ||
      (c.source === targetNodeId && c.target === sourceNodeId),
  )
  if (dup) {
    return { ok: false, reason: 'duplicate' }
  }

  const relId = generateArchimateModelId()
  const connId = generateArchimateModelId()
  const newRel: ParsedRelationship = {
    id: relId,
    name: '',
    type: relationshipType,
    source: sourceNode.elementRef,
    target: targetNode.elementRef,
  }
  const newConn = {
    id: connId,
    relationshipRef: relId,
    source: sourceNodeId,
    target: targetNodeId,
    bendpoints: [] as Bendpoint[],
  }

  const nextRelationshipById = new Map(model.relationshipById)
  nextRelationshipById.set(relId, newRel)

  const nextDiagrams = model.diagrams.map((d) => {
    if (d.id !== selectedDiagramId) {
      return d
    }
    return {
      ...d,
      connections: [...d.connections, newConn],
    }
  })

  return {
    ok: true,
    nextModel: {
      ...model,
      relationships: [...model.relationships, newRel],
      relationshipById: nextRelationshipById,
      diagrams: nextDiagrams,
    },
    createdRelationship: {
      diagramId: selectedDiagramId,
      relationship: newRel,
      connection: newConn,
      format: model.format,
    },
    targetNode,
    relationshipId: relId,
  }
}

export type ReassignEndpointFailure =
  | 'missing-data'
  | 'invalid-node'
  | 'same-node'
  | 'same-element'
  | 'duplicate'

export interface ReassignEndpointSuccess {
  ok: true
  nextModel: ParsedModel
  nextRelOverrides: RelationshipOverridesMap
  nextCreatedRelationships: CreatedRelationship[]
}

export interface ReassignEndpointFailureResult {
  ok: false
  reason: ReassignEndpointFailure
}

export type ReassignEndpointResult = ReassignEndpointSuccess | ReassignEndpointFailureResult

export function computeReassignRelationshipEndpoint(
  model: ParsedModel,
  selectedDiagramId: string,
  relationshipRef: string,
  endpoint: ConnectionEndpointKind,
  newNodeId: string,
  relationshipOverrides: RelationshipOverridesMap,
  createdRelationships: CreatedRelationship[],
): ReassignEndpointResult {
  const relationship = model.relationshipById.get(relationshipRef)
  const diagram = model.diagrams.find((d) => d.id === selectedDiagramId)
  const connection = diagram?.connections.find((c) => c.relationshipRef === relationshipRef)
  if (!relationship || !diagram || !connection) {
    return { ok: false, reason: 'missing-data' }
  }

  const newNode = findNodeById(diagram.nodes, newNodeId)
  if (!newNode?.elementRef || isDiagramReferenceNode(newNode)) {
    return { ok: false, reason: 'invalid-node' }
  }

  const otherNodeId = endpoint === 'source' ? connection.target : connection.source
  const otherNode = findNodeById(diagram.nodes, otherNodeId)
  if (!otherNode?.elementRef) {
    return { ok: false, reason: 'invalid-node' }
  }
  if (newNodeId === otherNodeId) {
    return { ok: false, reason: 'same-node' }
  }
  if (newNode.elementRef === otherNode.elementRef) {
    return { ok: false, reason: 'same-element' }
  }

  const nextSourceNodeId = endpoint === 'source' ? newNodeId : connection.source
  const nextTargetNodeId = endpoint === 'target' ? newNodeId : connection.target
  const duplicate = diagram.connections.some(
    (c) =>
      c.id !== connection.id &&
      ((c.source === nextSourceNodeId && c.target === nextTargetNodeId) ||
        (c.source === nextTargetNodeId && c.target === nextSourceNodeId)),
  )
  if (duplicate) {
    return { ok: false, reason: 'duplicate' }
  }

  const nextSourceElement = endpoint === 'source' ? newNode.elementRef : relationship.source
  const nextTargetElement = endpoint === 'target' ? newNode.elementRef : relationship.target
  const updatedRelationship: ParsedRelationship = {
    ...relationship,
    source: nextSourceElement,
    target: nextTargetElement,
  }

  const nextRelationshipById = new Map(model.relationshipById)
  nextRelationshipById.set(relationshipRef, updatedRelationship)
  const nextRelationships = model.relationships.map((item) =>
    item.id === relationshipRef ? updatedRelationship : item,
  )

  const nextDiagrams = model.diagrams.map((d) => ({
    ...d,
    connections: d.connections.map((c) => {
      if (c.relationshipRef !== relationshipRef) {
        return c
      }
      if (d.id === selectedDiagramId) {
        return {
          ...c,
          source: nextSourceNodeId,
          target: nextTargetNodeId,
          bendpoints: [],
        }
      }
      const srcNode = findNodeByElementRefInDiagram(d, nextSourceElement)
      const tgtNode = findNodeByElementRefInDiagram(d, nextTargetElement)
      if (srcNode && tgtNode) {
        return {
          ...c,
          source: srcNode.id,
          target: tgtNode.id,
          bendpoints: [],
        }
      }
      return c
    }),
  }))

  const nextRelOverrides = new Map(relationshipOverrides)
  nextRelOverrides.forEach((relMap, diagramId) => {
    if (relMap.has(relationshipRef)) {
      const nextMap = new Map(relMap)
      nextMap.delete(relationshipRef)
      nextRelOverrides.set(diagramId, nextMap)
    }
  })

  const nextCreatedRelationships = createdRelationships.map((cr) => {
    if (cr.relationship.id !== relationshipRef) {
      return cr
    }
    const diagramConn = nextDiagrams
      .find((d) => d.id === cr.diagramId)
      ?.connections.find((c) => c.relationshipRef === relationshipRef)
    return {
      ...cr,
      relationship: updatedRelationship,
      connection: diagramConn ?? cr.connection,
    }
  })

  return {
    ok: true,
    nextModel: {
      ...model,
      diagrams: nextDiagrams,
      relationships: nextRelationships,
      relationshipById: nextRelationshipById,
    },
    nextRelOverrides: cloneBendpointMap(nextRelOverrides),
    nextCreatedRelationships,
  }
}
