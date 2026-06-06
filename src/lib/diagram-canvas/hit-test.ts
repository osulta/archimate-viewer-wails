import { distancePointToSegment } from '../archimate/connection-geometry'
import type { ParsedDiagram } from '../../types/model'
import type { ConnectionEndpointKind, RenderedConnection } from './types'
import { BENDPOINT_HIT_RADIUS, CONNECTION_ENDPOINT_HIT_RADIUS } from './constants'

export interface ConnectionEndpointHit {
  relationshipRef: string
  endpoint: ConnectionEndpointKind
  point: { x: number; y: number }
}

export interface BendpointHit {
  relationshipRef: string
  index: number
}

export function pickRelationshipAtScreenPoint(
  x: number,
  y: number,
  renderedConnections: RenderedConnection[],
): string | null {
  const clickPoint = { x, y }
  for (let ci = renderedConnections.length - 1; ci >= 0; ci -= 1) {
    const c = renderedConnections[ci]
    for (let i = 0; i < c.points.length - 1; i += 1) {
      const d = distancePointToSegment(clickPoint, c.points[i], c.points[i + 1])
      if (d <= 7) {
        return c.relationshipRef
      }
    }
  }
  return null
}

function findBendpointHitInConnection(
  relationshipRef: string,
  x: number,
  y: number,
  diagram: ParsedDiagram,
  renderedConnections: RenderedConnection[],
  hitRadius: number = BENDPOINT_HIT_RADIUS,
): number | null {
  const rendered = renderedConnections.find((item) => item.relationshipRef === relationshipRef)
  const conn = diagram.connections.find((item) => item.relationshipRef === relationshipRef)
  if (!rendered || !conn?.bendpoints?.length) {
    return null
  }
  for (let i = 0; i < conn.bendpoints.length; i += 1) {
    const bp = conn.bendpoints[i]
    const hx = rendered.sourceCenter.x + (bp.startX ?? 0)
    const hy = rendered.sourceCenter.y + (bp.startY ?? 0)
    if (Math.hypot(x - hx, y - hy) <= hitRadius) {
      return i
    }
  }
  return null
}

export function findBendpointHitIndex(
  relationshipRef: string,
  x: number,
  y: number,
  diagram: ParsedDiagram | null,
  renderedConnections: RenderedConnection[],
): number | null {
  if (!relationshipRef || !diagram) {
    return null
  }
  return findBendpointHitInConnection(relationshipRef, x, y, diagram, renderedConnections)
}

export function findBendpointHitAtPoint(
  x: number,
  y: number,
  diagram: ParsedDiagram | null,
  renderedConnections: RenderedConnection[],
): BendpointHit | null {
  if (!diagram) {
    return null
  }
  for (const conn of diagram.connections) {
    if (!conn.bendpoints?.length) {
      continue
    }
    const index = findBendpointHitInConnection(
      conn.relationshipRef,
      x,
      y,
      diagram,
      renderedConnections,
    )
    if (index !== null) {
      return { relationshipRef: conn.relationshipRef, index }
    }
  }
  return null
}

export function findConnectionEndpointHit(
  relationshipRef: string | null | undefined,
  x: number,
  y: number,
  renderedConnections: RenderedConnection[],
  hitRadius: number = CONNECTION_ENDPOINT_HIT_RADIUS,
): ConnectionEndpointHit | null {
  if (!relationshipRef) {
    return null
  }
  const rendered = renderedConnections.find((item) => item.relationshipRef === relationshipRef)
  if (!rendered || rendered.points.length < 2) {
    return null
  }
  const start = rendered.points[0]
  const end = rendered.points[rendered.points.length - 1]
  if (Math.hypot(x - start.x, y - start.y) <= hitRadius) {
    return { relationshipRef, endpoint: 'source', point: start }
  }
  if (Math.hypot(x - end.x, y - end.y) <= hitRadius) {
    return { relationshipRef, endpoint: 'target', point: end }
  }
  return null
}
