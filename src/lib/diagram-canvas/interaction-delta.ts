import {
  computeSnappedNodeOffset,
  computeSnappedNodeResize,
  findNodeById,
  getNodeAtPosition,
  snapPointToGrid,
} from '../archimate/diagram-model'
import type {
  CanvasPointer,
  DragPreview,
  DragPreviewConnectionEndpoint,
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
        nodeIds: interaction.nodeIds.length > 1 ? interaction.nodeIds : undefined,
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

  if (interaction.type === 'connectionEndpoint') {
    const hitNode = getNodeAtPosition(diagramNodes, ptr.logicalX, ptr.logicalY)
    let hoverNodeId: string | null = null
    if (hitNode?.elementRef && hitNode.id !== interaction.fixedNodeId) {
      hoverNodeId = hitNode.id
    }
    const preview: DragPreviewConnectionEndpoint = {
      type: 'connectionEndpoint',
      relationshipRef: interaction.relationshipRef,
      endpoint: interaction.endpoint,
      anchorPoint: interaction.anchorPoint,
      hoverNodeId,
      pointerCanvasX: ptr.x,
      pointerCanvasY: ptr.y,
    }
    if (
      currentDragPreview?.type === 'connectionEndpoint' &&
      currentDragPreview.relationshipRef === preview.relationshipRef &&
      currentDragPreview.endpoint === preview.endpoint &&
      currentDragPreview.hoverNodeId === preview.hoverNodeId &&
      currentDragPreview.pointerCanvasX === preview.pointerCanvasX &&
      currentDragPreview.pointerCanvasY === preview.pointerCanvasY
    ) {
      return null
    }
    return {
      suppressClick: true,
      dragPreview: preview,
      interaction: {
        ...interaction,
        lastLogicalX: ptr.logicalX,
        lastLogicalY: ptr.logicalY,
      },
      shouldRepaint: true,
    }
  }

  if (interaction.type === 'bendpoint') {
    const { sourceCenter, targetCenter, bendpointIndex, relationshipRef } = interaction
    const snapped = snapPointToGrid(ptr.logicalX, ptr.logicalY)
    const snappedCanvasX = snapped.x + ptr.translateX
    const snappedCanvasY = snapped.y + ptr.translateY
    const bendpoint = {
      startX: snappedCanvasX - sourceCenter.x,
      startY: snappedCanvasY - sourceCenter.y,
      endX: snappedCanvasX - targetCenter.x,
      endY: snappedCanvasY - targetCenter.y,
    }
    if (
      currentDragPreview?.type === 'bendpoint' &&
      currentDragPreview.relationshipRef === relationshipRef &&
      currentDragPreview.bendpointIndex === bendpointIndex &&
      currentDragPreview.bendpoint.startX === bendpoint.startX &&
      currentDragPreview.bendpoint.startY === bendpoint.startY &&
      currentDragPreview.bendpoint.endX === bendpoint.endX &&
      currentDragPreview.bendpoint.endY === bendpoint.endY
    ) {
      return null
    }
    return {
      suppressClick: true,
      dragPreview: {
        type: 'bendpoint',
        relationshipRef,
        bendpointIndex,
        bendpoint,
      },
      interaction: null,
      shouldRepaint: true,
    }
  }

  return null
}
