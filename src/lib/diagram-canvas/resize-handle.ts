import type { DiagramNode } from '../../types/model'
import { RESIZE_HANDLE_SIZE } from './constants'

export function getResizeHandleRect(node: DiagramNode, translateX: number, translateY: number) {
  const left = node.x + translateX + node.width - RESIZE_HANDLE_SIZE
  const top = node.y + translateY + node.height - RESIZE_HANDLE_SIZE
  return { left, top, size: RESIZE_HANDLE_SIZE }
}

export function isPointInResizeHandle(
  node: DiagramNode,
  translateX: number,
  translateY: number,
  x: number,
  y: number,
) {
  const { left, top, size } = getResizeHandleRect(node, translateX, translateY)
  return x >= left && x <= left + size && y >= top && y <= top + size
}
