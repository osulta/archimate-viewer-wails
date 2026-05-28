import type { ParsedModel } from '../../../types/model'
import { hydrateParsedModel } from '../domain/parsed-model'
import { parseSingleFileModel } from './single-file/parse-single-file-model'
import { parseSplitModel } from './split-files/parse-split-model'
import type { SplitModelPayload } from './split-files/parse-split-model'

export interface RegistryLoadPayload {
  layout: 'single-file' | 'split-files'
  filename: string
  repoPath?: string
  content?: string
  splitPayload?: SplitModelPayload
  parsedModel?: ParsedModel | Omit<ParsedModel, 'elementById' | 'relationshipById'>
}

export function parseModelFromXml(xmlText: string): ParsedModel {
  return parseSingleFileModel(xmlText)
}

export function parseModelFromSplitFiles(payload: SplitModelPayload): ParsedModel {
  return parseSplitModel(payload)
}

export function parseModelFromLoadPayload(input: RegistryLoadPayload): ParsedModel {
  if (input.layout === 'split-files' && input.parsedModel) {
    return hydrateParsedModel(input.parsedModel)
  }
  if (input.layout === 'split-files' && input.splitPayload) {
    return parseModelFromSplitFiles(input.splitPayload)
  }
  if (typeof input.content === 'string') {
    return parseModelFromXml(input.content)
  }
  throw new Error('Некорректные данные для загрузки модели.')
}
