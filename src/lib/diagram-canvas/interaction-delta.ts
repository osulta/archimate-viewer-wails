import {
  computeSnappedNodeOffset,
  computeSnappedNodeResize,
  findNodeById,
} from '../archimate/diagram-model'
import type {
  CanvasPointer,
  DragPreview,
  Interaction,
  MoveInteraction,
  PanInteraction,
} from './types'

export interface PanDeltaResult {
  scrollLeft: number
  scrollTop: number
  suppressClick: boolean
}

export function applyPanDelta(
  interaction: PanInteraction,
  event: { clientX: number; clientY: number },
): PanDeltaResult {
  return {
    scrollLeft: interaction.startScrollLeft - (event.clientX - interaction.startClientX),
    scrollTop: interaction.startScrollTop - (event.clientY - interaction.startClientY),
    suppressClick: true,
  }
}

export interface PointerDeltaResult {
  suppressClick: boolean
  dragPreview: DragPreview | null
  interaction: Interaction | null
  shouldRepaint: boolean
}

import type { DiagramNode } from '../../types/model'

export function applyPointerDelta(
  interaction: Interaction,
  ptr: CanvasPointer,
  diagramNodes: DiagramNode[],
  currentDragPreview: DragPreview | null,
): PointerDeltaResult | null {
  if (interaction.type === 'move') {
    const pointerDx = ptr.logicalX - interaction.startLogicalX
    const pointerDy = ptr.logicalY - interaction.startLogicalY
    const { dx: newDx, dy: newDy } = computeSnappedNodeOffset(
      interaction.startNodeX,
      interaction.startNodeY,
      pointerDx,
      pointerDy,
    )
    if (currentDragPreview?.type === 'move' && currentDragPreview.dx === newDx && currentDragPreview.dy === newDy) {
      return null
    }
    return {
      suppressClick: true,
      dragPreview: {
        type: 'move',
        nodeId: interaction.nodeId,
        dx: newDx,
        dy: newDy,
        dw: 0,
        dh: 0,
      },
      interaction: {
        ...interaction,
        lastLogicalX: ptr.logicalX,
        lastLogicalY: ptr.logicalY,
      } satisfies MoveInteraction,
      shouldRepaint: true,
    }
  }

  if (interaction.type === 'resize') {
    const pointerDx = ptr.logicalX - interaction.startLogicalX
    const pointerDy = ptr.logicalY - interaction.startLogicalY
    const baseNode = findNodeById(diagramNodes, interaction.nodeId)
    if (!baseNode) {
      return null
    }
    const { dw: newDw, dh: newDh } = computeSnappedNodeResize(
      interaction.startNodeX,
      interaction.startNodeY,
      interaction.baseWidth,
      interaction.baseHeight,
      pointerDx,
      pointerDy,
      baseNode.width,
      baseNode.height,
    )
    if (currentDragPreview?.type === 'resize' && currentDragPreview.dw === newDw && currentDragPreview.dh === newDh) {
      return null
    }
    if (newDw === 0 && newDh === 0) {
      return null
    }
    return {
      suppressClick: true,
      dragPreview: {
        type: 'resize',
        nodeId: interaction.nodeId,
        dx: 0,
        dy: 0,
        dw: newDw,
        dh: newDh,
      },
      interaction: null,
      shouldRepaint: true,
    }
  }

  if (interaction.type === 'bendpoint') {
    const { sourceCenter, targetCenter, bendpointIndex, relationshipRef } = interaction
    return {
      suppressClick: true,
      dragPreview: {
        type: 'bendpoint',
        relationshipRef,
        bendpointIndex,
        bendpoint: {
          startX: ptr.logicalX - sourceCenter.x,
          startY: ptr.logicalY - sourceCenter.y,
          endX: ptr.logicalX - targetCenter.x,
          endY: ptr.logicalY - targetCenter.y,
        },
      },
      interaction: null,
      shouldRepaint: true,
    }
  }

  return null
}
