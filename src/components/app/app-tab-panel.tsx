import type { ReactNode } from 'react'
import { Spin } from 'antd'

interface AppTabPanelProps {
  children: ReactNode
  shouldMount: boolean
  isReady: boolean
  loadingLabel: string
}

export function AppTabPanel({
  children,
  shouldMount,
  isReady,
  loadingLabel,
}: AppTabPanelProps) {
  return (
    <div className="app-tab-panel">
      {shouldMount ? children : null}
      {!isReady ? (
        <div className="app-tab-loader" role="status" aria-live="polite" aria-busy="true">
          <div className="git-loader-card">
            <Spin size="large" />
            <p className="git-loader-label">{loadingLabel}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
