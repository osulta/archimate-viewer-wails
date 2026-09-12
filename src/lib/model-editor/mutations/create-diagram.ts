import { generateArchimateModelId } from '../../archimate/model-id'
import {
  inferDiagramsBranchName,
  resolveDiagramFolderPathFromKey,
} from '../../archimate/model-folder-tree'
import type { ParsedDiagram, ParsedModel } from '../../../types/model'

export interface CreateNewDiagramResult {
  nextModel: ParsedModel
  newDiagram: ParsedDiagram
}

export function computeCreateNewDiagram(
  model: ParsedModel,
  selectedDiagramId: string | null,
  selectedDiagramFolderKey: string | null,
  nameOverride: string,
): CreateNewDiagramResult {
  const name = String(nameOverride ?? '').trim() || 'New view'
  const id = generateArchimateModelId()
  const templateDiagram =
    model.diagrams.find((d) => d.id === selectedDiagramId) ?? model.diagrams[0] ?? null
  const diagramType =
    model.format === 'exchange'
      ? templateDiagram?.type ?? 'archimate:Diagram'
      : 'archimate:ArchimateDiagramModel'
  const branchName = inferDiagramsBranchName(model.diagrams, model.diagramFolderPaths ?? [])
  const targetFolderPath = selectedDiagramFolderKey
    ? resolveDiagramFolderPathFromKey(selectedDiagramFolderKey, branchName)
    : templateDiagram?.folderPath ?? branchName

  const newDiagram: ParsedDiagram = {
    id,
    name,
    type: diagramType,
    folderPath:
      model.format === 'exchange'
        ? undefined
        : model.format === 'archi-tool'
          ? targetFolderPath
          : undefined,
    nodes: [],
    connections: [],
  }

  return {
    nextModel: {
      ...model,
      diagrams: [...model.diagrams, newDiagram],
    },
    newDiagram,
  }
}

export function computeUpdateDiagramMetadata(
  model: ParsedModel,
  diagramId: string,
  patch: Partial<ParsedDiagram>,
): ParsedModel | null {
  if (!diagramId) {
    return null
  }
  const hasPatch = patch && Object.keys(patch).length > 0
  if (!hasPatch) {
    return null
  }
  const current = model.diagrams.find((diagram) => diagram.id === diagramId)
  if (!current) {
    return null
  }
  const nameChanged = patch.name != null && patch.name !== current.name
  if (!nameChanged) {
    return null
  }
  return {
    ...model,
    diagrams: model.diagrams.map((diagram) =>
      diagram.id === diagramId ? { ...diagram, ...patch } : diagram,
    ),
  }
}
