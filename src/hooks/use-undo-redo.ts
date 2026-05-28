import { useCallback, useRef, useState } from 'react'
import type {
  ParsedModel,
  NodeOverride,
  Bendpoint,
  ElementOverride,
  RelationshipMetaOverride,
  CreatedObject,
  CreatedRelationship,
} from '../types/model'

export interface EditSnapshot {
  model: ParsedModel | null
  diagramOverrides: Map<string, Map<string, NodeOverride>>
  relationshipOverrides: Map<string, Map<string, Bendpoint[]>>
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  createdObjects: CreatedObject[]
  createdRelationships: CreatedRelationship[]
  createdDiagramIds: Set<string>
  deletedElementIds: Set<string>
  deletedRelationshipIds: Set<string>
  deletedConnectionIds: Set<string>
  deletedDiagramNodeIds: Set<string>
  selectedDiagramId: string
  selectedElementId: string | null
  selectedRelationshipRef: string | null
}

interface HistoryEntry {
  label: string
  snapshot: EditSnapshot
}

const MAX_HISTORY = 50

export interface UndoRedoControls {
  canUndo: boolean
  canRedo: boolean
  /** Save current state before a mutation. Call this *before* applying changes. */
  saveBeforeMutation: (label: string, currentSnapshot: EditSnapshot) => void
  /** Undo: pass the current state so it can be saved for redo, returns snapshot to restore. */
  undo: (currentSnapshot: EditSnapshot) => EditSnapshot | null
  /** Redo: pass the current state so it can be saved for undo, returns snapshot to restore. */
  redo: (currentSnapshot: EditSnapshot) => EditSnapshot | null
  /** Clear all history (e.g. on model reload). */
  clear: () => void
  undoLabel: string
  redoLabel: string
}

export function useUndoRedo(): UndoRedoControls {
  const undoStackRef = useRef<HistoryEntry[]>([])
  const redoStackRef = useRef<HistoryEntry[]>([])
  const [revision, setRevision] = useState(0)

  const bump = useCallback(() => setRevision((r) => r + 1), [])

  const saveBeforeMutation = useCallback(
    (label: string, currentSnapshot: EditSnapshot) => {
      undoStackRef.current = [
        ...undoStackRef.current.slice(-(MAX_HISTORY - 1)),
        { label, snapshot: currentSnapshot },
      ]
      redoStackRef.current = []
      bump()
    },
    [bump],
  )

  const undo = useCallback(
    (currentSnapshot: EditSnapshot): EditSnapshot | null => {
      const entry = undoStackRef.current.at(-1)
      if (!entry) {
        return null
      }
      undoStackRef.current = undoStackRef.current.slice(0, -1)
      redoStackRef.current = [
        ...redoStackRef.current,
        { label: entry.label, snapshot: currentSnapshot },
      ]
      bump()
      return entry.snapshot
    },
    [bump],
  )

  const redo = useCallback(
    (currentSnapshot: EditSnapshot): EditSnapshot | null => {
      const entry = redoStackRef.current.at(-1)
      if (!entry) {
        return null
      }
      redoStackRef.current = redoStackRef.current.slice(0, -1)
      undoStackRef.current = [
        ...undoStackRef.current,
        { label: entry.label, snapshot: currentSnapshot },
      ]
      bump()
      return entry.snapshot
    },
    [bump],
  )

  const clear = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    bump()
  }, [bump])

  void revision

  return {
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    saveBeforeMutation,
    undo,
    redo,
    clear,
    undoLabel: undoStackRef.current.at(-1)?.label ?? '',
    redoLabel: redoStackRef.current.at(-1)?.label ?? '',
  }
}
