import { useRef, useState, useCallback } from 'react'
import type {
  ParsedModel,
  NodeOverride,
  ConnectionOverride,
  ElementOverride,
  RelationshipMetaOverride,
  CreatedObject,
  CreatedRelationship,
} from '../../types/model'
import type { XmlDocumentCache } from '../../lib/archimate/xml-document-cache'
import { buildXmlDocumentCache } from '../../lib/archimate/xml-document-cache'

export interface ModelEditState {
  model: ParsedModel | null
  setModel: React.Dispatch<React.SetStateAction<ParsedModel | null>>
  error: string
  setError: React.Dispatch<React.SetStateAction<string>>
  diagramOverrides: Map<string, Map<string, NodeOverride>>
  relationshipOverrides: Map<string, Map<string, ConnectionOverride>>
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  createdObjects: CreatedObject[]
  setCreatedObjects: React.Dispatch<React.SetStateAction<CreatedObject[]>>
  createdRelationships: CreatedRelationship[]
  setCreatedRelationships: React.Dispatch<React.SetStateAction<CreatedRelationship[]>>
  createdDiagramIds: Set<string>
  setCreatedDiagramIds: React.Dispatch<React.SetStateAction<Set<string>>>
  createdDiagramFolderPaths: Set<string>
  setCreatedDiagramFolderPaths: React.Dispatch<React.SetStateAction<Set<string>>>
  dirtyDiagramFolderPaths: Set<string>
  setDirtyDiagramFolderPaths: React.Dispatch<React.SetStateAction<Set<string>>>
  originalDiagramFolderPaths: Set<string>
  setOriginalDiagramFolderPaths: React.Dispatch<React.SetStateAction<Set<string>>>
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
  loadedDocumentCacheRef: React.MutableRefObject<XmlDocumentCache | null>
  lastBuiltDocumentCacheRef: React.MutableRefObject<XmlDocumentCache | null>
  setLoadedDocumentFromXml: (xml: string) => void
  adoptDocumentCache: (cache: XmlDocumentCache | null) => void
  clearLoadedDocumentCache: () => void
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
  relationshipOverridesRef: React.MutableRefObject<Map<string, Map<string, ConnectionOverride>>>
  elementOverridesRef: React.MutableRefObject<Map<string, ElementOverride>>
  relationshipMetaOverridesRef: React.MutableRefObject<Map<string, RelationshipMetaOverride>>
  commitDiagramOverrides: (
    updater:
      | Map<string, Map<string, NodeOverride>>
      | ((prev: Map<string, Map<string, NodeOverride>>) => Map<string, Map<string, NodeOverride>>),
  ) => void
  commitRelationshipOverrides: (
    updater:
      | Map<string, Map<string, ConnectionOverride>>
      | ((prev: Map<string, Map<string, ConnectionOverride>>) => Map<string, Map<string, ConnectionOverride>>),
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
  resetEditOverrides: () => void
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
    Map<string, Map<string, ConnectionOverride>>
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
  const [createdDiagramFolderPaths, setCreatedDiagramFolderPaths] = useState<Set<string>>(() => new Set())
  const [dirtyDiagramFolderPaths, setDirtyDiagramFolderPaths] = useState<Set<string>>(() => new Set())
  const [originalDiagramFolderPaths, setOriginalDiagramFolderPaths] = useState<Set<string>>(
    () => new Set(),
  )
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
  const loadedDocumentCacheRef = useRef<XmlDocumentCache | null>(null)
  const lastBuiltDocumentCacheRef = useRef<XmlDocumentCache | null>(null)
  const [loadedFilename, setLoadedFilename] = useState('model.archimate')
  const [objectPropsTab, setObjectPropsTab] = useState('details')
  const getEditedModelXmlRef = useRef<() => string | null>(() => null)
  const pendingElementFocusRef = useRef<string | null>(null)

  const clearLoadedDocumentCache = useCallback(() => {
    loadedDocumentCacheRef.current = null
    lastBuiltDocumentCacheRef.current = null
  }, [])

  const setLoadedDocumentFromXml = useCallback((xml: string) => {
    loadedDocumentCacheRef.current = xml ? buildXmlDocumentCache(xml) : null
    lastBuiltDocumentCacheRef.current = null
  }, [])

  const adoptDocumentCache = useCallback((cache: XmlDocumentCache | null) => {
    loadedDocumentCacheRef.current = cache
    lastBuiltDocumentCacheRef.current = null
  }, [])
  const diagramOverridesRef = useRef<Map<string, Map<string, NodeOverride>>>(new Map())
  const relationshipOverridesRef = useRef<Map<string, Map<string, ConnectionOverride>>>(new Map())
  const elementOverridesRef = useRef<Map<string, ElementOverride>>(new Map())
  const relationshipMetaOverridesRef = useRef<Map<string, RelationshipMetaOverride>>(new Map())
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
        | Map<string, Map<string, ConnectionOverride>>
        | ((prev: Map<string, Map<string, ConnectionOverride>>) => Map<string, Map<string, ConnectionOverride>>),
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

  const resetEditOverrides = useCallback(() => {
    const emptyMap = new Map()
    diagramOverridesRef.current = emptyMap
    relationshipOverridesRef.current = emptyMap
    elementOverridesRef.current = emptyMap
    relationshipMetaOverridesRef.current = emptyMap
    setDiagramOverrides(emptyMap)
    setRelationshipOverrides(emptyMap)
    setElementOverrides(emptyMap)
    setRelationshipMetaOverrides(emptyMap)
  }, [])

  const clearCreatedAndDeletedTracking = useCallback(() => {
    setCreatedObjects([])
    setCreatedRelationships([])
    setCreatedDiagramIds(new Set())
    setCreatedDiagramFolderPaths(new Set())
    setDirtyDiagramFolderPaths(new Set())
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
    resetEditOverrides()
    setCreatedObjects([])
    setCreatedRelationships([])
    setCreatedDiagramIds(new Set())
    setCreatedDiagramFolderPaths(new Set())
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
    clearLoadedDocumentCache()
    setLoadedFilename('model.archimate')
    setError('')
  }, [resetEditOverrides, clearLoadedDocumentCache])

  const resetAfterFailedModelFile = useCallback(
    (caughtError: unknown) => {
      setModel(null)
      resetEditOverrides()
      setCreatedObjects([])
      setCreatedRelationships([])
      setCreatedDiagramIds(new Set())
      setCreatedDiagramFolderPaths(new Set())
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
      clearLoadedDocumentCache()
      setError(caughtError instanceof Error ? caughtError.message : 'Не удалось прочитать файл.')
    },
    [resetEditOverrides, clearLoadedDocumentCache],
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
    createdDiagramFolderPaths,
    setCreatedDiagramFolderPaths,
    dirtyDiagramFolderPaths,
    setDirtyDiagramFolderPaths,
    originalDiagramFolderPaths,
    setOriginalDiagramFolderPaths,
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
    loadedDocumentCacheRef,
    lastBuiltDocumentCacheRef,
    setLoadedDocumentFromXml,
    adoptDocumentCache,
    clearLoadedDocumentCache,
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
    commitDiagramOverrides,
    commitRelationshipOverrides,
    commitElementOverrides,
    commitRelationshipMetaOverrides,
    resetEditOverrides,
    resetModelAfterRepoDelete,
    clearLinkCreation,
    resetAfterFailedModelFile,
    clearCreatedAndDeletedTracking,
  }
}
