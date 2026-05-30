import { useRef, useState, useEffect, useCallback } from 'react'
import { apiUrl } from '../lib/api-base'
import { confirmDialog } from '../lib/ui/confirm-dialog'
import { SelectDirectory, isWailsRuntime } from '../../wailsjs/go/main/App'
import type { ModelLoadPayload } from '../types/model'

function localBranchNameFromRef(ref: string | null | undefined): string {
  const trimmed = String(ref ?? '').trim()
  if (!trimmed) {
    return ''
  }
  const match = trimmed.match(/^origin\/(.+)$/i)
  return match ? match[1] : trimmed
}

interface BranchEntry {
  name: string
  local?: boolean
}

function preferLocalBranchSelection(
  selected: string | null | undefined,
  branches: BranchEntry[],
  currentBranch?: string,
): string {
  const list = Array.isArray(branches) ? branches : []
  const current = String(currentBranch ?? '').trim()
  if (current && list.some((b) => b.local && b.name === current)) {
    return current
  }

  const selectedTrim = String(selected ?? '').trim()
  if (!selectedTrim) {
    return current || ''
  }

  const localName = localBranchNameFromRef(selectedTrim)
  const hasLocal = list.some((b) => b.local && b.name === localName)
  if (hasLocal) {
    return localName
  }
  if (list.some((b) => b.name === selectedTrim)) {
    return selectedTrim
  }
  return selectedTrim
}

interface GitRepoProbe {
  loaded: boolean
  loading: boolean
  hasDotGit: boolean
  workFolder: string
  remoteUrl: string
  currentBranch: string
  modelLayout: string
}

interface GitBranchesState {
  loading: boolean
  list: BranchEntry[]
  error: string | null
}

interface ReadModelResult {
  ok: boolean
  error?: string
  path?: string
  filename?: string
  layout?: string
}

interface RefreshRepoResult {
  ok: boolean
  modelPath: string
  modelLayout?: string
  hasDotGit: boolean
}

interface GitCommandResult {
  ok: boolean
  error?: string
  path?: string
}

interface UseGitIntegrationOptions {
  hasModel: boolean
  loadedFilename: string
  getEditedModelXml: () => string | null | undefined
  onModelLoaded: (payload: ModelLoadPayload) => void
  onModelSaved?: (payload: ModelLoadPayload) => void
  onModelParseError: (message: string) => void
  onRepositoryDeleted: () => void
}

const isWailsDesktopRuntime =
  typeof window !== 'undefined' && window.location.protocol === 'wails:'

const apiUnavailableMessage = isWailsDesktopRuntime
  ? 'Локальный API недоступен. Перезапустите приложение.'
  : 'API недоступен. Запустите npm run dev (порт API 5151).'

function formatApiRequestError(err: unknown): string {
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

export function useGitIntegration({
  hasModel,
  loadedFilename,
  getEditedModelXml,
  onModelLoaded,
  onModelSaved,
  onModelParseError,
  onRepositoryDeleted,
}: UseGitIntegrationOptions) {
  const [gitRepoPath, setGitRepoPath] = useState(() =>
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('archimate-git-repo-path') ?? ''
      : '',
  )
  const [gitCommitMessage, setGitCommitMessage] = useState('')
  const [gitCloneUrl, setGitCloneUrl] = useState(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('archimate-git-clone-url') ?? '' : '',
  )
  const [gitCloneShallow, setGitCloneShallow] = useState(false)
  const [gitPushUpstream, setGitPushUpstream] = useState(false)
  const [gitCheckoutBranch, setGitCheckoutBranch] = useState(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('archimate-git-checkout-branch') ?? '' : '',
  )
  const [gitWorkFolder, setGitWorkFolder] = useState(() =>
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('archimate-git-work-folder') ?? 'git'
      : 'git',
  )
  const [gitConfigPat, setGitConfigPat] = useState('')
  const [gitRepoRoot, setGitRepoRoot] = useState('')
  const [gitRepoRootDefault, setGitRepoRootDefault] = useState('')
  const [gitRepoRootInput, setGitRepoRootInput] = useState('')
  const canPickDirectory = isWailsRuntime()
  const [gitRepoProbe, setGitRepoProbe] = useState<GitRepoProbe>({
    loaded: false,
    loading: false,
    hasDotGit: false,
    workFolder: 'git',
    remoteUrl: '',
    currentBranch: '',
    modelLayout: '',
  })
  const [gitBranches, setGitBranches] = useState<GitBranchesState>({ loading: false, list: [], error: null })
  const [gitOutput, setGitOutput] = useState('')
  const [gitCommandLoading, setGitCommandLoading] = useState(false)
  const [gitCommandLabel, setGitCommandLabel] = useState('')
  const [gitApiReady, setGitApiReady] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelLayout, setModelLayout] = useState(() =>
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('archimate-model-layout') ?? 'single-file'
      : 'single-file',
  )

  const gitRepoPathRef = useRef('')
  const modelLayoutRef = useRef('single-file')
  const gitWorkFolderRef = useRef('git')
  const gitConfigPatRef = useRef('')
  const branchesRequestSeqRef = useRef(0)
  gitRepoPathRef.current = gitRepoPath.trim()
  gitWorkFolderRef.current = gitWorkFolder.trim() || 'git'
  gitConfigPatRef.current = gitConfigPat
  modelLayoutRef.current = modelLayout

  const onModelLoadedRef = useRef(onModelLoaded)
  const onModelSavedRef = useRef(onModelSaved)
  const onModelParseErrorRef = useRef(onModelParseError)
  onModelLoadedRef.current = onModelLoaded
  onModelSavedRef.current = onModelSaved
  onModelParseErrorRef.current = onModelParseError

  const withGitCommand = useCallback(async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    setGitCommandLoading(true)
    setGitCommandLabel(label)
    try {
      return await fn()
    } finally {
      setGitCommandLoading(false)
      setGitCommandLabel('')
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem('archimate-git-clone-url', gitCloneUrl)
  }, [gitCloneUrl])

  useEffect(() => {
    sessionStorage.setItem('archimate-git-checkout-branch', gitCheckoutBranch)
  }, [gitCheckoutBranch])

  useEffect(() => {
    sessionStorage.setItem('archimate-git-work-folder', gitWorkFolder)
  }, [gitWorkFolder])

  useEffect(() => {
    const trimmed = gitRepoPath.trim()
    if (trimmed) {
      sessionStorage.setItem('archimate-git-repo-path', trimmed)
    }
  }, [gitRepoPath])

  useEffect(() => {
    sessionStorage.setItem('archimate-model-layout', modelLayout)
  }, [modelLayout])

  const readAndApplyModel = useCallback(async (relPath: string, options: { layout?: string } = {}): Promise<ReadModelResult> => {
    setModelLoading(true)
    try {
    const layout =
      options.layout ??
      modelLayoutRef.current ??
      (relPath.replace(/\\/g, '/').endsWith('model/folder.xml') ? 'split-files' : 'single-file')

    if (layout === 'split-files') {
      const readRes = await fetch(apiUrl('/api/model/read-split-index'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relPath }),
      })
      const readData = await readRes.json()
      if (!readData.ok || !readData.parsedModel) {
        return {
          ok: false,
          error: readData.error || String(readRes.status),
          path: relPath,
        }
      }
      const manifestPath = readData.manifestPath ?? readData.path ?? relPath
      try {
        onModelLoadedRef.current({
          layout: 'split-files',
          parsedModel: readData.parsedModel,
          filename: 'model',
          repoPath: manifestPath,
        })
        setGitRepoPath(manifestPath)
        setModelLayout('split-files')
        return { ok: true, path: manifestPath, filename: 'model', layout: 'split-files' }
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
        onModelParseErrorRef.current(msg)
        return { ok: false, error: msg, path: manifestPath }
      }
    }

    const readRes = await fetch(apiUrl('/api/model/read'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relPath }),
    })
    const readData = await readRes.json()
    if (!readData.ok || typeof readData.content !== 'string') {
      return {
        ok: false,
        error: readData.error || String(readRes.status),
        path: relPath,
      }
    }
    const baseName =
      readData.path.split('/').pop() || relPath.split('/').pop() || 'model.archimate'
    try {
      onModelLoadedRef.current({
        layout: 'single-file',
        content: readData.content,
        filename: baseName,
        repoPath: readData.path,
      })
      setGitRepoPath(readData.path)
      setModelLayout('single-file')
      return { ok: true, path: readData.path, filename: baseName, layout: 'single-file' }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      onModelParseErrorRef.current(msg)
      return { ok: false, error: msg, path: readData.path }
    }
    } finally {
      setModelLoading(false)
    }
  }, [])

  const refreshGitRepoRoot = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch(apiUrl('/api/git/repo-root'))
      const data = await r.json()
      if (data.ok) {
        const root = typeof data.repoRoot === 'string' ? data.repoRoot : ''
        setGitRepoRoot(root)
        setGitRepoRootInput(root)
        setGitRepoRootDefault(
          typeof data.defaultRepoRoot === 'string' ? data.defaultRepoRoot : '',
        )
      }
    } catch {
      // Leave previous values; the info banner already reports API availability.
    }
  }, [])

  const refreshGitRepoState = useCallback(async (): Promise<RefreshRepoResult> => {
    const wf = gitWorkFolder.trim() || 'git'
    setGitRepoProbe((p) => ({ ...p, loading: true }))
    try {
      const r = await fetch(apiUrl('/api/git/repo-state'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workFolder: wf }),
      })
      const data = await r.json()
      if (data.ok) {
        setGitRepoProbe({
          loaded: true,
          loading: false,
          hasDotGit: Boolean(data.hasDotGit),
          workFolder: data.workFolder ?? wf,
          remoteUrl: typeof data.remoteUrl === 'string' ? data.remoteUrl : '',
          currentBranch: typeof data.currentBranch === 'string' ? data.currentBranch : '',
          modelLayout:
            data.modelLayout === 'split-files' || data.modelLayout === 'single-file'
              ? data.modelLayout
              : '',
        })
        if (typeof data.remoteUrl === 'string' && data.remoteUrl) {
          setGitCloneUrl((prev) => (prev.trim() ? prev : data.remoteUrl))
        }
        if (typeof data.modelPath === 'string' && data.modelPath) {
          setGitRepoPath(data.modelPath)
        } else {
          setGitRepoPath('')
        }
        if (data.modelLayout === 'split-files' || data.modelLayout === 'single-file') {
          setModelLayout(data.modelLayout)
        }
        return {
          ok: true,
          modelPath: typeof data.modelPath === 'string' ? data.modelPath : '',
          modelLayout:
            data.modelLayout === 'split-files' || data.modelLayout === 'single-file'
              ? data.modelLayout
              : '',
          hasDotGit: Boolean(data.hasDotGit),
        }
      }
      setGitRepoProbe((p) => ({ ...p, loaded: true, loading: false }))
      return { ok: false, modelPath: '', hasDotGit: false }
    } catch {
      setGitRepoProbe((p) => ({ ...p, loaded: true, loading: false }))
      return { ok: false, modelPath: '', hasDotGit: false }
    }
  }, [gitWorkFolder])

  const loadGitBranches = useCallback(
    async (modelPathOverride?: string, options: { fetch?: boolean } = {}): Promise<void> => {
      const fetchRemote = options.fetch === true
      const run = async (): Promise<void> => {
        const requestId = ++branchesRequestSeqRef.current
        const rel = String(modelPathOverride ?? gitRepoPathRef.current).trim()
        const wf = gitWorkFolderRef.current
        const pat = gitConfigPatRef.current.trim()
        setGitBranches((s) => ({ ...s, loading: true, error: null }))
        try {
          const res = await fetch(apiUrl('/api/git/branches'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workFolder: wf,
              ...(rel ? { path: rel } : {}),
              ...(fetchRemote ? { fetch: true, ...(pat ? { pat } : {}) } : {}),
            }),
          })
          const data = await res.json()
          if (branchesRequestSeqRef.current !== requestId) {
            return
          }
          if (data.ok && Array.isArray(data.branches)) {
            setGitBranches({ loading: false, list: data.branches, error: null })
          } else {
            setGitBranches((s) => ({
              ...s,
              loading: false,
              error: typeof data.error === 'string' ? data.error : 'Ошибка списка веток',
            }))
          }
        } catch (e) {
          if (branchesRequestSeqRef.current !== requestId) {
            return
          }
          setGitBranches((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          }))
        }
      }
      if (fetchRemote) {
        return withGitCommand('Загрузка списка веток…', run)
      }
      return run()
    },
    [withGitCommand],
  )

  useEffect(() => {
    if (!gitRepoProbe.hasDotGit) {
      branchesRequestSeqRef.current += 1
      setGitBranches({ loading: false, list: [], error: null })
    }
  }, [gitRepoProbe.hasDotGit])

  useEffect(() => {
    if (!gitBranches.list.length) {
      return
    }
    const current = gitRepoProbe.currentBranch?.trim() || ''
    const selected = gitCheckoutBranch.trim()
    let next = selected

    if (!selected && current) {
      next = current
    } else if (/^origin\/.+/i.test(selected)) {
      const localName = localBranchNameFromRef(selected)
      const onLocal = current === localName
      const hasLocal = gitBranches.list.some((b) => b.local && b.name === localName)
      if (onLocal && hasLocal) {
        next = localName
      }
    }

    if (next && next !== gitCheckoutBranch) {
      setGitCheckoutBranch(next)
    }
  }, [gitBranches.list, gitRepoProbe.currentBranch, gitCheckoutBranch])

  useEffect(() => {
    if (!gitApiReady || !gitRepoProbe.hasDotGit) {
      return
    }
    void loadGitBranches(undefined, { fetch: false })
  }, [gitApiReady, gitRepoProbe.hasDotGit, gitWorkFolder, gitRepoPath, loadGitBranches])

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const checkHealth = async (): Promise<void> => {
      try {
        const response = await fetch(apiUrl('/api/health'))
        const data = await response.json()
        if (cancelled) {
          return
        }
        const ok = Boolean(data.ok)
        setGitApiReady(ok)
        if (!ok && isWailsDesktopRuntime) {
          timer = window.setTimeout(() => {
            void checkHealth()
          }, 1200)
        }
      } catch {
        if (cancelled) {
          return
        }
        setGitApiReady(false)
        if (isWailsDesktopRuntime) {
          timer = window.setTimeout(() => {
            void checkHealth()
          }, 1200)
        }
      }
    }

    void checkHealth()
    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  useEffect(() => {
    if (!gitApiReady) {
      return
    }
    void refreshGitRepoState()
  }, [gitApiReady, gitWorkFolder, refreshGitRepoState])

  useEffect(() => {
    if (!gitApiReady) {
      return
    }
    void refreshGitRepoRoot()
  }, [gitApiReady, refreshGitRepoRoot])

  useEffect(() => {
    if (!gitApiReady || !gitRepoProbe.loaded || gitRepoProbe.loading) {
      return
    }
    if (!gitRepoProbe.hasDotGit) {
      return
    }
    const relPath = gitRepoPath.trim()
    if (!relPath || hasModel) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const layoutHint =
          gitRepoProbe.modelLayout === 'split-files' || gitRepoProbe.modelLayout === 'single-file'
            ? gitRepoProbe.modelLayout
            : undefined
        const result = await readAndApplyModel(relPath, { layout: layoutHint })
        if (cancelled) {
          return
        }
        if (result.ok) {
          const layoutNote =
            result.layout === 'split-files' ? ' (split XML)' : ''
          setGitOutput(`Модель загружена из репозитория: ${result.path}${layoutNote}`)
        } else if (result.error) {
          setGitOutput(
            result.path
              ? `Файл в репозитории (${result.path}) не разобран как модель: ${result.error}`
              : `Репозиторий найден, но не удалось прочитать модель (${relPath}): ${result.error}`,
          )
        }
      } catch (readErr) {
        if (!cancelled) {
          setGitOutput(
            `Ошибка автозагрузки модели: ${readErr instanceof Error ? readErr.message : String(readErr)}`,
          )
        }
      }
    })()
    return () => {
      cancelled = true
      setModelLoading(false)
    }
  }, [
    gitApiReady,
    gitRepoProbe.loaded,
    gitRepoProbe.loading,
    gitRepoProbe.hasDotGit,
    gitRepoProbe.modelLayout,
    gitRepoPath,
    hasModel,
    readAndApplyModel,
  ])

  const buildRepoModelWriteRelativePath = useCallback((): string | null => {
    const tracked = String(gitRepoPath || '')
      .trim()
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/')
    if (
      tracked &&
      !tracked.split('/').some((segment) => segment === '..' || segment === '.') &&
      (/\.(archimate|xml)$/i.test(tracked) ||
        (modelLayoutRef.current === 'split-files' && /\/folder\.xml$/i.test(tracked)))
    ) {
      return tracked
    }

    if (modelLayoutRef.current === 'split-files') {
      const wfRaw = (gitWorkFolder.trim() || 'git').replace(/^[\\/]+/, '').replace(/\\/g, '/')
      if (!wfRaw || wfRaw.includes('..')) {
        return null
      }
      const wfPrefix = wfRaw.replace(/\/+$/u, '') || 'git'
      return `${wfPrefix}/model/folder.xml`
    }

    const wfRaw = (gitWorkFolder.trim() || 'git').replace(/^[\\/]+/, '').replace(/\\/g, '/')
    if (!wfRaw || wfRaw.includes('..')) {
      return null
    }
    const wfPrefix = wfRaw.replace(/\/+$/u, '') || 'git'

    let base =
      String(loadedFilename || 'model.archimate')
        .replace(/^[\\/]+/, '')
        .split(/[/\\]/)
        .pop() || 'model.archimate'
    base = base.replace(/\.[^.\\/]+$/iu, '') + '.archimate'
    if (!/\.archimate$/iu.test(base)) {
      base = 'model.archimate'
    }
    return `${wfPrefix}/${base}`
  }, [gitWorkFolder, gitRepoPath, loadedFilename])

  const handleReloadModelFromFile = useCallback(async (): Promise<GitCommandResult> => {
    const rel = buildRepoModelWriteRelativePath()
    if (!rel) {
      const msg =
        'Не найден путь к файлу model.archimate в репозитории. Клонируйте репозиторий или дождитесь автозагрузки.'
      setGitOutput(msg)
      return { ok: false, error: msg }
    }

    return withGitCommand('Обновление модели…', async () => {
      const result = await readAndApplyModel(rel)
      if (result.ok) {
        setGitOutput(`Модель загружена из файла: ${result.path}`)
        return result
      }
      const msg = result.error || 'Не удалось загрузить модель'
      setGitOutput(msg)
      return { ok: false, error: msg, path: result.path }
    })
  }, [buildRepoModelWriteRelativePath, readAndApplyModel, withGitCommand])

  async function handleSaveModelToGitFile(): Promise<GitCommandResult> {
    let nextXml: string | null | undefined
    try {
      nextXml = getEditedModelXml()
    } catch (buildErr) {
      const msg = `Не удалось собрать XML модели: ${
        buildErr instanceof Error ? buildErr.message : String(buildErr)
      }`
      setGitOutput(msg)
      return { ok: false, error: msg }
    }
    if (!nextXml) {
      const msg = hasModel
        ? 'Не удалось собрать XML модели: исходный файл не загружен в память. Нажмите «Обновить модель» и сохраните снова.'
        : 'Нет загруженной модели для записи'
      setGitOutput(msg)
      return { ok: false, error: msg }
    }
    const rel = buildRepoModelWriteRelativePath()
    if (!rel) {
      const msg =
        'Не найден путь к файлу модели в репозитории. Клонируйте репозиторий или дождитесь автозагрузки.'
      setGitOutput(msg)
      return { ok: false, error: msg }
    }
    try {
      const response = await fetch(apiUrl('/api/model/write'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: rel, content: nextXml }),
      })
      const data = await response.json().catch(() => ({}) as Record<string, unknown>)
      if (!response.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : `Ошибка API (${response.status})`
        setGitOutput(msg)
        return { ok: false, error: msg }
      }
      if (data.ok) {
        const savedPath = data.path ?? rel
        setGitRepoPath(savedPath)
        const baseName =
          savedPath.split('/').pop() || rel.split('/').pop() || 'model.archimate'
        const msg = `Модель сохранена: ${savedPath}`
        setGitOutput(msg)
        onModelSavedRef.current?.({
          layout: 'single-file',
          content: nextXml,
          filename: baseName,
          repoPath: savedPath,
        })
        return { ok: true, path: savedPath }
      }
      const msg = data.error || data.stderr || JSON.stringify(data)
      setGitOutput(msg)
      return { ok: false, error: msg }
    } catch (err) {
      const msg = formatApiRequestError(err)
      setGitOutput(msg)
      return { ok: false, error: msg }
    }
  }

  async function handleSaveGitSettings(): Promise<void> {
    await withGitCommand('Сохранение настроек…', async () => {
    const wf = gitWorkFolder.trim() || 'git'
    const remoteUrl = gitCloneUrl.trim()
    const pat = gitConfigPat.trim()
    try {
      const response = await fetch(apiUrl('/api/git/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workFolder: wf,
          ...(remoteUrl ? { remoteUrl } : {}),
          ...(pat ? { pat } : {}),
        }),
      })
      const data = await response.json()
      if (data.ok) {
        let msg = data.patVerified ? 'Настройки сохранены (PAT проверен, remote без токена).' : 'Настройки сохранены.'
        if (data.hasDotGit === false) {
          msg += ' Репозиторий в этой папке ещё не клонирован — выполните git clone.'
        }
        setGitOutput(msg)
        await refreshGitRepoState()
      } else {
        setGitOutput(data.error || JSON.stringify(data))
      }
    } catch (err) {
      setGitOutput(err instanceof Error ? err.message : String(err))
    }
    })
  }

  async function applyRepoRoot(payload: { repoRoot?: string; reset?: boolean }): Promise<void> {
    if (!gitApiReady) {
      setGitOutput(apiUnavailableMessage)
      return
    }
    await withGitCommand('Смена GIT_REPO_ROOT…', async () => {
      try {
        const response = await fetch(apiUrl('/api/git/repo-root'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const rawText = await response.text()
        let data: Record<string, unknown> = {}
        try {
          data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}
        } catch {
          data = {}
        }
        if (response.ok && data.ok) {
          const root = typeof data.repoRoot === 'string' ? data.repoRoot : ''
          setGitRepoRoot(root)
          setGitRepoRootInput(root)
          if (typeof data.defaultRepoRoot === 'string') {
            setGitRepoRootDefault(data.defaultRepoRoot)
          }
          setGitRepoPath('')
          setGitBranches({ loading: false, list: [], error: null })
          onRepositoryDeleted()
          setGitOutput(`Каталог GIT_REPO_ROOT изменён: ${root}`)
          await refreshGitRepoState()
          return
        }
        if (typeof data.error === 'string' && data.error) {
          setGitOutput(data.error)
          return
        }
        const detail = rawText.trim()
        if (response.status === 404) {
          setGitOutput(
            'Эндпоинт /api/git/repo-root не найден (HTTP 404). Перезапустите локальный API (npm run dev:api) или приложение — установлена устаревшая версия сервера.',
          )
          return
        }
        setGitOutput(
          `Не удалось изменить каталог (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`,
        )
      } catch (err) {
        setGitOutput(formatApiRequestError(err))
      }
    })
  }

  async function handleApplyRepoRoot(): Promise<void> {
    const next = gitRepoRootInput.trim()
    if (!next) {
      setGitOutput('Укажите путь к каталогу GIT_REPO_ROOT')
      return
    }
    await applyRepoRoot({ repoRoot: next })
  }

  async function handleResetRepoRoot(): Promise<void> {
    await applyRepoRoot({ reset: true })
  }

  async function handleBrowseRepoRoot(): Promise<void> {
    if (!canPickDirectory) {
      return
    }
    try {
      const picked = (await SelectDirectory('Выберите каталог GIT_REPO_ROOT')).trim()
      if (picked) {
        setGitRepoRootInput(picked)
      }
    } catch (err) {
      setGitOutput(formatApiRequestError(err))
    }
  }

  async function handleDeleteGitRepository(): Promise<void> {
    if (!gitApiReady) {
      setGitOutput(apiUnavailableMessage)
      return
    }
    const wf = gitWorkFolder.trim() || 'git'
    const relPath = wf.replace(/^[\\/]+/, '').replace(/\\/g, '/')
    const confirmed = await confirmDialog({
      title: 'Удалить репозиторий с диска',
      content: `Удалить каталог GIT_REPO_ROOT/${relPath} со всем содержимым (включая .git)? Действие необратимо.`,
      okText: 'Удалить',
      cancelText: 'Отмена',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    await withGitCommand('Удаление репозитория…', async () => {
    try {
      const response = await fetch(apiUrl('/api/git/delete-repository'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workFolder: wf }),
      })
      const data = await response.json()
      if (data.ok) {
        setGitRepoPath('')
        setModelLoading(false)
        setGitBranches({ loading: false, list: [], error: null })
        setGitOutput(
          data.deleted === false
            ? (data.message ?? `Каталог «${data.rel ?? relPath}» уже отсутствует.`)
            : `Репозиторий удалён с диска: ${data.rel ?? relPath}`,
        )
        onRepositoryDeleted()
        await refreshGitRepoState()
      } else {
        setGitOutput(data.error || JSON.stringify(data))
      }
    } catch (err) {
      setGitOutput(err instanceof Error ? err.message : String(err))
    }
    })
  }

  async function handleGitClone(): Promise<void> {
    const url = gitCloneUrl.trim()
    if (!url) {
      setGitOutput('Укажите URL репозитория для git clone')
      return
    }
    await withGitCommand('Клонирование репозитория…', async () => {
    const pat = gitConfigPat.trim()
    const wf = gitWorkFolder.trim() || 'git'
    try {
      const response = await fetch(apiUrl('/api/git/clone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          workFolder: wf,
          ...(gitCloneShallow ? { depth: 1 } : {}),
          ...(pat ? { pat } : {}),
        }),
      })
      const data = await response.json()
      if (data.ok) {
        const tail = [data.stdout, data.stderr].filter(Boolean).join('\n').trim()
        const originNote =
          data.originSanitized === true
            ? '\nURL origin очищен от токена в .git/config (push/pull потребуют снова настроить доступ).'
            : pat && data.originSanitized === false
              ? '\nНе удалось очистить origin от токена — проверьте remote вручную.'
              : ''
        let out =
          (tail
            ? `Клон создан: ${data.path}\n${tail}`
            : `Клон создан в каталоге относительно корня репо: ${data.path}`) + originNote
        if (data.modelPath) {
          const result = await readAndApplyModel(data.modelPath, {
            layout:
              data.modelLayout === 'split-files' || data.modelLayout === 'single-file'
                ? data.modelLayout
                : undefined,
          })
          if (result.ok) {
            out += `\nМодель загружена: ${result.path}`
          } else if (result.path) {
            out += `\nФайл прочитан (${result.path}), но не разобран как модель: ${result.error}`
          } else {
            out += `\nНе удалось прочитать модель (${data.modelPath}): ${result.error}`
          }
        } else {
          out +=
            '\nВ клоне не найден .archimate или split-модель model/folder.xml (поиск по дереву).'
        }
        setGitOutput(out)
        await refreshGitRepoState()
      } else {
        setGitOutput(data.error || `${data.stderr}\n${data.stdout}`)
      }
    } catch (err) {
      setGitOutput(formatApiRequestError(err))
    }
    })
  }

  async function handleGitCheckout(): Promise<void> {
    const rel = gitRepoPath.trim()
    const branch = gitCheckoutBranch.trim()
    if (!branch) {
      setGitOutput('Выберите ветку из списка')
      return
    }
    await withGitCommand('Переключение ветки…', async () => {
    try {
      const response = await fetch(apiUrl('/api/git/checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(rel ? { path: rel } : { workFolder: gitWorkFolder.trim() || 'git' }),
          branch,
        }),
      })
      const data = await response.json()
      const co = data.checkout ?? data
      if (data.ok) {
        let msg = [co.stdout, co.stderr].filter(Boolean).join('\n').trim()
        if (data.currentBranch) {
          msg = msg ? `${msg}\nТекущая ветка: ${data.currentBranch}` : `Текущая ветка: ${data.currentBranch}`
        }
        if (!msg) {
          msg = 'Ветка переключена'
        }
        if (data.workTree) {
          msg += `\n(work tree: ${data.workTree})`
        }
        if (data.checkoutMode === 'checkout-attached-from-remote') {
          msg +=
            '\nПереключение с удалённой ветки на локальную (не detached HEAD) — git push будет с текущей ветки.'
        }
        if (rel) {
          const result = await readAndApplyModel(rel)
          if (result.ok) {
            msg += `\nМодель перечитана с диска: ${result.path}`
          } else if (result.path) {
            msg += `\nCheckout выполнен, файл не разобран как модель: ${result.error}`
          } else {
            msg += `\nНе удалось перечитать файл модели (${rel}): ${result.error}`
          }
        }
        setGitOutput(msg)
        const nextBranch =
          (typeof data.currentBranch === 'string' && data.currentBranch.trim()) ||
          preferLocalBranchSelection(branch, gitBranches.list)
        if (nextBranch) {
          setGitCheckoutBranch(nextBranch)
        }
        await refreshGitRepoState()
        await loadGitBranches(undefined, { fetch: false })
      } else {
        setGitOutput(data.error || [co.stderr, co.stdout].filter(Boolean).join('\n'))
      }
    } catch (err) {
      setGitOutput(formatApiRequestError(err))
    }
    })
  }

  async function handleGitPush(): Promise<void> {
    const rel = gitRepoPath.trim()
    const remote = 'origin'
    const branch =
      gitCheckoutBranch.trim() ||
      (typeof gitRepoProbe.currentBranch === 'string' ? gitRepoProbe.currentBranch.trim() : '')
    const pat = gitConfigPat.trim()
    if (!branch) {
      setGitOutput('Выберите ветку в списке выше или дождитесь определения текущей ветки — она используется для git push.')
      return
    }
    await withGitCommand('Отправка в origin…', async () => {
    try {
      const response = await fetch(apiUrl('/api/git/push'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(rel ? { path: rel } : { workFolder: gitWorkFolder.trim() || 'git' }),
          remote,
          branch,
          ...(gitPushUpstream ? { setUpstream: true } : {}),
          ...(pat ? { pat } : {}),
        }),
      })
      const data = await response.json()
      const pushBlock = data.push ?? data
      if (data.ok) {
        const text = [pushBlock.stdout, pushBlock.stderr].filter(Boolean).join('\n').trim()
        let msg = text || 'git push выполнен'
        if (data.workTree) {
          msg += `\n(work tree: ${data.workTree})`
        }
        if (pat && data.originSanitized === false) {
          const rs = data.restoreRemote?.stderr?.trim()
          msg += `\nНе удалось восстановить URL remote без токена.${rs ? ` ${rs}` : ''}`
        }
        setGitOutput(msg)
      } else {
        const pushErr = [pushBlock.stderr, pushBlock.stdout].filter(Boolean).join('\n').trim()
        setGitOutput(
          data.error ||
            pushErr ||
            data.remoteGetUrl?.stderr ||
            data.remoteSetUrl?.stderr ||
            JSON.stringify(data),
        )
      }
    } catch (err) {
      setGitOutput(formatApiRequestError(err))
    }
    })
  }

  async function handleGitPullAndRefresh(): Promise<void> {
    if (!gitApiReady) {
      setGitOutput(apiUnavailableMessage)
      return
    }
    await withGitCommand('Получение изменений…', async () => {
    const rel = gitRepoPath.trim()
    const pat = gitConfigPat.trim()
    try {
      const response = await fetch(apiUrl('/api/git/pull'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(rel ? { path: rel } : { workFolder: gitWorkFolder.trim() || 'git' }),
          remote: 'origin',
          branch: 'main',
          ...(pat ? { pat } : {}),
        }),
      })
      const data = await response.json()
      const pullBlock = data.pull ?? data
      if (!data.ok) {
        setGitOutput(
          data.error ||
            [pullBlock.stderr, pullBlock.stdout].filter(Boolean).join('\n').trim() ||
            JSON.stringify(data),
        )
        return
      }
      let msg = [pullBlock.stdout, pullBlock.stderr].filter(Boolean).join('\n').trim()
      if (data.workTree) {
        msg = msg ? `${msg}\n(work tree: ${data.workTree})` : `(work tree: ${data.workTree})`
      }
      if (pat && data.originSanitized === false) {
        const rs = data.restoreRemote?.stderr?.trim()
        msg += `\nНе удалось восстановить URL remote без токена.${rs ? ` ${rs}` : ''}`
      }

      const meta = await refreshGitRepoState()
      const modelRel = (meta?.modelPath && String(meta.modelPath).trim()) || rel
      if (!modelRel) {
        setGitOutput(
          `${msg}\nPull выполнен; файл модели в репозитории не найден — обновите папку или клонируйте репозиторий.`,
        )
        await loadGitBranches(undefined, { fetch: false })
        return
      }

      const result = await readAndApplyModel(modelRel)
      if (result.ok) {
        await loadGitBranches(result.path, { fetch: false })
        setGitOutput(`${msg}\nМодель перечитана: ${result.path}`)
      } else if (result.path) {
        setGitOutput(`${msg}\nФайл не разобран как модель: ${result.error}`)
        await loadGitBranches(result.path, { fetch: false })
      } else {
        setGitOutput(`${msg}\nНе удалось прочитать модель (${modelRel}): ${result.error}`)
        await loadGitBranches(modelRel, { fetch: false })
      }
    } catch (err) {
      setGitOutput(err instanceof Error ? err.message : String(err))
    }
    })
  }

  async function handleGitCommit(): Promise<void> {
    const rel = gitRepoPath.trim()
    const message = gitCommitMessage.trim()
    if (!rel) {
      setGitOutput(
        'Не найден файл модели в папке репозитория — клонируйте репозиторий с .archimate или смените папку в настройках.',
      )
      return
    }
    if (!message) {
      setGitOutput('Введите сообщение коммита')
      return
    }
    await withGitCommand('Создание коммита…', async () => {
    try {
      const response = await fetch(apiUrl('/api/git/commit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: rel,
          message,
          ...(modelLayoutRef.current === 'split-files' ? { layout: 'split-files' } : {}),
        }),
      })
      const data = await response.json()
      if (data.ok) {
        const out = [data.commit?.stdout, data.commit?.stderr].filter(Boolean).join('\n')
        let msg = out.trim() || 'Коммит создан'
        if (data.workTree) {
          msg += `\n(work tree: ${data.workTree})`
        }
        setGitOutput(msg)
      } else {
        setGitOutput(
          data.error ||
            [data.commit?.stderr, data.add?.stderr, data.stdout].filter(Boolean).join('\n'),
        )
      }
    } catch (err) {
      setGitOutput(err instanceof Error ? err.message : String(err))
    }
    })
  }

  return {
    gitApiReady,
    gitRepoPath,
    setGitRepoPath,
    gitCommitMessage,
    setGitCommitMessage,
    gitCloneUrl,
    setGitCloneUrl,
    gitCloneShallow,
    setGitCloneShallow,
    gitPushUpstream,
    setGitPushUpstream,
    gitCheckoutBranch,
    setGitCheckoutBranch,
    gitWorkFolder,
    setGitWorkFolder,
    gitConfigPat,
    setGitConfigPat,
    gitRepoRoot,
    gitRepoRootDefault,
    gitRepoRootInput,
    setGitRepoRootInput,
    canPickDirectory,
    handleApplyRepoRoot,
    handleResetRepoRoot,
    handleBrowseRepoRoot,
    gitRepoProbe,
    modelLayout,
    modelLoading,
    gitBranches,
    gitOutput,
    gitCommandLoading,
    gitCommandLabel,
    loadGitBranches,
    buildRepoModelWriteRelativePath,
    handleReloadModelFromFile,
    handleSaveModelToGitFile,
    handleSaveGitSettings,
    handleDeleteGitRepository,
    handleGitClone,
    handleGitCheckout,
    handleGitPush,
    handleGitPullAndRefresh,
    handleGitCommit,
  }
}
