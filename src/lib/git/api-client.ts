import { apiUrl } from '../api-base'
import { DEFAULT_GIT_WORK_FOLDER } from './git-helpers'

export const isWailsDesktopRuntime =
  typeof window !== 'undefined' && window.location.protocol === 'wails:'

export const apiUnavailableMessage = isWailsDesktopRuntime
  ? 'Локальный API недоступен. Перезапустите приложение.'
  : 'API недоступен. Запустите npm run dev (порт API 5151).'

export function formatApiRequestError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const normalized = raw.toLowerCase()
  const looksLikeInvalidUrl =
    normalized.includes('did not match the expected pattern') ||
    normalized.includes('failed to parse url')

  if (isWailsDesktopRuntime) {
    return looksLikeInvalidUrl
      ? 'Локальный API недоступен (не удалось определить адрес). Перезапустите приложение и попробуйте снова.'
      : raw
  }

  return err instanceof Error ? `${err.message}\nЗапустите npm run dev (API на порту 5151).` : String(err)
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>
}

async function readJsonOrText(response: Response): Promise<{
  data: Record<string, unknown>
  rawText: string
}> {
  const rawText = await response.text()
  let data: Record<string, unknown> = {}
  try {
    data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}
  } catch {
    data = {}
  }
  return { data, rawText }
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function fetchApiHealth(): Promise<{ ok: boolean }> {
  const response = await fetch(apiUrl('/api/health'))
  const data = await readJson(response)
  return { ok: Boolean(data.ok) }
}

export async function fetchGitRepoRoot(): Promise<Record<string, unknown>> {
  const response = await fetch(apiUrl('/api/git/repo-root'))
  return readJson(response)
}

export async function postGitRepoRoot(payload: {
  repoRoot?: string
  reset?: boolean
}): Promise<{ response: Response; data: Record<string, unknown>; rawText: string }> {
  const response = await postJson('/api/git/repo-root', payload)
  const { data, rawText } = await readJsonOrText(response)
  return { response, data, rawText }
}

export async function postGitRepoState(
  workFolder = DEFAULT_GIT_WORK_FOLDER,
): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/repo-state', { workFolder })
  return readJson(response)
}

export async function postGitBranches(body: {
  workFolder?: string
  path?: string
  fetch?: boolean
  pat?: string
}): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/branches', {
    workFolder: DEFAULT_GIT_WORK_FOLDER,
    ...body,
  })
  return readJson(response)
}

export async function postGitSettings(body: {
  remoteUrl?: string
  pat?: string
}): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/settings', {
    workFolder: DEFAULT_GIT_WORK_FOLDER,
    ...body,
  })
  return readJson(response)
}

export async function postGitDeleteRepository(): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/delete-repository', {
    workFolder: DEFAULT_GIT_WORK_FOLDER,
  })
  return readJson(response)
}

export async function postGitClone(body: {
  url: string
  depth?: number
  pat?: string
}): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/clone', {
    workFolder: DEFAULT_GIT_WORK_FOLDER,
    ...body,
  })
  return readJson(response)
}

export async function postGitCheckout(body: {
  path?: string
  workFolder?: string
  branch: string
}): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/checkout', body)
  return readJson(response)
}

export async function postGitPush(body: {
  path?: string
  workFolder?: string
  remote: string
  branch: string
  setUpstream?: boolean
  pat?: string
}): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/push', body)
  return readJson(response)
}

export async function postGitPull(body: {
  path?: string
  workFolder?: string
  remote: string
  pat?: string
}): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/pull', body)
  return readJson(response)
}

export async function postGitCommit(body: {
  path: string
  message: string
}): Promise<Record<string, unknown>> {
  const response = await postJson('/api/git/commit', body)
  return readJson(response)
}

export async function postModelRead(path: string): Promise<{
  response: Response
  data: Record<string, unknown>
}> {
  const response = await postJson('/api/model/read', { path })
  return { response, data: await readJson(response) }
}

export async function postModelWrite(
  path: string,
  content: string,
): Promise<{ response: Response; data: Record<string, unknown> }> {
  const response = await postJson('/api/model/write', { path, content })
  return { response, data: await readJson(response) }
}
