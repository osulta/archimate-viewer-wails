import { useCallback, useEffect, useRef, useState } from 'react'
import { SelectDirectory, isWailsRuntime } from '../../../wailsjs/go/main/App'
import { confirmDialog } from '../../lib/ui/confirm-dialog'
import {
  apiUnavailableMessage,
  formatApiRequestError,
  fetchGitRepoRoot,
  postGitClone,
  postGitDeleteRepository,
  postGitRepoRoot,
  postGitRepoState,
  postGitSettings,
} from '../../lib/git/api-client'
import {
  DEFAULT_GIT_WORK_FOLDER,
  type GitRepoProbe,
  type ReadModelResult,
  type RefreshGitRepoOptions,
  type RefreshRepoResult,
} from '../../lib/git/git-helpers'

export interface UseGitRepoSettingsOptions {
  gitApiReady: boolean
  withGitCommand: <T>(label: string, fn: () => Promise<T>) => Promise<T>
  setGitOutput: (value: string) => void
  readAndApplyModel: (relPath: string) => Promise<ReadModelResult>
  onRepositoryDeleted: () => void
  setModelLoading: (value: boolean) => void
}

export function useGitRepoSettings({
  gitApiReady,
  withGitCommand,
  setGitOutput,
  readAndApplyModel,
  onRepositoryDeleted,
  setModelLoading,
}: UseGitRepoSettingsOptions) {
  const [gitRepoPath, setGitRepoPath] = useState(() =>
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('archimate-git-repo-path') ?? ''
      : '',
  )
  const [gitCloneUrl, setGitCloneUrl] = useState(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('archimate-git-clone-url') ?? '' : '',
  )
  const [gitCloneShallow, setGitCloneShallow] = useState(false)
  const [gitConfigPat, setGitConfigPat] = useState('')
  const [gitRepoRoot, setGitRepoRoot] = useState('')
  const [gitRepoRootDefault, setGitRepoRootDefault] = useState('')
  const [gitRepoRootInput, setGitRepoRootInput] = useState('')
  const canPickDirectory = isWailsRuntime()
  const [gitRepoProbe, setGitRepoProbe] = useState<GitRepoProbe>({
    loaded: false,
    loading: false,
    hasDotGit: false,
    workFolder: '.',
    remoteUrl: '',
    currentBranch: '',
  })

  const gitConfigPatRef = useRef('')
  gitConfigPatRef.current = gitConfigPat

  useEffect(() => {
    sessionStorage.setItem('archimate-git-clone-url', gitCloneUrl)
  }, [gitCloneUrl])

  useEffect(() => {
    const trimmed = gitRepoPath.trim()
    if (trimmed) {
      sessionStorage.setItem('archimate-git-repo-path', trimmed)
    }
  }, [gitRepoPath])

  const refreshGitRepoRoot = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchGitRepoRoot()
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

  const refreshGitRepoState = useCallback(async (options: RefreshGitRepoOptions = {}): Promise<RefreshRepoResult> => {
    setGitRepoProbe((p) => ({ ...p, loading: true }))
    try {
      const data = await postGitRepoState(DEFAULT_GIT_WORK_FOLDER)
      if (data.ok) {
        const probeBranch = typeof data.currentBranch === 'string' ? data.currentBranch.trim() : ''
        const remoteUrl = typeof data.remoteUrl === 'string' ? data.remoteUrl : ''
        setGitRepoProbe({
          loaded: true,
          loading: false,
          hasDotGit: Boolean(data.hasDotGit),
          workFolder: typeof data.workFolder === 'string' ? data.workFolder : '.',
          remoteUrl,
          currentBranch: probeBranch === 'HEAD' ? '' : probeBranch,
        })
        if (options.syncRemoteUrl) {
          setGitCloneUrl(remoteUrl)
        } else if (remoteUrl) {
          setGitCloneUrl((prev) => (prev.trim() ? prev : remoteUrl))
        }
        if (typeof data.modelPath === 'string' && data.modelPath) {
          setGitRepoPath(data.modelPath)
        } else {
          setGitRepoPath('')
        }
        return {
          ok: true,
          modelPath: typeof data.modelPath === 'string' ? data.modelPath : '',
          hasDotGit: Boolean(data.hasDotGit),
        }
      }
      setGitRepoProbe((p) => ({ ...p, loaded: true, loading: false }))
      return { ok: false, modelPath: '', hasDotGit: false }
    } catch {
      setGitRepoProbe((p) => ({ ...p, loaded: true, loading: false }))
      return { ok: false, modelPath: '', hasDotGit: false }
    }
  }, [])

  useEffect(() => {
    if (!gitApiReady) {
      return
    }
    void refreshGitRepoState({ syncRemoteUrl: true })
  }, [gitApiReady, refreshGitRepoState])

  useEffect(() => {
    if (!gitApiReady) {
      return
    }
    void refreshGitRepoRoot()
  }, [gitApiReady, refreshGitRepoRoot])

  async function handleSaveGitSettings(): Promise<void> {
    await withGitCommand('Сохранение настроек…', async () => {
      const remoteUrl = gitCloneUrl.trim()
      const pat = gitConfigPat.trim()
      try {
        const data = await postGitSettings({
          ...(remoteUrl ? { remoteUrl } : {}),
          ...(pat ? { pat } : {}),
        })
        if (data.ok) {
          let msg = data.patVerified
            ? 'Настройки сохранены (PAT проверен, remote без токена).'
            : 'Настройки сохранены.'
          if (data.hasDotGit === false) {
            msg += ' Репозиторий в этой папке ещё не клонирован — выполните git clone.'
          }
          setGitOutput(msg)
          await refreshGitRepoState()
        } else {
          setGitOutput(typeof data.error === 'string' ? data.error : JSON.stringify(data))
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
        const { response, data, rawText } = await postGitRepoRoot(payload)
        if (response.ok && data.ok) {
          const root = typeof data.repoRoot === 'string' ? data.repoRoot : ''
          setGitRepoRoot(root)
          setGitRepoRootInput(root)
          if (typeof data.defaultRepoRoot === 'string') {
            setGitRepoRootDefault(data.defaultRepoRoot)
          }
          setGitRepoPath('')
          onRepositoryDeleted()
          setGitOutput(`Каталог GIT_REPO_ROOT изменён: ${root}`)
          await refreshGitRepoState({ syncRemoteUrl: true })
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
    const repoRootLabel = gitRepoRoot.trim() || 'GIT_REPO_ROOT'
    const confirmed = await confirmDialog({
      title: 'Удалить репозиторий с диска',
      content: `Удалить содержимое каталога «${repoRootLabel}» (включая .git)? Действие необратимо.`,
      okText: 'Удалить',
      cancelText: 'Отмена',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    await withGitCommand('Удаление репозитория…', async () => {
      try {
        const data = await postGitDeleteRepository()
        if (data.ok) {
          setGitRepoPath('')
          setModelLoading(false)
          setGitOutput(
            data.deleted === false
              ? (typeof data.message === 'string'
                  ? data.message
                  : `Каталог «${typeof data.rel === 'string' ? data.rel : repoRootLabel}» уже отсутствует.`)
              : `Репозиторий удалён с диска: ${data.rel === '.' ? repoRootLabel : (typeof data.rel === 'string' ? data.rel : repoRootLabel)}`,
          )
          onRepositoryDeleted()
          await refreshGitRepoState({ syncRemoteUrl: true })
        } else {
          setGitOutput(typeof data.error === 'string' ? data.error : JSON.stringify(data))
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
      try {
        const data = await postGitClone({
          url,
          ...(gitCloneShallow ? { depth: 1 } : {}),
          ...(pat ? { pat } : {}),
        })
        if (data.ok) {
          const stdout = typeof data.stdout === 'string' ? data.stdout : ''
          const stderr = typeof data.stderr === 'string' ? data.stderr : ''
          const path = typeof data.path === 'string' ? data.path : ''
          const tail = [stdout, stderr].filter(Boolean).join('\n').trim()
          const originNote =
            data.originSanitized === true
              ? '\nURL origin очищен от токена в .git/config (push/pull потребуют снова настроить доступ).'
              : pat && data.originSanitized === false
                ? '\nНе удалось очистить origin от токена — проверьте remote вручную.'
                : ''
          let out =
            (tail
              ? `Клон создан: ${path}\n${tail}`
              : `Клон создан в каталоге относительно корня репо: ${path}`) + originNote
          if (typeof data.modelPath === 'string' && data.modelPath) {
            const result = await readAndApplyModel(data.modelPath)
            if (result.ok) {
              out += `\nМодель загружена: ${result.path}`
            } else if (result.path) {
              out += `\nФайл прочитан (${result.path}), но не разобран как модель: ${result.error}`
            } else {
              out += `\nНе удалось прочитать модель (${data.modelPath}): ${result.error}`
            }
          } else {
            out +=
              '\nВ клоне не найден файл модели .archimate (поиск по дереву). Split-модели (model/folder.xml) больше не поддерживаются.'
          }
          setGitOutput(out)
          await refreshGitRepoState()
        } else {
          const stderr = typeof data.stderr === 'string' ? data.stderr : ''
          const stdout = typeof data.stdout === 'string' ? data.stdout : ''
          setGitOutput(
            typeof data.error === 'string' ? data.error : `${stderr}\n${stdout}`,
          )
        }
      } catch (err) {
        setGitOutput(formatApiRequestError(err))
      }
    })
  }

  return {
    gitRepoPath,
    setGitRepoPath,
    gitCloneUrl,
    setGitCloneUrl,
    gitCloneShallow,
    setGitCloneShallow,
    gitConfigPat,
    setGitConfigPat,
    gitConfigPatRef,
    gitRepoRoot,
    gitRepoRootDefault,
    gitRepoRootInput,
    setGitRepoRootInput,
    canPickDirectory,
    gitRepoProbe,
    setGitRepoProbe,
    refreshGitRepoState,
    handleApplyRepoRoot,
    handleResetRepoRoot,
    handleBrowseRepoRoot,
    handleSaveGitSettings,
    handleDeleteGitRepository,
    handleGitClone,
  }
}
