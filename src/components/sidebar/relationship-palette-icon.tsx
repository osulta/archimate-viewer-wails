import { useMemo } from 'react'
import { buildRelationshipPaletteSvgDataUrl } from '../../lib/archimate/relationship-palette-svg'

interface RelationshipPaletteIconProps {
  relationshipType: string
  width?: number
  height?: number
}

export function RelationshipPaletteIcon({
  relationshipType,
  width = 28,
  height = 20,
}: RelationshipPaletteIconProps): React.JSX.Element {
  const src = useMemo(() => buildRelationshipPaletteSvgDataUrl(relationshipType), [relationshipType])

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
