import { useCallback, useMemo } from 'react'
import { Spin } from 'antd'
import { Sidebar } from '../sidebar/sidebar'
import { DiagramCanvas } from '../diagram-canvas'
import { WorkspaceCanvasLayout } from '../workspace/workspace-canvas-layout'
import { ModelingGitPanel } from '../workspace/modeling-git-panel'
import { ModelingInspectorPanel } from '../workspace/modeling-inspector-panel'
import { ModelingPalettesPanel } from '../workspace/modeling-palettes-panel'
import type { useGitIntegration } from '../../hooks/use-git-integration'
import type { useSplitModelRuntime } from '../../hooks/use-split-model-runtime'
import type { ModelEditState } from '../../hooks/model-editor/use-model-edit-state'
import type { ModelSelectionState } from '../../hooks/model-editor/use-model-selection'
import type { ModelMutations } from '../../hooks/model-editor/use-model-mutations'
import type { WorkspaceLayoutState } from '../../hooks/use-workspace-layout'
import type { Point } from '../../types/model'
import { resolveSelectedDiagramFolderInfo } from '../../lib/archimate/model-folder-tree'

type GitIntegration = ReturnType<typeof useGitIntegration>
type SplitModelRuntime = ReturnType<typeof useSplitModelRuntime>

export interface ModelingWorkspaceProps {
  git: GitIntegration
  editState: ModelEditState
  selection: ModelSelectionState
  mutations: ModelMutations
  splitRuntime: SplitModelRuntime
  workspaceLayout: WorkspaceLayoutState
}

export function ModelingWorkspace({
  git,
  editState,
  selection,
  mutations,
  splitRuntime,
  workspaceLayout,
}: ModelingWorkspaceProps) {
  const {
    model,
    error,
    elementOverrides,
    relationshipMetaOverrides,
    linkCreateMode,
    objectPropsTab,
    setObjectPropsTab,
    saveStatusMessage,
    modelSaving,
    pendingLinkType,
    linkCreateSourceId,
    pendingElementFocusRef,
  } = editState

  const {
    selectedDiagramId,
    setSelectedDiagramId,
    selectedNode,
    setSelectedNode,
    selectedElementId,
    setSelectedElementId,
    selectedRelationshipRef,
    setSelectedRelationshipRef,
    selectedBendpointIndex,
    setSelectedBendpointIndex,
    selectedDiagram,
    selectedElement,
    selectedNodeLive,
    selectedElementRefForUsage,
    diagramsUsingSelectedElement,
    selectedElementRelationships,
    relationshipByIdForUi,
    selectedRelationship,
    elementByIdForCanvas,
    handleSelectDiagram,
    handleSelectDiagramFolder,
    diagramTreeSelectedKey,
    handleSelectRelationshipType,
    handleSelectRelationshipFromProperties,
    handleSelectElementFromProperties,
  } = selection

  const selectedDiagramFolder = useMemo(() => {
    if (!model || !diagramTreeSelectedKey.startsWith('diagram-folder:')) {
      return null
    }
    return resolveSelectedDiagramFolderInfo(model, diagramTreeSelectedKey)
  }, [model, diagramTreeSelectedKey])

  const hasInspectorContent = Boolean(
    (selectedRelationshipRef && selectedRelationship) ||
      selectedNodeLive ||
      selectedElementId ||
      selectedDiagramFolder ||
      (selectedDiagramId && selectedDiagram),
  )

  const handleShowObjectProperties = useCallback(() => {
    workspaceLayout.setPropertiesOpen(true)
    if (workspaceLayout.canvasFocusMode) {
      workspaceLayout.toggleCanvasFocusMode()
    }
    setObjectPropsTab('details')
  }, [workspaceLayout, setObjectPropsTab])

  const sidebar = (
    <Sidebar
      git={git}
      model={model}
      error={error}
      elementOverrides={elementOverrides}
      relationshipMetaOverrides={relationshipMetaOverrides}
      selectedElementId={selectedElementId}
      selectedRelationshipRef={selectedRelationshipRef}
      selectedDiagramId={selectedDiagramId}
      onReloadModel={undefined}
      onSaveEditedModel={undefined}
      canSaveModel={Boolean(model)}
      saveStatusMessage={saveStatusMessage}
      modelActionLoading={git.gitCommandLoading}
      modelLoading={git.modelLoading || splitRuntime.isDiagramLoading}
      modelSaving={modelSaving}
      focusElementInDiagram={
        model?.format === 'split-files' ? splitRuntime.focusElementInDiagram : undefined
      }
      focusRelationshipInDiagram={
        model?.format === 'split-files' ? splitRuntime.focusRelationshipInDiagram : undefined
      }
      onCreateDiagram={mutations.createNewDiagram}
      onCreateFolder={mutations.createNewDiagramFolder}
      onSelectDiagram={handleSelectDiagram}
      onSelectDiagramFolder={handleSelectDiagramFolder}
      diagramTreeSelectedKey={diagramTreeSelectedKey}
      onSelectElement={(elementId, found) => {
        setSelectedRelationshipRef(null)
        if (found?.pending) {
          pendingElementFocusRef.current = elementId
          setSelectedDiagramId(found.diagramId)
          setSelectedElementId(elementId)
          setSelectedNode(null)
          return
        }
        setSelectedElementId(elementId)
        setSelectedNode(null)
        if (found?.node) {
          setSelectedDiagramId(found.diagramId)
          setSelectedNode(found.node)
        }
      }}
      onSelectRelationship={(relationshipId) => {
        setSelectedNode(null)
        setSelectedElementId(null)
        setSelectedRelationshipRef(relationshipId)
        setSelectedBendpointIndex(null)
      }}
    />
  )

  return (
    <WorkspaceCanvasLayout
      layout={workspaceLayout}
      sidebar={sidebar}
      diagramTitle={selectedDiagram?.name ?? 'Диаграмма не выбрана'}
      diagramMeta={selectedDiagram?.type ?? 'Canvas preview'}
      loader={
        splitRuntime.diagramLoadingId &&
        splitRuntime.diagramLoadingId === selectedDiagramId ? (
          <p className="content-diagram-loader" role="status" aria-live="polite">
            <Spin size="small" />
            Загрузка диаграммы…
          </p>
        ) : null
      }
      gitPanel={<ModelingGitPanel git={git} gitOutput={git.gitOutput} />}
      gitTitle="Git"
      gitBranchLabel={
        git.gitRepoProbe.hasDotGit && git.displayedGitBranch ? git.displayedGitBranch : undefined
      }
      canvas={
        <DiagramCanvas
          diagram={selectedDiagram?.loaded === false ? null : selectedDiagram}
          diagramExportName={selectedDiagram?.name}
          elementById={elementByIdForCanvas}
          relationshipById={relationshipByIdForUi}
          diagrams={model?.diagrams}
          selectedNodeId={selectedNode?.id ?? ''}
          selectedNodeIds={selection.selectedNodeIds}
          selectedRelationshipRef={selectedRelationshipRef}
          linkCreateMode={linkCreateMode}
          linkCreateSourceId={linkCreateSourceId}
          onNodeSelect={(node, options) => selection.handleCanvasNodeSelect(node, options)}
          onNodeMove={(nodeId, dx, dy) => mutations.moveNode(selectedDiagramId, nodeId, dx, dy)}
          onNodesMove={(nodeIds, dx, dy) => mutations.moveNodes(selectedDiagramId, nodeIds, dx, dy)}
          onNodeResize={(nodeId, dw, dh) => mutations.resizeNode(selectedDiagramId, nodeId, dw, dh)}
          onRelationshipSelect={(ref) => {
            setSelectedRelationshipRef(ref)
            setSelectedBendpointIndex(null)
            if (ref) {
              setSelectedNode(null)
              setSelectedElementId(null)
            }
          }}
          selectedBendpointIndex={selectedBendpointIndex}
          onBendpointSelect={setSelectedBendpointIndex}
          onRelationshipBendpointChange={mutations.updateRelationshipBendpoint}
          onRelationshipBendpointAdd={mutations.addRelationshipBendpoint}
          onRelationshipBendpointRemove={mutations.removeRelationshipBendpoint}
          onRelationshipEndpointChange={mutations.reassignRelationshipEndpoint}
          onLinkNodePick={mutations.pickLinkNode}
          onDropElementAtPoint={(elementId, x, y) =>
            mutations.placeElementOnDiagram(elementId, { x, y } as Point)
          }
          onDropNewElementAtPoint={(elementType, x, y) =>
            mutations.createNewObject(elementType, { x, y } as Point)
          }
          onDropNewRelationshipAtPoint={mutations.handleDropNewRelationshipAtPoint}
          onDropDiagramReferenceAtPoint={(diagramId, x, y) =>
            mutations.placeDiagramReferenceOnDiagram(diagramId, { x, y } as Point)
          }
          onOpenDiagramReference={handleSelectDiagram}
          onShowObjectProperties={handleShowObjectProperties}
          onDeleteNodeFromDiagram={mutations.deleteSelectedFromDiagram}
          onDeleteNodeFromModel={mutations.deleteElementFromModel}
          onDeleteConnectionFromDiagram={mutations.deleteSelectedConnectionFromDiagram}
          onDeleteRelationshipFromModel={mutations.deleteRelationshipFromModel}
        />
      }
      palettes={
        model ? (
          <ModelingPalettesPanel
            activeRelationshipType={pendingLinkType}
            hasLinkSource={Boolean(linkCreateSourceId)}
            onSelectRelationshipType={handleSelectRelationshipType}
          />
        ) : undefined
      }
      palettesTitle="Палитра"
      inspector={
        <ModelingInspectorPanel
          hasSelection={hasInspectorContent}
          selectedRelationshipRef={selectedRelationshipRef}
          selectedRelationship={selectedRelationship}
          selectedNodeLive={selectedNodeLive}
          selectedElementId={selectedElementId}
          selectedElement={selectedElement}
          selectedDiagram={selectedDiagram}
          selectedDiagramId={selectedDiagramId}
          selectedDiagramFolder={selectedDiagramFolder}
          diagramTreeSelectedKey={diagramTreeSelectedKey}
          onUpdateDiagramMetadata={mutations.updateDiagramMetadata}
          onUpdateDiagramFolderMetadata={mutations.updateDiagramFolderMetadata}
          selectedElementRelationships={selectedElementRelationships}
          diagramsUsingSelectedElement={diagramsUsingSelectedElement}
          objectPropsTab={objectPropsTab}
          onObjectPropsTabChange={setObjectPropsTab}
          elementById={model?.elementById}
          elementOverrides={elementOverrides}
          onUpdateElementOverride={mutations.updateElementOverride}
          onUpdateRelationshipMeta={mutations.updateRelationshipMetaOverride}
          onDeleteSelectedConnectionFromDiagram={mutations.deleteSelectedConnectionFromDiagram}
          onDeleteRelationshipFromModel={mutations.deleteRelationshipFromModel}
          onDeleteSelectedFromDiagram={mutations.deleteSelectedFromDiagram}
          onDeleteElementFromModel={mutations.deleteElementFromModel}
          onSelectRelationshipFromProperties={handleSelectRelationshipFromProperties}
          onSelectElementFromProperties={handleSelectElementFromProperties}
          onNavigateToDiagram={({ diagramId, nodes }) => {
            handleSelectDiagram(diagramId)
            setSelectedNode(nodes[0] ?? null)
            setSelectedElementId(null)
            setSelectedRelationshipRef(null)
          }}
          onUpdateNodeFillColor={(nodeId, fillColor) => {
            if (selectedDiagramId) {
              mutations.updateNodeFillColor(selectedDiagramId, nodeId, fillColor)
            }
          }}
          elementLoadingId={splitRuntime.elementLoadingId}
        />
      }
      inspectorTitle="Свойства"
    />
  )
}
