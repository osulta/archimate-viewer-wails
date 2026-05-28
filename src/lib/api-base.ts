/** Base URL for git-api (empty = same origin / Vite proxy in dev). */
let apiBase = ''

export function setApiBase(base: string): void {
  apiBase = String(base ?? '').replace(/\/$/, '')
}

export function getApiBase(): string {
  return apiBase
}

/** `/api/...` — relative in dev (Vite proxy), absolute when Wails sets a base URL. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return apiBase ? `${apiBase}${normalized}` : normalized
}
