import { useCallback } from 'react'
import { adjustBendpointsForNodeResize } from '../../lib/archimate/connection-geometry'
import { generateArchimateModelId } from '../../lib/archimate/model-id'
import {
  flattenNodes,
  applyOverridesToNodes,
  findInnermostContainingNode,
  insertNodeUnderParent,
  findNodeById,
  collectSubtreeIds,
  collectSubtreeElementRefs,
  removeNodeFromTree,
  removeDiagramObjectsByElementRef,
  collectNodeIdsRemovedForElement,
  collectElementRefsUsedInDiagrams,
  roundDiagramCoord,
  snapToGrid,
} from '../../lib/archimate/diagram-model'
import { isSplitFilesModel } from '../../lib/model-editor/is-split-files-model'
import type {
  ParsedDiagram,
  ParsedElement,
  DiagramNode,
  Bendpoint,
  NodeOverride,
  ElementOverride,
  RelationshipMetaOverride,
  Point,
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
}

interface UseModelMutationsOptions {
  editState: ModelEditState
  selection: ModelSelectionState
}

export function useModelMutations({ editState, selection }: UseModelMutationsOptions): ModelMutations {
  const {
    model, setModel,
    diagramOverrides, relationshipOverrides, elementOverrides, relationshipMetaOverrides,
    setCreatedObjects, setCreatedRelationships, setCreatedDiagramIds,
    originalDiagramNodeIds, originalElementIds, originalRelationshipIds, originalConnectionIds,
    setDeletedDiagramNodeIds, setDeletedElementIds, setDeletedRelationshipIds, setDeletedConnectionIds,
    pendingLinkType, linkCreateSourceId, setLinkCreateSourceId, setPendingLinkType,
    commitDiagramOverrides, commitRelationshipOverrides, commitElementOverrides,
    commitRelationshipMetaOverrides, markSplitDiagramDirty, clearLinkCreation,
    saveForUndo,
  } = editState

  const {
    selectedDiagramId, setSelectedDiagramId,
    setSelectedNode, setSelectedElementId,
    selectedElementId,
    selectedRelationshipRef, setSelectedRelationshipRef,
    setSelectedBendpointIndex,
    selectedDiagram, selectedElement, selectedNodeLive,
    getSelectionSnapshot,
  } = selection

  const saveUndo = (label: string) => saveForUndo(label, getSelectionSnapshot())

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
      saveUndo('Удаление точки перегиба')
      nextBendpoints.splice(bendpointIndex, 1)
      const diagramMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
      diagramMap.set(relationshipRef, nextBendpoints)
      const all = new Map(relationshipOverrides)
      all.set(selectedDiagramId, diagramMap)
      commitRelationshipOverrides(all)
      setSelectedBendpointIndex(null)
    },
    [selectedDiagramId, selectedDiagram, relationshipOverrides],
  )

  function moveNode(diagramId: string, nodeId: string, dx: number, dy: number) {
    if (!diagramId || !nodeId || (dx === 0 && dy === 0)) {
      return
    }
    saveUndo('Перемещение объекта')
    commitDiagramOverrides((prevAll) => {
      const overrides = prevAll.get(diagramId) ?? new Map()
      const prev = overrides.get(nodeId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
      const nextOverrides = new Map(overrides)
      nextOverrides.set(nodeId, {
        ...prev,
        dx: roundDiagramCoord((prev.dx ?? 0) + dx),
        dy: roundDiagramCoord((prev.dy ?? 0) + dy),
      })
      const nextAll = new Map(prevAll)
      nextAll.set(diagramId, nextOverrides)
      return nextAll
    })
    if (isSplitFilesModel(model)) {
      markSplitDiagramDirty(diagramId)
    }
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

    saveUndo('Изменение размера объекта')
    commitDiagramOverrides((prevAll) => {
      const overrides = prevAll.get(diagramId) ?? new Map()
      const prev = overrides.get(nodeId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
      const nextOverrides = new Map(overrides)
      nextOverrides.set(nodeId, {
        ...prev,
        dw: (prev.dw ?? 0) + appliedDw,
        dh: (prev.dh ?? 0) + appliedDh,
      })
      const nextAll = new Map(prevAll)
      nextAll.set(diagramId, nextOverrides)
      return nextAll
    })

    commitRelationshipOverrides((prevAll) => {
      const relMap = new Map(prevAll.get(diagramId) ?? new Map())
      let changed = false
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
        changed = true
      })
      if (!changed) {
        return prevAll
      }
      const nextAll = new Map(prevAll)
      nextAll.set(diagramId, relMap)
      return nextAll
    })
    if (isSplitFilesModel(model)) {
      markSplitDiagramDirty(diagramId)
    }
  }

  const updateNodeFillColor = useCallback(
    (diagramId: string, nodeId: string, fillColor: string | null) => {
      if (!diagramId || !nodeId) {
        return
      }
      saveUndo('Изменение фона объекта')
      commitDiagramOverrides((prevAll) => {
        const overrides = prevAll.get(diagramId) ?? new Map()
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
        const nextAll = new Map(prevAll)
        nextAll.set(diagramId, nextOverrides)
        return nextAll
      })
      if (isSplitFilesModel(model)) {
        markSplitDiagramDirty(diagramId)
      }
    },
    [commitDiagramOverrides, markSplitDiagramDirty, model, saveForUndo],
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
      saveUndo('Изменение диаграммы')
      setModel({
        ...model,
        diagrams: model.diagrams.map((diagram) =>
          diagram.id === diagramId ? { ...diagram, ...patch } : diagram,
        ),
      })
      markSplitDiagramDirty(diagramId)
    },
    [model, markSplitDiagramDirty, saveForUndo],
  )

  const updateRelationshipMetaOverride = useCallback((relationshipId: string, patch: Partial<RelationshipMetaOverride>) => {
    if (!relationshipId || !model) {
      return
    }
    const base = model.relationshipById.get(relationshipId)
    if (!base) {
      return
    }
    saveUndo('Изменение связи')
    const prev = relationshipMetaOverrides.get(relationshipId) ?? {
      name: base.name,
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
    saveUndo('Изменение элемента')
    const prev = elementOverrides.get(elementId) ?? {
      name: base.name,
      documentation: base.documentation ?? '',
      properties: [...(base.properties ?? [])],
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
    saveUndo('Создание элемента')
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

    setModel({
      ...model,
      elements: nextElements,
      diagrams: nextDiagrams,
      elementById: nextElementById,
    })
    markSplitDiagramDirty(selectedDiagramId)
    setCreatedObjects((prev) => [
      ...prev,
      { diagramId: selectedDiagramId, element: newElement, node: newNode, format: model.format },
    ])
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
    saveUndo('Размещение элемента на диаграмме')

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

    setModel({
      ...model,
      diagrams: nextDiagrams,
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
    setSelectedNode(newNode)
    setSelectedElementId(elementId)
    setSelectedRelationshipRef(null)
    clearLinkCreation()
  }

  function createNewDiagram(nameOverride = '') {
    if (!model) {
      return
    }
    saveUndo('Создание диаграммы')
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

      saveUndo('Создание связи')
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
        'Удалить объект с диаграммы (включая вложенные), неиспользуемые элементы модели и связанные связи?',
      )
    ) {
      return
    }

    saveUndo('Удаление объекта с диаграммы')
    const root = selectedNodeLive
    const subtreeIds = new Set(collectSubtreeIds(root))
    const subtreeRefs = collectSubtreeElementRefs(root)

    const draftDiagrams = model.diagrams.map((d) => {
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

    const usedRefs = collectElementRefsUsedInDiagrams(draftDiagrams)
    const elementsToRemove = [...subtreeRefs].filter((ref) => ref && !usedRefs.has(ref))
    const removedElementSet = new Set(elementsToRemove)

    const relationshipsToRemove = model.relationships.filter(
      (r) => removedElementSet.has(r.source) || removedElementSet.has(r.target),
    )
    const removedRelIds = new Set(relationshipsToRemove.map((r) => r.id))

    const nextDiagrams = draftDiagrams.map((d) => ({
      ...d,
      connections: d.connections.filter((c) => !removedRelIds.has(c.relationshipRef)),
    }))

    const nextElements = model.elements.filter((e) => !removedElementSet.has(e.id))
    const nextElementById = new Map(model.elementById)
    elementsToRemove.forEach((id) => nextElementById.delete(id))

    const nextRelationships = model.relationships.filter((r) => !removedRelIds.has(r.id))
    const nextRelationshipById = new Map(model.relationshipById)
    removedRelIds.forEach((id) => nextRelationshipById.delete(id))

    const nextDiagramOverrides = new Map(diagramOverrides)
    const diagramOv = diagramOverrides.get(selectedDiagramId)
    if (diagramOv?.size) {
      const nextOv = new Map(diagramOv)
      subtreeIds.forEach((id) => nextOv.delete(id))
      nextDiagramOverrides.set(selectedDiagramId, nextOv)
    }

    const nextRelOverrides = new Map<string, Map<string, Bendpoint[]>>()
    relationshipOverrides.forEach((relMap, diagramId) => {
      const diagram = nextDiagrams.find((x) => x.id === diagramId)
      const validRefs = new Set(diagram!.connections.map((c) => c.relationshipRef))
      const nextMap = new Map<string, Bendpoint[]>()
      relMap.forEach((bendpoints, ref) => {
        if (validRefs.has(ref)) {
          nextMap.set(ref, bendpoints)
        }
      })
      nextRelOverrides.set(diagramId, nextMap)
    })

    const nextElemOverrides = new Map(elementOverrides)
    elementsToRemove.forEach((id) => nextElemOverrides.delete(id))

    const nextRelMetaOverrides = new Map(relationshipMetaOverrides)
    removedRelIds.forEach((id) => nextRelMetaOverrides.delete(id))

    setDeletedDiagramNodeIds((prev) => {
      const next = new Set(prev)
      subtreeIds.forEach((id) => {
        if (originalDiagramNodeIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })
    setDeletedElementIds((prev) => {
      const next = new Set(prev)
      elementsToRemove.forEach((id) => {
        if (originalElementIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })
    setDeletedRelationshipIds((prev) => {
      const next = new Set(prev)
      relationshipsToRemove.forEach((r) => {
        if (originalRelationshipIds.has(r.id)) {
          next.add(r.id)
        }
      })
      return next
    })

    setCreatedObjects((prev) => prev.filter((c) => !subtreeIds.has(c.node.id)))

    setCreatedRelationships((prev) =>
      prev.filter(
        (cr) =>
          !removedRelIds.has(cr.relationship.id) &&
          (cr.diagramId !== selectedDiagramId ||
            (!subtreeIds.has(cr.connection.source) && !subtreeIds.has(cr.connection.target))),
      ),
    )

    commitDiagramOverrides(nextDiagramOverrides)
    commitRelationshipOverrides(nextRelOverrides)
    commitElementOverrides(nextElemOverrides)
    commitRelationshipMetaOverrides(nextRelMetaOverrides)
    markSplitDiagramDirty(selectedDiagramId)

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
    selectedDiagramId,
    selectedNodeLive,
    markSplitDiagramDirty,
    diagramOverrides,
    relationshipOverrides,
    relationshipMetaOverrides,
    elementOverrides,
    originalDiagramNodeIds,
    originalElementIds,
    originalRelationshipIds,
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

    saveUndo('Удаление связи с диаграммы')
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

    const stillUsed = nextDiagrams.some((d) =>
      d.connections.some((c) => c.relationshipRef === ref),
    )

    let nextRelationships = model.relationships
    let nextRelationshipById = model.relationshipById
    if (!stillUsed) {
      nextRelationships = model.relationships.filter((r) => r.id !== ref)
      nextRelationshipById = new Map(model.relationshipById)
      nextRelationshipById.delete(ref)
    }

    const relMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
    relMap.delete(ref)
    const nextRelOverrides = new Map(relationshipOverrides)
    nextRelOverrides.set(selectedDiagramId, relMap)

    setDeletedConnectionIds((prev) => {
      const next = new Set(prev)
      removedConnIds.forEach((id) => {
        if (originalConnectionIds.has(id)) {
          next.add(id)
        }
      })
      return next
    })

    if (!stillUsed && originalRelationshipIds.has(ref)) {
      setDeletedRelationshipIds((prev) => {
        const next = new Set(prev)
        next.add(ref)
        return next
      })
    }

    setCreatedRelationships((prev) =>
      prev.filter((cr) => {
        if (removedConnIds.includes(cr.connection.id)) {
          return false
        }
        if (!stillUsed && cr.relationship.id === ref) {
          return false
        }
        return true
      }),
    )

    commitRelationshipOverrides(nextRelOverrides)
    setModel({
      ...model,
      diagrams: nextDiagrams,
      relationships: nextRelationships,
      relationshipById: nextRelationshipById,
    })
    setSelectedRelationshipRef(null)
  }, [
    model,
    selectedDiagramId,
    selectedRelationshipRef,
    relationshipOverrides,
    originalConnectionIds,
    originalRelationshipIds,
  ])

  const deleteRelationshipFromModel = useCallback(() => {
    if (!model || !selectedRelationshipRef) {
      return
    }
    const ref = selectedRelationshipRef
    if (!window.confirm('Удалить связь из модели? Она исчезнет на всех диаграммах.')) {
      return
    }

    saveUndo('Удаление связи из модели')
    const removedConnIds: string[] = []
    model.diagrams.forEach((d) => {
      d.connections.forEach((c) => {
        if (c.relationshipRef === ref) {
          removedConnIds.push(c.id)
        }
      })
    })

    const nextDiagrams = model.diagrams.map((d) => ({
      ...d,
      connections: d.connections.filter((c) => c.relationshipRef !== ref),
    }))
    const nextRelationships = model.relationships.filter((r) => r.id !== ref)
    const nextRelationshipById = new Map(model.relationshipById)
    nextRelationshipById.delete(ref)

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
    }

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

    saveUndo('Удаление элемента из модели')
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
    saveUndo('Перемещение точки перегиба')
    nextBendpoints[bendpointIndex] = bendpoint
    const diagramMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
    diagramMap.set(relationshipRef, nextBendpoints)
    const all = new Map(relationshipOverrides)
    all.set(selectedDiagramId, diagramMap)
    commitRelationshipOverrides(all)
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
    saveUndo('Добавление точки перегиба')
    const nextBendpoints = [...(currentConnection.bendpoints ?? [])]
    const insertAt = Math.max(0, Math.min(nextBendpoints.length, segmentIndex))
    nextBendpoints.splice(insertAt, 0, bendpoint)
    const diagramMap = new Map(relationshipOverrides.get(selectedDiagramId) ?? new Map())
    diagramMap.set(relationshipRef, nextBendpoints)
    const all = new Map(relationshipOverrides)
    all.set(selectedDiagramId, diagramMap)
    commitRelationshipOverrides(all)
    setSelectedBendpointIndex(insertAt)
  }

  return {
    moveNode,
    resizeNode,
    updateNodeFillColor,
    updateDiagramMetadata,
    updateRelationshipMetaOverride,
    updateElementOverride,
    createNewObject,
    placeElementOnDiagram,
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
  }
}
