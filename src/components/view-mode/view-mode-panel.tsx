import { useMemo } from 'react'
import { Empty, Typography } from 'antd'
import { DiagramCanvas } from '../diagram-canvas'
import { collectConnectionIdsForDiagramNode } from '../../lib/archimate/diagram-model'
import { Sidebar } from '../sidebar/sidebar'
import { ViewModeProperties } from './view-mode-properties'
import type {
  ParsedModel,
  ParsedDiagram,
  ParsedElement,
  ParsedRelationship,
  DiagramNode,
  ElementOverride,
  RelationshipMetaOverride,
} from '../../types/model'

interface DiagramUsage {
  diagram: { id: string; name: string; folderPath?: string }
  nodes: DiagramNode[]
}

interface ElementRelationshipEntry {
  relationship: ParsedRelationship
  direction: 'incoming' | 'outgoing' | 'self'
  otherElementId: string
}

interface NavigateToDiagramPayload {
  diagramId: string
  node?: DiagramNode | null
  elementId: string
}

interface ElementFoundPayload {
  diagramId: string
  node?: DiagramNode | null
  pending?: boolean
}

interface ViewModePanelProps {
  model: ParsedModel | null
  error: string
  elementOverrides: Map<string, ElementOverride>
  relationshipMetaOverrides: Map<string, RelationshipMetaOverride>
  selectedElementId: string | null
  selectedRelationshipRef: string | null
  selectedDiagramId: string
  selectedDiagram: ParsedDiagram | null
  elementByIdForCanvas: Map<string, ParsedElement>
  selectedNodeLive: DiagramNode | null
  selectedElement: ParsedElement | null
  selectedRelationship: ParsedRelationship | null
  selectedElementRefForUsage: string
  diagramsUsingSelectedElement: DiagramUsage[]
  selectedElementRelationships: ElementRelationshipEntry[]
  onSelectRelationshipFromProperties: (relationshipId: string) => void
  onSelectElementFromProperties: (elementId: string) => void
  onSelectElement: (elementId: string, found?: ElementFoundPayload | null) => void
  onSelectRelationship: (relationshipId: string, diagramId?: string | null) => void
  onSelectDiagram: (diagramId: string) => void
  modelLoading?: boolean
  focusElementInDiagram?: (elementId: string) => { diagramId: string | null; node: DiagramNode | null; pending: boolean }
  focusRelationshipInDiagram?: (relationshipId: string) => string | null
  onCanvasNodeSelect: (node: DiagramNode | null) => void
  onCanvasRelationshipSelect: (ref: string | null) => void
  onNavigateToDiagram: (payload: NavigateToDiagramPayload) => void
}

export function ViewModePanel(props: ViewModePanelProps) {
  const {
    model,
    error,
    elementOverrides,
    relationshipMetaOverrides,
    selectedElementId,
    selectedRelationshipRef,
    selectedDiagramId,
    selectedDiagram,
    elementByIdForCanvas,
    selectedNodeLive,
    selectedElement,
    selectedRelationship,
    selectedElementRefForUsage,
    diagramsUsingSelectedElement,
    selectedElementRelationships,
    onSelectRelationshipFromProperties,
    onSelectElementFromProperties,
    onSelectElement,
    onSelectRelationship,
    onSelectDiagram,
    modelLoading = false,
    focusElementInDiagram,
    focusRelationshipInDiagram,
    onCanvasNodeSelect,
    onCanvasRelationshipSelect,
    onNavigateToDiagram,
  } = props

  const selectedNodeId = selectedNodeLive?.id ?? ''

  const flowConnectionIds = useMemo(() => {
    if (!selectedDiagram || !selectedNodeId || selectedRelationshipRef) {
      return []
    }
    return collectConnectionIdsForDiagramNode(selectedDiagram, selectedNodeId)
  }, [selectedDiagram, selectedNodeId, selectedRelationshipRef])

  return (
    <div className="layout view-mode-layout" role="tabpanel" aria-label="Режим просмотра">
      <Sidebar
        variant="view"
        model={model}
        error={error}
        elementOverrides={elementOverrides}
        relationshipMetaOverrides={relationshipMetaOverrides}
        selectedElementId={selectedElementId}
        selectedRelationshipRef={selectedRelationshipRef}
        selectedDiagramId={selectedDiagramId}
        onSelectElement={onSelectElement}
        onSelectRelationship={onSelectRelationship}
        onSelectDiagram={onSelectDiagram}
        modelLoading={modelLoading}
        focusElementInDiagram={focusElementInDiagram}
        focusRelationshipInDiagram={focusRelationshipInDiagram}
      />

      <main className="content view-mode-content">
        <div className="content-head">
          <div className="content-head-text">
            <Typography.Title level={3} style={{ margin: 0 }}>
              {selectedDiagram?.name ?? 'Диаграмма не выбрана'}
            </Typography.Title>
            <Typography.Text type="secondary">
              {selectedDiagram?.type ?? 'Режим просмотра'}
            </Typography.Text>
          </div>
        </div>

        {!model ? (
          <Empty
            className="view-mode-empty"
            description="Загрузите модель на вкладке «Моделирование» или клонируйте репозиторий в «Администрирование» → Git."
          />
        ) : !selectedDiagram ? (
          <Empty className="view-mode-empty" description="Выберите диаграмму в дереве слева." />
        ) : (
          <>
            <DiagramCanvas
              readOnly
              diagram={selectedDiagram}
              diagramExportName={selectedDiagram.name}
              elementById={elementByIdForCanvas}
              relationshipById={model.relationshipById}
              selectedNodeId={selectedNodeId}
              selectedRelationshipRef={selectedRelationshipRef}
              flowConnectionIds={flowConnectionIds}
              animateConnectionFlow={flowConnectionIds.length > 0}
              onNodeSelect={onCanvasNodeSelect}
              onRelationshipSelect={onCanvasRelationshipSelect}
            />
            <ViewModeProperties
              selectedRelationship={selectedRelationship}
              selectedRelationshipRef={selectedRelationshipRef}
              selectedNodeLive={selectedNodeLive}
              selectedElement={selectedElement}
              selectedElementId={selectedElementId}
              selectedElementRefForUsage={selectedElementRefForUsage}
              selectedDiagramId={selectedDiagramId}
              diagramsUsingSelectedElement={diagramsUsingSelectedElement}
              selectedElementRelationships={selectedElementRelationships}
              elementById={elementByIdForCanvas}
              elementOverrides={elementOverrides}
              onSelectRelationship={onSelectRelationshipFromProperties}
              onSelectElement={onSelectElementFromProperties}
              onNavigateToDiagram={onNavigateToDiagram}
            />
          </>
        )}
      </main>
    </div>
  )
}
