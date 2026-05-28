import React, { useMemo } from 'react'
import { setSidebarElementDragData } from '../../lib/archimate/sidebar-drag'
import {
  buildDiagramFolderTree,
  countItemsInFolderTree,
} from '../../lib/archimate/model-folder-tree'
import { TreeSection } from './tree-folder-branch'
import { VirtualList } from './virtual-list'
import { getRelationshipDisplayLabel } from '../../lib/archimate/relationship-meta'
import type {
  ParsedModel,
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  DiagramNode,
  ElementOverride,
} from '../../types/model'

const ELEMENT_ROW_HEIGHT = 52
const VIRTUAL_LIST_THRESHOLD = 80

interface FocusElementResult {
  diagramId: string | null
  node: DiagramNode | null
  pending?: boolean
}

interface ModelTreeProps {
  model: ParsedModel | null
  treeSearchNorm: string
  filteredTreeElements: ParsedElement[]
  filteredTreeRelationships: ParsedRelationship[]
  filteredTreeDiagrams: ParsedDiagram[]
  elementOverrides: Map<string, ElementOverride>
  selectedElementId: string | null
  selectedRelationshipRef: string | null
  selectedDiagramId: string | null
  sidebarTreeSearch: string
  onSidebarTreeSearchChange: (value: string) => void
  onSelectElement: (
    id: string,
    context: { diagramId: string; node?: DiagramNode; pending?: boolean } | null,
  ) => void
  onSelectRelationship: (id: string, diagramId: string | null) => void
  onSelectDiagram: (id: string) => void
  focusElementInDiagram?: (elementId: string) => FocusElementResult
  focusRelationshipInDiagram?: (relationshipId: string) => string | null
  allowElementDrag?: boolean
  onCreateDiagram?: () => void
}

export function ModelTree({
  model,
  treeSearchNorm,
  filteredTreeElements,
  filteredTreeRelationships,
  filteredTreeDiagrams,
  elementOverrides,
  selectedElementId,
  selectedRelationshipRef,
  selectedDiagramId,
  sidebarTreeSearch,
  onSidebarTreeSearchChange,
  onSelectElement,
  onSelectRelationship,
  onSelectDiagram,
  focusElementInDiagram,
  focusRelationshipInDiagram,
  allowElementDrag = false,
  onCreateDiagram,
}: ModelTreeProps): React.JSX.Element {
  function handleElementDragStart(event: React.DragEvent<HTMLElement>, elementId: string): void {
    setSidebarElementDragData(event.dataTransfer, elementId)
    event.currentTarget.classList.add('is-dragging')
  }

  function handleElementDragEnd(event: React.DragEvent<HTMLElement>): void {
    event.currentTarget.classList.remove('is-dragging')
  }

  const { folders: diagramFolderTree, rootDiagrams: rootTreeDiagrams } = useMemo(
    () => buildDiagramFolderTree(filteredTreeDiagrams),
    [filteredTreeDiagrams],
  )

  const visibleDiagramCount = useMemo(
    () => countItemsInFolderTree(diagramFolderTree, 'diagram') + rootTreeDiagrams.length,
    [diagramFolderTree, rootTreeDiagrams],
  )

  const useVirtualElements =
    !treeSearchNorm && filteredTreeElements.length >= VIRTUAL_LIST_THRESHOLD

  const elementsOpenByDefault = (model?.elements.length ?? 0) < VIRTUAL_LIST_THRESHOLD

  function handleElementSelect(item: ParsedElement): void {
    if (focusElementInDiagram) {
      const { diagramId, node, pending } = focusElementInDiagram(item.id)
      if (diagramId) {
        onSelectDiagram(diagramId)
      }
      onSelectElement(
        item.id,
        node ? { diagramId: diagramId!, node } : pending && diagramId ? { diagramId, pending: true } : null,
      )
      return
    }

    onSelectElement(item.id, null)
  }

  function handleRelationshipSelect(item: ParsedRelationship): void {
    const diagramId = focusRelationshipInDiagram
      ? focusRelationshipInDiagram(item.id)
      : null
    if (diagramId) {
      onSelectDiagram(diagramId)
    }
    onSelectRelationship(item.id, diagramId)
  }

  function renderElementRow(item: ParsedElement): React.JSX.Element {
    return (
      <button
        type="button"
        draggable={false}
        className={selectedElementId === item.id ? 'tree-btn selected' : 'tree-btn'}
        onClick={() => handleElementSelect(item)}
      >
        <span className="node-label">{elementOverrides.get(item.id)?.name ?? item.name}</span>
        <span className="node-type">{item.type}</span>
      </button>
    )
  }

  if (!model) {
    return (
      <p className="hint">
        Модель не загружена. Клонируйте репозиторий в «Администрирование» → Git или откройте существующий
        репозиторий в настройках.
      </p>
    )
  }

  return (
    <div className="tree">
      <label className="tree-search-label">
        Поиск по дереву
        <input
          type="search"
          className="tree-search-input"
          value={sidebarTreeSearch}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSidebarTreeSearchChange(e.target.value)}
          placeholder="Имя, тип, id…"
          spellCheck={false}
          autoComplete="off"
          aria-label="Поиск по элементам, связям и диаграммам"
        />
      </label>
      {model.format === 'split-files' && model.elements.length >= VIRTUAL_LIST_THRESHOLD ? (
        <p className="tree-hint-compact">
          Элементы: лёгкий индекс ({model.elements.length.toLocaleString()}). Детали подгружаются при
          выборе. Используйте поиск для узкого списка.
        </p>
      ) : null}
      <details open>
        <summary>{model.modelName}</summary>
        <details open={elementsOpenByDefault}>
          <summary>
            Elements (
            {treeSearchNorm
              ? `${filteredTreeElements.length} / ${model.elements.length}`
              : model.elements.length}
            )
          </summary>
          {filteredTreeElements.length === 0 ? (
            <p className="tree-search-empty">Нет совпадений</p>
          ) : useVirtualElements ? (
            <VirtualList
              items={filteredTreeElements}
              itemHeight={ELEMENT_ROW_HEIGHT}
              getItemKey={(item: ParsedElement) => item.id}
              maxHeight={400}
              renderItem={(item: ParsedElement) => (
                <div
                  className={allowElementDrag ? 'tree-item-draggable' : undefined}
                  draggable={allowElementDrag}
                  title={
                    allowElementDrag
                      ? `${item.type} (${item.id}) — перетащите на диаграмму`
                      : `${item.type} (${item.id})`
                  }
                  onDragStart={
                    allowElementDrag
                      ? (event: React.DragEvent<HTMLDivElement>) => handleElementDragStart(event, item.id)
                      : undefined
                  }
                  onDragEnd={allowElementDrag ? handleElementDragEnd : undefined}
                >
                  {renderElementRow(item)}
                </div>
              )}
            />
          ) : (
            <ul>
              {filteredTreeElements.map((item) => (
                <li
                  key={item.id}
                  className={allowElementDrag ? 'tree-item-draggable' : undefined}
                  draggable={allowElementDrag}
                  title={
                    allowElementDrag
                      ? `${item.type} (${item.id}) — перетащите на диаграмму`
                      : `${item.type} (${item.id})`
                  }
                  onDragStart={
                    allowElementDrag
                      ? (event: React.DragEvent<HTMLLIElement>) => handleElementDragStart(event, item.id)
                      : undefined
                  }
                  onDragEnd={allowElementDrag ? handleElementDragEnd : undefined}
                >
                  {renderElementRow(item)}
                </li>
              ))}
            </ul>
          )}
        </details>
        <details>
          <summary>
            Relationships (
            {treeSearchNorm
              ? `${filteredTreeRelationships.length} / ${model.relationships.length}`
              : model.relationships.length}
            )
          </summary>
          <ul>
            {filteredTreeRelationships.length === 0 ? (
              <li className="tree-search-empty">Нет совпадений</li>
            ) : (
              filteredTreeRelationships.map((item) => (
                <li key={item.id} title={`${item.source} -> ${item.target}`}>
                  <button
                    type="button"
                    className={
                      selectedRelationshipRef === item.id ? 'tree-btn selected' : 'tree-btn'
                    }
                    onClick={() => handleRelationshipSelect(item)}
                  >
                    <span className="node-label">
                      {getRelationshipDisplayLabel(item) || item.id}
                    </span>
                    <span className="node-type">{item.type}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </details>
        <TreeSection
          title="Diagrams"
          totalCount={model.diagrams.length}
          visibleCount={visibleDiagramCount}
          treeSearchNorm={treeSearchNorm}
          folders={diagramFolderTree}
          rootDiagrams={rootTreeDiagrams}
          emptyMessage={treeSearchNorm ? 'Нет совпадений' : 'Нет диаграмм'}
          elementOverrides={elementOverrides}
          selectedElementId={selectedElementId}
          selectedRelationshipRef={selectedRelationshipRef}
          selectedDiagramId={selectedDiagramId}
          onSelectElement={onSelectElement}
          onSelectRelationship={onSelectRelationship}
          onSelectDiagram={onSelectDiagram}
          findDiagramForElement={
            focusElementInDiagram
              ? (elementId: string) => {
                  const { diagramId, node } = focusElementInDiagram(elementId)
                  return diagramId && node ? { diagramId, node } : null
                }
              : undefined
          }
          findDiagramForRelationship={
            focusRelationshipInDiagram
              ? (relationshipId: string) => focusRelationshipInDiagram(relationshipId)
              : undefined
          }
          onCreateDiagram={onCreateDiagram}
        />
      </details>
    </div>
  )
}
