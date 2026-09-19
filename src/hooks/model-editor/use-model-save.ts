import { useCallback } from 'react'
import { buildEditedModelXml } from '../../lib/model-editor/build-edited-model-xml'
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
    setError,
    loadedXml,
    loadedDocumentCacheRef,
    lastBuiltDocumentCacheRef,
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
    getEditedModelXmlRef,
    setSaveStatusMessage,
    setModelSaving,
  } = editState

  getEditedModelXmlRef.current = () => {
    if (!model) {
      return null
    }
    const result = buildEditedModelXml({
      model,
      loadedXml,
      baseDocumentCache: loadedDocumentCacheRef.current,
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
    if (!result) {
      lastBuiltDocumentCacheRef.current = null
      return null
    }
    lastBuiltDocumentCacheRef.current = result.documentCache
    return result.xml
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
    setModelSaving(true)
    try {
      const result = await git.handleSaveModelToGitFile()
      if (result?.ok) {
        return
      }
      if (result?.error) {
        setError(result.error)
      }
    } finally {
      setModelSaving(false)
    }
  }, [git, setError, setSaveStatusMessage, setModelSaving])

  return {
    handleSaveEditedModel,
    handleReloadModel,
  }
}
