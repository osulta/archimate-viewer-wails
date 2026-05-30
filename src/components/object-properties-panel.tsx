import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ColorPicker, Empty, Input, Tabs } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { ObjectRelationshipsPanel } from './object-relationships-panel'
import { flattenNodes } from '../lib/archimate/diagram-model'
import { formatArchimateTypeLabel } from '../lib/archimate/model-folder-tree'
import { getElementNotationStyle } from '../lib/archimate/notation'
import {
  formatRelationshipEndpointLabel,
  getRelationshipDisplayLabel,
  getRelationshipExplicitName,
  resolveRelationshipTypeForCanvas,
} from '../lib/archimate/relationship-meta'
import type {
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  DiagramNode,
  DiagramConnection,
  ElementProperty,
  ElementOverride,
  RelationshipMetaOverride,
} from '../types/model'

interface RelationshipEntry {
  relationship: ParsedRelationship
  otherElementId: string
  direction: 'incoming' | 'outgoing' | 'self'
}

interface DiagramUsage {
  diagram: ParsedDiagram
  nodes: DiagramNode[]
}

function flushElementOverride(
  elementId: string,
  patch: Partial<ElementOverride>,
  onUpdateElementOverride: (id: string, patch: Partial<ElementOverride>) => void,
): void {
  if (elementId) {
    onUpdateElementOverride(elementId, patch)
  }
}

interface ElementPropertiesEditorProps {
  elementId: string
  properties: ElementProperty[]
  disabled?: boolean
  onChange: (next: ElementProperty[]) => void
  onCommit: (next: ElementProperty[]) => void
}

function ElementPropertiesEditor({
  elementId,
  properties,
  disabled = false,
  onChange,
  onCommit,
}: ElementPropertiesEditorProps): React.JSX.Element {
  const latestRef = useRef(properties)
  latestRef.current = properties

  const handleChange = (index: number, patch: Partial<ElementProperty>) => {
    const next = properties.map((prop, idx) => (idx === index ? { ...prop, ...patch } : prop))
    latestRef.current = next
    onChange(next)
  }

  const handleRemove = (index: number) => {
    const next = properties.filter((_, idx) => idx !== index)
    latestRef.current = next
    onChange(next)
    onCommit(next)
  }

  const handleAdd = () => {
    if (disabled) {
      return
    }
    const next = [...properties, { key: '', value: '' }]
    latestRef.current = next
    onChange(next)
  }

  const handleBlur = () => {
    onCommit(latestRef.current)
  }

  return (
    <div className="props-field-full props-properties-block">
      <div className="props-properties-head">
        <span className="props-label">Properties</span>
        <Button size="small" icon={<PlusOutlined />} onClick={handleAdd} disabled={disabled}>
          Добавить
        </Button>
      </div>
      {disabled ? (
        <p className="props-hint props-properties-empty">Загрузка свойств…</p>
      ) : properties.length === 0 ? (
        <p className="props-hint props-properties-empty">Свойства не заданы.</p>
      ) : (
        <ul className="props-list props-properties-list" aria-label="Properties">
          <li className="props-properties-header" aria-hidden="true">
            <span>Key</span>
            <span>Value</span>
            <span />
          </li>
          {properties.map((prop, idx) => (
            <li key={`${elementId}-prop-${idx}`} className="prop-row">
              <Input
                className="prop-input"
                placeholder="key"
                value={prop.key ?? ''}
                disabled={disabled}
                aria-label={`Property key ${idx + 1}`}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange(idx, { key: e.target.value })
                }
                onBlur={handleBlur}
                spellCheck={false}
                autoComplete="off"
              />
              <Input
                className="prop-input"
                placeholder="value"
                value={prop.value ?? ''}
                disabled={disabled}
                aria-label={`Property value ${idx + 1}`}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange(idx, { value: e.target.value })
                }
                onBlur={handleBlur}
                spellCheck={false}
                autoComplete="off"
              />
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={disabled}
                aria-label={`Удалить property ${idx + 1}`}
                onClick={() => handleRemove(idx)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface NodeDisplayEditorProps {
  node: DiagramNode
  elementType: string
  onFillColorChange: (fillColor: string | null) => void
}

function NodeDisplayEditor({
  node,
  elementType,
  onFillColorChange,
}: NodeDisplayEditorProps): React.JSX.Element {
  const defaultFill = getElementNotationStyle(elementType).fill
  const hasCustomFill = node.fillColor != null && node.fillColor.trim() !== ''
  const displayFill = hasCustomFill ? node.fillColor!.trim() : defaultFill

  return (
    <div className="props-grid props-display-panel">
      <div className="props-field-full">
        <span className="props-label">Фон объекта</span>
        <div className="props-display-color-row">
          <ColorPicker
            value={displayFill}
            disabledAlpha
            showText
            onChangeComplete={(color) => onFillColorChange(color.toHexString())}
          />
          <Button
            size="small"
            disabled={!hasCustomFill}
            onClick={() => onFillColorChange(null)}
          >
            По умолчанию
          </Button>
        </div>
        <p className="props-hint">
          Цвет по умолчанию для типа:{' '}
          <span
            className="props-display-swatch"
            style={{ backgroundColor: defaultFill }}
            aria-hidden="true"
          />{' '}
          {defaultFill}
        </p>
      </div>
    </div>
  )
}

function flushRelationshipMeta(
  relationshipId: string,
  patch: Partial<RelationshipMetaOverride>,
  onUpdateRelationshipMeta: (id: string, patch: Partial<RelationshipMetaOverride>) => void,
): void {
  if (relationshipId) {
    onUpdateRelationshipMeta(relationshipId, patch)
  }
}

interface ObjectPropertiesPanelProps {
  selectedRelationshipRef: string | null
  selectedRelationship: ParsedRelationship | null
  selectedNodeLive: DiagramNode | null
  selectedElementId: string | null
  selectedElement: ParsedElement | null
  selectedDiagram: ParsedDiagram | null
  selectedElementRelationships: RelationshipEntry[]
  diagramsUsingSelectedElement: DiagramUsage[]
  objectPropsTab: string
  onObjectPropsTabChange: (tab: string) => void
  elementById?: Map<string, ParsedElement>
  elementOverrides: Map<string, ElementOverride>
  onUpdateElementOverride: (id: string, patch: Partial<ElementOverride>) => void
  onUpdateRelationshipMeta: (id: string, patch: Partial<RelationshipMetaOverride>) => void
  onDeleteSelectedConnectionFromDiagram: () => void
  onDeleteRelationshipFromModel: () => void
  onDeleteSelectedFromDiagram: () => void
  onDeleteElementFromModel: () => void
  onSelectRelationshipFromProperties: (id: string) => void
  onSelectElementFromProperties: (id: string) => void
  onNavigateToDiagram: (payload: { diagramId: string; nodes: DiagramNode[] }) => void
  selectedDiagramId: string | null
  onUpdateDiagramMetadata?: (diagramId: string, patch: { name: string }) => void
  onUpdateNodeFillColor?: (nodeId: string, fillColor: string | null) => void
  elementLoadingId?: string
}

export function ObjectPropertiesPanel({
  selectedRelationshipRef,
  selectedRelationship,
  selectedNodeLive,
  selectedElementId,
  selectedElement,
  selectedDiagram,
  selectedElementRelationships,
  diagramsUsingSelectedElement,
  objectPropsTab,
  onObjectPropsTabChange,
  elementById,
  elementOverrides,
  onUpdateElementOverride,
  onUpdateRelationshipMeta,
  onDeleteSelectedConnectionFromDiagram,
  onDeleteRelationshipFromModel,
  onDeleteSelectedFromDiagram,
  onDeleteElementFromModel,
  onSelectRelationshipFromProperties,
  onSelectElementFromProperties,
  onNavigateToDiagram,
  selectedDiagramId,
  onUpdateDiagramMetadata,
  onUpdateNodeFillColor,
  elementLoadingId = '',
}: ObjectPropertiesPanelProps): React.JSX.Element | null {
  const [nameDraft, setNameDraft] = useState('')
  const [documentationDraft, setDocumentationDraft] = useState('')
  const [propertiesDraft, setPropertiesDraft] = useState<ElementProperty[]>([])
  const [relationshipNameDraft, setRelationshipNameDraft] = useState('')
  const [diagramNameDraft, setDiagramNameDraft] = useState('')

  const elementId = selectedElement?.id ?? ''
  const isElementPropertiesLoading =
    Boolean(elementLoadingId && elementId === elementLoadingId) || Boolean(selectedElement?.lite)
  const diagramNodeCount = useMemo(
    () => (selectedDiagram?.nodes ? flattenNodes(selectedDiagram.nodes).length : 0),
    [selectedDiagram?.nodes],
  )
  const showDiagramProperties =
    Boolean(selectedDiagram && selectedDiagramId) &&
    !selectedRelationshipRef &&
    !selectedNodeLive &&
    !selectedElementId

  useEffect(() => {
    if (!elementId) {
      setNameDraft('')
      setDocumentationDraft('')
      setPropertiesDraft([])
      return
    }
    if (!selectedElement) {
      return
    }
    setNameDraft(selectedElement.name ?? '')
    setDocumentationDraft(selectedElement.documentation ?? '')
    setPropertiesDraft(
      selectedElement.properties ? selectedElement.properties.map((p) => ({ ...p })) : [],
    )
    // Resync when selection changes or a split lite stub loads its full XML (properties, docs).
  }, [elementId, selectedElement?.lite])

  useEffect(() => {
    setRelationshipNameDraft(getRelationshipExplicitName(selectedRelationship))
  }, [selectedRelationship, selectedRelationshipRef])

  useEffect(() => {
    if (!selectedDiagramId || !selectedDiagram) {
      setDiagramNameDraft('')
      return
    }
    setDiagramNameDraft(selectedDiagram.name ?? '')
  }, [selectedDiagramId, selectedDiagram?.name])

  useEffect(() => {
    if (!showDiagramProperties || !selectedDiagramId) {
      return undefined
    }
    const handle = window.setTimeout(() => {
      onUpdateDiagramMetadata?.(selectedDiagramId, { name: diagramNameDraft })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [diagramNameDraft, selectedDiagramId, showDiagramProperties, onUpdateDiagramMetadata])

  useEffect(() => {
    if (!elementId) {
      return undefined
    }
    const handle = window.setTimeout(() => {
      onUpdateElementOverride(elementId, { name: nameDraft })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [nameDraft, elementId, onUpdateElementOverride])

  useEffect(() => {
    if (!elementId) {
      return undefined
    }
    const handle = window.setTimeout(() => {
      onUpdateElementOverride(elementId, { documentation: documentationDraft })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [documentationDraft, elementId, onUpdateElementOverride])

  useEffect(() => {
    if (!elementId) {
      return undefined
    }
    const handle = window.setTimeout(() => {
      onUpdateElementOverride(elementId, { properties: propertiesDraft })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [propertiesDraft, elementId, onUpdateElementOverride])

  useEffect(() => {
    if (!selectedRelationshipRef) {
      return undefined
    }
    const handle = window.setTimeout(() => {
      onUpdateRelationshipMeta(selectedRelationshipRef, { name: relationshipNameDraft })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [relationshipNameDraft, selectedRelationshipRef, onUpdateRelationshipMeta])

  if (showDiagramProperties) {
    const diagramTypeLabel = formatArchimateTypeLabel(selectedDiagram!.type ?? '')
    const diagramFolder = selectedDiagram!.folderPath?.trim()

    return (
      <section className="properties">
        <h3>Свойства диаграммы</h3>
        <div className="props-grid">
          <div>
            <b>Diagram ID:</b> {selectedDiagramId}
          </div>
          <div>
            <b>Name:</b>{' '}
            <Input
              className="prop-input"
              value={diagramNameDraft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDiagramNameDraft(e.target.value)}
              onBlur={() =>
                onUpdateDiagramMetadata?.(selectedDiagramId!, { name: diagramNameDraft })
              }
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div>
            <b>Type:</b> {diagramTypeLabel || selectedDiagram!.type || '—'}
          </div>
          {diagramFolder ? (
            <div>
              <b>Folder:</b> {diagramFolder}
            </div>
          ) : null}
          <div>
            <b>Objects on view:</b> {diagramNodeCount}
          </div>
          <div>
            <b>Connections on view:</b> {selectedDiagram!.connections?.length ?? 0}
          </div>
        </div>
      </section>
    )
  }

  if (selectedRelationshipRef && selectedRelationship) {
    const selectedConnection = selectedDiagram?.connections?.find(
      (c: DiagramConnection) => c.relationshipRef === selectedRelationshipRef,
    )
    const resolvedRelationshipType = resolveRelationshipTypeForCanvas(
      selectedRelationship,
      selectedConnection,
    )
    const relationshipTypeLabel = formatArchimateTypeLabel(resolvedRelationshipType)

    return (
      <section className="properties">
        <h3>Свойства relationship</h3>
        <div className="props-grid">
          <div>
            <b>Relationship ID:</b> {selectedRelationshipRef}
          </div>
          <div>
            <b>Name:</b>{' '}
            <Input
              className="prop-input"
              value={relationshipNameDraft}
              placeholder={
                getRelationshipDisplayLabel(selectedRelationship, selectedConnection) ||
                relationshipTypeLabel ||
                'Без имени'
              }
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRelationshipNameDraft(e.target.value)}
              onBlur={() =>
                flushRelationshipMeta(
                  selectedRelationshipRef,
                  { name: relationshipNameDraft },
                  onUpdateRelationshipMeta,
                )
              }
            />
          </div>
          <div>
            <b>Type:</b> {relationshipTypeLabel || '—'}
          </div>
          <div>
            <b>Endpoints:</b>
          </div>
          <div>
            <b>Source:</b>{' '}
            {formatRelationshipEndpointLabel(selectedRelationship?.source, elementById)}
          </div>
          <div>
            <b>Target:</b>{' '}
            {formatRelationshipEndpointLabel(selectedRelationship?.target, elementById)}
          </div>
          <div className="props-actions props-actions-stack">
            {selectedDiagram?.connections?.some(
              (c: DiagramConnection) => c.relationshipRef === selectedRelationshipRef,
            ) ? (
              <>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={onDeleteSelectedConnectionFromDiagram}
                >
                  Удалить с диаграммы
                </Button>
                <span className="props-hint">
                  Двойной клик по линии — добавить точку излома; по точке — удалить. Delete /
                  Backspace — удалить выбранную точку или всю связь на диаграмме.
                </span>
              </>
            ) : (
              <span className="props-hint">
                Связь не на текущей диаграмме — переключите диаграмму слева или удалите из модели
                ниже.
              </span>
            )}
            <Button
              danger
              type="primary"
              icon={<DeleteOutlined />}
              onClick={onDeleteRelationshipFromModel}
            >
              Удалить из модели
            </Button>
          </div>
        </div>
      </section>
    )
  }

  if (!selectedNodeLive && !selectedElementId) {
    return null
  }

  return (
    <section className="properties">
      <h3>Свойства объекта</h3>
      <Tabs
        className="props-tab-bar"
        activeKey={objectPropsTab}
        onChange={onObjectPropsTabChange}
        items={[
          { key: 'details', label: 'Детали' },
          { key: 'display', label: 'Отображение' },
          {
            key: 'relationships',
            label: `Связи объекта${
              selectedElementRelationships.length > 0
                ? ` (${selectedElementRelationships.length})`
                : ''
            }`,
          },
          {
            key: 'diagrams',
            label: `Диаграммы${
              diagramsUsingSelectedElement.length > 0
                ? ` (${diagramsUsingSelectedElement.length})`
                : ''
            }`,
          },
        ]}
      />
      {objectPropsTab === 'details' ? (
        <>
          <div className="props-grid">
            <div>
              <b>Node ID:</b> {selectedNodeLive ? selectedNodeLive.id : '-'}
            </div>
            <div>
              <b>Element ID:</b> {selectedNodeLive?.elementRef || selectedElementId || '-'}
            </div>
            <div>
              <b>Name:</b>{' '}
              {selectedElement ? (
                <Input
                  className="prop-input"
                  value={nameDraft}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameDraft(e.target.value)}
                  onBlur={() =>
                    flushElementOverride(elementId, { name: nameDraft }, onUpdateElementOverride)
                  }
                />
              ) : (
                '-'
              )}
            </div>
            <div>
              <b>Type:</b> {selectedElement?.type || selectedNodeLive?.type || '-'}
            </div>
            {selectedElement ? (
              <div className="props-field-full">
                <label className="props-label" htmlFor="element-documentation">
                  Documentation
                </label>
                <Input.TextArea
                  id="element-documentation"
                  className="prop-textarea"
                  rows={5}
                  value={documentationDraft}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDocumentationDraft(e.target.value)}
                  onBlur={() =>
                    flushElementOverride(
                      elementId,
                      { documentation: documentationDraft },
                      onUpdateElementOverride,
                    )
                  }
                  spellCheck={true}
                />
              </div>
            ) : null}
            {selectedElement ? (
              <ElementPropertiesEditor
                elementId={elementId}
                properties={propertiesDraft}
                disabled={isElementPropertiesLoading}
                onChange={setPropertiesDraft}
                onCommit={(next) =>
                  flushElementOverride(elementId, { properties: next }, onUpdateElementOverride)
                }
              />
            ) : null}
            <div>
              <b>Bounds:</b>{' '}
              {selectedNodeLive
                ? `x=${selectedNodeLive.x}, y=${selectedNodeLive.y}, w=${selectedNodeLive.width}, h=${selectedNodeLive.height}`
                : 'Объект не на текущей диаграмме'}
            </div>
            <div className="props-actions props-actions-stack">
              {selectedNodeLive ? (
                <>
                  <Button danger icon={<DeleteOutlined />} onClick={onDeleteSelectedFromDiagram}>
                    Удалить с диаграммы
                  </Button>
                  <span className="props-hint">
                    Delete / Backspace — объект на текущей диаграмме
                  </span>
                </>
              ) : null}
              {selectedElement ? (
                <Button
                  danger
                  type="primary"
                  icon={<DeleteOutlined />}
                  onClick={onDeleteElementFromModel}
                >
                  Удалить из модели
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
      {objectPropsTab === 'display' ? (
        selectedNodeLive ? (
          <NodeDisplayEditor
            node={selectedNodeLive}
            elementType={selectedElement?.type || selectedNodeLive.type || ''}
            onFillColorChange={(fillColor) =>
              onUpdateNodeFillColor?.(selectedNodeLive.id, fillColor)
            }
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Объект не на текущей диаграмме — откройте диаграмму с этим объектом, чтобы изменить отображение."
          />
        )
      ) : null}
      {objectPropsTab === 'relationships' && (selectedElement || selectedElementId) ? (
        <ObjectRelationshipsPanel
          elementId={selectedElement?.id ?? selectedElementId!}
          entries={selectedElementRelationships}
          elementById={elementById ?? new Map()}
          elementOverrides={elementOverrides}
          onSelectRelationship={onSelectRelationshipFromProperties}
          onSelectElement={onSelectElementFromProperties}
        />
      ) : null}
      {objectPropsTab === 'diagrams' ? (
        <div className="props-diagrams-panel">
          {diagramsUsingSelectedElement.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Элемент ни на одной диаграмме не отображается."
            />
          ) : (
            <ul className="props-diagram-list">
              {diagramsUsingSelectedElement.map(({ diagram, nodes }) => (
                <li key={diagram.id}>
                  <Button
                    type={selectedDiagramId === diagram.id ? 'primary' : 'default'}
                    ghost={selectedDiagramId === diagram.id}
                    block
                    className="diagram-btn diagram-btn-block"
                    onClick={() => onNavigateToDiagram({ diagramId: diagram.id, nodes })}
                  >
                    <span className="props-diagram-title">
                      {diagram.folderPath
                        ? `${diagram.folderPath} / ${diagram.name}`
                        : diagram.name}
                    </span>
                    {nodes.length > 1 ? (
                      <span className="props-diagram-badge">{nodes.length} экз.</span>
                    ) : null}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
