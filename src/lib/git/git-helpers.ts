/** Default clone / work-tree folder under GIT_REPO_ROOT (same as Node API). */
export const DEFAULT_GIT_WORK_FOLDER = 'git'

export interface BranchEntry {
  name: string
  local?: boolean
  current?: boolean
}

export interface GitCommandBlock {
  stdout?: string
  stderr?: string
}

export interface GitRepoProbe {
  loaded: boolean
  loading: boolean
  hasDotGit: boolean
  workFolder: string
  remoteUrl: string
  currentBranch: string
}

export interface GitBranchesState {
  loading: boolean
  list: BranchEntry[]
  error: string | null
  defaultBranch: string
}

export interface ReadModelResult {
  ok: boolean
  error?: string
  path?: string
  filename?: string
}

export interface RefreshRepoResult {
  ok: boolean
  modelPath: string
  hasDotGit: boolean
}

export interface RefreshGitRepoOptions {
  /** When true, overwrite the clone URL field from origin (e.g. after GIT_REPO_ROOT change). */
  syncRemoteUrl?: boolean
}

export interface GitCommandResult {
  ok: boolean
  error?: string
  path?: string
}

export function localBranchNameFromRef(ref: string | null | undefined): string {
  const trimmed = String(ref ?? '').trim()
  if (!trimmed) {
    return ''
  }
  const match = trimmed.match(/^origin\/(.+)$/i)
  return match ? match[1] : trimmed
}

export function normalizeBranchName(ref: string | null | undefined): string {
  return localBranchNameFromRef(ref)
}

export function resolveCurrentBranchFromList(
  branches: BranchEntry[],
  probeBranch?: string,
): string {
  const marked = branches.find((branch) => branch.current)
  if (marked) {
    return normalizeBranchName(marked.name)
  }

  const probe = normalizeBranchName(probeBranch)
  if (!probe || probe === 'HEAD') {
    return ''
  }
  if (branches.length === 0) {
    return probe
  }
  if (branches.some((branch) => branch.name === probe)) {
    return probe
  }
  return ''
}

export function preferLocalBranchSelection(
  selected: string | null | undefined,
  branches: BranchEntry[],
  currentBranch?: string,
): string {
  const list = Array.isArray(branches) ? branches : []
  const current = normalizeBranchName(currentBranch)
  if (current && list.some((b) => b.name === current)) {
    return current
  }

  const selectedTrim = normalizeBranchName(selected)
  if (!selectedTrim) {
    return current || ''
  }

  if (list.some((b) => b.name === selectedTrim)) {
    return selectedTrim
  }
  return selectedTrim
}

export function formatGitCommandOutput(
  label: string,
  block: GitCommandBlock | null | undefined,
  fallback = '',
): string {
  const text = [block?.stdout, block?.stderr].filter(Boolean).join('\n').trim()
  if (text) {
    return `${label}:\n${text}`
  }
  return fallback ? `${label}: ${fallback}` : ''
}

export function joinGitCommandOutput(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('\n\n')
}
