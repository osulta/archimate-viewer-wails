import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagramNode, ParsedModel } from '../types/model'
import { findNodeByElementRefInDiagram } from '../lib/archimate/diagram-model'
import {
  fetchSplitModelFile,
  isSplitDiagramLoaded,
  mergeLoadedDiagram,
  mergeLoadedElement,
} from '../lib/archimate/split-model-client'

type SetModel = React.Dispatch<React.SetStateAction<ParsedModel | null>>

interface UseSplitModelRuntimeOptions {
  model: ParsedModel | null
  setModel: SetModel
  selectedDiagramId: string
  selectedElementId: string | null
}

interface FocusElementResult {
  diagramId: string | null
  node: DiagramNode | null
  pending: boolean
}

export function useSplitModelRuntime({ model, setModel, selectedDiagramId, selectedElementId }: UseSplitModelRuntimeOptions) {
  const [diagramLoadingId, setDiagramLoadingId] = useState('')
  const [elementLoadingId, setElementLoadingId] = useState('')
  const loadingDiagramsRef = useRef(new Set<string>())
  const loadingElementsRef = useRef(new Set<string>())

  const ensureDiagramLoaded = useCallback(
    async (diagramId: string): Promise<boolean> => {
      if (!model || model.format !== 'split-files' || !diagramId) {
        return false
      }
      if (isSplitDiagramLoaded(model, diagramId)) {
        return true
      }
      const stub = model.diagrams.find((item) => item.id === diagramId)
      if (!stub?.sourceFile || !model.modelRoot) {
        return false
      }
      if (loadingDiagramsRef.current.has(diagramId)) {
        return false
      }

      loadingDiagramsRef.current.add(diagramId)
      setDiagramLoadingId(diagramId)
      try {
        const content = await fetchSplitModelFile(model.modelRoot, stub.sourceFile)
        setModel((prev) => {
          if (!prev || prev.format !== 'split-files') {
            return prev
          }
          return mergeLoadedDiagram(prev, diagramId, content)
        })
        return true
      } catch {
        return false
      } finally {
        loadingDiagramsRef.current.delete(diagramId)
        setDiagramLoadingId((current) => (current === diagramId ? '' : current))
      }
    },
    [model, setModel],
  )

  const ensureElementLoaded = useCallback(
    async (elementId: string): Promise<boolean> => {
      if (!model || model.format !== 'split-files' || !elementId) {
        return false
      }
      const stub = model.elementById.get(elementId)
      if (!stub?.lite || !stub.sourceFile || !model.modelRoot) {
        return true
      }
      if (loadingElementsRef.current.has(elementId)) {
        return false
      }

      loadingElementsRef.current.add(elementId)
      setElementLoadingId(elementId)
      try {
        const content = await fetchSplitModelFile(model.modelRoot, stub.sourceFile)
        setModel((prev) => {
          if (!prev || prev.format !== 'split-files') {
            return prev
          }
          return mergeLoadedElement(prev, elementId, content)
        })
        return true
      } catch {
        return false
      } finally {
        loadingElementsRef.current.delete(elementId)
        setElementLoadingId((current) => (current === elementId ? '' : current))
      }
    },
    [model, setModel],
  )

  useEffect(() => {
    if (!model || model.format !== 'split-files' || !selectedDiagramId) {
      return
    }
    void ensureDiagramLoaded(selectedDiagramId)
  }, [model, selectedDiagramId, ensureDiagramLoaded])

  useEffect(() => {
    if (!model || model.format !== 'split-files' || !selectedElementId) {
      return
    }
    void ensureElementLoaded(selectedElementId)
  }, [model, selectedElementId, ensureElementLoaded])

  const resolveElementOnDiagram = useCallback(
    (elementId: string, diagramId: string): DiagramNode | null => {
      if (!model || !diagramId) {
        return null
      }
      const diagram = model.diagrams.find((item) => item.id === diagramId)
      if (!diagram?.loaded) {
        return null
      }
      return findNodeByElementRefInDiagram(diagram, elementId)
    },
    [model],
  )

  const focusElementInDiagram = useCallback(
    (elementId: string): FocusElementResult => {
      if (!model || model.format !== 'split-files') {
        return { diagramId: null, node: null, pending: false }
      }
      const diagramIds = model.diagramIndexByElementRef?.get(elementId) ?? []
      const diagramId = diagramIds[0] ?? null
      if (!diagramId) {
        return { diagramId: null, node: null, pending: false }
      }
      const node = resolveElementOnDiagram(elementId, diagramId)
      return {
        diagramId,
        node,
        pending: !node,
      }
    },
    [model, resolveElementOnDiagram],
  )

  const focusRelationshipInDiagram = useCallback(
    (relationshipId: string): string | null => {
      if (!model || model.format !== 'split-files') {
        return null
      }
      const diagramIds = model.diagramIndexByRelationshipRef?.get(relationshipId) ?? []
      return diagramIds[0] ?? null
    },
    [model],
  )

  return {
    diagramLoadingId,
    elementLoadingId,
    ensureDiagramLoaded,
    ensureElementLoaded,
    resolveElementOnDiagram,
    focusElementInDiagram,
    focusRelationshipInDiagram,
    isDiagramLoading: Boolean(diagramLoadingId),
  }
}
