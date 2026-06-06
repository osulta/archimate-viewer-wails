import { findNodeById } from '../../lib/archimate/diagram-model'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  ParsedModel,
  DiagramNode,
  DiagramConnection,
  NodeOverride,
  Bendpoint,
  ElementOverride,
  RelationshipMetaOverride,
  CreatedObject,
  CreatedRelationship,
} from '../../types/model'

export interface CanvasEditSnapshot {
  model: ParsedModel
  diagramOverrides: Map<string, Map<string, NodeOverride>>
  relationshipOverrides: Map<string, Map<string, Bendpoint[]>>
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  createdObjects: CreatedObject[]
  createdRelationships: CreatedRelationship[]
  deletedDiagramNodeIds: Set<string>
  deletedElementIds: Set<string>
  deletedRelationshipIds: Set<string>
  deletedConnectionIds: Set<string>
  deletedSplitModelFiles: Set<string>
  dirtySplitDiagramIds: Set<string>
  dirtySplitRelationshipIds: Set<string>
  linkCreateSourceId: string | null
  selectedDiagramId: string
  selectedNodeId: string | null
  selectedElementId: string | null
  selectedRelationshipRef: string | null
  selectedBendpointIndex: number | null
}

function cloneDiagramNodes(nodes: DiagramNode[]): DiagramNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneDiagramNodes(node.children ?? []),
  }))
}

function cloneConnections(connections: DiagramConnection[]): DiagramConnection[] {
  return connections.map((connection) => ({
    ...connection,
    bendpoints: connection.bendpoints?.map((bendpoint) => ({ ...bendpoint })),
  }))
}

export function cloneModelSnapshot(model: ParsedModel): ParsedModel {
  return {
    ...model,
    elements: model.elements.map((element) => ({
      ...element,
      properties: element.properties ? [...element.properties] : element.properties,
    })),
    elementById: new Map(model.elementById),
    relationships: model.relationships.map((relationship) => ({
      ...relationship,
      properties: relationship.properties ? [...relationship.properties] : relationship.properties,
    })),
    relationshipById: new Map(model.relationshipById),
    diagrams: model.diagrams.map((diagram) => ({
      ...diagram,
      nodes: cloneDiagramNodes(diagram.nodes),
      connections: cloneConnections(diagram.connections),
    })),
  }
}

function cloneNodeOverrideMap(source: Map<string, Map<string, NodeOverride>>) {
  return new Map(Array.from(source.entries(), ([diagramId, nodeMap]) => [diagramId, new Map(nodeMap)]))
}

function cloneBendpointMap(source: Map<string, Map<string, Bendpoint[]>>) {
  return new Map(
    Array.from(source.entries(), ([diagramId, relMap]) => [
      diagramId,
      new Map(Array.from(relMap.entries(), ([ref, points]) => [ref, [...points]])),
    ]),
  )
}

export function cloneCreatedObjects(objects: CreatedObject[]): CreatedObject[] {
  return objects.map((item) => ({
    ...item,
    element: { ...item.element, properties: item.element.properties ? [...item.element.properties] : item.element.properties },
    node: cloneDiagramNodes([item.node])[0],
  }))
}

export function cloneCreatedRelationships(items: CreatedRelationship[]): CreatedRelationship[] {
  return items.map((item) => ({
    ...item,
    relationship: {
      ...item.relationship,
      properties: item.relationship.properties ? [...item.relationship.properties] : item.relationship.properties,
    },
    connection: {
      ...item.connection,
      bendpoints: item.connection.bendpoints?.map((bendpoint) => ({ ...bendpoint })),
    },
  }))
}

export function cloneCanvasEditSnapshot(snapshot: CanvasEditSnapshot): CanvasEditSnapshot {
  return {
    model: cloneModelSnapshot(snapshot.model),
    diagramOverrides: cloneNodeOverrideMap(snapshot.diagramOverrides),
    relationshipOverrides: cloneBendpointMap(snapshot.relationshipOverrides),
    elementOverrides: new Map(snapshot.elementOverrides),
    relationshipMetaOverrides: new Map(snapshot.relationshipMetaOverrides),
    createdObjects: cloneCreatedObjects(snapshot.createdObjects),
    createdRelationships: cloneCreatedRelationships(snapshot.createdRelationships),
    deletedDiagramNodeIds: new Set(snapshot.deletedDiagramNodeIds),
    deletedElementIds: new Set(snapshot.deletedElementIds),
    deletedRelationshipIds: new Set(snapshot.deletedRelationshipIds),
    deletedConnectionIds: new Set(snapshot.deletedConnectionIds),
    deletedSplitModelFiles: new Set(snapshot.deletedSplitModelFiles),
    dirtySplitDiagramIds: new Set(snapshot.dirtySplitDiagramIds),
    dirtySplitRelationshipIds: new Set(snapshot.dirtySplitRelationshipIds),
    linkCreateSourceId: snapshot.linkCreateSourceId,
    selectedDiagramId: snapshot.selectedDiagramId,
    selectedNodeId: snapshot.selectedNodeId,
    selectedElementId: snapshot.selectedElementId,
    selectedRelationshipRef: snapshot.selectedRelationshipRef,
    selectedBendpointIndex: snapshot.selectedBendpointIndex,
  }
}

export interface CaptureCanvasEditSnapshotParams {
  model: ParsedModel | null
  selectedDiagramId: string
  diagramOverrides: Map<string, Map<string, NodeOverride>>
  relationshipOverrides: Map<string, Map<string, Bendpoint[]>>
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  createdObjects: CreatedObject[]
  createdRelationships: CreatedRelationship[]
  deletedDiagramNodeIds: Set<string>
  deletedElementIds: Set<string>
  deletedRelationshipIds: Set<string>
  deletedConnectionIds: Set<string>
  deletedSplitModelFiles: Set<string>
  dirtySplitDiagramIds: Set<string>
  dirtySplitRelationshipIds: Set<string>
  linkCreateSourceId: string | null
  selectedNodeId: string | null
  selectedElementId: string | null
  selectedRelationshipRef: string | null
  selectedBendpointIndex: number | null
}

export function captureCanvasEditSnapshot(
  params: CaptureCanvasEditSnapshotParams,
): CanvasEditSnapshot | null {
  if (!params.model || !params.selectedDiagramId) {
    return null
  }
  return {
    model: cloneModelSnapshot(params.model),
    diagramOverrides: cloneNodeOverrideMap(params.diagramOverrides),
    relationshipOverrides: cloneBendpointMap(params.relationshipOverrides),
    elementOverrides: new Map(params.elementOverrides),
    relationshipMetaOverrides: new Map(params.relationshipMetaOverrides),
    createdObjects: cloneCreatedObjects(params.createdObjects),
    createdRelationships: cloneCreatedRelationships(params.createdRelationships),
    deletedDiagramNodeIds: new Set(params.deletedDiagramNodeIds),
    deletedElementIds: new Set(params.deletedElementIds),
    deletedRelationshipIds: new Set(params.deletedRelationshipIds),
    deletedConnectionIds: new Set(params.deletedConnectionIds),
    deletedSplitModelFiles: new Set(params.deletedSplitModelFiles),
    dirtySplitDiagramIds: new Set(params.dirtySplitDiagramIds),
    linkCreateSourceId: params.linkCreateSourceId,
    selectedDiagramId: params.selectedDiagramId,
    selectedNodeId: params.selectedNodeId,
    selectedElementId: params.selectedElementId,
    selectedRelationshipRef: params.selectedRelationshipRef,
    selectedBendpointIndex: params.selectedBendpointIndex,
  }
}

export interface RestoreCanvasEditSnapshotHandlers {
  setModel: Dispatch<SetStateAction<ParsedModel | null>>
  commitDiagramOverrides: (
    updater:
      | Map<string, Map<string, NodeOverride>>
      | ((prev: Map<string, Map<string, NodeOverride>>) => Map<string, Map<string, NodeOverride>>),
  ) => void
  commitRelationshipOverrides: (
    updater:
      | Map<string, Map<string, Bendpoint[]>>
      | ((prev: Map<string, Map<string, Bendpoint[]>>) => Map<string, Map<string, Bendpoint[]>>),
  ) => void
  commitElementOverrides: (
    updater:
      | Map<string, ElementOverride>
      | ((prev: Map<string, ElementOverride>) => Map<string, ElementOverride>),
  ) => void
  commitRelationshipMetaOverrides: (
    updater:
      | Map<string, RelationshipMetaOverride>
      | ((prev: Map<string, RelationshipMetaOverride>) => Map<string, RelationshipMetaOverride>),
  ) => void
  setCreatedObjects: Dispatch<SetStateAction<CreatedObject[]>>
  setCreatedRelationships: Dispatch<SetStateAction<CreatedRelationship[]>>
  setDeletedDiagramNodeIds: Dispatch<SetStateAction<Set<string>>>
  setDeletedElementIds: Dispatch<SetStateAction<Set<string>>>
  setDeletedRelationshipIds: Dispatch<SetStateAction<Set<string>>>
  setDeletedConnectionIds: Dispatch<SetStateAction<Set<string>>>
  deletedSplitModelFilesRef: MutableRefObject<Set<string>>
  dirtySplitDiagramIdsRef: MutableRefObject<Set<string>>
  dirtySplitRelationshipIdsRef: MutableRefObject<Set<string>>
  setLinkCreateSourceId: Dispatch<SetStateAction<string | null>>
  setSelectedNode: Dispatch<SetStateAction<DiagramNode | null>>
  setSelectedElementId: Dispatch<SetStateAction<string | null>>
  setSelectedRelationshipRef: Dispatch<SetStateAction<string | null>>
  setSelectedBendpointIndex: Dispatch<SetStateAction<number | null>>
}

export function restoreCanvasEditSnapshot(
  snapshot: CanvasEditSnapshot,
  handlers: RestoreCanvasEditSnapshotHandlers,
): void {
  const cloned = cloneCanvasEditSnapshot(snapshot)
  handlers.setModel(cloned.model)
  handlers.commitDiagramOverrides(cloneNodeOverrideMap(cloned.diagramOverrides))
  handlers.commitRelationshipOverrides(cloneBendpointMap(cloned.relationshipOverrides))
  handlers.commitElementOverrides(new Map(cloned.elementOverrides))
  handlers.commitRelationshipMetaOverrides(new Map(cloned.relationshipMetaOverrides))
  handlers.setCreatedObjects(cloneCreatedObjects(cloned.createdObjects))
  handlers.setCreatedRelationships(cloneCreatedRelationships(cloned.createdRelationships))
  handlers.setDeletedDiagramNodeIds(new Set(cloned.deletedDiagramNodeIds))
  handlers.setDeletedElementIds(new Set(cloned.deletedElementIds))
  handlers.setDeletedRelationshipIds(new Set(cloned.deletedRelationshipIds))
  handlers.setDeletedConnectionIds(new Set(cloned.deletedConnectionIds))
  handlers.deletedSplitModelFilesRef.current = new Set(cloned.deletedSplitModelFiles)
  handlers.dirtySplitDiagramIdsRef.current = new Set(cloned.dirtySplitDiagramIds)
  handlers.dirtySplitRelationshipIdsRef.current = new Set(cloned.dirtySplitRelationshipIds)
  handlers.setLinkCreateSourceId(cloned.linkCreateSourceId)

  const diagram = cloned.model.diagrams.find((item) => item.id === cloned.selectedDiagramId)
  const selectedNode =
    cloned.selectedNodeId && diagram
      ? findNodeById(diagram.nodes, cloned.selectedNodeId)
      : null
  handlers.setSelectedNode(selectedNode)
  handlers.setSelectedElementId(cloned.selectedElementId)
  handlers.setSelectedRelationshipRef(cloned.selectedRelationshipRef)
  handlers.setSelectedBendpointIndex(cloned.selectedBendpointIndex)
}
