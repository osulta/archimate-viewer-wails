import { useEffect } from 'react'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'

interface DiagramCanvasContextMenuProps {
  open: boolean
  x: number
  y: number
  items: MenuProps['items']
  onClose: () => void
}

export function DiagramCanvasContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: DiagramCanvasContextMenuProps) {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !items?.length) {
    return null
  }

  return (
    <>
      <div
        className="diagram-context-menu-backdrop"
        aria-hidden="true"
        onMouseDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <Menu
        className="diagram-context-menu"
        style={{ left: x, top: y }}
        items={items}
        onClick={onClose}
      />
    </>
  )
}
