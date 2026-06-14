import type { JSX } from 'react'
import { Button, Checkbox, Input, Select, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { GitCommandLoader } from './git-command-loader'

interface BranchEntry {
  name: string
  local?: boolean
}

interface GitRepoProbe {
  loaded?: boolean
  loading?: boolean
  hasDotGit?: boolean
  workFolder?: string
  currentBranch?: string
}

interface GitBranchesState {
  loading: boolean
  list: BranchEntry[]
  error: string | null
}

interface GitState {
  gitApiReady: boolean
  gitRepoProbe: GitRepoProbe
  gitBranches: GitBranchesState
  displayedGitBranch?: string
  gitCheckoutBranch: string
  gitCommitMessage: string
  gitPushUpstream: boolean
  gitCommandLoading: boolean
  gitCommandLabel: string
  gitOutput: string
  gitRepoRoot: string
  setGitCheckoutBranch: (value: string) => void
  setGitCommitMessage: (value: string) => void
  setGitPushUpstream: (value: boolean) => void
  loadGitBranches: (path?: string, options?: { fetch?: boolean }) => void | Promise<void>
  handleGitCheckout: () => void | Promise<void>
  handleGitPullAndRefresh: () => void | Promise<void>
  handleGitPush: () => void | Promise<void>
  handleGitCommit: () => void | Promise<void>
  [key: string]: unknown
}

interface GitSidebarWorkflowProps {
  git: { [key: string]: unknown } | null
}

interface GitSidebarInfoBlockProps {
  gitOutput: string
  className?: string
}

export function GitSidebarInfoBlock({ gitOutput, className = '' }: GitSidebarInfoBlockProps): JSX.Element {
  return (
    <div className={`git-panel-output ${className}`.trim()} aria-live="polite">
      <p className="git-panel-section-title">Вывод команд</p>
      {gitOutput ? (
        <pre className="git-output git-panel-output-log">{gitOutput}</pre>
      ) : (
        <p className="git-panel-output-placeholder">
          Вывод git commit, git push и обновления веток.
        </p>
      )}
    </div>
  )
}

export function GitSidebarWorkflow({ git }: GitSidebarWorkflowProps): JSX.Element | null {
  if (!git) {
    return null
  }

  const {
    gitApiReady,
    gitRepoProbe,
    gitBranches,
    displayedGitBranch,
    gitCheckoutBranch,
    gitCommitMessage,
    gitPushUpstream,
    gitCommandLoading,
    gitCommandLabel,
    gitRepoRoot,
    setGitCheckoutBranch,
    setGitCommitMessage,
    setGitPushUpstream,
    loadGitBranches,
    handleGitCheckout,
    handleGitPullAndRefresh,
    handleGitPush,
    handleGitCommit,
  } = git as unknown as GitState

  const repoRootLabel = gitRepoRoot.trim() || 'GIT_REPO_ROOT'

  if (!gitApiReady) {
    return (
      <section className="git-panel-workflow" aria-label="Git">
        <p className="git-panel-status">API недоступен. Запустите npm run dev (порт API 5151).</p>
      </section>
    )
  }

  if (!gitRepoProbe.hasDotGit) {
    return (
      <section className="git-panel-workflow" aria-label="Git">
        <p className="git-panel-status">
          {gitRepoProbe.loading
            ? `Проверка каталога «${repoRootLabel}»…`
            : `В каталоге «${repoRootLabel}» нет .git — клонируйте репозиторий в «Администрирование» → Git.`}
        </p>
      </section>
    )
  }

  const branchOptions = gitBranches.list
  const hasBranches = branchOptions.length > 0
  const commitDisabled = gitCommandLoading || !gitCommitMessage.trim()
  const displayedBranch = displayedGitBranch?.trim() || gitRepoProbe.currentBranch?.trim()
  const currentBranch = displayedBranch

  return (
    <section className="git-panel-workflow" aria-label="Работа с Git">
      <GitCommandLoader active={gitCommandLoading} label={gitCommandLabel} />

      <div className="git-panel-section">
        <Typography.Text className="git-panel-section-title" strong>
          {currentBranch ? `Ветка: ${currentBranch}` : 'Ветка'}
        </Typography.Text>
        <div className="git-panel-branch-row">
          <Select
            className="git-panel-branch-select"
            size="small"
            showSearch
            optionFilterProp="label"
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.trim().toLowerCase())
            }
            value={gitCheckoutBranch || undefined}
            onChange={(value) => setGitCheckoutBranch(value)}
            disabled={gitCommandLoading || gitBranches.loading || !hasBranches}
            aria-label="Выбор ветки"
            placeholder="— нет веток —"
            options={branchOptions.map((branch) => ({
              value: branch.name,
              label:
                branch.local === false
                  ? `${branch.name} (только на remote)`
                  : branch.name,
            }))}
          />
          <Button
            size="small"
            icon={<ReloadOutlined />}
            disabled={gitCommandLoading || gitBranches.loading}
            loading={gitBranches.loading}
            onClick={() => void loadGitBranches(undefined, { fetch: true })}
            title="Обновить список веток (git fetch)"
            aria-label="Обновить список веток"
          />
        </div>
        {gitBranches.error ? <p className="git-panel-error">{gitBranches.error}</p> : null}
        <div className="git-panel-action-row">
          <Button
            size="small"
            disabled={gitCommandLoading || !gitCheckoutBranch.trim()}
            onClick={() => void handleGitCheckout()}
          >
            Переключить
          </Button>
          <Button
            size="small"
            disabled={gitCommandLoading}
            onClick={() => void handleGitPullAndRefresh()}
            title="git pull и перечитать модель"
          >
            git pull
          </Button>
        </div>
      </div>

      <div className="git-panel-section">
        <Typography.Text className="git-panel-section-title" strong>
          Коммит и push
        </Typography.Text>
        <label className="git-panel-label">
          <span>Сообщение</span>
          <Input.TextArea
            value={gitCommitMessage}
            onChange={(e) => setGitCommitMessage(e.target.value)}
            placeholder="Описание изменений"
            rows={2}
            size="small"
            spellCheck={false}
          />
        </label>
        <Button
          type="primary"
          size="small"
          block
          disabled={commitDisabled}
          onClick={() => void handleGitCommit()}
        >
          git commit
        </Button>
        <Checkbox
          className="git-panel-upstream"
          checked={gitPushUpstream}
          onChange={(e) => setGitPushUpstream(e.target.checked)}
        >
          upstream (--set-upstream)
        </Checkbox>
        <Button size="small" block disabled={gitCommandLoading} onClick={() => void handleGitPush()}>
          git push
        </Button>
      </div>
    </section>
  )
}
