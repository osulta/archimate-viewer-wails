import { DIAGRAM_GRID_STEP, normalizeRelationshipType } from './diagram-model'
import {
  getElementNotationStyle,
  getElementVisualSpec,
  getRelationshipNotation,
} from './notation'
import type { Point, RelationshipNotation } from '../../types/model'

export { getElementNotationStyle } from './notation'
export { getElementVisualSpec as elementVisualKind } from './notation'

export function normalizeElementType(type: string | undefined | null): string {
  if (!type) {
    return ''
  }
  const raw = String(type)
  return raw.includes(':') ? raw.split(':').at(-1)! : raw
}

export function getRelationshipStyle(
  relationshipType: string,
  options?: { accessType?: string | number },
): RelationshipNotation {
  return getRelationshipNotation(relationshipType, options)
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawActorShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const headR = Math.min(w, h) * 0.12
  const cx = x + w / 2
  const headY = y + headR + 4
  const shoulderY = headY + headR + 2
  const bodyBottom = y + h - 6
  const armSpan = Math.min(w * 0.35, 28)

  ctx.beginPath()
  ctx.arc(cx, headY, headR, 0, Math.PI * 2)
  ctx.moveTo(cx, shoulderY)
  ctx.lineTo(cx, bodyBottom)
  ctx.moveTo(cx - armSpan / 2, shoulderY + (bodyBottom - shoulderY) * 0.35)
  ctx.lineTo(cx + armSpan / 2, shoulderY + (bodyBottom - shoulderY) * 0.35)
  ctx.moveTo(cx, bodyBottom)
  ctx.lineTo(cx - armSpan / 3, y + h - 2)
  ctx.moveTo(cx, bodyBottom)
  ctx.lineTo(cx + armSpan / 3, y + h - 2)
}

function drawInterfaceShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) * 0.38
  const cx = x + w / 2
  const cy = y + h / 2
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
}

function drawJunctionShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2
  const cy = y + h / 2
  const r = Math.min(w, h) / 2 - 2
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
}

function drawLocationShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2
  const pinTop = y + 4
  const pinBottom = y + h - 4
  const pinW = Math.min(w * 0.35, 18)
  ctx.beginPath()
  ctx.arc(cx, pinTop + pinW * 0.55, pinW * 0.55, Math.PI, 0)
  ctx.lineTo(cx + pinW * 0.55, pinTop + pinW)
  ctx.lineTo(cx, pinBottom)
  ctx.lineTo(cx - pinW * 0.55, pinTop + pinW)
  ctx.closePath()
}

function drawPlateauShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const step = Math.min(14, h / 3)
  ctx.beginPath()
  ctx.moveTo(x, y + step)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + step, y)
  ctx.closePath()
}

function drawGapShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const gap = Math.min(10, w / 6)
  const mid = x + w / 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(mid - gap, y)
  ctx.moveTo(mid + gap, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(mid + gap, y + h)
  ctx.moveTo(mid - gap, y + h)
  ctx.lineTo(x, y + h)
  ctx.closePath()
}

function drawPathShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const band = Math.min(8, h / 4)
  ctx.beginPath()
  ctx.moveTo(x, y + band)
  ctx.lineTo(x + w, y + band)
  ctx.lineTo(x + w, y + h - band)
  ctx.lineTo(x, y + h - band)
  ctx.closePath()
}

export function drawElementShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: string,
): void {
  if (shape === 'rounded') {
    roundedRect(ctx, x, y, w, h, 12)
    return
  }
  if (shape === 'rect') {
    roundedRect(ctx, x, y, w, h, 2)
    return
  }
  if (shape === 'passive-rect') {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    return
  }
  if (shape === 'actor') {
    roundedRect(ctx, x, y, w, h, 4)
    return
  }
  if (shape === 'event') {
    const r = Math.min(12, h / 2)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    return
  }
  if (shape === 'octagon') {
    const c = Math.min(10, Math.min(w, h) / 5)
    ctx.beginPath()
    ctx.moveTo(x + c, y)
    ctx.lineTo(x + w - c, y)
    ctx.lineTo(x + w, y + c)
    ctx.lineTo(x + w, y + h - c)
    ctx.lineTo(x + w - c, y + h)
    ctx.lineTo(x + c, y + h)
    ctx.lineTo(x, y + h - c)
    ctx.lineTo(x, y + c)
    ctx.closePath()
    return
  }
  if (shape === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    return
  }
  if (shape === 'wave') {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w, y + h)
    ctx.quadraticCurveTo(x + w * 0.75, y + h - 10, x + w * 0.5, y + h)
    ctx.quadraticCurveTo(x + w * 0.25, y + h + 10, x, y + h)
    ctx.closePath()
    return
  }
  if (shape === 'cut-corner') {
    const c = Math.min(12, Math.min(w, h) / 4)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w - c, y)
    ctx.lineTo(x + w, y + c)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    return
  }
  if (shape === 'strategy') {
    const c = Math.min(14, h / 2)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w - c, y)
    ctx.lineTo(x + w, y + h / 2)
    ctx.lineTo(x + w - c, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    return
  }
  if (shape === 'object') {
    const fold = Math.min(14, w * 0.15)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w - fold, y)
    ctx.lineTo(x + w, y + fold)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    return
  }
  if (shape === 'interface') {
    drawInterfaceShape(ctx, x, y, w, h)
    return
  }
  if (shape === 'and-junction') {
    const cx = x + w / 2
    const cy = y + h / 2
    const r = Math.min(w, h) / 2 - 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    return
  }
  if (shape === 'junction') {
    drawJunctionShape(ctx, x, y, w, h)
    return
  }
  if (shape === 'location') {
    drawLocationShape(ctx, x, y, w, h)
    return
  }
  if (shape === 'grouping') {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    return
  }
  if (shape === 'plateau') {
    drawPlateauShape(ctx, x, y, w, h)
    return
  }
  if (shape === 'gap') {
    drawGapShape(ctx, x, y, w, h)
    return
  }
  if (shape === 'path') {
    drawPathShape(ctx, x, y, w, h)
    return
  }
  roundedRect(ctx, x, y, w, h, 4)
}

export function drawElementInnerGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: string,
  color: string,
): void {
  if (shape === 'actor') {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.4
    drawActorShape(ctx, x, y, w, h)
    ctx.stroke()
    ctx.restore()
  }
}

function drawIsometricNodeCube(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
  depth: number,
  fill: string,
  stroke: string,
): void {
  const dx = depth
  const dy = depth

  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.2

  ctx.beginPath()
  ctx.moveTo(fx, fy)
  ctx.lineTo(fx + dx, fy - dy)
  ctx.lineTo(fx + fw + dx, fy - dy)
  ctx.lineTo(fx + fw, fy)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(fx + fw, fy)
  ctx.lineTo(fx + fw + dx, fy - dy)
  ctx.lineTo(fx + fw + dx, fy + fh - dy)
  ctx.lineTo(fx + fw, fy + fh)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.rect(fx, fy, fw, fh)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.stroke()
}

export function drawElementIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  icon: string,
  color: string,
  fillColor?: string,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.1

  if (icon === 'service') {
    roundedRect(ctx, x, y, 14, 7, 3)
    ctx.stroke()
  } else if (icon === 'business-event') {
    const fill = fillColor ?? '#fff4b8'
    const left = x + 1
    const notchX = x + 3.5
    const top = y + 2.5
    const bottom = y + 7.5
    const midY = (top + bottom) / 2
    const r = (bottom - top) / 2
    const arcCx = x + 12 - r
    ctx.beginPath()
    ctx.moveTo(left, top)
    ctx.lineTo(notchX, midY)
    ctx.lineTo(left, bottom)
    ctx.lineTo(arcCx, bottom)
    ctx.arc(arcCx, midY, r, Math.PI / 2, -Math.PI / 2, true)
    ctx.lineTo(left, top)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.strokeStyle = color
    ctx.fill()
    ctx.stroke()
  } else if (icon === 'event') {
    ctx.beginPath()
    ctx.moveTo(x, y + 2)
    ctx.lineTo(x + 10, y + 2)
    ctx.quadraticCurveTo(x + 14, y + 6, x + 10, y + 10)
    ctx.lineTo(x, y + 10)
    ctx.stroke()
  } else if (icon === 'equipment') {
    const strokeGear = (cx: number, cy: number, outerR: number, teeth: number) => {
      ctx.beginPath()
      ctx.arc(cx, cy, outerR * 0.58, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < teeth; i += 1) {
        const a = (i / teeth) * Math.PI * 2 - Math.PI / 2
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * outerR * 0.62, cy + Math.sin(a) * outerR * 0.62)
        ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR)
        ctx.stroke()
      }
    }
    strokeGear(x + 5.2, y + 6.2, 3.6, 6)
    strokeGear(x + 9.4, y + 4.4, 2.7, 6)
  } else if (icon === 'facility') {
    const fill = fillColor ?? '#c1fba4'
    ctx.fillStyle = fill
    ctx.strokeStyle = color

    const bot = y + 9
    const x0 = x + 1.2
    const xc = x + 3.65
    const xr = x + 12.6
    const chimTop = y + 1.05
    const valleyY = y + 4.35
    const peakY = y + 2.05

    ctx.beginPath()
    ctx.moveTo(x0, bot)
    ctx.lineTo(x0, chimTop)
    ctx.lineTo(xc, chimTop)
    ctx.lineTo(xc, valleyY)
    ctx.lineTo(x + 5.1, peakY)
    ctx.lineTo(x + 6.75, valleyY)
    ctx.lineTo(x + 8.35, peakY)
    ctx.lineTo(x + 9.95, valleyY)
    ctx.lineTo(x + 11.55, peakY)
    ctx.lineTo(xr, valleyY)
    ctx.lineTo(xr, bot)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (icon === 'product') {
    const ix = x + 1
    const iy = y + 1
    const w = 11
    const h = 9
    const tabW = 4.2
    const tabH = 3.2
    ctx.strokeRect(ix, iy, w, h)
    ctx.strokeRect(ix, iy, tabW, tabH)
  } else if (icon === 'contract') {
    const ix = x + 1
    const iy = y + 1
    const w = 11
    const h = 9
    ctx.strokeRect(ix, iy, w, h)
    const y1 = iy + h * 0.22
    const y2 = iy + h * 0.78
    ctx.beginPath()
    ctx.moveTo(ix, y1)
    ctx.lineTo(ix + w, y1)
    ctx.moveTo(ix, y2)
    ctx.lineTo(ix + w, y2)
    ctx.stroke()
  } else if (icon === 'object') {
    ctx.beginPath()
    ctx.rect(x + 1, y + 1, 11, 9)
    ctx.moveTo(x + 1, y + 3.5)
    ctx.lineTo(x + 12, y + 3.5)
    ctx.stroke()
  } else if (icon === 'artifact') {
    const fold = 3
    const left = x + 1
    const top = y + 1
    const right = x + 12
    const bottom = y + 10
    ctx.beginPath()
    ctx.moveTo(left, top)
    ctx.lineTo(right - fold, top)
    ctx.lineTo(right, top + fold)
    ctx.lineTo(right, bottom)
    ctx.lineTo(left, bottom)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(right - fold, top)
    ctx.lineTo(right - fold, top + fold)
    ctx.lineTo(right, top + fold)
    ctx.stroke()
  } else if (icon === 'capability') {
    const cell = 3.2
    const s = 2.6
    const cols = [
      [{ col: 0, row: 2 }],
      [{ col: 1, row: 1 }, { col: 1, row: 2 }],
      [{ col: 2, row: 0 }, { col: 2, row: 1 }, { col: 2, row: 2 }],
    ]
    cols.flat().forEach(({ col, row }) => {
      ctx.strokeRect(x + col * cell, y + row * cell, s, s)
    })
  } else if (icon === 'strategy') {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 10, y)
    ctx.lineTo(x + 14, y + 5)
    ctx.lineTo(x + 10, y + 10)
    ctx.lineTo(x, y + 10)
    ctx.stroke()
  } else if (icon === 'motivation') {
    const cx = x + 7
    const cy = y + 5.5
    const outerR = 5
    const midR = 3
    const dotR = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, midR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    ctx.fill()
  } else if (icon === 'application-component') {
    const fill = fillColor ?? '#c0f0fb'
    const mainX = x + 5
    const mainY = y + 1
    const mainW = 8
    const mainH = 9
    const tabW = 4
    const tabH = 3.2
    const tabX = mainX - tabW / 2
    const tabGap = 0.6
    const tabsBlockH = tabH * 2 + tabGap
    const topTabY = mainY + (mainH - tabsBlockH) / 2
    const bottomTabY = topTabY + tabH + tabGap

    ctx.fillStyle = fill
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2

    ;([
      [mainX, mainY, mainW, mainH],
      [tabX, topTabY, tabW, tabH],
      [tabX, bottomTabY, tabW, tabH],
    ] as [number, number, number, number][]).forEach(([rx, ry, rw, rh]) => {
      ctx.fillRect(rx, ry, rw, rh)
      ctx.strokeRect(rx, ry, rw, rh)
    })
  } else if (
    icon === 'technology-collaboration' ||
    icon === 'application-collaboration' ||
    icon === 'business-collaboration'
  ) {
    const r = 3.1
    const cy = y + 5.5
    const leftCx = x + 5
    const rightCx = x + 9.5
    ctx.beginPath()
    ctx.arc(leftCx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(rightCx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  } else if (icon === 'communication-network') {
    const r = 1.35
    const pts = [
      { x: x + 3, y: y + 2 },
      { x: x + 11, y: y + 2 },
      { x: x + 10, y: y + 8.5 },
      { x: x + 2, y: y + 8.5 },
    ]
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i += 1) {
      ctx.lineTo(pts[i].x, pts[i].y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = color
    pts.forEach((p) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
    })
  } else if (icon === 'system-software') {
    const fill = fillColor ?? '#c1fba4'
    const r = 3.2
    const cy = y + 5.5
    const leftCx = x + 5
    const rightCx = x + 9.5
    ctx.fillStyle = fill
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(leftCx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(rightCx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  } else if (icon === 'device') {
    const screenX = x + 1
    const screenY = y + 1
    const screenW = 12
    const screenH = 7
    roundedRect(ctx, screenX, screenY, screenW, screenH, 1.2)
    ctx.stroke()
    const standTop = screenY + screenH + 0.5
    const mid = screenX + screenW / 2
    ctx.beginPath()
    ctx.moveTo(mid - 3.5, standTop)
    ctx.lineTo(mid + 3.5, standTop)
    ctx.lineTo(mid + 2.2, standTop + 2)
    ctx.lineTo(mid - 2.2, standTop + 2)
    ctx.closePath()
    ctx.stroke()
  } else if (icon === 'node') {
    const fill = fillColor ?? '#c1fba4'
    drawIsometricNodeCube(ctx, x + 1, y + 4, 8.5, 6.5, 3, fill, color)
  } else if (icon === 'component' || icon === 'tech') {
    ctx.beginPath()
    ctx.moveTo(x, y + 1)
    ctx.lineTo(x + 10, y + 1)
    ctx.lineTo(x + 12, y + 3)
    ctx.lineTo(x + 12, y + 10)
    ctx.lineTo(x, y + 10)
    ctx.closePath()
    ctx.stroke()
  } else if (icon === 'role') {
    const midY = y + 5.5
    const ry = 2.85
    const topY = midY - ry
    const botY = midY + ry
    const cxFront = x + 10.75
    const rxFront = 1.75
    const backRight = x + 3.4
    const backLeft = x + 1.35
    const fill = fillColor ?? '#fff4b8'

    ctx.fillStyle = fill
    ctx.strokeStyle = color

    ctx.beginPath()
    ctx.moveTo(backRight, topY)
    ctx.quadraticCurveTo(backLeft, midY, backRight, botY)
    ctx.lineTo(cxFront, botY)
    ctx.ellipse(cxFront, midY, rxFront, ry, 0, Math.PI / 2, -Math.PI / 2, false)
    ctx.lineTo(backRight, topY)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.ellipse(cxFront, midY, rxFront, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (icon === 'business-process') {
    const fill = fillColor ?? '#fff4b8'
    const midY = y + 5
    const left = x + 1
    const shaftEnd = x + 6
    const tip = x + 12
    const shaftHalf = 1.4
    const headHalf = 4
    ctx.beginPath()
    ctx.moveTo(left, midY - shaftHalf)
    ctx.lineTo(shaftEnd, midY - shaftHalf)
    ctx.lineTo(shaftEnd, midY - headHalf)
    ctx.lineTo(tip, midY)
    ctx.lineTo(shaftEnd, midY + headHalf)
    ctx.lineTo(shaftEnd, midY + shaftHalf)
    ctx.lineTo(left, midY + shaftHalf)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.strokeStyle = color
    ctx.fill()
    ctx.stroke()
  } else if (icon === 'process') {
    const midY = y + 5
    const tipX = x + 11
    ctx.beginPath()
    ctx.moveTo(x + 2, midY)
    ctx.lineTo(tipX, midY)
    ctx.moveTo(tipX - 3, midY - 3)
    ctx.lineTo(tipX, midY)
    ctx.lineTo(tipX - 3, midY + 3)
    ctx.stroke()
  } else if (icon === 'application-function') {
    const fill = fillColor ?? '#c0f0fb'
    const leftX = x + 1
    const rightX = x + 12
    const cx = x + 6.5
    const topPeakY = y + 1.5
    const topShoulderY = y + 4
    const bottomNotchY = y + 6.5
    const bottomCornerY = y + 9
    ctx.beginPath()
    ctx.moveTo(leftX, topShoulderY)
    ctx.lineTo(cx, topPeakY)
    ctx.lineTo(rightX, topShoulderY)
    ctx.lineTo(rightX, bottomCornerY)
    ctx.lineTo(cx, bottomNotchY)
    ctx.lineTo(leftX, bottomCornerY)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.strokeStyle = color
    ctx.fill()
    ctx.stroke()
  } else if (icon === 'function') {
    ctx.beginPath()
    ctx.arc(x + 7, y + 5, 4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.font = 'bold 7px system-ui, sans-serif'
    ctx.fillText('F', x + 5, y + 7)
  } else if (icon === 'interaction') {
    const cy = y + 5
    const r = 3.05
    const flatGap = 2.35
    const cxL = x + 4.25
    const cxR = cxL + flatGap
    const fill = fillColor ?? '#c0f0fb'

    ctx.fillStyle = fill
    ctx.strokeStyle = color

    ctx.beginPath()
    ctx.arc(cxL, cy, r, Math.PI / 2, (3 * Math.PI) / 2, false)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cxR, cy, r, -Math.PI / 2, Math.PI / 2, false)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (icon === 'interface') {
    const cy = y + 5
    const r = 2.85
    const circleCx = x + 11.2
    ctx.beginPath()
    ctx.moveTo(x + 1.2, cy)
    ctx.lineTo(circleCx - r, cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(circleCx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  } else if (icon === 'collaboration') {
    ctx.beginPath()
    ctx.ellipse(x + 5, y + 5, 3, 4, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 9, y + 5, 3, 4, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (icon === 'work') {
    const cx = x + 5
    const cy = y + 5.5
    const r = 3.5
    const gap = 0.35
    ctx.beginPath()
    ctx.arc(cx, cy, r, gap, -gap)
    ctx.stroke()
    const exitX = cx + Math.cos(gap) * r
    const exitY = cy + Math.sin(gap) * r
    const tipX = x + 13.5
    ctx.beginPath()
    ctx.moveTo(exitX, exitY)
    ctx.lineTo(tipX, exitY)
    ctx.stroke()
    const a = 2.5
    ctx.beginPath()
    ctx.moveTo(tipX - a, exitY - a * 0.6)
    ctx.lineTo(tipX, exitY)
    ctx.lineTo(tipX - a, exitY + a * 0.6)
    ctx.closePath()
    ctx.fill()
  } else if (icon === 'requirement') {
    ctx.beginPath()
    ctx.moveTo(x + 3, y)
    ctx.lineTo(x + 12, y)
    ctx.lineTo(x + 9, y + 10)
    ctx.lineTo(x, y + 10)
    ctx.closePath()
    ctx.stroke()
  } else if (icon === 'deliverable') {
    const left = x + 1
    const top = y + 1
    const right = x + 13
    const bottom = y + 10
    ctx.beginPath()
    ctx.moveTo(left, top)
    ctx.lineTo(right, top)
    ctx.lineTo(right, bottom - 3)
    ctx.quadraticCurveTo(right - (right - left) * 0.25, bottom - 9, (left + right) / 2, bottom - 3)
    ctx.quadraticCurveTo(left + (right - left) * 0.25, bottom + 3, left, bottom - 3)
    ctx.closePath()
    ctx.stroke()
  } else if (icon === 'junction') {
    ctx.beginPath()
    ctx.arc(x + 7, y + 5, 3, 0, Math.PI * 2)
    ctx.fill()
  } else if (icon === 'value') {
    ctx.beginPath()
    ctx.ellipse(x + 7, y + 5.5, 5.5, 4, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (icon === 'meaning') {
    const cx = x + 8
    const cy = y + 4.5
    ctx.beginPath()
    ctx.moveTo(cx - 4, cy)
    ctx.quadraticCurveTo(cx - 4, cy - 3.5, cx - 1.5, cy - 3.5)
    ctx.quadraticCurveTo(cx, cy - 5, cx + 2.5, cy - 4)
    ctx.quadraticCurveTo(cx + 5.5, cy - 4, cx + 5.5, cy - 1)
    ctx.quadraticCurveTo(cx + 5.5, cy + 1.5, cx + 3, cy + 2.5)
    ctx.quadraticCurveTo(cx, cy + 3.5, cx - 2, cy + 2.5)
    ctx.quadraticCurveTo(cx - 4, cy + 2.5, cx - 4, cy)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx - 4.5, cy + 4.5, 1, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx - 5.5, cy + 6.5, 0.6, 0, Math.PI * 2)
    ctx.stroke()
  } else if (icon === 'constraint') {
    const skew = 3
    ctx.beginPath()
    ctx.moveTo(x + skew, y + 1)
    ctx.lineTo(x + 13, y + 1)
    ctx.lineTo(x + 13 - skew, y + 10)
    ctx.lineTo(x, y + 10)
    ctx.closePath()
    ctx.stroke()
    const inset = 1.8
    ctx.beginPath()
    ctx.moveTo(x + skew + inset, y + 1)
    ctx.lineTo(x + inset, y + 10)
    ctx.stroke()
  } else if (icon === 'principle') {
    const bx = x + 1.5
    const by = y + 0.5
    const bw = 11
    const bh = 10
    const br = 2.5
    ctx.beginPath()
    ctx.moveTo(bx + br, by)
    ctx.lineTo(bx + bw - br, by)
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br)
    ctx.lineTo(bx + bw, by + bh - br)
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh)
    ctx.lineTo(bx + br, by + bh)
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br)
    ctx.lineTo(bx, by + br)
    ctx.quadraticCurveTo(bx, by, bx + br, by)
    ctx.closePath()
    ctx.stroke()
    const mx = bx + bw / 2
    ctx.font = 'bold 9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', mx, by + bh * 0.43)
    ctx.beginPath()
    ctx.arc(mx, by + bh * 0.73, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  } else if (icon === 'outcome') {
    const cx = x + 6
    const cy = y + 6
    const outerR = 5
    const midR = 3
    const dotR = 1.3
    ctx.beginPath()
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, midR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    ctx.fill()
    const tailX = x + 13.5
    const tailY = y + 0
    const tipX = cx
    const tipY = cy
    const angle = Math.atan2(tipY - tailY, tipX - tailX)
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(tipX, tipY)
    ctx.stroke()
    const headLen = 2.8
    const headSpread = 0.45
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - Math.cos(angle - headSpread) * headLen, tipY - Math.sin(angle - headSpread) * headLen)
    ctx.lineTo(tipX - Math.cos(angle + headSpread) * headLen, tipY - Math.sin(angle + headSpread) * headLen)
    ctx.closePath()
    ctx.fill()
    const fLen = 2.5
    const fSpread = 0.55
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(tailX + Math.cos(angle + fSpread) * fLen, tailY + Math.sin(angle + fSpread) * fLen)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(tailX + Math.cos(angle - fSpread) * fLen, tailY + Math.sin(angle - fSpread) * fLen)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(tailX + Math.cos(angle) * fLen * 0.6, tailY + Math.sin(angle) * fLen * 0.6)
    ctx.stroke()
  } else if (icon === 'assessment') {
    const cx = x + 8.5
    const cy = y + 4
    const r = 3
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    const angle = Math.PI * 0.75
    const hx = cx + Math.cos(angle) * r
    const hy = cy + Math.sin(angle) * r
    const handleLen = 3.5
    ctx.beginPath()
    ctx.moveTo(hx, hy)
    ctx.lineTo(hx + Math.cos(angle) * handleLen, hy + Math.sin(angle) * handleLen)
    ctx.stroke()
  } else if (icon === 'driver') {
    const cx = x + 7
    const cy = y + 5.5
    const outerR = 4
    const innerR = 2
    const spokeR = 5.2
    const dotR = 1.1
    const savedLW = ctx.lineWidth
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
    ctx.stroke()
    const spokes = 8
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR)
      ctx.lineTo(cx + Math.cos(a) * spokeR, cy + Math.sin(a) * spokeR)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = savedLW
  } else if (icon === 'course-of-action') {
    const tcx = x + 10
    const tcy = y + 3.5
    const outerR = 3.5
    const innerR = 2
    const dotR = 0.9
    ctx.beginPath()
    ctx.arc(tcx, tcy, outerR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(tcx, tcy, innerR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(tcx, tcy, dotR, 0, Math.PI * 2)
    ctx.fill()
    const tipX = tcx - outerR + 0.5
    const tipY = tcy + outerR - 0.5
    const tailX = x + 0.5
    const tailY = y + 10
    const headLen = 3
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(tipX, tipY)
    ctx.stroke()
    const angle = Math.atan2(tipY - tailY, tipX - tailX)
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - headLen * Math.cos(angle - 0.45), tipY - headLen * Math.sin(angle - 0.45))
    ctx.lineTo(tipX - headLen * Math.cos(angle + 0.45), tipY - headLen * Math.sin(angle + 0.45))
    ctx.closePath()
    ctx.fill()
  } else if (icon === 'value-stream') {
    const leftEdge = x
    const topY = y + 1
    const botY = y + 10
    const cy = (topY + botY) / 2
    const notchX = leftEdge + 3.5
    const shoulderX = x + 10
    const peakX = x + 14
    ctx.beginPath()
    ctx.moveTo(leftEdge, topY)
    ctx.lineTo(shoulderX, topY)
    ctx.lineTo(peakX, cy)
    ctx.lineTo(shoulderX, botY)
    ctx.lineTo(leftEdge, botY)
    ctx.lineTo(notchX, cy)
    ctx.closePath()
    ctx.stroke()
  } else if (icon === 'resource') {
    const bx = x + 1
    const by = y + 1.5
    const bw = 10
    const bh = 8
    const capW = 2
    const capH = 4
    ctx.strokeRect(bx, by, bw, bh)
    ctx.fillRect(bx + bw, by + (bh - capH) / 2, capW, capH)
    const slotW = 1.5
    const slotGap = 1.2
    const slotH = bh - 3
    const slotY = by + 1.5
    const startX = bx + 2
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(startX + i * (slotW + slotGap), slotY, slotW, slotH)
    }
  } else if (icon === 'gap') {
    const cx = x + 7
    const cy = y + 5.5
    const r = 4
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    const lineExt = 1.5
    const lineGap = 1.8
    ctx.beginPath()
    ctx.moveTo(cx - r - lineExt, cy - lineGap)
    ctx.lineTo(cx + r + lineExt, cy - lineGap)
    ctx.moveTo(cx - r - lineExt, cy + lineGap)
    ctx.lineTo(cx + r + lineExt, cy + lineGap)
    ctx.stroke()
  } else if (icon === 'plateau') {
    const barW = 8
    const barH = 2
    const gap = 1.5
    const offsets = [4, 2, 0]
    const topY = y + 1.5
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x + offsets[i], topY + i * (barH + gap), barW, barH)
    }
  } else if (icon === 'location') {
    ctx.beginPath()
    ctx.arc(x + 7, y + 3, 2.5, Math.PI, 0)
    ctx.lineTo(x + 7, y + 9)
    ctx.closePath()
    ctx.stroke()
  } else if (icon === 'grouping') {
    const ix = x + 1
    const iy = y + 1.5
    const w = 12
    const h = 8.5
    const tabH = h * 0.38
    const tabW = w * 0.68
    ctx.save()
    ctx.setLineDash([2.5, 2])
    ctx.beginPath()
    ctx.moveTo(ix, iy)
    ctx.lineTo(ix + tabW, iy)
    ctx.lineTo(ix + tabW, iy + tabH)
    ctx.lineTo(ix + w, iy + tabH)
    ctx.lineTo(ix + w, iy + h)
    ctx.lineTo(ix, iy + h)
    ctx.lineTo(ix, iy + tabH)
    ctx.lineTo(ix + tabW, iy + tabH)
    ctx.lineTo(ix, iy + tabH)
    ctx.lineTo(ix, iy)
    ctx.stroke()
    ctx.restore()
  } else if (icon === 'actor') {
    const cx = x + 7
    ctx.beginPath()
    ctx.arc(cx, y + 2.5, 2, 0, Math.PI * 2)
    ctx.moveTo(cx, y + 4.5)
    ctx.lineTo(cx, y + 7.5)
    ctx.moveTo(cx - 3.5, y + 5.5)
    ctx.lineTo(cx + 3.5, y + 5.5)
    ctx.moveTo(cx, y + 7.5)
    ctx.lineTo(cx - 2.5, y + 10)
    ctx.moveTo(cx, y + 7.5)
    ctx.lineTo(cx + 2.5, y + 10)
    ctx.stroke()
  } else if (icon === 'path') {
    const midY = y + 5
    ctx.beginPath()
    ctx.moveTo(x + 3.5, y + 2)
    ctx.lineTo(x + 1, midY)
    ctx.lineTo(x + 3.5, y + 8)
    ctx.stroke()
    const dotS = 1.25
    ctx.fillRect(x + 5.5 - dotS / 2, midY - dotS / 2, dotS, dotS)
    ctx.fillRect(x + 8.5 - dotS / 2, midY - dotS / 2, dotS, dotS)
    ctx.beginPath()
    ctx.moveTo(x + 10.5, y + 2)
    ctx.lineTo(x + 13, midY)
    ctx.lineTo(x + 10.5, y + 8)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(x + 7, y + 5, 2.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  lineHeight: number,
): void {
  if (!text) {
    return
  }
  const words = String(text).split(/\s+/).filter(Boolean)
  if (!words.length) {
    return
  }

  const splitWordToFit = (word: string): string[] => {
    if (ctx.measureText(word).width <= maxWidth) {
      return [word]
    }
    const chunks: string[] = []
    let rest = word
    while (rest.length > 0) {
      let part = ''
      for (const ch of Array.from(rest)) {
        const candidate = `${part}${ch}`
        if (part && ctx.measureText(candidate).width > maxWidth) {
          break
        }
        part = candidate
      }
      if (!part) {
        part = rest.slice(0, 1)
      }
      chunks.push(part)
      rest = rest.slice(part.length)
    }
    return chunks
  }

  const tokens: string[] = []
  words.forEach((word) => {
    tokens.push(...splitWordToFit(word))
  })

  const lines: string[] = []
  let current = tokens[0]
  for (let i = 1; i < tokens.length; i += 1) {
    const candidateWithSpace = `${current} ${tokens[i]}`
    if (ctx.measureText(candidateWithSpace).width <= maxWidth) {
      current = candidateWithSpace
    } else {
      lines.push(current)
      current = tokens[i]
      if (lines.length >= maxLines) {
        break
      }
    }
  }
  if (lines.length < maxLines) {
    lines.push(current)
  }

  if (lines.length > maxLines) {
    lines.length = maxLines
  }

  if (lines.length === maxLines) {
    const lastIdx = lines.length - 1
    let last = lines[lastIdx]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1)
    }
    if (last !== lines[lastIdx]) {
      lines[lastIdx] = `${last}…`
    }
  }

  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * lineHeight)
  })
}

const RELATIONSHIP_LABEL_MIN_LENGTH = 28

interface RelationshipLabelAnchor {
  x: number
  y: number
  totalLength?: number
}

interface RelationshipLabelOptions {
  fontSize?: number
  background?: string
  border?: string
  color?: string
}

export function drawRelationshipLabel(
  ctx: CanvasRenderingContext2D,
  text: string | null | undefined,
  anchor: RelationshipLabelAnchor | null,
  options: RelationshipLabelOptions = {},
): void {
  const label = String(text ?? '').trim()
  if (!label || !anchor) {
    return
  }
  if (anchor.totalLength != null && anchor.totalLength < RELATIONSHIP_LABEL_MIN_LENGTH) {
    return
  }

  const fontSize = options.fontSize ?? 11
  const font = `${fontSize}px system-ui, sans-serif`
  const padX = 4
  const padY = 2

  ctx.save()
  ctx.font = font
  const textWidth = ctx.measureText(label).width
  const boxW = textWidth + padX * 2
  const boxH = fontSize + padY * 2
  const left = anchor.x - boxW / 2
  const top = anchor.y - boxH / 2

  ctx.fillStyle = options.background ?? 'rgba(255, 255, 255, 0.94)'
  ctx.strokeStyle = options.border ?? 'rgba(36, 36, 36, 0.2)'
  ctx.lineWidth = 1
  roundedRect(ctx, left, top, boxW, boxH, 3)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = options.color ?? '#242424'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, anchor.x, anchor.y + 0.5)
  ctx.restore()
}

export function markerLineInset(kind: string, size: number): number {
  if (!kind || kind === 'none') {
    return 0
  }
  const s = size
  switch (kind) {
    case 'filledArrow':
      return s
    case 'openArrow':
      return s * 0.85
    case 'hollowTriangle':
      return s * 1.1
    case 'filledCircle':
      return s * 0.45
    case 'filledDiamond':
    case 'hollowDiamond':
      return s * 1.15
    default:
      return s * 0.75
  }
}

export function trimPolylineForMarkers(
  points: Point[],
  startKind: string,
  endKind: string,
  markerSize: number,
): Point[] {
  if (points.length < 2) {
    return points
  }
  const out = points.map((p) => ({ ...p }))

  if (endKind !== 'none') {
    const inset = markerLineInset(endKind, markerSize)
    const pPrev = out.at(-2)!
    const pEnd = out.at(-1)!
    const dx = pEnd.x - pPrev.x
    const dy = pEnd.y - pPrev.y
    const len = Math.hypot(dx, dy)
    if (len > inset + 0.5) {
      out[out.length - 1] = {
        x: pEnd.x - (dx / len) * inset,
        y: pEnd.y - (dy / len) * inset,
      }
    }
  }

  if (startKind !== 'none') {
    const inset = markerLineInset(startKind, markerSize)
    const p0 = out[0]
    const p1 = out[1]
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.hypot(dx, dy)
    if (len > inset + 0.5) {
      out[0] = {
        x: p0.x + (dx / len) * inset,
        y: p0.y + (dy / len) * inset,
      }
    }
  }

  return out
}

export function drawEndMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  kind: string,
  size: number,
): void {
  if (kind === 'none') {
    return
  }

  const s = size
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  function rot(dx: number, dy: number): Point {
    return { x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos }
  }

  if (kind === 'openArrow') {
    const p1 = rot(-s, -s * 0.55)
    const p2 = rot(-s, s * 0.55)
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(x, y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    return
  }

  if (kind === 'filledArrow') {
    const depth = s
    const halfWidth = s * 0.55
    const baseLeft = rot(-depth, -halfWidth)
    const baseRight = rot(-depth, halfWidth)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(baseLeft.x, baseLeft.y)
    ctx.lineTo(baseRight.x, baseRight.y)
    ctx.closePath()
    ctx.fill()
    return
  }

  if (kind === 'hollowTriangle') {
    const p1 = rot(-s, -s * 0.85)
    const p2 = rot(-s, s * 0.85)
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.closePath()
    ctx.stroke()
  }
}

export function drawStartMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  kind: string,
  size: number,
): void {
  if (kind === 'none') {
    return
  }

  const s = size
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  function rot(dx: number, dy: number): Point {
    return { x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos }
  }

  if (kind === 'filledCircle') {
    ctx.beginPath()
    ctx.arc(x, y, s * 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    return
  }

  const front = rot(s, 0)
  const back = rot(-s, 0)
  const left = rot(0, -s * 0.75)
  const right = rot(0, s * 0.75)

  ctx.save()
  if (kind === 'filledDiamond') {
    ctx.beginPath()
    ctx.moveTo(front.x, front.y)
    ctx.lineTo(right.x, right.y)
    ctx.lineTo(back.x, back.y)
    ctx.lineTo(left.x, left.y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(front.x, front.y)
    ctx.lineTo(right.x, right.y)
    ctx.lineTo(back.x, back.y)
    ctx.lineTo(left.x, left.y)
    ctx.closePath()
    ctx.stroke()
    return
  }

  if (kind === 'hollowDiamond') {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(front.x, front.y)
    ctx.lineTo(right.x, right.y)
    ctx.lineTo(back.x, back.y)
    ctx.lineTo(left.x, left.y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(front.x, front.y)
    ctx.lineTo(right.x, right.y)
    ctx.lineTo(back.x, back.y)
    ctx.lineTo(left.x, left.y)
    ctx.closePath()
    ctx.stroke()
  }
}

interface PositioningGridOptions {
  cssWidth: number
  cssHeight: number
  translateX: number
  translateY: number
  step?: number
}

export function drawPositioningGrid(
  ctx: CanvasRenderingContext2D,
  { cssWidth, cssHeight, translateX, translateY, step = DIAGRAM_GRID_STEP }: PositioningGridOptions,
): void {
  const minLogicalX = -translateX
  const minLogicalY = -translateY
  const maxLogicalX = cssWidth - translateX
  const maxLogicalY = cssHeight - translateY
  const startX = Math.floor(minLogicalX / step) * step
  const startY = Math.floor(minLogicalY / step) * step

  ctx.fillStyle = 'rgba(148, 163, 184, 0.4)'
  const radius = 1

  for (let lx = startX; lx <= maxLogicalX; lx += step) {
    const cx = lx + translateX
    if (cx < 0 || cx > cssWidth) {
      continue
    }
    for (let ly = startY; ly <= maxLogicalY; ly += step) {
      const cy = ly + translateY
      if (cy < 0 || cy > cssHeight) {
        continue
      }
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function slugForDiagramExport(name: string | null | undefined): string {
  const raw = String(name ?? 'diagram')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  return raw.slice(0, 120) || 'diagram'
}
