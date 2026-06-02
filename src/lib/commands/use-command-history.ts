import { useCallback, useRef, useState } from 'react'
import type { Command } from './types'

const MAX_HISTORY = 100

export function useCommandHistory() {
  const undoStackRef = useRef<Command[]>([])
  const redoStackRef = useRef<Command[]>([])
  const [, setVersion] = useState(0)

  const refresh = useCallback(() => {
    setVersion((value) => value + 1)
  }, [])

  const pushExecuted = useCallback(
    (command: Command) => {
      undoStackRef.current = [
        ...undoStackRef.current.slice(-(MAX_HISTORY - 1)),
        command,
      ]
      redoStackRef.current = []
      refresh()
    },
    [refresh],
  )

  const undo = useCallback(() => {
    const command = undoStackRef.current.at(-1)
    if (!command) {
      return
    }
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    command.undo()
    redoStackRef.current = [...redoStackRef.current, command]
    refresh()
  }, [refresh])

  const redo = useCallback(() => {
    const command = redoStackRef.current.at(-1)
    if (!command) {
      return
    }
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    command.execute()
    undoStackRef.current = [...undoStackRef.current, command]
    refresh()
  }, [refresh])

  const clear = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    refresh()
  }, [refresh])

  return {
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    undoLabel: undoStackRef.current.at(-1)?.label ?? '',
    redoLabel: redoStackRef.current.at(-1)?.label ?? '',
    pushExecuted,
    undo,
    redo,
    clear,
  }
}

