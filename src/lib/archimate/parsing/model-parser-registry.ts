import type { ParsedModel } from '../../../types/model'
import { parseSingleFileModel } from './single-file/parse-single-file-model'

export interface RegistryLoadPayload {
  filename: string
  repoPath?: string
  content: string
}

export function parseModelFromXml(xmlText: string): ParsedModel {
  return parseSingleFileModel(xmlText)
}

export function parseModelFromLoadPayload(input: RegistryLoadPayload): ParsedModel {
  if (typeof input.content === 'string') {
    return parseModelFromXml(input.content)
  }
  throw new Error('Некорректные данные для загрузки модели.')
}
