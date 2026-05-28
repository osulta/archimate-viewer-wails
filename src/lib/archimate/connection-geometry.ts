import type { Point, Rect, Bendpoint, DiagramNode, DiagramConnection, ConnectionPolylineResult } from '../../types/model'
import { findNodeById, isRectFullyInside } from './diagram-model'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Ближайшая точка на границе прямоугольника к заданной точке (кратчайшее расстояние до периметра). */
export function nearestPointOnRectBoundary(rect: Rect, point: Point): Point {
  const left = rect.x
  const right = rect.x + rect.w
  const top = rect.y
  const bottom = rect.y + rect.h

  const candidates: Point[] = [
    { x: clamp(point.x, left, right), y: top },
    { x: clamp(point.x, left, right), y: bottom },
    { x: left, y: clamp(point.y, top, bottom) },
    { x: right, y: clamp(point.y, top, bottom) },
  ]

  let best = candidates[0]
  let bestDist =
    (best.x - point.x) * (best.x - point.x) + (best.y - point.y) * (best.y - point.y)
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i]
    const d = (c.x - point.x) * (c.x - point.x) + (c.y - point.y) * (c.y - point.y)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return { x: best.x, y: best.y }
}

export function adjustBendpointsForNodeResize(
  bendpoints: Bendpoint[] | null | undefined,
  connection: DiagramConnection,
  resizedNodeId: string,
  dw: number,
  dh: number,
): Bendpoint[] {
  if (!bendpoints?.length || (dw === 0 && dh === 0)) {
    return bendpoints ?? []
  }
  const isSource = connection.source === resizedNodeId
  const isTarget = connection.target === resizedNodeId
  if (!isSource && !isTarget) {
    return bendpoints
  }
  const halfDw = dw / 2
  const halfDh = dh / 2
  return bendpoints.map((bp) => ({
    startX: (bp.startX ?? 0) - (isSource ? halfDw : 0),
    startY: (bp.startY ?? 0) - (isSource ? halfDh : 0),
    endX: (bp.endX ?? 0) - (isTarget ? halfDw : 0),
    endY: (bp.endY ?? 0) - (isTarget ? halfDh : 0),
  }))
}

function rectEdgeSegments(rect: Rect): [Point, Point][] {
  const { x, y, w, h } = rect
  const x2 = x + w
  const y2 = y + h
  return [
    [
      { x, y },
      { x: x2, y },
    ],
    [
      { x: x2, y },
      { x: x2, y: y2 },
    ],
    [
      { x: x2, y: y2 },
      { x, y: y2 },
    ],
    [
      { x, y: y2 },
      { x, y },
    ],
  ]
}

function closestPointsBetweenSegments(
  a0: Point, a1: Point, b0: Point, b1: Point,
): { p: Point; q: Point; distSq: number } {
  const ux = a1.x - a0.x
  const uy = a1.y - a0.y
  const vx = b1.x - b0.x
  const vy = b1.y - b0.y
  const wx = a0.x - b0.x
  const wy = a0.y - b0.y

  const a = ux * ux + uy * uy
  const b = ux * vx + uy * vy
  const c = vx * vx + vy * vy
  const d = ux * wx + uy * wy
  const e = vx * wx + vy * wy
  const denom = a * c - b * b

  let sc: number
  let tc: number

  if (denom < 1e-10) {
    sc = 0
    tc = c > 1e-10 ? clamp(e / c, 0, 1) : 0
  } else {
    sc = clamp((b * e - c * d) / denom, 0, 1)
    tc = clamp((a * e - b * d) / denom, 0, 1)
  }

  const p: Point = { x: a0.x + sc * ux, y: a0.y + sc * uy }
  const q: Point = { x: b0.x + tc * vx, y: b0.y + tc * vy }
  const dx = p.x - q.x
  const dy = p.y - q.y
  return { p, q, distSq: dx * dx + dy * dy }
}

function overlapIntervalMidpoint(aMin: number, aMax: number, bMin: number, bMax: number): number | null {
  const start = Math.max(aMin, bMin)
  const end = Math.min(aMax, bMax)
  if (end <= start) {
    return null
  }
  return (start + end) / 2
}

function shortestSegmentBetweenRectEdges(rectA: Rect, rectB: Rect): { start: Point; end: Point } {
  let bestDistSq = Infinity
  let bestStart: Point | null = null
  let bestEnd: Point | null = null

  for (const [a0, a1] of rectEdgeSegments(rectA)) {
    for (const [b0, b1] of rectEdgeSegments(rectB)) {
      const { p, q, distSq } = closestPointsBetweenSegments(a0, a1, b0, b1)
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        bestStart = p
        bestEnd = q
      }
    }
  }

  const centerA: Point = { x: rectA.x + rectA.w / 2, y: rectA.y + rectA.h / 2 }
  const centerB: Point = { x: rectB.x + rectB.w / 2, y: rectB.y + rectB.h / 2 }

  if (!bestStart || !bestEnd || bestDistSq < 1e-8) {
    return {
      start: nearestPointOnRectBoundary(rectA, centerB),
      end: nearestPointOnRectBoundary(rectB, centerA),
    }
  }

  return { start: bestStart, end: bestEnd }
}

export function shortestSegmentBetweenRects(rectA: Rect, rectB: Rect): { start: Point; end: Point } {
  const ax2 = rectA.x + rectA.w
  const ay2 = rectA.y + rectA.h
  const bx2 = rectB.x + rectB.w
  const by2 = rectB.y + rectB.h

  const midX = overlapIntervalMidpoint(rectA.x, ax2, rectB.x, bx2)
  const midY = overlapIntervalMidpoint(rectA.y, ay2, rectB.y, by2)

  const cxA = rectA.x + rectA.w / 2
  const cyA = rectA.y + rectA.h / 2
  const cxB = rectB.x + rectB.w / 2
  const cyB = rectB.y + rectB.h / 2

  if (midX != null && midY != null) {
    const dx = cxB - cxA
    const dy = cyB - cyA
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        return { start: { x: ax2, y: midY }, end: { x: rectB.x, y: midY } }
      }
      return { start: { x: rectA.x, y: midY }, end: { x: bx2, y: midY } }
    }
    if (dy >= 0) {
      return { start: { x: midX, y: ay2 }, end: { x: midX, y: rectB.y } }
    }
    return { start: { x: midX, y: rectA.y }, end: { x: midX, y: by2 } }
  }

  if (midX != null) {
    if (cyA <= cyB) {
      return { start: { x: midX, y: ay2 }, end: { x: midX, y: rectB.y } }
    }
    return { start: { x: midX, y: rectA.y }, end: { x: midX, y: by2 } }
  }

  if (midY != null) {
    if (cxA <= cxB) {
      return { start: { x: ax2, y: midY }, end: { x: rectB.x, y: midY } }
    }
    return { start: { x: rectA.x, y: midY }, end: { x: bx2, y: midY } }
  }

  return shortestSegmentBetweenRectEdges(rectA, rectB)
}

export function polylineMidpoint(points: Point[]): { x: number; y: number; totalLength: number } | null {
  if (!points?.length) {
    return null
  }
  if (points.length === 1) {
    return { x: points[0].x, y: points[0].y, totalLength: 0 }
  }

  const segments: { a: Point; b: Point; len: number }[] = []
  let totalLength = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    segments.push({ a, b, len })
    totalLength += len
  }

  if (totalLength === 0) {
    const p = points[0]
    return { x: p.x, y: p.y, totalLength: 0 }
  }

  const half = totalLength / 2
  let acc = 0
  for (const seg of segments) {
    if (acc + seg.len >= half) {
      const t = seg.len > 0 ? (half - acc) / seg.len : 0
      return {
        x: seg.a.x + (seg.b.x - seg.a.x) * t,
        y: seg.a.y + (seg.b.y - seg.a.y) * t,
        totalLength,
      }
    }
    acc += seg.len
  }

  const last = points.at(-1)!
  return { x: last.x, y: last.y, totalLength }
}

export function distancePointToSegment(point: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = point.x - a.x
  const apy = point.y - a.y
  const ab2 = abx * abx + aby * aby
  if (ab2 === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y)
  }
  let t = (apx * abx + apy * aby) / ab2
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + abx * t
  const projY = a.y + aby * t
  return Math.hypot(point.x - projX, point.y - projY)
}

export function connectionPolyline(
  connection: DiagramConnection,
  source: DiagramNode,
  target: DiagramNode,
  translateX: number,
  translateY: number,
): ConnectionPolylineResult {
  const sourceCenter: Point = {
    x: source.x + source.width / 2 + translateX,
    y: source.y + source.height / 2 + translateY,
  }
  const targetCenter: Point = {
    x: target.x + target.width / 2 + translateX,
    y: target.y + target.height / 2 + translateY,
  }
  const sourceRect: Rect = {
    x: source.x + translateX,
    y: source.y + translateY,
    w: source.width,
    h: source.height,
  }
  const targetRect: Rect = {
    x: target.x + translateX,
    y: target.y + translateY,
    w: target.width,
    h: target.height,
  }

  if (!connection.bendpoints?.length) {
    const { start, end } = shortestSegmentBetweenRects(sourceRect, targetRect)
    return {
      points: dedupeConsecutivePoints([start, end]),
      sourceCenter,
      targetCenter,
    }
  }

  const rawPoints: Point[] = [sourceCenter]
  connection.bendpoints.forEach((bp) => {
    rawPoints.push({
      x: sourceCenter.x + (bp.startX ?? 0),
      y: sourceCenter.y + (bp.startY ?? 0),
    })
  })
  rawPoints.push(targetCenter)

  const anchorFrom = rawPoints[1]
  const anchorTo = rawPoints.at(-2)!
  const startPoint = nearestPointOnRectBoundary(sourceRect, anchorFrom)
  const endPoint = nearestPointOnRectBoundary(targetRect, anchorTo)

  const points = [...rawPoints]
  points[0] = startPoint
  points[points.length - 1] = endPoint

  return { points, sourceCenter, targetCenter }
}

export function dedupeConsecutivePoints(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const prev = out[out.length - 1]
    if (!prev || prev.x !== p.x || prev.y !== p.y) {
      out.push(p)
    }
  }
  return out
}

export function isNestedDiagramConnection(diagramNodes: DiagramNode[], sourceId: string, targetId: string): boolean {
  if (!sourceId || !targetId || sourceId === targetId) {
    return false
  }
  const ancestor = findNodeById(diagramNodes, sourceId)
  if (!ancestor) {
    return false
  }
  function subtreeContains(node: DiagramNode, id: string): boolean {
    for (const ch of node.children) {
      if (ch.id === id) {
        return true
      }
      if (subtreeContains(ch, id)) {
        return true
      }
    }
    return false
  }
  return subtreeContains(ancestor, targetId)
}

export function isDiagramConnectionInsideContainer(diagramNodes: DiagramNode[], source: DiagramNode, target: DiagramNode): boolean {
  if (!source?.id || !target?.id || source.id === target.id) {
    return false
  }

  let container: DiagramNode | null = null
  let contained: DiagramNode | null = null

  if (isNestedDiagramConnection(diagramNodes, source.id, target.id)) {
    container = source
    contained = target
  } else if (isNestedDiagramConnection(diagramNodes, target.id, source.id)) {
    container = target
    contained = source
  } else if (isRectFullyInside(source, target)) {
    container = source
    contained = target
  } else if (isRectFullyInside(target, source)) {
    container = target
    contained = source
  }

  if (!container || !contained) {
    return false
  }

  return isRectFullyInside(container, contained)
}

export function nestedTreeConnectionPolyline(
  source: DiagramNode, target: DiagramNode, translateX: number, translateY: number,
): ConnectionPolylineResult {
  const sx = source.x + translateX
  const sy = source.y + translateY
  const tx = target.x + translateX
  const ty = target.y + translateY
  const bottomLeft: Point = { x: sx, y: sy + source.height }
  const targetLeftMid: Point = { x: tx, y: ty + target.height / 2 }
  const elbow: Point = { x: bottomLeft.x, y: targetLeftMid.y }
  const points = dedupeConsecutivePoints([bottomLeft, elbow, targetLeftMid])
  const sourceCenter: Point = {
    x: sx + source.width / 2,
    y: sy + source.height / 2,
  }
  const targetCenter: Point = {
    x: tx + target.width / 2,
    y: ty + target.height / 2,
  }
  return { points, sourceCenter, targetCenter, layout: 'nested' }
}

export function directConnectionPolyline(
  source: DiagramNode, target: DiagramNode, translateX: number, translateY: number,
): ConnectionPolylineResult {
  const sx = source.x + translateX
  const sy = source.y + translateY
  const tx = target.x + translateX
  const ty = target.y + translateY
  const sourceRect: Rect = { x: sx, y: sy, w: source.width, h: source.height }
  const targetRect: Rect = { x: tx, y: ty, w: target.width, h: target.height }
  const sourceCenter: Point = {
    x: sx + source.width / 2,
    y: sy + source.height / 2,
  }
  const targetCenter: Point = {
    x: tx + target.width / 2,
    y: ty + target.height / 2,
  }
  const { start, end } = shortestSegmentBetweenRects(sourceRect, targetRect)
  return {
    points: dedupeConsecutivePoints([start, end]),
    sourceCenter,
    targetCenter,
    layout: 'direct',
  }
}

export function resolveConnectionPolyline(
  connection: DiagramConnection,
  source: DiagramNode,
  target: DiagramNode,
  translateX: number,
  translateY: number,
  diagramNodes: DiagramNode[],
): ConnectionPolylineResult | null {
  if (isDiagramConnectionInsideContainer(diagramNodes, source, target)) {
    return null
  }
  if (connection.bendpoints?.length) {
    const base = connectionPolyline(connection, source, target, translateX, translateY)
    return { ...base, layout: 'bendpoints' }
  }
  return directConnectionPolyline(source, target, translateX, translateY)
}
