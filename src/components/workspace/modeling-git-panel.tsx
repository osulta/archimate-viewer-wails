import { GitSidebarInfoBlock, GitSidebarWorkflow } from '../git/git-workflow-blocks'

interface ModelingGitPanelProps {
  git: { [key: string]: unknown }
  gitOutput: string
}

export function ModelingGitPanel({ git, gitOutput }: ModelingGitPanelProps) {
  return (
    <div className="workspace-git-stack">
      <GitSidebarWorkflow git={git} />
      <GitSidebarInfoBlock gitOutput={gitOutput} />
    </div>
  )
}
