import { useMemo } from 'react'
import { buildElementPaletteSvgDataUrl } from '../../lib/archimate/element-palette-svg'

interface ElementPaletteIconProps {
  elementType: string
  width?: number
  height?: number
}

export function ElementPaletteIcon({
  elementType,
  width = 28,
  height = 20,
}: ElementPaletteIconProps) {
  const src = useMemo(() => buildElementPaletteSvgDataUrl(elementType), [elementType])

  return (
    <img
      src={src}
      className="element-palette-icon"
      width={width}
      height={height}
      alt=""
      draggable={false}
    />
  )
}
