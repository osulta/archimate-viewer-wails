import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import {
  formatApiRequestError,
  postGitBranches,
  postGitCheckout,
} from '../../lib/git/api-client'
import {
  DEFAULT_GIT_WORK_FOLDER,
  formatGitCommandOutput,
  joinGitCommandOutput,
  normalizeBranchName,
  preferLocalBranchSelection,
  resolveCurrentBranchFromList,
  type BranchEntry,
  type GitBranchesState,
  type GitCommandBlock,
  type GitRepoProbe,
  type ReadModelResult,
  type RefreshRepoResult,
} from '../../lib/git/git-helpers'

export interface UseGitBranchesOptions {
  gitApiReady: boolean
  gitRepoPath: string
  gitConfigPatRef: MutableRefObject<string>
  gitRepoProbe: GitRepoProbe
  setGitRepoProbe: Dispatch<SetStateAction<GitRepoProbe>>
  withGitCommand: <T>(label: string, fn: () => Promise<T>) => Promise<T>
  setGitOutput: (value: string) => void
  readAndApplyModel: (relPath: string) => Promise<ReadModelResult>
  refreshGitRepoState: () => Promise<RefreshRepoResult>
}

export function useGitBranches({
  gitApiReady,
  gitRepoPath,
  gitConfigPatRef,
  gitRepoProbe,
  setGitRepoProbe,
  withGitCommand,
  setGitOutput,
  readAndApplyModel,
  refreshGitRepoState,
}: UseGitBranchesOptions) {
  const [gitCheckoutBranch, setGitCheckoutBranch] = useState(() =>
    typeof sessionStorage !== 'undefined'
      ? normalizeBranchName(sessionStorage.getItem('archimate-git-checkout-branch') ?? '')
      : '',
  )
  const [gitBranches, setGitBranches] = useState<GitBranchesState>({
    loading: false,
    list: [],
    error: null,
    defaultBranch: '',
  })

  const gitRepoPathRef = useRef('')
  const branchesRequestSeqRef = useRef(0)
  gitRepoPathRef.current = gitRepoPath.trim()

  useEffect(() => {
    sessionStorage.setItem('archimate-git-checkout-branch', normalizeBranchName(gitCheckoutBranch))
  }, [gitCheckoutBranch])

  const loadGitBranches = useCallback(
    async (modelPathOverride?: string, options: { fetch?: boolean } = {}): Promise<void> => {
      const fetchRemote = options.fetch === true
      const run = async (): Promise<void> => {
        const requestId = ++branchesRequestSeqRef.current
        const rel = String(modelPathOverride ?? gitRepoPathRef.current).trim()
        const pat = gitConfigPatRef.current.trim()
        setGitBranches((s) => ({ ...s, loading: true, error: null }))
        try {
          const data = await postGitBranches({
            workFolder: DEFAULT_GIT_WORK_FOLDER,
            ...(rel ? { path: rel } : {}),
            ...(fetchRemote ? { fetch: true } : {}),
            ...(pat ? { pat } : {}),
          })
          if (branchesRequestSeqRef.current !== requestId) {
            return
          }
          if (data.ok && Array.isArray(data.branches)) {
            const list = data.branches as BranchEntry[]
            const defaultBranch =
              typeof data.defaultBranch === 'string' ? data.defaultBranch.trim() : ''
            setGitBranches({ loading: false, list, error: null, defaultBranch })
            const resolvedBranch = resolveCurrentBranchFromList(list)
            setGitRepoProbe((prev) => ({ ...prev, currentBranch: resolvedBranch }))
            if (resolvedBranch) {
              setGitCheckoutBranch((prev) => preferLocalBranchSelection(prev, list, resolvedBranch))
            }
            if (fetchRemote) {
              const count = list.length
              const localCount = list.filter((b) => b.local !== false).length
              const fetchWarning =
                typeof data.fetchWarning === 'string' ? data.fetchWarning.trim() : ''
              setGitOutput(
                joinGitCommandOutput([
                  formatGitCommandOutput('git fetch', data.fetch as GitCommandBlock | undefined),
                  fetchWarning,
                  `Список веток обновлён: ${count} (${localCount} локальных).`,
                ]),
              )
            }
          } else {
            const errText = typeof data.error === 'string' ? data.error : 'Ошибка списка веток'
            setGitBranches((s) => ({
              ...s,
              loading: false,
              error: errText,
            }))
            if (fetchRemote) {
              setGitOutput(
                joinGitCommandOutput([
                  formatGitCommandOutput('git fetch', data.fetch as GitCommandBlock | undefined),
                  errText,
                ]),
              )
            }
          }
        } catch (e) {
          if (branchesRequestSeqRef.current !== requestId) {
            return
          }
          const errText = e instanceof Error ? e.message : String(e)
          setGitBranches((s) => ({
            ...s,
            loading: false,
            error: errText,
          }))
          if (fetchRemote) {
            setGitOutput(`Обновление списка веток: ${errText}`)
          }
        }
      }
      if (fetchRemote) {
        return withGitCommand('Загрузка списка веток…', run)
      }
      return run()
    },
    [gitConfigPatRef, setGitOutput, setGitRepoProbe, withGitCommand],
  )

  useEffect(() => {
    if (!gitRepoProbe.hasDotGit) {
      branchesRequestSeqRef.current += 1
      setGitBranches({ loading: false, list: [], error: null, defaultBranch: '' })
    }
  }, [gitRepoProbe.hasDotGit])

  useEffect(() => {
    if (!gitBranches.list.length) {
      return
    }
    const current = normalizeBranchName(gitRepoProbe.currentBranch)
    const selected = normalizeBranchName(gitCheckoutBranch)
    let next = selected

    if (!next && current) {
      next = current
    } else if (next && !gitBranches.list.some((b) => b.name === next)) {
      if (current && gitBranches.list.some((b) => b.name === current)) {
        next = current
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
  }, [gitApiReady, gitRepoProbe.hasDotGit, gitRepoPath, loadGitBranches])

  async function handleGitCheckout(): Promise<void> {
    const rel = gitRepoPath.trim()
    const branch = gitCheckoutBranch.trim()
    if (!branch) {
      setGitOutput('Выберите ветку из списка')
      return
    }
    await withGitCommand('Переключение ветки…', async () => {
      try {
        const data = await postGitCheckout({
          ...(rel ? { path: rel } : { workFolder: DEFAULT_GIT_WORK_FOLDER }),
          branch,
        })
        const co = (data.checkout ?? data) as { stdout?: string; stderr?: string }
        if (data.ok) {
          let msg = [co.stdout, co.stderr].filter(Boolean).join('\n').trim()
          if (typeof data.currentBranch === 'string' && data.currentBranch) {
            msg = msg
              ? `${msg}\nТекущая ветка: ${data.currentBranch}`
              : `Текущая ветка: ${data.currentBranch}`
          }
          if (!msg) {
            msg = 'Ветка переключена'
          }
          if (typeof data.workTree === 'string' && data.workTree) {
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
          setGitOutput(
            typeof data.error === 'string'
              ? data.error
              : [co.stderr, co.stdout].filter(Boolean).join('\n'),
          )
        }
      } catch (err) {
        setGitOutput(formatApiRequestError(err))
      }
    })
  }

  const displayedGitBranch = useMemo(
    () => resolveCurrentBranchFromList(gitBranches.list, gitRepoProbe.currentBranch),
    [gitBranches.list, gitRepoProbe.currentBranch],
  )

  return {
    displayedGitBranch,
    gitCheckoutBranch,
    setGitCheckoutBranch,
    gitBranches,
    loadGitBranches,
    handleGitCheckout,
  }
}
