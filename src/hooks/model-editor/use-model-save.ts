import { useCallback } from 'react'
import { saveSplitModelChanges } from '../../lib/archimate/split-model-save'
import { buildEditedModelXml } from '../../lib/model-editor/build-edited-model-xml'
import { isSplitFilesModel } from '../../lib/model-editor/is-split-files-model'
import type { ModelEditState } from './use-model-edit-state'

interface GitSaveIntegration {
  handleReloadModelFromFile: () => Promise<{ ok?: boolean; error?: string } | undefined>
  handleSaveModelToGitFile: () => Promise<{ ok?: boolean; error?: string } | undefined>
}

export interface ModelSaveHandlers {
  handleSaveEditedModel: () => Promise<void>
  handleReloadModel: () => Promise<void>
}

interface UseModelSaveOptions {
  editState: ModelEditState
  git: GitSaveIntegration
}

export function useModelSave({ editState, git }: UseModelSaveOptions): ModelSaveHandlers {
  const {
    model,
    setModel,
    setError,
    loadedXml,
    diagramOverrides,
    relationshipOverrides,
    elementOverrides,
    relationshipMetaOverrides,
    createdObjects,
    createdRelationships,
    createdDiagramIds,
    createdDiagramFolderPaths,
    dirtyDiagramFolderPaths,
    deletedDiagramNodeIds,
    deletedElementIds,
    deletedRelationshipIds,
    deletedConnectionIds,
    diagramOverridesRef,
    relationshipOverridesRef,
    elementOverridesRef,
    relationshipMetaOverridesRef,
    dirtySplitDiagramIdsRef,
    dirtySplitRelationshipIdsRef,
    deletedSplitModelFilesRef,
    getEditedModelXmlRef,
    setCreatedObjects,
    setCreatedRelationships,
    setCreatedDiagramIds,
    setCreatedDiagramFolderPaths,
    setDirtyDiagramFolderPaths,
    setSaveStatusMessage,
    setModelSaving,
    clearCreatedAndDeletedTracking,
  } = editState

  getEditedModelXmlRef.current = () => {
    if (!model) {
      return null
    }
    return buildEditedModelXml({
      model,
      loadedXml,
      diagramOverrides,
      relationshipOverrides,
      elementOverrides,
      relationshipMetaOverrides,
      createdObjects,
      createdRelationships,
      createdDiagramIds,
      deletedDiagramNodeIds,
      deletedElementIds,
      deletedRelationshipIds,
      deletedConnectionIds,
    })
  }

  const handleReloadModel = useCallback(async () => {
    setError('')
    const result = await git.handleReloadModelFromFile()
    if (result?.ok) {
      return
    }
    if (result?.error) {
      setError(result.error)
    }
  }, [git, setError])

  const handleSaveEditedModel = useCallback(async () => {
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
        dirtyRelationshipIds: dirtySplitRelationshipIdsRef.current,
        createdObjects,
          createdRelationships,
          createdDiagramIds,
          createdDiagramFolderPaths,
          dirtyDiagramFolderPaths,
          deletedSplitModelFiles: deletedSplitModelFilesRef.current,
        })
        if (result.written.length === 0) {
          setError('Нет изменений для сохранения в файлы модели.')
          return
        }
        dirtySplitDiagramIdsRef.current = new Set()
        dirtySplitRelationshipIdsRef.current = new Set()
        deletedSplitModelFilesRef.current = new Set()
        setCreatedObjects([])
        setCreatedRelationships([])
        setCreatedDiagramIds(new Set())
        setCreatedDiagramFolderPaths(new Set())
        setDirtyDiagramFolderPaths(new Set())
        clearCreatedAndDeletedTracking()
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
  }, [
    model,
    createdObjects,
    createdRelationships,
    createdDiagramIds,
    createdDiagramFolderPaths,
    dirtyDiagramFolderPaths,
    diagramOverridesRef,
    relationshipOverridesRef,
    elementOverridesRef,
    relationshipMetaOverridesRef,
    dirtySplitDiagramIdsRef,
    deletedSplitModelFilesRef,
    clearCreatedAndDeletedTracking,
    git,
    setError,
    setSaveStatusMessage,
    setModelSaving,
    setCreatedObjects,
    setCreatedRelationships,
    setCreatedDiagramIds,
    setCreatedDiagramFolderPaths,
    setDirtyDiagramFolderPaths,
    setModel,
  ])

  return {
    handleSaveEditedModel,
    handleReloadModel,
  }
}
