import { useRef, useState, useCallback } from 'react'
import type {
  ParsedModel,
  NodeOverride,
  Bendpoint,
  ElementOverride,
  RelationshipMetaOverride,
  CreatedObject,
  CreatedRelationship,
} from '../../types/model'

export interface ModelEditState {
  model: ParsedModel | null
  setModel: React.Dispatch<React.SetStateAction<ParsedModel | null>>
  error: string
  setError: React.Dispatch<React.SetStateAction<string>>
  diagramOverrides: Map<string, Map<string, NodeOverride>>
  relationshipOverrides: Map<string, Map<string, Bendpoint[]>>
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  createdObjects: CreatedObject[]
  setCreatedObjects: React.Dispatch<React.SetStateAction<CreatedObject[]>>
  createdRelationships: CreatedRelationship[]
  setCreatedRelationships: React.Dispatch<React.SetStateAction<CreatedRelationship[]>>
  createdDiagramIds: Set<string>
  setCreatedDiagramIds: React.Dispatch<React.SetStateAction<Set<string>>>
  pendingLinkType: string | null
  setPendingLinkType: React.Dispatch<React.SetStateAction<string | null>>
  linkCreateSourceId: string | null
  setLinkCreateSourceId: React.Dispatch<React.SetStateAction<string | null>>
  linkCreateMode: boolean
  originalDiagramNodeIds: Set<string>
  setOriginalDiagramNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>
  originalElementIds: Set<string>
  setOriginalElementIds: React.Dispatch<React.SetStateAction<Set<string>>>
  originalRelationshipIds: Set<string>
  setOriginalRelationshipIds: React.Dispatch<React.SetStateAction<Set<string>>>
  deletedDiagramNodeIds: Set<string>
  setDeletedDiagramNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>
  deletedElementIds: Set<string>
  setDeletedElementIds: React.Dispatch<React.SetStateAction<Set<string>>>
  deletedRelationshipIds: Set<string>
  setDeletedRelationshipIds: React.Dispatch<React.SetStateAction<Set<string>>>
  deletedConnectionIds: Set<string>
  setDeletedConnectionIds: React.Dispatch<React.SetStateAction<Set<string>>>
  originalConnectionIds: Set<string>
  setOriginalConnectionIds: React.Dispatch<React.SetStateAction<Set<string>>>
  loadedXml: string
  setLoadedXml: React.Dispatch<React.SetStateAction<string>>
  loadedFilename: string
  setLoadedFilename: React.Dispatch<React.SetStateAction<string>>
  objectPropsTab: string
  setObjectPropsTab: React.Dispatch<React.SetStateAction<string>>
  saveStatusMessage: string
  setSaveStatusMessage: React.Dispatch<React.SetStateAction<string>>
  modelSaving: boolean
  setModelSaving: React.Dispatch<React.SetStateAction<boolean>>
  getEditedModelXmlRef: React.MutableRefObject<() => string | null>
  pendingElementFocusRef: React.MutableRefObject<string | null>
  diagramOverridesRef: React.MutableRefObject<Map<string, Map<string, NodeOverride>>>
  relationshipOverridesRef: React.MutableRefObject<Map<string, Map<string, Bendpoint[]>>>
  elementOverridesRef: React.MutableRefObject<Map<string, ElementOverride>>
  relationshipMetaOverridesRef: React.MutableRefObject<Map<string, RelationshipMetaOverride>>
  dirtySplitDiagramIdsRef: React.MutableRefObject<Set<string>>
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
  markSplitDiagramDirty: (diagramId: string) => void
  resetSplitEditState: () => void
  resetModelAfterRepoDelete: () => void
  clearLinkCreation: () => void
  resetAfterFailedModelFile: (caughtError: unknown) => void
  clearCreatedAndDeletedTracking: () => void
}

export function useModelEditState(): ModelEditState {
  const [model, setModel] = useState<ParsedModel | null>(null)
  const [error, setError] = useState('')
  const [diagramOverrides, setDiagramOverrides] = useState<Map<string, Map<string, NodeOverride>>>(
    () => new Map(),
  )
  const [relationshipOverrides, setRelationshipOverrides] = useState<
    Map<string, Map<string, Bendpoint[]>>
  >(() => new Map())
  const [elementOverrides, setElementOverrides] = useState<Map<string, ElementOverride>>(
    () => new Map(),
  )
  const [relationshipMetaOverrides, setRelationshipMetaOverrides] = useState<
    Map<string, RelationshipMetaOverride>
  >(() => new Map())
  const [createdObjects, setCreatedObjects] = useState<CreatedObject[]>([])
  const [createdRelationships, setCreatedRelationships] = useState<CreatedRelationship[]>([])
  const [createdDiagramIds, setCreatedDiagramIds] = useState<Set<string>>(() => new Set())
  const [pendingLinkType, setPendingLinkType] = useState<string | null>(null)
  const [linkCreateSourceId, setLinkCreateSourceId] = useState<string | null>(null)
  const linkCreateMode = Boolean(pendingLinkType)
  const [originalDiagramNodeIds, setOriginalDiagramNodeIds] = useState<Set<string>>(() => new Set())
  const [originalElementIds, setOriginalElementIds] = useState<Set<string>>(() => new Set())
  const [originalRelationshipIds, setOriginalRelationshipIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [deletedDiagramNodeIds, setDeletedDiagramNodeIds] = useState<Set<string>>(() => new Set())
  const [deletedElementIds, setDeletedElementIds] = useState<Set<string>>(() => new Set())
  const [deletedRelationshipIds, setDeletedRelationshipIds] = useState<Set<string>>(() => new Set())
  const [deletedConnectionIds, setDeletedConnectionIds] = useState<Set<string>>(() => new Set())
  const [originalConnectionIds, setOriginalConnectionIds] = useState<Set<string>>(() => new Set())
  const [loadedXml, setLoadedXml] = useState('')
  const [loadedFilename, setLoadedFilename] = useState('model.archimate')
  const [objectPropsTab, setObjectPropsTab] = useState('details')
  const getEditedModelXmlRef = useRef<() => string | null>(() => null)
  const pendingElementFocusRef = useRef<string | null>(null)
  const diagramOverridesRef = useRef<Map<string, Map<string, NodeOverride>>>(new Map())
  const relationshipOverridesRef = useRef<Map<string, Map<string, Bendpoint[]>>>(new Map())
  const elementOverridesRef = useRef<Map<string, ElementOverride>>(new Map())
  const relationshipMetaOverridesRef = useRef<Map<string, RelationshipMetaOverride>>(new Map())
  const dirtySplitDiagramIdsRef = useRef<Set<string>>(new Set())
  const [saveStatusMessage, setSaveStatusMessage] = useState('')
  const [modelSaving, setModelSaving] = useState(false)

  const commitDiagramOverrides = useCallback(
    (
      updater:
        | Map<string, Map<string, NodeOverride>>
        | ((prev: Map<string, Map<string, NodeOverride>>) => Map<string, Map<string, NodeOverride>>),
    ) => {
      setDiagramOverrides((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        diagramOverridesRef.current = next
        return next
      })
    },
    [],
  )

  const commitRelationshipOverrides = useCallback(
    (
      updater:
        | Map<string, Map<string, Bendpoint[]>>
        | ((prev: Map<string, Map<string, Bendpoint[]>>) => Map<string, Map<string, Bendpoint[]>>),
    ) => {
      setRelationshipOverrides((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        relationshipOverridesRef.current = next
        return next
      })
    },
    [],
  )

  const commitElementOverrides = useCallback(
    (
      updater:
        | Map<string, ElementOverride>
        | ((prev: Map<string, ElementOverride>) => Map<string, ElementOverride>),
    ) => {
      setElementOverrides((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        elementOverridesRef.current = next
        return next
      })
    },
    [],
  )

  const commitRelationshipMetaOverrides = useCallback(
    (
      updater:
        | Map<string, RelationshipMetaOverride>
        | ((prev: Map<string, RelationshipMetaOverride>) => Map<string, RelationshipMetaOverride>),
    ) => {
      setRelationshipMetaOverrides((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        relationshipMetaOverridesRef.current = next
        return next
      })
    },
    [],
  )

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
  }, [])

  const clearCreatedAndDeletedTracking = useCallback(() => {
    setCreatedObjects([])
    setCreatedRelationships([])
    setCreatedDiagramIds(new Set())
    setDeletedDiagramNodeIds(new Set())
    setDeletedElementIds(new Set())
    setDeletedRelationshipIds(new Set())
    setDeletedConnectionIds(new Set())
  }, [])

  const clearLinkCreation = useCallback(() => {
    setPendingLinkType(null)
    setLinkCreateSourceId(null)
  }, [])

  const resetModelAfterRepoDelete = useCallback(() => {
    setModel(null)
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

  const resetAfterFailedModelFile = useCallback(
    (caughtError: unknown) => {
      setModel(null)
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
    },
    [resetSplitEditState],
  )

  return {
    model,
    setModel,
    error,
    setError,
    diagramOverrides,
    relationshipOverrides,
    elementOverrides,
    relationshipMetaOverrides,
    createdObjects,
    setCreatedObjects,
    createdRelationships,
    setCreatedRelationships,
    createdDiagramIds,
    setCreatedDiagramIds,
    pendingLinkType,
    setPendingLinkType,
    linkCreateSourceId,
    setLinkCreateSourceId,
    linkCreateMode,
    originalDiagramNodeIds,
    setOriginalDiagramNodeIds,
    originalElementIds,
    setOriginalElementIds,
    originalRelationshipIds,
    setOriginalRelationshipIds,
    deletedDiagramNodeIds,
    setDeletedDiagramNodeIds,
    deletedElementIds,
    setDeletedElementIds,
    deletedRelationshipIds,
    setDeletedRelationshipIds,
    deletedConnectionIds,
    setDeletedConnectionIds,
    originalConnectionIds,
    setOriginalConnectionIds,
    loadedXml,
    setLoadedXml,
    loadedFilename,
    setLoadedFilename,
    objectPropsTab,
    setObjectPropsTab,
    saveStatusMessage,
    setSaveStatusMessage,
    modelSaving,
    setModelSaving,
    getEditedModelXmlRef,
    pendingElementFocusRef,
    diagramOverridesRef,
    relationshipOverridesRef,
    elementOverridesRef,
    relationshipMetaOverridesRef,
    dirtySplitDiagramIdsRef,
    commitDiagramOverrides,
    commitRelationshipOverrides,
    commitElementOverrides,
    commitRelationshipMetaOverrides,
    markSplitDiagramDirty,
    resetSplitEditState,
    resetModelAfterRepoDelete,
    clearLinkCreation,
    resetAfterFailedModelFile,
    clearCreatedAndDeletedTracking,
  }
}
