import type { DragEvent } from 'react'
import { CREATABLE_ELEMENT_TYPE_GROUPS, LAYER_STYLES } from '../../lib/archimate/notation'
import { setSidebarNewElementDragData } from '../../lib/archimate/sidebar-drag'
import type { LayerName } from '../../types/model'
import { ElementPaletteIcon } from './element-palette-icon'

const PALETTE_ICON_WIDTH = 28
const PALETTE_ICON_HEIGHT = 20

export function ElementPalettePanel() {
  function handleDragStart(event: DragEvent<HTMLButtonElement>, elementType: string): void {
    setSidebarNewElementDragData(event.dataTransfer, elementType)
    const preview = event.currentTarget.querySelector('img.element-palette-icon')
    if (preview instanceof HTMLImageElement) {
      event.dataTransfer.setDragImage(preview, preview.width / 2, preview.height / 2)
    }
    event.currentTarget.classList.add('is-dragging')
  }

  function handleDragEnd(event: DragEvent<HTMLButtonElement>): void {
    event.currentTarget.classList.remove('is-dragging')
  }

  return (
    <section
      className="element-palette-panel element-palette-compact create-object-panel"
      aria-label="Палитра новых элементов"
    >
      <p className="element-palette-compact-title">Новые элементы</p>
      <ul className="element-palette-layer-list">
        {CREATABLE_ELEMENT_TYPE_GROUPS.map((group) => {
          const layerStyle = LAYER_STYLES[group.layer as LayerName] ?? LAYER_STYLES.generic
          return (
            <li
              key={group.layer}
              className="element-palette-layer"
              style={{ backgroundColor: layerStyle.fill }}
              aria-label={group.label}
            >
              <ul className="element-palette-icon-grid">
                {group.options.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      className="element-palette-icon-btn"
                      draggable
                      title={option.label}
                      aria-label={`${option.label} — перетащить на диаграмму`}
                      onDragStart={(event) => handleDragStart(event, option.value)}
                      onDragEnd={handleDragEnd}
                    >
                      <ElementPaletteIcon
                        elementType={option.value}
                        width={PALETTE_ICON_WIDTH}
                        height={PALETTE_ICON_HEIGHT}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
