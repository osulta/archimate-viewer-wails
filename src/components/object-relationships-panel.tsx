import React, { useMemo } from 'react'
import { formatArchimateTypeLabel } from '../lib/archimate/model-folder-tree'
import { layoutElementRelationshipGraph } from '../lib/archimate/element-relationships'
import type { ParsedElement, ParsedRelationship, ElementOverride } from '../types/model'

const GRAPH_WIDTH = 320
const GRAPH_HEIGHT = 220
const CENTER_NODE_R = 22
const NEIGHBOR_NODE_R = 18

interface RelationshipEntry {
  relationship: ParsedRelationship
  otherElementId: string
  direction: 'incoming' | 'outgoing' | 'self'
}

function getElementLabel(
  elementId: string,
  elementById: Map<string, ParsedElement>,
  elementOverrides: Map<string, ElementOverride>,
): string {
  if (!elementId) {
    return '—'
  }
  const overrideName = elementOverrides?.get(elementId)?.name
  const base = elementById?.get(elementId)
  return overrideName ?? base?.name ?? elementId
}

function getElementTypeLabel(elementId: string, elementById: Map<string, ParsedElement>): string {
  const base = elementById?.get(elementId)
  return formatArchimateTypeLabel(base?.type ?? '')
}

function truncateLabel(text: string, maxLen = 18): string {
  if (!text || text.length <= maxLen) {
    return text
  }
  return `${text.slice(0, maxLen - 1)}…`
}

function directionLabel(direction: string): string {
  if (direction === 'incoming') {
    return '← входящая'
  }
  if (direction === 'outgoing') {
    return '→ исходящая'
  }
  return '↺ на себя'
}

interface RelationshipGraphProps {
  elementId: string
  entries: RelationshipEntry[]
  elementById: Map<string, ParsedElement>
  elementOverrides: Map<string, ElementOverride>
}

function RelationshipGraph({
  elementId,
  entries,
  elementById,
  elementOverrides,
}: RelationshipGraphProps): React.JSX.Element {
  const { positions, width, height } = useMemo(
    () => layoutElementRelationshipGraph(elementId, entries, GRAPH_WIDTH, GRAPH_HEIGHT),
    [elementId, entries],
  )

  const edges = entries
    .map((entry) => {
      const sourcePos = positions.get(entry.relationship.source ?? '')
      const targetPos = positions.get(entry.relationship.target ?? '')
      if (!sourcePos || !targetPos) {
        return null
      }
      return {
        key: entry.relationship.id,
        x1: sourcePos.x,
        y1: sourcePos.y,
        x2: targetPos.x,
        y2: targetPos.y,
        isHighlighted:
          entry.relationship.source === elementId || entry.relationship.target === elementId,
      }
    })
    .filter(Boolean) as {
    key: string
    x1: number
    y1: number
    x2: number
    y2: number
    isHighlighted: boolean
  }[]

  const nodes = [...positions.entries()].map(([id, pos]) => ({
    id,
    x: pos.x,
    y: pos.y,
    isCenter: id === elementId,
    label: truncateLabel(getElementLabel(id, elementById, elementOverrides), 14),
  }))

  return (
    <div className="props-rel-graph-wrap">
      <svg
        className="props-rel-graph"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Граф связей объекта"
      >
        <defs>
          <marker
            id="props-rel-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#6b8cce" />
          </marker>
        </defs>
        {edges.map((edge) => (
          <line
            key={edge.key}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            className={
              edge.isHighlighted ? 'props-rel-edge props-rel-edge-active' : 'props-rel-edge'
            }
            markerEnd="url(#props-rel-arrow)"
          />
        ))}
        {nodes.map((node) => (
          <g key={node.id} className="props-rel-node">
            <circle
              cx={node.x}
              cy={node.y}
              r={node.isCenter ? CENTER_NODE_R : NEIGHBOR_NODE_R}
              className={node.isCenter ? 'props-rel-node-circle-center' : 'props-rel-node-circle'}
            />
            <text
              x={node.x}
              y={node.y + (node.isCenter ? CENTER_NODE_R : NEIGHBOR_NODE_R) + 12}
              textAnchor="middle"
              className="props-rel-node-label"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

interface ObjectRelationshipsPanelProps {
  entries: RelationshipEntry[]
  elementId: string
  elementById: Map<string, ParsedElement>
  elementOverrides: Map<string, ElementOverride>
  onSelectRelationship?: (id: string) => void
  onSelectElement?: (id: string) => void
}

export function ObjectRelationshipsPanel({
  entries,
  elementId,
  elementById,
  elementOverrides,
  onSelectRelationship,
  onSelectElement,
}: ObjectRelationshipsPanelProps): React.JSX.Element {
  if (!elementId) {
    return <p className="props-empty">Не удалось определить элемент.</p>
  }

  if (!entries.length) {
    return <p className="props-empty">У объекта нет связей в модели.</p>
  }

  return (
    <div className="props-relationships-panel">
      <h4 className="props-rel-section-title">Список связей</h4>
      <ul className="props-rel-list">
        {entries.map((entry) => {
          const rel = entry.relationship
          const relLabel = rel.name || rel.id
          const otherLabel = getElementLabel(entry.otherElementId, elementById, elementOverrides)
          const otherType = getElementTypeLabel(entry.otherElementId, elementById)
          const prefix =
            entry.direction === 'incoming'
              ? 'от '
              : entry.direction === 'outgoing'
                ? 'к '
                : ''
          return (
            <li key={rel.id} className="props-rel-item">
              <button
                type="button"
                className="props-rel-main-btn"
                onClick={() => onSelectRelationship?.(rel.id)}
                disabled={!onSelectRelationship}
              >
                <span className="props-rel-item-head">
                  <span className="props-rel-direction">{directionLabel(entry.direction)}</span>
                  <span className="props-rel-type">{formatArchimateTypeLabel(rel.type)}</span>
                </span>
                <span className="props-rel-item-name">{relLabel}</span>
              </button>
              <span className="props-rel-item-other">
                {prefix}
                <button
                  type="button"
                  className="props-rel-other-link"
                  onClick={() => onSelectElement?.(entry.otherElementId)}
                  disabled={!onSelectElement || entry.direction === 'self'}
                >
                  {otherLabel}
                </button>
                {otherType ? <span className="props-rel-other-type"> ({otherType})</span> : null}
              </span>
            </li>
          )
        })}
      </ul>

      <h4 className="props-rel-section-title">Граф связей</h4>
      <RelationshipGraph
        elementId={elementId}
        entries={entries}
        elementById={elementById}
        elementOverrides={elementOverrides}
      />
    </div>
  )
}
