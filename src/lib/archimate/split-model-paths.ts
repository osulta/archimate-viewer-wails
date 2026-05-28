import type { ParsedElement } from '../../types/model'

export function typeLocalName(type: string): string {
  if (!type) {
    return 'Element'
  }
  const raw = String(type)
  return raw.includes(':') ? raw.split(':').pop()! : raw
}

const LAYER_PREFIX_TO_FOLDER: Record<string, string> = {
  Strategy: 'strategy',
  Business: 'business',
  Application: 'application',
  Technology: 'technology',
  Physical: 'technology',
  Motivation: 'motivation',
  Implementation: 'implementation_migration',
  Migration: 'implementation_migration',
}

export function elementTypeToFolder(type: string): string {
  const local = typeLocalName(type)
  for (const [prefix, folder] of Object.entries(LAYER_PREFIX_TO_FOLDER)) {
    if (local.startsWith(prefix)) {
      return folder
    }
  }
  return 'other'
}

export function buildSplitElementRelativePath(element: { id: string; type: string }): string {
  const folder = elementTypeToFolder(element.type)
  const typeName = typeLocalName(element.type)
  return `${folder}/${typeName}_${element.id}.xml`
}

export function buildSplitRelationshipRelativePath(relationship: { id: string; type: string }): string {
  const typeName = typeLocalName(relationship.type)
  return `relations/${typeName}_${relationship.id}.xml`
}

export function buildSplitFileHref(relativePath: string, id: string): string {
  const fileName = relativePath.replace(/\\/g, '/').split('/').pop() ?? relativePath
  return `${fileName}#${id}`
}

export function resolveElementSourceFile(
  elementById: Map<string, ParsedElement>,
  elementId: string,
  pendingPaths?: Map<string, string>,
): string {
  const pending = pendingPaths?.get(elementId)
  if (pending) {
    return pending
  }
  const element = elementById.get(elementId)
  return element?.sourceFile ?? ''
}
