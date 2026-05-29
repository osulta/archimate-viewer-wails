import { Alert, Card, Typography } from 'antd'
import { GitCommandLoader } from './git-command-loader'
import { GitSettingsSection } from './git-settings-section'

interface GitRepoProbe {
  loaded?: boolean
  loading?: boolean
  hasDotGit?: boolean
  workFolder?: string
  currentBranch?: string
}

interface GitInfoBlockProps {
  gitApiReady: boolean
  gitRepoProbe: GitRepoProbe
  gitWorkFolder: string
  gitOutput: string
}

function GitInfoBlock({ gitApiReady, gitRepoProbe, gitWorkFolder, gitOutput }: GitInfoBlockProps) {
  const repoMessage =
    gitApiReady && (gitRepoProbe.loaded || gitRepoProbe.loading)
      ? gitRepoProbe.loading
        ? `Проверка папки «${gitWorkFolder.trim() || 'git'}»…`
        : gitRepoProbe.hasDotGit
          ? `Репозиторий: ${gitRepoProbe.workFolder}${gitRepoProbe.currentBranch ? ` — ветка ${gitRepoProbe.currentBranch}` : ''}`
          : `В папке «${gitWorkFolder.trim() || 'git'}» нет .git — клонируйте репозиторий или смените папку.`
      : ''

  return (
    <Card size="small" title="Информация" aria-label="Информация о репозитории">
      <Alert
        type={gitApiReady ? 'success' : 'error'}
        showIcon
        message={
          gitApiReady
            ? 'API git доступен (npm run dev).'
            : 'API недоступен. Запустите npm run dev (порт API 5151).'
        }
      />
      {repoMessage ? (
        <Alert
          style={{ marginTop: 8 }}
          type={gitRepoProbe.loading ? 'info' : gitRepoProbe.hasDotGit ? 'success' : 'warning'}
          showIcon
          message={repoMessage}
        />
      ) : null}
      {gitOutput ? <pre className="git-output git-output-info">{gitOutput}</pre> : null}
    </Card>
  )
}

interface GitState {
  gitApiReady: boolean
  gitWorkFolder: string
  gitCloneUrl: string
  gitConfigPat: string
  gitCloneShallow: boolean
  gitRepoProbe: GitRepoProbe
  gitOutput: string
  gitCommandLoading: boolean
  gitCommandLabel: string
  setGitWorkFolder: (value: string) => void
  setGitCloneUrl: (value: string) => void
  setGitConfigPat: (value: string) => void
  setGitCloneShallow: (value: boolean) => void
  handleSaveGitSettings: () => void
  handleDeleteGitRepository: () => void | Promise<void>
  handleGitClone: () => void
  [key: string]: unknown
}

interface GitPanelProps {
  git: GitState
  variant?: 'admin'
}

export function GitPanel({ git, variant = 'admin' }: GitPanelProps) {
  const {
    gitApiReady,
    gitWorkFolder,
    gitCloneUrl,
    gitConfigPat,
    gitCloneShallow,
    gitRepoProbe,
    gitOutput,
    gitCommandLoading,
    gitCommandLabel,
    setGitWorkFolder,
    setGitCloneUrl,
    setGitConfigPat,
    setGitCloneShallow,
    handleSaveGitSettings,
    handleDeleteGitRepository,
    handleGitClone,
  } = git

  const settingsProps = {
    gitApiReady,
    gitWorkFolder,
    gitCloneUrl,
    gitConfigPat,
    gitCloneShallow,
    gitCommandLoading,
    gitCommandLabel,
    gitRepoProbe,
    onWorkFolderChange: setGitWorkFolder,
    onCloneUrlChange: setGitCloneUrl,
    onConfigPatChange: setGitConfigPat,
    onCloneShallowChange: setGitCloneShallow,
    onGitClone: handleGitClone,
    onSaveSettings: handleSaveGitSettings,
    onDeleteRepository: handleDeleteGitRepository,
  }

  const infoProps: GitInfoBlockProps = {
    gitApiReady,
    gitRepoProbe,
    gitWorkFolder,
    gitOutput,
  }

  if (variant !== 'admin') {
    return null
  }

  return (
    <section className="admin-section git-page" aria-label="Git">
      <div className="tab-page-head">
        <Typography.Title level={3}>Git</Typography.Title>
        <Typography.Paragraph type="secondary">Репозиторий и настройки.</Typography.Paragraph>
      </div>
      <div className="git-page-layout">
        <GitCommandLoader active={gitCommandLoading} label={gitCommandLabel} />
        <GitInfoBlock {...infoProps} />
        <Card size="small" title="Настройки" aria-label="Настройки">
          <GitSettingsSection variant="panel" {...settingsProps} />
        </Card>
      </div>
    </section>
  )
}
