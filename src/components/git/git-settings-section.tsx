import { Button, Checkbox, Input, Space, Typography } from 'antd'

interface GitRepoProbe {
  loaded?: boolean
  loading?: boolean
  hasDotGit?: boolean
  workFolder?: string
  currentBranch?: string
}

interface GitSettingsSectionProps {
  variant?: 'collapsible' | 'panel'
  gitApiReady: boolean
  gitRepoRoot: string
  gitCloneUrl: string
  gitConfigPat: string
  gitCloneShallow: boolean
  gitCommandLoading: boolean
  gitCommandLabel: string
  gitRepoProbe: GitRepoProbe
  onCloneUrlChange: (value: string) => void
  onConfigPatChange: (value: string) => void
  onCloneShallowChange: (value: boolean) => void
  onGitClone: () => void
  onSaveSettings: () => void
  onDeleteRepository: () => void | Promise<void>
}

export function GitSettingsSection({
  gitApiReady,
  gitRepoRoot,
  gitCloneUrl,
  gitConfigPat,
  gitCloneShallow,
  gitCommandLoading,
  gitCommandLabel,
  gitRepoProbe,
  onCloneUrlChange,
  onConfigPatChange,
  onCloneShallowChange,
  onGitClone,
  onSaveSettings,
  onDeleteRepository,
}: GitSettingsSectionProps) {
  const repoRootLabel = gitRepoRoot.trim() || 'GIT_REPO_ROOT'

  return (
    <Space className="git-settings-fields" direction="vertical" size={10}>
      <Typography.Paragraph className="git-hint">
        Файл модели (.archimate / .xml) в репозитории выбирается автоматически — первый найденный в
        каталоге (как после clone).
      </Typography.Paragraph>
      <label className="git-label">
        <span>URL репозитория (remote origin)</span>
        <Input
          value={gitCloneUrl}
          onChange={(e) => onCloneUrlChange(e.target.value)}
          placeholder="https://github.com/org/repo.git"
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <label className="git-label">
        <span>PAT (не сохраняется в браузере; при сохранении проверяется через ls-remote для HTTPS)</span>
        <Input.Password
          value={gitConfigPat}
          onChange={(e) => onConfigPatChange(e.target.value)}
          autoComplete="off"
        />
      </label>
      <Typography.Paragraph className="git-hint">
        <code>git clone</code> создаёт репозиторий в каталоге из поля «Путь к каталогу (абсолютный)»
        выше (URL и PAT отсюда же).
      </Typography.Paragraph>
      <Checkbox
        checked={gitCloneShallow}
        onChange={(e) => onCloneShallowChange(e.target.checked)}
      >
        Мелкий клон (--depth 1)
      </Checkbox>
      <Button type="primary" block disabled={gitCommandLoading} onClick={onGitClone}>
        git clone
      </Button>
      <Typography.Paragraph className="git-hint">
        Сохранение задаёт <code>origin</code> без токена в URL; при указанном PAT выполняется проверка доступа
        (HTTPS). Этот же PAT отправляется на локальный API при <code>git clone</code> и <code>git push</code> (в
        sessionStorage не сохраняется).
      </Typography.Paragraph>
      <Button block disabled={gitCommandLoading} onClick={onSaveSettings}>
        Сохранить настройки
      </Button>
      <Button
        block
        danger
        disabled={
          !gitApiReady ||
          gitCommandLoading ||
          gitRepoProbe.loading ||
          !gitRepoProbe.hasDotGit
        }
        title={`Удалить репозиторий из «${repoRootLabel}» (только если в каталоге есть .git)`}
        onClick={() => void onDeleteRepository()}
      >
        {gitCommandLoading && gitCommandLabel === 'Удаление репозитория…'
          ? 'Удаление…'
          : 'Удалить репозиторий с диска'}
      </Button>
      <Typography.Paragraph className="git-hint">
        Удаляется содержимое каталога «Путь к каталогу (абсолютный)»; модель в памяти сбрасывается. Для снова
        работы выполните <code>git clone</code>.
      </Typography.Paragraph>
    </Space>
  )
}
