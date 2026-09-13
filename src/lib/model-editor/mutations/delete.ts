import {
  collectSubtreeIds,
  removeNodeFromTree,
  collectNodeIdsRemovedForElement,
  removeDiagramObjectsByElementRef,
  filterConnectionsToExistingRelationships,
} from '../../archimate/diagram-model'
import type {
  ParsedDiagram,
  DiagramNode,
  NodeOverride,
  ConnectionOverride,
  ElementOverride,
  RelationshipMetaOverride,
  CreatedObject,
  CreatedRelationship,
  ParsedModel,
  DiagramOverridesMap,
  RelationshipOverridesMap,
} from '../../../types/model'
import { cloneBendpointMap, cloneNodeOverrideMap } from './layout'

export interface DeleteSelectedFromDiagramInput {
  model: ParsedModel
  selectedDiagramId: string
  root: DiagramNode
  diagramOverrides: DiagramOverridesMap
  relationshipOverrides: RelationshipOverridesMap
  createdObjects: CreatedObject[]
  createdRelationships: CreatedRelationship[]
  deletedDiagramNodeIds: Set<string>
  deletedConnectionIds: Set<string>
  originalDiagramNodeIds: Set<string>
  originalConnectionIds: Set<string>
}

export interface DeleteSelectedFromDiagramResult {
  nextDiagrams: ParsedDiagram[]
  nextDiagramOverrides: DiagramOverridesMap
  nextRelOverrides: RelationshipOverridesMap
  nextCreatedObjects: CreatedObject[]
  nextCreatedRelationships: CreatedRelationship[]
  nextDeletedDiagramNodeIds: Set<string>
  nextDeletedConnectionIds: Set<string>
}

export function computeDeleteSelectedFromDiagram(
  input: DeleteSelectedFromDiagramInput,
): DeleteSelectedFromDiagramResult {
  const {
    model,
    selectedDiagramId,
    root,
    diagramOverrides,
    relationshipOverrides,
    createdObjects,
    createdRelationships,
    deletedDiagramNodeIds,
    deletedConnectionIds,
    originalDiagramNodeIds,
    originalConnectionIds,
  } = input

  const subtreeIds = new Set(collectSubtreeIds(root))
  const diagramBefore = model.diagrams.find((d) => d.id === selectedDiagramId)

  const nextDiagrams = model.diagrams.map((d) => {
    if (d.id !== selectedDiagramId) {
      return d
    }
    return {
      ...d,
      nodes: removeNodeFromTree(d.nodes, root.id),
      connections: d.connections.filter(
        (c) => !subtreeIds.has(c.source) && !subtreeIds.has(c.target),
      ),
    }
  })

  const nextDiagramOverrides = new Map(diagramOverrides)
  const diagramOv = diagramOverrides.get(selectedDiagramId)
  if (diagramOv?.size) {
    const nextOv = new Map(diagramOv)
    subtreeIds.forEach((id) => nextOv.delete(id))
    nextDiagramOverrides.set(selectedDiagramId, nextOv)
  }

  const currentDiagram = nextDiagrams.find((d) => d.id === selectedDiagramId)!
  const validRefs = new Set(currentDiagram.connections.map((c) => c.relationshipRef))
  const nextRelOverrides = new Map(relationshipOverrides)
  const relMap = relationshipOverrides.get(selectedDiagramId)
  if (relMap?.size) {
    const nextMap = new Map<string, ConnectionOverride>()
    relMap.forEach((ov, ref) => {
      if (validRefs.has(ref)) {
        nextMap.set(ref, ov)
      }
    })
    nextRelOverrides.set(selectedDiagramId, nextMap)
  }

  const removedConnIds: string[] = []
  diagramBefore?.connections.forEach((connection) => {
    if (subtreeIds.has(connection.source) || subtreeIds.has(connection.target)) {
      removedConnIds.push(connection.id)
    }
  })

  const nextDeletedDiagramNodeIds = new Set(deletedDiagramNodeIds)
  subtreeIds.forEach((id) => {
    if (originalDiagramNodeIds.has(id)) {
      nextDeletedDiagramNodeIds.add(id)
    }
  })

  const nextDeletedConnectionIds = new Set(deletedConnectionIds)
  removedConnIds.forEach((id) => {
    if (originalConnectionIds.has(id)) {
      nextDeletedConnectionIds.add(id)
    }
  })

  const nextCreatedObjects = createdObjects.filter((item) => !subtreeIds.has(item.node.id))
  const nextCreatedRelationships = createdRelationships.filter(
    (cr) =>
      cr.diagramId !== selectedDiagramId ||
      (!subtreeIds.has(cr.connection.source) && !subtreeIds.has(cr.connection.target)),
  )

  return {
    nextDiagrams,
    nextDiagramOverrides: cloneNodeOverrideMap(nextDiagramOverrides),
    nextRelOverrides: cloneBendpointMap(nextRelOverrides),
    nextCreatedObjects,
    nextCreatedRelationships,
    nextDeletedDiagramNodeIds,
    nextDeletedConnectionIds,
  }
}

export type DeleteConnectionFailure = 'missing-diagram' | 'no-visualization'

export interface DeleteSelectedConnectionResult {
  ok: true
  nextDiagrams: ParsedDiagram[]
  nextRelOverrides: RelationshipOverridesMap
  nextCreatedRelationships: CreatedRelationship[]
  nextDeletedConnectionIds: Set<string>
}

export function computeDeleteSelectedConnectionFromDiagram(
  model: ParsedModel,
  selectedDiagramId: string,
  relationshipRef: string,
  relationshipOverrides: RelationshipOverridesMap,
  createdRelationships: CreatedRelationship[],
  deletedConnectionIds: Set<string>,
  originalConnectionIds: Set<string>,
): DeleteSelectedConnectionResult | { ok: false; reason: DeleteConnectionFailure } {
  const diagram = model.diagrams.find((d) => d.id === selectedDiagramId)
  if (!diagram) {
    return { ok: false, reason: 'missing-diagram' }
  }
  const toRemove = diagram.connections.filter((c) => c.relationshipRef === relationshipRef)
  if (!toRemove.length) {
    return { ok: false, reason: 'no-visualization' }
  }

  const removedConnIds = toRemove.map((c) => c.id)

  const nextDiagrams = model.diagrams.map((d) => {
    if (d.id !== selectedDiagramId) {
      return d
    }
    return {
      ...d,
      connections: d.connections.filter((c) => c.relationshipRef !== relationshipRef),
    }
  })

  const relMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
  relMap.delete(relationshipRef)
  const nextRelOverrides = new Map(relationshipOverrides)
  nextRelOverrides.set(selectedDiagramId, relMap)

  const nextDeletedConnectionIds = new Set(deletedConnectionIds)
  removedConnIds.forEach((id) => {
    if (originalConnectionIds.has(id)) {
      nextDeletedConnectionIds.add(id)
    }
  })

  const nextCreatedRelationships = createdRelationships.filter(
    (cr) => !removedConnIds.includes(cr.connection.id),
  )

  return {
    ok: true,
    nextDiagrams,
    nextRelOverrides: cloneBendpointMap(nextRelOverrides),
    nextCreatedRelationships,
    nextDeletedConnectionIds,
  }
}

export interface DeleteRelationshipFromModelResult {
  nextModel: ParsedModel
  nextRelOverrides: RelationshipOverridesMap
  removedConnIds: string[]
  relationshipRef: string
}

export function computeDeleteRelationshipFromModel(
  model: ParsedModel,
  relationshipRef: string,
  relationshipOverrides: RelationshipOverridesMap,
): DeleteRelationshipFromModelResult | null {
  if (!model.relationshipById.has(relationshipRef)) {
    return null
  }

  const removedConnIds: string[] = []
  model.diagrams.forEach((d) => {
    d.connections.forEach((c) => {
      if (c.relationshipRef === relationshipRef) {
        removedConnIds.push(c.id)
      }
    })
  })

  const nextRelationships = model.relationships.filter((r) => r.id !== relationshipRef)
  const nextRelationshipById = new Map(model.relationshipById)
  nextRelationshipById.delete(relationshipRef)

  const nextDiagrams = model.diagrams.map((d) => ({
    ...d,
    connections: filterConnectionsToExistingRelationships(d.connections, nextRelationshipById),
  }))

  const nextDiagramIndexByRelationshipRef = new Map(model.diagramIndexByRelationshipRef ?? [])
  nextDiagramIndexByRelationshipRef.delete(relationshipRef)

  const nextRelOverrides = new Map<string, Map<string, ConnectionOverride>>()
  relationshipOverrides.forEach((relMap, diagramId) => {
    const m = new Map(relMap)
    m.delete(relationshipRef)
    nextRelOverrides.set(diagramId, m)
  })

  return {
    nextModel: {
      ...model,
      diagrams: nextDiagrams,
      relationships: nextRelationships,
      relationshipById: nextRelationshipById,
      diagramIndexByRelationshipRef: nextDiagramIndexByRelationshipRef,
    },
    nextRelOverrides,
    removedConnIds,
    relationshipRef,
  }
}

export interface DeleteElementFromModelResult {
  nextModel: ParsedModel
  nextDiagramOverrides: DiagramOverridesMap
  nextRelOverrides: RelationshipOverridesMap
  nextElemOverrides: Map<string, ElementOverride>
  nextRelMetaOverrides: Map<string, RelationshipMetaOverride>
  removedNodeIds: Set<string>
  removedRelIds: Set<string>
  removedConnIds: string[]
  elementId: string
  relsToRemoveIds: string[]
}

export function computeDeleteElementFromModel(
  model: ParsedModel,
  elementId: string,
  diagramOverrides: DiagramOverridesMap,
  relationshipOverrides: RelationshipOverridesMap,
  elementOverrides: Map<string, ElementOverride>,
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>,
): DeleteElementFromModelResult | null {
  if (!elementId || !model.elementById.has(elementId)) {
    return null
  }

  const removedNodeIds = new Set<string>()
  model.diagrams.forEach((d) => {
    collectNodeIdsRemovedForElement(d.nodes, elementId).forEach((id) => removedNodeIds.add(id))
  })

  const relsToRemove = model.relationships.filter(
    (r) => r.source === elementId || r.target === elementId,
  )
  const removedRelIds = new Set(relsToRemove.map((r) => r.id))

  const removedConnIds: string[] = []
  model.diagrams.forEach((d) => {
    d.connections.forEach((c) => {
      if (
        removedRelIds.has(c.relationshipRef) ||
        removedNodeIds.has(c.source) ||
        removedNodeIds.has(c.target)
      ) {
        removedConnIds.push(c.id)
      }
    })
  })

  const nextDiagrams = model.diagrams.map((d) => ({
    ...d,
    nodes: removeDiagramObjectsByElementRef(d.nodes, elementId),
    connections: d.connections.filter(
      (c) =>
        !removedRelIds.has(c.relationshipRef) &&
        !removedNodeIds.has(c.source) &&
        !removedNodeIds.has(c.target),
    ),
  }))

  const nextElements = model.elements.filter((e) => e.id !== elementId)
  const nextElementById = new Map(model.elementById)
  nextElementById.delete(elementId)

  const nextRelationships = model.relationships.filter((r) => !removedRelIds.has(r.id))
  const nextRelationshipById = new Map(model.relationshipById)
  removedRelIds.forEach((id) => nextRelationshipById.delete(id))

  const nextDiagramOverrides = new Map<string, Map<string, NodeOverride>>()
  diagramOverrides.forEach((ovMap, diagramId) => {
    const m = new Map(ovMap)
    removedNodeIds.forEach((nid) => m.delete(nid))
    nextDiagramOverrides.set(diagramId, m)
  })

  const nextRelOverrides = new Map<string, Map<string, ConnectionOverride>>()
  relationshipOverrides.forEach((relMap, diagramId) => {
    const m = new Map(relMap)
    removedRelIds.forEach((rid) => m.delete(rid))
    nextRelOverrides.set(diagramId, m)
  })

  const nextElemOverrides = new Map(elementOverrides)
  nextElemOverrides.delete(elementId)

  const nextRelMetaOverrides = new Map(relationshipMetaOverrides)
  removedRelIds.forEach((id) => nextRelMetaOverrides.delete(id))

  return {
    nextModel: {
      ...model,
      diagrams: nextDiagrams,
      elements: nextElements,
      elementById: nextElementById,
      relationships: nextRelationships,
      relationshipById: nextRelationshipById,
    },
    nextDiagramOverrides,
    nextRelOverrides,
    nextElemOverrides,
    nextRelMetaOverrides,
    removedNodeIds,
    removedRelIds,
    removedConnIds,
    elementId,
    relsToRemoveIds: relsToRemove.map((r) => r.id),
  }
}
