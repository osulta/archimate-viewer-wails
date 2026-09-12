import {
  diagramFolderKeyFromPathParts,
  getDiagramTreePathParts,
  inferDiagramsBranchName,
  resolveDiagramFolderPathFromKey,
  buildRenamedDiagramFolderFullPath,
  remapDiagramFolderFullPath,
  normalizeDiagramFolderFullPath,
} from '../../archimate/model-folder-tree'
import type { ParsedModel } from '../../../types/model'

export interface RenameDiagramFolderResult {
  nextModel: ParsedModel
  oldPath: string
  newPath: string
  nextFolderKey: string
  branchName: string
  wasCreated: boolean
  wasOriginal: boolean
}

export function computeRenameDiagramFolder(
  model: ParsedModel,
  folderKey: string,
  name: string,
  createdDiagramFolderPaths: Set<string>,
  originalDiagramFolderPaths: Set<string>,
): RenameDiagramFolderResult | null {
  if (!folderKey || !name?.trim()) {
    return null
  }
  const branchName = inferDiagramsBranchName(model.diagrams, model.diagramFolderPaths ?? [])
  const oldPath = normalizeDiagramFolderFullPath(
    resolveDiagramFolderPathFromKey(folderKey, branchName),
    branchName,
  )
  const newPath = normalizeDiagramFolderFullPath(
    buildRenamedDiagramFolderFullPath(oldPath, name),
    branchName,
  )
  if (!newPath || newPath === oldPath) {
    return null
  }

  const nextFolderPaths = [
    ...new Set(
      (model.diagramFolderPaths ?? []).map((path) =>
        remapDiagramFolderFullPath(oldPath, newPath, normalizeDiagramFolderFullPath(path, branchName)),
      ),
    ),
  ]
  if (!nextFolderPaths.includes(newPath)) {
    nextFolderPaths.push(newPath)
  }

  const nextDiagrams = model.diagrams.map((diagram) => {
    const folderPath = diagram.folderPath?.trim()
    if (!folderPath) {
      return diagram
    }
    const normalized = normalizeDiagramFolderFullPath(folderPath, branchName)
    const remapped = remapDiagramFolderFullPath(oldPath, newPath, normalized)
    if (remapped === normalized) {
      return diagram
    }
    return { ...diagram, folderPath: remapped }
  })

  const wasCreated = [...createdDiagramFolderPaths].some(
    (path) => normalizeDiagramFolderFullPath(path, branchName) === oldPath,
  )
  const wasOriginal = [...originalDiagramFolderPaths].some(
    (path) => normalizeDiagramFolderFullPath(path, branchName) === oldPath,
  )

  return {
    nextModel: {
      ...model,
      diagramFolderPaths: nextFolderPaths,
      diagrams: nextDiagrams,
    },
    oldPath,
    newPath,
    nextFolderKey: diagramFolderKeyFromPathParts(getDiagramTreePathParts(newPath, branchName)),
    branchName,
    wasCreated,
    wasOriginal,
  }
}

export function remapCreatedDiagramFolderPaths(
  paths: Set<string>,
  oldPath: string,
  newPath: string,
  branchName: string,
): Set<string> {
  const next = new Set<string>()
  for (const path of paths) {
    next.add(
      remapDiagramFolderFullPath(
        oldPath,
        newPath,
        normalizeDiagramFolderFullPath(path, branchName),
      ),
    )
  }
  return next
}

export interface CreateDiagramFolderResult {
  nextModel: ParsedModel
  newPath: string
  folderKey: string
}

export function computeCreateDiagramFolder(
  model: ParsedModel,
  selectedDiagramFolderKey: string | null,
  nameOverride: string,
): CreateDiagramFolderResult | null {
  const name = String(nameOverride ?? '').trim() || 'New folder'
  const branchName = inferDiagramsBranchName(model.diagrams, model.diagramFolderPaths ?? [])
  const parentPath = selectedDiagramFolderKey
    ? resolveDiagramFolderPathFromKey(selectedDiagramFolderKey, branchName)
    : branchName
  const newPath = normalizeDiagramFolderFullPath(
    `${parentPath} / ${name}`.replace(/\s+\/\s+/g, ' / ').trim(),
    branchName,
  )
  const existing = new Set(
    (model.diagramFolderPaths ?? []).map((path) =>
      normalizeDiagramFolderFullPath(path, branchName),
    ),
  )
  if (existing.has(newPath)) {
    return null
  }
  return {
    nextModel: {
      ...model,
      diagramFolderPaths: [...existing, newPath],
    },
    newPath,
    folderKey: diagramFolderKeyFromPathParts(getDiagramTreePathParts(newPath, branchName)),
  }
}
