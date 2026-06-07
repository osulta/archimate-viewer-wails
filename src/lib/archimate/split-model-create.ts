import type {
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  DiagramNode,
  DiagramConnection,
  ElementProperty,
} from '../../types/model'
import {
  buildSplitElementRelativePath,
  buildSplitRelationshipRelativePath,
  buildSplitFileHref,
  resolveElementSourceFile,
  typeLocalName,
} from './split-model-paths'
import { formatDiagramCoord, isDiagramReferenceNode } from './diagram-model'
import { getDirectChildByTag, getDirectChildrenByTag, getId } from './xml-utils'

function escapeXmlAttr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

function buildSplitElementPropertiesXml(properties: ElementProperty[] | undefined): string {
  return (properties ?? [])
    .filter((prop) => prop.key || prop.value)
    .map(
      (prop) =>
        `  <properties\n` +
        `      key="${escapeXmlAttr(prop.key)}"\n` +
        `      value="${escapeXmlAttr(prop.value ?? '')}"/>\n`,
    )
    .join('')
}

export function buildSplitElementFileContent(element: {
  id: string
  name: string
  type: string
  documentation?: string
  properties?: ElementProperty[]
}): string {
  const typeName = typeLocalName(element.type)
  const name = escapeXmlAttr(element.name || element.id)
  const doc = element.documentation?.trim()
  const propertiesXml = buildSplitElementPropertiesXml(element.properties)
  if (doc || propertiesXml) {
    return (
      `<archimate:${typeName}\n` +
      `    xmlns:archimate="http://www.archimatetool.com/archimate"\n` +
      `    name="${name}"\n` +
      `    id="${element.id}">\n` +
      (doc ? `  <documentation>${escapeXmlAttr(doc)}</documentation>\n` : '') +
      propertiesXml +
      `</archimate:${typeName}>\n`
    )
  }
  return (
    `<archimate:${typeName}\n` +
    `    xmlns:archimate="http://www.archimatetool.com/archimate"\n` +
    `    name="${name}"\n` +
    `    id="${element.id}"/>\n`
  )
}

export function buildSplitRelationshipFileContent(
  relationship: ParsedRelationship,
  elementById: Map<string, ParsedElement>,
  pendingElementPaths: Map<string, string>,
): string {
  const typeName = typeLocalName(relationship.type)
  const sourceEl = elementById.get(relationship.source)
  const targetEl = elementById.get(relationship.target)
  if (!sourceEl || !targetEl) {
    throw new Error(
      `Не найдены элементы для связи ${relationship.id} (source/target).`,
    )
  }

  const sourceFile = resolveElementSourceFile(elementById, relationship.source, pendingElementPaths)
  const targetFile = resolveElementSourceFile(elementById, relationship.target, pendingElementPaths)
  if (!sourceFile || !targetFile) {
    throw new Error(
      `Не удалось определить файлы элементов для связи ${relationship.id}. Сначала сохраните элементы.`,
    )
  }

  const sourceHref = buildSplitFileHref(sourceFile, relationship.source)
  const targetHref = buildSplitFileHref(targetFile, relationship.target)
  const sourceType = typeLocalName(sourceEl.type)
  const targetType = typeLocalName(targetEl.type)
  const nameAttr =
    relationship.name?.trim() ? `    name="${escapeXmlAttr(relationship.name)}"\n` : ''

  return (
    `<archimate:${typeName}\n` +
    `    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n` +
    `    xmlns:archimate="http://www.archimatetool.com/archimate"\n` +
    nameAttr +
    `    id="${relationship.id}">\n` +
    `  <source\n` +
    `      xsi:type="archimate:${sourceType}"\n` +
    `      href="${sourceHref}"/>\n` +
    `  <target\n` +
    `      xsi:type="archimate:${targetType}"\n` +
    `      href="${targetHref}"/>\n` +
    `</archimate:${typeName}>\n`
  )
}

export function buildSplitDiagramFileContent(diagram: { id: string; name: string }): string {
  const name = escapeXmlAttr(diagram.name || diagram.id)
  return (
    `<archimate:ArchimateDiagramModel\n` +
    `    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n` +
    `    xmlns:archimate="http://www.archimatetool.com/archimate"\n` +
    `    name="${name}"\n` +
    `    id="${diagram.id}">\n` +
    `</archimate:ArchimateDiagramModel>\n`
  )
}

export function buildSplitDiagramRelativePath(diagramId: string): string {
  return `diagrams/ArchimateDiagramModel_${diagramId}.xml`
}

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

export function findDiagramXmlObjectById(root: Element, nodeId: string): Element | null {
  function walk(parent: Element): Element | null {
    for (const child of getDiagramObjectXmlChildren(parent)) {
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

function diagramHasConnection(diagramRoot: Element, connectionId: string): boolean {
  function walk(parent: Element): boolean {
    for (const conn of getConnectionXmlChildren(parent)) {
      if (getId(conn) === connectionId) {
        return true
      }
    }
    for (const child of getDiagramObjectXmlChildren(parent)) {
      if (walk(child)) {
        return true
      }
    }
    return false
  }
  return walk(diagramRoot)
}

function createArchimateElementChild(
  documentNode: Document,
  diagramRoot: Element,
  element: ParsedElement,
  sourceFile: string,
): Element {
  const prefix = diagramRoot.prefix
  const archEl = documentNode.createElement(
    prefix ? `${prefix}:archimateElement` : 'archimateElement',
  )
  archEl.setAttribute('xsi:type', element.type)
  archEl.setAttribute('href', buildSplitFileHref(sourceFile, element.id))
  return archEl
}

function createReferencedModelChild(
  documentNode: Document,
  diagramRoot: Element,
  referencedDiagram: ParsedDiagram,
  pendingDiagramPaths: Map<string, string>,
): Element {
  const prefix = diagramRoot.prefix
  const refEl = documentNode.createElement(
    prefix ? `${prefix}:referencedModel` : 'referencedModel',
  )
  refEl.setAttribute('xsi:type', referencedDiagram.type || 'archimate:ArchimateDiagramModel')
  const sourceFile =
    pendingDiagramPaths.get(referencedDiagram.id) ??
    referencedDiagram.sourceFile ??
    buildSplitDiagramRelativePath(referencedDiagram.id)
  refEl.setAttribute('href', buildSplitFileHref(sourceFile, referencedDiagram.id))
  return refEl
}

function appendNodeUnderXmlParent(
  documentNode: Document,
  diagramRoot: Element,
  parentXmlEl: Element,
  node: DiagramNode,
  parentAbsX: number,
  parentAbsY: number,
  elementById: Map<string, ParsedElement>,
  pendingElementPaths: Map<string, string>,
  diagramById: Map<string, ParsedDiagram>,
  pendingDiagramPaths: Map<string, string>,
): void {
  let xmlChild = findDiagramXmlObjectById(diagramRoot, node.id)
  if (!xmlChild) {
    const prefix = parentXmlEl.prefix
    xmlChild = documentNode.createElement(prefix ? `${prefix}:children` : 'children')
    xmlChild.setAttribute('id', node.id)
    if (isDiagramReferenceNode(node)) {
      xmlChild.setAttribute('xsi:type', 'archimate:DiagramModelReference')
    } else {
      xmlChild.setAttribute('xsi:type', 'archimate:DiagramModelArchimateObject')
    }

    const bounds = documentNode.createElement(prefix ? `${prefix}:bounds` : 'bounds')
    bounds.setAttribute('x', formatDiagramCoord(node.x - parentAbsX))
    bounds.setAttribute('y', formatDiagramCoord(node.y - parentAbsY))
    bounds.setAttribute('width', formatDiagramCoord(node.width))
    bounds.setAttribute('height', formatDiagramCoord(node.height))
    xmlChild.appendChild(bounds)

    if (isDiagramReferenceNode(node) && node.referencedDiagramId) {
      const referencedDiagram = diagramById.get(node.referencedDiagramId)
      if (referencedDiagram) {
        xmlChild.appendChild(
          createReferencedModelChild(
            documentNode,
            diagramRoot,
            referencedDiagram,
            pendingDiagramPaths,
          ),
        )
      }
    } else {
      const element = elementById.get(node.elementRef)
      if (element) {
        let sourceFile = resolveElementSourceFile(elementById, element.id, pendingElementPaths)
        if (!sourceFile) {
          sourceFile = buildSplitElementRelativePath(element)
        }
        xmlChild.appendChild(
          createArchimateElementChild(documentNode, parentXmlEl, element, sourceFile),
        )
      }
    }

    parentXmlEl.appendChild(xmlChild)
  } else if (xmlChild.parentElement !== parentXmlEl) {
    parentXmlEl.appendChild(xmlChild)
  }

  for (const nested of node.children ?? []) {
    appendNodeUnderXmlParent(
      documentNode,
      diagramRoot,
      xmlChild,
      nested,
      node.x,
      node.y,
      elementById,
      pendingElementPaths,
      diagramById,
      pendingDiagramPaths,
    )
  }
}

export function appendMissingDiagramNodesToXml(
  diagramRoot: Element,
  nodes: DiagramNode[],
  documentNode: Document,
  elementById: Map<string, ParsedElement>,
  pendingElementPaths: Map<string, string>,
  diagramById: Map<string, ParsedDiagram> = new Map(),
  pendingDiagramPaths: Map<string, string> = new Map(),
): void {
  for (const node of nodes ?? []) {
    appendNodeUnderXmlParent(
      documentNode,
      diagramRoot,
      diagramRoot,
      node,
      0,
      0,
      elementById,
      pendingElementPaths,
      diagramById,
      pendingDiagramPaths,
    )
  }
}

export function appendMissingDiagramConnectionsToXml(
  diagramRoot: Element,
  connections: DiagramConnection[],
  documentNode: Document,
  elementById: Map<string, ParsedElement>,
  relationshipById: Map<string, ParsedRelationship>,
  pendingElementPaths: Map<string, string>,
  pendingRelationshipPaths: Map<string, string>,
): void {
  for (const connection of connections ?? []) {
    if (diagramHasConnection(diagramRoot, connection.id)) {
      continue
    }
    const sourceXml = findDiagramXmlObjectById(diagramRoot, connection.source)
    if (!sourceXml) {
      continue
    }

    const relationship = relationshipById.get(connection.relationshipRef)
    if (!relationship) {
      continue
    }

    const relPath =
      pendingRelationshipPaths.get(relationship.id) ??
      relationship.sourceFile ??
      buildSplitRelationshipRelativePath(relationship)
    const relHref = buildSplitFileHref(relPath, relationship.id)
    const relType = typeLocalName(relationship.type)

    const prefix = sourceXml.prefix
    const connEl = documentNode.createElement(
      prefix ? `${prefix}:sourceConnections` : 'sourceConnections',
    )
    connEl.setAttribute('xsi:type', 'archimate:DiagramModelArchimateConnection')
    connEl.setAttribute('id', connection.id)
    connEl.setAttribute('source', connection.source)
    connEl.setAttribute('target', connection.target)

    const relChild = documentNode.createElement(
      prefix ? `${prefix}:archimateRelationship` : 'archimateRelationship',
    )
    relChild.setAttribute('xsi:type', `archimate:${relType}`)
    relChild.setAttribute('href', relHref)
    connEl.appendChild(relChild)

    sourceXml.appendChild(connEl)
  }
}
