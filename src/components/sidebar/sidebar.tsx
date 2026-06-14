import React, { useDeferredValue, useMemo, useState } from 'react'
import { Alert, Spin, Typography } from 'antd'
import { applyRelationshipMetaToList } from '../../lib/archimate/relationship-meta'
import {
  capTreeSearchResults,
  matchesTreeSearchHaystack,
  resolveTreeSearchState,
  TREE_SEARCH_DEBOUNCE_MS,
} from '../../lib/archimate/tree-search'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { ModelTree } from './model-tree'
import type {
  ParsedModel,
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  DiagramNode,
  ElementOverride,
  RelationshipMetaOverride,
} from '../../types/model'

interface GitState {
  [key: string]: unknown
}

interface FocusElementResult {
  diagramId: string | null
  node: DiagramNode | null
  pending?: boolean
}

interface SidebarProps {
  variant?: 'default' | 'view'
  git?: GitState | null
  model: ParsedModel | null
  error: string | null
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  selectedElementId: string | null
  selectedRelationshipRef: string | null
  selectedDiagramId: string | null
  onReloadModel?: () => Promise<void> | void
  onSaveEditedModel?: () => Promise<void> | void
  canSaveModel?: boolean
  saveStatusMessage?: string
  modelActionLoading?: boolean
  modelLoading?: boolean
  modelSaving?: boolean
  focusElementInDiagram?: (elementId: string) => FocusElementResult
  focusRelationshipInDiagram?: (relationshipId: string) => string | null
  onSelectElement: (
    id: string,
    context: { diagramId: string; node?: DiagramNode; pending?: boolean } | null,
  ) => void
  onSelectRelationship: (id: string, diagramId: string | null) => void
  onSelectDiagram: (id: string) => void
  onCreateDiagram?: () => void
}

export function Sidebar({
  variant = 'default',
  git,
  model,
  error,
  elementOverrides,
  relationshipMetaOverrides,
  selectedElementId,
  selectedRelationshipRef,
  selectedDiagramId,
  onReloadModel,
  onSaveEditedModel,
  canSaveModel = true,
  saveStatusMessage = '',
  modelActionLoading = false,
  modelLoading = false,
  modelSaving = false,
  focusElementInDiagram,
  focusRelationshipInDiagram,
  onSelectElement,
  onSelectRelationship,
  onSelectDiagram,
  onCreateDiagram,
}: SidebarProps): React.JSX.Element {
  const isViewMode = variant === 'view'
  const [sidebarTreeSearch, setSidebarTreeSearch] = useState('')
  const immediateSearchState = useMemo(
    () => resolveTreeSearchState(sidebarTreeSearch),
    [sidebarTreeSearch],
  )
  const debouncedTreeSearch = useDebouncedValue(sidebarTreeSearch, TREE_SEARCH_DEBOUNCE_MS)
  const debouncedSearchState = useMemo(
    () => resolveTreeSearchState(debouncedTreeSearch),
    [debouncedTreeSearch],
  )
  const treeSearchNorm = useDeferredValue(debouncedSearchState.query)
  const treeSearchActive = treeSearchNorm.length > 0

  const elementSearchResult = useMemo(() => {
    if (!model) {
      return { items: [] as ParsedElement[], truncated: false, totalMatches: 0 }
    }
    if (!treeSearchActive) {
      return { items: model.elements, truncated: false, totalMatches: model.elements.length }
    }
    const matched = model.elements.filter((item) => {
      const name = elementOverrides.get(item.id)?.name ?? item.name
      const hay = [name, item.type, item.id, item.folderPath ?? ''].join(' ').toLowerCase()
      return matchesTreeSearchHaystack(hay, treeSearchNorm)
    })
    return capTreeSearchResults(matched, true)
  }, [model, treeSearchActive, treeSearchNorm, elementOverrides])

  const relationshipSearchResult = useMemo(() => {
    if (!model) {
      return { items: [] as ParsedRelationship[], truncated: false, totalMatches: 0 }
    }
    const relationships = applyRelationshipMetaToList(
      model.relationships,
      relationshipMetaOverrides,
    )
    if (!treeSearchActive) {
      return { items: relationships, truncated: false, totalMatches: relationships.length }
    }
    const matched = relationships.filter((item: ParsedRelationship) => {
      const hay = [item.name, item.id, item.type, item.source, item.target]
        .join(' ')
        .toLowerCase()
      return matchesTreeSearchHaystack(hay, treeSearchNorm)
    })
    return capTreeSearchResults(matched, true)
  }, [model, treeSearchActive, treeSearchNorm, relationshipMetaOverrides])

  const diagramSearchResult = useMemo(() => {
    if (!model) {
      return { items: [] as ParsedDiagram[], truncated: false, totalMatches: 0 }
    }
    if (!treeSearchActive) {
      return { items: model.diagrams, truncated: false, totalMatches: model.diagrams.length }
    }
    const matched = model.diagrams.filter((d) => {
      const label = d.folderPath ? `${d.folderPath} / ${d.name}` : d.name
      const hay = [label, d.name, d.folderPath ?? '', d.id, d.type ?? ''].join(' ').toLowerCase()
      return matchesTreeSearchHaystack(hay, treeSearchNorm)
    })
    return capTreeSearchResults(matched, true)
  }, [model, treeSearchActive, treeSearchNorm])

  const filteredTreeElements = elementSearchResult.items
  const filteredTreeRelationships = relationshipSearchResult.items
  const filteredTreeDiagrams = diagramSearchResult.items
  const elementSearchMeta = elementSearchResult
  const relationshipSearchMeta = relationshipSearchResult
  const diagramSearchMeta = diagramSearchResult

  return (
    <div className="sidebar">
      <Typography.Title level={4} className="sidebar-title">
        ArchiMate Viewer
      </Typography.Title>
      {!isViewMode && model ? (
        <>
          {saveStatusMessage && !error ? (
            <Alert
              className="save-status"
              type="success"
              showIcon
              message={saveStatusMessage}
            />
          ) : null}
        </>
      ) : null}
      {error ? (
        <Alert className="error" type="error" showIcon message={error} />
      ) : null}

      <div
        className={
          modelLoading && model ? 'sidebar-tree-section is-loading' : 'sidebar-tree-section'
        }
      >
        {modelLoading ? (
          <div className="sidebar-model-loader" role="status" aria-live="polite" aria-busy="true">
            <Spin size="small" />
            <span>{model ? 'Обновление модели…' : 'Загрузка модели…'}</span>
          </div>
        ) : null}
        {!(modelLoading && !model) ? (
          <ModelTree
            model={model}
            treeSearchActive={treeSearchActive}
            treeSearchPending={immediateSearchState.isPending}
            treeSearchRemainingChars={immediateSearchState.remainingChars}
            filteredTreeElements={filteredTreeElements}
            filteredTreeRelationships={filteredTreeRelationships}
            filteredTreeDiagrams={filteredTreeDiagrams}
            elementSearchMeta={elementSearchMeta}
            relationshipSearchMeta={relationshipSearchMeta}
            diagramSearchMeta={diagramSearchMeta}
            elementOverrides={elementOverrides}
            selectedElementId={selectedElementId}
            selectedRelationshipRef={selectedRelationshipRef}
            selectedDiagramId={selectedDiagramId}
            sidebarTreeSearch={sidebarTreeSearch}
            onSidebarTreeSearchChange={setSidebarTreeSearch}
        focusElementInDiagram={focusElementInDiagram}
        focusRelationshipInDiagram={focusRelationshipInDiagram}
        onSelectElement={onSelectElement}
        onSelectRelationship={onSelectRelationship}
        onSelectDiagram={onSelectDiagram}
        allowElementDrag={!isViewMode && Boolean(model)}
        allowDiagramDrag={!isViewMode && Boolean(model)}
        onCreateDiagram={!isViewMode && model ? onCreateDiagram : undefined}
          />
        ) : null}
      </div>
    </div>
  )
}
