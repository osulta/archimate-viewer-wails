import type {
  DiagramNode,
  ParsedDiagram,
  ParsedModel,
  ParsedElement,
  NodeOverride,
  Bendpoint,
  DiagramConnection,
  DiagramOverridesMap,
  RelationshipOverridesMap,
} from '../../types/model'
import {
  getId,
  getName,
  getType,
  getDirectChildByTag,
  getDirectChildrenByTag,
  applyDiagramObjectVisualToXml,
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
export function getDiagramNodeDisplayTitle(
  node: DiagramNode | null | undefined,
  linkedElement: ParsedElement | null | undefined,
): string {
  const diagramLabel = node?.label?.trim()
  if (diagramLabel) {
    return diagramLabel
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

function findArchiDiagramElement(allElements: Element[], diagramId: string): Element | undefined {
  return allElements.find(
    (el) =>
      el.localName === 'element' &&
      getId(el) === diagramId &&
      String(
        el.getAttribute('xsi:type') ??
          el.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') ??
          '',
      ).includes('ArchimateDiagramModel'),
  )
}

function findViewDiagramElement(allElements: Element[], diagramId: string): Element | undefined {
  return allElements.find((el) => el.localName === 'view' && getId(el) === diagramId)
}

function findFirstDiagramsTypedFolder(modelEl: Element): Element | null {
  const queue = [...getDirectChildrenByTag(modelEl, 'folder')]
  for (let i = 0; i < queue.length; i += 1) {
    const folder = queue[i]
    if ((folder.getAttribute('type') ?? '') === 'diagrams') {
      return folder
    }
    queue.push(...getDirectChildrenByTag(folder, 'folder'))
  }
  return null
}

function findArchiFolderForNewDiagram(modelEl: Element, folderPath: string): Element | null {
  const parts = (folderPath ?? '')
    .split(' / ')
    .map((s) => s.trim())
    .filter(Boolean)
  let current: Element = modelEl
  for (const part of parts) {
    const folders = getDirectChildrenByTag(current, 'folder')
    const next = folders.find((f) => (getName(f) || '').trim() === part)
    if (!next) {
      break
    }
    current = next
  }
  if (current === modelEl) {
    return findFirstDiagramsTypedFolder(modelEl) ?? getDirectChildByTag(modelEl, 'folder')
  }
  return current
}

export function applyDiagramMetadataToXml(documentNode: Document, model: ParsedModel | null | undefined): void {
  if (!documentNode || !model?.diagrams?.length) {
    return
  }

  const allElements = Array.from(documentNode.getElementsByTagName('*'))

  for (const diagram of model.diagrams) {
    const targets = allElements.filter((el) => {
      if (getId(el) !== diagram.id) {
        return false
      }
      if (el.localName === 'view') {
        return true
      }
      if (el.localName !== 'element') {
        return false
      }
      const xsiType = String(
        el.getAttribute('xsi:type') ??
          el.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') ??
          '',
      )
      return xsiType.includes('ArchimateDiagramModel') || xsiType.includes('Diagram')
    })

    targets.forEach((el) => {
      const name = diagram.name ?? diagram.id
      if (el.hasAttribute('name')) {
        el.setAttribute('name', name)
      }
      let nameNode = getDirectChildByTag(el, 'name')
      if (!nameNode && el.localName === 'view') {
        nameNode = documentNode.createElement(el.prefix ? `${el.prefix}:name` : 'name')
        el.insertBefore(nameNode, el.firstChild)
      }
      if (nameNode) {
        nameNode.textContent = name
      }
      const labelNode = getDirectChildByTag(el, 'label')
      if (labelNode) {
        labelNode.textContent = name
      }
    })
  }
}

export function ensureCreatedDiagramsInXml(
  documentNode: Document,
  model: ParsedModel,
  createdDiagramIds: Set<string> | Iterable<string>,
): void {
  if (!documentNode || !model?.diagrams?.length || !createdDiagramIds) {
    return
  }
  const idList = [...createdDiagramIds]
  if (!idList.length) {
    return
  }

  const modelEl = Array.from(documentNode.getElementsByTagName('*')).find((n) => n.localName === 'model')
  if (!modelEl) {
    return
  }

  for (const diagramId of idList) {
    const diagram = model.diagrams.find((d) => d.id === diagramId)
    if (!diagram) {
      continue
    }

    const allElements = Array.from(documentNode.getElementsByTagName('*'))

    if (model.format === 'archi-tool') {
      const exists = allElements.some(
        (el) =>
          el.localName === 'element' &&
          getId(el) === diagram.id &&
          String(
            el.getAttribute('xsi:type') ??
              el.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') ??
              '',
          ).includes('ArchimateDiagramModel'),
      )
      if (exists) {
        continue
      }
      const parentFolder = findArchiFolderForNewDiagram(modelEl, diagram.folderPath ?? '')
      if (!parentFolder) {
        continue
      }
      const el = documentNode.createElement(
        parentFolder.prefix ? `${parentFolder.prefix}:element` : 'element',
      )
      el.setAttribute('id', diagram.id)
      el.setAttribute('name', diagram.name)
      el.setAttribute('xsi:type', diagram.type || 'archimate:ArchimateDiagramModel')
      parentFolder.appendChild(el)
      continue
    }

    const existsView = allElements.some((el) => el.localName === 'view' && getId(el) === diagram.id)
    if (existsView) {
      continue
    }
    const views = getDirectChildByTag(modelEl, 'views')
    const diagramsContainer = views ? getDirectChildByTag(views, 'diagrams') : null
    if (!diagramsContainer) {
      continue
    }
    const viewEl = documentNode.createElement(
      diagramsContainer.prefix ? `${diagramsContainer.prefix}:view` : 'view',
    )
    viewEl.setAttribute('identifier', diagram.id)
    viewEl.setAttribute('xsi:type', diagram.type || 'archimate:Diagram')
    const nameNode = documentNode.createElement(
      diagramsContainer.prefix ? `${diagramsContainer.prefix}:name` : 'name',
    )
    nameNode.textContent = diagram.name
    viewEl.appendChild(nameNode)
    diagramsContainer.appendChild(viewEl)
  }
}

function syncArchiDiagramChildrenToXml(parentEl: Element, nodes: DiagramNode[], parentAbsX: number, parentAbsY: number): void {
  const xmlChildren = getDirectChildrenByTag(parentEl, 'child')
  for (const node of nodes) {
    const xmlChild = xmlChildren.find((c) => getId(c) === node.id)
    if (!xmlChild) {
      continue
    }
    const bounds = getDirectChildByTag(xmlChild, 'bounds')
    if (bounds) {
      bounds.setAttribute('x', formatDiagramCoord(node.x - parentAbsX))
      bounds.setAttribute('y', formatDiagramCoord(node.y - parentAbsY))
      bounds.setAttribute('width', formatDiagramCoord(node.width))
      bounds.setAttribute('height', formatDiagramCoord(node.height))
    }
    applyDiagramObjectVisualToXml(xmlChild, node)
    syncArchiDiagramChildrenToXml(xmlChild, node.children, node.x, node.y)
  }
}

function syncViewDiagramNodesToXml(parentEl: Element, nodes: DiagramNode[], parentAbsX: number, parentAbsY: number): void {
  const xmlNodes = getDirectChildrenByTag(parentEl, 'node')
  for (const node of nodes) {
    const xmlNode = xmlNodes.find((c) => getId(c) === node.id)
    if (!xmlNode) {
      continue
    }
    const bounds = getDirectChildByTag(xmlNode, 'bounds')
    if (bounds) {
      bounds.setAttribute('x', formatDiagramCoord(node.x - parentAbsX))
      bounds.setAttribute('y', formatDiagramCoord(node.y - parentAbsY))
      if (bounds.hasAttribute('w')) {
        bounds.setAttribute('w', formatDiagramCoord(node.width))
        bounds.setAttribute('h', formatDiagramCoord(node.height))
      } else {
        bounds.setAttribute('width', formatDiagramCoord(node.width))
        bounds.setAttribute('height', formatDiagramCoord(node.height))
      }
    }
    applyDiagramObjectVisualToXml(xmlNode, node)
    syncViewDiagramNodesToXml(xmlNode, node.children, node.x, node.y)
  }
}

export function applyDiagramLayoutToXml(
  documentNode: Document,
  model: ParsedModel,
  diagramOverrides: DiagramOverridesMap,
): void {
  if (!model?.diagrams?.length || !diagramOverrides?.size) {
    return
  }

  const allElements = Array.from(documentNode.getElementsByTagName('*'))

  diagramOverrides.forEach((overrides, diagramId) => {
    if (!overrides?.size) {
      return
    }
    const diagram = model.diagrams.find((item) => item.id === diagramId)
    if (!diagram) {
      return
    }

    const nodes = applyOverridesToNodes(diagram.nodes, overrides)
    const diagramEl = findArchiDiagramElement(allElements, diagramId)
    if (diagramEl) {
      syncArchiDiagramChildrenToXml(diagramEl, nodes, 0, 0)
      return
    }

    const viewEl = findViewDiagramElement(allElements, diagramId)
    if (viewEl) {
      syncViewDiagramNodesToXml(viewEl, nodes, 0, 0)
    }
  })
}

export function serializeXml(documentNode: Document): string {
  const serializer = new XMLSerializer()
  return serializer.serializeToString(documentNode)
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

export function removeDeletedFromXml(
  documentNode: Document,
  deletedDiagramNodeIds: Set<string>,
  deletedElementIds: Set<string>,
  deletedRelationshipIds: Set<string>,
  deletedConnectionIds?: Set<string>,
): void {
  const nodeSet = deletedDiagramNodeIds
  const elemSet = deletedElementIds
  const relSet = deletedRelationshipIds
  const connSet = deletedConnectionIds ?? new Set<string>()
  if (!nodeSet.size && !elemSet.size && !relSet.size && !connSet.size) {
    return
  }

  const all = Array.from(documentNode.getElementsByTagName('*'))
  const toRemove: Element[] = []
  for (const el of all) {
    const id = el.getAttribute('id') ?? el.getAttribute('identifier') ?? ''
    if (!id) {
      continue
    }
    const ln = el.localName
    const t = getType(el, '')

    if (connSet.has(id) && (ln === 'sourceConnection' || ln === 'connection')) {
      toRemove.push(el)
      continue
    }

    if (nodeSet.has(id) && (ln === 'child' || ln === 'node')) {
      toRemove.push(el)
      continue
    }

    if (
      relSet.has(id) &&
      (ln === 'relationship' || (ln === 'element' && t.includes('Relationship')))
    ) {
      toRemove.push(el)
      continue
    }

    if (
      elemSet.has(id) &&
      ln === 'element' &&
      t !== 'archimate:ArchimateDiagramModel' &&
      !t.includes('Relationship')
    ) {
      toRemove.push(el)
    }
  }

  for (const el of toRemove) {
    el.parentNode?.removeChild(el)
  }

  if (nodeSet.size) {
    const connEls = Array.from(documentNode.getElementsByTagName('*')).filter(
      (el) => el.localName === 'connection',
    )
    for (const el of connEls) {
      const src = el.getAttribute('source') ?? ''
      const tgt = el.getAttribute('target') ?? ''
      if (nodeSet.has(src) || nodeSet.has(tgt)) {
        el.parentNode?.removeChild(el)
      }
    }
  }
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
