/**
 * ArchiMate 3.x visual notation registry.
 * Corner cues: square = structure, round = behavior, diagonal = motivation.
 * Layer colors follow the standard palette (tuned for screen readability).
 */

import type { LayerName, LayerStyle, ElementVisualSpec, RelationshipNotation } from '../../types/model'

export const LAYER_STYLES: Record<LayerName, LayerStyle> = {
  business: { fill: '#fff4b8', border: '#8a6d00', header: '#ffe566', text: '#3d3000' },
  application: { fill: '#c0f0fb', border: '#1a1a1a', header: '#a8e8f8', text: '#0d3d4d' },
  technology: { fill: '#c1fba4', border: '#1a1a1a', header: '#a8e8a0', text: '#143d14' },
  physical: { fill: '#c1fba4', border: '#1a1a1a', header: '#a8e8a0', text: '#143d14' },
  motivation: { fill: '#e8d4f8', border: '#5a3080', header: '#d8b8f0', text: '#2a1440' },
  strategy: { fill: '#f0dcc8', border: '#8a5020', header: '#e8c8a0', text: '#4a2810' },
  implementation: { fill: '#f8d0e0', border: '#a03060', header: '#f0b0c8', text: '#501028' },
  composite: { fill: '#f8f8f8', border: '#606060', header: '#ececec', text: '#303030' },
  generic: { fill: '#e8ecf8', border: '#4050a0', header: '#d8dff0', text: '#1a2040' },
}

const ELEMENT_BY_TYPE: Record<string, ElementVisualSpec> = {
  // Business — structure (square)
  BusinessActor: { layer: 'business', shape: 'passive-rect', icon: 'actor' },
  BusinessRole: { layer: 'business', shape: 'passive-rect', icon: 'role' },
  BusinessCollaboration: {
    layer: 'business',
    shape: 'passive-rect',
    icon: 'business-collaboration',
  },
  BusinessInterface: { layer: 'business', shape: 'passive-rect', icon: 'interface' },
  // Business — behavior (round)
  BusinessProcess: { layer: 'business', shape: 'rounded', icon: 'business-process' },
  BusinessFunction: { layer: 'business', shape: 'rounded', icon: 'application-function' },
  BusinessInteraction: { layer: 'business', shape: 'rounded', icon: 'interaction' },
  BusinessEvent: { layer: 'business', shape: 'rounded', icon: 'business-event' },
  BusinessService: { layer: 'business', shape: 'rounded', icon: 'service' },
  // Business — passive (sharp rect + corner icon, ArchiMate 3.x)
  BusinessObject: { layer: 'business', shape: 'passive-rect', icon: 'object' },
  Contract: { layer: 'business', shape: 'passive-rect', icon: 'contract' },
  Product: { layer: 'business', shape: 'passive-rect', icon: 'product' },
  Representation: { layer: 'business', shape: 'object', icon: 'object' },

  // Application
  ApplicationComponent: { layer: 'application', shape: 'passive-rect', icon: 'application-component' },
  ApplicationCollaboration: {
    layer: 'application',
    shape: 'passive-rect',
    icon: 'application-collaboration',
  },
  ApplicationInterface: { layer: 'application', shape: 'passive-rect', icon: 'interface' },
  ApplicationProcess: { layer: 'application', shape: 'rounded', icon: 'business-process' },
  ApplicationFunction: { layer: 'application', shape: 'rounded', icon: 'application-function' },
  ApplicationInteraction: { layer: 'application', shape: 'rounded', icon: 'interaction' },
  ApplicationEvent: { layer: 'application', shape: 'rounded', icon: 'business-event' },
  ApplicationService: { layer: 'application', shape: 'rounded', icon: 'service' },
  DataObject: { layer: 'application', shape: 'passive-rect', icon: 'object' },

  // Technology
  Node: { layer: 'technology', shape: 'cut-corner', icon: 'component' },
  Device: { layer: 'technology', shape: 'passive-rect', icon: 'device' },
  SystemSoftware: { layer: 'technology', shape: 'passive-rect', icon: 'system-software' },
  TechnologyCollaboration: {
    layer: 'technology',
    shape: 'passive-rect',
    icon: 'technology-collaboration',
  },
  TechnologyInterface: { layer: 'technology', shape: 'passive-rect', icon: 'interface' },
  TechnologyProcess: { layer: 'technology', shape: 'rounded', icon: 'business-process' },
  TechnologyFunction: { layer: 'technology', shape: 'rounded', icon: 'application-function' },
  TechnologyInteraction: { layer: 'technology', shape: 'rounded', icon: 'interaction' },
  TechnologyEvent: { layer: 'technology', shape: 'rounded', icon: 'business-event' },
  TechnologyService: { layer: 'technology', shape: 'rounded', icon: 'service' },
  Path: { layer: 'technology', shape: 'passive-rect', icon: 'path' },
  CommunicationNetwork: {
    layer: 'technology',
    shape: 'passive-rect',
    icon: 'communication-network',
  },
  Artifact: { layer: 'technology', shape: 'passive-rect', icon: 'artifact' },

  // Physical
  Equipment: { layer: 'physical', shape: 'passive-rect', icon: 'equipment' },
  Facility: { layer: 'physical', shape: 'passive-rect', icon: 'facility' },
  Material: { layer: 'physical', shape: 'rect', icon: 'object' },
  DistributionNetwork: { layer: 'physical', shape: 'path', icon: 'path' },

  // Motivation (diagonal / special)
  Stakeholder: { layer: 'motivation', shape: 'octagon', icon: 'role' },
  Driver: { layer: 'motivation', shape: 'octagon', icon: 'driver' },
  Assessment: { layer: 'motivation', shape: 'octagon', icon: 'assessment' },
  Goal: { layer: 'motivation', shape: 'octagon', icon: 'motivation' },
  Outcome: { layer: 'motivation', shape: 'octagon', icon: 'outcome' },
  Principle: { layer: 'motivation', shape: 'octagon', icon: 'principle' },
  Requirement: { layer: 'motivation', shape: 'octagon', icon: 'requirement' },
  Constraint: { layer: 'motivation', shape: 'octagon', icon: 'constraint' },
  Value: { layer: 'motivation', shape: 'octagon', icon: 'value' },
  Meaning: { layer: 'motivation', shape: 'octagon', icon: 'meaning' },

  // Strategy
  Resource: { layer: 'strategy', shape: 'passive-rect', icon: 'resource' },
  Capability: { layer: 'strategy', shape: 'rounded', icon: 'capability' },
  ValueStream: { layer: 'strategy', shape: 'rounded', icon: 'value-stream' },
  CourseOfAction: { layer: 'strategy', shape: 'rounded', icon: 'course-of-action' },

  // Implementation & migration
  WorkPackage: { layer: 'implementation', shape: 'rounded', icon: 'work' },
  Deliverable: { layer: 'implementation', shape: 'passive-rect', icon: 'deliverable' },
  ImplementationEvent: { layer: 'implementation', shape: 'rounded', icon: 'business-event' },
  Plateau: { layer: 'implementation', shape: 'passive-rect', icon: 'plateau' },
  Gap: { layer: 'implementation', shape: 'passive-rect', icon: 'gap' },

  // Composite
  Grouping: { layer: 'composite', shape: 'grouping', icon: 'grouping', borderDash: [8, 5] },
  Location: { layer: 'composite', shape: 'passive-rect', icon: 'location' },
  AndJunction: { layer: 'composite', shape: 'and-junction', icon: 'junction' },
  OrJunction: { layer: 'composite', shape: 'junction', icon: 'junction' },
}

const ELEMENT_LAYER_ORDER: LayerName[] = [
  'motivation',
  'strategy',
  'business',
  'application',
  'technology',
  'physical',
  'implementation',
  'composite',
]

const ELEMENT_LAYER_LABELS: Record<string, string> = {
  motivation: 'Motivation',
  strategy: 'Strategy',
  business: 'Business',
  application: 'Application',
  technology: 'Technology',
  physical: 'Physical',
  implementation: 'Implementation & Migration',
  composite: 'Other',
}

function buildElementTypeGroups(): { layer: string; label: string; types: string[] }[] {
  const byLayer = new Map<string, string[]>()
  for (const [typeName, spec] of Object.entries(ELEMENT_BY_TYPE)) {
    const layer = spec.layer
    if (!byLayer.has(layer)) {
      byLayer.set(layer, [])
    }
    byLayer.get(layer)!.push(typeName)
  }
  for (const types of byLayer.values()) {
    types.sort((a, b) => a.localeCompare(b))
  }
  return ELEMENT_LAYER_ORDER.filter((layer) => byLayer.has(layer)).map((layer) => ({
    layer,
    label: ELEMENT_LAYER_LABELS[layer] ?? layer,
    types: byLayer.get(layer) ?? [],
  }))
}

export const ARCHIMATE_ELEMENT_TYPE_GROUPS = buildElementTypeGroups()

function normalizeType(type: string | null | undefined): string {
  if (!type) {
    return ''
  }
  const raw = String(type)
  return raw.includes(':') ? raw.split(':').at(-1)! : raw
}

function inferElementSpec(typeName: string): ElementVisualSpec {
  const t = typeName

  if (/Note$/i.test(t)) {
    return { layer: 'generic', shape: 'passive-rect', icon: 'none', bare: true }
  }
  if (/AndJunction$/i.test(t)) {
    return { layer: 'composite', shape: 'and-junction', icon: 'junction' }
  }
  if (/Junction$/i.test(t)) {
    return { layer: 'composite', shape: 'junction', icon: 'junction' }
  }
  if (/Location/i.test(t)) {
    return { layer: 'composite', shape: 'passive-rect', icon: 'location' }
  }
  if (/Grouping/i.test(t)) {
    return {
      layer: 'composite',
      shape: 'grouping',
      icon: 'grouping',
      borderDash: [8, 5],
    }
  }
  if (/Collaboration/i.test(t)) {
    const layer = /Application/i.test(t) ? 'application' : /Technology/i.test(t) ? 'technology' : 'business'
    if (layer === 'technology') {
      return {
        layer: 'technology',
        shape: 'passive-rect',
        icon: 'technology-collaboration',
      }
    }
    if (layer === 'application') {
      return {
        layer: 'application',
        shape: 'passive-rect',
        icon: 'application-collaboration',
      }
    }
    return {
      layer: 'business',
      shape: 'passive-rect',
      icon: 'business-collaboration',
    }
  }
  if (/Interface$/i.test(t)) {
    const layer: LayerName = /Application/i.test(t) ? 'application' : /Technology/i.test(t) ? 'technology' : 'business'
    if (/BusinessInterface$/i.test(t)) {
      return { layer: 'business', shape: 'passive-rect', icon: 'interface' }
    }
    if (/ApplicationInterface$/i.test(t)) {
      return { layer: 'application', shape: 'passive-rect', icon: 'interface' }
    }
    if (/TechnologyInterface$/i.test(t)) {
      return { layer: 'technology', shape: 'passive-rect', icon: 'interface' }
    }
    return { layer, shape: 'interface', icon: 'interface' }
  }
  if (/BusinessEvent$/i.test(t)) {
    return { layer: 'business', shape: 'rounded', icon: 'business-event' }
  }
  if (/ApplicationEvent$/i.test(t)) {
    return { layer: 'application', shape: 'rounded', icon: 'business-event' }
  }
  if (/TechnologyEvent$/i.test(t)) {
    return { layer: 'technology', shape: 'rounded', icon: 'business-event' }
  }
  if (/Event$/i.test(t)) {
    const layer = inferLayerFromName(t)
    return { layer, shape: 'event', icon: 'event' }
  }
  if (/Service$/i.test(t)) {
    return { layer: inferLayerFromName(t), shape: 'rounded', icon: 'service' }
  }
  if (/BusinessProcess$/i.test(t)) {
    return { layer: 'business', shape: 'rounded', icon: 'business-process' }
  }
  if (/ApplicationProcess$/i.test(t)) {
    return { layer: 'application', shape: 'rounded', icon: 'business-process' }
  }
  if (/TechnologyProcess$/i.test(t)) {
    return { layer: 'technology', shape: 'rounded', icon: 'business-process' }
  }
  if (/ApplicationFunction$/i.test(t)) {
    return { layer: 'application', shape: 'rounded', icon: 'application-function' }
  }
  if (/TechnologyFunction$/i.test(t)) {
    return { layer: 'technology', shape: 'rounded', icon: 'application-function' }
  }
  if (/BusinessFunction$/i.test(t)) {
    return { layer: 'business', shape: 'rounded', icon: 'application-function' }
  }
  if (/Process$/i.test(t) || /Function$/i.test(t)) {
    return { layer: inferLayerFromName(t), shape: 'rounded', icon: /Function/i.test(t) ? 'function' : 'process' }
  }
  if (/BusinessInteraction$/i.test(t)) {
    return { layer: 'business', shape: 'rounded', icon: 'interaction' }
  }
  if (/ApplicationInteraction$/i.test(t)) {
    return { layer: 'application', shape: 'rounded', icon: 'interaction' }
  }
  if (/TechnologyInteraction$/i.test(t)) {
    return { layer: 'technology', shape: 'rounded', icon: 'interaction' }
  }
  if (/Interaction$/i.test(t)) {
    return { layer: inferLayerFromName(t), shape: 'rounded', icon: 'interaction', borderDash: [6, 4] }
  }
  if (/BusinessActor$/i.test(t) || /Actor$/i.test(t)) {
    return { layer: 'business', shape: 'passive-rect', icon: 'actor' }
  }
  if (/Role$/i.test(t)) {
    return { layer: 'business', shape: 'passive-rect', icon: 'role' }
  }
  if (/BusinessObject$/i.test(t)) {
    return { layer: 'business', shape: 'passive-rect', icon: 'object' }
  }
  if (/DataObject$/i.test(t)) {
    return { layer: 'application', shape: 'passive-rect', icon: 'object' }
  }
  if (/Artifact$/i.test(t)) {
    return { layer: 'technology', shape: 'passive-rect', icon: 'artifact' }
  }
  if (/Contract$/i.test(t)) {
    return { layer: 'business', shape: 'passive-rect', icon: 'contract' }
  }
  if (/Product$/i.test(t)) {
    return { layer: 'business', shape: 'passive-rect', icon: 'product' }
  }
  if (/Representation/i.test(t)) {
    return { layer: inferLayerFromName(t), shape: 'object', icon: 'object' }
  }
  if (/Deliverable/i.test(t)) {
    return { layer: 'implementation', shape: 'passive-rect', icon: 'deliverable' }
  }
  if (/Goal|Outcome|Principle|Driver|Assessment|Stakeholder/i.test(t)) {
    if (/Value$/i.test(t)) {
      return { layer: 'motivation', shape: 'octagon', icon: 'value' }
    }
    if (/Stakeholder/i.test(t)) {
      return { layer: 'motivation', shape: 'octagon', icon: 'role' }
    }
    if (/Requirement|Constraint/i.test(t)) {
      return { layer: 'motivation', shape: 'octagon', icon: 'requirement' }
    }
    return { layer: 'motivation', shape: 'octagon', icon: 'motivation' }
  }
  if (/Capability$/i.test(t)) {
    return { layer: 'strategy', shape: 'rounded', icon: 'capability' }
  }
  if (/Resource|ValueStream|CourseOfAction/i.test(t)) {
    return { layer: 'strategy', shape: 'strategy', icon: 'strategy' }
  }
  if (/WorkPackage/i.test(t)) {
    return { layer: 'implementation', shape: 'rounded', icon: 'work' }
  }
  if (/ApplicationComponent$/i.test(t)) {
    return { layer: 'application', shape: 'passive-rect', icon: 'application-component' }
  }
  if (/^Device$/i.test(t)) {
    return { layer: 'technology', shape: 'passive-rect', icon: 'device' }
  }
  if (/Node$/i.test(t)) {
    return { layer: inferLayerFromName(t), shape: 'cut-corner', icon: 'component' }
  }
  if (/Equipment$/i.test(t)) {
    return { layer: 'physical', shape: 'passive-rect', icon: 'equipment' }
  }
  if (/SystemSoftware/i.test(t)) {
    return { layer: 'technology', shape: 'passive-rect', icon: 'system-software' }
  }
  if (/CommunicationNetwork$/i.test(t)) {
    return { layer: 'technology', shape: 'passive-rect', icon: 'communication-network' }
  }
  if (/Path$/i.test(t)) {
    return { layer: 'technology', shape: 'passive-rect', icon: 'path' }
  }
  if (/Facility$/i.test(t)) {
    return { layer: 'physical', shape: 'passive-rect', icon: 'facility' }
  }

  return { layer: inferLayerFromName(t), shape: 'rect', icon: 'generic' }
}

function inferLayerFromName(typeName: string): LayerName {
  if (/(Business|Actor|Role)/i.test(typeName)) return 'business'
  if (/(Application|DataObject)/i.test(typeName)) return 'application'
  if (/(Technology|Node|Device|SystemSoftware|Artifact|Path|Communication)/i.test(typeName)) {
    return 'technology'
  }
  if (/(Equipment|Facility|Material|Distribution|Physical)/i.test(typeName)) return 'physical'
  if (/(Goal|Requirement|Constraint|Principle|Stakeholder|Driver|Assessment|Value|Meaning|Outcome)/i.test(typeName)) {
    return 'motivation'
  }
  if (/(Capability|Resource|ValueStream|CourseOfAction)/i.test(typeName)) return 'strategy'
  if (/(WorkPackage|Deliverable|Plateau|Gap|Implementation|Migration)/i.test(typeName)) return 'implementation'
  return 'generic'
}

const LAYER_GROUP_LABELS: Record<string, string> = {
  business: 'Business',
  application: 'Application',
  technology: 'Technology',
  physical: 'Physical',
  motivation: 'Motivation',
  strategy: 'Strategy',
  implementation: 'Implementation & migration',
  composite: 'Composite',
}

const LAYER_GROUP_ORDER: string[] = [
  'business',
  'application',
  'technology',
  'physical',
  'motivation',
  'strategy',
  'implementation',
  'composite',
]

function elementTypeToLabel(typeName: string): string {
  return typeName.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export const CREATABLE_RELATIONSHIP_TYPE_OPTIONS: { value: string; label: string }[] = (() => {
  const locals = [
    'AccessRelationship',
    'AggregationRelationship',
    'AssignmentRelationship',
    'AssociationRelationship',
    'CompositionRelationship',
    'FlowRelationship',
    'InfluenceRelationship',
    'RealizationRelationship',
    'ServingRelationship',
    'SpecializationRelationship',
    'TriggeringRelationship',
  ]
  return locals
    .map((local) => ({
      value: `archimate:${local}`,
      label: elementTypeToLabel(local),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'))
})()

export const CREATABLE_ELEMENT_TYPE_GROUPS: { layer: string; label: string; options: { value: string; label: string }[] }[] = (() => {
  const byLayer = new Map<string, { value: string; label: string }[]>()
  for (const [typeName, spec] of Object.entries(ELEMENT_BY_TYPE)) {
    const layer = spec.layer
    if (!byLayer.has(layer)) {
      byLayer.set(layer, [])
    }
    byLayer.get(layer)!.push({ value: typeName, label: elementTypeToLabel(typeName) })
  }
  return LAYER_GROUP_ORDER.filter((layer) => byLayer.has(layer)).map((layer) => ({
    layer,
    label: LAYER_GROUP_LABELS[layer] ?? layer,
    options: byLayer.get(layer)!.sort((a, b) => a.label.localeCompare(b.label, 'en')),
  }))
})()

export function getElementVisualSpec(elementType: string): ElementVisualSpec {
  const typeName = normalizeType(elementType)
  const explicit = ELEMENT_BY_TYPE[typeName]
  if (explicit) {
    return explicit
  }
  return inferElementSpec(typeName)
}

export function getElementNotationStyle(elementType: string): LayerStyle {
  const spec = getElementVisualSpec(elementType)
  return LAYER_STYLES[spec.layer] ?? LAYER_STYLES.generic
}

export function getRelationshipNotation(relationshipType: string, options: { accessType?: string | number } = {}): RelationshipNotation {
  const t = normalizeType(relationshipType)
  const suffix = t.endsWith('Relationship') ? t : `${t}Relationship`

  const base: RelationshipNotation = {
    dash: null,
    startMarker: 'none',
    endMarker: 'none',
    width: 1.6,
  }

  if (suffix.endsWith('CompositionRelationship')) {
    return { ...base, startMarker: 'filledDiamond' }
  }
  if (suffix.endsWith('AggregationRelationship')) {
    return { ...base, startMarker: 'hollowDiamond' }
  }
  if (suffix.endsWith('AssignmentRelationship')) {
    return { ...base, startMarker: 'filledCircle', endMarker: 'filledArrow' }
  }
  if (suffix.endsWith('RealizationRelationship')) {
    return { ...base, dash: [6, 5], endMarker: 'hollowTriangle' }
  }
  if (suffix.endsWith('ServingRelationship')) {
    return { ...base, endMarker: 'openArrow' }
  }
  if (suffix.endsWith('AccessRelationship')) {
    const accessMarker = resolveAccessEndMarker(options.accessType)
    return { ...base, dash: [3, 4], endMarker: accessMarker }
  }
  if (suffix.endsWith('InfluenceRelationship')) {
    return { ...base, dash: [4, 5], endMarker: 'openArrow' }
  }
  if (suffix.endsWith('TriggeringRelationship')) {
    return { ...base, endMarker: 'filledArrow' }
  }
  if (suffix.endsWith('FlowRelationship')) {
    return { ...base, dash: [6, 5], endMarker: 'filledArrow' }
  }
  if (suffix.endsWith('SpecializationRelationship')) {
    return { ...base, endMarker: 'hollowTriangle' }
  }
  if (suffix.endsWith('AssociationRelationship')) {
    return base
  }

  if (suffix === 'Relationship') {
    return { ...base, endMarker: 'openArrow' }
  }

  return base
}

function resolveAccessEndMarker(accessType: string | number | null | undefined): string {
  const raw = accessType == null ? '' : String(accessType).toLowerCase()
  if (raw === '2' || raw === 'write') {
    return 'filledArrow'
  }
  if (raw === '3' || raw === 'readwrite') {
    return 'filledArrow'
  }
  return 'openArrow'
}
