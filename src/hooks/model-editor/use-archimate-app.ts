import { useState, useEffect, useCallback } from 'react'
import type { AppTab } from '../../app/types'
import { deriveModelLoadState } from '../../lib/model-editor/apply-model-load'
import { useGitIntegration } from '../use-git-integration'
import { useSplitModelRuntime } from '../use-split-model-runtime'
import type { ModelLoadPayload } from '../../types/model'
import { useModelEditState } from './use-model-edit-state'
import { useModelSelection } from './use-model-selection'
import { useModelMutations } from './use-model-mutations'
import { useModelSave } from './use-model-save'

export function useArchimateApp() {
  const [appTab, setAppTab] = useState<AppTab>('modeling')
  const [compareDiagramId, setCompareDiagramId] = useState('')

  const editState = useModelEditState()
  const selection = useModelSelection({ editState })

  const applyParsedModelFromPayload = useCallback(
    (payload: ModelLoadPayload) => {
      const derived = deriveModelLoadState(payload)
      editState.setModel(derived.parsedModel)
      editState.setError('')
      editState.setSaveStatusMessage('')
      selection.setSelectedDiagramId(derived.selectedDiagramId)
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
    },
    [editState, selection],
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
    },
  })

  const splitRuntime = useSplitModelRuntime({
    model: editState.model,
    setModel: editState.setModel,
    selectedDiagramId: selection.selectedDiagramId,
    selectedElementId: selection.selectedElementId,
  })

  const mutations = useModelMutations({ editState, selection })
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

  const performUndo = useCallback(() => {
    editState.performUndo(selection.getSelectionSnapshot(), selection.restoreSelectionSnapshot)
  }, [editState, selection])

  const performRedo = useCallback(() => {
    editState.performRedo(selection.getSelectionSnapshot(), selection.restoreSelectionSnapshot)
  }, [editState, selection])

  const handleOpenCompareChanges = useCallback(() => {
    if (!selection.selectedDiagramId) {
      return
    }
    setCompareDiagramId(selection.selectedDiagramId)
    setAppTab('changes')
  }, [selection.selectedDiagramId])

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

  return {
    appTab,
    setAppTab,
    compareDiagramId,
    setCompareDiagramId,
    editState,
    selection,
    mutations,
    save,
    git,
    splitRuntime,
    performUndo,
    performRedo,
    handleOpenCompareChanges,
  }
}
