import React from 'react'
import { CREATABLE_RELATIONSHIP_TYPE_OPTIONS } from '../../lib/archimate/notation'
import { setSidebarNewRelationshipDragData } from '../../lib/archimate/sidebar-drag'
import { RelationshipPaletteIcon } from './relationship-palette-icon'

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
    <section
      className="relationship-palette-panel create-object-panel"
      aria-label="Палитра новых связей"
    >
      <h2 className="element-palette-heading">Новые связи</h2>
      <p className="element-palette-hint">
        {isActive
          ? hasLinkSource
            ? 'Кликните объект-назначение на диаграмме. Esc — сбросить выбор.'
            : 'Кликните объект-источник, затем объект-назначение. Esc — сбросить.'
          : 'Выберите тип связи, затем два объекта на диаграмме. Можно перетащить тип на объект.'}
      </p>
      <ul className="element-palette-grid relationship-palette-grid">
        {CREATABLE_RELATIONSHIP_TYPE_OPTIONS.map((option: { value: string; label: string }) => {
          const isSelected = activeRelationshipType === option.value
          return (
            <li key={option.value}>
              <button
                type="button"
                className={
                  isSelected
                    ? 'element-palette-item is-active'
                    : 'element-palette-item'
                }
                draggable
                title={option.label}
                aria-label={`${option.label} — создать связь на диаграмме`}
                aria-pressed={isSelected}
                onClick={() => handleClick(option.value)}
                onDragStart={(event) => handleDragStart(event, option.value)}
                onDragEnd={handleDragEnd}
              >
                <RelationshipPaletteIcon relationshipType={option.value} />
                <span className="element-palette-item-label">{option.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
