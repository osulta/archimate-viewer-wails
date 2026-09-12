import { apiUrl } from '../api-base'
import type { ParsedModel } from '../../types/model'
import { parseArchiMateXml } from './parse-model'

async function readJsonOrThrow(response: Response, fallbackMessage: string): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : `${fallbackMessage} (${response.status})`,
    )
  }
  return data
}

export async function fetchSingleFileModelAtRef(modelPath: string, ref: string): Promise<ParsedModel> {
  const response = await fetch(apiUrl('/api/git/show-file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: modelPath, ref }),
  })
  const data = await readJsonOrThrow(response, 'Ошибка загрузки модели')
  if (typeof data.content !== 'string') {
    throw new Error('Пустой ответ от git show')
  }
  return parseArchiMateXml(data.content as string)
}
