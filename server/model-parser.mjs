/**
 * Серверный адаптер: DOMParser (linkedom) + общие модули парсинга из src/.
 */
import { DOMParser as LinkedomDOMParser } from 'linkedom'
import { parseSplitModel } from '../src/lib/archimate/parsing/split-files/parse-split-model.js'
import {
  createParsedModel,
  hydrateParsedModel as hydrateParsedModelFromDomain,
} from '../src/lib/archimate/domain/parsed-model.js'

if (!globalThis.DOMParser) {
  globalThis.DOMParser = LinkedomDOMParser
}

/**
 * @param {import('../src/lib/archimate/parsing/split-files/parse-split-model.js').SplitModelPayload} payload
 */
export function parseSplitModelOnServer(payload) {
  return parseSplitModel(payload)
}

/**
 * @param {import('../src/lib/archimate/domain/parsed-model.js').ParsedModel} model
 */
export function serializeParsedModel(model) {
  return {
    modelName: model.modelName,
    format: model.format,
    elements: model.elements,
    relationships: model.relationships,
    diagrams: model.diagrams,
    modelRoot: model.modelRoot,
    manifestPath: model.manifestPath,
    indexes: {
      elementRefToDiagramIds: Object.fromEntries(model.diagramIndexByElementRef ?? []),
      relationshipRefToDiagramIds: Object.fromEntries(
        model.diagramIndexByRelationshipRef ?? [],
      ),
    },
  }
}

/**
 * @param {ReturnType<typeof serializeParsedModel>} data
 */
export function hydrateParsedModel(data) {
  return hydrateParsedModelFromDomain(data)
}
