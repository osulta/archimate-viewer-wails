import type {
  ParsedDiagram,
  ParsedElement,
  ParsedRelationship,
  DiagramNode,
  Bendpoint,
  Point,
} from '../../types/model'

export interface NodeDrawColors {
  fill: string
  header: string
  border: string
  text: string
}

export interface DragPreviewMove {
  type: 'move'
  nodeId: string
  dx: number
  dy: number
  dw: number
  dh: number
}

export interface DragPreviewResize {
  type: 'resize'
  nodeId: string
  dx: number
  dy: number
  dw: number
  dh: number
}

export interface DragPreviewBendpoint {
  type: 'bendpoint'
  relationshipRef: string
  bendpointIndex: number
  bendpoint: Bendpoint
}

export type ConnectionEndpointKind = 'source' | 'target'

export interface DragPreviewConnectionEndpoint {
  type: 'connectionEndpoint'
  relationshipRef: string
  endpoint: ConnectionEndpointKind
  anchorPoint: Point
  hoverNodeId: string | null
  pointerCanvasX: number
  pointerCanvasY: number
}

export type DragPreview =
  | DragPreviewMove
  | DragPreviewResize
  | DragPreviewBendpoint
  | DragPreviewConnectionEndpoint

export interface MoveInteraction {
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

export interface ResizeInteraction {
  type: 'resize'
  pointerId: number
  nodeId: string
  startLogicalX: number
  startLogicalY: number
  startNodeX: number
  startNodeY: number
  baseWidth: number
  baseHeight: number
}

export interface BendpointInteraction {
  type: 'bendpoint'
  pointerId: number
  relationshipRef: string
  bendpointIndex: number
  sourceCenter: Point
  targetCenter: Point
  lastLogicalX: number
  lastLogicalY: number
}

export interface ConnectionEndpointInteraction {
  type: 'connectionEndpoint'
  pointerId: number
  relationshipRef: string
  endpoint: ConnectionEndpointKind
  fixedNodeId: string
  anchorPoint: Point
  lastLogicalX: number
  lastLogicalY: number
}

export interface PanInteraction {
  type: 'pan'
  pointerId: number
  startClientX: number
  startClientY: number
  startScrollLeft: number
  startScrollTop: number
}

export type Interaction =
  | MoveInteraction
  | ResizeInteraction
  | BendpointInteraction
  | ConnectionEndpointInteraction
  | PanInteraction

export interface RenderedConnection {
  id: string
  relationshipRef: string
  sourceCenter: Point
  targetCenter: Point
  points: Point[]
}

export interface CanvasPointer {
  x: number
  y: number
  logicalX: number
  logicalY: number
  scaleX: number
  scaleY: number
  translateX: number
  translateY: number
}

export interface DiagramPaintContext {
  diagram: ParsedDiagram | null
  elementById: Map<string, ParsedElement>
  relationshipById?: Map<string, ParsedRelationship>
  readOnly?: boolean
  highlightNodeIds?: string[] | Set<string>
  highlightConnectionIds?: string[] | Set<string>
  flowConnectionIds?: string[] | Set<string>
  connectionFlowPhase?: number
  selectedNodeId?: string
  selectedRelationshipRef?: string | null
  selectedBendpointIndex?: number | null
  linkCreateMode?: boolean
  linkCreateSourceId?: string | null
  dragPreview?: DragPreview | null
  diagramById?: Map<string, ParsedDiagram>
}

export interface DiagramCanvasProps {
  diagram: ParsedDiagram | null
  diagramExportName?: string
  elementById: Map<string, ParsedElement>
  relationshipById?: Map<string, ParsedRelationship>
  readOnly?: boolean
  highlightNodeIds?: string[] | Set<string>
  highlightConnectionIds?: string[] | Set<string>
  flowConnectionIds?: string[] | Set<string>
  animateConnectionFlow?: boolean
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
  onRelationshipEndpointChange?: (
    relationshipRef: string,
    endpoint: ConnectionEndpointKind,
    nodeId: string,
  ) => void
  onLinkNodePick?: (node: DiagramNode) => void
  onDropElementAtPoint?: (elementId: string, x: number, y: number) => void
  onDropNewElementAtPoint?: (elementType: string, x: number, y: number) => void
  onDropNewRelationshipAtPoint?: (relationshipType: string, x: number, y: number, targetNodeId: string | null) => void
  onDropDiagramReferenceAtPoint?: (diagramId: string, x: number, y: number) => void
  onOpenDiagramReference?: (diagramId: string) => void
  onOptimizeConnections?: () => void
  diagrams?: ParsedDiagram[]
}

export interface PaintDiagramResult {
  translateX: number
  translateY: number
  renderedConnections: RenderedConnection[]
}
