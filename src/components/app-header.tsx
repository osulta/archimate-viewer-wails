import React from 'react'
import {
  DesktopOutlined,
  MoonOutlined,
  RedoOutlined,
  SunOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, Segmented, Space, Tooltip, Typography } from 'antd'
import { useThemeModeContext } from './theme-provider'
import type { ThemeMode } from '../lib/ui/theme-mode'

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
  const { mode, setMode } = useThemeModeContext()

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
      <Space className="app-header-actions" size={8}>
        <Segmented
          className="app-theme-switch"
          size="small"
          value={mode}
          onChange={(value) => setMode(value as ThemeMode)}
          options={[
            {
              value: 'system',
              icon: <DesktopOutlined />,
              label: 'Система',
            },
            {
              value: 'light',
              icon: <SunOutlined />,
              label: 'Светлая',
            },
            {
              value: 'dark',
              icon: <MoonOutlined />,
              label: 'Тёмная',
            },
          ]}
          aria-label="Тема оформления"
        />
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
