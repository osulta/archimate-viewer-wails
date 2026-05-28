import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import './App.css'
import { AppHeader } from './components/app-header'
import { DiagramCanvas } from './components/diagram-canvas'
import { Sidebar } from './components/sidebar/sidebar'
import { ChangesComparePanel } from './components/changes/changes-compare-panel'
import { LintersPanel } from './components/linters/linters-panel'
import { AssetsPanel } from './components/assets/assets-panel'
import { AiArchitectPanel } from './components/ai-architect/ai-architect-panel'
import { ViewModePanel } from './components/view-mode/view-mode-panel'
import { ObjectPropertiesPanel } from './components/object-properties-panel'
import {
  collectElementRelationships,
  findDiagramIdForRelationship,
} from './lib/archimate/element-relationships'
import {
  applyRelationshipMetaToById,
  applyRelationshipMetaToList,
  isRelationshipModelElement,
} from './lib/archimate/relationship-meta'
import { AdminPanel } from './components/admin/admin-panel'
import { useGitIntegration } from './hooks/use-git-integration'
import { useSplitModelRuntime } from './hooks/use-split-model-runtime'
import { useUndoRedo } from './hooks/use-undo-redo'
import type { EditSnapshot } from './hooks/use-undo-redo'
import { parseModelFromLoadPayload } from './lib/archimate/parsing/index'
import { collectLoadedDiagramNodeIds } from './lib/archimate/split-model-client'
import { saveSplitModelChanges } from './lib/archimate/split-model-save'
import { generateArchimateModelId } from './lib/archimate/model-id'
import {
  getDirectChildByTag,
  getDirectChildrenByTag,
  applyDocumentationToElementXml,
  clearConnectionBendpoints,
  appendConnectionBendpoints,
} from './lib/archimate/xml-utils'
import { adjustBendpointsForNodeResize } from './lib/archimate/connection-geometry'
import {
  flattenNodes,
  applyOverridesToNodes,
  findInnermostContainingNode,
  insertNodeUnderParent,
  findNodeById,
  findNodeByElementRefInDiagram,
  removeDeletedFromXml,
  serializeXml,
  collectSubtreeIds,
  collectSubtreeElementRefs,
  removeNodeFromTree,
  removeDiagramObjectsByElementRef,
  collectNodeIdsRemovedForElement,
  collectElementRefsUsedInDiagrams,
  mapNodes,
  applyDiagramLayoutToXml,
  applyDiagramMetadataToXml,
  ensureCreatedDiagramsInXml,
  normalizeRelationshipType,
  formatDiagramCoord,
  roundDiagramCoord,
  snapToGrid,
} from './lib/archimate/diagram-model'
import type {
  ParsedModel,
  ParsedElement,
  ParsedDiagram,
  DiagramNode,
  Bendpoint,
  NodeOverride,
  ElementOverride,
  RelationshipMetaOverride,
  CreatedObject,
  CreatedRelationship,
  ModelLoadPayload,
  Point,
} from './types/model'

type AppTab = 'modeling' | 'changes' | 'linters' | 'assets' | 'aiArchitect' | 'viewMode' | 'admin'

function App() {
  const [model, setModel] = useState<ParsedModel | null>(null)
  const [error, setError] = useState('')
  const [selectedDiagramId, setSelectedDiagramId] = useState('')
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [selectedRelationshipRef, setSelectedRelationshipRef] = useState<string | null>(null)
  const [diagramOverrides, setDiagramOverrides] = useState<Map<string, Map<string, NodeOverride>>>(() => new Map())
  const [relationshipOverrides, setRelationshipOverrides] = useState<Map<string, Map<string, Bendpoint[]>>>(() => new Map())
  const [selectedBendpointIndex, setSelectedBendpointIndex] = useState<number | null>(null)
  const [elementOverrides, setElementOverrides] = useState<Map<string, ElementOverride>>(() => new Map())
  const [relationshipMetaOverrides, setRelationshipMetaOverrides] = useState<Map<string, RelationshipMetaOverride>>(() => new Map())
  const [createdObjects, setCreatedObjects] = useState<CreatedObject[]>([])
  const [createdRelationships, setCreatedRelationships] = useState<CreatedRelationship[]>([])
  const [createdDiagramIds, setCreatedDiagramIds] = useState<Set<string>>(() => new Set())
  const [pendingLinkType, setPendingLinkType] = useState<string | null>(null)
  const [linkCreateSourceId, setLinkCreateSourceId] = useState<string | null>(null)
  const linkCreateMode = Boolean(pendingLinkType)
  const [originalDiagramNodeIds, setOriginalDiagramNodeIds] = useState<Set<string>>(() => new Set())
  const [originalElementIds, setOriginalElementIds] = useState<Set<string>>(() => new Set())
  const [originalRelationshipIds, setOriginalRelationshipIds] = useState<Set<string>>(() => new Set())
  const [deletedDiagramNodeIds, setDeletedDiagramNodeIds] = useState<Set<string>>(() => new Set())
  const [deletedElementIds, setDeletedElementIds] = useState<Set<string>>(() => new Set())
  const [deletedRelationshipIds, setDeletedRelationshipIds] = useState<Set<string>>(() => new Set())
  const [deletedConnectionIds, setDeletedConnectionIds] = useState<Set<string>>(() => new Set())
  const [originalConnectionIds, setOriginalConnectionIds] = useState<Set<string>>(() => new Set())
  const [loadedXml, setLoadedXml] = useState('')
  const [loadedFilename, setLoadedFilename] = useState('model.archimate')
  const [objectPropsTab, setObjectPropsTab] = useState('details')
  const [appTab, setAppTab] = useState<AppTab>('modeling')
  const [compareDiagramId, setCompareDiagramId] = useState('')
  const getEditedModelXmlRef = useRef<() => string | null>(() => null)
  const pendingElementFocusRef = useRef<string | null>(null)
  const diagramOverridesRef = useRef<Map<string, Map<string, NodeOverride>>>(new Map())
  const relationshipOverridesRef = useRef<Map<string, Map<string, Bendpoint[]>>>(new Map())
  const elementOverridesRef = useRef<Map<string, ElementOverride>>(new Map())
  const relationshipMetaOverridesRef = useRef<Map<string, RelationshipMetaOverride>>(new Map())
  const dirtySplitDiagramIdsRef = useRef<Set<string>>(new Set())
  const [saveStatusMessage, setSaveStatusMessage] = useState('')
  const [modelSaving, setModelSaving] = useState(false)

  const undoRedo = useUndoRedo()

  const captureSnapshot = useCallback((): EditSnapshot => ({
    model,
    diagramOverrides,
    relationshipOverrides,
    elementOverrides,
    relationshipMetaOverrides,
    createdObjects,
    createdRelationships,
    createdDiagramIds,
    deletedElementIds,
    deletedRelationshipIds,
    deletedConnectionIds,
    deletedDiagramNodeIds: deletedDiagramNodeIds,
    selectedDiagramId,
    selectedElementId,
    selectedRelationshipRef,
  }), [
    model, diagramOverrides, relationshipOverrides, elementOverrides,
    relationshipMetaOverrides, createdObjects, createdRelationships,
    createdDiagramIds, deletedElementIds, deletedRelationshipIds,
    deletedConnectionIds, deletedDiagramNodeIds, selectedDiagramId,
    selectedElementId, selectedRelationshipRef,
  ])

  const restoreSnapshot = useCallback((snap: EditSnapshot) => {
    setModel(snap.model)
    setDiagramOverrides(snap.diagramOverrides)
    setRelationshipOverrides(snap.relationshipOverrides)
    setElementOverrides(snap.elementOverrides)
    setRelationshipMetaOverrides(snap.relationshipMetaOverrides)
    setCreatedObjects(snap.createdObjects)
    setCreatedRelationships(snap.createdRelationships)
    setCreatedDiagramIds(snap.createdDiagramIds)
    setDeletedElementIds(snap.deletedElementIds)
    setDeletedRelationshipIds(snap.deletedRelationshipIds)
    setDeletedConnectionIds(snap.deletedConnectionIds)
    setDeletedDiagramNodeIds(snap.deletedDiagramNodeIds)
    setSelectedDiagramId(snap.selectedDiagramId)
    setSelectedElementId(snap.selectedElementId)
    setSelectedRelationshipRef(snap.selectedRelationshipRef)
    setSelectedNode(null)
    setSelectedBendpointIndex(null)
    diagramOverridesRef.current = snap.diagramOverrides
    relationshipOverridesRef.current = snap.relationshipOverrides
    elementOverridesRef.current = snap.elementOverrides
    relationshipMetaOverridesRef.current = snap.relationshipMetaOverrides
  }, [])

  const saveForUndo = useCallback((label: string) => {
    undoRedo.saveBeforeMutation(label, captureSnapshot())
  }, [undoRedo, captureSnapshot])

  const performUndo = useCallback(() => {
    const snap = undoRedo.undo(captureSnapshot())
    if (snap) {
      restoreSnapshot(snap)
    }
  }, [undoRedo, captureSnapshot, restoreSnapshot])

  const performRedo = useCallback(() => {
    const snap = undoRedo.redo(captureSnapshot())
    if (snap) {
      restoreSnapshot(snap)
    }
  }, [undoRedo, captureSnapshot, restoreSnapshot])

  const commitDiagramOverrides = useCallback((updater: Map<string, Map<string, NodeOverride>> | ((prev: Map<string, Map<string, NodeOverride>>) => Map<string, Map<string, NodeOverride>>)) => {
    setDiagramOverrides((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      diagramOverridesRef.current = next
      return next
    })
  }, [])

  const commitRelationshipOverrides = useCallback((updater: Map<string, Map<string, Bendpoint[]>> | ((prev: Map<string, Map<string, Bendpoint[]>>) => Map<string, Map<string, Bendpoint[]>>)) => {
    setRelationshipOverrides((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      relationshipOverridesRef.current = next
      return next
    })
  }, [])

  const commitElementOverrides = useCallback((updater: Map<string, ElementOverride> | ((prev: Map<string, ElementOverride>) => Map<string, ElementOverride>)) => {
    setElementOverrides((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      elementOverridesRef.current = next
      return next
    })
  }, [])

  const commitRelationshipMetaOverrides = useCallback((updater: Map<string, RelationshipMetaOverride> | ((prev: Map<string, RelationshipMetaOverride>) => Map<string, RelationshipMetaOverride>)) => {
    setRelationshipMetaOverrides((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      relationshipMetaOverridesRef.current = next
      return next
    })
  }, [])

  const markSplitDiagramDirty = useCallback((diagramId: string) => {
    if (!diagramId) {
      return
    }
    const next = new Set(dirtySplitDiagramIdsRef.current)
    next.add(diagramId)
    dirtySplitDiagramIdsRef.current = next
  }, [])

  const resetSplitEditState = useCallback(() => {
    const emptyMap = new Map()
    const emptySet = new Set<string>()
    diagramOverridesRef.current = emptyMap
    relationshipOverridesRef.current = emptyMap
    elementOverridesRef.current = emptyMap
    relationshipMetaOverridesRef.current = emptyMap
    dirtySplitDiagramIdsRef.current = emptySet
    setDiagramOverrides(emptyMap)
    setRelationshipOverrides(emptyMap)
    setElementOverrides(emptyMap)
    setRelationshipMetaOverrides(emptyMap)
    undoRedo.clear()
  }, [undoRedo])

  const resetModelAfterRepoDelete = useCallback(() => {
    setModel(null)
    setSelectedDiagramId('')
    setSelectedNode(null)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    resetSplitEditState()
    setCreatedObjects([])
    setCreatedRelationships([])
    setCreatedDiagramIds(new Set())
    setPendingLinkType(null)
    setLinkCreateSourceId(null)
    setOriginalDiagramNodeIds(new Set())
    setOriginalElementIds(new Set())
    setOriginalRelationshipIds(new Set())
    setDeletedDiagramNodeIds(new Set())
    setDeletedElementIds(new Set())
    setDeletedRelationshipIds(new Set())
    setDeletedConnectionIds(new Set())
    setOriginalConnectionIds(new Set())
    setLoadedXml('')
    setLoadedFilename('model.archimate')
    setError('')
  }, [resetSplitEditState])

  const git = useGitIntegration({
    hasModel: Boolean(model),
    loadedFilename,
    getEditedModelXml: () => getEditedModelXmlRef.current?.() ?? null,
    onModelLoaded: (payload: ModelLoadPayload) => {
      applyParsedModelFromPayload(payload)
      setError('')
    },
    onModelSaved: (payload: ModelLoadPayload) => {
      try {
        applyParsedModelFromPayload(payload)
        setError('')
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error
            ? parseErr.message
            : String(parseErr)
        setError(`Файл записан на диск, но не удалось перечитать модель: ${msg}`)
      }
    },
    onModelParseError: (message: string) => setError(message),
    onRepositoryDeleted: resetModelAfterRepoDelete,
  })

  const splitRuntime = useSplitModelRuntime({
    model,
    setModel,
    selectedDiagramId,
    selectedElementId,
  })

  const selectedDiagram = useMemo(() => {
    if (!model || !selectedDiagramId) {
      return null
    }
    const original = model.diagrams.find((item) => item.id === selectedDiagramId) ?? null
    if (!original) {
      return null
    }
    const overrides = diagramOverrides.get(selectedDiagramId)
    const relOverrides = relationshipOverrides.get(selectedDiagramId)
    if (!overrides || overrides.size === 0) {
      if (!relOverrides || relOverrides.size === 0) {
        return original
      }
      return {
        ...original,
        connections: original.connections.map((c) => {
          const ov = relOverrides.get(c.relationshipRef)
          return ov !== undefined ? { ...c, bendpoints: ov } : c
        }),
      }
    }
    return {
      ...original,
      nodes: applyOverridesToNodes(original.nodes, overrides),
      connections: original.connections.map((c) => {
        const ov = relOverrides?.get(c.relationshipRef)
        return ov !== undefined ? { ...c, bendpoints: ov } : c
      }),
    }
  }, [model, selectedDiagramId, diagramOverrides, relationshipOverrides])

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
      saveForUndo('Удаление точки перегиба')
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

  function resetAfterFailedModelFile(caughtError: unknown) {
    setModel(null)
    setSelectedDiagramId('')
    setSelectedNode(null)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    resetSplitEditState()
    setCreatedObjects([])
    setCreatedRelationships([])
    setCreatedDiagramIds(new Set())
    setPendingLinkType(null)
    setLinkCreateSourceId(null)
    setOriginalDiagramNodeIds(new Set())
    setOriginalElementIds(new Set())
    setOriginalRelationshipIds(new Set())
    setDeletedDiagramNodeIds(new Set())
    setDeletedElementIds(new Set())
    setDeletedRelationshipIds(new Set())
    setDeletedConnectionIds(new Set())
    setOriginalConnectionIds(new Set())
    setLoadedXml('')
    setError(caughtError instanceof Error ? caughtError.message : 'Не удалось прочитать файл.')
  }

  function applyParsedModelFromPayload(payload: ModelLoadPayload) {
    const parsedModel = parseModelFromLoadPayload(payload)
    setModel(parsedModel)
    setError('')
    setSaveStatusMessage('')
    setSelectedDiagramId(parsedModel.diagrams[0]?.id ?? '')
    setSelectedNode(null)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    resetSplitEditState()
    setCreatedObjects([])
    setCreatedRelationships([])
    setCreatedDiagramIds(new Set())
    setPendingLinkType(null)
    setLinkCreateSourceId(null)
    setOriginalDiagramNodeIds(collectLoadedDiagramNodeIds(parsedModel.diagrams))
    setOriginalElementIds(new Set(parsedModel.elements.map((e) => e.id)))
    setOriginalRelationshipIds(new Set(parsedModel.relationships.map((r) => r.id)))
    setDeletedDiagramNodeIds(new Set())
    setDeletedElementIds(new Set())
    setDeletedRelationshipIds(new Set())
    setDeletedConnectionIds(new Set())
    const connectionIds = new Set<string>()
    parsedModel.diagrams.forEach((d) => {
      if (d.loaded) {
        d.connections.forEach((c) => connectionIds.add(c.id))
      }
    })
    setOriginalConnectionIds(connectionIds)
    setLoadedXml(
      payload.layout === 'split-files'
        ? ''
        : typeof payload.content === 'string'
          ? payload.content
          : '',
    )
    setLoadedFilename(
      payload.filename ||
        (payload.layout === 'split-files' ? 'model' : 'model.archimate'),
    )
  }

  function isSplitFilesModel(currentModel: ParsedModel | null): boolean {
    return currentModel?.format === 'split-files' || Boolean(currentModel?.modelRoot)
  }

  useEffect(() => {
    if (!selectedNode || !selectedDiagram) {
      return
    }
    const stillExists = findNodeById(selectedDiagram.nodes, selectedNode.id)
    if (!stillExists) {
      setSelectedNode(null)
    }
  }, [selectedDiagram, selectedNode])

  useEffect(() => {
    const elementId = pendingElementFocusRef.current
    if (!elementId || !model || model.format !== 'split-files' || !selectedDiagramId) {
      return
    }
    const node = splitRuntime.resolveElementOnDiagram(elementId, selectedDiagramId)
    if (!node) {
      return
    }
    setSelectedElementId(elementId)
    setSelectedNode(node)
    setSelectedRelationshipRef(null)
    pendingElementFocusRef.current = null
  }, [model, selectedDiagramId, splitRuntime])

  useEffect(() => {
    setPendingLinkType(null)
    setLinkCreateSourceId(null)
  }, [selectedDiagramId])

  useEffect(() => {
    if (!pendingLinkType) {
      return
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') {
        return
      }
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') {
        return
      }
      setLinkCreateSourceId((sourceId) => {
        if (sourceId) {
          return null
        }
        setPendingLinkType(null)
        return null
      })
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [pendingLinkType])

  function clearLinkCreation() {
    setPendingLinkType(null)
    setLinkCreateSourceId(null)
  }

  const handleSelectRelationshipType = useCallback((relationshipType: string) => {
    setPendingLinkType((current) => {
      if (current === relationshipType) {
        setLinkCreateSourceId(null)
        return null
      }
      setLinkCreateSourceId(null)
      setSelectedRelationshipRef(null)
      return relationshipType
    })
  }, [])

  const selectedElement = useMemo(() => {
    if (!model) {
      return null
    }
    const applyOverride = (element: ParsedElement | null) => {
      if (!element) {
        return null
      }
      const override = elementOverrides.get(element.id)
      if (!override) {
        return element
      }
      return {
        ...element,
        name: override.name ?? element.name,
        documentation:
          override.documentation !== undefined
            ? override.documentation
            : (element.documentation ?? ''),
        properties: override.properties ?? element.properties ?? [],
      }
    }
    if (selectedNode) {
      return applyOverride(model.elementById.get(selectedNode.elementRef) ?? null)
    }
    if (selectedElementId) {
      return applyOverride(model.elementById.get(selectedElementId) ?? null)
    }
    return null
  }, [selectedNode, selectedElementId, model, elementOverrides])

  const selectedNodeLive = useMemo(() => {
    if (!selectedNode || !selectedDiagram) {
      return selectedNode
    }
    return findNodeById(selectedDiagram.nodes, selectedNode.id) ?? selectedNode
  }, [selectedNode, selectedDiagram])

  const selectedElementRefForUsage =
    selectedNodeLive?.elementRef || selectedElementId || ''

  const diagramsUsingSelectedElement = useMemo(() => {
    if (!model || !selectedElementRefForUsage) {
      return []
    }
    const diagramIds =
      model.format === 'split-files'
        ? (model.diagramIndexByElementRef?.get(selectedElementRefForUsage) ?? [])
        : null
    const result: Array<{ diagram: ParsedDiagram; nodes: DiagramNode[] }> = []
    const diagramsToScan = diagramIds
      ? diagramIds
          .map((id) => model.diagrams.find((diagram) => diagram.id === id))
          .filter(Boolean) as ParsedDiagram[]
      : model.diagrams

    for (const diagram of diagramsToScan) {
      if (model.format === 'split-files' && !diagram.loaded) {
        continue
      }
      const nodes = flattenNodes(diagram.nodes).filter(
        (n) => n.elementRef === selectedElementRefForUsage,
      )
      if (nodes.length) {
        result.push({ diagram, nodes })
      }
    }
    return result
  }, [model, selectedElementRefForUsage])

  const selectedElementRelationships = useMemo(() => {
    if (!model || !selectedElementRefForUsage) {
      return []
    }
    return collectElementRelationships(
      selectedElementRefForUsage,
      applyRelationshipMetaToList(model.relationships, relationshipMetaOverrides),
    )
  }, [model, selectedElementRefForUsage, relationshipMetaOverrides])

  const handleSelectRelationshipFromProperties = useCallback(
    (relationshipId: string) => {
      if (!model || !relationshipId) {
        return
      }
      setSelectedNode(null)
      setSelectedElementId(null)
      setSelectedRelationshipRef(relationshipId)
      setSelectedBendpointIndex(null)
      const diagramId = findDiagramIdForRelationship(model, relationshipId)
      if (diagramId) {
        setSelectedDiagramId(diagramId)
      }
    },
    [model],
  )

  const handleSelectElementFromProperties = useCallback(
    (elementId: string) => {
      if (!model || !elementId) {
        return
      }
      setSelectedRelationshipRef(null)
      setSelectedElementId(elementId)
      setSelectedNode(null)
      for (const diagram of model.diagrams) {
        const hit = findNodeByElementRefInDiagram(diagram, elementId)
        if (hit) {
          setSelectedDiagramId(diagram.id)
          setSelectedNode(hit)
          return
        }
      }
    },
    [model],
  )

  useEffect(() => {
    setObjectPropsTab('details')
  }, [selectedElementRefForUsage])

  const relationshipByIdForUi = useMemo(() => {
    if (!model) {
      return new Map()
    }
    return applyRelationshipMetaToById(model.relationshipById, relationshipMetaOverrides)
  }, [model, relationshipMetaOverrides])

  const selectedRelationship = useMemo(() => {
    if (!selectedRelationshipRef) {
      return null
    }
    return relationshipByIdForUi.get(selectedRelationshipRef) ?? null
  }, [relationshipByIdForUi, selectedRelationshipRef])

  const elementByIdForCanvas = useMemo(() => {
    if (!model || !selectedDiagram) {
      return new Map()
    }

    const refs = new Set<string>()
    const collectRefs = (nodes: DiagramNode[]) => {
      for (const node of nodes ?? []) {
        if (node.elementRef) {
          refs.add(node.elementRef)
        }
        collectRefs(node.children)
      }
    }
    collectRefs(selectedDiagram.nodes)

    const next = new Map<string, ParsedElement>()
    for (const elementId of refs) {
      const base = model.elementById.get(elementId)
      if (!base) {
        continue
      }
      const override = elementOverrides.get(elementId)
      next.set(
        elementId,
        override
          ? {
              ...base,
              name: override.name ?? base.name,
              documentation:
                override.documentation !== undefined
                  ? override.documentation
                  : (base.documentation ?? ''),
              properties: override.properties ?? base.properties ?? [],
            }
          : base,
      )
    }
    return next
  }, [model, selectedDiagram, elementOverrides])

  function moveNode(diagramId: string, nodeId: string, dx: number, dy: number) {
    if (!diagramId || !nodeId || (dx === 0 && dy === 0)) {
      return
    }
    saveForUndo('Перемещение объекта')
    commitDiagramOverrides((prevAll) => {
      const overrides = prevAll.get(diagramId) ?? new Map()
      const prev = overrides.get(nodeId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
      const nextOverrides = new Map(overrides)
      nextOverrides.set(nodeId, {
        dx: roundDiagramCoord((prev.dx ?? 0) + dx),
        dy: roundDiagramCoord((prev.dy ?? 0) + dy),
        dw: prev.dw ?? 0,
        dh: prev.dh ?? 0,
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

    saveForUndo('Изменение размера объекта')
    commitDiagramOverrides((prevAll) => {
      const overrides = prevAll.get(diagramId) ?? new Map()
      const prev = overrides.get(nodeId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
      const nextOverrides = new Map(overrides)
      nextOverrides.set(nodeId, {
        dx: prev.dx ?? 0,
        dy: prev.dy ?? 0,
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

  const updateDiagramMetadata = useCallback(
    (diagramId: string, patch: Partial<ParsedDiagram>) => {
      if (!model || !diagramId) {
        return
      }
      const hasPatch = patch && Object.keys(patch).length > 0
      if (!hasPatch) {
        return
      }
      saveForUndo('Изменение диаграммы')
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

  const handleSelectDiagram = useCallback((diagramId: string) => {
    setSelectedDiagramId(diagramId)
    setSelectedNode(null)
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    setSelectedBendpointIndex(null)
  }, [])

  const updateRelationshipMetaOverride = useCallback((relationshipId: string, patch: Partial<RelationshipMetaOverride>) => {
    if (!relationshipId || !model) {
      return
    }
    const base = model.relationshipById.get(relationshipId)
    if (!base) {
      return
    }
    saveForUndo('Изменение связи')
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
    saveForUndo('Изменение элемента')
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
    saveForUndo('Создание элемента')
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
    saveForUndo('Размещение элемента на диаграмме')

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
    saveForUndo('Создание диаграммы')
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

      saveForUndo('Создание связи')
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

    saveForUndo('Удаление объекта с диаграммы')
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

    saveForUndo('Удаление связи с диаграммы')
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

    saveForUndo('Удаление связи из модели')
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

    saveForUndo('Удаление элемента из модели')
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }
      const t = event.target as HTMLElement
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      ) {
        return
      }
      const hasConnOnDiagram =
        Boolean(selectedRelationshipRef) &&
        Boolean(
          selectedDiagram?.connections.some(
            (c) => c.relationshipRef === selectedRelationshipRef,
          ),
        )
      if (hasConnOnDiagram && selectedBendpointIndex !== null) {
        const conn = selectedDiagram!.connections.find(
          (c) => c.relationshipRef === selectedRelationshipRef,
        )
        if (conn?.bendpoints?.[selectedBendpointIndex]) {
          event.preventDefault()
          removeRelationshipBendpoint(selectedRelationshipRef!, selectedBendpointIndex)
          return
        }
      }
      if (hasConnOnDiagram) {
        event.preventDefault()
        deleteSelectedConnectionFromDiagram()
        return
      }
      if (!selectedNodeLive || !selectedDiagramId) {
        return
      }
      event.preventDefault()
      deleteSelectedFromDiagram()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    selectedDiagram,
    selectedRelationshipRef,
    selectedNodeLive,
    selectedDiagramId,
    deleteSelectedFromDiagram,
    deleteSelectedConnectionFromDiagram,
    selectedBendpointIndex,
    removeRelationshipBendpoint,
  ])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      if (!mod || event.key.toLowerCase() !== 'z') {
        return
      }
      const t = event.target as HTMLElement
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      ) {
        return
      }
      event.preventDefault()
      if (event.shiftKey) {
        performRedo()
      } else {
        performUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [performUndo, performRedo])

  function buildEditedModelXml(): string | null {
    if (!model || isSplitFilesModel(model)) {
      return null
    }
    if (!loadedXml) {
      return null
    }
    const parser = new DOMParser()
    const documentNode = parser.parseFromString(loadedXml, 'application/xml')

    ensureCreatedDiagramsInXml(documentNode, model, createdDiagramIds)

    applyDiagramMetadataToXml(documentNode, model)
    applyDiagramLayoutToXml(documentNode, model, diagramOverrides)

    const allElements = Array.from(documentNode.getElementsByTagName('*'))
    relationshipOverrides.forEach((relMap) => {
      relMap.forEach((bendpoints, relationshipRef) => {
        const connectionElements = allElements.filter((el) => {
          const relAttr =
            el.getAttribute('archimateRelationship') ??
            el.getAttribute('relationshipRef') ??
            ''
          return relAttr === relationshipRef
        })
        connectionElements.forEach((el) => {
          clearConnectionBendpoints(el)
          appendConnectionBendpoints(el, documentNode, bendpoints)
        })
      })
    })

    relationshipMetaOverrides.forEach((override, relationshipId) => {
      const targets = allElements.filter((el) => {
        const id = el.getAttribute('id') ?? el.getAttribute('identifier') ?? ''
        return id === relationshipId && isRelationshipModelElement(el)
      })
      targets.forEach((el) => {
        if (override.name == null) {
          return
        }
        if (el.hasAttribute('name')) {
          el.setAttribute('name', override.name)
        } else {
          let nameNode = getDirectChildByTag(el, 'name')
          if (!nameNode) {
            nameNode = documentNode.createElement(el.prefix ? `${el.prefix}:name` : 'name')
            el.insertBefore(nameNode, el.firstChild)
          }
          nameNode.textContent = override.name
        }
      })
    })

    elementOverrides.forEach((override, elementId) => {
      const targets = allElements.filter((el) => {
        const id = el.getAttribute('id') ?? el.getAttribute('identifier') ?? ''
        return id === elementId
      })
      targets.forEach((el) => {
        if (override.name != null) {
          if (el.hasAttribute('name')) {
            el.setAttribute('name', override.name)
          } else {
            let nameNode = getDirectChildByTag(el, 'name')
            if (!nameNode) {
              nameNode = documentNode.createElement(el.prefix ? `${el.prefix}:name` : 'name')
              el.insertBefore(nameNode, el.firstChild)
            }
            nameNode.textContent = override.name
          }
        }

        if (override.properties) {
          getDirectChildrenByTag(el, 'property').forEach((p) => el.removeChild(p))
          override.properties.forEach((prop) => {
            const propNode = documentNode.createElement(
              el.prefix ? `${el.prefix}:property` : 'property',
            )
            if (prop.key) {
              propNode.setAttribute('key', prop.key)
            }
            propNode.setAttribute('value', prop.value ?? '')
            el.appendChild(propNode)
          })
        }

        if (Object.prototype.hasOwnProperty.call(override, 'documentation')) {
          applyDocumentationToElementXml(el, documentNode, override.documentation)
        }
      })
    })

    createdObjects.forEach((created) => {
      const { diagramId, element, node, format, existingElement } = created
      const diagram = model.diagrams.find((d) => d.id === diagramId)
      const diagramOverrideMap = diagramOverrides.get(diagramId)
      const layoutNodes =
        diagram && diagramOverrideMap?.size
          ? applyOverridesToNodes(diagram.nodes, diagramOverrideMap)
          : diagram?.nodes
      const layoutNode = layoutNodes ? findNodeById(layoutNodes, node.id) : null
      const nodeToWrite = layoutNode ?? node
      const elementOverride = elementOverrides.get(element.id)
      const elementToWrite = elementOverride
        ? {
            ...element,
            name: elementOverride.name ?? element.name,
            documentation:
              elementOverride.documentation !== undefined
                ? elementOverride.documentation
                : element.documentation,
            properties: elementOverride.properties ?? element.properties,
          }
        : element
      const all = Array.from(documentNode.getElementsByTagName('*'))

      if (format === 'archi-tool') {
        if (!existingElement) {
          const folderOther =
            all.find(
              (el) =>
                el.localName === 'folder' &&
                (el.getAttribute('type') ?? '') === 'other',
            ) ??
            all.find((el) => el.localName === 'folder')

          if (folderOther) {
            const elNode = documentNode.createElement(
              folderOther.prefix ? `${folderOther.prefix}:element` : 'element',
            )
            elNode.setAttribute('id', elementToWrite.id)
            elNode.setAttribute('name', elementToWrite.name)
            elNode.setAttribute('xsi:type', elementToWrite.type)
            if (elementToWrite.documentation?.trim()) {
              const docNode = documentNode.createElement(
                folderOther.prefix ? `${folderOther.prefix}:documentation` : 'documentation',
              )
              docNode.textContent = elementToWrite.documentation!
              elNode.appendChild(docNode)
            }
            folderOther.appendChild(elNode)
          }
        }

        const diagramEl = all.find(
          (el) =>
            el.localName === 'element' &&
            (el.getAttribute('id') ?? '') === diagramId,
        )
        if (diagramEl) {
          const childNode = documentNode.createElement(
            diagramEl.prefix ? `${diagramEl.prefix}:child` : 'child',
          )
          childNode.setAttribute('id', nodeToWrite.id)
          childNode.setAttribute('xsi:type', 'archimate:DiagramObject')
          childNode.setAttribute('archimateElement', elementToWrite.id)
          const bounds = documentNode.createElement(
            diagramEl.prefix ? `${diagramEl.prefix}:bounds` : 'bounds',
          )
          bounds.setAttribute('x', formatDiagramCoord(nodeToWrite.x))
          bounds.setAttribute('y', formatDiagramCoord(nodeToWrite.y))
          bounds.setAttribute('width', formatDiagramCoord(nodeToWrite.width))
          bounds.setAttribute('height', formatDiagramCoord(nodeToWrite.height))
          childNode.appendChild(bounds)
          diagramEl.appendChild(childNode)
        }
      } else {
        if (!existingElement) {
          const elementsContainer = all.find((el) => el.localName === 'elements')
          if (elementsContainer) {
            const elNode = documentNode.createElement(
              elementsContainer.prefix ? `${elementsContainer.prefix}:element` : 'element',
            )
            elNode.setAttribute('identifier', elementToWrite.id)
            elNode.setAttribute('xsi:type', elementToWrite.type)
            const nameNode = documentNode.createElement(
              elementsContainer.prefix ? `${elementsContainer.prefix}:name` : 'name',
            )
            nameNode.textContent = elementToWrite.name
            elNode.appendChild(nameNode)
            if (elementToWrite.documentation?.trim()) {
              const docNode = documentNode.createElement(
                elementsContainer.prefix
                  ? `${elementsContainer.prefix}:documentation`
                  : 'documentation',
              )
              docNode.textContent = elementToWrite.documentation!
              elNode.appendChild(docNode)
            }
            elementsContainer.appendChild(elNode)
          }
        }

        const viewNode = all.find(
          (el) =>
            el.localName === 'view' &&
            (el.getAttribute('identifier') ?? '') === diagramId,
        )
        if (viewNode) {
          const nodeEl = documentNode.createElement(
            viewNode.prefix ? `${viewNode.prefix}:node` : 'node',
          )
          nodeEl.setAttribute('identifier', nodeToWrite.id)
          nodeEl.setAttribute('elementRef', elementToWrite.id)
          nodeEl.setAttribute('xsi:type', 'Node')
          const bounds = documentNode.createElement(
            viewNode.prefix ? `${viewNode.prefix}:bounds` : 'bounds',
          )
          bounds.setAttribute('x', formatDiagramCoord(nodeToWrite.x))
          bounds.setAttribute('y', formatDiagramCoord(nodeToWrite.y))
          bounds.setAttribute('w', formatDiagramCoord(nodeToWrite.width))
          bounds.setAttribute('h', formatDiagramCoord(nodeToWrite.height))
          nodeEl.appendChild(bounds)
          viewNode.appendChild(nodeEl)
        }
      }
    })

    createdRelationships.forEach((cr) => {
      const { diagramId, relationship, connection, format } = cr
      const meta = relationshipMetaOverrides.get(relationship.id)
      const relationshipToWrite =
        meta?.name != null ? { ...relationship, name: meta.name } : relationship
      const all = Array.from(documentNode.getElementsByTagName('*'))

      if (format === 'archi-tool') {
        const relationsFolder = all.find(
          (el) => el.localName === 'folder' && (el.getAttribute('type') ?? '') === 'relations',
        )
        if (relationsFolder) {
          const relNode = documentNode.createElement(
            relationsFolder.prefix ? `${relationsFolder.prefix}:element` : 'element',
          )
          relNode.setAttribute('id', relationshipToWrite.id)
          relNode.setAttribute('xsi:type', relationshipToWrite.type)
          if (relationshipToWrite.name) {
            relNode.setAttribute('name', relationshipToWrite.name)
          }
          relNode.setAttribute('source', relationshipToWrite.source)
          relNode.setAttribute('target', relationshipToWrite.target)
          if (normalizeRelationshipType(relationshipToWrite.type).endsWith('AccessRelationship')) {
            relNode.setAttribute('accessType', '1')
          }
          relationsFolder.appendChild(relNode)
        }

        const sourceObj = all.find(
          (el) =>
            el.localName === 'child' && (el.getAttribute('id') ?? '') === connection.source,
        )
        if (sourceObj) {
          const connNode = documentNode.createElement(
            sourceObj.prefix ? `${sourceObj.prefix}:sourceConnection` : 'sourceConnection',
          )
          connNode.setAttribute('xsi:type', 'archimate:Connection')
          connNode.setAttribute('id', connection.id)
          connNode.setAttribute('source', connection.source)
          connNode.setAttribute('target', connection.target)
          connNode.setAttribute('archimateRelationship', connection.relationshipRef)
          sourceObj.appendChild(connNode)
        }
      } else {
        const relContainer = all.find((el) => el.localName === 'relationships')
        if (relContainer) {
          const relEl = documentNode.createElement(
            relContainer.prefix ? `${relContainer.prefix}:relationship` : 'relationship',
          )
          relEl.setAttribute('identifier', relationshipToWrite.id)
          relEl.setAttribute('xsi:type', relationshipToWrite.type)
          relEl.setAttribute('source', relationshipToWrite.source)
          relEl.setAttribute('target', relationshipToWrite.target)
          if (relationshipToWrite.name) {
            const nameN = documentNode.createElement(
              relContainer.prefix ? `${relContainer.prefix}:name` : 'name',
            )
            nameN.textContent = relationshipToWrite.name
            relEl.appendChild(nameN)
          }
          relContainer.appendChild(relEl)
        }

        const viewNode = all.find(
          (el) =>
            el.localName === 'view' && (el.getAttribute('identifier') ?? '') === diagramId,
        )
        if (viewNode) {
          const connEl = documentNode.createElement(
            viewNode.prefix ? `${viewNode.prefix}:connection` : 'connection',
          )
          connEl.setAttribute('identifier', connection.id)
          connEl.setAttribute('relationshipRef', connection.relationshipRef)
          connEl.setAttribute('source', connection.source)
          connEl.setAttribute('target', connection.target)
          viewNode.appendChild(connEl)
        }
      }
    })

    removeDeletedFromXml(
      documentNode,
      deletedDiagramNodeIds,
      deletedElementIds,
      deletedRelationshipIds,
      deletedConnectionIds,
    )

    return serializeXml(documentNode)
  }

  getEditedModelXmlRef.current = buildEditedModelXml

  function handleOpenCompareChanges() {
    if (!selectedDiagramId) {
      return
    }
    setCompareDiagramId(selectedDiagramId)
    setAppTab('changes')
  }

  async function handleReloadModel() {
    setError('')
    const result = await git.handleReloadModelFromFile()
    if (result?.ok) {
      return
    }
    if (result?.error) {
      setError(result.error)
    }
  }

  async function handleSaveEditedModel() {
    setError('')
    setSaveStatusMessage('')
    if (isSplitFilesModel(model)) {
      setModelSaving(true)
      try {
        const result = await saveSplitModelChanges({
          model: model!,
          diagramOverrides: diagramOverridesRef.current,
          relationshipOverrides: relationshipOverridesRef.current,
          relationshipMetaOverrides: relationshipMetaOverridesRef.current,
          elementOverrides: elementOverridesRef.current,
          dirtyDiagramIds: dirtySplitDiagramIdsRef.current,
          createdObjects,
          createdRelationships,
          createdDiagramIds,
        })
        if (result.written.length === 0) {
          setError('Нет изменений для сохранения в файлы модели.')
          return
        }
        dirtySplitDiagramIdsRef.current = new Set()
        setCreatedObjects([])
        setCreatedRelationships([])
        setCreatedDiagramIds(new Set())
        setModel((prev) => {
          if (!prev || prev.format !== 'split-files') {
            return prev
          }
          const elementById = new Map(prev.elementById)
          for (const [elementId, sourceFile] of Object.entries(result.newElementFiles ?? {})) {
            const element = elementById.get(elementId)
            if (element) {
              elementById.set(elementId, { ...element, sourceFile, lite: false })
            }
          }
          const relationshipById = new Map(prev.relationshipById)
          for (const [relationshipId, sourceFile] of Object.entries(
            result.newRelationshipFiles ?? {},
          )) {
            const relationship = relationshipById.get(relationshipId)
            if (relationship) {
              relationshipById.set(relationshipId, { ...relationship, sourceFile })
            }
          }
          const elements = prev.elements.map((item) => elementById.get(item.id) ?? item)
          const relationships = prev.relationships.map(
            (item) => relationshipById.get(item.id) ?? item,
          )
          const diagrams = prev.diagrams.map((diagram) => {
            const sourceFile = result.newDiagramFiles?.[diagram.id]
            if (!sourceFile) {
              return diagram
            }
            return { ...diagram, sourceFile, loaded: diagram.loaded ?? true }
          })
          return {
            ...prev,
            elements,
            relationships,
            diagrams,
            elementById,
            relationshipById,
          }
        })
        const preview = result.written.slice(0, 2).join(', ')
        const suffix = result.written.length > 2 ? ` и ещё ${result.written.length - 2}` : ''
        setSaveStatusMessage(`Сохранено файлов: ${result.written.length} (${preview}${suffix})`)
        return
      } catch (saveErr) {
        setError(saveErr instanceof Error ? saveErr.message : String(saveErr))
        return
      } finally {
        setModelSaving(false)
      }
    }
    const result = await git.handleSaveModelToGitFile()
    if (result?.ok) {
      return
    }
    if (result?.error) {
      setError(result.error)
    }
  }

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
    saveForUndo('Перемещение точки перегиба')
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
    saveForUndo('Добавление точки перегиба')
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

  return (
    <div className="app-shell">
      <AppHeader
        activeTab={appTab}
        onTabChange={(tab) => setAppTab(tab as AppTab)}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        undoLabel={undoRedo.undoLabel}
        redoLabel={undoRedo.redoLabel}
        onUndo={performUndo}
        onRedo={performRedo}
      />
      <div className="app-body">
        {appTab === 'modeling' ? (
          <div className="layout">
      <Sidebar
        git={git}
        model={model}
        error={error}
        elementOverrides={elementOverrides}
        relationshipMetaOverrides={relationshipMetaOverrides}
        selectedElementId={selectedElementId}
        selectedRelationshipRef={selectedRelationshipRef}
        selectedDiagramId={selectedDiagramId}
        activeRelationshipType={pendingLinkType}
        linkCreateSourceId={linkCreateSourceId}
        onSelectRelationshipType={handleSelectRelationshipType}
        onReloadModel={handleReloadModel}
        onSaveEditedModel={handleSaveEditedModel}
        canSaveModel={Boolean(model)}
        modelLayoutHint={
          git.modelLayout === 'split-files'
            ? 'Модель: множество XML (split). Сохраняются изменённые файлы.'
            : ''
        }
        saveTargetPath={
          git.modelLayout === 'split-files'
            ? git.gitRepoPath ?? undefined
            : git.buildRepoModelWriteRelativePath() ?? undefined
        }
        saveStatusMessage={saveStatusMessage}
        modelActionLoading={git.gitCommandLoading}
        modelLoading={git.modelLoading || splitRuntime.isDiagramLoading}
        modelSaving={modelSaving}
        focusElementInDiagram={
          model?.format === 'split-files' ? splitRuntime.focusElementInDiagram : undefined
        }
        focusRelationshipInDiagram={
          model?.format === 'split-files' ? splitRuntime.focusRelationshipInDiagram : undefined
        }
        onCreateDiagram={createNewDiagram}
        onSelectElement={(elementId, found) => {
          setSelectedRelationshipRef(null)
          if (found?.pending) {
            pendingElementFocusRef.current = elementId
            setSelectedDiagramId(found.diagramId)
            setSelectedElementId(elementId)
            setSelectedNode(null)
            return
          }
          setSelectedElementId(elementId)
          setSelectedNode(null)
          if (found?.node) {
            setSelectedDiagramId(found.diagramId)
            setSelectedNode(found.node)
          }
        }}
        onSelectRelationship={(relationshipId, diagramId) => {
          setSelectedNode(null)
          setSelectedElementId(null)
          setSelectedRelationshipRef(relationshipId)
          setSelectedBendpointIndex(null)
          if (diagramId) {
            setSelectedDiagramId(diagramId)
          }
        }}
        onSelectDiagram={handleSelectDiagram}
      />

      <main className="content">
        <div className="content-head">
          <div className="content-head-text">
            <h2>{selectedDiagram?.name ?? 'Диаграмма не выбрана'}</h2>
            <p>{selectedDiagram?.type ?? 'Canvas preview'}</p>
          </div>
          {selectedDiagramId && model ? (
            <button
              type="button"
              className="content-compare-link"
              onClick={handleOpenCompareChanges}
            >
              Сравнение изменений
            </button>
          ) : null}
        </div>
        {splitRuntime.diagramLoadingId &&
        splitRuntime.diagramLoadingId === selectedDiagramId ? (
          <p className="content-diagram-loader" role="status" aria-live="polite">
            <span className="sidebar-model-loader-spinner" aria-hidden="true" />
            Загрузка диаграммы…
          </p>
        ) : null}
        <DiagramCanvas
          diagram={selectedDiagram?.loaded === false ? null : selectedDiagram}
          diagramExportName={selectedDiagram?.name}
          elementById={elementByIdForCanvas}
          relationshipById={relationshipByIdForUi}
          selectedNodeId={selectedNode?.id ?? ''}
          selectedRelationshipRef={selectedRelationshipRef}
          linkCreateMode={linkCreateMode}
          linkCreateSourceId={linkCreateSourceId}
          onNodeSelect={(node) => {
            setSelectedNode(node)
            setSelectedElementId(node?.elementRef ?? null)
            if (node && !linkCreateMode) {
              setSelectedRelationshipRef(null)
              setSelectedBendpointIndex(null)
            }
          }}
          onNodeMove={(nodeId, dx, dy) => moveNode(selectedDiagramId, nodeId, dx, dy)}
          onNodeResize={(nodeId, dw, dh) => resizeNode(selectedDiagramId, nodeId, dw, dh)}
          onRelationshipSelect={(ref) => {
            setSelectedRelationshipRef(ref)
            setSelectedBendpointIndex(null)
            if (ref) {
              setSelectedNode(null)
              setSelectedElementId(null)
            }
          }}
          selectedBendpointIndex={selectedBendpointIndex}
          onBendpointSelect={setSelectedBendpointIndex}
          onRelationshipBendpointChange={updateRelationshipBendpoint}
          onRelationshipBendpointAdd={addRelationshipBendpoint}
          onRelationshipBendpointRemove={removeRelationshipBendpoint}
          onLinkNodePick={pickLinkNode}
          onDropElementAtPoint={(elementId, x, y) => placeElementOnDiagram(elementId, { x, y })}
          onDropNewElementAtPoint={(elementType, x, y) => createNewObject(elementType, { x, y })}
          onDropNewRelationshipAtPoint={handleDropNewRelationshipAtPoint}
        />
        {(selectedRelationshipRef && selectedRelationship) ||
        selectedNodeLive ||
        selectedElementId ||
        (selectedDiagramId && selectedDiagram) ? (
          <ObjectPropertiesPanel
            selectedRelationshipRef={selectedRelationshipRef}
            selectedRelationship={selectedRelationship}
            selectedNodeLive={selectedNodeLive}
            selectedElementId={selectedElementId}
            selectedElement={selectedElement}
            selectedDiagram={selectedDiagram}
            selectedDiagramId={selectedDiagramId}
            onUpdateDiagramMetadata={updateDiagramMetadata}
            selectedElementRelationships={selectedElementRelationships}
            diagramsUsingSelectedElement={diagramsUsingSelectedElement}
            objectPropsTab={objectPropsTab}
            onObjectPropsTabChange={setObjectPropsTab}
            elementById={model?.elementById}
            elementOverrides={elementOverrides}
            onUpdateElementOverride={updateElementOverride}
            onUpdateRelationshipMeta={updateRelationshipMetaOverride}
            onDeleteSelectedConnectionFromDiagram={deleteSelectedConnectionFromDiagram}
            onDeleteRelationshipFromModel={deleteRelationshipFromModel}
            onDeleteSelectedFromDiagram={deleteSelectedFromDiagram}
            onDeleteElementFromModel={deleteElementFromModel}
            onSelectRelationshipFromProperties={handleSelectRelationshipFromProperties}
            onSelectElementFromProperties={handleSelectElementFromProperties}
            onNavigateToDiagram={({ diagramId, nodes }) => {
              setSelectedDiagramId(diagramId)
              setSelectedNode(nodes[0] ?? null)
              setSelectedElementId(selectedElementRefForUsage)
              setSelectedRelationshipRef(null)
            }}
          />
        ) : (
          <p className="props-empty">
            Выберите диаграмму, объект или связь, чтобы увидеть свойства.
          </p>
        )}
      </main>
          </div>
        ) : null}
        {appTab === 'changes' ? (
          <ChangesComparePanel
            model={model}
            selectedDiagramId={compareDiagramId}
            onSelectedDiagramIdChange={setCompareDiagramId}
            diagramOverrides={diagramOverrides}
            relationshipOverrides={relationshipOverrides}
            git={git}
            modelPath={git.buildRepoModelWriteRelativePath()}
            ensureDiagramLoaded={
              model?.format === 'split-files' ? splitRuntime.ensureDiagramLoaded : undefined
            }
          />
        ) : null}
        {appTab === 'linters' ? <LintersPanel model={model} /> : null}
        {appTab === 'assets' ? <AssetsPanel /> : null}
        {appTab === 'aiArchitect' ? <AiArchitectPanel /> : null}
        {appTab === 'viewMode' ? (
          <ViewModePanel
            model={model}
            modelLoading={git.modelLoading || splitRuntime.isDiagramLoading}
            focusElementInDiagram={
              model?.format === 'split-files' ? splitRuntime.focusElementInDiagram : undefined
            }
            focusRelationshipInDiagram={
              model?.format === 'split-files' ? splitRuntime.focusRelationshipInDiagram : undefined
            }
            error={error}
            elementOverrides={elementOverrides}
            relationshipMetaOverrides={relationshipMetaOverrides}
            selectedElementId={selectedElementId}
            selectedRelationshipRef={selectedRelationshipRef}
            selectedDiagramId={selectedDiagramId}
            selectedDiagram={selectedDiagram}
            elementByIdForCanvas={elementByIdForCanvas}
            selectedNodeLive={selectedNodeLive}
            selectedElement={selectedElement}
            selectedRelationship={selectedRelationship}
            selectedElementRefForUsage={selectedElementRefForUsage}
            diagramsUsingSelectedElement={diagramsUsingSelectedElement}
            selectedElementRelationships={selectedElementRelationships}
            onSelectRelationshipFromProperties={handleSelectRelationshipFromProperties}
            onSelectElementFromProperties={handleSelectElementFromProperties}
            onCanvasNodeSelect={(node) => {
              setSelectedNode(node)
              setSelectedElementId(node?.elementRef ?? null)
              if (node) {
                setSelectedRelationshipRef(null)
              }
            }}
            onCanvasRelationshipSelect={(ref) => {
              setSelectedRelationshipRef(ref)
              if (ref) {
                setSelectedNode(null)
                setSelectedElementId(null)
              }
            }}
            onNavigateToDiagram={({ diagramId, node, elementId }) => {
              setSelectedDiagramId(diagramId)
              setSelectedNode(node ?? null)
              setSelectedElementId(elementId)
              setSelectedRelationshipRef(null)
            }}
            onSelectElement={(elementId, found) => {
              setSelectedRelationshipRef(null)
              if (found?.pending) {
                pendingElementFocusRef.current = elementId
                setSelectedDiagramId(found.diagramId)
                setSelectedElementId(elementId)
                setSelectedNode(null)
                return
              }
              setSelectedElementId(elementId)
              setSelectedNode(null)
              if (found?.node) {
                setSelectedDiagramId(found.diagramId)
                setSelectedNode(found.node)
              }
            }}
            onSelectRelationship={(relationshipId, diagramId) => {
              setSelectedNode(null)
              setSelectedElementId(null)
              setSelectedRelationshipRef(relationshipId)
              setSelectedBendpointIndex(null)
              if (diagramId) {
                setSelectedDiagramId(diagramId)
              }
            }}
            onSelectDiagram={handleSelectDiagram}
          />
        ) : null}
        {appTab === 'admin' ? <AdminPanel git={git} /> : null}
      </div>
    </div>
  )
}

export default App
