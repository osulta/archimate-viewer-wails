import type { JSX } from 'react'
import { Button, Checkbox, Input, Select, Space, Typography } from 'antd'
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
  gitCheckoutBranch: string
  gitCommitMessage: string
  gitPushUpstream: boolean
  gitCommandLoading: boolean
  gitCommandLabel: string
  gitOutput: string
  gitWorkFolder: string
  setGitCheckoutBranch: (value: string) => void
  setGitCommitMessage: (value: string) => void
  setGitPushUpstream: (value: boolean) => void
  loadGitBranches: (path?: string, options?: { fetch?: boolean }) => void | Promise<void>
  handleGitCheckout: () => void | Promise<void>
  handleGitPull?: () => void | Promise<void>
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
}

function GitSidebarInfoBlock({ gitOutput }: GitSidebarInfoBlockProps): JSX.Element {
  return (
    <div className="git-block git-block-info sidebar-git-info" aria-live="polite">
      <Typography.Title level={5} className="git-block-title">
        Информация
      </Typography.Title>
      {gitOutput ? (
        <pre className="git-output sidebar-git-output">{gitOutput}</pre>
      ) : (
        <p className="sidebar-git-info-placeholder">
          Здесь отображается вывод git commit, git push и обновления списка веток.
        </p>
      )}
    </div>
  )
}

export function GitSidebarWorkflow({ git }: GitSidebarWorkflowProps) {
  if (!git) {
    return null
  }

  const {
    gitApiReady,
    gitRepoProbe,
    gitBranches,
    gitCheckoutBranch,
    gitCommitMessage,
    gitPushUpstream,
    gitCommandLoading,
    gitCommandLabel,
    gitOutput,
    gitWorkFolder,
    setGitCheckoutBranch,
    setGitCommitMessage,
    setGitPushUpstream,
    loadGitBranches,
    handleGitCheckout,
    handleGitPullAndRefresh,
    handleGitPush,
    handleGitCommit,
  } = git as unknown as GitState

  const workFolderLabel = gitWorkFolder.trim() || 'git'

  if (!gitApiReady) {
    return (
      <section className="sidebar-git-workflow" aria-label="Git">
        <p className="sidebar-git-command-status">
          API недоступен. Запустите npm run dev (порт API 5151).
        </p>
      </section>
    )
  }

  if (!gitRepoProbe.hasDotGit) {
    return (
      <section className="sidebar-git-workflow" aria-label="Git">
        <p className="sidebar-git-command-status">
          {gitRepoProbe.loading
            ? `Проверка папки «${workFolderLabel}»…`
            : `В папке «${workFolderLabel}» нет .git — клонируйте репозиторий в «Администрирование» → Git.`}
        </p>
      </section>
    )
  }

  const branchOptions = gitBranches.list
  const hasBranches = branchOptions.length > 0
  const commitDisabled = gitCommandLoading || !gitCommitMessage.trim()

  return (
    <section className="sidebar-git-workflow" aria-label="Работа с Git">
      <GitCommandLoader active={gitCommandLoading} label={gitCommandLabel} />
      <GitSidebarInfoBlock gitOutput={gitOutput} />

      <div className="git-block git-block-branches">
        <Typography.Title level={5} className="git-block-title">
          Ветка
        </Typography.Title>
        <p className="git-status">
          {gitRepoProbe.currentBranch
            ? `Текущая ветка: ${gitRepoProbe.currentBranch}`
            : `Репозиторий: ${gitRepoProbe.workFolder ?? workFolderLabel}`}
        </p>
        <Space.Compact className="git-branch-row" block>
          <Select
            className="git-branch-select"
            value={gitCheckoutBranch || undefined}
            onChange={(value) => setGitCheckoutBranch(value)}
            disabled={gitCommandLoading || gitBranches.loading || !hasBranches}
            aria-label="Выбор ветки"
            placeholder="— нет веток —"
            options={branchOptions.map((branch) => ({
              value: branch.name,
              label: `${branch.name}${branch.local === false ? ' (remote)' : ''}`,
            }))}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button
            icon={<ReloadOutlined />}
            disabled={gitCommandLoading || gitBranches.loading}
            loading={gitBranches.loading}
            onClick={() => void loadGitBranches(undefined, { fetch: true })}
            title="Обновить список веток (git fetch)"
          >
            Обновить
          </Button>
        </Space.Compact>
        {gitBranches.error ? <p className="git-branch-error">{gitBranches.error}</p> : null}
        <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
          <Button
            block
            disabled={gitCommandLoading || !gitCheckoutBranch.trim()}
            onClick={() => void handleGitCheckout()}
          >
            Переключить ветку
          </Button>
          <Button
            block
            disabled={gitCommandLoading}
            onClick={() => void handleGitPullAndRefresh()}
            title="git pull и перечитать модель"
          >
            git pull
          </Button>
        </Space>
      </div>

      <div className="git-block git-block-commit">
        <Typography.Title level={5} className="git-block-title">
          Коммит и отправка
        </Typography.Title>
        <label className="git-label">
          <span>Сообщение коммита</span>
          <Input.TextArea
            value={gitCommitMessage}
            onChange={(e) => setGitCommitMessage(e.target.value)}
            placeholder="Описание изменений"
            rows={3}
            spellCheck={false}
          />
        </label>
        <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
          <Button type="primary" block disabled={commitDisabled} onClick={() => void handleGitCommit()}>
            git commit
          </Button>
          <Checkbox
            checked={gitPushUpstream}
            onChange={(e) => setGitPushUpstream(e.target.checked)}
          >
            Установить upstream (--set-upstream)
          </Checkbox>
          <Button block disabled={gitCommandLoading} onClick={() => void handleGitPush()}>
            git push
          </Button>
        </Space>
      </div>
    </section>
  )
}
