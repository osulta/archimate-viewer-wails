import { apiUrl } from '../api-base'
import type {
  ParsedModel,
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  DiagramNode,
  DiagramConnection,
  NodeOverride,
  Bendpoint,
  ElementOverride,
  RelationshipMetaOverride,
} from '../../types/model'
import { applyOverridesToNodes, flattenNodes, formatDiagramCoord, serializeXml } from './diagram-model'
import { fetchSplitModelFile } from './split-model-client'
import { parseDiagramFile } from './parsing/split-files/diagram-file-parser'
import {
  getRelationshipExplicitName,
} from './relationship-meta'
import {
  appendMissingDiagramConnectionsToXml,
  appendMissingDiagramNodesToXml,
  buildSplitDiagramFileContent,
  buildSplitDiagramRelativePath,
  buildSplitElementFileContent,
  buildSplitRelationshipFileContent,
  findDiagramXmlObjectById,
} from './split-model-create'
import {
  buildSplitElementRelativePath,
  buildSplitRelationshipRelativePath,
  buildSplitFileHref,
  resolveElementSourceFile,
  typeLocalName,
} from './split-model-paths'
import { idFromArchimateHref } from './parsing/xml/href-utils'
import { parseXmlDocument, getDocumentRootElement } from './parsing/xml/parse-xml-document'
import {
  getDirectChildByTag,
  getDirectChildrenByTag,
  getId,
  applyDocumentationToElementXml,
  applyPropertiesToElementXml,
  clearConnectionBendpoints,
  appendConnectionBendpoints,
  applyDiagramObjectVisualToXml,
} from './xml-utils'
const DIAGRAM_OBJECT_TAGS = ['child', 'children']
const CONNECTION_TAGS = ['sourceConnection', 'sourceConnections']

function getDiagramObjectXmlChildren(parent: Element): Element[] {
  const out: Element[] = []
  for (const tag of DIAGRAM_OBJECT_TAGS) {
    out.push(...getDirectChildrenByTag(parent, tag))
  }
  return out
}

function getConnectionXmlChildren(parent: Element): Element[] {
  const out: Element[] = []
  for (const tag of CONNECTION_TAGS) {
    out.push(...getDirectChildrenByTag(parent, tag))
  }
  return out
}

function connectionMatchesRelationship(connectionEl: Element, relationshipRef: string): boolean {
  const attrRef = connectionEl.getAttribute('archimateRelationship')
  if (attrRef === relationshipRef) {
    return true
  }
  const href = getDirectChildByTag(connectionEl, 'archimateRelationship')?.getAttribute('href') ?? ''
  return idFromArchimateHref(href) === relationshipRef
}

function removeOrphanedDiagramObjectsFromXml(diagramRoot: Element, activeNodeIds: Set<string>): void {
  const allObjects: Element[] = []
  function collect(parent: Element): void {
    for (const child of getDiagramObjectXmlChildren(parent)) {
      allObjects.push(child)
      collect(child)
    }
  }
  collect(diagramRoot)
  for (const el of allObjects) {
    const id = getId(el)
    if (id && !activeNodeIds.has(id)) {
      el.parentNode?.removeChild(el)
    }
  }
}

function syncSplitDiagramConnectionsToXml(diagramRoot: Element, connections: DiagramConnection[]): void {
  const activeIds = new Set(connections.map((connection) => connection.id))
  for (const connEl of collectAllConnections(diagramRoot)) {
    const id = getId(connEl)
    if (id && !activeIds.has(id)) {
      connEl.parentNode?.removeChild(connEl)
    }
  }
}

function collectAllConnections(diagramRoot: Element): Element[] {
  const out: Element[] = []
  function walk(parent: Element): void {
    getConnectionXmlChildren(parent).forEach((conn) => out.push(conn))
    getDiagramObjectXmlChildren(parent).forEach((child) => walk(child))
  }
  walk(diagramRoot)
  return out
}

function syncSplitDiagramChildrenToXml(
  diagramRoot: Element,
  parentEl: Element,
  nodes: DiagramNode[],
  parentAbsX: number,
  parentAbsY: number,
): void {
  for (const node of nodes) {
    const xmlChild = findDiagramXmlObjectById(diagramRoot, node.id)
    if (!xmlChild) {
      continue
    }
    if (xmlChild.parentElement !== parentEl) {
      parentEl.appendChild(xmlChild)
    }
    const bounds = getDirectChildByTag(xmlChild, 'bounds')
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
    applyDiagramObjectVisualToXml(xmlChild, node)
    syncSplitDiagramChildrenToXml(diagramRoot, xmlChild, node.children, node.x, node.y)
  }
}

interface SaveContext {
  elementById?: Map<string, ParsedElement>
  relationshipById?: Map<string, ParsedRelationship>
  pendingElementPaths?: Map<string, string>
  pendingRelationshipPaths?: Map<string, string>
  diagramById?: Map<string, ParsedDiagram>
  pendingDiagramPaths?: Map<string, string>
}

export function buildSplitDiagramSaveXml(
  content: string,
  diagram: ParsedDiagram,
  nodeOverrides: Map<string, NodeOverride>,
  relationshipOverrideMap: Map<string, Bendpoint[]> | undefined,
  saveContext?: SaveContext,
): string {
  const documentNode = parseXmlDocument(content)
  const diagramRoot = getDocumentRootElement(documentNode)
  if (diagram.name != null && diagramRoot.hasAttribute('name')) {
    const currentName = diagramRoot.getAttribute('name') ?? ''
    if (diagram.name !== currentName) {
      diagramRoot.setAttribute('name', diagram.name)
    }
  }
  const layoutNodes = applyOverridesToNodes(diagram.nodes, nodeOverrides)
  const activeNodeIds = new Set(flattenNodes(layoutNodes).map((node) => node.id))
  removeOrphanedDiagramObjectsFromXml(diagramRoot, activeNodeIds)
  syncSplitDiagramChildrenToXml(diagramRoot, diagramRoot, layoutNodes, 0, 0)

  if (saveContext?.elementById) {
    appendMissingDiagramNodesToXml(
      diagramRoot,
      layoutNodes,
      documentNode,
      saveContext.elementById,
      saveContext.pendingElementPaths ?? new Map(),
      saveContext.diagramById ?? new Map(),
      saveContext.pendingDiagramPaths ?? new Map(),
    )
    appendMissingDiagramConnectionsToXml(
      diagramRoot,
      diagram.connections,
      documentNode,
      saveContext.elementById,
      saveContext.relationshipById ?? new Map(),
      saveContext.pendingElementPaths ?? new Map(),
      saveContext.pendingRelationshipPaths ?? new Map(),
    )
  }

  syncSplitDiagramConnectionsToXml(diagramRoot, diagram.connections)

  if (relationshipOverrideMap?.size) {
    const connections = collectAllConnections(diagramRoot)
    relationshipOverrideMap.forEach((bendpoints, relationshipRef) => {
      const matching = connections.filter((conn) =>
        connectionMatchesRelationship(conn, relationshipRef),
      )
      matching.forEach((connEl) => {
        clearConnectionBendpoints(connEl)
        appendConnectionBendpoints(connEl, documentNode, bendpoints)
      })
    })
  }

  return serializeXml(documentNode)
}

export function buildSplitElementSaveXml(content: string, element: ParsedElement, override: ElementOverride): string {
  const documentNode = parseXmlDocument(content)
  const root = getDocumentRootElement(documentNode)

  if (override.name != null) {
    if (root.hasAttribute('name')) {
      root.setAttribute('name', override.name)
    } else {
      let nameNode = getDirectChildByTag(root, 'name')
      if (!nameNode) {
        nameNode = documentNode.createElement(root.prefix ? `${root.prefix}:name` : 'name')
        root.insertBefore(nameNode, root.firstChild)
      }
      nameNode.textContent = override.name
    }
  }

  if (override.documentation !== undefined) {
    applyDocumentationToElementXml(root, documentNode, override.documentation)
  }

  if (override.properties) {
    applyPropertiesToElementXml(root, documentNode, override.properties)
  }

  return serializeXml(documentNode)
}

export function buildSplitRelationshipSaveXml(content: string, relationshipId: string, override: RelationshipMetaOverride): string {
  const documentNode = parseXmlDocument(content)
  const root = getDocumentRootElement(documentNode)
  const rootId = getId(root)
  if (rootId !== relationshipId) {
    return content
  }

  if (override.name != null) {
    if (root.hasAttribute('name')) {
      if (override.name.trim()) {
        root.setAttribute('name', override.name)
      } else {
        root.removeAttribute('name')
      }
    } else if (override.name.trim()) {
      root.setAttribute('name', override.name)
    }
  }

  if (override.documentation !== undefined) {
    applyDocumentationToElementXml(root, documentNode, override.documentation)
  }

  if (override.properties) {
    applyPropertiesToElementXml(root, documentNode, override.properties)
  }

  return serializeXml(documentNode)
}

function upsertSplitRelationshipEndpointChild(
  root: Element,
  documentNode: Document,
  endpoint: 'source' | 'target',
  element: ParsedElement,
  href: string,
): void {
  let child = getDirectChildByTag(root, endpoint)
  const tagName = root.prefix ? `${root.prefix}:${endpoint}` : endpoint
  if (!child) {
    child = documentNode.createElement(tagName)
    root.appendChild(child)
  }
  child.setAttributeNS(
    'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:type',
    `archimate:${typeLocalName(element.type)}`,
  )
  child.setAttribute('href', href)
}

export function buildSplitRelationshipEndpointsSaveXml(
  content: string,
  relationship: ParsedRelationship,
  elementById: Map<string, ParsedElement>,
  pendingElementPaths: Map<string, string>,
): string {
  const documentNode = parseXmlDocument(content)
  const root = getDocumentRootElement(documentNode)
  if (getId(root) !== relationship.id) {
    return content
  }

  const sourceEl = elementById.get(relationship.source)
  const targetEl = elementById.get(relationship.target)
  if (!sourceEl || !targetEl) {
    return content
  }

  const sourceFile = resolveElementSourceFile(elementById, relationship.source, pendingElementPaths)
  const targetFile = resolveElementSourceFile(elementById, relationship.target, pendingElementPaths)
  if (!sourceFile || !targetFile) {
    return content
  }

  root.removeAttribute('source')
  root.removeAttribute('target')
  upsertSplitRelationshipEndpointChild(
    root,
    documentNode,
    'source',
    sourceEl,
    buildSplitFileHref(sourceFile, relationship.source),
  )
  upsertSplitRelationshipEndpointChild(
    root,
    documentNode,
    'target',
    targetEl,
    buildSplitFileHref(targetFile, relationship.target),
  )

  return serializeXml(documentNode)
}

async function resolveDiagramForSave(model: ParsedModel, diagramId: string): Promise<ParsedDiagram | null> {
  const entry = model.diagrams.find((item) => item.id === diagramId)
  if (!entry?.sourceFile || !model.modelRoot) {
    return null
  }
  if (entry.loaded && Array.isArray(entry.nodes)) {
    return entry
  }

  const content = await fetchSplitModelFile(model.modelRoot, entry.sourceFile)
  const parsed = parseDiagramFile(content, entry.sourceFile, entry.folderPath ?? '')
  if (!parsed) {
    throw new Error(`Не удалось разобрать диаграмму ${entry.sourceFile}`)
  }

  return {
    ...parsed,
    loaded: true,
    nodes: entry.nodes?.length ? entry.nodes : parsed.nodes,
    connections: entry.connections?.length ? entry.connections : parsed.connections,
  }
}

function elementOverrideIsDirty(element: ParsedElement, override: ElementOverride | null | undefined): boolean {
  if (!override) {
    return false
  }
  if (override.name != null && override.name !== element.name) {
    return true
  }
  if (
    override.documentation !== undefined &&
    override.documentation !== (element.documentation ?? '')
  ) {
    return true
  }
  if (override.properties) {
    const baseProps = JSON.stringify(element.properties ?? [])
    const nextProps = JSON.stringify(override.properties)
    if (baseProps !== nextProps) {
      return true
    }
  }
  return false
}

function relationshipMetaIsDirty(relationship: ParsedRelationship, meta: RelationshipMetaOverride | null | undefined): boolean {
  if (!meta) {
    return false
  }
  if (meta.name != null && meta.name !== getRelationshipExplicitName(relationship)) {
    return true
  }
  if (meta.documentation !== undefined && meta.documentation !== (relationship.documentation ?? '')) {
    return true
  }
  if (meta.properties) {
    const baseProps = JSON.stringify(relationship.properties ?? [])
    const nextProps = JSON.stringify(meta.properties)
    if (baseProps !== nextProps) {
      return true
    }
  }
  return false
}

function splitModelRepoPath(modelRoot: string, relativePath: string): string {
  return `${modelRoot.replace(/\/+$/u, '')}/${relativePath.replace(/^\/+/, '')}`
}

async function writeSplitModelFile(modelRoot: string, relativePath: string, content: string): Promise<string> {
  const path = splitModelRepoPath(modelRoot, relativePath)
  const response = await fetch(apiUrl('/api/model/write'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
  const data = await response.json()
  if (!data.ok) {
    throw new Error(data.error || `Ошибка записи ${relativePath}`)
  }
  return data.path ?? path
}

async function deleteSplitModelFile(modelRoot: string, relativePath: string): Promise<string> {
  const path = splitModelRepoPath(modelRoot, relativePath)
  const response = await fetch(apiUrl('/api/model/delete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const data = await response.json()
  if (!data.ok) {
    throw new Error(data.error || `Ошибка удаления ${relativePath}`)
  }
  return data.path ?? path
}

export function resolveSplitRelationshipFilePath(relationship: ParsedRelationship): string {
  return relationship.sourceFile ?? buildSplitRelationshipRelativePath(relationship)
}

export function resolveSplitElementFilePath(element: ParsedElement): string {
  return element.sourceFile ?? buildSplitElementRelativePath(element)
}

interface SaveSplitModelPayload {
  model: ParsedModel
  diagramOverrides: Map<string, Map<string, NodeOverride>>
  relationshipOverrides: Map<string, Map<string, Bendpoint[]>>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  elementOverrides: Map<string, ElementOverride>
  dirtyDiagramIds?: Set<string>
  dirtyRelationshipIds?: Set<string>
  createdObjects?: Array<{ diagramId: string; element: ParsedElement; node: DiagramNode; existingElement?: boolean }>
  createdRelationships?: Array<{ diagramId: string; relationship: ParsedRelationship; connection: DiagramConnection }>
  createdDiagramIds?: Set<string> | Iterable<string>
  deletedSplitModelFiles?: Iterable<string>
}

interface SaveSplitModelResult {
  ok: boolean
  written: string[]
  newElementFiles: Record<string, string>
  newRelationshipFiles: Record<string, string>
  newDiagramFiles: Record<string, string>
}

export async function saveSplitModelChanges({
  model,
  diagramOverrides,
  relationshipOverrides,
  relationshipMetaOverrides,
  elementOverrides,
  dirtyDiagramIds,
  dirtyRelationshipIds,
  createdObjects = [],
  createdRelationships = [],
  createdDiagramIds,
  deletedSplitModelFiles = [],
}: SaveSplitModelPayload): Promise<SaveSplitModelResult> {
  if (!model?.modelRoot) {
    throw new Error('Не указан каталог split-модели (modelRoot).')
  }

  const written: string[] = []
  const seenPaths = new Set<string>()

  async function writeOnce(relativePath: string, content: string): Promise<void> {
    if (!relativePath || seenPaths.has(relativePath)) {
      return
    }
    seenPaths.add(relativePath)
    const path = await writeSplitModelFile(model.modelRoot!, relativePath, content)
    written.push(path)
  }

  async function deleteOnce(relativePath: string): Promise<void> {
    const normalized = relativePath.replace(/^\/+/, '')
    if (!normalized || seenPaths.has(`delete:${normalized}`)) {
      return
    }
    seenPaths.add(`delete:${normalized}`)
    const path = await deleteSplitModelFile(model.modelRoot!, normalized)
    written.push(path)
  }

  const pendingElementPaths = new Map<string, string>()
  const pendingRelationshipPaths = new Map<string, string>()
  const pendingDiagramPaths = new Map<string, string>()

  function resolveElementForSave(element: ParsedElement): ParsedElement {
    const override = elementOverrides.get(element.id)
    if (!override) {
      return element
    }
    return {
      ...element,
      name: override.name ?? element.name,
      documentation:
        override.documentation !== undefined
          ? override.documentation
          : element.documentation,
      properties: override.properties ?? element.properties,
    }
  }

  for (const created of createdObjects) {
    if (created.existingElement) {
      continue
    }
    const element = resolveElementForSave(created.element)
    const existing = model.elementById.get(element.id)
    if (existing?.sourceFile) {
      continue
    }
    const relativePath = buildSplitElementRelativePath(element)
    const content = buildSplitElementFileContent(element)
    await writeOnce(relativePath, content)
    pendingElementPaths.set(element.id, relativePath)
  }

  for (const cr of createdRelationships) {
    const relationship = model.relationshipById.get(cr.relationship.id) ?? cr.relationship
    const meta = relationshipMetaOverrides.get(relationship.id)
    const relationshipToWrite =
      meta?.name != null ? { ...relationship, name: meta.name } : relationship
    if (relationshipToWrite.sourceFile) {
      continue
    }
    const relativePath = buildSplitRelationshipRelativePath(relationshipToWrite)
    const content = buildSplitRelationshipFileContent(
      relationshipToWrite,
      model.elementById,
      pendingElementPaths,
    )
    await writeOnce(relativePath, content)
    pendingRelationshipPaths.set(relationshipToWrite.id, relativePath)
  }

  for (const diagramId of createdDiagramIds ?? []) {
    const diagram = model.diagrams.find((item) => item.id === diagramId)
    if (!diagram || diagram.sourceFile) {
      continue
    }
    const relativePath = buildSplitDiagramRelativePath(diagram.id)
    await writeOnce(relativePath, buildSplitDiagramFileContent(diagram))
    pendingDiagramPaths.set(diagramId, relativePath)
  }

  const saveContext: SaveContext = {
    elementById: model.elementById,
    relationshipById: model.relationshipById,
    pendingElementPaths,
    pendingRelationshipPaths,
    diagramById: new Map(model.diagrams.map((item) => [item.id, item])),
    pendingDiagramPaths,
  }

  const diagramIdsToSave = new Set<string>(dirtyDiagramIds ?? [])
  createdObjects.forEach((item) => diagramIdsToSave.add(item.diagramId))
  createdRelationships.forEach((item) => diagramIdsToSave.add(item.diagramId))
  for (const diagramId of createdDiagramIds ?? []) {
    diagramIdsToSave.add(diagramId)
  }
  diagramOverrides.forEach((_ov, diagramId) => diagramIdsToSave.add(diagramId))
  relationshipOverrides.forEach((_ov, diagramId) => diagramIdsToSave.add(diagramId))

  const createdDiagramIdSet = new Set(createdDiagramIds ?? [])

  for (const relativePath of deletedSplitModelFiles) {
    await deleteOnce(relativePath)
  }

  for (const diagramId of diagramIdsToSave) {
    const nodeOverrides = diagramOverrides.get(diagramId) ?? new Map()
    const relOverrides = relationshipOverrides.get(diagramId)
    const hasNodeOverrides = nodeOverrides.size > 0
    const hasRelOverrides = (relOverrides?.size ?? 0) > 0
    const hasCreations =
      createdObjects.some((item) => item.diagramId === diagramId) ||
      createdRelationships.some((item) => item.diagramId === diagramId) ||
      createdDiagramIdSet.has(diagramId)
    if (
      !hasNodeOverrides &&
      !hasRelOverrides &&
      !dirtyDiagramIds?.has(diagramId) &&
      !hasCreations
    ) {
      continue
    }

    let diagram = await resolveDiagramForSave(model, diagramId)
    const diagramPath =
      diagram?.sourceFile ??
      pendingDiagramPaths.get(diagramId) ??
      buildSplitDiagramRelativePath(diagramId)
    if (!diagram) {
      continue
    }
    if (!diagram.sourceFile) {
      diagram = { ...diagram, sourceFile: diagramPath }
    }
    const originalContent = await fetchSplitModelFile(model.modelRoot!, diagramPath)
    const updated = buildSplitDiagramSaveXml(
      originalContent,
      diagram,
      nodeOverrides,
      relOverrides,
      saveContext,
    )
    if (updated === originalContent) {
      continue
    }
    await writeOnce(diagramPath, updated)
  }

  for (const [relationshipId, meta] of relationshipMetaOverrides) {
    const relationship = model.relationshipById.get(relationshipId)
    if (!relationship?.sourceFile || !relationshipMetaIsDirty(relationship, meta)) {
      continue
    }
    const original = await fetchSplitModelFile(model.modelRoot!, relationship.sourceFile)
    const updated = buildSplitRelationshipSaveXml(original, relationshipId, meta)
    await writeOnce(relationship.sourceFile, updated)
  }

  for (const relationshipId of dirtyRelationshipIds ?? []) {
    const relationship = model.relationshipById.get(relationshipId)
    if (!relationship?.sourceFile) {
      continue
    }
    const original = await fetchSplitModelFile(model.modelRoot!, relationship.sourceFile)
    const updated = buildSplitRelationshipEndpointsSaveXml(
      original,
      relationship,
      model.elementById,
      pendingElementPaths,
    )
    if (updated !== original) {
      await writeOnce(relationship.sourceFile, updated)
    }
  }

  for (const [elementId, override] of elementOverrides) {
    const element = model.elementById.get(elementId)
    if (!element?.sourceFile || !elementOverrideIsDirty(element, override)) {
      continue
    }
    const original = await fetchSplitModelFile(model.modelRoot!, element.sourceFile)
    const updated = buildSplitElementSaveXml(original, element, override)
    await writeOnce(element.sourceFile, updated)
  }

  return {
    ok: true,
    written,
    newElementFiles: Object.fromEntries(pendingElementPaths),
    newRelationshipFiles: Object.fromEntries(pendingRelationshipPaths),
    newDiagramFiles: Object.fromEntries(pendingDiagramPaths),
  }
}
