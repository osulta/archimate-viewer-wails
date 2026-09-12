import type {
  ParsedDiagram,
  Bendpoint,
  RelationshipOverridesMap,
} from '../../../types/model'
import { cloneBendpointMap } from './layout'

export interface BendpointOverrideUpdate {
  nextOverrides: RelationshipOverridesMap
  beforeOverrides: RelationshipOverridesMap
  selectedBendpointIndex?: number | null
}

export function computeRemoveRelationshipBendpoint(
  diagram: ParsedDiagram,
  diagramId: string,
  relationshipRef: string,
  bendpointIndex: number,
  relationshipOverrides: RelationshipOverridesMap,
): BendpointOverrideUpdate | null {
  const currentConnection = diagram.connections.find((c) => c.relationshipRef === relationshipRef)
  if (!currentConnection) {
    return null
  }
  const nextBendpoints = [...(currentConnection.bendpoints ?? [])]
  if (bendpointIndex < 0 || bendpointIndex >= nextBendpoints.length) {
    return null
  }
  nextBendpoints.splice(bendpointIndex, 1)
  const beforeOverrides = cloneBendpointMap(relationshipOverrides)
  const diagramMap = new Map(relationshipOverrides.get(diagramId) ?? new Map())
  diagramMap.set(relationshipRef, nextBendpoints)
  const nextOverrides = new Map(relationshipOverrides)
  nextOverrides.set(diagramId, diagramMap)
  return {
    nextOverrides,
    beforeOverrides,
    selectedBendpointIndex: null,
  }
}

export function computeUpdateRelationshipBendpoint(
  diagram: ParsedDiagram,
  diagramId: string,
  relationshipRef: string,
  bendpointIndex: number,
  bendpoint: Bendpoint,
  relationshipOverrides: RelationshipOverridesMap,
): BendpointOverrideUpdate | null {
  const currentConnection = diagram.connections.find((c) => c.relationshipRef === relationshipRef)
  if (!currentConnection) {
    return null
  }
  const nextBendpoints = [...(currentConnection.bendpoints ?? [])]
  if (!nextBendpoints[bendpointIndex]) {
    return null
  }
  nextBendpoints[bendpointIndex] = bendpoint
  const beforeOverrides = cloneBendpointMap(relationshipOverrides)
  const diagramMap = new Map(relationshipOverrides.get(diagramId) ?? new Map())
  diagramMap.set(relationshipRef, nextBendpoints)
  const nextOverrides = new Map(relationshipOverrides)
  nextOverrides.set(diagramId, diagramMap)
  return { nextOverrides, beforeOverrides }
}

export function computeAddRelationshipBendpoint(
  diagram: ParsedDiagram,
  diagramId: string,
  relationshipRef: string,
  segmentIndex: number,
  bendpoint: Bendpoint,
  relationshipOverrides: RelationshipOverridesMap,
): BendpointOverrideUpdate | null {
  const currentConnection = diagram.connections.find((c) => c.relationshipRef === relationshipRef)
  if (!currentConnection) {
    return null
  }
  const nextBendpoints = [...(currentConnection.bendpoints ?? [])]
  const insertAt = Math.max(0, Math.min(nextBendpoints.length, segmentIndex))
  nextBendpoints.splice(insertAt, 0, bendpoint)
  const beforeOverrides = cloneBendpointMap(relationshipOverrides)
  const diagramMap = new Map(relationshipOverrides.get(diagramId) ?? new Map())
  diagramMap.set(relationshipRef, nextBendpoints)
  const nextOverrides = new Map(relationshipOverrides)
  nextOverrides.set(diagramId, diagramMap)
  return {
    nextOverrides,
    beforeOverrides,
    selectedBendpointIndex: insertAt,
  }
}
