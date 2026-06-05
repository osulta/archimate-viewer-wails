import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppTab } from '../../app/types'
import { deriveModelLoadState } from '../../lib/model-editor/apply-model-load'
import {
  getViewModeDiagramIdFromLocation,
  resolveDiagramIdInModel,
  setViewModeDiagramInUrl,
} from '../../lib/view-mode-url'
import { useGitIntegration } from '../use-git-integration'
import { useSplitModelRuntime } from '../use-split-model-runtime'
import type { ModelLoadPayload } from '../../types/model'
import { useModelEditState } from './use-model-edit-state'
import { useModelSelection } from './use-model-selection'
import { useModelMutations } from './use-model-mutations'
import { useModelSave } from './use-model-save'

function readInitialViewModeDiagramId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return getViewModeDiagramIdFromLocation(window.location)
}

export function useArchimateApp() {
  const initialViewDiagramId = readInitialViewModeDiagramId()
  const pendingViewDiagramRef = useRef<string | null>(initialViewDiagramId)
  const [appTab, setAppTab] = useState<AppTab>(initialViewDiagramId ? 'viewMode' : 'modeling')
  const [compareDiagramId, setCompareDiagramId] = useState('')

  const editState = useModelEditState()
  const selection = useModelSelection({ editState })
  const mutations = useModelMutations({ editState, selection })
  const { clearCanvasHistory, undoCanvasCommand, redoCanvasCommand, canvasHistory } = mutations

  const applyViewModeDiagramFromUrl = useCallback(
    (parsedModel: NonNullable<typeof editState.model>, fallbackDiagramId: string): string => {
      const pending =
        pendingViewDiagramRef.current ?? getViewModeDiagramIdFromLocation(window.location)
      if (!pending) {
        return fallbackDiagramId
      }
      const resolved = resolveDiagramIdInModel(parsedModel, pending)
      pendingViewDiagramRef.current = null
      if (!resolved) {
        editState.setError(`Диаграмма «${pending}» не найдена в модели.`)
        setViewModeDiagramInUrl(null)
        return fallbackDiagramId
      }
      setAppTab('viewMode')
      setViewModeDiagramInUrl(resolved)
      return resolved
    },
    [editState],
  )

  const applyParsedModelFromPayload = useCallback(
    (payload: ModelLoadPayload) => {
      const derived = deriveModelLoadState(payload)
      editState.setModel(derived.parsedModel)
      editState.setError('')
      editState.setSaveStatusMessage('')
      const selectedDiagramId = applyViewModeDiagramFromUrl(
        derived.parsedModel,
        derived.selectedDiagramId,
      )
      selection.setSelectedDiagramId(selectedDiagramId)
      selection.setSelectedNode(null)
      selection.setSelectedElementId(null)
      selection.setSelectedRelationshipRef(null)
      editState.resetSplitEditState()
      editState.setCreatedObjects([])
      editState.setCreatedRelationships([])
      editState.setCreatedDiagramIds(new Set())
      editState.setPendingLinkType(null)
      editState.setLinkCreateSourceId(null)
      editState.setOriginalDiagramNodeIds(derived.originalDiagramNodeIds)
      editState.setOriginalElementIds(derived.originalElementIds)
      editState.setOriginalRelationshipIds(derived.originalRelationshipIds)
      editState.setDeletedDiagramNodeIds(new Set())
      editState.setDeletedElementIds(new Set())
      editState.setDeletedRelationshipIds(new Set())
      editState.setDeletedConnectionIds(new Set())
      editState.setOriginalConnectionIds(derived.originalConnectionIds)
      editState.setLoadedXml(derived.loadedXml)
      editState.setLoadedFilename(derived.loadedFilename)
      clearCanvasHistory()
    },
    [editState, selection, clearCanvasHistory, applyViewModeDiagramFromUrl],
  )

  const git = useGitIntegration({
    hasModel: Boolean(editState.model),
    loadedFilename: editState.loadedFilename,
    getEditedModelXml: () => editState.getEditedModelXmlRef.current?.() ?? null,
    onModelLoaded: (payload: ModelLoadPayload) => {
      applyParsedModelFromPayload(payload)
    },
    onModelSaved: (payload: ModelLoadPayload) => {
      try {
        applyParsedModelFromPayload(payload)
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        editState.setError(`Файл записан на диск, но не удалось перечитать модель: ${msg}`)
      }
    },
    onModelParseError: (message: string) => editState.setError(message),
    onRepositoryDeleted: () => {
      editState.resetModelAfterRepoDelete()
      selection.clearSelection()
      clearCanvasHistory()
    },
  })

  const splitRuntime = useSplitModelRuntime({
    model: editState.model,
    setModel: editState.setModel,
    selectedDiagramId: selection.selectedDiagramId,
    selectedElementId: selection.selectedElementId,
  })

  const save = useModelSave({ editState, git })

  useEffect(() => {
    const elementId = editState.pendingElementFocusRef.current
    if (!elementId || !editState.model || editState.model.format !== 'split-files' || !selection.selectedDiagramId) {
      return
    }
    const node = splitRuntime.resolveElementOnDiagram(elementId, selection.selectedDiagramId)
    if (!node) {
      return
    }
    selection.setSelectedElementId(elementId)
    selection.setSelectedNode(node)
    selection.setSelectedRelationshipRef(null)
    editState.pendingElementFocusRef.current = null
  }, [editState, selection, splitRuntime])

  const handleOpenCompareChanges = useCallback(() => {
    if (!selection.selectedDiagramId) {
      return
    }
    setCompareDiagramId(selection.selectedDiagramId)
    setAppTab('changes')
    setViewModeDiagramInUrl(null)
  }, [selection.selectedDiagramId])

  const handleAppTabChange = useCallback(
    (tab: AppTab) => {
      setAppTab(tab)
      if (tab === 'viewMode') {
        if (selection.selectedDiagramId) {
          setViewModeDiagramInUrl(selection.selectedDiagramId)
        }
        return
      }
      setViewModeDiagramInUrl(null)
    },
    [selection.selectedDiagramId],
  )

  const handleViewModeSelectDiagram = useCallback(
    (diagramId: string) => {
      selection.handleSelectDiagram(diagramId)
      if (appTab === 'viewMode') {
        setViewModeDiagramInUrl(diagramId)
      }
    },
    [appTab, selection],
  )

  useEffect(() => {
    if (appTab !== 'viewMode' || !selection.selectedDiagramId) {
      return
    }
    const fromUrl = getViewModeDiagramIdFromLocation(window.location)
    if (fromUrl === selection.selectedDiagramId) {
      return
    }
    setViewModeDiagramInUrl(selection.selectedDiagramId)
  }, [appTab, selection.selectedDiagramId])

  useEffect(() => {
    if (!editState.model) {
      return
    }
    const pending = pendingViewDiagramRef.current
    if (!pending) {
      return
    }
    const resolved = resolveDiagramIdInModel(editState.model, pending)
    pendingViewDiagramRef.current = null
    if (!resolved) {
      editState.setError(`Диаграмма «${pending}» не найдена в модели.`)
      setViewModeDiagramInUrl(null)
      return
    }
    setAppTab('viewMode')
    selection.setSelectedDiagramId(resolved)
    setViewModeDiagramInUrl(resolved)
  }, [editState.model, editState, selection])

  useEffect(() => {
    function onPopState() {
      const diagramId = getViewModeDiagramIdFromLocation(window.location)
      if (!diagramId) {
        setAppTab('modeling')
        return
      }
      setAppTab('viewMode')
      if (editState.model) {
        const resolved = resolveDiagramIdInModel(editState.model, diagramId)
        if (resolved) {
          selection.handleSelectDiagram(resolved)
          return
        }
        editState.setError(`Диаграмма «${diagramId}» не найдена в модели.`)
      } else {
        pendingViewDiagramRef.current = diagramId
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [editState, selection])

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
        Boolean(selection.selectedRelationshipRef) &&
        Boolean(
          selection.selectedDiagram?.connections.some(
            (c) => c.relationshipRef === selection.selectedRelationshipRef,
          ),
        )
      if (hasConnOnDiagram && selection.selectedBendpointIndex !== null) {
        const conn = selection.selectedDiagram!.connections.find(
          (c) => c.relationshipRef === selection.selectedRelationshipRef,
        )
        if (conn?.bendpoints?.[selection.selectedBendpointIndex]) {
          event.preventDefault()
          mutations.removeRelationshipBendpoint(
            selection.selectedRelationshipRef!,
            selection.selectedBendpointIndex,
          )
          return
        }
      }
      if (hasConnOnDiagram) {
        event.preventDefault()
        mutations.deleteSelectedConnectionFromDiagram()
        return
      }
      if (!selection.selectedNodeLive || !selection.selectedDiagramId) {
        return
      }
      event.preventDefault()
      mutations.deleteSelectedFromDiagram()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection, mutations])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      if (!mod || event.key.toLowerCase() !== 'z') {
        return
      }
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }
      if (event.shiftKey) {
        if (!canvasHistory.canRedo) {
          return
        }
        event.preventDefault()
        redoCanvasCommand()
        return
      }
      if (!canvasHistory.canUndo) {
        return
      }
      event.preventDefault()
      undoCanvasCommand()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canvasHistory.canRedo, canvasHistory.canUndo, redoCanvasCommand, undoCanvasCommand])

  return {
    appTab,
    setAppTab,
    handleAppTabChange,
    handleViewModeSelectDiagram,
    compareDiagramId,
    setCompareDiagramId,
    editState,
    selection,
    mutations,
    save,
    git,
    splitRuntime,
    handleOpenCompareChanges,
  }
}
