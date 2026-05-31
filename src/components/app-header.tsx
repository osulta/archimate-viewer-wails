import React from 'react'
import { Layout, Menu, Typography } from 'antd'

interface Tab {
  id: string
  label: string
}

const TABS: Tab[] = [
  { id: 'modeling', label: 'Моделирование' },
  { id: 'changes', label: 'Сравнение изменений' },
  { id: 'linters', label: 'Линтеры' },
  { id: 'assets', label: 'Активы' },
  { id: 'aiArchitect', label: 'AI Architect' },
  { id: 'adr', label: 'ADR' },
  { id: 'viewMode', label: 'Режим просмотра' },
  { id: 'admin', label: 'Администрирование' },
]

interface AppHeaderProps {
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function AppHeader({ activeTab, onTabChange }: AppHeaderProps): React.JSX.Element {
  return (
    <Layout.Header className="app-header">
      <Typography.Text className="app-header-brand">ArchiMate Viewer</Typography.Text>
      <Menu
        className="app-header-tabs"
        mode="horizontal"
        selectedKeys={[activeTab]}
        onClick={({ key }) => onTabChange(key)}
        items={TABS.map((tab) => ({ key: tab.id, label: tab.label }))}
        aria-label="Разделы приложения"
      />
    </Layout.Header>
  )
}
