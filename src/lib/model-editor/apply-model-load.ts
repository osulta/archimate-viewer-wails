import { parseModelFromLoadPayload } from '../archimate/parsing/index'
import type { ModelLoadPayload, ParsedDiagram, ParsedModel } from '../../types/model'

function collectAllDiagramNodeIds(diagrams: ParsedDiagram[]): Set<string> {
  const ids = new Set<string>()
  const walk = (nodes: ParsedDiagram['nodes']) => {
    for (const node of nodes) {
      ids.add(node.id)
      if (node.children?.length) {
        walk(node.children)
      }
    }
  }
  for (const diagram of diagrams) {
    walk(diagram.nodes)
  }
  return ids
}

export interface ModelLoadDerivedState {
  parsedModel: ParsedModel
  selectedDiagramId: string
  originalDiagramNodeIds: Set<string>
  originalElementIds: Set<string>
  originalRelationshipIds: Set<string>
  originalConnectionIds: Set<string>
  loadedXml: string
  loadedFilename: string
}

export function deriveModelLoadState(payload: ModelLoadPayload): ModelLoadDerivedState {
  const parsedModel = parseModelFromLoadPayload(payload)

  const connectionIds = new Set<string>()
  parsedModel.diagrams.forEach((d) => {
    d.connections.forEach((c) => connectionIds.add(c.id))
  })

  return {
    parsedModel,
    selectedDiagramId: '',
    originalDiagramNodeIds: collectAllDiagramNodeIds(parsedModel.diagrams),
    originalElementIds: new Set(parsedModel.elements.map((e) => e.id)),
    originalRelationshipIds: new Set(parsedModel.relationships.map((r) => r.id)),
    originalConnectionIds: connectionIds,
    loadedXml: typeof payload.content === 'string' ? payload.content : '',
    loadedFilename: payload.filename || 'model.archimate',
  }
}

export function failedModelLoadErrorMessage(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : 'Не удалось прочитать файл.'
}
