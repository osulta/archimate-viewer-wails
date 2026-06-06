import { Alert, Button, Card, Input, Space, Typography } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
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
  gitRepoRoot: string
  gitOutput: string
}

function GitInfoBlock({ gitApiReady, gitRepoProbe, gitRepoRoot, gitOutput }: GitInfoBlockProps) {
  const repoRootLabel = gitRepoRoot.trim() || 'GIT_REPO_ROOT'
  const repoMessage =
    gitApiReady && (gitRepoProbe.loaded || gitRepoProbe.loading)
      ? gitRepoProbe.loading
        ? `Проверка каталога «${repoRootLabel}»…`
        : gitRepoProbe.hasDotGit
          ? `Репозиторий: ${gitRepoProbe.workFolder === '.' ? repoRootLabel : gitRepoProbe.workFolder}${gitRepoProbe.currentBranch ? ` — ветка ${gitRepoProbe.currentBranch}` : ''}`
          : `В каталоге «${repoRootLabel}» нет .git — клонируйте репозиторий или укажите другой путь.`
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
  gitCloneUrl: string
  gitConfigPat: string
  gitCloneShallow: boolean
  gitRepoRoot: string
  gitRepoRootDefault: string
  gitRepoRootInput: string
  canPickDirectory: boolean
  gitRepoProbe: GitRepoProbe
  gitOutput: string
  gitCommandLoading: boolean
  gitCommandLabel: string
  setGitCloneUrl: (value: string) => void
  setGitConfigPat: (value: string) => void
  setGitCloneShallow: (value: boolean) => void
  setGitRepoRootInput: (value: string) => void
  handleSaveGitSettings: () => void
  handleDeleteGitRepository: () => void | Promise<void>
  handleGitClone: () => void
  handleApplyRepoRoot: () => void | Promise<void>
  handleResetRepoRoot: () => void | Promise<void>
  handleBrowseRepoRoot: () => void | Promise<void>
  [key: string]: unknown
}

interface GitRepoRootBlockProps {
  gitApiReady: boolean
  gitRepoRoot: string
  gitRepoRootDefault: string
  gitRepoRootInput: string
  canPickDirectory: boolean
  gitCommandLoading: boolean
  onRepoRootInputChange: (value: string) => void
  onApplyRepoRoot: () => void | Promise<void>
  onResetRepoRoot: () => void | Promise<void>
  onBrowseRepoRoot: () => void | Promise<void>
}

function GitRepoRootBlock({
  gitApiReady,
  gitRepoRoot,
  gitRepoRootDefault,
  gitRepoRootInput,
  canPickDirectory,
  gitCommandLoading,
  onRepoRootInputChange,
  onApplyRepoRoot,
  onResetRepoRoot,
  onBrowseRepoRoot,
}: GitRepoRootBlockProps) {
  const trimmedInput = gitRepoRootInput.trim()
  const isUnchanged = trimmedInput === gitRepoRoot.trim()
  const isDefault = Boolean(gitRepoRootDefault) && gitRepoRoot.trim() === gitRepoRootDefault.trim()

  return (
    <Card size="small" title="Каталог данных (GIT_REPO_ROOT)" aria-label="Каталог GIT_REPO_ROOT">
      <Space className="git-settings-fields" direction="vertical" size={10}>
        <Typography.Paragraph className="git-hint" style={{ marginBottom: 0 }}>
          Каталог, в котором хранится git-репозиторий (внутри него появится <code>.git</code> после clone).
        </Typography.Paragraph>
        {gitRepoRoot ? (
          <Alert
            type="info"
            showIcon
            message={
              <span>
                Текущий путь: <code>{gitRepoRoot}</code>
                {isDefault ? ' (по умолчанию)' : ''}
              </span>
            }
          />
        ) : null}
        <label className="git-label">
          <span>Путь к каталогу (абсолютный)</span>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={gitRepoRootInput}
              onChange={(e) => onRepoRootInputChange(e.target.value)}
              placeholder="/Users/you/ArchiMate"
              spellCheck={false}
              autoComplete="off"
            />
            {canPickDirectory ? (
              <Button
                icon={<FolderOpenOutlined />}
                disabled={gitCommandLoading}
                onClick={() => void onBrowseRepoRoot()}
              >
                Обзор…
              </Button>
            ) : null}
          </Space.Compact>
        </label>
        <Button
          type="primary"
          block
          disabled={!gitApiReady || gitCommandLoading || !trimmedInput || isUnchanged}
          onClick={() => void onApplyRepoRoot()}
        >
          Применить путь
        </Button>
        <Button
          block
          disabled={!gitApiReady || gitCommandLoading || !gitRepoRootDefault || isDefault}
          title={gitRepoRootDefault ? `Сбросить к ${gitRepoRootDefault}` : undefined}
          onClick={() => void onResetRepoRoot()}
        >
          Сбросить к значению по умолчанию
        </Button>
        <Typography.Paragraph className="git-hint" style={{ marginBottom: 0 }}>
          При смене каталога открытая модель сбрасывается, а список репозиториев перечитывается из
          нового пути.
        </Typography.Paragraph>
      </Space>
    </Card>
  )
}

interface GitPanelProps {
  git: GitState
  variant?: 'admin'
}

export function GitPanel({ git, variant = 'admin' }: GitPanelProps) {
  const {
    gitApiReady,
    gitCloneUrl,
    gitConfigPat,
    gitCloneShallow,
    gitRepoRoot,
    gitRepoRootDefault,
    gitRepoRootInput,
    canPickDirectory,
    gitRepoProbe,
    gitOutput,
    gitCommandLoading,
    gitCommandLabel,
    setGitCloneUrl,
    setGitConfigPat,
    setGitCloneShallow,
    setGitRepoRootInput,
    handleSaveGitSettings,
    handleDeleteGitRepository,
    handleGitClone,
    handleApplyRepoRoot,
    handleResetRepoRoot,
    handleBrowseRepoRoot,
  } = git

  const settingsProps = {
    gitApiReady,
    gitRepoRoot,
    gitCloneUrl,
    gitConfigPat,
    gitCloneShallow,
    gitCommandLoading,
    gitCommandLabel,
    gitRepoProbe,
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
    gitRepoRoot,
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
        <GitRepoRootBlock
          gitApiReady={gitApiReady}
          gitRepoRoot={gitRepoRoot}
          gitRepoRootDefault={gitRepoRootDefault}
          gitRepoRootInput={gitRepoRootInput}
          canPickDirectory={canPickDirectory}
          gitCommandLoading={gitCommandLoading}
          onRepoRootInputChange={setGitRepoRootInput}
          onApplyRepoRoot={handleApplyRepoRoot}
          onResetRepoRoot={handleResetRepoRoot}
          onBrowseRepoRoot={handleBrowseRepoRoot}
        />
        <Card size="small" title="Настройки" aria-label="Настройки">
          <GitSettingsSection variant="panel" {...settingsProps} />
        </Card>
      </div>
    </section>
  )
}
