import { useRef, useState, useEffect, useCallback } from 'react'
import { Button, Empty, InputNumber, Space } from 'antd'
import { ZoomInOutlined, ZoomOutOutlined, DownloadOutlined } from '@ant-design/icons'
import {
  flattenNodes,
  getNodeAtPosition,
  getDiagramNodeDisplayTitle,
  applyDragPreviewToNodes,
  computeSnappedNodeOffset,
  findNodeById,
  roundDiagramCoord,
  snapPointToGrid,
} from '../lib/archimate/diagram-model'
import {
  getRelationshipExplicitName,
  resolveRelationshipTypeForCanvas,
} from '../lib/archimate/relationship-meta'
import {
  resolveConnectionPolyline,
  distancePointToSegment,
  adjustBendpointsForNodeResize,
  polylineMidpoint,
} from '../lib/archimate/connection-geometry'
import { useCompareCanvasSync } from './changes/compare-canvas-sync'
import {
  getSidebarElementDragId,
  getSidebarNewElementDragType,
  getSidebarNewRelationshipDragType,
  hasSidebarDiagramDrop,
} from '../lib/archimate/sidebar-drag'
import {
  getRelationshipStyle,
  getElementNotationStyle,
  drawElementShape,
  drawElementIcon,
  drawElementInnerGlyph,
  drawWrappedText,
  drawStartMarker,
  drawEndMarker,
  drawRelationshipLabel,
  drawPositioningGrid,
  elementVisualKind,
  slugForDiagramExport,
  normalizeElementType,
} from '../lib/archimate/canvas-draw'
import type {
  ParsedDiagram,
  ParsedElement,
  ParsedRelationship,
  DiagramNode,
  Bendpoint,
  Point,
} from '../types/model'

const RESIZE_HANDLE_SIZE = 10

function getResizeHandleRect(node: DiagramNode, translateX: number, translateY: number) {
  const left = node.x + translateX + node.width - RESIZE_HANDLE_SIZE
  const top = node.y + translateY + node.height - RESIZE_HANDLE_SIZE
  return { left, top, size: RESIZE_HANDLE_SIZE }
}

function isPointInResizeHandle(node: DiagramNode, translateX: number, translateY: number, x: number, y: number) {
  const { left, top, size } = getResizeHandleRect(node, translateX, translateY)
  return x >= left && x <= left + size && y >= top && y <= top + size
}

interface DragPreviewMove {
  type: 'move'
  nodeId: string
  dx: number
  dy: number
  dw: number
  dh: number
}

interface DragPreviewResize {
  type: 'resize'
  nodeId: string
  dx: number
  dy: number
  dw: number
  dh: number
}

interface DragPreviewBendpoint {
  type: 'bendpoint'
  relationshipRef: string
  bendpointIndex: number
  bendpoint: Bendpoint
}

type DragPreview = DragPreviewMove | DragPreviewResize | DragPreviewBendpoint

interface MoveInteraction {
  type: 'move'
  pointerId: number
  nodeId: string
  startLogicalX: number
  startLogicalY: number
  startNodeX: number
  startNodeY: number
  lastLogicalX: number
  lastLogicalY: number
}

interface ResizeInteraction {
  type: 'resize'
  pointerId: number
  nodeId: string
  startLogicalX: number
  startLogicalY: number
  baseWidth: number
  baseHeight: number
}

interface BendpointInteraction {
  type: 'bendpoint'
  pointerId: number
  relationshipRef: string
  bendpointIndex: number
  sourceCenter: Point
  targetCenter: Point
  lastLogicalX: number
  lastLogicalY: number
}

type Interaction = MoveInteraction | ResizeInteraction | BendpointInteraction

interface RenderedConnection {
  id: string
  relationshipRef: string
  sourceCenter: Point
  targetCenter: Point
  points: Point[]
}

interface CanvasPointer {
  x: number
  y: number
  logicalX: number
  logicalY: number
  scaleX: number
  scaleY: number
  translateX: number
  translateY: number
}

interface DiagramCanvasProps {
  diagram: ParsedDiagram | null
  diagramExportName?: string
  elementById: Map<string, ParsedElement>
  relationshipById?: Map<string, ParsedRelationship>
  readOnly?: boolean
  highlightNodeIds?: string[] | Set<string>
  highlightConnectionIds?: string[] | Set<string>
  selectedNodeId?: string
  selectedRelationshipRef?: string | null
  linkCreateMode?: boolean
  linkCreateSourceId?: string | null
  onNodeSelect?: (node: DiagramNode | null) => void
  onNodeMove?: (nodeId: string, dx: number, dy: number) => void
  onNodeResize?: (nodeId: string, dw: number, dh: number) => void
  onRelationshipSelect?: (ref: string | null) => void
  selectedBendpointIndex?: number | null
  onBendpointSelect?: (index: number | null) => void
  onRelationshipBendpointChange?: (relationshipRef: string, bendpointIndex: number, bendpoint: Bendpoint) => void
  onRelationshipBendpointAdd?: (relationshipRef: string, segmentIndex: number, bendpoint: Bendpoint) => void
  onRelationshipBendpointRemove?: (relationshipRef: string, bendpointIndex: number) => void
  onLinkNodePick?: (node: DiagramNode) => void
  onDropElementAtPoint?: (elementId: string, x: number, y: number) => void
  onDropNewElementAtPoint?: (elementType: string, x: number, y: number) => void
  onDropNewRelationshipAtPoint?: (relationshipType: string, x: number, y: number, targetNodeId: string | null) => void
}

export function DiagramCanvas(props: DiagramCanvasProps) {
  const {
    diagram,
    diagramExportName,
    elementById,
    relationshipById,
    readOnly = false,
    highlightNodeIds,
    highlightConnectionIds,
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
  } = props

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewBoxRef = useRef({ translateX: 0, translateY: 0 })
  const interactionRef = useRef<Interaction | null>(null)
  const suppressClickRef = useRef(false)
  const renderedConnectionsRef = useRef<RenderedConnection[]>([])
  const dragPreviewRef = useRef<DragPreview | null>(null)
  const paintRafRef = useRef<number | null>(null)
  const paintContextRef = useRef<Record<string, unknown>>({})
  const compareSync = useCompareCanvasSync()
  const compareSyncCleanupRef = useRef<(() => void) | undefined>(undefined)
  const [internalZoom, setInternalZoom] = useState(1)
  const zoom = compareSync?.zoom ?? internalZoom
  const [isDragging, setIsDragging] = useState(false)
  const [isElementDropTarget, setIsElementDropTarget] = useState(false)

  const handleScrollContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      compareSyncCleanupRef.current?.()
      compareSyncCleanupRef.current = compareSync?.registerScrollElement(element)
    },
    [compareSync],
  )

  useEffect(() => {
    return () => {
      compareSyncCleanupRef.current?.()
    }
  }, [])

  paintContextRef.current = {
    diagram,
    elementById,
    relationshipById,
    readOnly,
    highlightNodeIds,
    highlightConnectionIds,
    selectedNodeId,
    selectedRelationshipRef,
    selectedBendpointIndex,
    linkCreateMode,
    linkCreateSourceId,
  }

  const paintDiagram = useCallback(() => {
    const canvas = canvasRef.current
    const {
      diagram: diagramProp,
      elementById: elements,
      relationshipById: relationships,
      highlightNodeIds: hlNodes,
      highlightConnectionIds: hlConns,
      selectedNodeId: selNodeId,
      selectedRelationshipRef: selRelRef,
      selectedBendpointIndex: selBpIndex,
      readOnly: isReadOnly,
      linkCreateMode: linkMode,
      linkCreateSourceId: linkSourceId,
    } = paintContextRef.current as {
      diagram: ParsedDiagram | null
      elementById: Map<string, ParsedElement>
      relationshipById: Map<string, ParsedRelationship> | undefined
      highlightNodeIds: string[] | Set<string> | undefined
      highlightConnectionIds: string[] | Set<string> | undefined
      selectedNodeId: string | undefined
      selectedRelationshipRef: string | null | undefined
      selectedBendpointIndex: number | null | undefined
      readOnly: boolean
      linkCreateMode: boolean | undefined
      linkCreateSourceId: string | null | undefined
    }

    if (!canvas || !diagramProp) {
      return
    }

    const preview = dragPreviewRef.current
    let nodes = diagramProp.nodes
    let connections = diagramProp.connections

    if (preview?.type === 'move' || preview?.type === 'resize') {
      nodes = applyDragPreviewToNodes(
        nodes,
        preview.nodeId,
        preview.dx ?? 0,
        preview.dy ?? 0,
        preview.dw ?? 0,
        preview.dh ?? 0,
      )
    }

    if (preview?.type === 'resize' && (preview.dw || preview.dh)) {
      connections = connections.map((connection) => {
        if (
          connection.source !== preview.nodeId &&
          connection.target !== preview.nodeId
        ) {
          return connection
        }
        if (!connection.bendpoints?.length) {
          return connection
        }
        return {
          ...connection,
          bendpoints: adjustBendpointsForNodeResize(
            connection.bendpoints,
            connection,
            preview.nodeId,
            preview.dw,
            preview.dh,
          ),
        }
      })
    }

    if (preview?.type === 'bendpoint') {
      connections = connections.map((connection) => {
        if (connection.relationshipRef !== preview.relationshipRef) {
          return connection
        }
        const nextBendpoints = [...(connection.bendpoints ?? [])]
        if (!nextBendpoints[preview.bendpointIndex]) {
          return connection
        }
        nextBendpoints[preview.bendpointIndex] = preview.bendpoint
        return { ...connection, bendpoints: nextBendpoints }
      })
    }

    const diagramForPaint = { ...diagramProp, nodes, connections }

    const context = canvas.getContext('2d')!
    const allNodes = flattenNodes(diagramForPaint.nodes)
    const minX = Math.min(...allNodes.map((item) => item.x), 0)
    const minY = Math.min(...allNodes.map((item) => item.y), 0)
    const maxX = Math.max(...allNodes.map((item) => item.x + item.width), 800)
    const maxY = Math.max(...allNodes.map((item) => item.y + item.height), 600)
    const padding = 40
    const cssWidth = maxX - minX + padding
    const cssHeight = maxY - minY + padding
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(cssWidth * dpr))
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr))
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, cssWidth, cssHeight)

    const translateX = -minX + padding / 2
    const translateY = -minY + padding / 2
    viewBoxRef.current = { translateX, translateY }

    if (!isReadOnly) {
      drawPositioningGrid(context, { cssWidth, cssHeight, translateX, translateY })
    }

    const nodeById = new Map(allNodes.map((item) => [item.id, item]))
    const renderedConnections: RenderedConnection[] = []
    const connectionsToDraw: Array<{
      connection: typeof connections[number]
      points: Point[]
      sourceCenter: Point
      lineColor: string
      lineWidth: number
      startMarker: string
      endMarker: string
      layout: string | undefined
      label: string
      dash: number[]
      isSelectedRelationship: boolean
      isChangedConnection: boolean
    }> = []

    diagramForPaint.connections.forEach((connection) => {
      const source = nodeById.get(connection.source)
      const target = nodeById.get(connection.target)
      if (!source || !target) {
        return
      }

      const relationship = relationships?.get(connection.relationshipRef)
      const relationshipType = resolveRelationshipTypeForCanvas(relationship, connection)
      const style = getRelationshipStyle(relationshipType, {
        accessType: relationship?.accessType,
      })
      const isSelectedRelationship = Boolean(
        selRelRef && connection.relationshipRef === selRelRef,
      )
      const isChangedConnection = Boolean(
        hlConns &&
          (hlConns instanceof Set ? hlConns.has(connection.id) : (hlConns as string[]).includes(connection.id)),
      )

      const resolved = resolveConnectionPolyline(
        connection,
        source,
        target,
        translateX,
        translateY,
        diagramForPaint.nodes,
      )
      if (!resolved) {
        return
      }

      const { points, sourceCenter, targetCenter, layout } = resolved

      const lineColor = isSelectedRelationship
        ? '#ff7a00'
        : isChangedConnection
          ? '#e65100'
          : '#242424'

      const lineWidth = isSelectedRelationship
        ? 3
        : isChangedConnection
          ? 2.5
          : layout === 'nested'
            ? 1.25
            : Math.max(1.2, style.width ?? 1.6)

      let startMarker = style.startMarker
      let endMarker = style.endMarker
      if (layout === 'nested') {
        startMarker = 'none'
        endMarker = 'none'
      }

      renderedConnections.push({
        id: connection.id,
        relationshipRef: connection.relationshipRef,
        sourceCenter,
        targetCenter,
        points,
      })

      const label = getRelationshipExplicitName(relationship)

      connectionsToDraw.push({
        connection,
        points,
        sourceCenter,
        lineColor,
        lineWidth,
        startMarker,
        endMarker,
        layout,
        label,
        dash:
          isSelectedRelationship || isChangedConnection
            ? []
            : layout === 'nested'
              ? []
              : style.dash ?? [],
        isSelectedRelationship,
        isChangedConnection,
      })
    })
    renderedConnectionsRef.current = renderedConnections

    allNodes.forEach((node) => {
      const linkedElement = elements.get(node.elementRef)
      const title = getDiagramNodeDisplayTitle(node, linkedElement)
      const subtitle = normalizeElementType(linkedElement?.type || node.type)
      const style = getElementNotationStyle(subtitle)
      const visual = elementVisualKind(subtitle)
      const isNote = Boolean(visual.bare)

      const isSelected = selNodeId === node.id
      const isChanged = Boolean(
        hlNodes && (hlNodes instanceof Set ? hlNodes.has(node.id) : (hlNodes as string[]).includes(node.id)),
      )
      const isLinkSource = Boolean(linkMode && linkSourceId === node.id)
      const x = node.x + translateX
      const y = node.y + translateY

      context.strokeStyle = isSelected ? '#1f47bf' : isChanged ? '#e65100' : style.border
      context.lineWidth = isSelected ? 2 : isChanged ? 2.5 : 1.2

      if (visual.borderDash?.length) {
        context.setLineDash(visual.borderDash)
      }
      drawElementShape(context, x, y, node.width, node.height, visual.shape)
      if (isNote) {
        context.stroke()
      } else if (visual.shape === 'and-junction') {
        context.fillStyle = isSelected ? '#1f47bf' : '#000000'
        context.strokeStyle = isSelected ? '#1f47bf' : '#000000'
        context.fill()
        context.stroke()
      } else if (visual.shape === 'junction') {
        context.fillStyle = isSelected ? '#d6e4ff' : '#ffffff'
        context.strokeStyle = isSelected ? '#1f47bf' : '#000000'
        context.lineWidth = isSelected ? 2 : 1.5
        context.fill()
        context.stroke()
      } else {
        context.fillStyle = isSelected ? '#d6e4ff' : isChanged ? '#fff9c4' : style.fill
        context.fill()
        context.stroke()
      }
      if (visual.borderDash?.length) {
        context.setLineDash([])
      }

      if (!isNote && visual.shape === 'actor') {
        drawElementInnerGlyph(
          context,
          x,
          y,
          node.width,
          node.height,
          visual.shape,
          isSelected ? '#1f47bf' : style.border,
        )
      }

      if (isLinkSource) {
        context.save()
        context.strokeStyle = '#c45c00'
        context.lineWidth = 2.5
        context.setLineDash([6, 4])
        drawElementShape(context, x, y, node.width, node.height, visual.shape)
        context.stroke()
        context.restore()
      } else if (isChanged) {
        context.save()
        context.strokeStyle = '#e65100'
        context.lineWidth = 2.5
        drawElementShape(context, x, y, node.width, node.height, visual.shape)
        context.stroke()
        context.restore()
      }

      if (!isNote && visual.shape === 'object') {
        const fold = Math.min(14, node.width * 0.15)
        const headerH = Math.min(16, node.height * 0.25)
        context.fillStyle = isSelected ? '#bfd4ff' : isChanged ? '#fff59d' : style.header
        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x + node.width - fold, y)
        context.lineTo(x + node.width, y + fold)
        context.lineTo(x + node.width, y + headerH)
        context.lineTo(x, y + headerH)
        context.closePath()
        context.fill()
        context.strokeStyle = isSelected ? '#1f47bf' : isChanged ? '#e65100' : style.border
        context.beginPath()
        context.moveTo(x, y + headerH)
        context.lineTo(x + node.width, y + headerH)
        context.stroke()
      }

      context.fillStyle = style.text
      context.font = 'bold 12px system-ui, sans-serif'
      const lineHeight = 14
      const maxLines = Math.max(1, Math.floor((node.height - 14) / lineHeight))
      drawWrappedText(
        context,
        title,
        x + 8,
        y + 18,
        Math.max(20, node.width - 30),
        Math.min(maxLines, 4),
        lineHeight,
      )

      const hideCornerIcon =
        isNote || visual.icon === 'none' || visual.shape === 'junction' || visual.shape === 'and-junction' || visual.shape === 'interface'
      if (!hideCornerIcon) {
        const ix = x + node.width - 20
        const iy = y + 6
        drawElementIcon(context, ix, iy, visual.icon, style.border, style.fill)
      }

      if (isSelected) {
        const handle = getResizeHandleRect(node, translateX, translateY)
        context.save()
        context.fillStyle = '#ffffff'
        context.strokeStyle = '#1f47bf'
        context.lineWidth = 1.8
        context.beginPath()
        context.rect(handle.left, handle.top, handle.size, handle.size)
        context.fill()
        context.stroke()
        context.restore()
      }
    })

    connectionsToDraw.forEach(
      ({
        points,
        lineColor,
        lineWidth,
        startMarker,
        endMarker,
        dash,
      }) => {
        context.save()
        context.strokeStyle = lineColor
        context.fillStyle = lineColor
        context.lineWidth = lineWidth
        context.lineJoin = 'miter'
        context.lineCap = 'butt'
        context.setLineDash(dash)

        context.beginPath()
        context.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i += 1) {
          context.lineTo(points[i].x, points[i].y)
        }
        context.stroke()

        const markerSize = 10
        if (points.length >= 2) {
          const p0 = points[0]
          const p1 = points[1]
          const pPrev = points.at(-2)!
          const pEnd = points.at(-1)!

          const startAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x)
          const endAngle = Math.atan2(pEnd.y - pPrev.y, pEnd.x - pPrev.x)

          drawStartMarker(context, p0.x, p0.y, startAngle, startMarker, markerSize)
          drawEndMarker(context, pEnd.x, pEnd.y, endAngle, endMarker, markerSize)
        }

        context.restore()
      },
    )

    connectionsToDraw.forEach(({ points, label, lineColor, isSelectedRelationship, isChangedConnection }) => {
      if (!label) {
        return
      }
      const anchor = polylineMidpoint(points)
      if (!anchor) {
        return
      }
      drawRelationshipLabel(context, label, anchor, {
        color: lineColor,
        border: isSelectedRelationship
          ? 'rgba(255, 122, 0, 0.45)'
          : isChangedConnection
            ? 'rgba(230, 81, 0, 0.4)'
            : undefined,
      })
    })

    connectionsToDraw.forEach(({ connection, sourceCenter, isSelectedRelationship }) => {
      if (!isSelectedRelationship || !connection.bendpoints?.length) {
        return
      }
      connection.bendpoints.forEach((bp, bendpointIndex) => {
        const handleX = sourceCenter.x + (bp.startX ?? 0)
        const handleY = sourceCenter.y + (bp.startY ?? 0)
        const isActiveBendpoint = selBpIndex === bendpointIndex
        context.save()
        context.fillStyle = isActiveBendpoint ? '#ff7a00' : '#ffffff'
        context.strokeStyle = '#ff7a00'
        context.lineWidth = isActiveBendpoint ? 2.5 : 2
        context.beginPath()
        context.arc(handleX, handleY, isActiveBendpoint ? 6 : 5, 0, Math.PI * 2)
        context.fill()
        context.stroke()
        context.restore()
      })
    })
  }, [])

  const scheduleRepaint = useCallback(() => {
    if (paintRafRef.current !== null) {
      return
    }
    paintRafRef.current = requestAnimationFrame(() => {
      paintRafRef.current = null
      paintDiagram()
    })
  }, [paintDiagram])

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
      onNodeResize?.(preview.nodeId, preview.dw, preview.dh)
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

  function findBendpointHitIndex(relationshipRef: string, x: number, y: number): number | null {
    if (!relationshipRef || !diagram) {
      return null
    }
    const selectedConnection = renderedConnectionsRef.current.find(
      (c) => c.relationshipRef === relationshipRef,
    )
    if (!selectedConnection) {
      return null
    }
    const conn = diagram.connections.find((c) => c.relationshipRef === relationshipRef)
    if (!conn?.bendpoints?.length) {
      return null
    }
    for (let i = 0; i < conn.bendpoints.length; i += 1) {
      const bp = conn.bendpoints[i]
      const hx = selectedConnection.sourceCenter.x + (bp.startX ?? 0)
      const hy = selectedConnection.sourceCenter.y + (bp.startY ?? 0)
      if (Math.hypot(x - hx, y - hy) <= 8) {
        return i
      }
    }
    return null
  }

  function getCanvasPointer(event: { clientX: number; clientY: number }): CanvasPointer | null {
    const canvas = canvasRef.current
    if (!canvas) {
      return null
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }
    const scaleX = canvas.offsetWidth / rect.width
    const scaleY = canvas.offsetHeight / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    const { translateX, translateY } = viewBoxRef.current
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

  function releaseInteraction(pointerId: number) {
    const canvas = canvasRef.current
    const inter = interactionRef.current
    if (!inter || inter.pointerId !== pointerId) {
      return
    }
    interactionRef.current = null
    setIsDragging(false)
    commitDragPreview()
    if (canvas) {
      try {
        canvas.releasePointerCapture(pointerId)
      } catch {
        /* pointer already released */
      }
    }
  }

  function beginInteraction(canvas: HTMLCanvasElement, interaction: Interaction) {
    interactionRef.current = interaction
    setIsDragging(interaction.type === 'move' || interaction.type === 'resize')
    try {
      canvas.setPointerCapture(interaction.pointerId)
    } catch {
      /* ignore */
    }
  }

  function applyPointerDelta(ptr: CanvasPointer) {
    const inter = interactionRef.current
    if (!inter) {
      return
    }

    if (inter.type === 'move') {
      const pointerDx = ptr.logicalX - inter.startLogicalX
      const pointerDy = ptr.logicalY - inter.startLogicalY
      const { dx: newDx, dy: newDy } = computeSnappedNodeOffset(
        inter.startNodeX,
        inter.startNodeY,
        pointerDx,
        pointerDy,
      )
      const prev = dragPreviewRef.current
      if (prev?.type === 'move' && prev.dx === newDx && prev.dy === newDy) {
        return
      }
      suppressClickRef.current = true
      interactionRef.current = {
        ...inter,
        lastLogicalX: ptr.logicalX,
        lastLogicalY: ptr.logicalY,
      }
      dragPreviewRef.current = {
        type: 'move',
        nodeId: inter.nodeId,
        dx: newDx,
        dy: newDy,
        dw: 0,
        dh: 0,
      }
      scheduleRepaint()
      return
    }

    if (inter.type === 'resize') {
      const totalDx = ptr.logicalX - inter.startLogicalX
      const totalDy = ptr.logicalY - inter.startLogicalY
      const nextWidth = Math.max(30, inter.baseWidth + totalDx)
      const nextHeight = Math.max(24, inter.baseHeight + totalDy)
      const currentDiagram = paintContextRef.current.diagram as ParsedDiagram | null
      const baseNode = findNodeById(currentDiagram?.nodes ?? [], inter.nodeId)
      if (!baseNode) {
        return
      }
      const dw = nextWidth - baseNode.width
      const dh = nextHeight - baseNode.height
      if (dw === 0 && dh === 0) {
        return
      }
      suppressClickRef.current = true
      dragPreviewRef.current = {
        type: 'resize',
        nodeId: inter.nodeId,
        dx: 0,
        dy: 0,
        dw,
        dh,
      }
      scheduleRepaint()
      return
    }

    if (inter.type === 'bendpoint') {
      suppressClickRef.current = true
      const { sourceCenter, targetCenter, bendpointIndex, relationshipRef } = inter
      dragPreviewRef.current = {
        type: 'bendpoint',
        relationshipRef,
        bendpointIndex,
        bendpoint: {
          startX: ptr.logicalX - sourceCenter.x,
          startY: ptr.logicalY - sourceCenter.y,
          endX: ptr.logicalX - targetCenter.x,
          endY: ptr.logicalY - targetCenter.y,
        },
      }
      scheduleRepaint()
    }
  }

  function pickRelationshipAtScreenPoint(x: number, y: number): string | null {
    const clickPoint = { x, y }
    const connections = renderedConnectionsRef.current
    for (let ci = connections.length - 1; ci >= 0; ci -= 1) {
      const c = connections[ci]
      for (let i = 0; i < c.points.length - 1; i += 1) {
        const d = distancePointToSegment(clickPoint, c.points[i], c.points[i + 1])
        if (d <= 7) {
          return c.relationshipRef
        }
      }
    }
    return null
  }

  function handleDragOver(event: React.DragEvent) {
    const canDropExisting = Boolean(onDropElementAtPoint)
    const canDropNewElement = Boolean(onDropNewElementAtPoint)
    const canDropNewRelationship = Boolean(onDropNewRelationshipAtPoint)
    if (
      readOnly ||
      (!canDropExisting && !canDropNewElement && !canDropNewRelationship) ||
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
    if (!elementId && !newElementType && !newRelationshipType) {
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
    event.preventDefault()
    suppressClickRef.current = true
    const ptr = getCanvasPointer(event)
    if (!ptr) {
      return
    }
    const { x: dropX, y: dropY } = snapPointToGrid(ptr.logicalX, ptr.logicalY)
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
    const ptr = getCanvasPointer(event)
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

    const hitRelationshipRef = pickRelationshipAtScreenPoint(x, y)
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
      return
    }
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (readOnly || !diagram || event.button !== 0) {
      return
    }
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ptr = getCanvasPointer(event)
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
        const conn = diagram.connections.find(
          (c) => c.relationshipRef === selectedRelationshipRef,
        )
        if (conn?.bendpoints?.length) {
          for (let i = 0; i < conn.bendpoints.length; i += 1) {
            const bp = conn.bendpoints[i]
            const hx = selectedConnection.sourceCenter.x + (bp.startX ?? 0)
            const hy = selectedConnection.sourceCenter.y + (bp.startY ?? 0)
            if (Math.hypot(x - hx, y - hy) <= 8) {
              onBendpointSelect?.(i)
              beginInteraction(canvas, {
                type: 'bendpoint',
                pointerId: event.pointerId,
                relationshipRef: selectedRelationshipRef,
                bendpointIndex: i,
                sourceCenter: selectedConnection.sourceCenter,
                targetCenter: selectedConnection.targetCenter,
                lastLogicalX: logicalX,
                lastLogicalY: logicalY,
              })
              event.preventDefault()
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
    if (readOnly || !interactionRef.current || interactionRef.current.pointerId !== event.pointerId) {
      return
    }
    const ptr = getCanvasPointer(event)
    if (!ptr) {
      return
    }
    applyPointerDelta(ptr)
  }

  function handlePointerUp(event: React.PointerEvent) {
    releaseInteraction(event.pointerId)
  }

  function handlePointerCancel(event: React.PointerEvent) {
    releaseInteraction(event.pointerId)
  }

  function handleCanvasDoubleClick(event: React.MouseEvent) {
    if (readOnly || !selectedRelationshipRef) {
      return
    }
    const connection = renderedConnectionsRef.current.find(
      (c) => c.relationshipRef === selectedRelationshipRef,
    )
    if (!connection) {
      return
    }
    const ptr = getCanvasPointer(event)
    if (!ptr) {
      return
    }
    const { x, y } = ptr
    const clickPoint = { x, y }

    const bendpointHit = findBendpointHitIndex(selectedRelationshipRef, x, y)
    if (bendpointHit !== null) {
      onRelationshipBendpointRemove?.(selectedRelationshipRef, bendpointHit)
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
    onRelationshipBendpointAdd?.(selectedRelationshipRef, best.index, {
      startX: x - connection.sourceCenter.x,
      startY: y - connection.sourceCenter.y,
      endX: x - connection.targetCenter.x,
      endY: y - connection.targetCenter.y,
    })
  }

  function setZoomClamped(nextZoom: number) {
    const clamped = Math.max(0.3, Math.min(3, nextZoom))
    if (compareSync) {
      compareSync.setZoom(clamped)
    } else {
      setInternalZoom(clamped)
    }
  }

  function handleWheel(event: React.WheelEvent) {
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    setZoomClamped(zoom * factor)
  }

  function exportDiagramPng() {
    const canvas = canvasRef.current
    if (!canvas || !diagram) {
      return
    }
    let dataUrl: string
    try {
      dataUrl = canvas.toDataURL('image/png')
    } catch {
      return
    }
    const base = slugForDiagramExport(diagramExportName ?? diagram.name)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${base}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  if (!diagram) {
    return (
      <div className="placeholder">
        <Empty description="Выберите диаграмму в дереве объектов слева." />
      </div>
    )
  }

  return (
    <div
      className={
        isElementDropTarget ? 'canvas-wrap is-element-drop-target' : 'canvas-wrap'
      }
    >
      <div className="canvas-toolbar">
        <Space size={6}>
          <Button
            size="small"
            icon={<ZoomInOutlined />}
            title="Увеличить"
            onClick={() => setZoomClamped(zoom * 1.1)}
          />
          <Button
            size="small"
            icon={<ZoomOutOutlined />}
            title="Уменьшить"
            onClick={() => setZoomClamped(zoom * 0.9)}
          />
          <Button size="small" onClick={() => setZoomClamped(1)}>
            100%
          </Button>
          <span className="canvas-zoom-label">
            <span className="canvas-zoom-label-text">Зум</span>
            <InputNumber
              className="canvas-zoom-input"
              size="small"
              min={30}
              max={300}
              step={10}
              value={Math.round(zoom * 100)}
              onChange={(value) => {
                if (typeof value === 'number' && Number.isFinite(value)) {
                  setZoomClamped(value / 100)
                }
              }}
              aria-label="Масштаб диаграммы в процентах"
            />
            <span className="canvas-zoom-suffix">%</span>
          </span>
        </Space>
        <Button
          size="small"
          type="primary"
          ghost
          className="canvas-export-btn"
          icon={<DownloadOutlined />}
          title="Сохранить диаграмму как PNG (полное разрешение canvas)"
          onClick={exportDiagramPng}
        >
          PNG
        </Button>
      </div>
      <div className="canvas-scroll" ref={handleScrollContainerRef} onWheel={handleWheel}>
        <canvas
          ref={canvasRef}
          className={isDragging ? 'diagram-canvas is-dragging' : 'diagram-canvas'}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          onClick={handleCanvasClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onDoubleClick={handleCanvasDoubleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      </div>
    </div>
  )
}
