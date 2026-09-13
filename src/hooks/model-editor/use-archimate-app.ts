import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppTab } from '../../app/types'
import { deriveModelLoadState } from '../../lib/model-editor/apply-model-load'
import {
  navigationStatesEqual,
  readNavigationFromLocation,
  readNavigationHistoryState,
  resolveDiagramIdInModel,
  resolveElementIdInModel,
  resolveRelationshipIdInModel,
  writeNavigationUrl,
  type NavigationUrlState,
} from '../../lib/view-mode-url'
import { useGitIntegration } from '../use-git-integration'
import type { DiagramNode, ModelLoadPayload } from '../../types/model'
import { useModelEditState } from './use-model-edit-state'
import { useModelSelection } from './use-model-selection'
import { useModelMutations } from './use-model-mutations'
import { useModelSave } from './use-model-save'

function readInitialNavigation(): NavigationUrlState {
  if (typeof window === 'undefined') {
    return { diagramId: null, elementId: null, relationshipId: null }
  }
  return readNavigationFromLocation(window.location)
}

function isDiagramNavigationTab(tab: AppTab): boolean {
  return tab === 'modeling' || tab === 'viewMode'
}

export function useArchimateApp() {
  const initialNav = readInitialNavigation()
  const pendingNavRef = useRef<NavigationUrlState | null>(
    initialNav.diagramId || initialNav.elementId || initialNav.relationshipId
      ? initialNav
      : null,
  )
  const applyingFromUrlRef = useRef(false)
  const [appTab, setAppTab] = useState<AppTab>(
    initialNav.tab === 'viewMode' ? 'viewMode' : 'modeling',
  )
  const [compareDiagramId, setCompareDiagramId] = useState('')

  const editState = useModelEditState()
  const selection = useModelSelection({ editState })
  const mutations = useModelMutations({ editState, selection })
  const { clearCanvasHistory, undoCanvasCommand, redoCanvasCommand, canvasHistory } = mutations

  const syncNavigationUrl = useCallback(
    (
      nav: NavigationUrlState,
      mode: 'push' | 'replace' = 'push',
      tab: AppTab = appTab,
    ) => {
      if (applyingFromUrlRef.current) {
        return
      }
      if (!isDiagramNavigationTab(tab)) {
        return
      }
      const current = readNavigationFromLocation()
      const next: NavigationUrlState = {
        diagramId: nav.diagramId,
        elementId: nav.elementId,
        relationshipId: nav.relationshipId,
        tab,
      }
      if (mode === 'replace' || navigationStatesEqual(current, next)) {
        writeNavigationUrl(next, 'replace')
        return
      }
      writeNavigationUrl(next, 'push')
    },
    [appTab],
  )

  const applyNavigationSelection = useCallback(
    (nav: NavigationUrlState, options?: { switchToTab?: AppTab }) => {
      const model = editState.model
      if (!model) {
        pendingNavRef.current = nav
        return false
      }

      applyingFromUrlRef.current = true
      try {
        if (options?.switchToTab && isDiagramNavigationTab(options.switchToTab)) {
          setAppTab(options.switchToTab)
        } else if (nav.tab === 'viewMode' || nav.tab === 'modeling') {
          setAppTab(nav.tab)
        }

        const diagramId = nav.diagramId
          ? resolveDiagramIdInModel(model, nav.diagramId)
          : null
        if (nav.diagramId && !diagramId) {
          editState.setError(`Диаграмма «${nav.diagramId}» не найдена в модели.`)
          return false
        }

        if (diagramId) {
          selection.handleSelectDiagram(diagramId)
        }

        if (nav.relationshipId) {
          const relationshipId = resolveRelationshipIdInModel(model, nav.relationshipId)
          if (!relationshipId) {
            editState.setError(`Связь «${nav.relationshipId}» не найдена в модели.`)
          } else {
            selection.handleSelectRelationshipFromProperties(relationshipId)
          }
          return true
        }

        if (nav.elementId) {
          const elementId = resolveElementIdInModel(model, nav.elementId)
          if (!elementId) {
            editState.setError(`Элемент «${nav.elementId}» не найден в модели.`)
          } else {
            selection.handleSelectElementFromProperties(elementId)
          }
        }

        return true
      } finally {
        queueMicrotask(() => {
          applyingFromUrlRef.current = false
        })
      }
    },
    [editState, selection],
  )

  const applyPendingNavigationFromUrl = useCallback(
    (parsedModel: NonNullable<typeof editState.model>, fallbackDiagramId: string): string => {
      const pending = pendingNavRef.current ?? readNavigationFromLocation(window.location)
      if (!pending.diagramId && !pending.elementId && !pending.relationshipId) {
        return fallbackDiagramId
      }
      pendingNavRef.current = null

      const targetTab: AppTab =
        pending.tab === 'modeling' || pending.tab === 'viewMode' ? pending.tab : 'viewMode'

      const resolvedDiagram = pending.diagramId
        ? resolveDiagramIdInModel(parsedModel, pending.diagramId)
        : null
      if (pending.diagramId && !resolvedDiagram) {
        editState.setError(`Диаграмма «${pending.diagramId}» не найдена в модели.`)
        writeNavigationUrl(
          { diagramId: null, elementId: null, relationshipId: null, tab: targetTab },
          'replace',
        )
        return fallbackDiagramId
      }

      const diagramId = resolvedDiagram ?? fallbackDiagramId
      setAppTab(targetTab)
      writeNavigationUrl(
        {
          diagramId,
          elementId: pending.elementId,
          relationshipId: pending.relationshipId,
          tab: targetTab,
        },
        'replace',
      )
      return diagramId
    },
    [editState],
  )

  const applyParsedModelFromPayload = useCallback(
    (payload: ModelLoadPayload, options?: { preserveDiagramId?: string }) => {
      const derived = deriveModelLoadState(payload)
      editState.setModel(derived.parsedModel)
      editState.setError('')
      editState.setSaveStatusMessage('')
      const preferredDiagramId =
        options?.preserveDiagramId &&
        derived.parsedModel.diagrams.some((diagram) => diagram.id === options.preserveDiagramId)
          ? options.preserveDiagramId
          : derived.selectedDiagramId
      const selectedDiagramId = applyPendingNavigationFromUrl(
        derived.parsedModel,
        preferredDiagramId,
      )
      if (selectedDiagramId) {
        selection.handleSelectDiagram(selectedDiagramId)
      } else {
        selection.setSelectedDiagramId('')
        selection.setSelectedNode(null)
        selection.setSelectedDiagramFolderKey('')
        selection.setDiagramTreeSelectedKey('')
      }

      const nav = readNavigationFromLocation()
      if (nav.relationshipId) {
        const relationshipId = resolveRelationshipIdInModel(derived.parsedModel, nav.relationshipId)
        if (relationshipId) {
          selection.handleSelectRelationshipFromProperties(relationshipId)
        } else {
          selection.setSelectedRelationshipRef(null)
          selection.setSelectedElementId(null)
        }
      } else if (nav.elementId) {
        const elementId = resolveElementIdInModel(derived.parsedModel, nav.elementId)
        if (elementId) {
          selection.handleSelectElementFromProperties(elementId)
        } else {
          selection.setSelectedElementId(null)
          selection.setSelectedRelationshipRef(null)
        }
      } else {
        selection.setSelectedElementId(null)
        selection.setSelectedRelationshipRef(null)
      }

      editState.resetEditOverrides()
      editState.setCreatedObjects([])
      editState.setCreatedRelationships([])
      editState.setCreatedDiagramIds(new Set())
      editState.setCreatedDiagramFolderPaths(new Set())
      editState.setDirtyDiagramFolderPaths(new Set())
      editState.setOriginalDiagramFolderPaths(
        new Set(derived.parsedModel.diagramFolderPaths ?? []),
      )
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
    [editState, selection, clearCanvasHistory, applyPendingNavigationFromUrl],
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
        applyParsedModelFromPayload(payload, {
          preserveDiagramId: selection.selectedDiagramId,
        })
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

  const save = useModelSave({ editState, git })

  const navigateToDiagram = useCallback(
    (diagramId: string, options?: { replace?: boolean }) => {
      selection.handleSelectDiagram(diagramId)
      syncNavigationUrl(
        {
          diagramId,
          elementId: null,
          relationshipId: null,
        },
        options?.replace ? 'replace' : 'push',
      )
    },
    [selection, syncNavigationUrl],
  )

  const handleOpenCompareChanges = useCallback(() => {
    if (!selection.selectedDiagramId) {
      return
    }
    setCompareDiagramId(selection.selectedDiagramId)
    setAppTab('changes')
    writeNavigationUrl(
      { diagramId: null, elementId: null, relationshipId: null, tab: 'changes' },
      'replace',
    )
  }, [selection.selectedDiagramId])

  const handleAppTabChange = useCallback(
    (tab: AppTab) => {
      setAppTab(tab)
      if (tab === 'viewMode' || tab === 'modeling') {
        if (selection.selectedDiagramId) {
          syncNavigationUrl(
            {
              diagramId: selection.selectedDiagramId,
              elementId: selection.selectedElementId,
              relationshipId: selection.selectedRelationshipRef,
            },
            'replace',
            tab,
          )
        }
        return
      }
      writeNavigationUrl(
        { diagramId: null, elementId: null, relationshipId: null, tab },
        'replace',
      )
    },
    [
      selection.selectedDiagramId,
      selection.selectedElementId,
      selection.selectedRelationshipRef,
      syncNavigationUrl,
    ],
  )

  const handleViewModeSelectDiagram = useCallback(
    (diagramId: string) => {
      navigateToDiagram(diagramId)
    },
    [navigateToDiagram],
  )

  const handleSelectDiagramWithUrl = useCallback(
    (diagramId: string) => {
      navigateToDiagram(diagramId)
    },
    [navigateToDiagram],
  )

  const handleSelectElementWithUrl = useCallback(
    (
      elementId: string,
      found?: { diagramId: string; node?: DiagramNode | null; pending?: boolean } | null,
    ) => {
      selection.setSelectedRelationshipRef(null)
      if (found?.pending) {
        editState.pendingElementFocusRef.current = elementId
        selection.setSelectedDiagramId(found.diagramId)
        selection.setSelectedElementId(elementId)
        selection.setSelectedNode(null)
        syncNavigationUrl({
          diagramId: found.diagramId,
          elementId,
          relationshipId: null,
        })
        return
      }
      if (found?.node) {
        selection.setSelectedDiagramId(found.diagramId)
        selection.handleCanvasNodeSelect(found.node)
        selection.setSelectedElementId(elementId)
        selection.setDiagramTreeSelectedKey(found.diagramId)
        syncNavigationUrl({
          diagramId: found.diagramId,
          elementId,
          relationshipId: null,
        })
        return
      }
      selection.handleSelectElementFromProperties(elementId)
      const indexed = editState.model?.diagramIndexByElementRef?.get(elementId)?.[0] ?? null
      syncNavigationUrl({
        diagramId: indexed || selection.selectedDiagramId || null,
        elementId,
        relationshipId: null,
      })
    },
    [editState, selection, syncNavigationUrl],
  )

  const handleSelectRelationshipWithUrl = useCallback(
    (relationshipId: string) => {
      const model = editState.model
      const currentHas =
        Boolean(selection.selectedDiagramId) &&
        Boolean(
          model?.diagrams
            .find((diagram) => diagram.id === selection.selectedDiagramId)
            ?.connections.some((connection) => connection.relationshipRef === relationshipId),
        )
      const indexed = model?.diagramIndexByRelationshipRef?.get(relationshipId)?.[0] ?? null
      const diagramId = currentHas
        ? selection.selectedDiagramId
        : indexed || selection.selectedDiagramId || null

      selection.handleSelectRelationshipFromProperties(relationshipId)
      syncNavigationUrl({
        diagramId,
        elementId: null,
        relationshipId,
      })
    },
    [editState.model, selection, syncNavigationUrl],
  )

  useEffect(() => {
    if (!editState.model) {
      return
    }
    const pending = pendingNavRef.current
    if (!pending) {
      return
    }
    pendingNavRef.current = null
    const targetTab: AppTab =
      pending.tab === 'modeling' || pending.tab === 'viewMode' ? pending.tab : 'viewMode'
    applyNavigationSelection(pending, { switchToTab: targetTab })
    if (pending.diagramId) {
      const resolved = resolveDiagramIdInModel(editState.model, pending.diagramId)
      writeNavigationUrl(
        {
          diagramId: resolved,
          elementId: pending.elementId,
          relationshipId: pending.relationshipId,
          tab: targetTab,
        },
        'replace',
      )
    }
  }, [editState.model, applyNavigationSelection])

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const historyNav = readNavigationHistoryState(event.state)
      const urlNav = readNavigationFromLocation(window.location)
      const diagramId = historyNav?.diagramId ?? urlNav.diagramId
      const elementId = historyNav?.elementId ?? urlNav.elementId
      const relationshipId = historyNav?.relationshipId ?? urlNav.relationshipId
      const tab = historyNav?.tab ?? urlNav.tab

      if (!diagramId && !elementId && !relationshipId) {
        if (tab && tab !== 'viewMode' && tab !== 'modeling') {
          setAppTab(tab)
        } else if (appTab === 'viewMode') {
          setAppTab('modeling')
        }
        return
      }

      if (tab === 'modeling' || tab === 'viewMode') {
        setAppTab(tab)
      } else if (!tab && diagramId) {
        setAppTab('viewMode')
      }

      applyNavigationSelection({
        diagramId: diagramId ?? null,
        elementId: elementId ?? null,
        relationshipId: relationshipId ?? null,
        tab: tab === 'modeling' || tab === 'viewMode' ? tab : undefined,
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [appTab, applyNavigationSelection])

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
    handleSelectDiagramWithUrl,
    handleSelectElementWithUrl,
    handleSelectRelationshipWithUrl,
    compareDiagramId,
    setCompareDiagramId,
    editState,
    selection,
    mutations,
    save,
    git,
    handleOpenCompareChanges,
  }
}
