import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModelLoadPayload } from '../types/model'
import { fetchApiHealth, isWailsDesktopRuntime } from '../lib/git/api-client'
import type { ReadModelResult } from '../lib/git/git-helpers'
import { useGitBranches } from './git/use-git-branches'
import { useGitRepoSettings } from './git/use-git-repo-settings'
import { useGitWorkflow } from './git/use-git-workflow'

interface UseGitIntegrationOptions {
  hasModel: boolean
  loadedFilename: string
  getEditedModelXml: () => string | null | undefined
  onModelLoaded: (payload: ModelLoadPayload) => void
  onModelSaved?: (payload: ModelLoadPayload) => void
  onModelParseError: (message: string) => void
  onRepositoryDeleted: () => void
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
  const [gitOutput, setGitOutput] = useState('')
  const [gitCommandLoading, setGitCommandLoading] = useState(false)
  const [gitCommandLabel, setGitCommandLabel] = useState('')
  const [gitApiReady, setGitApiReady] = useState(false)

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

  const readAndApplyModelRef = useRef<(relPath: string) => Promise<ReadModelResult>>(
    async () => ({ ok: false, error: 'Model loader not ready' }),
  )
  const setModelLoadingRef = useRef<(value: boolean) => void>(() => {})

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const checkHealth = async (): Promise<void> => {
      try {
        const { ok } = await fetchApiHealth()
        if (cancelled) {
          return
        }
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

  const settings = useGitRepoSettings({
    gitApiReady,
    withGitCommand,
    setGitOutput,
    readAndApplyModel: (relPath) => readAndApplyModelRef.current(relPath),
    onRepositoryDeleted,
    setModelLoading: (value) => setModelLoadingRef.current(value),
  })

  const branches = useGitBranches({
    gitApiReady,
    gitRepoPath: settings.gitRepoPath,
    gitConfigPatRef: settings.gitConfigPatRef,
    gitRepoProbe: settings.gitRepoProbe,
    setGitRepoProbe: settings.setGitRepoProbe,
    withGitCommand,
    setGitOutput,
    readAndApplyModel: (relPath) => readAndApplyModelRef.current(relPath),
    refreshGitRepoState: settings.refreshGitRepoState,
  })

  const workflow = useGitWorkflow({
    hasModel,
    loadedFilename,
    getEditedModelXml,
    onModelLoaded,
    onModelSaved,
    onModelParseError,
    gitApiReady,
    gitRepoPath: settings.gitRepoPath,
    setGitRepoPath: settings.setGitRepoPath,
    gitConfigPat: settings.gitConfigPat,
    gitCheckoutBranch: branches.gitCheckoutBranch,
    gitRepoProbe: settings.gitRepoProbe,
    withGitCommand,
    setGitOutput,
    loadGitBranches: branches.loadGitBranches,
    refreshGitRepoState: settings.refreshGitRepoState,
  })

  readAndApplyModelRef.current = workflow.readAndApplyModel
  setModelLoadingRef.current = workflow.setModelLoading

  return {
    displayedGitBranch: branches.displayedGitBranch,
    gitApiReady,
    gitRepoPath: settings.gitRepoPath,
    setGitRepoPath: settings.setGitRepoPath,
    gitCommitMessage: workflow.gitCommitMessage,
    setGitCommitMessage: workflow.setGitCommitMessage,
    gitCloneUrl: settings.gitCloneUrl,
    setGitCloneUrl: settings.setGitCloneUrl,
    gitCloneShallow: settings.gitCloneShallow,
    setGitCloneShallow: settings.setGitCloneShallow,
    gitPushUpstream: workflow.gitPushUpstream,
    setGitPushUpstream: workflow.setGitPushUpstream,
    gitCheckoutBranch: branches.gitCheckoutBranch,
    setGitCheckoutBranch: branches.setGitCheckoutBranch,
    gitConfigPat: settings.gitConfigPat,
    setGitConfigPat: settings.setGitConfigPat,
    gitRepoRoot: settings.gitRepoRoot,
    gitRepoRootDefault: settings.gitRepoRootDefault,
    gitRepoRootInput: settings.gitRepoRootInput,
    setGitRepoRootInput: settings.setGitRepoRootInput,
    canPickDirectory: settings.canPickDirectory,
    handleApplyRepoRoot: settings.handleApplyRepoRoot,
    handleResetRepoRoot: settings.handleResetRepoRoot,
    handleBrowseRepoRoot: settings.handleBrowseRepoRoot,
    gitRepoProbe: settings.gitRepoProbe,
    modelLoading: workflow.modelLoading,
    gitBranches: branches.gitBranches,
    gitOutput,
    gitCommandLoading,
    gitCommandLabel,
    loadGitBranches: branches.loadGitBranches,
    buildRepoModelWriteRelativePath: workflow.buildRepoModelWriteRelativePath,
    handleReloadModelFromFile: workflow.handleReloadModelFromFile,
    handleSaveModelToGitFile: workflow.handleSaveModelToGitFile,
    handleSaveGitSettings: settings.handleSaveGitSettings,
    handleDeleteGitRepository: settings.handleDeleteGitRepository,
    handleGitClone: settings.handleGitClone,
    handleGitCheckout: branches.handleGitCheckout,
    handleGitPush: workflow.handleGitPush,
    handleGitPullAndRefresh: workflow.handleGitPullAndRefresh,
    handleGitCommit: workflow.handleGitCommit,
  }
}
