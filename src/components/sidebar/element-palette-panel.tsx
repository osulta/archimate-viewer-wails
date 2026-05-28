import React from 'react'
import { CREATABLE_ELEMENT_TYPE_GROUPS } from '../../lib/archimate/notation'
import { setSidebarNewElementDragData } from '../../lib/archimate/sidebar-drag'
import { ElementPaletteIcon } from './element-palette-icon'

export function ElementPalettePanel(): React.JSX.Element {
  function handleDragStart(event: React.DragEvent<HTMLButtonElement>, elementType: string): void {
    setSidebarNewElementDragData(event.dataTransfer, elementType)
    const canvas = event.currentTarget.querySelector('canvas')
    if (canvas) {
      event.dataTransfer.setDragImage(canvas, canvas.width / 2, canvas.height / 2)
    }
    event.currentTarget.classList.add('is-dragging')
  }

  function handleDragEnd(event: React.DragEvent<HTMLButtonElement>): void {
    event.currentTarget.classList.remove('is-dragging')
  }

  return (
    <section className="element-palette-panel create-object-panel" aria-label="Палитра новых элементов">
      <h2 className="element-palette-heading">Новые элементы</h2>
      <p className="element-palette-hint">Перетащите тип на диаграмму. Имя задаётся в панели свойств после размещения.</p>
      <div className="element-palette-groups">
        {CREATABLE_ELEMENT_TYPE_GROUPS.map((group: { layer: string; label: string; options: { value: string; label: string }[] }, groupIndex: number) => (
          <details
            key={group.layer}
            className="element-palette-layer"
            open={groupIndex === 0}
          >
            <summary className="element-palette-layer-summary">{group.label}</summary>
            <ul className="element-palette-grid">
              {group.options.map((option: { value: string; label: string }) => (
                <li key={option.value}>
                  <button
                    type="button"
                    className="element-palette-item"
                    draggable
                    title={option.label}
                    aria-label={`${option.label} — перетащить на диаграмму`}
                    onDragStart={(event) => handleDragStart(event, option.value)}
                    onDragEnd={handleDragEnd}
                  >
                    <ElementPaletteIcon elementType={option.value} />
                    <span className="element-palette-item-label">{option.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  )
}
