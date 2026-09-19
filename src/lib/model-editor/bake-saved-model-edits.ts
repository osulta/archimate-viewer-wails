import {
  applyConnectionOverride,
  applyOverridesToNodes,
  flattenNodes,
} from '../archimate/diagram-model'
import {
  applyRelationshipMetaToById,
  applyRelationshipMetaToList,
} from '../archimate/relationship-meta'
import type {
  DiagramOverridesMap,
  ElementOverride,
  ParsedModel,
  RelationshipMetaOverride,
  RelationshipOverridesMap,
} from '../../types/model'

export interface BakeSavedModelEditsInput {
  model: ParsedModel
  diagramOverrides: DiagramOverridesMap
  relationshipOverrides: RelationshipOverridesMap
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
}

/**
 * Applies in-memory edit overlays onto the parsed model after a successful disk write.
 * Avoids a full XML re-parse (which freezes the UI on large models, especially on Windows).
 */
export function bakeSavedModelEdits(input: BakeSavedModelEditsInput): ParsedModel {
  const {
    model,
    diagramOverrides,
    relationshipOverrides,
    elementOverrides,
    relationshipMetaOverrides,
  } = input

  const elements = model.elements.map((element) => {
    const override = elementOverrides.get(element.id)
    if (!override) {
      return element
    }
    return {
      ...element,
      name: override.name ?? element.name,
      documentation:
        override.documentation !== undefined ? override.documentation : element.documentation,
      properties: override.properties ?? element.properties,
    }
  })

  const elementById = new Map(elements.map((element) => [element.id, element]))

  const relationships = applyRelationshipMetaToList(model.relationships, relationshipMetaOverrides)
  const relationshipById = applyRelationshipMetaToById(
    model.relationshipById,
    relationshipMetaOverrides,
  )

  const diagrams = model.diagrams.map((diagram) => {
    const nodeOverrides = diagramOverrides.get(diagram.id)
    const connOverrides = relationshipOverrides.get(diagram.id)
    if (!nodeOverrides?.size && !connOverrides?.size) {
      return diagram
    }
    return {
      ...diagram,
      nodes: nodeOverrides?.size
        ? applyOverridesToNodes(diagram.nodes, nodeOverrides)
        : diagram.nodes,
      connections: diagram.connections.map((connection) =>
        applyConnectionOverride(connection, connOverrides?.get(connection.relationshipRef)),
      ),
    }
  })

  return {
    ...model,
    elements,
    elementById,
    relationships,
    relationshipById,
    diagrams,
  }
}

export function collectPersistedIds(model: ParsedModel): {
  originalDiagramNodeIds: Set<string>
  originalElementIds: Set<string>
  originalRelationshipIds: Set<string>
  originalConnectionIds: Set<string>
} {
  const originalDiagramNodeIds = new Set<string>()
  for (const diagram of model.diagrams) {
    for (const node of flattenNodes(diagram.nodes)) {
      originalDiagramNodeIds.add(node.id)
    }
  }
  return {
    originalDiagramNodeIds,
    originalElementIds: new Set(model.elements.map((element) => element.id)),
    originalRelationshipIds: new Set(model.relationships.map((relationship) => relationship.id)),
    originalConnectionIds: new Set(
      model.diagrams.flatMap((diagram) => diagram.connections.map((connection) => connection.id)),
    ),
  }
}
