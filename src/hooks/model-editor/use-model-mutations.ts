import { useCallback } from 'react'
import { findNodeById } from '../../lib/archimate/diagram-model'
import { createSnapshotCommand, useCommandHistory } from '../../lib/commands'
import type { ConnectionEndpointKind } from '../../lib/diagram-canvas/types'
import {
  cloneBendpointMap,
  cloneNodeOverrideMap,
  computeAddRelationshipBendpoint,
  computeCreateDiagramFolder,
  computeCreateNewDiagram,
  computeCreateNewObject,
  computeCreateRelationshipBetweenNodes,
  computeDeleteElementFromModel,
  computeDeleteRelationshipFromModel,
  computeDeleteSelectedConnectionFromDiagram,
  computeDeleteSelectedFromDiagram,
  computeMoveNodesUpdate,
  computeNodeFillColorUpdate,
  computePlaceDiagramReferenceOnDiagram,
  computePlaceElementOnDiagram,
  computeReassignRelationshipEndpoint,
  computeRemoveRelationshipBendpoint,
  computeRenameDiagramFolder,
  computeResizeNodeUpdate,
  computeUpdateDiagramMetadata,
  computeUpdateRelationshipBendpoint,
  remapCreatedDiagramFolderPaths,
} from '../../lib/model-editor/mutations'
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
  DiagramNode,
  Bendpoint,
  ElementOverride,
  RelationshipMetaOverride,
  Point,
} from '../../types/model'
import type { ModelEditState } from './use-model-edit-state'
import type { ModelSelectionState } from './use-model-selection'

export interface ModelMutations {
  moveNode: (diagramId: string, nodeId: string, dx: number, dy: number) => void
  moveNodes: (diagramId: string, nodeIds: string[], dx: number, dy: number) => void
  resizeNode: (diagramId: string, nodeId: string, dw: number, dh: number) => void
  updateNodeFillColor: (diagramId: string, nodeId: string, fillColor: string | null) => void
  updateDiagramMetadata: (diagramId: string, patch: Partial<ParsedDiagram>) => void
  updateDiagramFolderMetadata: (folderKey: string, patch: { name: string }) => void
  updateRelationshipMetaOverride: (relationshipId: string, patch: Partial<RelationshipMetaOverride>) => void
  updateElementOverride: (elementId: string, patch: Partial<ElementOverride>) => void
  createNewObject: (elementType: string, atPoint: Point | null, nameOverride?: string) => void
  placeElementOnDiagram: (elementId: string, atPoint: Point) => void
  placeDiagramReferenceOnDiagram: (referencedDiagramId: string, atPoint: Point) => void
  createNewDiagram: (nameOverride?: string) => void
  createNewDiagramFolder: (nameOverride?: string) => void
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

export function useModelMutations({ editState, selection }: UseModelMutationsOptions): ModelMutations {
  const commandHistory = useCommandHistory()
  const {
    model, setModel,
    diagramOverrides, relationshipOverrides, elementOverrides, relationshipMetaOverrides,
    createdObjects, createdRelationships,
    setCreatedObjects, setCreatedRelationships, setCreatedDiagramIds, setCreatedDiagramFolderPaths,
    setDirtyDiagramFolderPaths,
    createdDiagramFolderPaths,
    originalDiagramFolderPaths,
    deletedDiagramNodeIds, deletedElementIds, deletedRelationshipIds, deletedConnectionIds,
    originalDiagramNodeIds, originalElementIds, originalRelationshipIds, originalConnectionIds,
    setDeletedDiagramNodeIds, setDeletedElementIds, setDeletedRelationshipIds, setDeletedConnectionIds,
    pendingLinkType, linkCreateSourceId, setLinkCreateSourceId, setPendingLinkType,
    commitDiagramOverrides, commitRelationshipOverrides, commitElementOverrides,
    commitRelationshipMetaOverrides, clearLinkCreation,
  } = editState

  const {
    selectedDiagramId, setSelectedDiagramId,
    setSelectedNode, setSelectedElementId,
    selectedElementId,
    selectedRelationshipRef, setSelectedRelationshipRef,
    setSelectedBendpointIndex, selectedBendpointIndex,
    selectedDiagramFolderKey, setSelectedDiagramFolderKey,
    setDiagramTreeSelectedKey,
    selectedDiagram, selectedElement, selectedNodeLive,
  } = selection

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
      const update = computeRemoveRelationshipBendpoint(
        selectedDiagram,
        selectedDiagramId,
        relationshipRef,
        bendpointIndex,
        relationshipOverrides,
      )
      if (!update) {
        return
      }
      commitRelationshipOverrides(update.nextOverrides)
      setSelectedBendpointIndex(null)
      pushSnapshotCommand(
        'Удаление точки перегиба',
        () => {
          commitRelationshipOverrides(cloneBendpointMap(update.beforeOverrides))
          setSelectedBendpointIndex(bendpointIndex)
        },
        () => {
          commitRelationshipOverrides(cloneBendpointMap(update.nextOverrides))
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

  function moveNodes(diagramId: string, nodeIds: string[], dx: number, dy: number) {
    if (!model) {
      return
    }
    const update = computeMoveNodesUpdate(model, diagramId, nodeIds, dx, dy, diagramOverrides)
    if (!update) {
      return
    }

    commitDiagramOverrides(update.nextDiagramOverrides)
    if (update.nestingChanged) {
      setModel({
        ...model,
        relationships: update.nextRelationships,
        relationshipById: update.nextRelationshipById,
        diagrams: model.diagrams.map((item) =>
          item.id === diagramId
            ? { ...item, nodes: update.nextDiagramNodes, connections: update.nextConnections }
            : item,
        ),
      })
      if (update.createdRelationship) {
        setCreatedRelationships((prev) => [...prev, update.createdRelationship!])
      }
    }

    pushSnapshotCommand(
      update.roots.length > 1 ? 'Перемещение объектов' : 'Перемещение объекта',
      () => {
        commitDiagramOverrides(cloneNodeOverrideMap(update.beforeDiagramOverrides))
        if (update.nestingChanged) {
          setModel({
            ...model,
            relationships: update.beforeRelationships,
            relationshipById: update.beforeRelationshipById,
            diagrams: model.diagrams.map((item) =>
              item.id === diagramId
                ? {
                    ...item,
                    nodes: update.beforeDiagramNodes,
                    connections: update.beforeConnections,
                  }
                : item,
            ),
          })
        }
      },
      () => {
        commitDiagramOverrides(cloneNodeOverrideMap(update.nextDiagramOverrides))
        if (update.nestingChanged) {
          setModel({
            ...model,
            relationships: update.nextRelationships,
            relationshipById: update.nextRelationshipById,
            diagrams: model.diagrams.map((item) =>
              item.id === diagramId
                ? {
                    ...item,
                    nodes: update.nextDiagramNodes,
                    connections: update.nextConnections,
                  }
                : item,
            ),
          })
        }
      },
    )
  }

  function moveNode(diagramId: string, nodeId: string, dx: number, dy: number) {
    moveNodes(diagramId, [nodeId], dx, dy)
  }

  function resizeNode(diagramId: string, nodeId: string, dw: number, dh: number) {
    if (!selectedDiagram) {
      return
    }
    const update = computeResizeNodeUpdate(
      selectedDiagram,
      diagramId,
      nodeId,
      dw,
      dh,
      diagramOverrides,
      relationshipOverrides,
    )
    if (!update) {
      return
    }

    commitDiagramOverrides(update.nextDiagramOverrides)
    if (update.relChanged) {
      commitRelationshipOverrides(update.nextRelOverrides)
    }
    pushSnapshotCommand(
      'Изменение размера объекта',
      () => {
        commitDiagramOverrides(cloneNodeOverrideMap(update.beforeDiagramOverrides))
        commitRelationshipOverrides(cloneBendpointMap(update.beforeRelOverrides))
      },
      () => {
        commitDiagramOverrides(cloneNodeOverrideMap(update.nextDiagramOverrides))
        commitRelationshipOverrides(cloneBendpointMap(update.nextRelOverrides))
      },
    )
  }

  const updateNodeFillColor = useCallback(
    (diagramId: string, nodeId: string, fillColor: string | null) => {
      const update = computeNodeFillColorUpdate(diagramId, nodeId, fillColor, diagramOverrides)
      if (!update) {
        return
      }
      commitDiagramOverrides(update.nextDiagramOverrides)
      pushSnapshotCommand(
        'Изменение фона объекта',
        () => commitDiagramOverrides(cloneNodeOverrideMap(update.beforeDiagramOverrides)),
        () => commitDiagramOverrides(cloneNodeOverrideMap(update.nextDiagramOverrides)),
      )
    },
    [diagramOverrides, commitDiagramOverrides, pushSnapshotCommand],
  )

  const updateDiagramFolderMetadata = useCallback(
    (folderKey: string, patch: { name: string }) => {
      if (!model) {
        return
      }
      const result = computeRenameDiagramFolder(
        model,
        folderKey,
        patch.name,
        createdDiagramFolderPaths,
        originalDiagramFolderPaths,
      )
      if (!result) {
        return
      }

      setModel(result.nextModel)
      setCreatedDiagramFolderPaths((prev) =>
        remapCreatedDiagramFolderPaths(prev, result.oldPath, result.newPath, result.branchName),
      )
      if (result.wasOriginal && !result.wasCreated) {
        setDirtyDiagramFolderPaths((prev) => new Set([...prev, result.newPath]))
      }
      setSelectedDiagramFolderKey(result.nextFolderKey)
      setDiagramTreeSelectedKey(result.nextFolderKey)
    },
    [
      model,
      originalDiagramFolderPaths,
      createdDiagramFolderPaths,
      setSelectedDiagramFolderKey,
      setDiagramTreeSelectedKey,
      setDirtyDiagramFolderPaths,
    ],
  )

  const updateDiagramMetadata = useCallback(
    (diagramId: string, patch: Partial<ParsedDiagram>) => {
      if (!model) {
        return
      }
      const nextModel = computeUpdateDiagramMetadata(model, diagramId, patch)
      if (!nextModel) {
        return
      }
      setModel(nextModel)
    },
    [model],
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
    const all = new Map(elementOverrides)
    all.set(elementId, { ...prev, ...patch })
    commitElementOverrides(all)
  }, [model, elementOverrides])

  function createNewObject(elementType: string, atPoint: Point | null, nameOverride = '') {
    if (!model || !selectedDiagramId) {
      return
    }
    const result = computeCreateNewObject(
      model,
      selectedDiagramId,
      elementType,
      atPoint,
      nameOverride,
      diagramOverrides,
    )
    if (!result) {
      return
    }
    setModel(result.nextModel)
    setCreatedObjects((prev) => [...prev, result.createdObject])
    if (result.createdRelationship) {
      setCreatedRelationships((prev) => [...prev, result.createdRelationship!])
    }
    setSelectedNode(result.newNode)
    setSelectedElementId(result.elementId)
    setSelectedRelationshipRef(null)
    clearLinkCreation()
  }

  function placeElementOnDiagram(elementId: string, atPoint: Point) {
    if (!model || !selectedDiagramId) {
      return
    }
    const result = computePlaceElementOnDiagram(
      model,
      selectedDiagramId,
      elementId,
      atPoint,
      diagramOverrides,
    )
    if (!result) {
      return
    }
    setModel(result.nextModel)
    setCreatedObjects((prev) => [...prev, result.createdObject])
    if (result.createdRelationship) {
      setCreatedRelationships((prev) => [...prev, result.createdRelationship!])
    }
    setSelectedNode(result.newNode)
    setSelectedElementId(result.elementId)
    setSelectedRelationshipRef(null)
    clearLinkCreation()
  }

  function placeDiagramReferenceOnDiagram(referencedDiagramId: string, atPoint: Point) {
    if (!model || !selectedDiagramId) {
      return
    }
    const result = computePlaceDiagramReferenceOnDiagram(
      model,
      selectedDiagramId,
      referencedDiagramId,
      atPoint,
      diagramOverrides,
    )
    if (!result) {
      return
    }
    setModel(result.nextModel)
    setSelectedNode(result.newNode)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    clearLinkCreation()
  }

  function createNewDiagramFolder(nameOverride = '') {
    if (!model) {
      return
    }
    const result = computeCreateDiagramFolder(model, selectedDiagramFolderKey, nameOverride)
    if (!result) {
      return
    }
    setModel(result.nextModel)
    setCreatedDiagramFolderPaths((prev) => new Set([...prev, result.newPath]))
    setSelectedDiagramFolderKey(result.folderKey)
    setDiagramTreeSelectedKey(result.folderKey)
  }

  function createNewDiagram(nameOverride = '') {
    if (!model) {
      return
    }
    const result = computeCreateNewDiagram(
      model,
      selectedDiagramId,
      selectedDiagramFolderKey,
      nameOverride,
    )
    setModel(result.nextModel)
    setCreatedDiagramIds((prev) => new Set([...prev, result.newDiagram.id]))
    setSelectedDiagramId(result.newDiagram.id)
    setDiagramTreeSelectedKey(result.newDiagram.id)
    setSelectedNode(null)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    setSelectedBendpointIndex(null)
    clearLinkCreation()
  }

  const createRelationshipBetweenNodes = useCallback(
    (relationshipType: string, sourceNodeId: string, targetNodeId: string) => {
      if (!model || !selectedDiagramId) {
        return false
      }
      const result = computeCreateRelationshipBetweenNodes(
        model,
        selectedDiagramId,
        relationshipType,
        sourceNodeId,
        targetNodeId,
      )
      if (!result.ok) {
        if (result.reason === 'same-element') {
          window.alert('Укажите два разных элемента модели.')
        } else if (result.reason === 'duplicate') {
          window.alert('Между этими объектами на диаграмме уже есть связь.')
        }
        return false
      }

      setModel(result.nextModel)
      setCreatedRelationships((prev) => [...prev, result.createdRelationship])
      clearLinkCreation()
      setSelectedNode(result.targetNode)
      setSelectedElementId(result.targetNode.elementRef)
      setSelectedRelationshipRef(result.relationshipId)
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

    const result = computeDeleteSelectedFromDiagram({
      model,
      selectedDiagramId,
      root: selectedNodeLive,
      diagramOverrides,
      relationshipOverrides,
      createdObjects,
      createdRelationships,
      deletedDiagramNodeIds,
      deletedConnectionIds,
      originalDiagramNodeIds,
      originalConnectionIds,
    })

    const afterSnapshot: CanvasEditSnapshot = {
      ...cloneCanvasEditSnapshot(beforeSnapshot),
      model: cloneModelSnapshot({ ...model, diagrams: result.nextDiagrams }),
      diagramOverrides: result.nextDiagramOverrides,
      relationshipOverrides: result.nextRelOverrides,
      createdObjects: cloneCreatedObjects(result.nextCreatedObjects),
      createdRelationships: cloneCreatedRelationships(result.nextCreatedRelationships),
      deletedDiagramNodeIds: result.nextDeletedDiagramNodeIds,
      deletedConnectionIds: result.nextDeletedConnectionIds,
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
    const result = computeDeleteSelectedConnectionFromDiagram(
      model,
      selectedDiagramId,
      selectedRelationshipRef,
      relationshipOverrides,
      createdRelationships,
      deletedConnectionIds,
      originalConnectionIds,
    )
    if (!result.ok) {
      if (result.reason === 'no-visualization') {
        window.alert('На текущей диаграмме нет визуализации этой связи.')
      }
      return
    }
    if (!window.confirm('Удалить связь с этой диаграммы?')) {
      return
    }

    const beforeSnapshot = captureCurrentCanvasSnapshot()
    if (!beforeSnapshot) {
      return
    }

    const afterSnapshot: CanvasEditSnapshot = {
      ...cloneCanvasEditSnapshot(beforeSnapshot),
      model: cloneModelSnapshot({ ...model, diagrams: result.nextDiagrams }),
      relationshipOverrides: result.nextRelOverrides,
      createdRelationships: cloneCreatedRelationships(result.nextCreatedRelationships),
      deletedConnectionIds: result.nextDeletedConnectionIds,
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
    if (!window.confirm('Удалить связь из модели? Она исчезнет на всех диаграммах.')) {
      return
    }

    const result = computeDeleteRelationshipFromModel(
      model,
      selectedRelationshipRef,
      relationshipOverrides,
    )
    if (!result) {
      return
    }

    setDeletedConnectionIds((prev) => {
      const next = new Set(prev)
      result.removedConnIds.forEach((id) => {
        if (originalConnectionIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })
    if (originalRelationshipIds.has(result.relationshipRef)) {
      setDeletedRelationshipIds((prev) => {
        const next = new Set(prev)
        next.add(result.relationshipRef)
        return next
      })
    }

    setCreatedRelationships((prev) =>
      prev.filter((cr) => cr.relationship.id !== result.relationshipRef),
    )

    commitRelationshipOverrides(result.nextRelOverrides)
    commitRelationshipMetaOverrides((prev) => {
      const next = new Map(prev)
      next.delete(result.relationshipRef)
      return next
    })
    setModel(result.nextModel)
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
    if (
      !window.confirm(
        'Удалить элемент из модели? Он будет убран со всех диаграмм; связи с этим элементом тоже удалятся.',
      )
    ) {
      return
    }

    const result = computeDeleteElementFromModel(
      model,
      elementId,
      diagramOverrides,
      relationshipOverrides,
      elementOverrides,
      relationshipMetaOverrides,
    )
    if (!result) {
      return
    }

    setDeletedDiagramNodeIds((prev) => {
      const next = new Set(prev)
      result.removedNodeIds.forEach((id) => {
        if (originalDiagramNodeIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })
    setDeletedElementIds((prev) => {
      const next = new Set(prev)
      if (originalElementIds.has(result.elementId)) {
        next.add(result.elementId)
      }
      return next
    })
    setDeletedRelationshipIds((prev) => {
      const next = new Set(prev)
      result.relsToRemoveIds.forEach((id) => {
        if (originalRelationshipIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })
    setDeletedConnectionIds((prev) => {
      const next = new Set(prev)
      result.removedConnIds.forEach((id) => {
        if (originalConnectionIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })

    setCreatedObjects((prev) =>
      prev.filter(
        (c) => c.element.id !== result.elementId && !result.removedNodeIds.has(c.node.id),
      ),
    )
    setCreatedRelationships((prev) =>
      prev.filter(
        (cr) =>
          !result.removedRelIds.has(cr.relationship.id) &&
          !result.removedNodeIds.has(cr.connection.source) &&
          !result.removedNodeIds.has(cr.connection.target),
      ),
    )

    setLinkCreateSourceId((sid) => (sid && result.removedNodeIds.has(sid) ? null : sid))

    commitDiagramOverrides(result.nextDiagramOverrides)
    commitRelationshipOverrides(result.nextRelOverrides)
    commitElementOverrides(result.nextElemOverrides)
    commitRelationshipMetaOverrides(result.nextRelMetaOverrides)
    setModel(result.nextModel)
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
  ])

  function updateRelationshipBendpoint(relationshipRef: string, bendpointIndex: number, bendpoint: Bendpoint) {
    if (!selectedDiagramId || !selectedDiagram) {
      return
    }
    const update = computeUpdateRelationshipBendpoint(
      selectedDiagram,
      selectedDiagramId,
      relationshipRef,
      bendpointIndex,
      bendpoint,
      relationshipOverrides,
    )
    if (!update) {
      return
    }
    commitRelationshipOverrides(update.nextOverrides)
    pushSnapshotCommand(
      'Перемещение точки перегиба',
      () => commitRelationshipOverrides(cloneBendpointMap(update.beforeOverrides)),
      () => commitRelationshipOverrides(cloneBendpointMap(update.nextOverrides)),
    )
  }

  function addRelationshipBendpoint(relationshipRef: string, segmentIndex: number, bendpoint: Bendpoint) {
    if (!selectedDiagramId || !selectedDiagram) {
      return
    }
    const update = computeAddRelationshipBendpoint(
      selectedDiagram,
      selectedDiagramId,
      relationshipRef,
      segmentIndex,
      bendpoint,
      relationshipOverrides,
    )
    if (!update) {
      return
    }
    const insertAt = update.selectedBendpointIndex ?? 0
    commitRelationshipOverrides(update.nextOverrides)
    setSelectedBendpointIndex(insertAt)
    pushSnapshotCommand(
      'Добавление точки перегиба',
      () => {
        commitRelationshipOverrides(cloneBendpointMap(update.beforeOverrides))
        setSelectedBendpointIndex(null)
      },
      () => {
        commitRelationshipOverrides(cloneBendpointMap(update.nextOverrides))
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
    const result = computeReassignRelationshipEndpoint(
      model,
      selectedDiagramId,
      relationshipRef,
      endpoint,
      newNodeId,
      relationshipOverrides,
      createdRelationships,
    )
    if (!result.ok) {
      if (result.reason === 'same-element') {
        window.alert('Укажите два разных элемента модели.')
      } else if (result.reason === 'duplicate') {
        window.alert('Между этими объектами на диаграмме уже есть связь.')
      }
      return
    }

    const beforeSnapshot = captureCurrentCanvasSnapshot()
    if (!beforeSnapshot) {
      return
    }

    const afterSnapshot: CanvasEditSnapshot = {
      ...cloneCanvasEditSnapshot(beforeSnapshot),
      model: cloneModelSnapshot(result.nextModel),
      relationshipOverrides: result.nextRelOverrides,
      createdRelationships: cloneCreatedRelationships(result.nextCreatedRelationships),
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
    moveNodes,
    resizeNode,
    updateNodeFillColor,
    updateDiagramMetadata,
    updateDiagramFolderMetadata,
    updateRelationshipMetaOverride,
    updateElementOverride,
    createNewObject,
    placeElementOnDiagram,
    placeDiagramReferenceOnDiagram,
    createNewDiagram,
    createNewDiagramFolder,
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
