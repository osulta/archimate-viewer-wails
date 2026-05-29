import { useEffect, useState } from 'react'
import { Button, Empty, Tabs } from 'antd'
import { ObjectRelationshipsPanel } from '../object-relationships-panel'
import { formatArchimateTypeLabel } from '../../lib/archimate/model-folder-tree'
import {
  formatRelationshipEndpointLabel,
  getRelationshipDisplayLabel,
} from '../../lib/archimate/relationship-meta'
import type {
  ParsedElement,
  ParsedRelationship,
  DiagramNode,
  ElementOverride,
} from '../../types/model'

interface DiagramUsage {
  diagram: { id: string; name: string; folderPath?: string }
  nodes: DiagramNode[]
}

interface ElementRelationshipEntry {
  relationship: ParsedRelationship
  direction: 'incoming' | 'outgoing' | 'self'
  otherElementId: string
}

interface NavigateToDiagramPayload {
  diagramId: string
  node: DiagramNode | null
  elementId: string
}

interface ViewModePropertiesProps {
  selectedRelationship: ParsedRelationship | null
  selectedRelationshipRef: string | null
  selectedNodeLive: DiagramNode | null
  selectedElement: ParsedElement | null
  selectedElementId: string | null
  selectedElementRefForUsage: string
  selectedDiagramId: string
  diagramsUsingSelectedElement: DiagramUsage[]
  selectedElementRelationships?: ElementRelationshipEntry[]
  elementById: Map<string, ParsedElement>
  elementOverrides: Map<string, ElementOverride>
  onSelectRelationship: (relationshipId: string) => void
  onSelectElement: (elementId: string) => void
  onNavigateToDiagram: (payload: NavigateToDiagramPayload) => void
}

export function ViewModeProperties(props: ViewModePropertiesProps) {
  const {
    selectedRelationship,
    selectedRelationshipRef,
    selectedNodeLive,
    selectedElement,
    selectedElementId,
    selectedElementRefForUsage,
    selectedDiagramId,
    diagramsUsingSelectedElement,
    selectedElementRelationships = [],
    elementById,
    elementOverrides,
    onSelectRelationship,
    onSelectElement,
    onNavigateToDiagram,
  } = props

  const [objectPropsTab, setObjectPropsTab] = useState('details')

  useEffect(() => {
    setObjectPropsTab('details')
  }, [selectedElementRefForUsage, selectedRelationshipRef])

  if (selectedRelationshipRef && selectedRelationship) {
    return (
      <section className="properties view-mode-properties">
        <h3>Свойства relationship</h3>
        <div className="props-grid props-grid-readonly">
          <div>
            <b>Relationship ID:</b> {selectedRelationshipRef}
          </div>
          <div>
            <b>Name:</b> {getRelationshipDisplayLabel(selectedRelationship) || '—'}
          </div>
          <div>
            <b>Type:</b>{' '}
            {formatArchimateTypeLabel(selectedRelationship.type ?? '') ||
              selectedRelationship.type ||
              '—'}
          </div>
          <div>
            <b>Source:</b>{' '}
            {formatRelationshipEndpointLabel(selectedRelationship.source, elementById)}
          </div>
          <div>
            <b>Target:</b>{' '}
            {formatRelationshipEndpointLabel(selectedRelationship.target, elementById)}
          </div>
        </div>
      </section>
    )
  }

  if (selectedNodeLive || selectedElementId) {
    return (
      <section className="properties view-mode-properties">
        <h3>Свойства объекта</h3>
        <Tabs
          className="props-tab-bar"
          activeKey={objectPropsTab}
          onChange={setObjectPropsTab}
          items={[
            { key: 'details', label: 'Детали' },
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
          <div className="props-grid props-grid-readonly">
            <div>
              <b>Node ID:</b> {selectedNodeLive ? selectedNodeLive.id : '—'}
            </div>
            <div>
              <b>Element ID:</b> {selectedNodeLive?.elementRef || selectedElementId || '—'}
            </div>
            <div>
              <b>Name:</b> {selectedElement?.name || '—'}
            </div>
            <div>
              <b>Type:</b> {selectedElement?.type || selectedNodeLive?.type || '—'}
            </div>
            {selectedElement?.documentation ? (
              <div className="props-field-full">
                <b>Documentation</b>
                <pre className="props-readonly-text">{selectedElement.documentation}</pre>
              </div>
            ) : null}
            <div>
              <b>Bounds:</b>{' '}
              {selectedNodeLive
                ? `x=${selectedNodeLive.x}, y=${selectedNodeLive.y}, w=${selectedNodeLive.width}, h=${selectedNodeLive.height}`
                : 'Объект не на текущей диаграмме'}
            </div>
            {(selectedElement?.properties ?? []).length > 0 ? (
              <div className="props-field-full">
                <b>Properties</b>
                <ul className="props-readonly-list">
                  {(selectedElement!.properties ?? []).map((prop, idx) => (
                    <li key={`${prop.key}-${idx}`}>
                      <span className="props-readonly-key">{prop.key || '—'}</span>
                      <span className="props-readonly-value">{prop.value ?? ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : objectPropsTab === 'relationships' ? (
          <ObjectRelationshipsPanel
            elementId={selectedElementRefForUsage}
            entries={selectedElementRelationships}
            elementById={elementById}
            elementOverrides={elementOverrides}
            onSelectRelationship={onSelectRelationship}
            onSelectElement={onSelectElement}
          />
        ) : (
          <div className="props-diagrams-panel">
            {!selectedElementRefForUsage ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Не удалось определить элемент." />
            ) : diagramsUsingSelectedElement.length === 0 ? (
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
                      onClick={() =>
                        onNavigateToDiagram({
                          diagramId: diagram.id,
                          node: nodes[0] ?? null,
                          elementId: selectedElementRefForUsage,
                        })
                      }
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
        )}
      </section>
    )
  }

  return (
    <Empty
      className="props-empty"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description="Кликните на объект или связь на диаграмме, чтобы увидеть свойства."
    />
  )
}
