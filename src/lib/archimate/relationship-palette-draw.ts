import { drawEndMarker, drawStartMarker } from './canvas-draw'
import { getRelationshipNotation } from './notation'

export function drawRelationshipPalettePreview(
  ctx: CanvasRenderingContext2D,
  relationshipType: string,
  width: number,
  height: number,
): void {
  const notation = getRelationshipNotation(relationshipType)
  const x1 = 6
  const y1 = height / 2
  const x2 = width - 6
  const y2 = height / 2
  const angleEnd = 0
  const angleStart = Math.PI

  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = '#20345d'
  ctx.fillStyle = '#20345d'
  ctx.lineWidth = notation.width ?? 1.6
  ctx.lineCap = 'round'

  if (notation.dash?.length) {
    ctx.setLineDash(notation.dash)
  }
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])

  const markerSize = 6
  if (notation.startMarker !== 'none') {
    drawStartMarker(ctx, x1, y1, angleStart, notation.startMarker, markerSize)
  }
  if (notation.endMarker !== 'none') {
    drawEndMarker(ctx, x2, y2, angleEnd, notation.endMarker, markerSize)
  }
}
