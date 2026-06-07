import React, { useMemo } from 'react'
import { Button, Collapse, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
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
  allowDiagramDrag?: boolean
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
  allowDiagramDrag = false,
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

  function handleElementSelect(item: ParsedElement): void {
    onSelectElement(item.id, null)
  }

  function handleRelationshipSelect(item: ParsedRelationship): void {
    onSelectRelationship(item.id, null)
  }

  function renderElementRow(item: ParsedElement): React.JSX.Element {
    return (
      <Button
        type={selectedElementId === item.id ? 'primary' : 'text'}
        ghost={selectedElementId === item.id}
        draggable={false}
        className="tree-btn"
        onClick={() => handleElementSelect(item)}
      >
        <span className="node-label">{elementOverrides.get(item.id)?.name ?? item.name}</span>
        <span className="node-type">{item.type}</span>
      </Button>
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

  const elementsPanel = (
    <>
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
        <ul className="tree-list">
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
    </>
  )

  const relationshipsPanel =
    filteredTreeRelationships.length === 0 ? (
      <p className="tree-search-empty">Нет совпадений</p>
    ) : (
      <ul className="tree-list">
        {filteredTreeRelationships.map((item) => (
          <li key={item.id} title={`${item.source} -> ${item.target}`}>
            <Button
              type={selectedRelationshipRef === item.id ? 'primary' : 'text'}
              ghost={selectedRelationshipRef === item.id}
              className="tree-btn"
              onClick={() => handleRelationshipSelect(item)}
            >
              <span className="node-label">
                {getRelationshipDisplayLabel(item) || item.id}
              </span>
              <span className="node-type">{item.type}</span>
            </Button>
          </li>
        ))}
      </ul>
    )

  const innerItems = [
    {
      key: 'elements',
      label: `Elements (${
        treeSearchNorm
          ? `${filteredTreeElements.length} / ${model.elements.length}`
          : model.elements.length
      })`,
      children: elementsPanel,
    },
    {
      key: 'relationships',
      label: `Relationships (${
        treeSearchNorm
          ? `${filteredTreeRelationships.length} / ${model.relationships.length}`
          : model.relationships.length
      })`,
      children: relationshipsPanel,
    },
    {
      key: 'diagrams',
      label: `Diagrams (${
        treeSearchNorm ? `${visibleDiagramCount} / ${model.diagrams.length}` : model.diagrams.length
      })`,
      extra: onCreateDiagram ? (
        <Button
          size="small"
          className="tree-section-add-btn"
          title="Создать диаграмму"
          aria-label="Создать диаграмму"
          onClick={(event) => {
            event.stopPropagation()
            onCreateDiagram()
          }}
        >
          +
        </Button>
      ) : undefined,
      children: (
        <TreeSection
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
          allowDiagramDrag={allowDiagramDrag}
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
        />
      ),
    },
  ]

  const defaultInnerKeys = ['diagrams']

  return (
    <div className="tree">
      <Input
        className="tree-search-input"
        allowClear
        prefix={<SearchOutlined />}
        value={sidebarTreeSearch}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSidebarTreeSearchChange(e.target.value)}
        placeholder="Поиск: имя, тип, id…"
        spellCheck={false}
        autoComplete="off"
        aria-label="Поиск по элементам, связям и диаграммам"
      />
      {model.format === 'split-files' && model.elements.length >= VIRTUAL_LIST_THRESHOLD ? (
        <p className="tree-hint-compact">
          Элементы: лёгкий индекс ({model.elements.length.toLocaleString()}). Детали подгружаются при
          выборе. Используйте поиск для узкого списка.
        </p>
      ) : null}
      <Collapse
        className="tree-collapse"
        defaultActiveKey={['model']}
        items={[
          {
            key: 'model',
            label: model.modelName,
            children: (
              <Collapse
                className="tree-collapse"
                defaultActiveKey={defaultInnerKeys}
                items={innerItems}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
