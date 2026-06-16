import type { ParsedModel, ParsedElement, ParsedRelationship, ParsedDiagram } from '../../../../types/model'
import { getName } from '../../xml-utils'
import { createParsedModel } from '../../domain/parsed-model'
import { normalizeDiagramFolderFullPath } from '../../model-folder-tree'
import { getDocumentRootElement, parseXmlDocument, getRootLocalName } from '../xml/parse-xml-document'
import { classifySplitModelFile } from './split-file-classifier'
import { buildFolderPathResolver } from './folder-path-resolver'
import { parseElementFile } from './element-file-parser'
import { parseRelationshipFile } from './relationship-file-parser'
import { parseDiagramFile } from './diagram-file-parser'

export interface SplitModelPayload {
  modelRoot: string
  manifestPath: string
  manifest: string
  files: Array<{ relativePath: string; content: string }>
}

export function parseSplitModel(payload: SplitModelPayload): ParsedModel {
  const { manifest, files, modelRoot, manifestPath } = payload

  if (!manifest?.trim()) {
    throw new Error('Отсутствует manifest (model/folder.xml) для split-модели.')
  }

  const manifestDoc = parseXmlDocument(manifest)
  const manifestRoot = getDocumentRootElement(manifestDoc)
  const modelName = getName(manifestRoot) || 'ArchiMate model'

  const branchName = 'Views'
  const { resolveFolderPath, folderMaps } = buildFolderPathResolver(files, branchName)

  const elements: ParsedElement[] = []
  const relationships: ParsedRelationship[] = []
  const diagrams: ParsedDiagram[] = []
  const diagramFolderPaths = new Set<string>()

  for (const file of files) {
    const relativePath = file.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
    let rootLocalName = ''
    try {
      const doc = parseXmlDocument(file.content)
      rootLocalName = getRootLocalName(getDocumentRootElement(doc))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Не удалось разобрать ${relativePath}: ${message}`)
    }

    const category = classifySplitModelFile(relativePath, rootLocalName)
    const folderPath = resolveFolderPath(relativePath)
    const normalizedFolderPath = folderPath
      ? normalizeDiagramFolderFullPath(folderPath, branchName)
      : ''

    if (category === 'manifest' || category === 'folder') {
      if (category === 'folder' && relativePath.startsWith('diagrams/') && normalizedFolderPath) {
        diagramFolderPaths.add(normalizedFolderPath)
      }
      continue
    }

    if (category === 'element') {
      const element = parseElementFile(file.content, relativePath, normalizedFolderPath || folderPath)
      if (element) {
        elements.push(element)
      }
      continue
    }

    if (category === 'relationship') {
      relationships.push(parseRelationshipFile(file.content, relativePath))
      continue
    }

    if (category === 'diagram') {
      const diagram = parseDiagramFile(file.content, relativePath, normalizedFolderPath || folderPath)
      if (diagram) {
        diagrams.push(diagram)
      }
    }
  }

  return createParsedModel({
    modelName,
    format: 'split-files',
    elements,
    relationships,
    diagrams,
    diagramFolderPaths: [...diagramFolderPaths],
    diagramFolderIds: folderMaps.folderIdsByFullPath,
    diagramFolderSourceFiles: folderMaps.folderSourceFilesByFullPath,
    modelRoot,
    manifestPath,
  })
}
