import { ElementPalettePanel } from '../sidebar/element-palette-panel'
import { RelationshipPalettePanel } from '../sidebar/relationship-palette-panel'

interface ModelingPalettesPanelProps {
  activeRelationshipType: string | null
  hasLinkSource: boolean
  onSelectRelationshipType: (type: string) => void
}

export function ModelingPalettesPanel({
  activeRelationshipType,
  hasLinkSource,
  onSelectRelationshipType,
}: ModelingPalettesPanelProps) {
  return (
    <div className="workspace-palettes-stack">
      <ElementPalettePanel />
      <RelationshipPalettePanel
        activeRelationshipType={activeRelationshipType}
        hasLinkSource={hasLinkSource}
        onSelectRelationshipType={onSelectRelationshipType}
      />
    </div>
  )
}
