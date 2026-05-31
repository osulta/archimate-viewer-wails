import {
  getDirectChildByTag,
  getDirectChildrenByTag,
  applyDocumentationToElementXml,
  clearConnectionBendpoints,
  appendConnectionBendpoints,
} from '../archimate/xml-utils'
import {
  applyOverridesToNodes,
  findNodeById,
  removeDeletedFromXml,
  serializeXml,
  applyDiagramLayoutToXml,
  applyDiagramMetadataToXml,
  ensureCreatedDiagramsInXml,
  normalizeRelationshipType,
  formatDiagramCoord,
} from '../archimate/diagram-model'
import { isRelationshipModelElement } from '../archimate/relationship-meta'
import { isSplitFilesModel } from './is-split-files-model'
import type {
  ParsedModel,
  NodeOverride,
  Bendpoint,
  ElementOverride,
  RelationshipMetaOverride,
  CreatedObject,
  CreatedRelationship,
} from '../../types/model'

export interface BuildEditedModelXmlParams {
  model: ParsedModel
  loadedXml: string
  diagramOverrides: Map<string, Map<string, NodeOverride>>
  relationshipOverrides: Map<string, Map<string, Bendpoint[]>>
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

export function buildEditedModelXml(params: BuildEditedModelXmlParams): string | null {

    if (!params.model || isSplitFilesModel(params.model)) {
      return null
    }
    if (!params.loadedXml) {
      return null
    }
    const parser = new DOMParser()
    const documentNode = parser.parseFromString(params.loadedXml, 'application/xml')

    ensureCreatedDiagramsInXml(documentNode, params.model, params.createdDiagramIds)

    applyDiagramMetadataToXml(documentNode, params.model)
    applyDiagramLayoutToXml(documentNode, params.model, params.diagramOverrides)

    const allElements = Array.from(documentNode.getElementsByTagName('*'))
    params.relationshipOverrides.forEach((relMap) => {
      relMap.forEach((bendpoints, relationshipRef) => {
        const connectionElements = allElements.filter((el) => {
          const relAttr =
            el.getAttribute('archimateRelationship') ??
            el.getAttribute('relationshipRef') ??
            ''
          return relAttr === relationshipRef
        })
        connectionElements.forEach((el) => {
          clearConnectionBendpoints(el)
          appendConnectionBendpoints(el, documentNode, bendpoints)
        })
      })
    })

    params.relationshipMetaOverrides.forEach((override, relationshipId) => {
      const targets = allElements.filter((el) => {
        const id = el.getAttribute('id') ?? el.getAttribute('identifier') ?? ''
        return id === relationshipId && isRelationshipModelElement(el)
      })
      targets.forEach((el) => {
        if (override.name == null) {
          return
        }
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
      })
    })

    params.elementOverrides.forEach((override, elementId) => {
      const targets = allElements.filter((el) => {
        const id = el.getAttribute('id') ?? el.getAttribute('identifier') ?? ''
        return id === elementId
      })
      targets.forEach((el) => {
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

        if (override.properties) {
          getDirectChildrenByTag(el, 'property').forEach((p) => el.removeChild(p))
          override.properties.forEach((prop) => {
            const propNode = documentNode.createElement(
              el.prefix ? `${el.prefix}:property` : 'property',
            )
            if (prop.key) {
              propNode.setAttribute('key', prop.key)
            }
            propNode.setAttribute('value', prop.value ?? '')
            el.appendChild(propNode)
          })
        }

        if (Object.prototype.hasOwnProperty.call(override, 'documentation')) {
          applyDocumentationToElementXml(el, documentNode, override.documentation)
        }
      })
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
      const all = Array.from(documentNode.getElementsByTagName('*'))

      if (format === 'archi-tool') {
        if (!existingElement) {
          const folderOther =
            all.find(
              (el) =>
                el.localName === 'folder' &&
                (el.getAttribute('type') ?? '') === 'other',
            ) ??
            all.find((el) => el.localName === 'folder')

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
          }
        }

        const diagramEl = all.find(
          (el) =>
            el.localName === 'element' &&
            (el.getAttribute('id') ?? '') === diagramId,
        )
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
        }
      } else {
        if (!existingElement) {
          const elementsContainer = all.find((el) => el.localName === 'elements')
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
          }
        }

        const viewNode = all.find(
          (el) =>
            el.localName === 'view' &&
            (el.getAttribute('identifier') ?? '') === diagramId,
        )
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
        }
      }
    })

    params.createdRelationships.forEach((cr) => {
      const { diagramId, relationship, connection, format } = cr
      const meta = params.relationshipMetaOverrides.get(relationship.id)
      const relationshipToWrite =
        meta?.name != null ? { ...relationship, name: meta.name } : relationship
      const all = Array.from(documentNode.getElementsByTagName('*'))

      if (format === 'archi-tool') {
        const relationsFolder = all.find(
          (el) => el.localName === 'folder' && (el.getAttribute('type') ?? '') === 'relations',
        )
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
        }

        const sourceObj = all.find(
          (el) =>
            el.localName === 'child' && (el.getAttribute('id') ?? '') === connection.source,
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
          sourceObj.appendChild(connNode)
        }
      } else {
        const relContainer = all.find((el) => el.localName === 'relationships')
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
        }

        const viewNode = all.find(
          (el) =>
            el.localName === 'view' && (el.getAttribute('identifier') ?? '') === diagramId,
        )
        if (viewNode) {
          const connEl = documentNode.createElement(
            viewNode.prefix ? `${viewNode.prefix}:connection` : 'connection',
          )
          connEl.setAttribute('identifier', connection.id)
          connEl.setAttribute('relationshipRef', connection.relationshipRef)
          connEl.setAttribute('source', connection.source)
          connEl.setAttribute('target', connection.target)
          viewNode.appendChild(connEl)
        }
      }
    })

    removeDeletedFromXml(
      documentNode,
      params.deletedDiagramNodeIds,
      params.deletedElementIds,
      params.deletedRelationshipIds,
      params.deletedConnectionIds,
    )

    return serializeXml(documentNode)}
