import {
  drawElementIcon,
  drawElementInnerGlyph,
  drawElementShape,
} from './canvas-draw'
import { getElementNotationStyle, getElementVisualSpec } from './notation'

export function drawElementPalettePreview(
  ctx: CanvasRenderingContext2D,
  elementType: string,
  width: number,
  height: number,
): void {
  const localType = elementType.replace(/^archimate:/i, '')
  const archimateType = `archimate:${localType}`
  const style = getElementNotationStyle(archimateType)
  const visual = getElementVisualSpec(archimateType)
  const pad = 2
  const x = pad
  const y = pad
  const w = Math.max(8, width - pad * 2)
  const h = Math.max(8, height - pad * 2)

  ctx.clearRect(0, 0, width, height)

  ctx.strokeStyle = style.border
  ctx.lineWidth = 1
  if (visual.borderDash?.length) {
    ctx.setLineDash(visual.borderDash)
  }

  drawElementShape(ctx, x, y, w, h, visual.shape)
  if (visual.bare) {
    ctx.stroke()
  } else if (visual.shape === 'and-junction') {
    ctx.fillStyle = '#000000'
    ctx.strokeStyle = '#000000'
    ctx.fill()
    ctx.stroke()
  } else if (visual.shape === 'junction') {
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1.5
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.fillStyle = style.fill
    ctx.fill()
    ctx.stroke()
  }
  if (visual.borderDash?.length) {
    ctx.setLineDash([])
  }

  if (!visual.bare && visual.shape === 'actor') {
    drawElementInnerGlyph(ctx, x, y, w, h, visual.shape, style.border)
  }

  if (!visual.bare && visual.shape === 'object') {
    const fold = Math.min(8, w * 0.15)
    const headerH = Math.min(8, h * 0.25)
    ctx.fillStyle = style.header
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w - fold, y)
    ctx.lineTo(x + w, y + fold)
    ctx.lineTo(x + w, y + headerH)
    ctx.lineTo(x, y + headerH)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = style.border
    ctx.beginPath()
    ctx.moveTo(x, y + headerH)
    ctx.lineTo(x + w, y + headerH)
    ctx.stroke()
  }

  const hideCornerIcon =
    visual.bare ||
    visual.icon === 'none' ||
    visual.shape === 'junction' ||
    visual.shape === 'and-junction' ||
    visual.shape === 'interface'
  if (!hideCornerIcon) {
    drawElementIcon(ctx, x + w - 12, y + 3, visual.icon, style.border, style.fill)
  }
}
