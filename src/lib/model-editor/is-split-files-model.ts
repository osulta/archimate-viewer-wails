import type { ParsedModel } from '../../types/model'

export function isSplitFilesModel(currentModel: ParsedModel | null): boolean {
  return currentModel?.format === 'split-files' || Boolean(currentModel?.modelRoot)
}
