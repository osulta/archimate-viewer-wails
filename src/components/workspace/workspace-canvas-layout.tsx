import type { ReactNode } from 'react'
import { Button, Space } from 'antd'
import { AppstoreOutlined, ProfileOutlined } from '@ant-design/icons'
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
  palettes,
  palettesTitle = 'Палитра',
  inspector,
  inspectorTitle = 'Свойства',
}: WorkspaceCanvasLayoutProps) {
  const {
    canvasFocusMode,
    palettesOpen,
    propertiesOpen,
    togglePalettesOpen,
    togglePropertiesOpen,
  } = layout

  const showPalettesPanel = Boolean(palettes) && palettesOpen && !canvasFocusMode
  const showPropertiesPanel = propertiesOpen && !canvasFocusMode
  const hasOpenPanel = showPalettesPanel || showPropertiesPanel

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
