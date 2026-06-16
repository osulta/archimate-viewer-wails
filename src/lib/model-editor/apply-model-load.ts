import { parseModelFromLoadPayload } from '../archimate/parsing/index'
import { collectLoadedDiagramNodeIds } from '../archimate/split-model-client'
import type { ModelLoadPayload, ParsedModel } from '../../types/model'

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
    if (d.loaded) {
      d.connections.forEach((c) => connectionIds.add(c.id))
    }
  })

  return {
    parsedModel,
    selectedDiagramId: '',
    originalDiagramNodeIds: collectLoadedDiagramNodeIds(parsedModel.diagrams),
    originalElementIds: new Set(parsedModel.elements.map((e) => e.id)),
    originalRelationshipIds: new Set(parsedModel.relationships.map((r) => r.id)),
    originalConnectionIds: connectionIds,
    loadedXml:
      payload.layout === 'split-files'
        ? ''
        : typeof payload.content === 'string'
          ? payload.content
          : '',
    loadedFilename:
      payload.filename ||
      (payload.layout === 'split-files' ? 'model' : 'model.archimate'),
  }
}

export function failedModelLoadErrorMessage(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : 'Не удалось прочитать файл.'
}
