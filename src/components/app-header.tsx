import React from 'react'

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
    <header className="app-header">
      <div className="app-header-brand">ArchiMate Viewer</div>
      <nav className="app-header-tabs" role="tablist" aria-label="Разделы приложения">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={
              activeTab === tab.id ? 'app-header-tab app-header-tab-active' : 'app-header-tab'
            }
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="app-header-actions">
        <button
          type="button"
          className="undo-redo-btn"
          disabled={!canUndo}
          title={undoLabel ? `Отменить: ${undoLabel} (Ctrl+Z)` : 'Отменить (Ctrl+Z)'}
          aria-label="Отменить"
          onClick={onUndo}
        >
          &#x21B6;
        </button>
        <button
          type="button"
          className="undo-redo-btn"
          disabled={!canRedo}
          title={redoLabel ? `Повторить: ${redoLabel} (Ctrl+Shift+Z)` : 'Повторить (Ctrl+Shift+Z)'}
          aria-label="Повторить"
          onClick={onRedo}
        >
          &#x21B7;
        </button>
      </div>
    </header>
  )
}
