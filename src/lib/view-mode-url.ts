import type { ParsedModel } from '../types/model'
import type { AppTab } from '../app/types'

/** View mode: `?view=<diagramId>` */
export const VIEW_MODE_DIAGRAM_PARAM = 'view'
/** Modeling mode: `?diagram=<diagramId>` */
export const MODELING_DIAGRAM_PARAM = 'diagram'
export const NAV_ELEMENT_PARAM = 'element'
export const NAV_RELATIONSHIP_PARAM = 'relationship'

export type NavigationModeTab = 'modeling' | 'viewMode'

export interface NavigationUrlState {
  diagramId: string | null
  elementId: string | null
  relationshipId: string | null
  tab?: AppTab
}

export type NavigationHistoryState = {
  nav?: true
  tab?: AppTab
  diagramId?: string | null
  elementId?: string | null
  relationshipId?: string | null
}

function trimParam(params: URLSearchParams, key: string): string | null {
  return params.get(key)?.trim() || null
}

export function getViewModeDiagramIdFromSearch(search: string): string | null {
  return trimParam(new URLSearchParams(search), VIEW_MODE_DIAGRAM_PARAM)
}

export function getViewModeDiagramIdFromLocation(location: Pick<Location, 'search'>): string | null {
  return getViewModeDiagramIdFromSearch(location.search)
}

export function getModelingDiagramIdFromSearch(search: string): string | null {
  return trimParam(new URLSearchParams(search), MODELING_DIAGRAM_PARAM)
}

/**
 * Reads navigation from the URL.
 * `view` → view mode; `diagram` → modeling. If both exist, `view` wins (legacy deep links).
 */
export function readNavigationFromSearch(search: string): NavigationUrlState {
  const params = new URLSearchParams(search)
  const viewDiagramId = trimParam(params, VIEW_MODE_DIAGRAM_PARAM)
  const modelingDiagramId = trimParam(params, MODELING_DIAGRAM_PARAM)
  const elementId = trimParam(params, NAV_ELEMENT_PARAM)
  const relationshipId = trimParam(params, NAV_RELATIONSHIP_PARAM)

  if (viewDiagramId) {
    return {
      diagramId: viewDiagramId,
      elementId,
      relationshipId,
      tab: 'viewMode',
    }
  }

  if (modelingDiagramId || elementId || relationshipId) {
    return {
      diagramId: modelingDiagramId,
      elementId,
      relationshipId,
      tab: 'modeling',
    }
  }

  return {
    diagramId: null,
    elementId: null,
    relationshipId: null,
  }
}

export function readNavigationFromLocation(
  location: Pick<Location, 'search'> = window.location,
): NavigationUrlState {
  return readNavigationFromSearch(location.search)
}

export function readNavigationHistoryState(
  state: unknown,
): NavigationHistoryState | null {
  if (!state || typeof state !== 'object') {
    return null
  }
  const record = state as NavigationHistoryState
  if (!record.nav) {
    return null
  }
  return record
}

export function buildViewModeUrl(diagramId: string, originPathname = '/'): string {
  const params = new URLSearchParams()
  params.set(VIEW_MODE_DIAGRAM_PARAM, diagramId)
  return `${originPathname}?${params.toString()}`
}

export function buildModelingUrl(
  diagramId: string,
  originPathname = '/',
  extras?: { elementId?: string; relationshipId?: string },
): string {
  const params = new URLSearchParams()
  params.set(MODELING_DIAGRAM_PARAM, diagramId)
  if (extras?.elementId) {
    params.set(NAV_ELEMENT_PARAM, extras.elementId)
  }
  if (extras?.relationshipId) {
    params.set(NAV_RELATIONSHIP_PARAM, extras.relationshipId)
  }
  return `${originPathname}?${params.toString()}`
}

function resolveNavigationModeTab(tab: AppTab | undefined): NavigationModeTab | null {
  if (tab === 'viewMode' || tab === 'modeling') {
    return tab
  }
  return null
}

function buildSearchFromNavigation(nav: NavigationUrlState): string {
  const params = new URLSearchParams()
  const mode = resolveNavigationModeTab(nav.tab)

  if (mode === 'viewMode' && nav.diagramId) {
    params.set(VIEW_MODE_DIAGRAM_PARAM, nav.diagramId)
  } else if (mode === 'modeling' && nav.diagramId) {
    params.set(MODELING_DIAGRAM_PARAM, nav.diagramId)
  } else if (!mode && nav.diagramId) {
    // Fallback for callers that omit tab: keep legacy view links.
    params.set(VIEW_MODE_DIAGRAM_PARAM, nav.diagramId)
  }

  if (nav.elementId) {
    params.set(NAV_ELEMENT_PARAM, nav.elementId)
  }
  if (nav.relationshipId) {
    params.set(NAV_RELATIONSHIP_PARAM, nav.relationshipId)
  }

  const text = params.toString()
  return text ? `?${text}` : ''
}

function toHistoryState(nav: NavigationUrlState): NavigationHistoryState {
  return {
    nav: true,
    tab: nav.tab,
    diagramId: nav.diagramId,
    elementId: nav.elementId,
    relationshipId: nav.relationshipId,
  }
}

export function writeNavigationUrl(
  nav: NavigationUrlState,
  mode: 'push' | 'replace' = 'push',
): void {
  const url = new URL(window.location.href)
  url.search = buildSearchFromNavigation(nav)
  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const historyState = toHistoryState(nav)
  if (mode === 'replace') {
    window.history.replaceState(historyState, '', next)
    return
  }
  if (next === current) {
    window.history.replaceState(historyState, '', next)
    return
  }
  window.history.pushState(historyState, '', next)
}

/** @deprecated Prefer writeNavigationUrl — kept for call-site compatibility. */
export function replaceLocationSearch(nextSearch: string): void {
  const url = new URL(window.location.href)
  url.search = nextSearch.startsWith('?') ? nextSearch.slice(1) : nextSearch
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

/** @deprecated Prefer writeNavigationUrl. */
export function setViewModeDiagramInUrl(diagramId: string | null): void {
  writeNavigationUrl(
    {
      diagramId,
      elementId: null,
      relationshipId: null,
      tab: 'viewMode',
    },
    'replace',
  )
}

export function navigationStatesEqual(
  left: NavigationUrlState,
  right: NavigationUrlState,
): boolean {
  return (
    (left.diagramId || null) === (right.diagramId || null) &&
    (left.elementId || null) === (right.elementId || null) &&
    (left.relationshipId || null) === (right.relationshipId || null) &&
    (left.tab || null) === (right.tab || null)
  )
}

export function resolveDiagramIdInModel(model: ParsedModel, idOrName: string): string | null {
  const trimmed = idOrName.trim()
  if (!trimmed) {
    return null
  }
  if (model.diagrams.some((diagram) => diagram.id === trimmed)) {
    return trimmed
  }
  const byName = model.diagrams.find((diagram) => diagram.name === trimmed)
  return byName?.id ?? null
}

export function resolveElementIdInModel(model: ParsedModel, elementId: string): string | null {
  const trimmed = elementId.trim()
  if (!trimmed) {
    return null
  }
  return model.elements.some((element) => element.id === trimmed) ? trimmed : null
}

export function resolveRelationshipIdInModel(
  model: ParsedModel,
  relationshipId: string,
): string | null {
  const trimmed = relationshipId.trim()
  if (!trimmed) {
    return null
  }
  return model.relationships.some((relationship) => relationship.id === trimmed) ? trimmed : null
}
