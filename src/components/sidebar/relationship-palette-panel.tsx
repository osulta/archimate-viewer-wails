import React from 'react'
import { CREATABLE_RELATIONSHIP_TYPE_OPTIONS } from '../../lib/archimate/notation'
import { setSidebarNewRelationshipDragData } from '../../lib/archimate/sidebar-drag'
import { RelationshipPaletteIcon } from './relationship-palette-icon'

const PALETTE_ICON_WIDTH = 28
const PALETTE_ICON_HEIGHT = 20

interface RelationshipPalettePanelProps {
  activeRelationshipType: string | null
  hasLinkSource: boolean
  onSelectRelationshipType: (type: string) => void
}

export function RelationshipPalettePanel({
  activeRelationshipType,
  hasLinkSource,
  onSelectRelationshipType,
}: RelationshipPalettePanelProps): React.JSX.Element {
  const isActive = Boolean(activeRelationshipType)

  function handleClick(relationshipType: string): void {
    onSelectRelationshipType(relationshipType)
  }

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>, relationshipType: string): void {
    setSidebarNewRelationshipDragData(event.dataTransfer, relationshipType)
    const preview = event.currentTarget.querySelector('img.element-palette-icon')
    if (preview instanceof HTMLImageElement) {
      event.dataTransfer.setDragImage(preview, preview.width / 2, preview.height / 2)
    }
    event.currentTarget.classList.add('is-dragging')
  }

  function handleDragEnd(event: React.DragEvent<HTMLButtonElement>): void {
    event.currentTarget.classList.remove('is-dragging')
  }

  return (
    <section
      className="relationship-palette-panel element-palette-compact create-object-panel"
      aria-label="Палитра новых связей"
    >
      <p className="element-palette-compact-title">Новые связи</p>
      <p className="relationship-palette-hint">
        {isActive
          ? hasLinkSource
            ? 'Кликните объект-назначение. Esc — сбросить.'
            : 'Кликните объект-источник, затем назначение. Esc — сбросить.'
          : 'Выберите тип, затем два объекта. Можно перетащить на объект.'}
      </p>
      <ul className="element-palette-icon-grid relationship-palette-icon-grid">
        {CREATABLE_RELATIONSHIP_TYPE_OPTIONS.map((option) => {
          const isSelected = activeRelationshipType === option.value
          return (
            <li key={option.value}>
              <button
                type="button"
                className={
                  isSelected
                    ? 'element-palette-icon-btn is-active'
                    : 'element-palette-icon-btn'
                }
                draggable
                title={option.label}
                aria-label={`${option.label} — создать связь на диаграмме`}
                aria-pressed={isSelected}
                onClick={() => handleClick(option.value)}
                onDragStart={(event) => handleDragStart(event, option.value)}
                onDragEnd={handleDragEnd}
              >
                <RelationshipPaletteIcon
                  relationshipType={option.value}
                  width={PALETTE_ICON_WIDTH}
                  height={PALETTE_ICON_HEIGHT}
                />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
