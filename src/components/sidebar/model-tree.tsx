import React, { useEffect, useMemo, useState } from 'react'
import { Button, Collapse, Input } from 'antd'
import { SearchOutlined, FolderOutlined } from '@ant-design/icons'
import {
  buildDiagramFolderTree,
  buildElementFolderTree,
  countItemsInFolderTree,
} from '../../lib/archimate/model-folder-tree'
import { DiagramTreePanel } from './diagram-tree-panel'
import { ElementTreePanel } from './element-tree-panel'
import { getRelationshipDisplayLabel } from '../../lib/archimate/relationship-meta'
import { TREE_SEARCH_MIN_LENGTH } from '../../lib/archimate/tree-search'
import type {
  ParsedModel,
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  DiagramNode,
  ElementOverride,
} from '../../types/model'

interface TreeSearchSectionMeta {
  truncated: boolean
  totalMatches: number
}

interface FocusElementResult {
  diagramId: string | null
  node: DiagramNode | null
  pending?: boolean
}

interface ModelTreeProps {
  model: ParsedModel | null
  treeSearchActive: boolean
  treeSearchPending: boolean
  treeSearchRemainingChars: number
  filteredTreeElements: ParsedElement[]
  filteredTreeRelationships: ParsedRelationship[]
  filteredTreeDiagrams: ParsedDiagram[]
  elementSearchMeta: TreeSearchSectionMeta
  relationshipSearchMeta: TreeSearchSectionMeta
  diagramSearchMeta: TreeSearchSectionMeta
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
  onSelectDiagramFolder?: (folderKey: string) => void
  diagramTreeSelectedKey?: string
  focusElementInDiagram?: (elementId: string) => FocusElementResult
  focusRelationshipInDiagram?: (relationshipId: string) => string | null
  allowElementDrag?: boolean
  allowDiagramDrag?: boolean
  onCreateDiagram?: () => void
  onCreateFolder?: () => void
}

const DEFAULT_INNER_KEYS = ['diagrams']

export function ModelTree({
  model,
  treeSearchActive,
  treeSearchPending,
  treeSearchRemainingChars,
  filteredTreeElements,
  filteredTreeRelationships,
  filteredTreeDiagrams,
  elementSearchMeta,
  relationshipSearchMeta,
  diagramSearchMeta,
  elementOverrides,
  selectedElementId,
  selectedRelationshipRef,
  selectedDiagramId,
  sidebarTreeSearch,
  onSidebarTreeSearchChange,
  onSelectElement,
  onSelectRelationship,
  onSelectDiagram,
  onSelectDiagramFolder,
  diagramTreeSelectedKey = '',
  allowElementDrag = false,
  allowDiagramDrag = false,
  onCreateDiagram,
  onCreateFolder,
}: ModelTreeProps): React.JSX.Element {
  const [innerActiveKeys, setInnerActiveKeys] = useState<string[]>(DEFAULT_INNER_KEYS)

  useEffect(() => {
    if (!treeSearchActive) {
      return
    }
    setInnerActiveKeys((current) => {
      const next = new Set(current)
      next.add('elements')
      next.add('relationships')
      next.add('diagrams')
      return [...next]
    })
  }, [treeSearchActive])

  const elementsSectionOpen = treeSearchActive || innerActiveKeys.includes('elements')
  const relationshipsSectionOpen =
    treeSearchActive || innerActiveKeys.includes('relationships')

  const { folders: elementFolderTree, rootElements: rootTreeElements } = useMemo(() => {
    if (!elementsSectionOpen) {
      return {
        folders: [] as ReturnType<typeof buildElementFolderTree>['folders'],
        rootElements: [] as ParsedElement[],
      }
    }
    return buildElementFolderTree(filteredTreeElements, {
      deferElementSort: !treeSearchActive,
    })
  }, [elementsSectionOpen, filteredTreeElements, treeSearchActive])

  const { folders: diagramFolderTree, rootDiagrams: rootTreeDiagrams } = useMemo(
    () => buildDiagramFolderTree(filteredTreeDiagrams, model?.diagramFolderPaths ?? []),
    [filteredTreeDiagrams, model?.diagramFolderPaths],
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

  const elementsPanel = elementsSectionOpen ? (
    <>
      {elementSearchMeta.truncated ? (
        <p className="tree-hint-compact">
          Показаны первые {filteredTreeElements.length.toLocaleString()} из{' '}
          {elementSearchMeta.totalMatches.toLocaleString()}. Уточните запрос.
        </p>
      ) : null}
      {!treeSearchActive ? (
        <p className="tree-hint-compact">Элементы подгружаются при раскрытии папки.</p>
      ) : null}
      <ElementTreePanel
        folders={elementFolderTree}
        rootElements={rootTreeElements}
        elementOverrides={elementOverrides}
        selectedElementId={selectedElementId}
        treeSearchActive={treeSearchActive}
        emptyMessage={treeSearchActive ? 'Нет совпадений' : 'Нет элементов'}
        allowElementDrag={allowElementDrag}
        onSelectElement={(elementId) => onSelectElement(elementId, null)}
      />
    </>
  ) : null

  const relationshipsPanel = !relationshipsSectionOpen ? null : filteredTreeRelationships.length === 0 ? (
    <p className="tree-search-empty">
      {treeSearchActive ? 'Нет совпадений' : 'Нет связей'}
    </p>
  ) : (
    <>
      {relationshipSearchMeta.truncated ? (
        <p className="tree-hint-compact">
          Показаны первые {filteredTreeRelationships.length} из{' '}
          {relationshipSearchMeta.totalMatches.toLocaleString()}. Уточните запрос.
        </p>
      ) : null}
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
    </>
  )

  const innerItems = [
    {
      key: 'elements',
      label: `Elements (${
        treeSearchActive
          ? `${elementSearchMeta.totalMatches.toLocaleString()} / ${model.elements.length.toLocaleString()}`
          : model.elements.length.toLocaleString()
      })`,
      children: elementsPanel,
    },
    {
      key: 'relationships',
      label: `Relationships (${
        treeSearchActive
          ? `${relationshipSearchMeta.totalMatches.toLocaleString()} / ${model.relationships.length.toLocaleString()}`
          : model.relationships.length.toLocaleString()
      })`,
      children: relationshipsPanel,
    },
    {
      key: 'diagrams',
      label: `Diagrams (${
        treeSearchActive
          ? `${diagramSearchMeta.totalMatches.toLocaleString()} / ${model.diagrams.length.toLocaleString()}`
          : model.diagrams.length.toLocaleString()
      })`,
      extra:
        onCreateDiagram || onCreateFolder ? (
          <span className="tree-section-actions">
            {onCreateFolder ? (
              <Button
                size="small"
                className="tree-section-add-btn"
                title="Создать папку"
                aria-label="Создать папку"
                onClick={(event) => {
                  event.stopPropagation()
                  onCreateFolder()
                }}
              >
                <FolderOutlined />
              </Button>
            ) : null}
            {onCreateDiagram ? (
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
            ) : null}
          </span>
        ) : undefined,
      children: (
        <DiagramTreePanel
          folders={diagramFolderTree}
          rootDiagrams={rootTreeDiagrams}
          selectedDiagramId={selectedDiagramId}
          diagramTreeSelectedKey={diagramTreeSelectedKey}
          treeSearchActive={treeSearchActive}
          emptyMessage={treeSearchActive ? 'Нет совпадений' : 'Нет диаграмм'}
          searchTruncated={diagramSearchMeta.truncated}
          searchTotalMatches={diagramSearchMeta.totalMatches}
          searchVisibleCount={visibleDiagramCount}
          allowDiagramDrag={allowDiagramDrag}
          onSelectDiagram={onSelectDiagram}
          onSelectFolder={onSelectDiagramFolder ?? (() => {})}
        />
      ),
    },
  ]

  return (
    <div className="tree">
      <Input
        className="tree-search-input"
        allowClear
        prefix={<SearchOutlined />}
        value={sidebarTreeSearch}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSidebarTreeSearchChange(e.target.value)}
        placeholder={`Поиск: мин. ${TREE_SEARCH_MIN_LENGTH} символа…`}
        spellCheck={false}
        autoComplete="off"
        aria-label="Поиск по элементам, связям и диаграммам"
      />
      {treeSearchPending ? (
        <p className="tree-hint-compact">
          Введите ещё {treeSearchRemainingChars}{' '}
          {treeSearchRemainingChars === 1 ? 'символ' : 'символа'} для поиска.
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
                activeKey={innerActiveKeys}
                destroyOnHidden
                onChange={(keys) => {
                  const next = Array.isArray(keys) ? keys.map(String) : [String(keys)]
                  setInnerActiveKeys(next)
                }}
                items={innerItems}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
