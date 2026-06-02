export interface Command {
  label: string
  execute: () => void
  undo: () => void
}

