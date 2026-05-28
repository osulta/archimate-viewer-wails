import React, { useEffect, useMemo, useState } from 'react'
import { ObjectRelationshipsPanel } from './object-relationships-panel'
import { flattenNodes } from '../lib/archimate/diagram-model'
import { formatArchimateTypeLabel } from '../lib/archimate/model-folder-tree'
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
}: ObjectPropertiesPanelProps): React.JSX.Element | null {
  const [nameDraft, setNameDraft] = useState('')
  const [documentationDraft, setDocumentationDraft] = useState('')
  const [propertiesDraft, setPropertiesDraft] = useState<ElementProperty[]>([])
  const [relationshipNameDraft, setRelationshipNameDraft] = useState('')
  const [diagramNameDraft, setDiagramNameDraft] = useState('')

  const elementId = selectedElement?.id ?? ''
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
    // Sync local drafts only when the selected element changes, not on debounced override updates.
  }, [elementId])

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
            <input
              className="prop-input"
              type="text"
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
            <input
              className="prop-input"
              type="text"
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
                <button
                  type="button"
                  className="delete-object-btn"
                  onClick={onDeleteSelectedConnectionFromDiagram}
                >
                  Удалить с диаграммы
                </button>
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
            <button
              type="button"
              className="delete-model-btn"
              onClick={onDeleteRelationshipFromModel}
            >
              Удалить из модели
            </button>
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
      <div className="props-tab-bar" role="tablist" aria-label="Разделы свойств объекта">
        <button
          type="button"
          role="tab"
          aria-selected={objectPropsTab === 'details'}
          className={objectPropsTab === 'details' ? 'props-tab props-tab-active' : 'props-tab'}
          onClick={() => onObjectPropsTabChange('details')}
        >
          Детали
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={objectPropsTab === 'relationships'}
          className={
            objectPropsTab === 'relationships' ? 'props-tab props-tab-active' : 'props-tab'
          }
          onClick={() => onObjectPropsTabChange('relationships')}
        >
          Связи объекта
          {selectedElementRelationships.length > 0
            ? ` (${selectedElementRelationships.length})`
            : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={objectPropsTab === 'diagrams'}
          className={objectPropsTab === 'diagrams' ? 'props-tab props-tab-active' : 'props-tab'}
          onClick={() => onObjectPropsTabChange('diagrams')}
        >
          Диаграммы
          {diagramsUsingSelectedElement.length > 0
            ? ` (${diagramsUsingSelectedElement.length})`
            : ''}
        </button>
      </div>
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
                <input
                  className="prop-input"
                  type="text"
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
                <textarea
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
            <div>
              <b>Bounds:</b>{' '}
              {selectedNodeLive
                ? `x=${selectedNodeLive.x}, y=${selectedNodeLive.y}, w=${selectedNodeLive.width}, h=${selectedNodeLive.height}`
                : 'Объект не на текущей диаграмме'}
            </div>
            <div className="props-actions props-actions-stack">
              {selectedNodeLive ? (
                <>
                  <button
                    type="button"
                    className="delete-object-btn"
                    onClick={onDeleteSelectedFromDiagram}
                  >
                    Удалить с диаграммы
                  </button>
                  <span className="props-hint">
                    Delete / Backspace — объект на текущей диаграмме
                  </span>
                </>
              ) : null}
              {selectedElement ? (
                <button
                  type="button"
                  className="delete-model-btn"
                  onClick={onDeleteElementFromModel}
                >
                  Удалить из модели
                </button>
              ) : null}
            </div>
          </div>
          {selectedElement ? (
            <>
              <ul className="props-list">
                {propertiesDraft.map((prop, idx) => (
                  <li key={`${prop.key}-${idx}`} className="prop-row">
                    <input
                      className="prop-input"
                      type="text"
                      placeholder="key"
                      value={prop.key ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const next = [...propertiesDraft]
                        next[idx] = { ...next[idx], key: e.target.value }
                        setPropertiesDraft(next)
                      }}
                      onBlur={() =>
                        flushElementOverride(
                          elementId,
                          { properties: propertiesDraft },
                          onUpdateElementOverride,
                        )
                      }
                    />
                    <input
                      className="prop-input"
                      type="text"
                      placeholder="value"
                      value={prop.value ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const next = [...propertiesDraft]
                        next[idx] = { ...next[idx], value: e.target.value }
                        setPropertiesDraft(next)
                      }}
                      onBlur={() =>
                        flushElementOverride(
                          elementId,
                          { properties: propertiesDraft },
                          onUpdateElementOverride,
                        )
                      }
                    />
                    <button
                      type="button"
                      className="prop-delete-btn"
                      onClick={() => {
                        const next = [...propertiesDraft]
                        next.splice(idx, 1)
                        setPropertiesDraft(next)
                        flushElementOverride(
                          elementId,
                          { properties: next },
                          onUpdateElementOverride,
                        )
                      }}
                    >
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="add-prop-btn"
                onClick={() => {
                  const next = [...propertiesDraft, { key: '', value: '' }]
                  setPropertiesDraft(next)
                }}
              >
                Добавить property
              </button>
            </>
          ) : null}
        </>
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
            <p className="props-empty">Элемент ни на одной диаграмме не отображается.</p>
          ) : (
            <ul className="props-diagram-list">
              {diagramsUsingSelectedElement.map(({ diagram, nodes }) => (
                <li key={diagram.id}>
                  <button
                    type="button"
                    className={
                      selectedDiagramId === diagram.id
                        ? 'diagram-btn diagram-btn-block active'
                        : 'diagram-btn diagram-btn-block'
                    }
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
