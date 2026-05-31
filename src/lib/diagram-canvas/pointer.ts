import type { CanvasPointer } from './types'

export function getCanvasPointer(
  canvas: HTMLCanvasElement,
  viewBox: { translateX: number; translateY: number },
  event: { clientX: number; clientY: number },
): CanvasPointer | null {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }
  const scaleX = canvas.offsetWidth / rect.width
  const scaleY = canvas.offsetHeight / rect.height
  const x = (event.clientX - rect.left) * scaleX
  const y = (event.clientY - rect.top) * scaleY
  const { translateX, translateY } = viewBox
  return {
    x,
    y,
    logicalX: x - translateX,
    logicalY: y - translateY,
    scaleX,
    scaleY,
    translateX,
    translateY,
  }
}
