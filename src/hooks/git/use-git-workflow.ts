import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModelLoadPayload } from '../../types/model'
import {
  apiUnavailableMessage,
  formatApiRequestError,
  postGitCommit,
  postGitPull,
  postGitPush,
  postModelRead,
  postModelWrite,
} from '../../lib/git/api-client'
import {
  DEFAULT_GIT_WORK_FOLDER,
  formatGitCommandOutput,
  joinGitCommandOutput,
  type GitCommandBlock,
  type GitCommandResult,
  type GitRepoProbe,
  type ReadModelResult,
  type RefreshRepoResult,
} from '../../lib/git/git-helpers'

export interface UseGitWorkflowOptions {
  hasModel: boolean
  loadedFilename: string
  getEditedModelXml: () => string | null | undefined
  onModelLoaded: (payload: ModelLoadPayload) => void
  onModelSaved?: (payload: ModelLoadPayload) => void
  onModelParseError: (message: string) => void
  gitApiReady: boolean
  gitRepoPath: string
  setGitRepoPath: (path: string) => void
  gitConfigPat: string
  gitCheckoutBranch: string
  gitRepoProbe: GitRepoProbe
  withGitCommand: <T>(label: string, fn: () => Promise<T>) => Promise<T>
  setGitOutput: (value: string) => void
  loadGitBranches: (
    modelPathOverride?: string,
    options?: { fetch?: boolean },
  ) => Promise<void>
  refreshGitRepoState: () => Promise<RefreshRepoResult>
}

export function useGitWorkflow({
  hasModel,
  loadedFilename,
  getEditedModelXml,
  onModelLoaded,
  onModelSaved,
  onModelParseError,
  gitApiReady,
  gitRepoPath,
  setGitRepoPath,
  gitConfigPat,
  gitCheckoutBranch,
  gitRepoProbe,
  withGitCommand,
  setGitOutput,
  loadGitBranches,
  refreshGitRepoState,
}: UseGitWorkflowOptions) {
  const [gitCommitMessage, setGitCommitMessage] = useState('')
  const [gitPushUpstream, setGitPushUpstream] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)

  const onModelLoadedRef = useRef(onModelLoaded)
  const onModelSavedRef = useRef(onModelSaved)
  const onModelParseErrorRef = useRef(onModelParseError)
  onModelLoadedRef.current = onModelLoaded
  onModelSavedRef.current = onModelSaved
  onModelParseErrorRef.current = onModelParseError

  const readAndApplyModel = useCallback(async (relPath: string): Promise<ReadModelResult> => {
    setModelLoading(true)
    try {
      const { response, data } = await postModelRead(relPath)
      if (!data.ok || typeof data.content !== 'string') {
        return {
          ok: false,
          error: typeof data.error === 'string' ? data.error : String(response.status),
          path: relPath,
        }
      }
      const savedPath = typeof data.path === 'string' ? data.path : relPath
      const baseName =
        savedPath.split('/').pop() || relPath.split('/').pop() || 'model.archimate'
      try {
        onModelLoadedRef.current({
          content: data.content,
          filename: baseName,
          repoPath: savedPath,
        })
        setGitRepoPath(savedPath)
        return { ok: true, path: savedPath, filename: baseName }
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
        onModelParseErrorRef.current(msg)
        return { ok: false, error: msg, path: savedPath }
      }
    } finally {
      setModelLoading(false)
    }
  }, [setGitRepoPath])

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
        const result = await readAndApplyModel(relPath)
        if (cancelled) {
          return
        }
        if (result.ok) {
          setGitOutput(`Модель загружена из репозитория: ${result.path}`)
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
    gitRepoPath,
    hasModel,
    readAndApplyModel,
    setGitOutput,
  ])

  const buildRepoModelWriteRelativePath = useCallback((): string | null => {
    const tracked = String(gitRepoPath || '')
      .trim()
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/')
    if (
      tracked &&
      !tracked.split('/').some((segment) => segment === '..' || segment === '.') &&
      /\.(archimate|xml)$/i.test(tracked)
    ) {
      return tracked
    }

    let base =
      String(loadedFilename || 'model.archimate')
        .replace(/^[\\/]+/, '')
        .split(/[/\\]/)
        .pop() || 'model.archimate'
    base = base.replace(/\.[^.\\/]+$/iu, '') + '.archimate'
    if (!/\.archimate$/iu.test(base)) {
      base = 'model.archimate'
    }
    return base
  }, [gitRepoPath, loadedFilename])

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
  }, [buildRepoModelWriteRelativePath, readAndApplyModel, setGitOutput, withGitCommand])

  async function handleSaveModelToGitFile(): Promise<GitCommandResult> {
    return withGitCommand('Сохранение модели…', async () => {
      // Let the loading UI paint before the heavy XML assemble.
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0)
      })

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
        const { response, data } = await postModelWrite(rel, nextXml)
        if (!response.ok) {
          const msg =
            typeof data.error === 'string'
              ? data.error
              : `Ошибка API (${response.status})`
          setGitOutput(msg)
          return { ok: false, error: msg }
        }
        if (data.ok) {
          const savedPath = typeof data.path === 'string' ? data.path : rel
          setGitRepoPath(savedPath)
          const baseName =
            savedPath.split('/').pop() || rel.split('/').pop() || 'model.archimate'
          const msg = `Модель сохранена: ${savedPath}`
          setGitOutput(msg)
          onModelSavedRef.current?.({
            content: nextXml,
            filename: baseName,
            repoPath: savedPath,
          })
          return { ok: true, path: savedPath }
        }
        const msg =
          (typeof data.error === 'string' && data.error) ||
          (typeof data.stderr === 'string' && data.stderr) ||
          JSON.stringify(data)
        setGitOutput(msg)
        return { ok: false, error: msg }
      } catch (err) {
        const msg = formatApiRequestError(err)
        setGitOutput(msg)
        return { ok: false, error: msg }
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
        const data = await postGitPush({
          ...(rel ? { path: rel } : { workFolder: DEFAULT_GIT_WORK_FOLDER }),
          remote,
          branch,
          ...(gitPushUpstream ? { setUpstream: true } : {}),
          ...(pat ? { pat } : {}),
        })
        const pushBlock = (data.push ?? data) as GitCommandBlock & Record<string, unknown>
        if (data.ok) {
          const text = [pushBlock.stdout, pushBlock.stderr].filter(Boolean).join('\n').trim()
          let msg = joinGitCommandOutput([
            formatGitCommandOutput('git push', pushBlock, text || 'выполнен'),
          ])
          if (typeof data.workTree === 'string' && data.workTree) {
            msg += `\n(work tree: ${data.workTree})`
          }
          if (pat && data.originSanitized === false) {
            const restoreRemote = data.restoreRemote as { stderr?: string } | undefined
            const rs = restoreRemote?.stderr?.trim()
            msg += `\nНе удалось восстановить URL remote без токена.${rs ? ` ${rs}` : ''}`
          }
          setGitOutput(msg)
        } else {
          const pushErr = [pushBlock.stderr, pushBlock.stdout].filter(Boolean).join('\n').trim()
          const remoteGetUrl = data.remoteGetUrl as { stderr?: string } | undefined
          const remoteSetUrl = data.remoteSetUrl as { stderr?: string } | undefined
          setGitOutput(
            joinGitCommandOutput([
              formatGitCommandOutput('git push', pushBlock),
              (typeof data.error === 'string' && data.error) ||
                pushErr ||
                remoteGetUrl?.stderr ||
                remoteSetUrl?.stderr ||
                JSON.stringify(data),
            ]),
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
        const data = await postGitPull({
          ...(rel ? { path: rel } : { workFolder: DEFAULT_GIT_WORK_FOLDER }),
          remote: 'origin',
          ...(pat ? { pat } : {}),
        })
        const pullBlock = (data.pull ?? data) as GitCommandBlock
        if (!data.ok) {
          setGitOutput(
            (typeof data.error === 'string' && data.error) ||
              [pullBlock.stderr, pullBlock.stdout].filter(Boolean).join('\n').trim() ||
              JSON.stringify(data),
          )
          return
        }
        let msg = [pullBlock.stdout, pullBlock.stderr].filter(Boolean).join('\n').trim()
        if (typeof data.resolvedBranch === 'string' && data.resolvedBranch.trim()) {
          msg = msg
            ? `${msg}\n(ветка: ${data.resolvedBranch.trim()})`
            : `(ветка: ${data.resolvedBranch.trim()})`
        }
        if (typeof data.workTree === 'string' && data.workTree) {
          msg = msg ? `${msg}\n(work tree: ${data.workTree})` : `(work tree: ${data.workTree})`
        }
        if (pat && data.originSanitized === false) {
          const restoreRemote = data.restoreRemote as { stderr?: string } | undefined
          const rs = restoreRemote?.stderr?.trim()
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
        const data = await postGitCommit({
          path: rel,
          message,
        })
        if (data.ok) {
          let msg = joinGitCommandOutput([
            formatGitCommandOutput('git add', data.add as GitCommandBlock | undefined),
            formatGitCommandOutput('git commit', data.commit as GitCommandBlock | undefined, 'коммит создан'),
          ])
          if (typeof data.workTree === 'string' && data.workTree) {
            msg += `\n(work tree: ${data.workTree})`
          }
          setGitOutput(msg)
          setGitCommitMessage('')
        } else {
          const commitBlock = data.commit as GitCommandBlock | undefined
          const addBlock = data.add as GitCommandBlock | undefined
          setGitOutput(
            joinGitCommandOutput([
              formatGitCommandOutput('git add', addBlock),
              formatGitCommandOutput('git commit', commitBlock),
              (typeof data.error === 'string' && data.error) ||
                [commitBlock?.stderr, addBlock?.stderr, typeof data.stdout === 'string' ? data.stdout : '']
                  .filter(Boolean)
                  .join('\n'),
            ]),
          )
        }
      } catch (err) {
        setGitOutput(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return {
    gitCommitMessage,
    setGitCommitMessage,
    gitPushUpstream,
    setGitPushUpstream,
    modelLoading,
    setModelLoading,
    readAndApplyModel,
    buildRepoModelWriteRelativePath,
    handleReloadModelFromFile,
    handleSaveModelToGitFile,
    handleGitPush,
    handleGitPullAndRefresh,
    handleGitCommit,
  }
}
