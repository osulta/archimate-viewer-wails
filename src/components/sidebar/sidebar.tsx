import React, { useMemo, useState } from 'react'
import { Alert, Spin, Typography } from 'antd'
import { applyRelationshipMetaToList } from '../../lib/archimate/relationship-meta'
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
  modelLayoutHint?: string
  saveTargetPath?: string
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
  modelLayoutHint = '',
  saveTargetPath,
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
  const debouncedTreeSearch = useDebouncedValue(sidebarTreeSearch, 200)
  const treeSearchNorm = debouncedTreeSearch.trim().toLowerCase()

  const filteredTreeElements = useMemo(() => {
    if (!model) {
      return [] as ParsedElement[]
    }
    if (!treeSearchNorm) {
      return model.elements
    }
    return model.elements.filter((item) => {
      const name = elementOverrides.get(item.id)?.name ?? item.name
      const hay = [name, item.type, item.id, item.folderPath ?? ''].join(' ').toLowerCase()
      return hay.includes(treeSearchNorm)
    })
  }, [model, treeSearchNorm, elementOverrides])

  const filteredTreeRelationships = useMemo(() => {
    if (!model) {
      return [] as ParsedRelationship[]
    }
    const relationships = applyRelationshipMetaToList(
      model.relationships,
      relationshipMetaOverrides,
    )
    if (!treeSearchNorm) {
      return relationships
    }
    return relationships.filter((item: ParsedRelationship) => {
      const hay = [item.name, item.id, item.type, item.source, item.target]
        .join(' ')
        .toLowerCase()
      return hay.includes(treeSearchNorm)
    })
  }, [model, treeSearchNorm, relationshipMetaOverrides])

  const filteredTreeDiagrams = useMemo(() => {
    if (!model) {
      return [] as ParsedDiagram[]
    }
    if (!treeSearchNorm) {
      return model.diagrams
    }
    return model.diagrams.filter((d) => {
      const label = d.folderPath ? `${d.folderPath} / ${d.name}` : d.name
      const hay = [label, d.name, d.folderPath ?? '', d.id, d.type ?? ''].join(' ').toLowerCase()
      return hay.includes(treeSearchNorm)
    })
  }, [model, treeSearchNorm])

  return (
    <div className="sidebar">
      <Typography.Title level={4} className="sidebar-title">
        ArchiMate Viewer
      </Typography.Title>
      {!isViewMode && model ? (
        <>
          {modelLayoutHint ? (
            <p className="save-path-hint" title="Формат загрузки модели">
              {modelLayoutHint}
            </p>
          ) : null}
          {saveTargetPath ? (
            <p className="save-path-hint" title="Файл на диске (относительно GIT_REPO_ROOT)">
              → {saveTargetPath}
            </p>
          ) : null}
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
            treeSearchNorm={treeSearchNorm}
            filteredTreeElements={filteredTreeElements}
            filteredTreeRelationships={filteredTreeRelationships}
            filteredTreeDiagrams={filteredTreeDiagrams}
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
