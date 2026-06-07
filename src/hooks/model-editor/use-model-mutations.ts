import { useCallback } from 'react'
import { adjustBendpointsForNodeResize } from '../../lib/archimate/connection-geometry'
import { generateArchimateModelId } from '../../lib/archimate/model-id'
import {
  flattenNodes,
  applyOverridesToNodes,
  findInnermostContainingNode,
  findInnermostContainingNodeExcluding,
  findDirectParentNodeId,
  reparentNodeInTree,
  insertNodeUnderParent,
  findNodeById,
  findNodeByElementRefInDiagram,
  collectSubtreeIds,
  removeNodeFromTree,
  removeDiagramObjectsByElementRef,
  collectNodeIdsRemovedForElement,
  filterConnectionsToExistingRelationships,
  roundDiagramCoord,
  snapToGrid,
  isDiagramReferenceNode,
} from '../../lib/archimate/diagram-model'
import { isSplitFilesModel } from '../../lib/model-editor/is-split-files-model'
import {
  resolveSplitElementFilePath,
  resolveSplitRelationshipFilePath,
} from '../../lib/archimate/split-model-save'
import { createSnapshotCommand, useCommandHistory } from '../../lib/commands'
import type { ConnectionEndpointKind } from '../../lib/diagram-canvas/types'
import {
  captureCanvasEditSnapshot,
  cloneCanvasEditSnapshot,
  cloneCreatedObjects,
  cloneCreatedRelationships,
  cloneModelSnapshot,
  restoreCanvasEditSnapshot,
  type CanvasEditSnapshot,
} from './edit-snapshot'
import type {
  ParsedDiagram,
  ParsedElement,
  ParsedRelationship,
  DiagramNode,
  DiagramConnection,
  Bendpoint,
  NodeOverride,
  ElementOverride,
  RelationshipMetaOverride,
  Point,
  CreatedRelationship,
  ParsedModel,
} from '../../types/model'
import type { ModelEditState } from './use-model-edit-state'
import type { ModelSelectionState } from './use-model-selection'

export interface ModelMutations {
  moveNode: (diagramId: string, nodeId: string, dx: number, dy: number) => void
  resizeNode: (diagramId: string, nodeId: string, dw: number, dh: number) => void
  updateNodeFillColor: (diagramId: string, nodeId: string, fillColor: string | null) => void
  updateDiagramMetadata: (diagramId: string, patch: Partial<ParsedDiagram>) => void
  updateRelationshipMetaOverride: (relationshipId: string, patch: Partial<RelationshipMetaOverride>) => void
  updateElementOverride: (elementId: string, patch: Partial<ElementOverride>) => void
  createNewObject: (elementType: string, atPoint: Point | null, nameOverride?: string) => void
  placeElementOnDiagram: (elementId: string, atPoint: Point) => void
  placeDiagramReferenceOnDiagram: (referencedDiagramId: string, atPoint: Point) => void
  createNewDiagram: (nameOverride?: string) => void
  createRelationshipBetweenNodes: (relationshipType: string, sourceNodeId: string, targetNodeId: string) => boolean
  handleDropNewRelationshipAtPoint: (relationshipType: string, x: number, y: number, targetNodeId: string | null) => void
  pickLinkNode: (node: DiagramNode) => void
  deleteSelectedFromDiagram: () => void
  deleteSelectedConnectionFromDiagram: () => void
  deleteRelationshipFromModel: () => void
  deleteElementFromModel: () => void
  removeRelationshipBendpoint: (relationshipRef: string, bendpointIndex: number) => void
  updateRelationshipBendpoint: (relationshipRef: string, bendpointIndex: number, bendpoint: Bendpoint) => void
  addRelationshipBendpoint: (relationshipRef: string, segmentIndex: number, bendpoint: Bendpoint) => void
  reassignRelationshipEndpoint: (
    relationshipRef: string,
    endpoint: ConnectionEndpointKind,
    nodeId: string,
  ) => void
  undoCanvasCommand: () => void
  redoCanvasCommand: () => void
  clearCanvasHistory: () => void
  canvasHistory: {
    canUndo: boolean
    canRedo: boolean
    undoLabel: string
    redoLabel: string
  }
}

interface UseModelMutationsOptions {
  editState: ModelEditState
  selection: ModelSelectionState
}

const AGGREGATION_RELATIONSHIP_TYPE = 'archimate:AggregationRelationship'

function cloneDiagramNodes(nodes: DiagramNode[]): DiagramNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneDiagramNodes(node.children ?? []),
  }))
}

interface NestAggregationUpdate {
  relationships: ParsedRelationship[]
  relationshipById: Map<string, ParsedRelationship>
  connections: DiagramConnection[]
  createdRelationship?: CreatedRelationship
}

function buildNestAggregationUpdate(
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

function applyNestAggregationToDiagrams(
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

export function useModelMutations({ editState, selection }: UseModelMutationsOptions): ModelMutations {
  const commandHistory = useCommandHistory()
  const {
    model, setModel,
    diagramOverrides, relationshipOverrides, elementOverrides, relationshipMetaOverrides,
    createdObjects, createdRelationships,
    setCreatedObjects, setCreatedRelationships, setCreatedDiagramIds,
    deletedDiagramNodeIds, deletedElementIds, deletedRelationshipIds, deletedConnectionIds,
    originalDiagramNodeIds, originalElementIds, originalRelationshipIds, originalConnectionIds,
    setDeletedDiagramNodeIds, setDeletedElementIds, setDeletedRelationshipIds, setDeletedConnectionIds,
    pendingLinkType, linkCreateSourceId, setLinkCreateSourceId, setPendingLinkType,
    commitDiagramOverrides, commitRelationshipOverrides, commitElementOverrides,
    commitRelationshipMetaOverrides, markSplitDiagramDirty, markSplitRelationshipDirty, clearLinkCreation,
    deletedSplitModelFilesRef, dirtySplitDiagramIdsRef, dirtySplitRelationshipIdsRef,
  } = editState

  function trackDeletedSplitModelFile(relativePath: string): void {
    const normalized = relativePath.replace(/^\/+/, '')
    if (!normalized) {
      return
    }
    deletedSplitModelFilesRef.current = new Set(deletedSplitModelFilesRef.current).add(normalized)
  }

  function markDiagramsUsingRelationship(relationshipRef: string): void {
    if (!model || !isSplitFilesModel(model)) {
      return
    }
    const diagramIds = new Set<string>()
    model.diagramIndexByRelationshipRef?.get(relationshipRef)?.forEach((diagramId) => {
      diagramIds.add(diagramId)
    })
    model.diagrams.forEach((diagram) => {
      if (diagram.connections.some((connection) => connection.relationshipRef === relationshipRef)) {
        diagramIds.add(diagram.id)
      }
    })
    diagramIds.forEach((diagramId) => markSplitDiagramDirty(diagramId))
  }

  const {
    selectedDiagramId, setSelectedDiagramId,
    setSelectedNode, setSelectedElementId,
    selectedElementId,
    selectedRelationshipRef, setSelectedRelationshipRef,
    setSelectedBendpointIndex, selectedBendpointIndex,
    selectedDiagram, selectedElement, selectedNodeLive,
  } = selection

  const cloneNodeOverrideMap = (source: Map<string, Map<string, NodeOverride>>) =>
    new Map(Array.from(source.entries(), ([diagramId, nodeMap]) => [diagramId, new Map(nodeMap)]))
  const cloneBendpointMap = (source: Map<string, Map<string, Bendpoint[]>>) =>
    new Map(
      Array.from(source.entries(), ([diagramId, relMap]) => [
        diagramId,
        new Map(Array.from(relMap.entries(), ([ref, points]) => [ref, [...points]])),
      ]),
    )

  function captureCurrentCanvasSnapshot(): CanvasEditSnapshot | null {
    return captureCanvasEditSnapshot({
      model,
      selectedDiagramId,
      diagramOverrides,
      relationshipOverrides,
      elementOverrides,
      relationshipMetaOverrides,
      createdObjects,
      createdRelationships,
      deletedDiagramNodeIds,
      deletedElementIds,
      deletedRelationshipIds,
      deletedConnectionIds,
      deletedSplitModelFiles: deletedSplitModelFilesRef.current,
      dirtySplitDiagramIds: dirtySplitDiagramIdsRef.current,
      dirtySplitRelationshipIds: dirtySplitRelationshipIdsRef.current,
      linkCreateSourceId,
      selectedNodeId: selectedNodeLive?.id ?? null,
      selectedElementId,
      selectedRelationshipRef,
      selectedBendpointIndex,
    })
  }

  function restoreCanvasSnapshot(snapshot: CanvasEditSnapshot) {
    restoreCanvasEditSnapshot(snapshot, {
      setModel,
      commitDiagramOverrides,
      commitRelationshipOverrides,
      commitElementOverrides,
      commitRelationshipMetaOverrides,
      setCreatedObjects,
      setCreatedRelationships,
      setDeletedDiagramNodeIds,
      setDeletedElementIds,
      setDeletedRelationshipIds,
      setDeletedConnectionIds,
      deletedSplitModelFilesRef,
      dirtySplitDiagramIdsRef,
      dirtySplitRelationshipIdsRef,
      setLinkCreateSourceId,
      setSelectedNode,
      setSelectedElementId,
      setSelectedRelationshipRef,
      setSelectedBendpointIndex,
    })
  }

  const pushSnapshotCommand = useCallback(
    (
      label: string,
      applyBefore: () => void,
      applyAfter: () => void,
    ) => {
      commandHistory.pushExecuted(
        createSnapshotCommand({
          label,
          applyBefore,
          applyAfter,
        }),
      )
    },
    [commandHistory],
  )

  const removeRelationshipBendpoint = useCallback(
    (relationshipRef: string, bendpointIndex: number) => {
      if (!selectedDiagramId || !selectedDiagram) {
        return
      }
      const currentConnection = selectedDiagram.connections.find(
        (c) => c.relationshipRef === relationshipRef,
      )
      if (!currentConnection) {
        return
      }
      const nextBendpoints = [...(currentConnection.bendpoints ?? [])]
      if (bendpointIndex < 0 || bendpointIndex >= nextBendpoints.length) {
        return
      }
      nextBendpoints.splice(bendpointIndex, 1)
      const beforeAll = cloneBendpointMap(relationshipOverrides)
      const diagramMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
      diagramMap.set(relationshipRef, nextBendpoints)
      const nextAll = new Map(relationshipOverrides)
      nextAll.set(selectedDiagramId, diagramMap)
      commitRelationshipOverrides(nextAll)
      setSelectedBendpointIndex(null)
      pushSnapshotCommand(
        'Удаление точки перегиба',
        () => {
          commitRelationshipOverrides(cloneBendpointMap(beforeAll))
          setSelectedBendpointIndex(bendpointIndex)
        },
        () => {
          commitRelationshipOverrides(cloneBendpointMap(nextAll))
          setSelectedBendpointIndex(null)
        },
      )
    },
    [
      selectedDiagramId,
      selectedDiagram,
      relationshipOverrides,
      commitRelationshipOverrides,
      pushSnapshotCommand,
    ],
  )

  function moveNode(diagramId: string, nodeId: string, dx: number, dy: number) {
    if (!diagramId || !nodeId || (dx === 0 && dy === 0) || !model) {
      return
    }
    const diagram = model.diagrams.find((item) => item.id === diagramId)
    if (!diagram) {
      return
    }

    const beforeAll = cloneNodeOverrideMap(diagramOverrides)
    const overrides = diagramOverrides.get(diagramId) ?? new Map()
    const prev = overrides.get(nodeId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
    const nextOverrides = new Map(overrides)
    nextOverrides.set(nodeId, {
      ...prev,
      dx: roundDiagramCoord((prev.dx ?? 0) + dx),
      dy: roundDiagramCoord((prev.dy ?? 0) + dy),
    })
    const nextAll = new Map(diagramOverrides)
    nextAll.set(diagramId, nextOverrides)

    const layoutNodes = applyOverridesToNodes(diagram.nodes, nextOverrides)
    const movedNode = findNodeById(layoutNodes, nodeId)

    let nextDiagramNodes = diagram.nodes
    let nextRelationships = model.relationships
    let nextRelationshipById = model.relationshipById
    let nextConnections = diagram.connections
    let createdRelationship: CreatedRelationship | undefined
    let nestingChanged = false

    const canReparentOnMove =
      movedNode && (Boolean(movedNode.elementRef) || isDiagramReferenceNode(movedNode))
    if (canReparentOnMove) {
      const excludeIds = new Set(collectSubtreeIds(movedNode))
      const containerNode = findInnermostContainingNodeExcluding(layoutNodes, movedNode, excludeIds)
      if (
        containerNode?.elementRef &&
        !isDiagramReferenceNode(containerNode) &&
        containerNode.id !== nodeId
      ) {
        const currentParentId = findDirectParentNodeId(diagram.nodes, nodeId)
        if (containerNode.id !== currentParentId) {
          nextDiagramNodes = reparentNodeInTree(diagram.nodes, nodeId, containerNode.id)
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
            nodeId,
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

    const beforeDiagramNodes = cloneDiagramNodes(diagram.nodes)
    const beforeConnections = [...diagram.connections]
    const beforeRelationships = model.relationships
    const beforeRelationshipById = new Map(model.relationshipById)

    commitDiagramOverrides(nextAll)
    if (nestingChanged) {
      setModel({
        ...model,
        relationships: nextRelationships,
        relationshipById: nextRelationshipById,
        diagrams: model.diagrams.map((item) =>
          item.id === diagramId
            ? { ...item, nodes: nextDiagramNodes, connections: nextConnections }
            : item,
        ),
      })
      if (createdRelationship) {
        setCreatedRelationships((prev) => [...prev, createdRelationship!])
      }
    }
    if (isSplitFilesModel(model)) {
      markSplitDiagramDirty(diagramId)
    }

    const afterDiagramNodes = nextDiagramNodes
    const afterConnections = nextConnections
    const afterRelationships = nextRelationships
    const afterRelationshipById = nextRelationshipById

    pushSnapshotCommand(
      'Перемещение объекта',
      () => {
        commitDiagramOverrides(cloneNodeOverrideMap(beforeAll))
        if (nestingChanged) {
          setModel({
            ...model,
            relationships: beforeRelationships,
            relationshipById: beforeRelationshipById,
            diagrams: model.diagrams.map((item) =>
              item.id === diagramId
                ? { ...item, nodes: beforeDiagramNodes, connections: beforeConnections }
                : item,
            ),
          })
        }
      },
      () => {
        commitDiagramOverrides(cloneNodeOverrideMap(nextAll))
        if (nestingChanged) {
          setModel({
            ...model,
            relationships: afterRelationships,
            relationshipById: afterRelationshipById,
            diagrams: model.diagrams.map((item) =>
              item.id === diagramId
                ? { ...item, nodes: afterDiagramNodes, connections: afterConnections }
                : item,
            ),
          })
        }
      },
    )
  }

  function resizeNode(diagramId: string, nodeId: string, dw: number, dh: number) {
    if (!selectedDiagram || !nodeId || (dw === 0 && dh === 0)) {
      return
    }
    const node = findNodeById(selectedDiagram.nodes, nodeId)
    if (!node) {
      return
    }

    const nextWidth = Math.max(30, node.width + dw)
    const nextHeight = Math.max(24, node.height + dh)
    const appliedDw = nextWidth - node.width
    const appliedDh = nextHeight - node.height
    if (appliedDw === 0 && appliedDh === 0) {
      return
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
    selectedDiagram.connections.forEach((connection) => {
      if (connection.source !== nodeId && connection.target !== nodeId) {
        return
      }
      if (!connection.bendpoints?.length) {
        return
      }
      const current = relMap.get(connection.relationshipRef) ?? connection.bendpoints
      const next = adjustBendpointsForNodeResize(
        current,
        connection,
        nodeId,
        appliedDw,
        appliedDh,
      )
      relMap.set(connection.relationshipRef, next)
      relChanged = true
    })
    const nextRelOverrides = new Map(relationshipOverrides)
    if (relChanged) {
      nextRelOverrides.set(diagramId, relMap)
    }

    commitDiagramOverrides(nextDiagramOverrides)
    if (relChanged) {
      commitRelationshipOverrides(nextRelOverrides)
    }
    if (isSplitFilesModel(model)) {
      markSplitDiagramDirty(diagramId)
    }
    pushSnapshotCommand(
      'Изменение размера объекта',
      () => {
        commitDiagramOverrides(cloneNodeOverrideMap(beforeDiagramOverrides))
        commitRelationshipOverrides(cloneBendpointMap(beforeRelOverrides))
      },
      () => {
        commitDiagramOverrides(cloneNodeOverrideMap(nextDiagramOverrides))
        commitRelationshipOverrides(cloneBendpointMap(nextRelOverrides))
      },
    )
  }

  const updateNodeFillColor = useCallback(
    (diagramId: string, nodeId: string, fillColor: string | null) => {
      if (!diagramId || !nodeId) {
        return
      }
      const beforeAll = cloneNodeOverrideMap(diagramOverrides)
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
      const nextAll = new Map(diagramOverrides)
      nextAll.set(diagramId, nextOverrides)
      commitDiagramOverrides(nextAll)
      if (isSplitFilesModel(model)) {
        markSplitDiagramDirty(diagramId)
      }
      pushSnapshotCommand(
        'Изменение фона объекта',
        () => commitDiagramOverrides(cloneNodeOverrideMap(beforeAll)),
        () => commitDiagramOverrides(cloneNodeOverrideMap(nextAll)),
      )
    },
    [diagramOverrides, commitDiagramOverrides, markSplitDiagramDirty, model, pushSnapshotCommand],
  )

  const updateDiagramMetadata = useCallback(
    (diagramId: string, patch: Partial<ParsedDiagram>) => {
      if (!model || !diagramId) {
        return
      }
      const hasPatch = patch && Object.keys(patch).length > 0
      if (!hasPatch) {
        return
      }
      const current = model.diagrams.find((diagram) => diagram.id === diagramId)
      if (!current) {
        return
      }
      const nameChanged = patch.name != null && patch.name !== current.name
      if (!nameChanged) {
        return
      }
      setModel({
        ...model,
        diagrams: model.diagrams.map((diagram) =>
          diagram.id === diagramId ? { ...diagram, ...patch } : diagram,
        ),
      })
      markSplitDiagramDirty(diagramId)
    },
    [model, markSplitDiagramDirty],
  )

  const updateRelationshipMetaOverride = useCallback((relationshipId: string, patch: Partial<RelationshipMetaOverride>) => {
    if (!relationshipId || !model) {
      return
    }
    const base = model.relationshipById.get(relationshipId)
    if (!base) {
      return
    }
    const prev = relationshipMetaOverrides.get(relationshipId) ?? {
      name: base.name,
      documentation: base.documentation ?? '',
    }
    const all = new Map(relationshipMetaOverrides)
    all.set(relationshipId, { ...prev, ...patch })
    commitRelationshipMetaOverrides(all)
  }, [model, relationshipMetaOverrides])

  const updateElementOverride = useCallback((elementId: string, patch: Partial<ElementOverride>) => {
    if (!elementId || !model) {
      return
    }
    const base = model.elementById.get(elementId)
    if (!base) {
      return
    }
    const prev = elementOverrides.get(elementId) ?? {
      name: base.name,
      documentation: base.documentation ?? '',
    }
    const next = {
      ...prev,
      ...patch,
    }
    const all = new Map(elementOverrides)
    all.set(elementId, next)
    commitElementOverrides(all)
  }, [model, elementOverrides])

  function createNewObject(elementType: string, atPoint: Point | null, nameOverride = '') {
    if (!model || !selectedDiagramId) {
      return
    }
    const type = String(elementType ?? 'BusinessProcess')
      .trim()
      .replace(/^archimate:/i, '') || 'BusinessProcess'
    const name = String(nameOverride ?? '').trim() || `New ${type}`
    const nonce = Math.random().toString(36).slice(2, 8)
    const elementId = `id-new-${Date.now()}-${nonce}`
    const nodeId = `id-new-node-${Date.now()}-${nonce}`

    const targetDiagram = model.diagrams.find((d) => d.id === selectedDiagramId)
    if (!targetDiagram) {
      return
    }

    const flat = flattenNodes(targetDiagram.nodes)
    const maxY = flat.length ? Math.max(...flat.map((n) => n.y + n.height)) : 40
    const maxX = flat.length ? Math.max(...flat.map((n) => n.x)) : 40
    const targetX = snapToGrid(
      atPoint && Number.isFinite(atPoint.x)
        ? Math.max(0, atPoint.x - 85)
        : Math.max(40, Math.min(260, maxX + 30)),
    )
    const targetY = snapToGrid(
      atPoint && Number.isFinite(atPoint.y) ? Math.max(0, atPoint.y - 35) : maxY + 30,
    )
    const newNode: DiagramNode = {
      id: nodeId,
      elementRef: elementId,
      type: 'DiagramObject',
      label: '',
      x: targetX,
      y: targetY,
      width: 170,
      height: 70,
      children: [],
    }

    const diagramOverridesForDiagram = diagramOverrides.get(selectedDiagramId)
    const layoutNodes = diagramOverridesForDiagram?.size
      ? applyOverridesToNodes(targetDiagram.nodes, diagramOverridesForDiagram)
      : targetDiagram.nodes
    const containerNode = findInnermostContainingNode(layoutNodes, newNode)

    const newElement: ParsedElement = {
      id: elementId,
      name,
      type: `archimate:${type}`,
      documentation: '',
      properties: [],
    }

    const nextDiagrams = model.diagrams.map((diagram) => {
      if (diagram.id !== selectedDiagramId) {
        return diagram
      }
      return {
        ...diagram,
        nodes: containerNode
          ? insertNodeUnderParent(diagram.nodes, containerNode.id, newNode)
          : [...diagram.nodes, newNode],
      }
    })

    const nextElements = [...model.elements, newElement]
    const nextElementById = new Map(model.elementById)
    nextElementById.set(elementId, newElement)

    let finalDiagrams = nextDiagrams
    let finalRelationships = model.relationships
    let finalRelationshipById = model.relationshipById
    let createdRelationship: CreatedRelationship | undefined

    if (containerNode) {
      const aggregationResult = applyNestAggregationToDiagrams(
        model,
        selectedDiagramId,
        nextDiagrams,
        containerNode.id,
        nodeId,
      )
      if (aggregationResult) {
        finalDiagrams = aggregationResult.diagrams
        finalRelationships = aggregationResult.relationships
        finalRelationshipById = aggregationResult.relationshipById
        createdRelationship = aggregationResult.createdRelationship
      }
    }

    setModel({
      ...model,
      elements: nextElements,
      diagrams: finalDiagrams,
      elementById: nextElementById,
      relationships: finalRelationships,
      relationshipById: finalRelationshipById,
    })
    markSplitDiagramDirty(selectedDiagramId)
    setCreatedObjects((prev) => [
      ...prev,
      { diagramId: selectedDiagramId, element: newElement, node: newNode, format: model.format },
    ])
    if (createdRelationship) {
      setCreatedRelationships((prev) => [...prev, createdRelationship!])
    }
    setSelectedNode(newNode)
    setSelectedElementId(elementId)
    setSelectedRelationshipRef(null)
    clearLinkCreation()
  }

  function placeElementOnDiagram(elementId: string, atPoint: Point) {
    if (!model || !selectedDiagramId) {
      return
    }
    const element = model.elementById.get(elementId)
    if (!element) {
      return
    }

    const targetDiagram = model.diagrams.find((d) => d.id === selectedDiagramId)
    if (!targetDiagram) {
      return
    }

    const nonce = Math.random().toString(36).slice(2, 8)
    const nodeId = `id-new-node-${Date.now()}-${nonce}`

    const flat = flattenNodes(targetDiagram.nodes)
    const maxY = flat.length ? Math.max(...flat.map((n) => n.y + n.height)) : 40
    const maxX = flat.length ? Math.max(...flat.map((n) => n.x)) : 40
    const targetX = snapToGrid(
      atPoint && Number.isFinite(atPoint.x)
        ? Math.max(0, atPoint.x - 85)
        : Math.max(40, Math.min(260, maxX + 30)),
    )
    const targetY = snapToGrid(
      atPoint && Number.isFinite(atPoint.y) ? Math.max(0, atPoint.y - 35) : maxY + 30,
    )
    const newNode: DiagramNode = {
      id: nodeId,
      elementRef: elementId,
      type: 'DiagramObject',
      label: '',
      x: targetX,
      y: targetY,
      width: 170,
      height: 70,
      children: [],
    }

    const diagramOverridesForDiagram = diagramOverrides.get(selectedDiagramId)
    const layoutNodes = diagramOverridesForDiagram?.size
      ? applyOverridesToNodes(targetDiagram.nodes, diagramOverridesForDiagram)
      : targetDiagram.nodes
    const containerNode = findInnermostContainingNode(layoutNodes, newNode)

    const nextDiagrams = model.diagrams.map((diagram) => {
      if (diagram.id !== selectedDiagramId) {
        return diagram
      }
      return {
        ...diagram,
        nodes: containerNode
          ? insertNodeUnderParent(diagram.nodes, containerNode.id, newNode)
          : [...diagram.nodes, newNode],
      }
    })

    let finalDiagrams = nextDiagrams
    let finalRelationships = model.relationships
    let finalRelationshipById = model.relationshipById
    let createdRelationship: CreatedRelationship | undefined

    if (containerNode) {
      const aggregationResult = applyNestAggregationToDiagrams(
        model,
        selectedDiagramId,
        nextDiagrams,
        containerNode.id,
        nodeId,
      )
      if (aggregationResult) {
        finalDiagrams = aggregationResult.diagrams
        finalRelationships = aggregationResult.relationships
        finalRelationshipById = aggregationResult.relationshipById
        createdRelationship = aggregationResult.createdRelationship
      }
    }

    setModel({
      ...model,
      diagrams: finalDiagrams,
      relationships: finalRelationships,
      relationshipById: finalRelationshipById,
    })
    markSplitDiagramDirty(selectedDiagramId)
    setCreatedObjects((prev) => [
      ...prev,
      {
        diagramId: selectedDiagramId,
        element,
        node: newNode,
        format: model.format,
        existingElement: true,
      },
    ])
    if (createdRelationship) {
      setCreatedRelationships((prev) => [...prev, createdRelationship!])
    }
    setSelectedNode(newNode)
    setSelectedElementId(elementId)
    setSelectedRelationshipRef(null)
    clearLinkCreation()
  }

  function placeDiagramReferenceOnDiagram(referencedDiagramId: string, atPoint: Point) {
    if (!model || !selectedDiagramId) {
      return
    }
    if (referencedDiagramId === selectedDiagramId) {
      return
    }
    const referencedDiagram = model.diagrams.find((item) => item.id === referencedDiagramId)
    if (!referencedDiagram) {
      return
    }

    const targetDiagram = model.diagrams.find((item) => item.id === selectedDiagramId)
    if (!targetDiagram) {
      return
    }

    const nonce = Math.random().toString(36).slice(2, 8)
    const nodeId = `id-new-ref-${Date.now()}-${nonce}`

    const flat = flattenNodes(targetDiagram.nodes)
    const maxY = flat.length ? Math.max(...flat.map((n) => n.y + n.height)) : 40
    const maxX = flat.length ? Math.max(...flat.map((n) => n.x)) : 40
    const targetX = snapToGrid(
      atPoint && Number.isFinite(atPoint.x)
        ? Math.max(0, atPoint.x - 78)
        : Math.max(40, Math.min(260, maxX + 30)),
    )
    const targetY = snapToGrid(
      atPoint && Number.isFinite(atPoint.y) ? Math.max(0, atPoint.y - 12) : maxY + 30,
    )
    const newNode: DiagramNode = {
      id: nodeId,
      elementRef: '',
      type: 'archimate:DiagramModelReference',
      label: referencedDiagram.name,
      referencedDiagramId,
      x: targetX,
      y: targetY,
      width: 157,
      height: 25,
      children: [],
    }

    const diagramOverridesForDiagram = diagramOverrides.get(selectedDiagramId)
    const layoutNodes = diagramOverridesForDiagram?.size
      ? applyOverridesToNodes(targetDiagram.nodes, diagramOverridesForDiagram)
      : targetDiagram.nodes
    const containerNode = findInnermostContainingNode(layoutNodes, newNode)

    const nextDiagrams = model.diagrams.map((diagram) => {
      if (diagram.id !== selectedDiagramId) {
        return diagram
      }
      return {
        ...diagram,
        nodes: containerNode
          ? insertNodeUnderParent(diagram.nodes, containerNode.id, newNode)
          : [...diagram.nodes, newNode],
      }
    })

    setModel({
      ...model,
      diagrams: nextDiagrams,
    })
    markSplitDiagramDirty(selectedDiagramId)
    setSelectedNode(newNode)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    clearLinkCreation()
  }

  function createNewDiagram(nameOverride = '') {
    if (!model) {
      return
    }
    const name = String(nameOverride ?? '').trim() || 'New view'
    const nonce = Math.random().toString(36).slice(2, 8)
    const id = `id-new-diagram-${Date.now()}-${nonce}`
    const templateDiagram =
      model.diagrams.find((d) => d.id === selectedDiagramId) ?? model.diagrams[0] ?? null
    const diagramType =
      model.format === 'exchange'
        ? templateDiagram?.type ?? 'archimate:Diagram'
        : 'archimate:ArchimateDiagramModel'

    const newDiagram: ParsedDiagram = {
      id,
      name,
      type: diagramType,
      folderPath: model.format === 'archi-tool' ? templateDiagram?.folderPath ?? '' : undefined,
      nodes: [],
      connections: [],
    }

    setModel({
      ...model,
      diagrams: [...model.diagrams, newDiagram],
    })
    setCreatedDiagramIds((prev) => new Set([...prev, id]))
    setSelectedDiagramId(id)
    setSelectedNode(null)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    setSelectedBendpointIndex(null)
    clearLinkCreation()
  }

  const createRelationshipBetweenNodes = useCallback(
    (relationshipType: string, sourceNodeId: string, targetNodeId: string) => {
      if (!model || !selectedDiagramId || !relationshipType || !sourceNodeId || !targetNodeId) {
        return false
      }
      if (sourceNodeId === targetNodeId) {
        return false
      }

      const diagram = model.diagrams.find((d) => d.id === selectedDiagramId)
      if (!diagram) {
        return false
      }

      const sourceNode = findNodeById(diagram.nodes, sourceNodeId)
      const targetNode = findNodeById(diagram.nodes, targetNodeId)
      if (!sourceNode?.elementRef || !targetNode?.elementRef) {
        return false
      }

      if (sourceNode.elementRef === targetNode.elementRef) {
        window.alert('Укажите два разных элемента модели.')
        return false
      }

      const dup = diagram.connections.some(
        (c) =>
          (c.source === sourceNodeId && c.target === targetNodeId) ||
          (c.source === targetNodeId && c.target === sourceNodeId),
      )
      if (dup) {
        window.alert('Между этими объектами на диаграмме уже есть связь.')
        return false
      }

      const relId = generateArchimateModelId()
      const connId = generateArchimateModelId()
      const newRel = {
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

      setModel({
        ...model,
        relationships: [...model.relationships, newRel],
        relationshipById: nextRelationshipById,
        diagrams: nextDiagrams,
      })
      markSplitDiagramDirty(selectedDiagramId)
      setCreatedRelationships((prev) => [
        ...prev,
        {
          diagramId: selectedDiagramId,
          relationship: newRel,
          connection: newConn,
          format: model.format,
        },
      ])
      clearLinkCreation()
      setSelectedNode(targetNode)
      setSelectedElementId(targetNode.elementRef)
      setSelectedRelationshipRef(relId)
      return true
    },
    [model, selectedDiagramId],
  )

  const handleDropNewRelationshipAtPoint = useCallback(
    (relationshipType: string, _x: number, _y: number, targetNodeId: string | null) => {
      if (!model || !selectedDiagramId || !relationshipType) {
        return
      }

      if (targetNodeId && linkCreateSourceId && linkCreateSourceId !== targetNodeId) {
        createRelationshipBetweenNodes(relationshipType, linkCreateSourceId, targetNodeId)
        return
      }

      if (targetNodeId && linkCreateSourceId === targetNodeId) {
        setPendingLinkType(relationshipType)
        setLinkCreateSourceId(null)
        return
      }

      setPendingLinkType(relationshipType)
      setSelectedRelationshipRef(null)
      if (targetNodeId) {
        setLinkCreateSourceId(targetNodeId)
        const diagram = model.diagrams.find((d) => d.id === selectedDiagramId)
        const node = diagram ? findNodeById(diagram.nodes, targetNodeId) : null
        if (node) {
          setSelectedNode(node)
          setSelectedElementId(node.elementRef ?? null)
        }
        return
      }

      setLinkCreateSourceId(null)
    },
    [model, selectedDiagramId, linkCreateSourceId, createRelationshipBetweenNodes],
  )

  const pickLinkNode = useCallback(
    (node: DiagramNode) => {
      if (!model || !selectedDiagramId || !pendingLinkType || !node?.elementRef) {
        return
      }

      if (!linkCreateSourceId) {
        setLinkCreateSourceId(node.id)
        setSelectedRelationshipRef(null)
        return
      }

      if (linkCreateSourceId === node.id) {
        setLinkCreateSourceId(null)
        return
      }

      createRelationshipBetweenNodes(pendingLinkType, linkCreateSourceId, node.id)
    },
    [model, selectedDiagramId, pendingLinkType, linkCreateSourceId, createRelationshipBetweenNodes],
  )

  const deleteSelectedFromDiagram = useCallback(() => {
    if (!model || !selectedDiagramId || !selectedNodeLive) {
      return
    }
    if (
      !window.confirm(
        'Удалить объект с диаграммы (включая вложенные объекты и связанные линии)?',
      )
    ) {
      return
    }

    const beforeSnapshot = captureCurrentCanvasSnapshot()
    if (!beforeSnapshot) {
      return
    }

    const root = selectedNodeLive
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
      const nextMap = new Map<string, Bendpoint[]>()
      relMap.forEach((bendpoints, ref) => {
        if (validRefs.has(ref)) {
          nextMap.set(ref, bendpoints)
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

    const nextDirtySplitDiagramIds = new Set(dirtySplitDiagramIdsRef.current)
    nextDirtySplitDiagramIds.add(selectedDiagramId)

    const afterSnapshot: CanvasEditSnapshot = {
      ...cloneCanvasEditSnapshot(beforeSnapshot),
      model: cloneModelSnapshot({ ...model, diagrams: nextDiagrams }),
      diagramOverrides: cloneNodeOverrideMap(nextDiagramOverrides),
      relationshipOverrides: cloneBendpointMap(nextRelOverrides),
      createdObjects: cloneCreatedObjects(nextCreatedObjects),
      createdRelationships: cloneCreatedRelationships(nextCreatedRelationships),
      deletedDiagramNodeIds: nextDeletedDiagramNodeIds,
      deletedConnectionIds: nextDeletedConnectionIds,
      dirtySplitDiagramIds: nextDirtySplitDiagramIds,
      selectedNodeId: null,
      selectedElementId: null,
      selectedRelationshipRef: null,
      selectedBendpointIndex: null,
    }

    restoreCanvasSnapshot(afterSnapshot)
    pushSnapshotCommand(
      'Удаление объекта с диаграммы',
      () => restoreCanvasSnapshot(beforeSnapshot),
      () => restoreCanvasSnapshot(afterSnapshot),
    )
  }, [
    model,
    selectedDiagramId,
    selectedNodeLive,
    diagramOverrides,
    relationshipOverrides,
    createdObjects,
    createdRelationships,
    deletedDiagramNodeIds,
    deletedConnectionIds,
    originalDiagramNodeIds,
    originalConnectionIds,
    pushSnapshotCommand,
  ])

  const deleteSelectedConnectionFromDiagram = useCallback(() => {
    if (!model || !selectedDiagramId || !selectedRelationshipRef) {
      return
    }
    const diagram = model.diagrams.find((d) => d.id === selectedDiagramId)
    if (!diagram) {
      return
    }
    const ref = selectedRelationshipRef
    const toRemove = diagram.connections.filter((c) => c.relationshipRef === ref)
    if (!toRemove.length) {
      window.alert('На текущей диаграмме нет визуализации этой связи.')
      return
    }
    if (!window.confirm('Удалить связь с этой диаграммы?')) {
      return
    }

    const beforeSnapshot = captureCurrentCanvasSnapshot()
    if (!beforeSnapshot) {
      return
    }

    const removedConnIds = toRemove.map((c) => c.id)

    const nextDiagrams = model.diagrams.map((d) => {
      if (d.id !== selectedDiagramId) {
        return d
      }
      return {
        ...d,
        connections: d.connections.filter((c) => c.relationshipRef !== ref),
      }
    })

    const relMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
    relMap.delete(ref)
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

    const nextDirtySplitDiagramIds = new Set(dirtySplitDiagramIdsRef.current)
    if (isSplitFilesModel(model)) {
      nextDirtySplitDiagramIds.add(selectedDiagramId)
    }

    const afterSnapshot: CanvasEditSnapshot = {
      ...cloneCanvasEditSnapshot(beforeSnapshot),
      model: cloneModelSnapshot({ ...model, diagrams: nextDiagrams }),
      relationshipOverrides: cloneBendpointMap(nextRelOverrides),
      createdRelationships: cloneCreatedRelationships(nextCreatedRelationships),
      deletedConnectionIds: nextDeletedConnectionIds,
      dirtySplitDiagramIds: nextDirtySplitDiagramIds,
      selectedNodeId: null,
      selectedElementId: null,
      selectedRelationshipRef: null,
      selectedBendpointIndex: null,
    }

    restoreCanvasSnapshot(afterSnapshot)
    pushSnapshotCommand(
      'Удаление связи с диаграммы',
      () => restoreCanvasSnapshot(beforeSnapshot),
      () => restoreCanvasSnapshot(afterSnapshot),
    )
  }, [
    model,
    selectedDiagramId,
    selectedRelationshipRef,
    relationshipOverrides,
    createdRelationships,
    deletedConnectionIds,
    originalConnectionIds,
    pushSnapshotCommand,
  ])

  const deleteRelationshipFromModel = useCallback(() => {
    if (!model || !selectedRelationshipRef) {
      return
    }
    const ref = selectedRelationshipRef
    const relationship = model.relationshipById.get(ref)
    if (!window.confirm('Удалить связь из модели? Она исчезнет на всех диаграммах.')) {
      return
    }

    const removedConnIds: string[] = []
    model.diagrams.forEach((d) => {
      d.connections.forEach((c) => {
        if (c.relationshipRef === ref) {
          removedConnIds.push(c.id)
        }
      })
    })

    const nextRelationships = model.relationships.filter((r) => r.id !== ref)
    const nextRelationshipById = new Map(model.relationshipById)
    nextRelationshipById.delete(ref)

    const nextDiagrams = model.diagrams.map((d) => ({
      ...d,
      connections: filterConnectionsToExistingRelationships(d.connections, nextRelationshipById),
    }))

    const nextDiagramIndexByRelationshipRef = new Map(model.diagramIndexByRelationshipRef ?? [])
    nextDiagramIndexByRelationshipRef.delete(ref)

    const nextRelOverrides = new Map<string, Map<string, Bendpoint[]>>()
    relationshipOverrides.forEach((relMap, diagramId) => {
      const m = new Map(relMap)
      m.delete(ref)
      nextRelOverrides.set(diagramId, m)
    })

    setDeletedConnectionIds((prev) => {
      const next = new Set(prev)
      removedConnIds.forEach((id) => {
        if (originalConnectionIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })
    if (originalRelationshipIds.has(ref)) {
      setDeletedRelationshipIds((prev) => {
        const next = new Set(prev)
        next.add(ref)
        return next
      })
      if (relationship && isSplitFilesModel(model)) {
        trackDeletedSplitModelFile(resolveSplitRelationshipFilePath(relationship))
      }
    }

    markDiagramsUsingRelationship(ref)

    setCreatedRelationships((prev) => prev.filter((cr) => cr.relationship.id !== ref))

    commitRelationshipOverrides(nextRelOverrides)
    commitRelationshipMetaOverrides((prev) => {
      const next = new Map(prev)
      next.delete(ref)
      return next
    })
    setModel({
      ...model,
      diagrams: nextDiagrams,
      relationships: nextRelationships,
      relationshipById: nextRelationshipById,
      diagramIndexByRelationshipRef: nextDiagramIndexByRelationshipRef,
    })
    setSelectedRelationshipRef(null)
  }, [
    model,
    selectedRelationshipRef,
    relationshipOverrides,
    originalConnectionIds,
    originalRelationshipIds,
  ])

  const deleteElementFromModel = useCallback(() => {
    if (!model) {
      return
    }
    const elementId =
      selectedElement?.id ?? selectedNodeLive?.elementRef ?? selectedElementId ?? ''
    if (!elementId || !model.elementById.has(elementId)) {
      return
    }
    if (
      !window.confirm(
        'Удалить элемент из модели? Он будет убран со всех диаграмм; связи с этим элементом тоже удалятся.',
      )
    ) {
      return
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

    const nextRelOverrides = new Map<string, Map<string, Bendpoint[]>>()
    relationshipOverrides.forEach((relMap, diagramId) => {
      const m = new Map(relMap)
      removedRelIds.forEach((rid) => m.delete(rid))
      nextRelOverrides.set(diagramId, m)
    })

    const nextElemOverrides = new Map(elementOverrides)
    nextElemOverrides.delete(elementId)

    const nextRelMetaOverrides = new Map(relationshipMetaOverrides)
    removedRelIds.forEach((id) => nextRelMetaOverrides.delete(id))

    const element = model.elementById.get(elementId)
    if (isSplitFilesModel(model)) {
      if (element && originalElementIds.has(elementId)) {
        trackDeletedSplitModelFile(resolveSplitElementFilePath(element))
      }
      relsToRemove.forEach((relationship) => {
        if (originalRelationshipIds.has(relationship.id)) {
          trackDeletedSplitModelFile(resolveSplitRelationshipFilePath(relationship))
        }
      })
      model.diagrams.forEach((diagram) => {
        const hadConnectionRemoval = diagram.connections.some(
          (connection) =>
            removedRelIds.has(connection.relationshipRef) ||
            removedNodeIds.has(connection.source) ||
            removedNodeIds.has(connection.target),
        )
        const hadNodeRemoval = collectNodeIdsRemovedForElement(diagram.nodes, elementId).length > 0
        if (hadConnectionRemoval || hadNodeRemoval) {
          markSplitDiagramDirty(diagram.id)
        }
      })
    }

    setDeletedDiagramNodeIds((prev) => {
      const next = new Set(prev)
      removedNodeIds.forEach((id) => {
        if (originalDiagramNodeIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })
    setDeletedElementIds((prev) => {
      const next = new Set(prev)
      if (originalElementIds.has(elementId)) {
        next.add(elementId)
      }
      return next
    })
    setDeletedRelationshipIds((prev) => {
      const next = new Set(prev)
      relsToRemove.forEach((r) => {
        if (originalRelationshipIds.has(r.id)) {
          next.add(r.id)
        }
      })
      return next
    })
    setDeletedConnectionIds((prev) => {
      const next = new Set(prev)
      removedConnIds.forEach((id) => {
        if (originalConnectionIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })

    setCreatedObjects((prev) =>
      prev.filter((c) => c.element.id !== elementId && !removedNodeIds.has(c.node.id)),
    )
    setCreatedRelationships((prev) =>
      prev.filter(
        (cr) =>
          !removedRelIds.has(cr.relationship.id) &&
          !removedNodeIds.has(cr.connection.source) &&
          !removedNodeIds.has(cr.connection.target),
      ),
    )

    setLinkCreateSourceId((sid) => (sid && removedNodeIds.has(sid) ? null : sid))

    commitDiagramOverrides(nextDiagramOverrides)
    commitRelationshipOverrides(nextRelOverrides)
    commitElementOverrides(nextElemOverrides)
    commitRelationshipMetaOverrides(nextRelMetaOverrides)
    setModel({
      ...model,
      diagrams: nextDiagrams,
      elements: nextElements,
      elementById: nextElementById,
      relationships: nextRelationships,
      relationshipById: nextRelationshipById,
    })
    setSelectedNode(null)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
  }, [
    model,
    selectedElement,
    selectedNodeLive,
    selectedElementId,
    diagramOverrides,
    relationshipOverrides,
    relationshipMetaOverrides,
    elementOverrides,
    originalDiagramNodeIds,
    originalElementIds,
    originalRelationshipIds,
    originalConnectionIds,
    markSplitDiagramDirty,
  ])

  function updateRelationshipBendpoint(relationshipRef: string, bendpointIndex: number, bendpoint: Bendpoint) {
    if (!selectedDiagramId || !selectedDiagram) {
      return
    }
    const currentConnection = selectedDiagram.connections.find(
      (c) => c.relationshipRef === relationshipRef,
    )
    if (!currentConnection) {
      return
    }
    const nextBendpoints = [...(currentConnection.bendpoints ?? [])]
    if (!nextBendpoints[bendpointIndex]) {
      return
    }
    nextBendpoints[bendpointIndex] = bendpoint
    const beforeAll = cloneBendpointMap(relationshipOverrides)
    const diagramMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
    diagramMap.set(relationshipRef, nextBendpoints)
    const nextAll = new Map(relationshipOverrides)
    nextAll.set(selectedDiagramId, diagramMap)
    commitRelationshipOverrides(nextAll)
    pushSnapshotCommand(
      'Перемещение точки перегиба',
      () => commitRelationshipOverrides(cloneBendpointMap(beforeAll)),
      () => commitRelationshipOverrides(cloneBendpointMap(nextAll)),
    )
  }

  function addRelationshipBendpoint(relationshipRef: string, segmentIndex: number, bendpoint: Bendpoint) {
    if (!selectedDiagramId || !selectedDiagram) {
      return
    }
    const currentConnection = selectedDiagram.connections.find(
      (c) => c.relationshipRef === relationshipRef,
    )
    if (!currentConnection) {
      return
    }
    const nextBendpoints = [...(currentConnection.bendpoints ?? [])]
    const insertAt = Math.max(0, Math.min(nextBendpoints.length, segmentIndex))
    nextBendpoints.splice(insertAt, 0, bendpoint)
    const beforeAll = cloneBendpointMap(relationshipOverrides)
    const diagramMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
    diagramMap.set(relationshipRef, nextBendpoints)
    const nextAll = new Map(relationshipOverrides)
    nextAll.set(selectedDiagramId, diagramMap)
    commitRelationshipOverrides(nextAll)
    setSelectedBendpointIndex(insertAt)
    pushSnapshotCommand(
      'Добавление точки перегиба',
      () => {
        commitRelationshipOverrides(cloneBendpointMap(beforeAll))
        setSelectedBendpointIndex(null)
      },
      () => {
        commitRelationshipOverrides(cloneBendpointMap(nextAll))
        setSelectedBendpointIndex(insertAt)
      },
    )
  }

  function reassignRelationshipEndpoint(
    relationshipRef: string,
    endpoint: ConnectionEndpointKind,
    newNodeId: string,
  ) {
    if (!model || !selectedDiagramId) {
      return
    }
    const relationship = model.relationshipById.get(relationshipRef)
    const diagram = model.diagrams.find((d) => d.id === selectedDiagramId)
    const connection = diagram?.connections.find((c) => c.relationshipRef === relationshipRef)
    if (!relationship || !diagram || !connection) {
      return
    }

    const newNode = findNodeById(diagram.nodes, newNodeId)
    if (!newNode?.elementRef || isDiagramReferenceNode(newNode)) {
      return
    }

    const otherNodeId = endpoint === 'source' ? connection.target : connection.source
    const otherNode = findNodeById(diagram.nodes, otherNodeId)
    if (!otherNode?.elementRef) {
      return
    }
    if (newNodeId === otherNodeId) {
      return
    }
    if (newNode.elementRef === otherNode.elementRef) {
      window.alert('Укажите два разных элемента модели.')
      return
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
      window.alert('Между этими объектами на диаграмме уже есть связь.')
      return
    }

    const beforeSnapshot = captureCurrentCanvasSnapshot()
    if (!beforeSnapshot) {
      return
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

    const nextDirtyDiagramIds = new Set(dirtySplitDiagramIdsRef.current)
    const nextDirtyRelationshipIds = new Set(dirtySplitRelationshipIdsRef.current)
    if (isSplitFilesModel(model)) {
      model.diagrams.forEach((d) => {
        if (d.connections.some((c) => c.relationshipRef === relationshipRef)) {
          nextDirtyDiagramIds.add(d.id)
        }
      })
      if (relationship.sourceFile || originalRelationshipIds.has(relationshipRef)) {
        nextDirtyRelationshipIds.add(relationshipRef)
      }
    }

    const afterSnapshot: CanvasEditSnapshot = {
      ...cloneCanvasEditSnapshot(beforeSnapshot),
      model: cloneModelSnapshot({
        ...model,
        diagrams: nextDiagrams,
        relationships: nextRelationships,
        relationshipById: nextRelationshipById,
      }),
      relationshipOverrides: cloneBendpointMap(nextRelOverrides),
      createdRelationships: cloneCreatedRelationships(nextCreatedRelationships),
      dirtySplitDiagramIds: nextDirtyDiagramIds,
      dirtySplitRelationshipIds: nextDirtyRelationshipIds,
      selectedBendpointIndex: null,
    }

    restoreCanvasSnapshot(afterSnapshot)
    pushSnapshotCommand(
      endpoint === 'source' ? 'Изменение source связи' : 'Изменение target связи',
      () => restoreCanvasSnapshot(beforeSnapshot),
      () => restoreCanvasSnapshot(afterSnapshot),
    )
  }

  const undoCanvasCommand = useCallback(() => {
    commandHistory.undo()
  }, [commandHistory])

  const redoCanvasCommand = useCallback(() => {
    commandHistory.redo()
  }, [commandHistory])

  const clearCanvasHistory = useCallback(() => {
    commandHistory.clear()
  }, [commandHistory])

  return {
    moveNode,
    resizeNode,
    updateNodeFillColor,
    updateDiagramMetadata,
    updateRelationshipMetaOverride,
    updateElementOverride,
    createNewObject,
    placeElementOnDiagram,
    placeDiagramReferenceOnDiagram,
    createNewDiagram,
    createRelationshipBetweenNodes,
    handleDropNewRelationshipAtPoint,
    pickLinkNode,
    deleteSelectedFromDiagram,
    deleteSelectedConnectionFromDiagram,
    deleteRelationshipFromModel,
    deleteElementFromModel,
    removeRelationshipBendpoint,
    updateRelationshipBendpoint,
    addRelationshipBendpoint,
    reassignRelationshipEndpoint,
    undoCanvasCommand,
    redoCanvasCommand,
    clearCanvasHistory,
    canvasHistory: {
      canUndo: commandHistory.canUndo,
      canRedo: commandHistory.canRedo,
      undoLabel: commandHistory.undoLabel,
      redoLabel: commandHistory.redoLabel,
    },
  }
}
