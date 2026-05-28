import { apiUrl } from '../api-base'
import type { ParsedModel, ParsedDiagram } from '../../types/model'
import { createParsedModel } from './domain/parsed-model'
import { parseArchiMateXml } from './parse-model'
import { parseDiagramFile } from './parsing/split-files/diagram-file-parser'

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

export async function fetchSplitCompareBundleAtRef(
  manifestPath: string,
  ref: string,
  diagramSourceFile: string,
  diagramFolderPath: string = '',
): Promise<ParsedModel> {
  const response = await fetch(apiUrl('/api/git/read-split-compare-bundle'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: manifestPath,
      ref,
      diagramSourceFile,
    }),
  })
  const data = await readJsonOrThrow(response, 'Ошибка загрузки диаграммы из ветки') as Record<string, any>
  if (!data.diagram) {
    throw new Error('Сервер не вернул диаграмму для сравнения')
  }

  const diagram: ParsedDiagram = {
    ...data.diagram,
    folderPath: diagramFolderPath || data.diagram.folderPath || undefined,
    loaded: true,
  }

  return createParsedModel({
    modelName: 'Compare branch',
    format: 'split-files',
    elements: data.elements ?? [],
    relationships: data.relationships ?? [],
    diagrams: [diagram],
    modelRoot: data.modelRoot,
    manifestPath: data.manifestPath,
  })
}

export async function fetchRepoFileContentAtRef(repoRelativePath: string, ref: string): Promise<string> {
  const response = await fetch(apiUrl('/api/git/show-file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: repoRelativePath, ref }),
  })
  const data = await readJsonOrThrow(response, 'Ошибка чтения файла')
  if (typeof data.content !== 'string') {
    throw new Error('Пустой ответ от git show')
  }
  return data.content as string
}

export function parseLoadedCompareDiagram(stub: ParsedDiagram, content: string): ParsedDiagram {
  const parsed = parseDiagramFile(content, stub.sourceFile!, stub.folderPath ?? '')
  if (!parsed) {
    throw new Error(`Не удалось разобрать диаграмму ${stub.sourceFile}`)
  }
  return { ...parsed, loaded: true }
}

export function buildSplitRepoFilePath(modelRoot: string, sourceFile: string): string {
  const root = String(modelRoot ?? '')
    .trim()
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/u, '')
  const rel = String(sourceFile ?? '')
    .trim()
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
  if (!root || !rel) {
    return ''
  }
  return `${root}/${rel}`
}
