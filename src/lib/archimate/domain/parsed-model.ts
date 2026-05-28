import type {
  ModelFormat,
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  ParsedModel,
} from '../../../types/model'

export type {
  ModelFormat,
  ParsedElement,
  ParsedRelationship,
  ParsedDiagram,
  ParsedModel,
} from '../../../types/model'

interface CreateParsedModelInput {
  modelName: string
  format: ModelFormat
  elements: ParsedElement[]
  relationships: ParsedRelationship[]
  diagrams: ParsedDiagram[]
  modelRoot?: string
  manifestPath?: string
  indexes?: {
    elementRefToDiagramIds?: Record<string, string[]>
    relationshipRefToDiagramIds?: Record<string, string[]>
  }
}

export function createParsedModel({
  modelName,
  format,
  elements,
  relationships,
  diagrams,
  modelRoot,
  manifestPath,
  indexes,
}: CreateParsedModelInput): ParsedModel {
  return {
    modelName: modelName || 'ArchiMate model',
    format,
    elements,
    relationships,
    diagrams,
    elementById: new Map(elements.map((item) => [item.id, item])),
    relationshipById: new Map(relationships.map((item) => [item.id, item])),
    modelRoot,
    manifestPath,
    diagramIndexByElementRef: new Map(
      Object.entries(indexes?.elementRefToDiagramIds ?? {}),
    ),
    diagramIndexByRelationshipRef: new Map(
      Object.entries(indexes?.relationshipRefToDiagramIds ?? {}),
    ),
  }
}

export function hydrateParsedModel(
  data: Omit<ParsedModel, 'elementById' | 'relationshipById'> & {
    indexes?: {
      elementRefToDiagramIds?: Record<string, string[]>
      relationshipRefToDiagramIds?: Record<string, string[]>
    }
  },
): ParsedModel {
  return createParsedModel({
    modelName: data.modelName,
    format: data.format,
    elements: data.elements,
    relationships: data.relationships,
    diagrams: data.diagrams,
    modelRoot: data.modelRoot,
    manifestPath: data.manifestPath,
    indexes: data.indexes,
  })
}
