import { getRelationshipNotation } from './notation'
import type { RelationshipNotation } from '../../types/model'

const VIEWBOX_W = 32
const VIEWBOX_H = 24
const LINE_COLOR = '#20345d'
const MARKER_SIZE = 6

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function rotAt(x: number, y: number, angle: number, dx: number, dy: number): { x: number; y: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: x + dx * cos - dy * sin,
    y: y + dx * sin + dy * cos,
  }
}

function pointPair(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`
}

function buildEndMarkerSvg(
  x: number,
  y: number,
  angle: number,
  kind: string,
  size: number,
  color: string,
): string {
  const stroke = escapeXml(color)
  const s = size

  if (kind === 'openArrow') {
    const p1 = rotAt(x, y, angle, -s, -s * 0.55)
    const p2 = rotAt(x, y, angle, -s, s * 0.55)
    return `<path d="M ${pointPair(p1)} L ${x},${y} L ${pointPair(p2)}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
  }

  if (kind === 'filledArrow') {
    const depth = s
    const halfWidth = s * 0.55
    const baseLeft = rotAt(x, y, angle, -depth, -halfWidth)
    const baseRight = rotAt(x, y, angle, -depth, halfWidth)
    return `<polygon points="${x},${y} ${pointPair(baseLeft)} ${pointPair(baseRight)}" fill="${stroke}" stroke="none"/>`
  }

  if (kind === 'hollowTriangle') {
    const p1 = rotAt(x, y, angle, -s, -s * 0.85)
    const p2 = rotAt(x, y, angle, -s, s * 0.85)
    const points = `${x},${y} ${pointPair(p1)} ${pointPair(p2)}`
    return `<polygon points="${points}" fill="#ffffff" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`
  }

  return ''
}

function buildStartMarkerSvg(
  x: number,
  y: number,
  angle: number,
  kind: string,
  size: number,
  color: string,
): string {
  const stroke = escapeXml(color)
  const s = size

  if (kind === 'filledCircle') {
    return `<circle cx="${x}" cy="${y}" r="${s * 0.35}" fill="${stroke}" stroke="${stroke}" stroke-width="1.1"/>`
  }

  const front = rotAt(x, y, angle, s, 0)
  const back = rotAt(x, y, angle, -s, 0)
  const left = rotAt(x, y, angle, 0, -s * 0.75)
  const right = rotAt(x, y, angle, 0, s * 0.75)
  const points = `${pointPair(front)} ${pointPair(right)} ${pointPair(back)} ${pointPair(left)}`

  if (kind === 'filledDiamond') {
    return `<polygon points="${points}" fill="${stroke}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round"/>`
  }

  if (kind === 'hollowDiamond') {
    return `<polygon points="${points}" fill="#ffffff" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`
  }

  return ''
}

function buildRelationshipPreviewSvg(notation: RelationshipNotation): string {
  const x1 = 6
  const y1 = VIEWBOX_H / 2
  const x2 = VIEWBOX_W - 6
  const y2 = VIEWBOX_H / 2
  const stroke = escapeXml(LINE_COLOR)
  const lineWidth = notation.width ?? 1.6
  const dashAttr = notation.dash?.length ? ` stroke-dasharray="${notation.dash.join(' ')}"` : ''

  const background = `<rect x="0.5" y="0.5" width="${VIEWBOX_W - 1}" height="${VIEWBOX_H - 1}" rx="2" fill="#ffffff" stroke="#d8dee9" stroke-width="0.75"/>`
  const line = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${lineWidth}" stroke-linecap="round"${dashAttr}/>`
  const startMarker =
    notation.startMarker !== 'none'
      ? buildStartMarkerSvg(x1, y1, Math.PI, notation.startMarker, MARKER_SIZE, LINE_COLOR)
      : ''
  const endMarker =
    notation.endMarker !== 'none'
      ? buildEndMarkerSvg(x2, y2, 0, notation.endMarker, MARKER_SIZE, LINE_COLOR)
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_W} ${VIEWBOX_H}" role="img" aria-hidden="true">${background}${line}${startMarker}${endMarker}</svg>`
}

export function buildRelationshipPaletteSvg(relationshipType: string): string {
  return buildRelationshipPreviewSvg(getRelationshipNotation(relationshipType))
}

export function buildRelationshipPaletteSvgDataUrl(relationshipType: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildRelationshipPaletteSvg(relationshipType))}`
}
