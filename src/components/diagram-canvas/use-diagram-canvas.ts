import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import {
  getNodeAtPosition,
  roundDiagramCoord,
  snapPointToGrid,
} from '../../lib/archimate/diagram-model'
import { distancePointToSegment } from '../../lib/archimate/connection-geometry'
import {
  getSidebarElementDragId,
  getSidebarNewElementDragType,
  getSidebarNewRelationshipDragType,
  getSidebarDiagramDragId,
  hasSidebarDiagramDrop,
} from '../../lib/archimate/sidebar-drag'
import {
  applyPanDelta,
  applyPointerDelta,
  BENDPOINT_DRAG_SLOP,
  clampZoom,
  exportDiagramPng,
  findBendpointHitAtPoint,
  getCanvasPointer,
  isPointInResizeHandle,
  paintDiagramCanvas,
  pickRelationshipAtScreenPoint,
  ZOOM_WHEEL_FACTOR,
  CONNECTION_FLOW_CYCLE_MS,
} from '../../lib/diagram-canvas'
import type {
  BendpointInteraction,
  DiagramCanvasProps,
  DragPreview,
  Interaction,
  RenderedConnection,
} from '../../lib/diagram-canvas'
import type { Point } from '../../types/model'
import { useCompareCanvasSync } from '../changes/compare-canvas-sync'

export function useDiagramCanvas(props: DiagramCanvasProps) {
  const {
    diagram,
    diagramExportName,
    elementById,
    relationshipById,
    readOnly = false,
    highlightNodeIds,
    highlightConnectionIds,
    flowConnectionIds,
    animateConnectionFlow = false,
    selectedNodeId,
    selectedRelationshipRef,
    linkCreateMode,
    linkCreateSourceId,
    onNodeSelect,
    onNodeMove,
    onNodeResize,
    onRelationshipSelect,
    selectedBendpointIndex,
    onBendpointSelect,
    onRelationshipBendpointChange,
    onRelationshipBendpointAdd,
    onRelationshipBendpointRemove,
    onLinkNodePick,
    onDropElementAtPoint,
    onDropNewElementAtPoint,
    onDropNewRelationshipAtPoint,
    onDropDiagramReferenceAtPoint,
    onOpenDiagramReference,
    diagrams,
  } = props

  const diagramById = useMemo(
    () => (diagrams?.length ? new Map(diagrams.map((item) => [item.id, item])) : undefined),
    [diagrams],
  )

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewBoxRef = useRef({ translateX: 0, translateY: 0 })
  const interactionRef = useRef<Interaction | null>(null)
  const suppressClickRef = useRef(false)
  const pendingBendpointRef = useRef<{
    pointerId: number
    relationshipRef: string
    bendpointIndex: number
    sourceCenter: Point
    targetCenter: Point
    startClientX: number
    startClientY: number
    startLogicalX: number
    startLogicalY: number
  } | null>(null)
  const renderedConnectionsRef = useRef<RenderedConnection[]>([])
  const dragPreviewRef = useRef<DragPreview | null>(null)
  const paintRafRef = useRef<number | null>(null)
  const flowAnimRafRef = useRef<number | null>(null)
  const connectionFlowPhaseRef = useRef(0)
  const flowAnimStartRef = useRef(0)
  const compareSync = useCompareCanvasSync()
  const compareSyncCleanupRef = useRef<(() => void) | undefined>(undefined)
  const wheelCleanupRef = useRef<(() => void) | undefined>(undefined)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(1)
  const [internalZoom, setInternalZoom] = useState(1)
  const zoom = compareSync?.zoom ?? internalZoom
  zoomRef.current = zoom
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [isElementDropTarget, setIsElementDropTarget] = useState(false)

  const handleScrollContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      wheelCleanupRef.current?.()
      wheelCleanupRef.current = undefined
      scrollContainerRef.current = element
      compareSyncCleanupRef.current?.()
      compareSyncCleanupRef.current = compareSync?.registerScrollElement(element)

      if (element) {
        const onWheel = (event: WheelEvent) => {
          event.preventDefault()
          event.stopPropagation()
          if (event.deltaY === 0) {
            return
          }
          const factor = event.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR
          const clamped = clampZoom(zoomRef.current * factor)
          if (compareSync) {
            compareSync.setZoom(clamped)
          } else {
            setInternalZoom(clamped)
          }
        }
        element.addEventListener('wheel', onWheel, { passive: false })
        wheelCleanupRef.current = () => element.removeEventListener('wheel', onWheel)
      }
    },
    [compareSync],
  )

  useEffect(() => {
    return () => {
      wheelCleanupRef.current?.()
      compareSyncCleanupRef.current?.()
    }
  }, [])

  const paintDiagram = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !diagram) {
      return
    }

    const result = paintDiagramCanvas(canvas, {
      diagram,
      elementById,
      relationshipById,
      readOnly,
      highlightNodeIds,
      highlightConnectionIds,
      flowConnectionIds,
      connectionFlowPhase: animateConnectionFlow ? connectionFlowPhaseRef.current : undefined,
      selectedNodeId,
      selectedRelationshipRef,
      selectedBendpointIndex,
      linkCreateMode,
      linkCreateSourceId,
      dragPreview: dragPreviewRef.current,
      diagramById,
    })

    if (result) {
      viewBoxRef.current = { translateX: result.translateX, translateY: result.translateY }
      renderedConnectionsRef.current = result.renderedConnections
    }
  }, [
    diagram,
    elementById,
    relationshipById,
    readOnly,
    highlightNodeIds,
    highlightConnectionIds,
    flowConnectionIds,
    animateConnectionFlow,
    selectedNodeId,
    selectedRelationshipRef,
    selectedBendpointIndex,
    linkCreateMode,
    linkCreateSourceId,
    diagramById,
  ])

  const scheduleRepaint = useCallback(() => {
    if (paintRafRef.current !== null) {
      return
    }
    paintRafRef.current = requestAnimationFrame(() => {
      paintRafRef.current = null
      paintDiagram()
    })
  }, [paintDiagram])

  const hasFlowConnections =
    animateConnectionFlow &&
    (flowConnectionIds instanceof Set
      ? flowConnectionIds.size > 0
      : (flowConnectionIds?.length ?? 0) > 0)

  useEffect(() => {
    if (!hasFlowConnections) {
      if (flowAnimRafRef.current !== null) {
        cancelAnimationFrame(flowAnimRafRef.current)
        flowAnimRafRef.current = null
      }
      connectionFlowPhaseRef.current = 0
      return
    }

    flowAnimStartRef.current = performance.now()
    const tick = (now: number) => {
      const elapsed = now - flowAnimStartRef.current
      connectionFlowPhaseRef.current =
        (elapsed % CONNECTION_FLOW_CYCLE_MS) / CONNECTION_FLOW_CYCLE_MS
      scheduleRepaint()
      flowAnimRafRef.current = requestAnimationFrame(tick)
    }
    flowAnimRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (flowAnimRafRef.current !== null) {
        cancelAnimationFrame(flowAnimRafRef.current)
        flowAnimRafRef.current = null
      }
    }
  }, [hasFlowConnections, scheduleRepaint])

  useEffect(() => {
    paintDiagram()
    return () => {
      if (paintRafRef.current !== null) {
        cancelAnimationFrame(paintRafRef.current)
        paintRafRef.current = null
      }
    }
  }, [
    paintDiagram,
    diagram,
    relationshipById,
    highlightNodeIds,
    highlightConnectionIds,
    flowConnectionIds,
    selectedNodeId,
    selectedRelationshipRef,
    selectedBendpointIndex,
    linkCreateMode,
    linkCreateSourceId,
  ])

  useEffect(() => {
    const handle = window.setTimeout(() => scheduleRepaint(), 150)
    return () => window.clearTimeout(handle)
  }, [elementById, scheduleRepaint])

  function commitDragPreview() {
    const preview = dragPreviewRef.current
    dragPreviewRef.current = null
    if (!preview) {
      return
    }
    if (preview.type === 'move' && (preview.dx || preview.dy)) {
      onNodeMove?.(
        preview.nodeId,
        roundDiagramCoord(preview.dx),
        roundDiagramCoord(preview.dy),
      )
      return
    }
    if (preview.type === 'resize' && (preview.dw || preview.dh)) {
      onNodeResize?.(
        preview.nodeId,
        roundDiagramCoord(preview.dw),
        roundDiagramCoord(preview.dh),
      )
      return
    }
    if (preview.type === 'bendpoint') {
      onRelationshipBendpointChange?.(
        preview.relationshipRef,
        preview.bendpointIndex,
        preview.bendpoint,
      )
    }
  }

  function clearPendingBendpoint(pointerId: number): void {
    if (pendingBendpointRef.current?.pointerId === pointerId) {
      pendingBendpointRef.current = null
    }
  }

  function startPendingBendpointDrag(
    canvas: HTMLCanvasElement,
    pending: NonNullable<typeof pendingBendpointRef.current>,
    ptr: { logicalX: number; logicalY: number },
  ): void {
    beginInteraction(canvas, {
      type: 'bendpoint',
      pointerId: pending.pointerId,
      relationshipRef: pending.relationshipRef,
      bendpointIndex: pending.bendpointIndex,
      sourceCenter: pending.sourceCenter,
      targetCenter: pending.targetCenter,
      lastLogicalX: ptr.logicalX,
      lastLogicalY: ptr.logicalY,
    } satisfies BendpointInteraction)
    pendingBendpointRef.current = null
  }

  function releaseInteraction(pointerId: number) {
    const canvas = canvasRef.current
    const scrollEl = scrollContainerRef.current
    const inter = interactionRef.current
    if (!inter || inter.pointerId !== pointerId) {
      clearPendingBendpoint(pointerId)
      return
    }
    interactionRef.current = null
    setIsDragging(false)
    setIsPanning(false)
    if (inter.type !== 'pan') {
      commitDragPreview()
    }
    const captureTarget = scrollEl ?? canvas
    if (captureTarget) {
      try {
        captureTarget.releasePointerCapture(pointerId)
      } catch {
        /* pointer already released */
      }
    }
  }

  function beginInteraction(canvas: HTMLCanvasElement, interaction: Interaction) {
    interactionRef.current = interaction
    setIsDragging(interaction.type === 'move' || interaction.type === 'resize')
    setIsPanning(interaction.type === 'pan')
    const captureTarget = scrollContainerRef.current ?? canvas
    try {
      captureTarget.setPointerCapture(interaction.pointerId)
    } catch {
      /* ignore */
    }
  }

  function startPanView(event: React.PointerEvent) {
    if (!diagram || event.button !== 1) {
      return
    }
    const scrollEl = scrollContainerRef.current
    const canvas = canvasRef.current
    if (!scrollEl || !canvas) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = true
    beginInteraction(canvas, {
      type: 'pan',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: scrollEl.scrollLeft,
      startScrollTop: scrollEl.scrollTop,
    })
  }

  function handleDragOver(event: React.DragEvent) {
    const canDropExisting = Boolean(onDropElementAtPoint)
    const canDropNewElement = Boolean(onDropNewElementAtPoint)
    const canDropNewRelationship = Boolean(onDropNewRelationshipAtPoint)
    const canDropDiagramReference = Boolean(onDropDiagramReferenceAtPoint)
    if (
      readOnly ||
      (!canDropExisting &&
        !canDropNewElement &&
        !canDropNewRelationship &&
        !canDropDiagramReference) ||
      !hasSidebarDiagramDrop(event.dataTransfer)
    ) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsElementDropTarget(true)
  }

  function handleDragLeave(event: React.DragEvent) {
    const canvas = canvasRef.current
    if (!canvas) {
      setIsElementDropTarget(false)
      return
    }
    const related = event.relatedTarget as Node | null
    if (related && canvas.contains(related)) {
      return
    }
    setIsElementDropTarget(false)
  }

  function handleDrop(event: React.DragEvent) {
    setIsElementDropTarget(false)
    if (readOnly) {
      return
    }
    const elementId = getSidebarElementDragId(event.dataTransfer)
    const newElementType = getSidebarNewElementDragType(event.dataTransfer)
    const newRelationshipType = getSidebarNewRelationshipDragType(event.dataTransfer)
    const diagramReferenceId = getSidebarDiagramDragId(event.dataTransfer)
    if (!elementId && !newElementType && !newRelationshipType && !diagramReferenceId) {
      return
    }
    if (elementId && !onDropElementAtPoint) {
      return
    }
    if (newElementType && !onDropNewElementAtPoint) {
      return
    }
    if (newRelationshipType && !onDropNewRelationshipAtPoint) {
      return
    }
    if (diagramReferenceId && !onDropDiagramReferenceAtPoint) {
      return
    }
    event.preventDefault()
    suppressClickRef.current = true
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ptr = getCanvasPointer(canvas, viewBoxRef.current, event)
    if (!ptr) {
      return
    }
    const { x: dropX, y: dropY } = snapPointToGrid(ptr.logicalX, ptr.logicalY)
    if (diagramReferenceId) {
      onDropDiagramReferenceAtPoint!(diagramReferenceId, dropX, dropY)
      return
    }
    if (elementId) {
      onDropElementAtPoint!(elementId, dropX, dropY)
      return
    }
    if (newElementType) {
      onDropNewElementAtPoint!(newElementType, dropX, dropY)
      return
    }
    const hitNode = diagram ? getNodeAtPosition(diagram.nodes, dropX, dropY) : null
    onDropNewRelationshipAtPoint!(
      newRelationshipType!,
      dropX,
      dropY,
      hitNode?.id ?? null,
    )
  }

  function handleCanvasClick(event: React.MouseEvent) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (!diagram) {
      return
    }
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ptr = getCanvasPointer(canvas, viewBoxRef.current, event)
    if (!ptr) {
      return
    }
    const { x, y, logicalX, logicalY } = ptr

    if (!readOnly && linkCreateMode) {
      const hitNodeForLink = getNodeAtPosition(diagram.nodes, logicalX, logicalY)
      if (hitNodeForLink) {
        onLinkNodePick?.(hitNodeForLink)
        onRelationshipSelect?.(null)
        onNodeSelect?.(hitNodeForLink)
        return
      }
    }

    const hitRelationshipRef = pickRelationshipAtScreenPoint(x, y, renderedConnectionsRef.current)
    if (hitRelationshipRef) {
      onRelationshipSelect?.(hitRelationshipRef)
      onNodeSelect?.(null)
      return
    }

    const hitNode = getNodeAtPosition(diagram.nodes, logicalX, logicalY)
    if (hitNode) {
      onRelationshipSelect?.(null)
      onNodeSelect?.(hitNode)
      return
    }
    if (readOnly) {
      onRelationshipSelect?.(null)
      onNodeSelect?.(null)
    }
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (!diagram) {
      return
    }
    if (event.button === 1) {
      startPanView(event)
      return
    }
    if (readOnly || event.button !== 0) {
      return
    }
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ptr = getCanvasPointer(canvas, viewBoxRef.current, event)
    if (!ptr) {
      return
    }

    const { x, y, logicalX, logicalY, translateX, translateY } = ptr
    suppressClickRef.current = false
    interactionRef.current = null
    setIsDragging(false)

    if (linkCreateMode) {
      const hitForLink = getNodeAtPosition(diagram.nodes, logicalX, logicalY)
      if (hitForLink) {
        event.preventDefault()
        return
      }
    }

    const hitNode = getNodeAtPosition(diagram.nodes, logicalX, logicalY)
    if (hitNode && hitNode.id === selectedNodeId) {
      if (isPointInResizeHandle(hitNode, translateX, translateY, x, y)) {
        beginInteraction(canvas, {
          type: 'resize',
          pointerId: event.pointerId,
          nodeId: hitNode.id,
          startLogicalX: logicalX,
          startLogicalY: logicalY,
          startNodeX: hitNode.x,
          startNodeY: hitNode.y,
          baseWidth: hitNode.width,
          baseHeight: hitNode.height,
        })
        event.preventDefault()
        return
      }
    }

    if (selectedRelationshipRef) {
      const selectedConnection = renderedConnectionsRef.current.find(
        (c) => c.relationshipRef === selectedRelationshipRef,
      )
      if (selectedConnection) {
        const conn = diagram.connections.find((c) => c.relationshipRef === selectedRelationshipRef)
        if (conn?.bendpoints?.length) {
          for (let i = 0; i < conn.bendpoints.length; i += 1) {
            const bp = conn.bendpoints[i]
            const hx = selectedConnection.sourceCenter.x + (bp.startX ?? 0)
            const hy = selectedConnection.sourceCenter.y + (bp.startY ?? 0)
            if (Math.hypot(x - hx, y - hy) <= 8) {
              onBendpointSelect?.(i)
              pendingBendpointRef.current = {
                pointerId: event.pointerId,
                relationshipRef: selectedRelationshipRef,
                bendpointIndex: i,
                sourceCenter: selectedConnection.sourceCenter,
                targetCenter: selectedConnection.targetCenter,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startLogicalX: logicalX,
                startLogicalY: logicalY,
              }
              return
            }
          }
        }
      }
    }

    const clickPoint = { x, y }
    const connections = renderedConnectionsRef.current
    for (let ci = connections.length - 1; ci >= 0; ci -= 1) {
      const c = connections[ci]
      for (let i = 0; i < c.points.length - 1; i += 1) {
        const d = distancePointToSegment(clickPoint, c.points[i], c.points[i + 1])
        if (d <= 7) {
          onRelationshipSelect?.(c.relationshipRef)
          onNodeSelect?.(null)
          suppressClickRef.current = true
          event.preventDefault()
          return
        }
      }
    }

    const hitNodeForDrag = getNodeAtPosition(diagram.nodes, logicalX, logicalY)
    if (!hitNodeForDrag) {
      return
    }

    onRelationshipSelect?.(null)
    onNodeSelect?.(hitNodeForDrag)
    dragPreviewRef.current = null
    beginInteraction(canvas, {
      type: 'move',
      pointerId: event.pointerId,
      nodeId: hitNodeForDrag.id,
      startLogicalX: logicalX,
      startLogicalY: logicalY,
      startNodeX: hitNodeForDrag.x,
      startNodeY: hitNodeForDrag.y,
      lastLogicalX: logicalX,
      lastLogicalY: logicalY,
    })
    event.preventDefault()
  }

  function handlePointerMove(event: React.PointerEvent) {
    const pending = pendingBendpointRef.current
    if (!interactionRef.current && pending?.pointerId === event.pointerId) {
      const moved = Math.hypot(
        event.clientX - pending.startClientX,
        event.clientY - pending.startClientY,
      )
      if (moved >= BENDPOINT_DRAG_SLOP) {
        const canvas = canvasRef.current
        if (!canvas) {
          return
        }
        const ptr = getCanvasPointer(canvas, viewBoxRef.current, event)
        if (!ptr) {
          return
        }
        startPendingBendpointDrag(canvas, pending, ptr)
      } else {
        return
      }
    }

    const inter = interactionRef.current
    if (!inter || inter.pointerId !== event.pointerId) {
      return
    }
    if (inter.type === 'pan') {
      const scrollEl = scrollContainerRef.current
      if (!scrollEl) {
        return
      }
      event.preventDefault()
      const panResult = applyPanDelta(inter, event)
      suppressClickRef.current = panResult.suppressClick
      scrollEl.scrollLeft = panResult.scrollLeft
      scrollEl.scrollTop = panResult.scrollTop
      return
    }
    if (readOnly) {
      return
    }
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ptr = getCanvasPointer(canvas, viewBoxRef.current, event)
    if (!ptr) {
      return
    }
    const deltaResult = applyPointerDelta(
      inter,
      ptr,
      diagram?.nodes ?? [],
      dragPreviewRef.current,
    )
    if (!deltaResult) {
      return
    }
    suppressClickRef.current = deltaResult.suppressClick
    dragPreviewRef.current = deltaResult.dragPreview
    if (deltaResult.interaction) {
      interactionRef.current = deltaResult.interaction
    }
    if (deltaResult.shouldRepaint) {
      scheduleRepaint()
    }
  }

  function handlePointerUp(event: React.PointerEvent) {
    releaseInteraction(event.pointerId)
  }

  function handlePointerCancel(event: React.PointerEvent) {
    releaseInteraction(event.pointerId)
  }

  function handleAuxClick(event: React.MouseEvent) {
    if (event.button === 1) {
      event.preventDefault()
    }
  }

  function handleCanvasDoubleClick(event: React.MouseEvent) {
    if (!diagram) {
      return
    }
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ptr = getCanvasPointer(canvas, viewBoxRef.current, event)
    if (!ptr) {
      return
    }
    const hitNode = getNodeAtPosition(diagram.nodes, ptr.logicalX, ptr.logicalY)
    if (hitNode?.referencedDiagramId) {
      onOpenDiagramReference?.(hitNode.referencedDiagramId)
      return
    }

    const { x, y } = ptr
    const clickPoint = { x, y }

    if (!readOnly) {
      const bendpointHit = findBendpointHitAtPoint(
        x,
        y,
        diagram,
        renderedConnectionsRef.current,
      )
      if (bendpointHit) {
        pendingBendpointRef.current = null
        onRelationshipSelect?.(bendpointHit.relationshipRef)
        onRelationshipBendpointRemove?.(bendpointHit.relationshipRef, bendpointHit.index)
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }

    const relationshipRef =
      selectedRelationshipRef ??
      (!readOnly ? pickRelationshipAtScreenPoint(x, y, renderedConnectionsRef.current) : null)
    if (readOnly || !relationshipRef) {
      return
    }
    const connection = renderedConnectionsRef.current.find(
      (c) => c.relationshipRef === relationshipRef,
    )
    if (!connection) {
      return
    }

    let best: { index: number; distance: number } | null = null
    for (let i = 0; i < connection.points.length - 1; i += 1) {
      const a = connection.points[i]
      const b = connection.points[i + 1]
      const d = distancePointToSegment(clickPoint, a, b)
      if (!best || d < best.distance) {
        best = { index: i, distance: d }
      }
    }
    if (!best || best.distance > 10) {
      return
    }
    onRelationshipSelect?.(relationshipRef)
    onRelationshipBendpointAdd?.(relationshipRef, best.index, {
      startX: x - connection.sourceCenter.x,
      startY: y - connection.sourceCenter.y,
      endX: x - connection.targetCenter.x,
      endY: y - connection.targetCenter.y,
    })
  }

  const setZoomClamped = useCallback(
    (nextZoom: number) => {
      const clamped = clampZoom(nextZoom)
      if (compareSync) {
        compareSync.setZoom(clamped)
      } else {
        setInternalZoom(clamped)
      }
    },
    [compareSync],
  )

  function handleExportPng() {
    exportDiagramPng(canvasRef.current, diagram, diagramExportName)
  }

  return {
    diagram,
    canvasRef,
    zoom,
    isDragging,
    isPanning,
    isElementDropTarget,
    handleScrollContainerRef,
    setZoomClamped,
    handleExportPng,
    handleCanvasClick,
    handleAuxClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleCanvasDoubleClick,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    startPanView,
  }
}
