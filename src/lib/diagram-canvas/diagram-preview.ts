import { applyDragPreviewToNodes, applyDragPreviewToNodeIds } from '../archimate/diagram-model'
import { adjustBendpointsForNodeResize } from '../archimate/connection-geometry'
import type { ParsedDiagram } from '../../types/model'
import type { DragPreview } from './types'

export function applyDragPreviewToDiagram(
  diagram: ParsedDiagram,
  preview: DragPreview | null,
): ParsedDiagram {
  if (!preview) {
    return diagram
  }

  let nodes = diagram.nodes
  let connections = diagram.connections

  if (preview.type === 'move' || preview.type === 'resize') {
    if (preview.type === 'move' && preview.nodeIds?.length) {
      nodes = applyDragPreviewToNodeIds(nodes, new Set(preview.nodeIds), preview.dx ?? 0, preview.dy ?? 0)
    } else {
      nodes = applyDragPreviewToNodes(
        nodes,
        preview.nodeId,
        preview.dx ?? 0,
        preview.dy ?? 0,
        preview.dw ?? 0,
        preview.dh ?? 0,
      )
    }
  }

  if (preview.type === 'resize' && (preview.dw || preview.dh)) {
    connections = connections.map((connection) => {
      if (connection.source !== preview.nodeId && connection.target !== preview.nodeId) {
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

  if (preview.type === 'bendpoint') {
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

  return { ...diagram, nodes, connections }
}
