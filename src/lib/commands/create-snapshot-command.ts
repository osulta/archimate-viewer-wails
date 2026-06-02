import type { Command } from './types'

export function createSnapshotCommand(params: {
  label: string
  applyBefore: () => void
  applyAfter: () => void
}): Command {
  const { label, applyBefore, applyAfter } = params
  return {
    label,
    execute: applyAfter,
    undo: applyBefore,
  }
}

