import type { ReactNode } from 'react'
import { Button, Layout } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { WorkspaceLayoutState } from '../../hooks/use-workspace-layout'

export const WORKSPACE_SIDEBAR_WIDTH = 340

interface WorkspaceSidebarLayoutProps {
  layout: WorkspaceLayoutState
  sidebar: ReactNode
  children: ReactNode
  showSidebar?: boolean
  className?: string
}

export function WorkspaceSidebarLayout({
  layout,
  sidebar,
  children,
  showSidebar = true,
  className = '',
}: WorkspaceSidebarLayoutProps) {
  const { sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed } = layout

  const rootClassName = ['workspace-layout', className].filter(Boolean).join(' ')

  return (
    <Layout className={rootClassName}>
      {showSidebar ? (
        <>
          <Layout.Sider
            className="workspace-sider"
            width={WORKSPACE_SIDEBAR_WIDTH}
            collapsedWidth={0}
            collapsible
            collapsed={sidebarCollapsed}
            onCollapse={setSidebarCollapsed}
            trigger={null}
            theme="light"
          >
            <div className="workspace-sider-inner">
              <div className="workspace-sider-body">{sidebar}</div>
              <Button
                type="text"
                className="workspace-sider-collapse-btn"
                icon={<LeftOutlined />}
                aria-label="Свернуть панель"
                title="Свернуть панель"
                onClick={toggleSidebarCollapsed}
              />
            </div>
          </Layout.Sider>
          {sidebarCollapsed ? (
            <Button
              type="text"
              className="workspace-sider-expand-btn"
              icon={<RightOutlined />}
              aria-label="Развернуть панель"
              title="Развернуть панель"
              onClick={toggleSidebarCollapsed}
            />
          ) : null}
        </>
      ) : null}
      <Layout.Content className="workspace-main">{children}</Layout.Content>
    </Layout>
  )
}
