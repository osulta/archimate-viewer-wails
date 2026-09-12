import type {
  DiagramNode,
  ParsedDiagram,
  ParsedModel,
  ParsedElement,
  ParsedRelationship,
  NodeOverride,
  Bendpoint,
  DiagramConnection,
  DiagramOverridesMap,
  RelationshipOverridesMap,
} from '../../types/model'
import {
  getId,
  getElementNoteContent,
} from './xml-utils'

export function flattenNodes(nodes: DiagramNode[]): DiagramNode[] {
  const output: DiagramNode[] = []

  function walk(node: DiagramNode): void {
    output.push(node)
    node.children.forEach(walk)
  }

  nodes.forEach(walk)
  return output
}

/**
 * Text shown on the diagram canvas for a view object.
 * Prefers diagram label/content over model element name (which may be the id).
 */
export function isDiagramReferenceNode(node: DiagramNode | null | undefined): boolean {
  return Boolean(node?.referencedDiagramId) || Boolean(node?.type?.includes('DiagramModelReference'))
}

export function resolveReferencedDiagramName(
  node: DiagramNode,
  diagrams: ParsedDiagram[] | Map<string, ParsedDiagram> | undefined,
): string {
  const refId = node.referencedDiagramId
  if (!refId) {
    return ''
  }
  if (diagrams instanceof Map) {
    return diagrams.get(refId)?.name ?? refId
  }
  return diagrams?.find((item) => item.id === refId)?.name ?? refId
}

function isNoteElementType(type: string | undefined): boolean {
  if (!type) {
    return false
  }
  return /Note/i.test(type)
}

function isNoteDiagramNode(
  node: DiagramNode | null | undefined,
  linkedElement: ParsedElement | null | undefined,
): boolean {
  if (isNoteElementType(linkedElement?.type) || isNoteElementType(node?.type)) {
    return true
  }
  return /DiagramModelNote/i.test(String(node?.type ?? ''))
}

export function resolveNoteContentFromElement(
  element: ParsedElement | null | undefined,
): string {
  if (!element || !isNoteElementType(element.type)) {
    return ''
  }
  const fromProperties = getElementNoteContent(element.properties)
  if (fromProperties) {
    return fromProperties
  }
  const documentation = element.documentation?.trim()
  if (documentation) {
    return documentation
  }
  const name = element.name?.trim()
  if (name && name !== element.id) {
    return name
  }
  return ''
}

export function syncNoteLabelsFromElements(
  nodes: DiagramNode[],
  elementById: Map<string, ParsedElement>,
): DiagramNode[] {
  function syncNode(node: DiagramNode): DiagramNode {
    const linked = node.elementRef ? elementById.get(node.elementRef) : undefined
    let label = node.label
    if (isNoteDiagramNode(node, linked) && !label?.trim()) {
      const content = resolveNoteContentFromElement(linked)
      if (content) {
        label = content
      }
    }
    const children = (node.children ?? []).map(syncNode)
    if (label === node.label && children === node.children) {
      return node
    }
    return { ...node, label, children }
  }
  return nodes.map(syncNode)
}

export function getDiagramNodeDisplayTitle(
  node: DiagramNode | null | undefined,
  linkedElement: ParsedElement | null | undefined,
  referencedDiagramName?: string,
): string {
  if (isDiagramReferenceNode(node)) {
    const refName = referencedDiagramName?.trim()
    if (refName) {
      return refName
    }
    const diagramLabel = node?.label?.trim()
    if (diagramLabel) {
      return diagramLabel
    }
    return node?.referencedDiagramId || node?.id || 'Diagram reference'
  }

  const diagramLabel = node?.label?.trim()
  if (diagramLabel) {
    return diagramLabel
  }

  const noteContent = resolveNoteContentFromElement(linkedElement)
  if (noteContent) {
    return noteContent
  }

  const elementName = linkedElement?.name?.trim()
  if (elementName && linkedElement?.id && elementName !== linkedElement.id) {
    return elementName
  }
  if (elementName) {
    return elementName
  }

  if (node?.elementRef) {
    return node.elementRef
  }
  return node?.id || 'Node'
}

export {
  getRelationshipDisplayLabel,
  getRelationshipExplicitName,
} from './relationship-meta'

export function normalizeRelationshipType(type: string): string {
  if (!type) {
    return ''
  }
  const raw = String(type)
  const withoutPrefix = raw.includes(':') ? raw.split(':').at(-1)! : raw
  return withoutPrefix
}

/** Шаг сетки позиционирования на диаграмме (логические координаты Archi). */
export const DIAGRAM_GRID_STEP = 20

export function roundDiagramCoord(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.round(value)
}

export function formatDiagramCoord(value: number): string {
  return String(roundDiagramCoord(value))
}

export function snapToGrid(value: number, step: number = DIAGRAM_GRID_STEP): number {
  return roundDiagramCoord(Math.round(value / step) * step)
}

export function snapPointToGrid(x: number, y: number, step: number = DIAGRAM_GRID_STEP): { x: number; y: number } {
  return { x: snapToGrid(x, step), y: snapToGrid(y, step) }
}

export function computeSnappedNodeOffset(
  startX: number, startY: number, pointerDx: number, pointerDy: number, step: number = DIAGRAM_GRID_STEP,
): { dx: number; dy: number } {
  const targetX = snapToGrid(startX + pointerDx, step)
  const targetY = snapToGrid(startY + pointerDy, step)
  return {
    dx: roundDiagramCoord(targetX - startX),
    dy: roundDiagramCoord(targetY - startY),
  }
}

export function computeSnappedNodeResize(
  startNodeX: number,
  startNodeY: number,
  startWidth: number,
  startHeight: number,
  pointerDx: number,
  pointerDy: number,
  currentWidth: number,
  currentHeight: number,
  minWidth: number = 30,
  minHeight: number = 24,
  step: number = DIAGRAM_GRID_STEP,
): { dw: number; dh: number } {
  const snappedWidth = Math.max(minWidth, snapToGrid(startNodeX + startWidth + pointerDx, step) - startNodeX)
  const snappedHeight = Math.max(minHeight, snapToGrid(startNodeY + startHeight + pointerDy, step) - startNodeY)
  return {
    dw: roundDiagramCoord(snappedWidth - currentWidth),
    dh: roundDiagramCoord(snappedHeight - currentHeight),
  }
}

export function getNodeAtPosition(nodes: DiagramNode[], x: number, y: number): DiagramNode | null {
  const flattened = flattenNodes(nodes)
  for (let i = flattened.length - 1; i >= 0; i -= 1) {
    const node = flattened[i]
    const insideX = x >= node.x && x <= node.x + node.width
    const insideY = y >= node.y && y <= node.y + node.height
    if (insideX && insideY) {
      return node
    }
  }
  return null
}

export function resolveDiagramWithOverrides(
  diagram: ParsedDiagram | null | undefined,
  diagramOverrides: DiagramOverridesMap | null | undefined,
  relationshipOverrides: RelationshipOverridesMap | null | undefined,
  diagramId: string,
): ParsedDiagram | null {
  if (!diagram) {
    return null
  }
  const overrides = diagramOverrides?.get(diagramId)
  const relOverrides = relationshipOverrides?.get(diagramId)
  if (!overrides?.size) {
    if (!relOverrides?.size) {
      return diagram
    }
    return {
      ...diagram,
      connections: diagram.connections.map((c) => {
        const ov = relOverrides.get(c.relationshipRef)
        return ov !== undefined ? { ...c, bendpoints: ov } : c
      }),
    }
  }
  return {
    ...diagram,
    nodes: applyOverridesToNodes(diagram.nodes, overrides),
    connections: diagram.connections.map((c) => {
      const ov = relOverrides?.get(c.relationshipRef)
      return ov !== undefined ? { ...c, bendpoints: ov } : c
    }),
  }
}

export function findDiagramInModel(
  model: ParsedModel | null | undefined,
  diagramId: string,
  diagramName?: string,
): ParsedDiagram | null {
  if (!model?.diagrams?.length) {
    return null
  }
  return (
    model.diagrams.find((d) => d.id === diagramId) ??
    (diagramName ? model.diagrams.find((d) => d.name === diagramName) : null) ??
    null
  )
}

export function applyOverridesToNodes(
  nodes: DiagramNode[],
  overrides: Map<string, NodeOverride> | null | undefined,
  accDx: number = 0,
  accDy: number = 0,
): DiagramNode[] {
  return nodes.map((node) => {
    const delta = overrides?.get(node.id) ?? { dx: 0, dy: 0, dw: 0, dh: 0 }
    const dx = accDx + (delta.dx ?? 0)
    const dy = accDy + (delta.dy ?? 0)
    let fillColor = node.fillColor
    if (delta.fillColor !== undefined) {
      fillColor = delta.fillColor === null ? undefined : delta.fillColor
    }
    return {
      ...node,
      x: roundDiagramCoord(node.x + dx),
      y: roundDiagramCoord(node.y + dy),
      width: Math.max(30, roundDiagramCoord(node.width + (delta.dw ?? 0))),
      height: Math.max(24, roundDiagramCoord(node.height + (delta.dh ?? 0))),
      fillColor,
      children: applyOverridesToNodes(node.children, overrides, dx, dy),
    }
  })
}

export function getSelectionOverrideRoots(
  selectedIds: Set<string>,
  nodes: DiagramNode[],
): string[] {
  const roots: string[] = []

  function walk(nodeList: DiagramNode[], ancestorSelected: boolean): void {
    for (const node of nodeList) {
      const selected = selectedIds.has(node.id)
      if (selected && !ancestorSelected) {
        roots.push(node.id)
      }
      walk(node.children ?? [], ancestorSelected || selected)
    }
  }

  walk(nodes, false)
  return roots
}

export function applyDragPreviewToNodeIds(
  nodes: DiagramNode[],
  nodeIds: Set<string>,
  dx: number,
  dy: number,
  ancestorMoves = false,
): DiagramNode[] {
  return nodes.map((node) => {
    const selfSelected = nodeIds.has(node.id)
    const move = ancestorMoves || selfSelected
    const childAncestorMoves = ancestorMoves || selfSelected
    return {
      ...node,
      x: move ? roundDiagramCoord(node.x + dx) : node.x,
      y: move ? roundDiagramCoord(node.y + dy) : node.y,
      children: applyDragPreviewToNodeIds(node.children, nodeIds, dx, dy, childAncestorMoves),
    }
  })
}

export function applyDragPreviewToNodes(
  nodes: DiagramNode[],
  nodeId: string,
  dx: number,
  dy: number,
  dw: number = 0,
  dh: number = 0,
  accDx: number = 0,
  accDy: number = 0,
): DiagramNode[] {
  return nodes.map((node) => {
    const delta =
      node.id === nodeId
        ? { dx: dx ?? 0, dy: dy ?? 0, dw: dw ?? 0, dh: dh ?? 0 }
        : { dx: 0, dy: 0, dw: 0, dh: 0 }
    const nextDx = accDx + delta.dx
    const nextDy = accDy + delta.dy
    return {
      ...node,
      x: roundDiagramCoord(node.x + nextDx),
      y: roundDiagramCoord(node.y + nextDy),
      width: Math.max(30, roundDiagramCoord(node.width + delta.dw)),
      height: Math.max(24, roundDiagramCoord(node.height + delta.dh)),
      children: applyDragPreviewToNodes(node.children, nodeId, dx, dy, dw, dh, nextDx, nextDy),
    }
  })
}

export function mapNodes(
  nodes: DiagramNode[],
  mapper: (node: DiagramNode) => DiagramNode,
): DiagramNode[] {
  return nodes.map((node) => ({
    ...mapper(node),
    children: mapNodes(node.children, mapper),
  }))
}

export function isRectFullyInside(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
  tolerance: number = 1,
): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

export function findInnermostContainingNode(
  nodes: DiagramNode[] | null | undefined,
  innerRect: { x: number; y: number; width: number; height: number } | null | undefined,
): DiagramNode | null {
  if (!nodes?.length || !innerRect) {
    return null
  }

  let best: DiagramNode | null = null
  let bestArea = Infinity

  function walk(nodeList: DiagramNode[]): void {
    for (const node of nodeList) {
      if (isRectFullyInside(node, innerRect!)) {
        const area = node.width * node.height
        if (area < bestArea) {
          bestArea = area
          best = node
        }
      }
      if (node.children?.length) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return best
}

export function findInnermostContainingNodeExcluding(
  nodes: DiagramNode[] | null | undefined,
  innerRect: { x: number; y: number; width: number; height: number } | null | undefined,
  excludeNodeIds: Set<string>,
): DiagramNode | null {
  if (!nodes?.length || !innerRect) {
    return null
  }

  let best: DiagramNode | null = null
  let bestArea = Infinity

  function walk(nodeList: DiagramNode[]): void {
    for (const node of nodeList) {
      if (!excludeNodeIds.has(node.id) && isRectFullyInside(node, innerRect!)) {
        const area = node.width * node.height
        if (area < bestArea) {
          bestArea = area
          best = node
        }
      }
      if (node.children?.length) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return best
}

export function findDirectParentNodeId(nodes: DiagramNode[], targetId: string): string | null {
  let parentId: string | null | undefined

  function walk(nodeList: DiagramNode[], currentParentId: string | null): boolean {
    for (const node of nodeList) {
      if (node.id === targetId) {
        parentId = currentParentId
        return true
      }
      if (node.children?.length && walk(node.children, node.id)) {
        return true
      }
    }
    return false
  }

  walk(nodes, null)
  return parentId ?? null
}

export function extractNodeFromTree(
  nodes: DiagramNode[],
  targetId: string,
): { nodes: DiagramNode[]; extracted: DiagramNode | null } {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node.id === targetId) {
      return {
        nodes: [...nodes.slice(0, index), ...nodes.slice(index + 1)],
        extracted: node,
      }
    }
    const nested = extractNodeFromTree(node.children ?? [], targetId)
    if (nested.extracted) {
      return {
        nodes: nodes.map((item, itemIndex) =>
          itemIndex === index ? { ...item, children: nested.nodes } : item,
        ),
        extracted: nested.extracted,
      }
    }
  }
  return { nodes, extracted: null }
}

export function reparentNodeInTree(
  nodes: DiagramNode[],
  nodeId: string,
  newParentId: string | null,
): DiagramNode[] {
  const { nodes: withoutNode, extracted } = extractNodeFromTree(nodes, nodeId)
  if (!extracted) {
    return nodes
  }
  if (!newParentId) {
    return [...withoutNode, extracted]
  }
  return insertNodeUnderParent(withoutNode, newParentId, extracted)
}

export function insertNodeUnderParent(nodes: DiagramNode[], parentId: string | null | undefined, newNode: DiagramNode): DiagramNode[] {
  if (!parentId) {
    return [...nodes, newNode]
  }
  return nodes.map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        children: [...(node.children ?? []), newNode],
      }
    }
    return {
      ...node,
      children: insertNodeUnderParent(node.children ?? [], parentId, newNode),
    }
  })
}

export function findNodeById(nodes: DiagramNode[], id: string): DiagramNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node
    }
    const found = findNodeById(node.children, id)
    if (found) {
      return found
    }
  }
  return null
}

export function collectSubtreeIds(node: DiagramNode): string[] {
  const ids: string[] = []
  function walk(n: DiagramNode): void {
    ids.push(n.id)
    n.children.forEach(walk)
  }
  walk(node)
  return ids
}

export function collectSubtreeElementRefs(node: DiagramNode): Set<string> {
  const refs = new Set<string>()
  function walk(n: DiagramNode): void {
    if (n.elementRef) {
      refs.add(n.elementRef)
    }
    n.children.forEach(walk)
  }
  walk(node)
  return refs
}

export function removeNodeFromTree(nodes: DiagramNode[], targetId: string): DiagramNode[] {
  const out: DiagramNode[] = []
  for (const node of nodes) {
    if (node.id === targetId) {
      continue
    }
    out.push({
      ...node,
      children: removeNodeFromTree(node.children, targetId),
    })
  }
  return out
}

export function removeDiagramObjectsByElementRef(nodes: DiagramNode[], elementId: string): DiagramNode[] {
  return nodes
    .filter((node) => node.elementRef !== elementId)
    .map((node) => ({
      ...node,
      children: removeDiagramObjectsByElementRef(node.children, elementId),
    }))
}

export function collectNodeIdsRemovedForElement(nodes: DiagramNode[], elementId: string): Set<string> {
  const idSet = new Set<string>()
  function walk(n: DiagramNode): void {
    if (n.elementRef === elementId) {
      collectSubtreeIds(n).forEach((id) => idSet.add(id))
      return
    }
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return idSet
}

export function collectElementRefsUsedInDiagrams(diagrams: ParsedDiagram[]): Set<string> {
  const used = new Set<string>()
  for (const d of diagrams) {
    for (const n of flattenNodes(d.nodes)) {
      if (n.elementRef) {
        used.add(n.elementRef)
      }
    }
  }
  return used
}

export function filterConnectionsToExistingRelationships(
  connections: DiagramConnection[],
  relationshipById: Map<string, ParsedRelationship>,
): DiagramConnection[] {
  return connections.filter((connection) => relationshipById.has(connection.relationshipRef))
}

export function findNodeByElementRefInDiagram(diagram: ParsedDiagram, elementId: string): DiagramNode | null {
  const flattened = flattenNodes(diagram.nodes)
  return flattened.find((n) => n.elementRef === elementId) ?? null
}

/** Connection ids on a diagram that touch the given diagram object (source or target). */
export function collectConnectionIdsForDiagramNode(
  diagram: ParsedDiagram | null | undefined,
  nodeId: string,
): string[] {
  if (!diagram?.connections?.length || !nodeId) {
    return []
  }
  return diagram.connections
    .filter((connection) => connection.source === nodeId || connection.target === nodeId)
    .map((connection) => connection.id)
}

/** Connection ids on a diagram that visualize the given relationship. */
export function collectConnectionIdsForRelationshipRef(
  diagram: ParsedDiagram | null | undefined,
  relationshipRef: string,
): string[] {
  if (!diagram?.connections?.length || !relationshipRef) {
    return []
  }
  return diagram.connections
    .filter((connection) => connection.relationshipRef === relationshipRef)
    .map((connection) => connection.id)
}

export function collectDiagramHighlightsForElement(
  diagram: ParsedDiagram | null | undefined,
  elementRef?: string,
  selectedNodeId?: string,
): { nodeIds: string[]; connectionIds: string[] } {
  if (!diagram?.connections?.length) {
    return { nodeIds: [], connectionIds: [] }
  }

  const elementNodeIds = new Set<string>()
  if (selectedNodeId) {
    elementNodeIds.add(selectedNodeId)
  } else if (elementRef) {
    flattenNodes(diagram.nodes).forEach((node) => {
      if (node.elementRef === elementRef) {
        elementNodeIds.add(node.id)
      }
    })
  }

  if (elementNodeIds.size === 0) {
    return { nodeIds: [], connectionIds: [] }
  }

  const connectionIds: string[] = []
  const peerNodeIds = new Set<string>()

  diagram.connections.forEach((connection) => {
    const touchesSource = elementNodeIds.has(connection.source)
    const touchesTarget = elementNodeIds.has(connection.target)
    if (!touchesSource && !touchesTarget) {
      return
    }
    connectionIds.push(connection.id)
    if (!touchesSource) {
      peerNodeIds.add(connection.source)
    }
    if (!touchesTarget) {
      peerNodeIds.add(connection.target)
    }
  })

  return {
    nodeIds: [...peerNodeIds],
    connectionIds,
  }
}
