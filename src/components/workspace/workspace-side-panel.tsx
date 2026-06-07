import type { ReactNode } from 'react'
import { Button } from 'antd'
import { CloseOutlined } from '@ant-design/icons'

interface WorkspaceSidePanelProps {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function WorkspaceSidePanel({
  title,
  onClose,
  children,
  className,
  bodyClassName,
}: WorkspaceSidePanelProps) {
  return (
    <aside className={className ? `workspace-inspector ${className}` : 'workspace-inspector'}>
      <div className="workspace-inspector-head">
        <span className="workspace-inspector-title">{title}</span>
        <Button
          type="text"
          size="small"
          className="workspace-inspector-toggle"
          icon={<CloseOutlined />}
          title="Скрыть панель"
          aria-label="Скрыть панель"
          onClick={onClose}
        />
      </div>
      <div
        className={
          bodyClassName
            ? `workspace-inspector-body ${bodyClassName}`
            : 'workspace-inspector-body'
        }
      >
        {children}
      </div>
    </aside>
  )
}
