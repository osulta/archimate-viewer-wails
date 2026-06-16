import { apiUrl } from '../api-base'
import type { ParsedModel, ParsedDiagram, ParsedElement } from '../../types/model'
import { createParsedModel, hydrateParsedModel } from './domain/parsed-model'
import { filterConnectionsToExistingRelationships, normalizeRelationshipType } from './diagram-model'
import { parseDiagramFile } from './parsing/split-files/diagram-file-parser'
import { parseElementFile } from './parsing/split-files/element-file-parser'

export async function fetchSplitModelFile(modelRoot: string, relativePath: string): Promise<string> {
  const response = await fetch(apiUrl('/api/model/read-split-file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelRoot, relativePath }),
  })
  const data = await response.json()
  if (!data.ok || typeof data.content !== 'string') {
    throw new Error(data.error || `Ошибка чтения файла (${response.status})`)
  }
  return data.content
}

export function mergeLoadedDiagram(model: ParsedModel, diagramId: string, content: string): ParsedModel {
  const stub = model.diagrams.find((item) => item.id === diagramId)
  if (!stub?.sourceFile) {
    throw new Error(`Диаграмма ${diagramId} не найдена в индексе модели.`)
  }

  const parsed = parseDiagramFile(content, stub.sourceFile, stub.folderPath ?? '')
  if (!parsed) {
    throw new Error(`Не удалось разобрать диаграмму ${stub.sourceFile}`)
  }

  const loadedDiagram: ParsedDiagram = {
    ...parsed,
    loaded: true,
    connections: filterConnectionsToExistingRelationships(parsed.connections, model.relationshipById),
  }
  const diagrams = model.diagrams.map((item) =>
    item.id === diagramId ? loadedDiagram : item,
  )

  const enriched = enrichRelationshipTypesFromDiagram(model, loadedDiagram)

  return createParsedModel({
    modelName: enriched.modelName,
    format: enriched.format,
    elements: enriched.elements,
    relationships: enriched.relationships,
    diagrams,
    diagramFolderPaths: enriched.diagramFolderPaths,
    diagramFolderIds: enriched.diagramFolderIds,
    diagramFolderSourceFiles: enriched.diagramFolderSourceFiles,
    modelRoot: enriched.modelRoot,
    manifestPath: enriched.manifestPath,
    indexes: {
      elementRefToDiagramIds: Object.fromEntries(model.diagramIndexByElementRef ?? []),
      relationshipRefToDiagramIds: Object.fromEntries(
        model.diagramIndexByRelationshipRef ?? [],
      ),
    },
  })
}

function enrichRelationshipTypesFromDiagram(model: ParsedModel, diagram: ParsedDiagram): ParsedModel {
  if (!diagram.connections?.length) {
    return model
  }

  const relationshipById = new Map(model.relationshipById)
  let relationships = model.relationships
  let changed = false

  for (const connection of diagram.connections) {
    const connType = connection.relationshipType?.trim()
    if (!connType || !connection.relationshipRef) {
      continue
    }
    const rel = relationshipById.get(connection.relationshipRef)
    if (!rel) {
      continue
    }
    const local = normalizeRelationshipType(rel.type)
    if (local && local !== 'Relationship') {
      continue
    }
    const updated = { ...rel, type: connType }
    relationshipById.set(connection.relationshipRef, updated)
    relationships = relationships.map((item) =>
      item.id === rel.id ? updated : item,
    )
    changed = true
  }

  if (!changed) {
    return model
  }

  return {
    ...model,
    relationships,
    relationshipById,
  }
}

export function mergeLoadedElement(model: ParsedModel, elementId: string, content: string): ParsedModel {
  const stub = model.elementById.get(elementId)
  if (!stub?.sourceFile) {
    throw new Error(`Элемент ${elementId} не найден в индексе модели.`)
  }

  const parsed = parseElementFile(content, stub.sourceFile, stub.folderPath ?? '')
  if (!parsed) {
    throw new Error(`Не удалось разобрать элемент ${stub.sourceFile}`)
  }

  const fullElement: ParsedElement = { ...parsed, lite: false }
  const elements = model.elements.map((item) => (item.id === elementId ? fullElement : item))
  const elementById = new Map(model.elementById)
  elementById.set(elementId, fullElement)

  return {
    ...model,
    elements,
    elementById,
  }
}

export function isSplitDiagramLoaded(model: ParsedModel, diagramId: string): boolean {
  const diagram = model.diagrams.find((item) => item.id === diagramId)
  return Boolean(diagram?.loaded)
}

export function collectLoadedDiagramNodeIds(diagrams: ParsedDiagram[]): Set<string> {
  const ids = new Set<string>()
  for (const diagram of diagrams) {
    if (!diagram.loaded) {
      continue
    }
    const walk = (nodes: { id: string; children: any[] }[]): void => {
      for (const node of nodes ?? []) {
        ids.add(node.id)
        walk(node.children)
      }
    }
    walk(diagram.nodes)
  }
  return ids
}
