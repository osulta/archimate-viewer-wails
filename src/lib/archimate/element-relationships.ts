import type { ParsedRelationship, ParsedDiagram, DiagramConnection } from '../../types/model'
import { getRelationshipDisplayLabel } from './relationship-meta'

export interface ElementRelationshipEntry {
  relationship: ParsedRelationship
  direction: 'incoming' | 'outgoing' | 'self'
  otherElementId: string
}

export function collectElementRelationships(
  elementId: string,
  relationships: ParsedRelationship[],
): ElementRelationshipEntry[] {
  if (!elementId || !relationships?.length) {
    return []
  }

  const entries: ElementRelationshipEntry[] = []
  for (const relationship of relationships) {
    const { source, target } = relationship
    if (source === elementId && target === elementId) {
      entries.push({ relationship, direction: 'self', otherElementId: elementId })
    } else if (source === elementId) {
      entries.push({ relationship, direction: 'outgoing', otherElementId: target ?? '' })
    } else if (target === elementId) {
      entries.push({ relationship, direction: 'incoming', otherElementId: source ?? '' })
    }
  }

  const directionOrder: Record<string, number> = { incoming: 0, outgoing: 1, self: 2 }
  return entries.sort((a, b) => {
    const byDir = directionOrder[a.direction] - directionOrder[b.direction]
    if (byDir !== 0) {
      return byDir
    }
    const nameA = getRelationshipDisplayLabel(a.relationship) || a.relationship.id
    const nameB = getRelationshipDisplayLabel(b.relationship) || b.relationship.id
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
  })
}

export function layoutElementRelationshipGraph(
  elementId: string,
  entries: ElementRelationshipEntry[],
  width: number = 320,
  height: number = 220,
): { positions: Map<string, { x: number; y: number }>; width: number; height: number; neighborIds: string[] } {
  const neighborIds: string[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const id = entry.otherElementId
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    neighborIds.push(id)
  }

  const cx = width / 2
  const cy = height / 2
  const radius =
    neighborIds.length === 0 ? 0 : Math.min(width, height) * 0.36

  const positions = new Map<string, { x: number; y: number }>()
  positions.set(elementId, { x: cx, y: cy })

  neighborIds.forEach((id, index) => {
    const angle = (2 * Math.PI * index) / neighborIds.length - Math.PI / 2
    positions.set(id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    })
  })

  return { positions, width, height, neighborIds }
}

export function findDiagramIdForRelationship(
  model: { diagrams: ParsedDiagram[] },
  relationshipId: string,
): string | null {
  if (!model?.diagrams?.length || !relationshipId) {
    return null
  }
  for (const diagram of model.diagrams) {
    if (
      diagram.connections.some((connection: DiagramConnection) => connection.relationshipRef === relationshipId)
    ) {
      return diagram.id
    }
  }
  return null
}
