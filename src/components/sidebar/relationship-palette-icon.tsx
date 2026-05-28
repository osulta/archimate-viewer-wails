import React, { useEffect, useRef } from 'react'
import { drawRelationshipPalettePreview } from '../../lib/archimate/relationship-palette-draw'

const ICON_WIDTH = 44
const ICON_HEIGHT = 30

interface RelationshipPaletteIconProps {
  relationshipType: string
}

export function RelationshipPaletteIcon({ relationshipType }: RelationshipPaletteIconProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    drawRelationshipPalettePreview(ctx, relationshipType, ICON_WIDTH, ICON_HEIGHT)
  }, [relationshipType])

  return (
    <canvas
      ref={canvasRef}
      className="element-palette-icon"
      width={ICON_WIDTH}
      height={ICON_HEIGHT}
      aria-hidden="true"
    />
  )
}
