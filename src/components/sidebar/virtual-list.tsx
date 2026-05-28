import React, { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_OVERSCAN = 6

interface VirtualListProps<T> {
  items: T[]
  itemHeight: number
  getItemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
  maxHeight?: number
  listClassName?: string
}

export function VirtualList<T>({
  items,
  itemHeight,
  getItemKey,
  renderItem,
  className = '',
  maxHeight = 360,
  listClassName = 'virtual-list',
}: VirtualListProps<T>): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: 24 })

  const updateRange = useCallback(() => {
    const container = containerRef.current
    if (!container || items.length === 0) {
      setRange({ start: 0, end: 0 })
      return
    }

    const scrollTop = container.scrollTop
    const viewport = container.clientHeight
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - DEFAULT_OVERSCAN)
    const visibleCount = Math.ceil(viewport / itemHeight) + DEFAULT_OVERSCAN * 2
    const end = Math.min(items.length, start + visibleCount)
    setRange({ start, end })
  }, [itemHeight, items.length])

  useEffect(() => {
    updateRange()
  }, [items, updateRange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return undefined
    }
    container.addEventListener('scroll', updateRange, { passive: true })
    return () => container.removeEventListener('scroll', updateRange)
  }, [updateRange])

  const totalHeight = items.length * itemHeight
  const slice = items.slice(range.start, range.end)

  return (
    <div
      ref={containerRef}
      className={`${listClassName} ${className}`.trim()}
      style={{ maxHeight, overflow: 'auto' }}
    >
      <ul className="virtual-list-inner" style={{ height: totalHeight, position: 'relative', margin: 0, padding: 0 }}>
        {slice.map((item, offset) => {
          const index = range.start + offset
          return (
            <li
              key={getItemKey(item, index)}
              className="virtual-list-item"
              style={{
                position: 'absolute',
                top: index * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
                listStyle: 'none',
              }}
            >
              {renderItem(item, index)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
