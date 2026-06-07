import React, { useMemo } from 'react'
import { Button, Collapse, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import {
  buildDiagramFolderTree,
  buildElementFolderTree,
  countItemsInFolderTree,
} from '../../lib/archimate/model-folder-tree'
import { DiagramTreePanel } from './diagram-tree-panel'
import { ElementTreePanel } from './element-tree-panel'
import { getRelationshipDisplayLabel } from '../../lib/archimate/relationship-meta'
import type {
  ParsedModel,
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  DiagramNode,
  ElementOverride,
} from '../../types/model'

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
  const { folders: elementFolderTree, rootElements: rootTreeElements } = useMemo(
    () => buildElementFolderTree(filteredTreeElements),
    [filteredTreeElements],
  )

  const { folders: diagramFolderTree, rootDiagrams: rootTreeDiagrams } = useMemo(
    () => buildDiagramFolderTree(filteredTreeDiagrams),
    [filteredTreeDiagrams],
  )

  const visibleElementCount = useMemo(
    () => countItemsInFolderTree(elementFolderTree, 'element') + rootTreeElements.length,
    [elementFolderTree, rootTreeElements],
  )

  const visibleDiagramCount = useMemo(
    () => countItemsInFolderTree(diagramFolderTree, 'diagram') + rootTreeDiagrams.length,
    [diagramFolderTree, rootTreeDiagrams],
  )

  function handleRelationshipSelect(item: ParsedRelationship): void {
    onSelectRelationship(item.id, null)
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
    <ElementTreePanel
      folders={elementFolderTree}
      rootElements={rootTreeElements}
      elementOverrides={elementOverrides}
      selectedElementId={selectedElementId}
      treeSearchNorm={treeSearchNorm}
      emptyMessage={treeSearchNorm ? 'Нет совпадений' : 'Нет элементов'}
      allowElementDrag={allowElementDrag}
      onSelectElement={(elementId) => onSelectElement(elementId, null)}
    />
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
          ? `${visibleElementCount} / ${model.elements.length}`
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
        <DiagramTreePanel
          folders={diagramFolderTree}
          rootDiagrams={rootTreeDiagrams}
          selectedDiagramId={selectedDiagramId}
          treeSearchNorm={treeSearchNorm}
          emptyMessage={treeSearchNorm ? 'Нет совпадений' : 'Нет диаграмм'}
          allowDiagramDrag={allowDiagramDrag}
          onSelectDiagram={onSelectDiagram}
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
