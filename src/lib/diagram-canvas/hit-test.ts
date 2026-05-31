import { distancePointToSegment } from '../archimate/connection-geometry'
import type { ParsedDiagram } from '../../types/model'
import type { RenderedConnection } from './types'

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
  const selectedConnection = renderedConnections.find((c) => c.relationshipRef === relationshipRef)
  if (!selectedConnection) {
    return null
  }
  const conn = diagram.connections.find((c) => c.relationshipRef === relationshipRef)
  if (!conn?.bendpoints?.length) {
    return null
  }
  for (let i = 0; i < conn.bendpoints.length; i += 1) {
    const bp = conn.bendpoints[i]
    const hx = selectedConnection.sourceCenter.x + (bp.startX ?? 0)
    const hy = selectedConnection.sourceCenter.y + (bp.startY ?? 0)
    if (Math.hypot(x - hx, y - hy) <= 8) {
      return i
    }
  }
  return null
}
