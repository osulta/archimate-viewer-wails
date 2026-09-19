import type {
  DiagramNode,
  ParsedModel,
  DiagramOverridesMap,
} from '../../../types/model'
import type { XmlElementIndex } from '../xml-document-cache'
import {
  buildXmlElementIndex,
  elementsForId,
  findFirstByLocalName,
} from '../xml-document-cache'
import { serializeArchimateXml } from '../archi-xml-serialize'
import { generateArchimateModelId } from '../model-id'
import { inferDiagramsBranchName } from '../model-folder-tree'
import { idFromArchimateHref } from '../parsing/xml/href-utils'
import {
  getId,
  getName,
  getType,
  getDirectChildByTag,
  getDirectChildrenByTag,
  applyDiagramObjectVisualToXml,
} from '../xml-utils'
import {
  applyOverridesToNodes,
  flattenNodes,
  formatDiagramCoord,
  isDiagramReferenceNode,
} from '../diagram-model'

function isArchiDiagramModelElement(el: Element): boolean {
  if (el.localName !== 'element') {
    return false
  }
  return String(
    el.getAttribute('xsi:type') ??
      el.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') ??
      '',
  ).includes('ArchimateDiagramModel')
}

export function findArchiDiagramElement(
  allElements: Element[] | XmlElementIndex,
  diagramId: string,
): Element | undefined {
  if (allElements instanceof Map) {
    return elementsForId(allElements, diagramId).find(isArchiDiagramModelElement)
  }
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

export function findViewDiagramElement(
  allElements: Element[] | XmlElementIndex,
  diagramId: string,
): Element | undefined {
  if (allElements instanceof Map) {
    return elementsForId(allElements, diagramId).find((el) => el.localName === 'view')
  }
  return allElements.find((el) => el.localName === 'view' && getId(el) === diagramId)
}

function resolveIndex(documentNode: Document, index?: XmlElementIndex): XmlElementIndex {
  return index ?? buildXmlElementIndex(documentNode)
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

export function applyDiagramMetadataToXml(
  documentNode: Document,
  model: ParsedModel | null | undefined,
  index?: XmlElementIndex,
): void {
  if (!documentNode || !model?.diagrams?.length) {
    return
  }

  const elementsById = resolveIndex(documentNode, index)

  for (const diagram of model.diagrams) {
    const targets = elementsForId(elementsById, diagram.id).filter((el) => {
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

function ensureArchiFolderPath(parentFolder: Element, documentNode: Document, pathParts: string[]): Element {
  let current = parentFolder
  for (const part of pathParts) {
    const folders = getDirectChildrenByTag(current, 'folder')
    let next = folders.find((folder) => (getName(folder) || '').trim() === part)
    if (!next) {
      next = documentNode.createElement(current.prefix ? `${current.prefix}:folder` : 'folder')
      next.setAttribute('id', generateArchimateModelId())
      next.setAttribute('name', part)
      current.appendChild(next)
    }
    current = next
  }
  return current
}

export function ensureDiagramFoldersInXml(
  documentNode: Document,
  model: ParsedModel,
  folderPaths: Iterable<string> = [],
): void {
  if (!documentNode || model.format !== 'archi-tool') {
    return
  }

  const modelEl = findFirstByLocalName(documentNode, 'model')
  if (!modelEl) {
    return
  }

  const branchName = inferDiagramsBranchName(model.diagrams, folderPaths)
  const viewsRoot = findFirstDiagramsTypedFolder(modelEl)
  if (!viewsRoot) {
    return
  }

  const allPaths = new Set<string>()
  for (const path of folderPaths) {
    const trimmed = String(path ?? '').trim()
    if (trimmed) {
      allPaths.add(trimmed)
    }
  }
  for (const diagram of model.diagrams) {
    const trimmed = String(diagram.folderPath ?? '').trim()
    if (trimmed) {
      allPaths.add(trimmed)
    }
  }

  for (const fullPath of allPaths) {
    const parts = fullPath
      .split(' / ')
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (!parts.length || parts[0] !== branchName) {
      continue
    }
    const nestedParts = parts.slice(1)
    if (!nestedParts.length) {
      continue
    }
    ensureArchiFolderPath(viewsRoot, documentNode, nestedParts)
  }
}

export function ensureCreatedDiagramsInXml(
  documentNode: Document,
  model: ParsedModel,
  createdDiagramIds: Set<string> | Iterable<string>,
  index?: XmlElementIndex,
): void {
  if (!documentNode || !model?.diagrams?.length || !createdDiagramIds) {
    return
  }
  const idList = [...createdDiagramIds]
  if (!idList.length) {
    return
  }

  const modelEl = findFirstByLocalName(documentNode, 'model')
  if (!modelEl) {
    return
  }

  const elementsById = resolveIndex(documentNode, index)

  for (const diagramId of idList) {
    const diagram = model.diagrams.find((d) => d.id === diagramId)
    if (!diagram) {
      continue
    }

    if (model.format === 'archi-tool') {
      const exists = Boolean(findArchiDiagramElement(elementsById, diagram.id))
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

    const existsView = Boolean(findViewDiagramElement(elementsById, diagram.id))
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

function findDiagramObjectByIdInXml(root: Element, nodeId: string, childLocalName: string): Element | null {
  function walk(parent: Element): Element | null {
    for (const child of getDirectChildrenByTag(parent, childLocalName)) {
      if (getId(child) === nodeId) {
        return child
      }
      const nested = walk(child)
      if (nested) {
        return nested
      }
    }
    return null
  }
  return walk(root)
}

function syncArchiDiagramChildrenToXml(
  diagramEl: Element,
  parentEl: Element,
  nodes: DiagramNode[],
  parentAbsX: number,
  parentAbsY: number,
): void {
  for (const node of nodes) {
    const xmlChild = findDiagramObjectByIdInXml(diagramEl, node.id, 'child')
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
      bounds.setAttribute('width', formatDiagramCoord(node.width))
      bounds.setAttribute('height', formatDiagramCoord(node.height))
    }
    applyDiagramObjectVisualToXml(xmlChild, node)
    syncArchiDiagramChildrenToXml(diagramEl, xmlChild, node.children, node.x, node.y)
  }
}

function syncViewDiagramNodesToXml(
  viewEl: Element,
  parentEl: Element,
  nodes: DiagramNode[],
  parentAbsX: number,
  parentAbsY: number,
): void {
  for (const node of nodes) {
    const xmlNode = findDiagramObjectByIdInXml(viewEl, node.id, 'node')
    if (!xmlNode) {
      continue
    }
    if (xmlNode.parentElement !== parentEl) {
      parentEl.appendChild(xmlNode)
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
    syncViewDiagramNodesToXml(viewEl, xmlNode, node.children, node.x, node.y)
  }
}

export function applyDiagramLayoutToXml(
  documentNode: Document,
  model: ParsedModel,
  diagramOverrides: DiagramOverridesMap,
  index?: XmlElementIndex,
): void {
  if (!model?.diagrams?.length || !diagramOverrides?.size) {
    return
  }

  const elementsById = resolveIndex(documentNode, index)

  diagramOverrides.forEach((overrides, diagramId) => {
    if (!overrides?.size) {
      return
    }
    const diagram = model.diagrams.find((item) => item.id === diagramId)
    if (!diagram) {
      return
    }

    const nodes = applyOverridesToNodes(diagram.nodes, overrides)
    const diagramEl = findArchiDiagramElement(elementsById, diagramId)
    if (diagramEl) {
      syncArchiDiagramChildrenToXml(diagramEl, diagramEl, nodes, 0, 0)
      return
    }

    const viewEl = findViewDiagramElement(elementsById, diagramId)
    if (viewEl) {
      syncViewDiagramNodesToXml(viewEl, viewEl, nodes, 0, 0)
    }
  })
}

/** Writes missing Archi DiagramModelReference children (`model` attr) from the in-memory model. */
export function ensureDiagramReferencesInXml(
  documentNode: Document,
  model: ParsedModel,
  index?: XmlElementIndex,
): void {
  if (!model?.diagrams?.length) {
    return
  }
  const elementsById = resolveIndex(documentNode, index)

  for (const diagram of model.diagrams) {
    const refs = flattenNodes(diagram.nodes).filter(
      (node) => isDiagramReferenceNode(node) && Boolean(node.referencedDiagramId),
    )
    if (!refs.length) {
      continue
    }

    const diagramEl = findArchiDiagramElement(elementsById, diagram.id)
    if (diagramEl) {
      for (const node of refs) {
        if (findDiagramObjectByIdInXml(diagramEl, node.id, 'child')) {
          continue
        }
        const childNode = documentNode.createElement(
          diagramEl.prefix ? `${diagramEl.prefix}:child` : 'child',
        )
        childNode.setAttribute('xsi:type', 'archimate:DiagramModelReference')
        childNode.setAttribute('id', node.id)
        childNode.setAttribute('model', node.referencedDiagramId!)
        if (node.label?.trim()) {
          childNode.setAttribute('name', node.label.trim())
        }
        const bounds = documentNode.createElement(
          diagramEl.prefix ? `${diagramEl.prefix}:bounds` : 'bounds',
        )
        bounds.setAttribute('x', formatDiagramCoord(node.x))
        bounds.setAttribute('y', formatDiagramCoord(node.y))
        bounds.setAttribute('width', formatDiagramCoord(node.width))
        bounds.setAttribute('height', formatDiagramCoord(node.height))
        childNode.appendChild(bounds)
        diagramEl.appendChild(childNode)
      }
      continue
    }

    const viewEl = findViewDiagramElement(elementsById, diagram.id)
    if (!viewEl) {
      continue
    }
    for (const node of refs) {
      if (findDiagramObjectByIdInXml(viewEl, node.id, 'node')) {
        continue
      }
      const nodeEl = documentNode.createElement(viewEl.prefix ? `${viewEl.prefix}:node` : 'node')
      nodeEl.setAttribute('identifier', node.id)
      nodeEl.setAttribute('xsi:type', 'Label')
      if (node.label?.trim()) {
        const nameNode = documentNode.createElement(viewEl.prefix ? `${viewEl.prefix}:label` : 'label')
        nameNode.textContent = node.label.trim()
        nodeEl.appendChild(nameNode)
      }
      const viewRef = documentNode.createElement(viewEl.prefix ? `${viewEl.prefix}:viewRef` : 'viewRef')
      viewRef.setAttribute('ref', node.referencedDiagramId!)
      nodeEl.appendChild(viewRef)
      const bounds = documentNode.createElement(viewEl.prefix ? `${viewEl.prefix}:bounds` : 'bounds')
      bounds.setAttribute('x', formatDiagramCoord(node.x))
      bounds.setAttribute('y', formatDiagramCoord(node.y))
      bounds.setAttribute('w', formatDiagramCoord(node.width))
      bounds.setAttribute('h', formatDiagramCoord(node.height))
      nodeEl.appendChild(bounds)
      viewEl.appendChild(nodeEl)
    }
  }
}

export function serializeXml(documentNode: Document): string {
  return serializeArchimateXml(documentNode)
}


function connectionElementRelationshipRef(el: Element): string {
  const attrRef = el.getAttribute('archimateRelationship') ?? el.getAttribute('relationshipRef') ?? ''
  if (attrRef) {
    return attrRef
  }
  const href = getDirectChildByTag(el, 'archimateRelationship')?.getAttribute('href') ?? ''
  return idFromArchimateHref(href)
}

export function removeDeletedFromXml(
  documentNode: Document,
  deletedDiagramNodeIds: Set<string>,
  deletedElementIds: Set<string>,
  deletedRelationshipIds: Set<string>,
  deletedConnectionIds?: Set<string>,
  index?: XmlElementIndex,
): void {
  const nodeSet = deletedDiagramNodeIds
  const elemSet = deletedElementIds
  const relSet = deletedRelationshipIds
  const connSet = deletedConnectionIds ?? new Set<string>()
  if (!nodeSet.size && !elemSet.size && !relSet.size && !connSet.size) {
    return
  }

  const elementsById = resolveIndex(documentNode, index)
  const toRemove: Element[] = []

  const collectByIds = (ids: Set<string>, match: (el: Element) => boolean) => {
    ids.forEach((id) => {
      for (const el of elementsForId(elementsById, id)) {
        if (match(el)) {
          toRemove.push(el)
        }
      }
    })
  }

  collectByIds(
    connSet,
    (el) => el.localName === 'sourceConnection' || el.localName === 'connection',
  )
  collectByIds(
    nodeSet,
    (el) => el.localName === 'child' || el.localName === 'children' || el.localName === 'node',
  )
  collectByIds(relSet, (el) => {
    const ln = el.localName
    const t = getType(el, '')
    return ln === 'relationship' || (ln === 'element' && t.includes('Relationship'))
  })
  collectByIds(elemSet, (el) => {
    const ln = el.localName
    const t = getType(el, '')
    return (
      ln === 'element' &&
      t !== 'archimate:ArchimateDiagramModel' &&
      !t.includes('Relationship')
    )
  })

  for (const el of toRemove) {
    el.parentNode?.removeChild(el)
  }

  if (nodeSet.size) {
    const connEls = documentNode.getElementsByTagName('*')
    for (let i = 0; i < connEls.length; i += 1) {
      const el = connEls[i]
      if (el.localName !== 'connection') {
        continue
      }
      const src = el.getAttribute('source') ?? ''
      const tgt = el.getAttribute('target') ?? ''
      if (nodeSet.has(src) || nodeSet.has(tgt)) {
        el.parentNode?.removeChild(el)
      }
    }
  }

  if (relSet.size) {
    const connectionTags = new Set(['sourceConnection', 'sourceConnections', 'connection'])
    const all = documentNode.getElementsByTagName('*')
    for (let i = 0; i < all.length; i += 1) {
      const el = all[i]
      if (!connectionTags.has(el.localName)) {
        continue
      }
      const relationshipRef = connectionElementRelationshipRef(el)
      if (relationshipRef && relSet.has(relationshipRef)) {
        el.parentNode?.removeChild(el)
      }
    }
  }
}

