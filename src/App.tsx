import { useMemo } from 'react'
import { Layout } from 'antd'
import './App.css'
import type { AppTab } from './app/types'
import { AppHeader } from './components/app-header'
import { ModelingWorkspace } from './components/app'
import { ChangesComparePanel } from './components/changes/changes-compare-panel'
import { LintersPanel } from './components/linters/linters-panel'
import { AssetsPanel } from './components/assets/assets-panel'
import { AiArchitectPanel } from './components/ai-architect/ai-architect-panel'
import { AdrPanel } from './components/adr/adr-panel'
import { ViewModePanel } from './components/view-mode/view-mode-panel'
import { AdminPanel } from './components/admin/admin-panel'
import { ModelingHeaderActions } from './components/workspace/modeling-header-actions'
import { useArchimateApp } from './hooks/model-editor/use-archimate-app'
import { useWorkspaceLayout } from './hooks/use-workspace-layout'

function App() {
  const app = useArchimateApp()
  const workspaceLayout = useWorkspaceLayout()
  const {
    appTab,
    handleAppTabChange,
    handleViewModeSelectDiagram,
    compareDiagramId,
    setCompareDiagramId,
    editState,
    selection,
    mutations,
    save,
    git,
    splitRuntime,
    handleOpenCompareChanges,
  } = app

  const { model, error, elementOverrides, relationshipMetaOverrides, pendingElementFocusRef, modelSaving } =
    editState

  const saveTargetPath =
    git.modelLayout === 'split-files'
      ? (git.gitRepoPath ?? undefined)
      : (git.buildRepoModelWriteRelativePath() ?? undefined)

  const headerExtraActions = useMemo(() => {
    if (appTab !== 'modeling') {
      return null
    }
    return (
      <ModelingHeaderActions
        saveTargetPath={saveTargetPath}
        modelSaving={modelSaving}
        modelLoading={git.modelLoading || splitRuntime.isDiagramLoading}
        gitCommandLoading={git.gitCommandLoading}
        canSaveModel={Boolean(model)}
        canCompare={Boolean(selection.selectedDiagramId && model)}
        canvasFocusMode={workspaceLayout.canvasFocusMode}
        onReloadModel={save.handleReloadModel}
        onSaveEditedModel={save.handleSaveEditedModel}
        onOpenCompareChanges={handleOpenCompareChanges}
        onToggleCanvasFocus={workspaceLayout.toggleCanvasFocusMode}
      />
    )
  }, [
    appTab,
    saveTargetPath,
    modelSaving,
    git.modelLoading,
    git.gitCommandLoading,
    splitRuntime.isDiagramLoading,
    model,
    selection.selectedDiagramId,
    workspaceLayout.canvasFocusMode,
    workspaceLayout.toggleCanvasFocusMode,
    save.handleReloadModel,
    save.handleSaveEditedModel,
    handleOpenCompareChanges,
  ])

  return (
    <Layout className="app-shell">
      <AppHeader
        activeTab={appTab}
        onTabChange={(tab) => handleAppTabChange(tab as AppTab)}
        canUndo={mutations.canvasHistory.canUndo}
        canRedo={mutations.canvasHistory.canRedo}
        undoLabel={mutations.canvasHistory.undoLabel}
        redoLabel={mutations.canvasHistory.redoLabel}
        onUndo={mutations.undoCanvasCommand}
        onRedo={mutations.redoCanvasCommand}
        extraActions={headerExtraActions}
      />
      <Layout.Content className="app-body">
        {appTab === 'modeling' ? (
          <ModelingWorkspace
            git={git}
            editState={editState}
            selection={selection}
            mutations={mutations}
            splitRuntime={splitRuntime}
            workspaceLayout={workspaceLayout}
          />
        ) : null}
        {appTab === 'changes' ? (
          <ChangesComparePanel
            model={model}
            selectedDiagramId={compareDiagramId}
            onSelectedDiagramIdChange={setCompareDiagramId}
            diagramOverrides={editState.diagramOverrides}
            relationshipOverrides={editState.relationshipOverrides}
            git={git}
            modelPath={git.buildRepoModelWriteRelativePath()}
            ensureDiagramLoaded={
              model?.format === 'split-files' ? splitRuntime.ensureDiagramLoaded : undefined
            }
          />
        ) : null}
        {appTab === 'linters' ? <LintersPanel model={model} /> : null}
        {appTab === 'assets' ? <AssetsPanel /> : null}
        {appTab === 'aiArchitect' ? <AiArchitectPanel /> : null}
        {appTab === 'adr' ? <AdrPanel /> : null}
        {appTab === 'viewMode' ? (
          <ViewModePanel
            model={model}
            modelLoading={git.modelLoading || splitRuntime.isDiagramLoading}
            focusElementInDiagram={
              model?.format === 'split-files' ? splitRuntime.focusElementInDiagram : undefined
            }
            focusRelationshipInDiagram={
              model?.format === 'split-files' ? splitRuntime.focusRelationshipInDiagram : undefined
            }
            error={error}
            elementOverrides={elementOverrides}
            relationshipMetaOverrides={relationshipMetaOverrides}
            selectedElementId={selection.selectedElementId}
            selectedRelationshipRef={selection.selectedRelationshipRef}
            selectedDiagramId={selection.selectedDiagramId}
            selectedDiagram={selection.selectedDiagram}
            elementByIdForCanvas={selection.elementByIdForCanvas}
            selectedNodeLive={selection.selectedNodeLive}
            selectedElement={selection.selectedElement}
            selectedRelationship={selection.selectedRelationship}
            selectedElementRefForUsage={selection.selectedElementRefForUsage}
            diagramsUsingSelectedElement={selection.diagramsUsingSelectedElement}
            selectedElementRelationships={selection.selectedElementRelationships}
            onSelectRelationshipFromProperties={selection.handleSelectRelationshipFromProperties}
            onSelectElementFromProperties={selection.handleSelectElementFromProperties}
            onCanvasNodeSelect={(node) => {
              selection.setSelectedNode(node)
              selection.setSelectedElementId(node?.elementRef ?? null)
              if (node) {
                selection.setSelectedRelationshipRef(null)
              }
            }}
            onCanvasRelationshipSelect={(ref) => {
              selection.setSelectedRelationshipRef(ref)
              if (ref) {
                selection.setSelectedNode(null)
                selection.setSelectedElementId(null)
              }
            }}
            onNavigateToDiagram={({ diagramId, node, elementId }) => {
              handleViewModeSelectDiagram(diagramId)
              selection.setSelectedNode(node ?? null)
              selection.setSelectedElementId(elementId)
              selection.setSelectedRelationshipRef(null)
            }}
            onSelectElement={(elementId, found) => {
              selection.setSelectedRelationshipRef(null)
              if (found?.pending) {
                pendingElementFocusRef.current = elementId
                handleViewModeSelectDiagram(found.diagramId)
                selection.setSelectedElementId(elementId)
                selection.setSelectedNode(null)
                return
              }
              selection.setSelectedElementId(elementId)
              selection.setSelectedNode(null)
              if (found?.node) {
                handleViewModeSelectDiagram(found.diagramId)
                selection.setSelectedNode(found.node)
              }
            }}
            onSelectRelationship={(relationshipId, diagramId) => {
              selection.setSelectedNode(null)
              selection.setSelectedElementId(null)
              selection.setSelectedRelationshipRef(relationshipId)
              selection.setSelectedBendpointIndex(null)
              if (diagramId) {
                handleViewModeSelectDiagram(diagramId)
              }
            }}
            onSelectDiagram={handleViewModeSelectDiagram}
            workspaceLayout={workspaceLayout}
          />
        ) : null}
        {appTab === 'admin' ? <AdminPanel git={git} /> : null}
      </Layout.Content>
    </Layout>
  )
}

export default App
