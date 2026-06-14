import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  collectElementRelationships,
} from '../../lib/archimate/element-relationships'
import {
  applyRelationshipMetaToById,
  applyRelationshipMetaToList,
} from '../../lib/archimate/relationship-meta'
import {
  flattenNodes,
  applyOverridesToNodes,
  findNodeById,
  findNodeByElementRefInDiagram,
} from '../../lib/archimate/diagram-model'
import type {
  ParsedModel,
  ParsedElement,
  ParsedDiagram,
  DiagramNode,
  ElementOverride,
  RelationshipMetaOverride,
} from '../../types/model'
import type { ModelEditState } from './use-model-edit-state'

export interface ModelSelectionState {
  selectedDiagramId: string
  setSelectedDiagramId: React.Dispatch<React.SetStateAction<string>>
  selectedNode: DiagramNode | null
  setSelectedNode: React.Dispatch<React.SetStateAction<DiagramNode | null>>
  selectedNodeIds: string[]
  handleCanvasNodeSelect: (
    node: DiagramNode | null,
    options?: { shiftKey?: boolean; selectedIds?: string[] },
  ) => void
  selectedElementId: string | null
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>
  selectedRelationshipRef: string | null
  setSelectedRelationshipRef: React.Dispatch<React.SetStateAction<string | null>>
  selectedBendpointIndex: number | null
  setSelectedBendpointIndex: React.Dispatch<React.SetStateAction<number | null>>
  selectedDiagram: ParsedDiagram | null
  selectedElement: ParsedElement | null
  selectedNodeLive: DiagramNode | null
  selectedElementRefForUsage: string
  diagramsUsingSelectedElement: Array<{ diagram: ParsedDiagram; nodes: DiagramNode[] }>
  selectedElementRelationships: ReturnType<typeof collectElementRelationships>
  relationshipByIdForUi: Map<string, import('../../types/model').ParsedRelationship>
  selectedRelationship: import('../../types/model').ParsedRelationship | null
  elementByIdForCanvas: Map<string, ParsedElement>
  clearSelection: () => void
  handleSelectDiagram: (diagramId: string) => void
  handleSelectRelationshipType: (relationshipType: string) => void
  handleSelectRelationshipFromProperties: (relationshipId: string) => void
  handleSelectElementFromProperties: (elementId: string) => void
}

interface UseModelSelectionOptions {
  editState: Pick<
    ModelEditState,
    | 'model'
    | 'diagramOverrides'
    | 'relationshipOverrides'
    | 'elementOverrides'
    | 'relationshipMetaOverrides'
    | 'pendingLinkType'
    | 'setPendingLinkType'
    | 'setLinkCreateSourceId'
    | 'setObjectPropsTab'
  >
}

export function useModelSelection({ editState }: UseModelSelectionOptions): ModelSelectionState {
  const {
    model,
    diagramOverrides,
    relationshipOverrides,
    elementOverrides,
    relationshipMetaOverrides,
    pendingLinkType,
    setPendingLinkType,
    setLinkCreateSourceId,
    setObjectPropsTab,
  } = editState

  const [selectedDiagramId, setSelectedDiagramId] = useState('')
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [selectedRelationshipRef, setSelectedRelationshipRef] = useState<string | null>(null)
  const [selectedBendpointIndex, setSelectedBendpointIndex] = useState<number | null>(null)

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

  const selectedElementRefForUsage = selectedNodeLive?.elementRef || selectedElementId || ''

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
      ? (diagramIds
          .map((id) => model.diagrams.find((diagram) => diagram.id === id))
          .filter(Boolean) as ParsedDiagram[])
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

  const clearSelection = useCallback(() => {
    setSelectedDiagramId('')
    setSelectedNode(null)
    setSelectedNodeIds([])
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    setSelectedBendpointIndex(null)
  }, [])

  const handleCanvasNodeSelect = useCallback(
    (node: DiagramNode | null, options?: { shiftKey?: boolean; selectedIds?: string[] }) => {
      if (!node) {
        setSelectedNode(null)
        setSelectedNodeIds([])
        setSelectedElementId(null)
        setSelectedRelationshipRef(null)
        setSelectedBendpointIndex(null)
        return
      }

      if (options?.selectedIds) {
        setSelectedNodeIds(options.selectedIds)
        setSelectedNode(node)
        setSelectedElementId(node.elementRef ?? null)
        setSelectedRelationshipRef(null)
        setSelectedBendpointIndex(null)
        return
      }

      if (options?.shiftKey) {
        setSelectedNodeIds((current) => {
          const has = current.includes(node.id)
          const next = has ? current.filter((id) => id !== node.id) : [...current, node.id]
          if (has && selectedNode?.id === node.id) {
            const fallbackId = next.at(-1)
            const fallback =
              fallbackId && selectedDiagram
                ? findNodeById(selectedDiagram.nodes, fallbackId)
                : null
            setSelectedNode(fallback)
            setSelectedElementId(fallback?.elementRef ?? null)
          } else if (!has) {
            setSelectedNode(node)
            setSelectedElementId(node.elementRef ?? null)
          }
          return next
        })
        setSelectedRelationshipRef(null)
        setSelectedBendpointIndex(null)
        return
      }

      setSelectedNode(node)
      setSelectedNodeIds([node.id])
      setSelectedElementId(node.elementRef ?? null)
      setSelectedRelationshipRef(null)
      setSelectedBendpointIndex(null)
    },
    [selectedDiagram, selectedNode?.id],
  )

  const handleSelectDiagram = useCallback((diagramId: string) => {
    setSelectedDiagramId(diagramId)
    setSelectedNode(null)
    setSelectedNodeIds([])
    setSelectedElementId(null)
    setSelectedRelationshipRef(null)
    setSelectedBendpointIndex(null)
  }, [])

  const handleSelectRelationshipType = useCallback(
    (relationshipType: string) => {
      setPendingLinkType((current) => {
        if (current === relationshipType) {
          setLinkCreateSourceId(null)
          return null
        }
        setLinkCreateSourceId(null)
        setSelectedRelationshipRef(null)
        return relationshipType
      })
    },
    [setPendingLinkType, setLinkCreateSourceId],
  )

  const handleSelectRelationshipFromProperties = useCallback(
    (relationshipId: string) => {
      if (!model || !relationshipId) {
        return
      }
      setSelectedNode(null)
      setSelectedNodeIds([])
      setSelectedElementId(null)
      setSelectedRelationshipRef(relationshipId)
      setSelectedBendpointIndex(null)
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
      setSelectedNodeIds([])
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
    if (!selectedNode) {
      if (selectedNodeIds.length) {
        setSelectedNodeIds([])
      }
      return
    }
    if (!selectedNodeIds.includes(selectedNode.id)) {
      setSelectedNodeIds([selectedNode.id])
    }
  }, [selectedNode?.id, selectedNodeIds])

  useEffect(() => {
    if (!selectedNode || !selectedDiagram) {
      return
    }
    const stillExists = findNodeById(selectedDiagram.nodes, selectedNode.id)
    if (!stillExists) {
      setSelectedNode(null)
      setSelectedNodeIds((current) => current.filter((id) => id !== selectedNode.id))
    }
  }, [selectedDiagram, selectedNode])

  useEffect(() => {
    setPendingLinkType(null)
    setLinkCreateSourceId(null)
  }, [selectedDiagramId, setPendingLinkType, setLinkCreateSourceId])

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
  }, [pendingLinkType, setPendingLinkType, setLinkCreateSourceId])

  useEffect(() => {
    setObjectPropsTab('details')
  }, [selectedElementRefForUsage, setObjectPropsTab])

  return {
    selectedDiagramId,
    setSelectedDiagramId,
    selectedNode,
    setSelectedNode,
    selectedNodeIds,
    handleCanvasNodeSelect,
    selectedElementId,
    setSelectedElementId,
    selectedRelationshipRef,
    setSelectedRelationshipRef,
    selectedBendpointIndex,
    setSelectedBendpointIndex,
    selectedDiagram,
    selectedElement,
    selectedNodeLive,
    selectedElementRefForUsage,
    diagramsUsingSelectedElement,
    selectedElementRelationships,
    relationshipByIdForUi,
    selectedRelationship,
    elementByIdForCanvas,
    clearSelection,
    handleSelectDiagram,
    handleSelectRelationshipType,
    handleSelectRelationshipFromProperties,
    handleSelectElementFromProperties,
  }
}
