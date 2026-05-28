import type { ParsedRelationship, ParsedElement, RelationshipMetaOverride } from '../../types/model'
import { formatArchimateTypeLabel } from './model-folder-tree'
import { normalizeRelationshipType } from './diagram-model'

function withArchimatePrefix(type: string): string {
  const raw = String(type ?? '').trim()
  if (!raw) {
    return ''
  }
  if (raw.includes(':')) {
    return raw
  }
  const local = normalizeRelationshipType(raw)
  return local ? `archimate:${local}` : ''
}

export function resolveRelationshipTypeForCanvas(
  relationship: { type?: string } | null | undefined,
  connection?: { relationshipType?: string } | null,
): string {
  const modelType = relationship?.type ?? ''
  const modelLocal = normalizeRelationshipType(modelType)
  if (modelLocal && modelLocal !== 'Relationship') {
    return withArchimatePrefix(modelType)
  }
  const connType = connection?.relationshipType ?? ''
  const connLocal = normalizeRelationshipType(connType)
  if (connLocal && connLocal !== 'Relationship') {
    return withArchimatePrefix(connType)
  }
  if (modelType) {
    return withArchimatePrefix(modelType)
  }
  if (connType) {
    return withArchimatePrefix(connType)
  }
  return 'archimate:AssociationRelationship'
}

export function getRelationshipExplicitName(
  relationship: { id?: string; name?: string } | null | undefined,
): string {
  const name = relationship?.name?.trim() ?? ''
  if (!name) {
    return ''
  }
  if (relationship?.id && name === relationship.id) {
    return ''
  }
  return name
}

export function getRelationshipDisplayLabel(
  relationship: { id?: string; name?: string; type?: string } | null | undefined,
  connection?: { relationshipType?: string } | null,
): string {
  const explicit = getRelationshipExplicitName(relationship)
  if (explicit) {
    return explicit
  }
  const typeLabel = formatArchimateTypeLabel(
    resolveRelationshipTypeForCanvas(relationship, connection),
  )
  return typeLabel || ''
}

export function formatRelationshipEndpointLabel(
  elementRef: string | undefined,
  elementById?: Map<string, ParsedElement>,
): string {
  if (!elementRef) {
    return '—'
  }
  const element = elementById?.get(elementRef)
  const name = element?.name?.trim()
  if (name && name !== elementRef) {
    return name
  }
  return elementRef
}

export function applyRelationshipMetaToById(
  relationshipById: Map<string, ParsedRelationship>,
  metaOverrides: Map<string, RelationshipMetaOverride> | null | undefined,
): Map<string, ParsedRelationship> {
  if (!metaOverrides?.size) {
    return relationshipById
  }
  const next = new Map(relationshipById)
  metaOverrides.forEach((meta, id) => {
    const base = next.get(id)
    if (!base || meta.name == null) {
      return
    }
    next.set(id, { ...base, name: meta.name })
  })
  return next
}

export function applyRelationshipMetaToList(
  relationships: ParsedRelationship[],
  metaOverrides: Map<string, RelationshipMetaOverride> | null | undefined,
): ParsedRelationship[] {
  if (!metaOverrides?.size) {
    return relationships
  }
  return relationships.map((rel) => {
    const meta = metaOverrides.get(rel.id)
    if (!meta || meta.name == null) {
      return rel
    }
    return { ...rel, name: meta.name }
  })
}

export function isRelationshipModelElement(el: Element | null): boolean {
  if (!el) {
    return false
  }
  if (el.localName === 'relationship') {
    return true
  }
  if (el.localName !== 'element') {
    return false
  }
  const type =
    el.getAttribute('xsi:type') ??
    el.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') ??
    el.getAttribute('type') ??
    ''
  return type.toLowerCase().includes('relationship')
}
