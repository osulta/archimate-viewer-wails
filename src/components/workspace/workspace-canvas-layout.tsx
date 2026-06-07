import type { ReactNode } from 'react'
import { Button, Space } from 'antd'
import { AppstoreOutlined, BranchesOutlined, ProfileOutlined } from '@ant-design/icons'
import type { WorkspaceLayoutState } from '../../hooks/use-workspace-layout'
import { WorkspaceSidePanel } from './workspace-side-panel'

export interface WorkspaceCanvasLayoutProps {
  layout: WorkspaceLayoutState
  sidebar: ReactNode
  diagramTitle: string
  diagramMeta?: string
  toolbarExtra?: ReactNode
  loader?: ReactNode
  canvas: ReactNode
  gitPanel?: ReactNode
  gitTitle?: string
  gitBranchLabel?: string
  palettes?: ReactNode
  palettesTitle?: string
  inspector: ReactNode
  inspectorTitle?: string
}

export function WorkspaceCanvasLayout({
  layout,
  sidebar,
  diagramTitle,
  diagramMeta,
  toolbarExtra,
  loader,
  canvas,
  gitPanel,
  gitTitle = 'Git',
  gitBranchLabel,
  palettes,
  palettesTitle = 'Палитра',
  inspector,
  inspectorTitle = 'Свойства',
}: WorkspaceCanvasLayoutProps) {
  const {
    canvasFocusMode,
    gitOpen,
    palettesOpen,
    propertiesOpen,
    toggleGitOpen,
    togglePalettesOpen,
    togglePropertiesOpen,
  } = layout

  const showGitPanel = Boolean(gitPanel) && gitOpen && !canvasFocusMode
  const showPalettesPanel = Boolean(palettes) && palettesOpen && !canvasFocusMode
  const showPropertiesPanel = propertiesOpen && !canvasFocusMode
  const hasOpenPanel = showGitPanel || showPalettesPanel || showPropertiesPanel

  return (
    <div className={canvasFocusMode ? 'layout layout-canvas-focus' : 'layout'}>
      {!canvasFocusMode ? sidebar : null}
      <main className="content workspace-content">
        <div className="workspace-toolbar workspace-toolbar-compact">
          <div className="workspace-diagram-bar">
            <div className="workspace-diagram-meta">
              <span className="workspace-diagram-name">{diagramTitle}</span>
              {diagramMeta ? (
                <span className="workspace-diagram-type">{diagramMeta}</span>
              ) : null}
            </div>
            <Space className="workspace-diagram-actions" size={4}>
              {toolbarExtra}
              {!canvasFocusMode ? (
                <>
                  {gitPanel ? (
                    <span className="workspace-git-toolbar">
                      {gitBranchLabel ? (
                        <span
                          className="workspace-git-branch-label"
                          title={`Текущая ветка: ${gitBranchLabel}`}
                        >
                          {gitBranchLabel}
                        </span>
                      ) : null}
                      <Button
                        type="text"
                        size="small"
                        className={
                          gitOpen
                            ? 'workspace-inspector-toggle is-active'
                            : 'workspace-inspector-toggle'
                        }
                        icon={<BranchesOutlined />}
                        title={gitOpen ? 'Скрыть Git' : 'Показать Git'}
                        aria-label={gitOpen ? 'Скрыть Git' : 'Показать Git'}
                        aria-pressed={gitOpen}
                        onClick={toggleGitOpen}
                      />
                    </span>
                  ) : null}
                  {palettes ? (
                    <Button
                      type="text"
                      size="small"
                      className={
                        palettesOpen
                          ? 'workspace-inspector-toggle is-active'
                          : 'workspace-inspector-toggle'
                      }
                      icon={<AppstoreOutlined />}
                      title={palettesOpen ? 'Скрыть палитру' : 'Показать палитру'}
                      aria-label={palettesOpen ? 'Скрыть палитру' : 'Показать палитру'}
                      aria-pressed={palettesOpen}
                      onClick={togglePalettesOpen}
                    />
                  ) : null}
                  <Button
                    type="text"
                    size="small"
                    className={
                      propertiesOpen
                        ? 'workspace-inspector-toggle is-active'
                        : 'workspace-inspector-toggle'
                    }
                    icon={<ProfileOutlined />}
                    title={propertiesOpen ? 'Скрыть свойства' : 'Показать свойства'}
                    aria-label={propertiesOpen ? 'Скрыть свойства' : 'Показать свойства'}
                    aria-pressed={propertiesOpen}
                    onClick={togglePropertiesOpen}
                  />
                </>
              ) : null}
            </Space>
          </div>
          {loader}
        </div>
        <div
          className={
            hasOpenPanel
              ? 'workspace-body workspace-body-split'
              : 'workspace-body workspace-body-split workspace-body-panels-collapsed'
          }
        >
          <div className="workspace-canvas-pane">{canvas}</div>
          {hasOpenPanel ? (
            <div className="workspace-side-panels">
              {showGitPanel ? (
                <WorkspaceSidePanel
                  title={gitTitle}
                  onClose={toggleGitOpen}
                  className="workspace-git-panel"
                >
                  {gitPanel}
                </WorkspaceSidePanel>
              ) : null}
              {showPalettesPanel ? (
                <WorkspaceSidePanel
                  title={palettesTitle}
                  onClose={togglePalettesOpen}
                  className="workspace-palettes-panel"
                  bodyClassName="workspace-inspector-body-flush"
                >
                  {palettes}
                </WorkspaceSidePanel>
              ) : null}
              {showPropertiesPanel ? (
                <WorkspaceSidePanel
                  title={inspectorTitle}
                  onClose={togglePropertiesOpen}
                  className="workspace-properties-panel"
                >
                  {inspector}
                </WorkspaceSidePanel>
              ) : null}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
