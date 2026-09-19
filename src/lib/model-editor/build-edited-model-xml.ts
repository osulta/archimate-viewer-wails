import {
  getDirectChildByTag,
  applyDocumentationToElementXml,
  applyPropertiesToElementXml,
  clearConnectionBendpoints,
  appendConnectionBendpoints,
  applyConnectionLineColorToXml,
} from '../archimate/xml-utils'
import {
  applyOverridesToNodes,
  findNodeById,
  normalizeRelationshipType,
  formatDiagramCoord,
} from '../archimate/diagram-model'
import {
  removeDeletedFromXml,
  serializeXml,
  applyDiagramLayoutToXml,
  applyDiagramMetadataToXml,
  ensureCreatedDiagramsInXml,
  ensureDiagramFoldersInXml,
  ensureDiagramReferencesInXml,
  findArchiDiagramElement,
  findViewDiagramElement,
} from '../archimate/serialize/diagram-xml'
import { isRelationshipModelElement } from '../archimate/relationship-meta'
import {
  buildXmlDocumentCache,
  buildXmlElementIndex,
  cloneXmlDocumentCache,
  elementsForId,
  indexElements,
  resolveXmlDocumentContainers,
  type XmlDocumentCache,
} from '../archimate/xml-document-cache'
import type {
  ParsedModel,
  NodeOverride,
  ConnectionOverride,
  ElementOverride,
  RelationshipMetaOverride,
  CreatedObject,
  CreatedRelationship,
} from '../../types/model'

export interface BuildEditedModelXmlParams {
  model: ParsedModel
  loadedXml: string
  /** Prefer this over re-parsing loadedXml when available. */
  baseDocumentCache?: XmlDocumentCache | null
  diagramOverrides: Map<string, Map<string, NodeOverride>>
  relationshipOverrides: Map<string, Map<string, ConnectionOverride>>
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  createdObjects: CreatedObject[]
  createdRelationships: CreatedRelationship[]
  createdDiagramIds: Set<string>
  deletedDiagramNodeIds: Set<string>
  deletedElementIds: Set<string>
  deletedRelationshipIds: Set<string>
  deletedConnectionIds: Set<string>
}

export interface BuildEditedModelXmlResult {
  xml: string
  documentCache: XmlDocumentCache
}

function applyMetaToElement(
  documentNode: Document,
  el: Element,
  override: {
    name?: string | null
    properties?: ElementOverride['properties']
    documentation?: string | null
  },
): void {
  if (override.name != null) {
    if (el.hasAttribute('name')) {
      el.setAttribute('name', override.name)
    } else {
      let nameNode = getDirectChildByTag(el, 'name')
      if (!nameNode) {
        nameNode = documentNode.createElement(el.prefix ? `${el.prefix}:name` : 'name')
        el.insertBefore(nameNode, el.firstChild)
      }
      nameNode.textContent = override.name
    }
  }

  if (Object.prototype.hasOwnProperty.call(override, 'properties')) {
    applyPropertiesToElementXml(el, documentNode, override.properties ?? [])
  }

  if (Object.prototype.hasOwnProperty.call(override, 'documentation')) {
    applyDocumentationToElementXml(el, documentNode, override.documentation)
  }
}

export function buildEditedModelXml(
  params: BuildEditedModelXmlParams,
): BuildEditedModelXmlResult | null {
  if (!params.model) {
    return null
  }

  let working: XmlDocumentCache | null = null
  if (params.baseDocumentCache?.document) {
    working = cloneXmlDocumentCache(params.baseDocumentCache)
  } else if (params.loadedXml) {
    working = buildXmlDocumentCache(params.loadedXml)
  }
  if (!working) {
    return null
  }

  const documentNode = working.document
  let elementsById = working.elementsById
  const containers = resolveXmlDocumentContainers(documentNode)

  ensureDiagramFoldersInXml(documentNode, params.model, params.model.diagramFolderPaths ?? [])
  ensureCreatedDiagramsInXml(documentNode, params.model, params.createdDiagramIds, elementsById)
  ensureDiagramReferencesInXml(documentNode, params.model, elementsById)
  // Folders / new diagrams / diagram refs may add nodes — refresh index once.
  elementsById = buildXmlElementIndex(documentNode)

  applyDiagramMetadataToXml(documentNode, params.model, elementsById)
  applyDiagramLayoutToXml(documentNode, params.model, params.diagramOverrides, elementsById)

  let structuralDirty =
    params.createdDiagramIds.size > 0 ||
    params.createdObjects.length > 0 ||
    params.createdRelationships.length > 0

  params.relationshipMetaOverrides.forEach((override, relationshipId) => {
    const targets = elementsForId(elementsById, relationshipId).filter((el) =>
      isRelationshipModelElement(el),
    )
    targets.forEach((el) => applyMetaToElement(documentNode, el, override))
  })

  params.elementOverrides.forEach((override, elementId) => {
    elementsForId(elementsById, elementId).forEach((el) =>
      applyMetaToElement(documentNode, el, override),
    )
  })

  params.createdObjects.forEach((created) => {
    const { diagramId, element, node, format, existingElement } = created
    const diagram = params.model.diagrams.find((d) => d.id === diagramId)
    const diagramOverrideMap = params.diagramOverrides.get(diagramId)
    const layoutNodes =
      diagram && diagramOverrideMap?.size
        ? applyOverridesToNodes(diagram.nodes, diagramOverrideMap)
        : diagram?.nodes
    const layoutNode = layoutNodes ? findNodeById(layoutNodes, node.id) : null
    const nodeToWrite = layoutNode ?? node
    const elementOverride = params.elementOverrides.get(element.id)
    const elementToWrite = elementOverride
      ? {
          ...element,
          name: elementOverride.name ?? element.name,
          documentation:
            elementOverride.documentation !== undefined
              ? elementOverride.documentation
              : element.documentation,
          properties: elementOverride.properties ?? element.properties,
        }
      : element

    if (format === 'archi-tool') {
      if (!existingElement) {
        const folderOther = containers.folderOther
        if (folderOther) {
          const elNode = documentNode.createElement(
            folderOther.prefix ? `${folderOther.prefix}:element` : 'element',
          )
          elNode.setAttribute('id', elementToWrite.id)
          elNode.setAttribute('name', elementToWrite.name)
          elNode.setAttribute('xsi:type', elementToWrite.type)
          if (elementToWrite.documentation?.trim()) {
            const docNode = documentNode.createElement(
              folderOther.prefix ? `${folderOther.prefix}:documentation` : 'documentation',
            )
            docNode.textContent = elementToWrite.documentation!
            elNode.appendChild(docNode)
          }
          folderOther.appendChild(elNode)
          indexElements(elementsById, elNode)
          structuralDirty = true
        }
      }

      const diagramEl = findArchiDiagramElement(elementsById, diagramId)
      if (diagramEl) {
        const childNode = documentNode.createElement(
          diagramEl.prefix ? `${diagramEl.prefix}:child` : 'child',
        )
        childNode.setAttribute('id', nodeToWrite.id)
        childNode.setAttribute('xsi:type', 'archimate:DiagramObject')
        childNode.setAttribute('archimateElement', elementToWrite.id)
        const bounds = documentNode.createElement(
          diagramEl.prefix ? `${diagramEl.prefix}:bounds` : 'bounds',
        )
        bounds.setAttribute('x', formatDiagramCoord(nodeToWrite.x))
        bounds.setAttribute('y', formatDiagramCoord(nodeToWrite.y))
        bounds.setAttribute('width', formatDiagramCoord(nodeToWrite.width))
        bounds.setAttribute('height', formatDiagramCoord(nodeToWrite.height))
        childNode.appendChild(bounds)
        diagramEl.appendChild(childNode)
        indexElements(elementsById, childNode)
        structuralDirty = true
      }
    } else {
      if (!existingElement) {
        const elementsContainer = containers.elementsContainer
        if (elementsContainer) {
          const elNode = documentNode.createElement(
            elementsContainer.prefix ? `${elementsContainer.prefix}:element` : 'element',
          )
          elNode.setAttribute('identifier', elementToWrite.id)
          elNode.setAttribute('xsi:type', elementToWrite.type)
          const nameNode = documentNode.createElement(
            elementsContainer.prefix ? `${elementsContainer.prefix}:name` : 'name',
          )
          nameNode.textContent = elementToWrite.name
          elNode.appendChild(nameNode)
          if (elementToWrite.documentation?.trim()) {
            const docNode = documentNode.createElement(
              elementsContainer.prefix
                ? `${elementsContainer.prefix}:documentation`
                : 'documentation',
            )
            docNode.textContent = elementToWrite.documentation!
            elNode.appendChild(docNode)
          }
          elementsContainer.appendChild(elNode)
          indexElements(elementsById, elNode)
          structuralDirty = true
        }
      }

      const viewNode = findViewDiagramElement(elementsById, diagramId)
      if (viewNode) {
        const nodeEl = documentNode.createElement(
          viewNode.prefix ? `${viewNode.prefix}:node` : 'node',
        )
        nodeEl.setAttribute('identifier', nodeToWrite.id)
        nodeEl.setAttribute('elementRef', elementToWrite.id)
        nodeEl.setAttribute('xsi:type', 'Node')
        const bounds = documentNode.createElement(
          viewNode.prefix ? `${viewNode.prefix}:bounds` : 'bounds',
        )
        bounds.setAttribute('x', formatDiagramCoord(nodeToWrite.x))
        bounds.setAttribute('y', formatDiagramCoord(nodeToWrite.y))
        bounds.setAttribute('w', formatDiagramCoord(nodeToWrite.width))
        bounds.setAttribute('h', formatDiagramCoord(nodeToWrite.height))
        nodeEl.appendChild(bounds)
        viewNode.appendChild(nodeEl)
        indexElements(elementsById, nodeEl)
        structuralDirty = true
      }
    }
  })

  params.createdRelationships.forEach((cr) => {
    const { diagramId, relationship, connection, format } = cr
    const meta = params.relationshipMetaOverrides.get(relationship.id)
    let relationshipToWrite = relationship
    if (meta) {
      relationshipToWrite = { ...relationship }
      if (meta.name != null) {
        relationshipToWrite.name = meta.name
      }
      if (meta.documentation !== undefined) {
        relationshipToWrite.documentation = meta.documentation
      }
      if (meta.properties) {
        relationshipToWrite.properties = meta.properties
      }
    }

    if (format === 'archi-tool') {
      const relationsFolder = containers.relationsFolder
      if (relationsFolder) {
        const relNode = documentNode.createElement(
          relationsFolder.prefix ? `${relationsFolder.prefix}:element` : 'element',
        )
        relNode.setAttribute('id', relationshipToWrite.id)
        relNode.setAttribute('xsi:type', relationshipToWrite.type)
        if (relationshipToWrite.name) {
          relNode.setAttribute('name', relationshipToWrite.name)
        }
        relNode.setAttribute('source', relationshipToWrite.source)
        relNode.setAttribute('target', relationshipToWrite.target)
        if (normalizeRelationshipType(relationshipToWrite.type).endsWith('AccessRelationship')) {
          relNode.setAttribute('accessType', '1')
        }
        relationsFolder.appendChild(relNode)
        indexElements(elementsById, relNode)
        structuralDirty = true
      }

      const sourceObj = elementsForId(elementsById, connection.source).find(
        (el) => el.localName === 'child',
      )
      if (sourceObj) {
        const connNode = documentNode.createElement(
          sourceObj.prefix ? `${sourceObj.prefix}:sourceConnection` : 'sourceConnection',
        )
        connNode.setAttribute('xsi:type', 'archimate:Connection')
        connNode.setAttribute('id', connection.id)
        connNode.setAttribute('source', connection.source)
        connNode.setAttribute('target', connection.target)
        connNode.setAttribute('archimateRelationship', connection.relationshipRef)
        appendConnectionBendpoints(connNode, documentNode, connection.bendpoints ?? [])
        applyConnectionLineColorToXml(connNode, connection.lineColor)
        sourceObj.appendChild(connNode)
        indexElements(elementsById, connNode)
        structuralDirty = true
      }
    } else {
      const relContainer = containers.relationshipsContainer
      if (relContainer) {
        const relEl = documentNode.createElement(
          relContainer.prefix ? `${relContainer.prefix}:relationship` : 'relationship',
        )
        relEl.setAttribute('identifier', relationshipToWrite.id)
        relEl.setAttribute('xsi:type', relationshipToWrite.type)
        relEl.setAttribute('source', relationshipToWrite.source)
        relEl.setAttribute('target', relationshipToWrite.target)
        if (relationshipToWrite.name) {
          const nameN = documentNode.createElement(
            relContainer.prefix ? `${relContainer.prefix}:name` : 'name',
          )
          nameN.textContent = relationshipToWrite.name
          relEl.appendChild(nameN)
        }
        relContainer.appendChild(relEl)
        indexElements(elementsById, relEl)
        structuralDirty = true
      }

      const viewNode = findViewDiagramElement(elementsById, diagramId)
      if (viewNode) {
        const connEl = documentNode.createElement(
          viewNode.prefix ? `${viewNode.prefix}:connection` : 'connection',
        )
        connEl.setAttribute('identifier', connection.id)
        connEl.setAttribute('relationshipRef', connection.relationshipRef)
        connEl.setAttribute('source', connection.source)
        connEl.setAttribute('target', connection.target)
        viewNode.appendChild(connEl)
        indexElements(elementsById, connEl)
        structuralDirty = true
      }
    }
  })

  // After created connections exist so new links can receive bendpoints in the same save.
  params.relationshipOverrides.forEach((relMap, diagramId) => {
    if (!relMap?.size) {
      return
    }
    const diagramRoot =
      findArchiDiagramElement(elementsById, diagramId) ??
      findViewDiagramElement(elementsById, diagramId)
    if (!diagramRoot) {
      return
    }
    const connectionElements = Array.from(diagramRoot.getElementsByTagName('*')).filter(
      (el) => el.localName === 'sourceConnection' || el.localName === 'connection',
    )
    relMap.forEach((ov, relationshipRef) => {
      connectionElements.forEach((el) => {
        const relAttr =
          el.getAttribute('archimateRelationship') ??
          el.getAttribute('relationshipRef') ??
          ''
        if (relAttr !== relationshipRef) {
          return
        }
        clearConnectionBendpoints(el)
        appendConnectionBendpoints(el, documentNode, ov.bendpoints)
        applyConnectionLineColorToXml(el, ov.lineColor)
      })
    })
  })

  const hasDeletes =
    params.deletedDiagramNodeIds.size > 0 ||
    params.deletedElementIds.size > 0 ||
    params.deletedRelationshipIds.size > 0 ||
    params.deletedConnectionIds.size > 0

  removeDeletedFromXml(
    documentNode,
    params.deletedDiagramNodeIds,
    params.deletedElementIds,
    params.deletedRelationshipIds,
    params.deletedConnectionIds,
    elementsById,
  )

  const documentCache: XmlDocumentCache =
    structuralDirty || hasDeletes
      ? { document: documentNode, elementsById: buildXmlElementIndex(documentNode) }
      : { document: documentNode, elementsById }

  return {
    xml: serializeXml(documentNode),
    documentCache,
  }
}
