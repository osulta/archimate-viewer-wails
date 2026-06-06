export type ModelFormat = 'archi-tool' | 'exchange' | 'split-files'

export interface ParsedElement {
  id: string
  name: string
  type: string
  documentation?: string
  properties?: ElementProperty[]
  folderPath?: string
  sourceFile?: string
  lite?: boolean
}

export interface ElementProperty {
  key: string
  value: string
}

export interface ParsedRelationship {
  id: string
  name: string
  type: string
  source: string
  target: string
  accessType?: string
  documentation?: string
  properties?: ElementProperty[]
  folderPath?: string
  sourceFile?: string
}

export interface DiagramNode {
  id: string
  elementRef: string
  type: string
  label: string
  /** Target diagram id for DiagramModelReference objects. */
  referencedDiagramId?: string
  x: number
  y: number
  width: number
  height: number
  children: DiagramNode[]
  /** Diagram visual fill from Archi (fillColor attribute or exchange style). */
  fillColor?: string
  /** Diagram visual border from Archi (lineColor attribute or exchange style). */
  lineColor?: string
  /** Diagram label color from Archi (fontColor attribute). */
  fontColor?: string
}

export interface Bendpoint {
  startX: number
  startY: number
  endX: number
  endY: number
}

export interface DiagramConnection {
  id: string
  relationshipRef: string
  relationshipType?: string
  source: string
  target: string
  bendpoints: Bendpoint[]
}

export interface ParsedDiagram {
  id: string
  name: string
  type: string
  folderPath?: string
  sourceFile?: string
  loaded?: boolean
  nodes: DiagramNode[]
  connections: DiagramConnection[]
}

export interface ParsedModel {
  modelName: string
  format: ModelFormat
  elements: ParsedElement[]
  relationships: ParsedRelationship[]
  diagrams: ParsedDiagram[]
  elementById: Map<string, ParsedElement>
  relationshipById: Map<string, ParsedRelationship>
  modelRoot?: string
  manifestPath?: string
  diagramIndexByElementRef?: Map<string, string[]>
  diagramIndexByRelationshipRef?: Map<string, string[]>
}

export interface NodeOverride {
  dx: number
  dy: number
  dw: number
  dh: number
  /** Diagram fill override; null clears custom fill (layer default). */
  fillColor?: string | null
}

export interface ElementOverride {
  name?: string
  documentation?: string
  properties?: ElementProperty[]
}

export interface RelationshipMetaOverride {
  name?: string
  documentation?: string
  properties?: ElementProperty[]
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type DiagramOverridesMap = Map<string, Map<string, NodeOverride>>
export type RelationshipOverridesMap = Map<string, Map<string, Bendpoint[]>>

export interface ModelLoadPayload {
  layout: 'single-file' | 'split-files'
  content?: string
  parsedModel?: Omit<ParsedModel, 'elementById' | 'relationshipById'>
  filename: string
  repoPath?: string
}

export interface CreatedObject {
  diagramId: string
  element: ParsedElement
  node: DiagramNode
  format: ModelFormat
  existingElement?: boolean
}

export interface CreatedRelationship {
  diagramId: string
  relationship: ParsedRelationship
  connection: DiagramConnection
  format: ModelFormat
}

export type LayerName =
  | 'business'
  | 'application'
  | 'technology'
  | 'physical'
  | 'motivation'
  | 'strategy'
  | 'implementation'
  | 'composite'
  | 'generic'

export interface LayerStyle {
  fill: string
  border: string
  header: string
  text: string
}

export interface ElementVisualSpec {
  layer: LayerName
  shape: string
  icon: string
  borderDash?: number[]
  bare?: boolean
  /** Per-type palette override (e.g. Grouping: white fill, black dashed border). */
  style?: Partial<LayerStyle>
}

export interface RelationshipNotation {
  dash: number[] | null
  startMarker: string
  endMarker: string
  width: number
}

export interface ConnectionPolylineResult {
  points: Point[]
  sourceCenter: Point
  targetCenter: Point
  layout?: string
}
