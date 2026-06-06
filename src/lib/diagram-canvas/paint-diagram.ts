import {
  flattenNodes,
  getDiagramNodeDisplayTitle,
  isDiagramReferenceNode,
  resolveReferencedDiagramName,
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
import { CONNECTION_FLOW_COLOR } from './constants'
import { applyDragPreviewToDiagram } from './diagram-preview'
import { resolveNodeDrawColors } from './node-colors'
import { getResizeHandleRect } from './resize-handle'
import type { DiagramPaintContext, PaintDiagramResult, RenderedConnection } from './types'

function highlightIdSetHas(ids: string[] | Set<string> | undefined, id: string): boolean {
  if (!ids) {
    return false
  }
  return ids instanceof Set ? ids.has(id) : ids.includes(id)
}

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
    flowConnectionIds: flowConns,
    connectionFlowPhase,
    selectedNodeId: selNodeId,
    selectedRelationshipRef: selRelRef,
    selectedBendpointIndex: selBpIndex,
    readOnly: isReadOnly = false,
    linkCreateMode: linkMode,
    linkCreateSourceId: linkSourceId,
    dragPreview,
    diagramById,
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
    isFlowConnection: boolean
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
      hlConns && highlightIdSetHas(hlConns, connection.id),
    )
    const isFlowConnection =
      !isSelectedRelationship &&
      !isChangedConnection &&
      highlightIdSetHas(flowConns, connection.id)

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
        : isFlowConnection
          ? CONNECTION_FLOW_COLOR
          : '#242424'

    const lineWidth = isSelectedRelationship
      ? 3
      : isChangedConnection
        ? 2.5
        : isFlowConnection
          ? 2.4
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
          : isFlowConnection
            ? [10, 7]
            : layout === 'nested'
              ? []
              : style.dash ?? [],
      isSelectedRelationship,
      isChangedConnection,
      isFlowConnection,
    })
  })

  allNodes.forEach((node) => {
    const isReference = isDiagramReferenceNode(node)
    const linkedElement = isReference ? undefined : elements.get(node.elementRef)
    const referencedDiagramName = isReference
      ? resolveReferencedDiagramName(node, diagramById)
      : undefined
    const title = getDiagramNodeDisplayTitle(node, linkedElement, referencedDiagramName)
    const subtitle = isReference
      ? 'Diagram reference'
      : normalizeElementType(linkedElement?.type || node.type)
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

    if (isReference) {
      context.save()
      context.fillStyle = isSelected ? '#eef3ff' : '#f8f9fb'
      context.strokeStyle = isSelected ? '#1f47bf' : '#7986cb'
      context.lineWidth = isSelected ? 2 : 1.2
      context.setLineDash([5, 3])
      context.beginPath()
      context.rect(x, y, node.width, node.height)
      context.fill()
      context.stroke()
      context.setLineDash([])

      context.fillStyle = isSelected ? '#1f47bf' : '#3949ab'
      context.font = '12px system-ui, sans-serif'
      const textX = x + 8
      const textY = y + Math.min(node.height - 6, 18)
      const maxTextWidth = Math.max(20, node.width - 28)
      drawWrappedText(context, title, textX, textY, maxTextWidth, 1, 14)

      const textWidth = Math.min(context.measureText(title).width, maxTextWidth)
      context.beginPath()
      context.moveTo(textX, textY + 2)
      context.lineTo(textX + textWidth, textY + 2)
      context.strokeStyle = context.fillStyle as string
      context.lineWidth = 1
      context.stroke()

      context.strokeStyle = isSelected ? '#1f47bf' : '#7986cb'
      context.lineWidth = 1.5
      context.beginPath()
      context.moveTo(x + node.width - 16, y + 6)
      context.lineTo(x + node.width - 6, y + 6)
      context.lineTo(x + node.width - 6, y + 16)
      context.stroke()

      if (isSelected) {
        const handle = getResizeHandleRect(node, translateX, translateY)
        context.fillStyle = '#ffffff'
        context.strokeStyle = '#1f47bf'
        context.lineWidth = 1.8
        context.beginPath()
        context.rect(handle.left, handle.top, handle.size, handle.size)
        context.fill()
        context.stroke()
      }

      context.restore()
      return
    }

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

  connectionsToDraw.forEach(
    ({ points, lineColor, lineWidth, startMarker, endMarker, dash, isFlowConnection }) => {
      context.save()
      context.strokeStyle = lineColor
      context.fillStyle = lineColor
      context.lineWidth = lineWidth
      context.lineJoin = 'miter'
      context.lineCap = isFlowConnection ? 'round' : 'butt'
      context.setLineDash(dash)
      if (isFlowConnection && connectionFlowPhase != null) {
        const dashPeriod = 17
        context.lineDashOffset = -connectionFlowPhase * dashPeriod
      }

      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i += 1) {
        context.lineTo(points[i].x, points[i].y)
      }
      context.stroke()

      const markerSize = isFlowConnection ? 11 : 10
      if (points.length >= 2) {
        const p0 = points[0]
        const p1 = points[1]
        const pPrev = points.at(-2)!
        const pEnd = points.at(-1)!

        const startAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x)
        const endAngle = Math.atan2(pEnd.y - pPrev.y, pEnd.x - pPrev.x)

        drawStartMarker(context, p0.x, p0.y, startAngle, startMarker, markerSize)
        drawEndMarker(context, pEnd.x, pEnd.y, endAngle, endMarker, markerSize)

        if (isFlowConnection && endMarker !== 'none' && connectionFlowPhase != null) {
          const pulse = 0.65 + 0.35 * Math.sin(connectionFlowPhase * Math.PI * 2)
          const flowArrowSize = markerSize * (0.72 + 0.28 * pulse)
          const inset = flowArrowSize * 0.85
          const tipX = pEnd.x - Math.cos(endAngle) * inset
          const tipY = pEnd.y - Math.sin(endAngle) * inset
          context.save()
          context.globalAlpha = 0.35 + 0.45 * pulse
          drawEndMarker(context, tipX, tipY, endAngle, endMarker, flowArrowSize)
          context.restore()
        }
      }

      context.restore()
    },
  )

  connectionsToDraw.forEach(
    ({ points, label, lineColor, isSelectedRelationship, isChangedConnection, isFlowConnection }) => {
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
          : isFlowConnection
            ? 'rgba(24, 144, 255, 0.35)'
            : undefined,
    })
  },
  )

  connectionsToDraw.forEach(({ connection, points, isSelectedRelationship }) => {
    if (!isSelectedRelationship || isReadOnly) {
      return
    }
    const start = points[0]
    const end = points[points.length - 1]
    ;[
      { point: start, fill: '#1f47bf', label: 'source' as const },
      { point: end, fill: '#ff7a00', label: 'target' as const },
    ].forEach(({ point, fill }) => {
      context.save()
      context.fillStyle = fill
      context.strokeStyle = '#ffffff'
      context.lineWidth = 2
      context.beginPath()
      context.rect(point.x - 5, point.y - 5, 10, 10)
      context.fill()
      context.stroke()
      context.restore()
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

  if (dragPreview?.type === 'connectionEndpoint') {
    const hoverNode = dragPreview.hoverNodeId
      ? allNodes.find((node) => node.id === dragPreview.hoverNodeId)
      : null
    if (hoverNode) {
      const hx = hoverNode.x + translateX
      const hy = hoverNode.y + translateY
      context.save()
      context.strokeStyle = '#ff7a00'
      context.lineWidth = 2
      context.setLineDash([4, 3])
      context.strokeRect(hx - 2, hy - 2, hoverNode.width + 4, hoverNode.height + 4)
      context.restore()
    }
    const endX = hoverNode
      ? hoverNode.x + translateX + hoverNode.width / 2
      : dragPreview.pointerCanvasX
    const endY = hoverNode
      ? hoverNode.y + translateY + hoverNode.height / 2
      : dragPreview.pointerCanvasY
    context.save()
    context.strokeStyle = dragPreview.endpoint === 'source' ? '#1f47bf' : '#ff7a00'
    context.lineWidth = 2
    context.setLineDash([6, 4])
    context.beginPath()
    context.moveTo(dragPreview.anchorPoint.x, dragPreview.anchorPoint.y)
    context.lineTo(endX, endY)
    context.stroke()
    context.restore()
  }

  return { translateX, translateY, renderedConnections }
}
