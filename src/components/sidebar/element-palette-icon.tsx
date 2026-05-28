import React, { useEffect, useRef } from 'react'
import { drawElementPalettePreview } from '../../lib/archimate/element-palette-draw'

const ICON_WIDTH = 44
const ICON_HEIGHT = 30

interface ElementPaletteIconProps {
  elementType: string
}

export function ElementPaletteIcon({ elementType }: ElementPaletteIconProps): React.JSX.Element {
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
    drawElementPalettePreview(ctx, elementType, ICON_WIDTH, ICON_HEIGHT)
  }, [elementType])

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
