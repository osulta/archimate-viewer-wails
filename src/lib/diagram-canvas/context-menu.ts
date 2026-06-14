import type { MenuProps } from 'antd'
import { getNodeAtPosition } from '../archimate/diagram-model'
import { distancePointToSegment } from '../archimate/connection-geometry'
import type { Bendpoint, DiagramNode, ParsedDiagram } from '../../types/model'
import {
  findBendpointHitAtPoint,
  pickRelationshipAtScreenPoint,
} from './hit-test'
import type { RenderedConnection } from './types'

export interface CanvasContextTarget {
  kind: 'node' | 'relationship' | 'empty'
  node?: DiagramNode
  relationshipRef?: string
  bendpointIndex?: number
  addBendpoint?: {
    relationshipRef: string
    segmentIndex: number
    bendpoint: Bendpoint
  }
  hasConnectionOnDiagram?: boolean
}

export interface BuildCanvasContextMenuOptions {
  readOnly: boolean
  target: CanvasContextTarget
  onOpenDiagram?: (diagramId: string) => void
  onShowObjectProperties?: () => void
  onDeleteNodeFromDiagram?: () => void
  onDeleteNodeFromModel?: () => void
  onDeleteConnectionFromDiagram?: () => void
  onDeleteRelationshipFromModel?: () => void
  onRemoveRelationshipBendpoint?: (relationshipRef: string, bendpointIndex: number) => void
  onAddRelationshipBendpoint?: (
    relationshipRef: string,
    segmentIndex: number,
    bendpoint: Bendpoint,
  ) => void
  onClearSelection?: () => void
}

function findAddBendpointAtPoint(
  x: number,
  y: number,
  relationshipRef: string,
  renderedConnections: RenderedConnection[],
): CanvasContextTarget['addBendpoint'] | undefined {
  const connection = renderedConnections.find((item) => item.relationshipRef === relationshipRef)
  if (!connection || connection.points.length < 2) {
    return undefined
  }

  const clickPoint = { x, y }
  let best: { index: number; distance: number } | null = null
  for (let i = 0; i < connection.points.length - 1; i += 1) {
    const distance = distancePointToSegment(clickPoint, connection.points[i], connection.points[i + 1])
    if (!best || distance < best.distance) {
      best = { index: i, distance }
    }
  }
  if (!best || best.distance > 10) {
    return undefined
  }

  return {
    relationshipRef,
    segmentIndex: best.index,
    bendpoint: {
      startX: x - connection.sourceCenter.x,
      startY: y - connection.sourceCenter.y,
      endX: x - connection.targetCenter.x,
      endY: y - connection.targetCenter.y,
    },
  }
}

export function resolveCanvasContextTarget(
  diagram: ParsedDiagram,
  logicalX: number,
  logicalY: number,
  screenX: number,
  screenY: number,
  renderedConnections: RenderedConnection[],
): CanvasContextTarget {
  const hitNode = getNodeAtPosition(diagram.nodes, logicalX, logicalY)
  if (hitNode) {
    return { kind: 'node', node: hitNode }
  }

  const bendpointHit = findBendpointHitAtPoint(screenX, screenY, diagram, renderedConnections)
  if (bendpointHit) {
    return {
      kind: 'relationship',
      relationshipRef: bendpointHit.relationshipRef,
      bendpointIndex: bendpointHit.index,
      hasConnectionOnDiagram: true,
    }
  }

  const relationshipRef = pickRelationshipAtScreenPoint(screenX, screenY, renderedConnections)
  if (relationshipRef) {
    return {
      kind: 'relationship',
      relationshipRef,
      hasConnectionOnDiagram: diagram.connections.some((conn) => conn.relationshipRef === relationshipRef),
      addBendpoint: findAddBendpointAtPoint(screenX, screenY, relationshipRef, renderedConnections),
    }
  }

  return { kind: 'empty' }
}

export function buildCanvasContextMenuItems(
  options: BuildCanvasContextMenuOptions,
): NonNullable<MenuProps['items']> {
  const {
    readOnly,
    target,
    onOpenDiagram,
    onShowObjectProperties,
    onDeleteNodeFromDiagram,
    onDeleteNodeFromModel,
    onDeleteConnectionFromDiagram,
    onDeleteRelationshipFromModel,
    onRemoveRelationshipBendpoint,
    onAddRelationshipBendpoint,
    onClearSelection,
  } = options

  if (target.kind === 'node' && target.node) {
    const items: NonNullable<MenuProps['items']> = []
    if (onShowObjectProperties) {
      items.push({
        key: 'show-properties',
        label: 'Показать свойства',
        onClick: () => onShowObjectProperties(),
      })
    }
    if (target.node.referencedDiagramId && onOpenDiagram) {
      items.push({
        key: 'open-diagram',
        label: 'Открыть диаграмму',
        onClick: () => onOpenDiagram(target.node!.referencedDiagramId!),
      })
    }
    if (!readOnly) {
      if (onDeleteNodeFromDiagram) {
        items.push({
          key: 'delete-node-diagram',
          label: 'Удалить с диаграммы',
          danger: true,
          onClick: () => onDeleteNodeFromDiagram(),
        })
      }
      if (target.node.elementRef && onDeleteNodeFromModel) {
        items.push({
          key: 'delete-node-model',
          label: 'Удалить из модели',
          danger: true,
          onClick: () => onDeleteNodeFromModel(),
        })
      }
    }
    return items
  }

  if (target.kind === 'relationship' && target.relationshipRef) {
    const items: NonNullable<MenuProps['items']> = []
    if (!readOnly) {
      if (
        target.bendpointIndex != null &&
        onRemoveRelationshipBendpoint
      ) {
        items.push({
          key: 'remove-bendpoint',
          label: 'Удалить точку излома',
          onClick: () =>
            onRemoveRelationshipBendpoint(target.relationshipRef!, target.bendpointIndex!),
        })
      }
      if (target.addBendpoint && onAddRelationshipBendpoint) {
        items.push({
          key: 'add-bendpoint',
          label: 'Добавить точку излома',
          onClick: () =>
            onAddRelationshipBendpoint(
              target.addBendpoint!.relationshipRef,
              target.addBendpoint!.segmentIndex,
              target.addBendpoint!.bendpoint,
            ),
        })
      }
      if (target.hasConnectionOnDiagram && onDeleteConnectionFromDiagram) {
        items.push({
          key: 'delete-connection-diagram',
          label: 'Удалить с диаграммы',
          danger: true,
          onClick: () => onDeleteConnectionFromDiagram(),
        })
      }
      if (onDeleteRelationshipFromModel) {
        items.push({
          key: 'delete-relationship-model',
          label: 'Удалить из модели',
          danger: true,
          onClick: () => onDeleteRelationshipFromModel(),
        })
      }
    }
    return items
  }

  if (onClearSelection) {
    return [
      {
        key: 'clear-selection',
        label: 'Снять выделение',
        onClick: () => onClearSelection(),
      },
    ]
  }

  return []
}
