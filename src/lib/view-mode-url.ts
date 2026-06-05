import type { ParsedModel } from '../types/model'

/** Query param: `?view=<diagramId>` opens view mode with that diagram. */
export const VIEW_MODE_DIAGRAM_PARAM = 'view'

export function getViewModeDiagramIdFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(VIEW_MODE_DIAGRAM_PARAM)?.trim()
  return raw || null
}

export function getViewModeDiagramIdFromLocation(location: Pick<Location, 'search'>): string | null {
  return getViewModeDiagramIdFromSearch(location.search)
}

export function buildViewModeUrl(diagramId: string, originPathname = '/'): string {
  const params = new URLSearchParams()
  params.set(VIEW_MODE_DIAGRAM_PARAM, diagramId)
  return `${originPathname}?${params.toString()}`
}

export function replaceLocationSearch(nextSearch: string): void {
  const url = new URL(window.location.href)
  url.search = nextSearch
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export function setViewModeDiagramInUrl(diagramId: string | null): void {
  const url = new URL(window.location.href)
  if (diagramId) {
    url.searchParams.set(VIEW_MODE_DIAGRAM_PARAM, diagramId)
  } else {
    url.searchParams.delete(VIEW_MODE_DIAGRAM_PARAM)
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
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
