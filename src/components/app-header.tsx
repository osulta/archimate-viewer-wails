import React from 'react'
import { Button, Layout, Menu, Space, Tooltip, Typography } from 'antd'
import { UndoOutlined, RedoOutlined } from '@ant-design/icons'

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
  { id: 'viewMode', label: 'Режим просмотра' },
  { id: 'admin', label: 'Администрирование' },
]

interface AppHeaderProps {
  activeTab: string
  onTabChange: (tabId: string) => void
  canUndo?: boolean
  canRedo?: boolean
  undoLabel?: string
  redoLabel?: string
  onUndo?: () => void
  onRedo?: () => void
}

export function AppHeader({
  activeTab,
  onTabChange,
  canUndo = false,
  canRedo = false,
  undoLabel = '',
  redoLabel = '',
  onUndo,
  onRedo,
}: AppHeaderProps): React.JSX.Element {
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
      <Space className="app-header-actions" size={4}>
        <Tooltip title={undoLabel ? `Отменить: ${undoLabel} (Ctrl+Z)` : 'Отменить (Ctrl+Z)'}>
          <Button
            type="text"
            icon={<UndoOutlined />}
            disabled={!canUndo}
            aria-label="Отменить"
            onClick={onUndo}
          />
        </Tooltip>
        <Tooltip
          title={redoLabel ? `Повторить: ${redoLabel} (Ctrl+Shift+Z)` : 'Повторить (Ctrl+Shift+Z)'}
        >
          <Button
            type="text"
            icon={<RedoOutlined />}
            disabled={!canRedo}
            aria-label="Повторить"
            onClick={onRedo}
          />
        </Tooltip>
      </Space>
    </Layout.Header>
  )
}
