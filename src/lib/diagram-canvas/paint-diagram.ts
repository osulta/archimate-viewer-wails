import {
  flattenNodes,
  getDiagramNodeDisplayTitle,
} from '../archimate/diagram-model'
import {
  getRelationshipExplicitName,
  resolveRelationshipTypeForCanvas,
} from '../archimate/relationship-meta'
import {
  resolveConnectionPolyline,
  polylineMidpoint,
} from '../archimate/connection-geometry'
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
  normalizeElementType,
} from '../archimate/canvas-draw'
import type { Point } from '../../types/model'
import { applyDragPreviewToDiagram } from './diagram-preview'
import { resolveNodeDrawColors } from './node-colors'
import { getResizeHandleRect } from './resize-handle'
import type { DiagramPaintContext, PaintDiagramResult, RenderedConnection } from './types'

export function paintDiagramCanvas(
  canvas: HTMLCanvasElement,
  ctx: DiagramPaintContext,
): PaintDiagramResult | null {
  const {
    diagram: diagramProp,
    elementById: elements,
    relationshipById: relationships,
    highlightNodeIds: hlNodes,
    highlightConnectionIds: hlConns,
    selectedNodeId: selNodeId,
    selectedRelationshipRef: selRelRef,
    selectedBendpointIndex: selBpIndex,
    readOnly: isReadOnly = false,
    linkCreateMode: linkMode,
    linkCreateSourceId: linkSourceId,
    dragPreview,
  } = ctx

  if (!diagramProp) {
    return null
  }

  const diagramForPaint = applyDragPreviewToDiagram(diagramProp, dragPreview ?? null)

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

  if (!isReadOnly) {
    drawPositioningGrid(context, { cssWidth, cssHeight, translateX, translateY })
  }

  const nodeById = new Map(allNodes.map((item) => [item.id, item]))
  const renderedConnections: RenderedConnection[] = []
  const connections = diagramForPaint.connections
  const connectionsToDraw: Array<{
    connection: (typeof connections)[number]
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
    const isSelectedRelationship = Boolean(selRelRef && connection.relationshipRef === selRelRef)
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
    const colors = resolveNodeDrawColors(node, style, { isSelected, isChanged })
    const isLinkSource = Boolean(linkMode && linkSourceId === node.id)
    const x = node.x + translateX
    const y = node.y + translateY

    context.strokeStyle = colors.border
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
      context.fillStyle = colors.fill
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
        isSelected ? '#1f47bf' : colors.border,
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
      context.fillStyle = colors.header
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + node.width - fold, y)
      context.lineTo(x + node.width, y + fold)
      context.lineTo(x + node.width, y + headerH)
      context.lineTo(x, y + headerH)
      context.closePath()
      context.fill()
      context.strokeStyle = colors.border
      context.beginPath()
      context.moveTo(x, y + headerH)
      context.lineTo(x + node.width, y + headerH)
      context.stroke()
    }

    context.fillStyle = colors.text
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
      isNote ||
      visual.icon === 'none' ||
      visual.shape === 'junction' ||
      visual.shape === 'and-junction' ||
      visual.shape === 'interface'
    if (!hideCornerIcon) {
      const ix = x + node.width - 20
      const iy = y + 6
      drawElementIcon(context, ix, iy, visual.icon, colors.border, colors.fill)
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

  connectionsToDraw.forEach(({ points, lineColor, lineWidth, startMarker, endMarker, dash }) => {
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
  })

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

  return { translateX, translateY, renderedConnections }
}
