import { GitSidebarInfoBlock, GitSidebarWorkflow } from '../git/git-workflow-blocks'

interface ModelingGitPanelProps {
  git: {
    gitCommandLoading?: boolean
    gitCommandLabel?: string
    [key: string]: unknown
  }
  gitOutput: string
}

export function ModelingGitPanel({ git, gitOutput }: ModelingGitPanelProps) {
  const isBusy = Boolean(git.gitCommandLoading)
  return (
    <div className={isBusy ? 'workspace-git-stack is-busy' : 'workspace-git-stack'}>
      <GitSidebarWorkflow git={git} />
      <GitSidebarInfoBlock gitOutput={gitOutput} />
    </div>
  )
}
