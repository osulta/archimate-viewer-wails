import { useMemo } from 'react'
import { Layout } from 'antd'
import './App.css'
import type { AppTab } from './app/types'
import { AppHeader } from './components/app-header'
import { AppTabPanel } from './components/app/app-tab-panel'
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
import { useDeferredTabMount } from './hooks/use-deferred-tab-mount'
import { useWorkspaceLayout } from './hooks/use-workspace-layout'

function App() {
  const app = useArchimateApp()
  const workspaceLayout = useWorkspaceLayout()
  const {
    appTab,
    handleAppTabChange,
    handleViewModeSelectDiagram,
    handleSelectDiagramWithUrl,
    handleSelectElementWithUrl,
    handleSelectRelationshipWithUrl,
    compareDiagramId,
    handleCompareDiagramChange,
    editState,
    selection,
    mutations,
    save,
    git,
    handleOpenCompareChanges,
  } = app

  const { model, error, elementOverrides, relationshipMetaOverrides, modelSaving } =
    editState

  const modelingMount = useDeferredTabMount(appTab === 'modeling')
  const viewModeMount = useDeferredTabMount(appTab === 'viewMode')

  const saveTargetPath = git.buildRepoModelWriteRelativePath() ?? undefined

  const headerExtraActions = useMemo(() => {
    if (appTab !== 'modeling') {
      return null
    }
    return (
      <ModelingHeaderActions
        saveTargetPath={saveTargetPath}
        modelSaving={modelSaving}
        modelLoading={git.modelLoading}
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
          <AppTabPanel
            shouldMount={modelingMount.shouldMount}
            isReady={modelingMount.isReady}
            loadingLabel="Загрузка режима моделирования…"
          >
            <ModelingWorkspace
              git={git}
              editState={editState}
              selection={selection}
              mutations={mutations}
              workspaceLayout={workspaceLayout}
              onSelectDiagram={handleSelectDiagramWithUrl}
              onSelectElement={handleSelectElementWithUrl}
              onSelectRelationship={handleSelectRelationshipWithUrl}
            />
          </AppTabPanel>
        ) : null}
        {appTab === 'changes' ? (
          <ChangesComparePanel
            model={model}
            selectedDiagramId={compareDiagramId}
            onSelectedDiagramIdChange={handleCompareDiagramChange}
            diagramOverrides={editState.diagramOverrides}
            relationshipOverrides={editState.relationshipOverrides}
            git={git}
            modelPath={git.buildRepoModelWriteRelativePath()}
          />
        ) : null}
        {appTab === 'linters' ? <LintersPanel model={model} /> : null}
        {appTab === 'assets' ? <AssetsPanel /> : null}
        {appTab === 'aiArchitect' ? <AiArchitectPanel /> : null}
        {appTab === 'adr' ? <AdrPanel /> : null}
        {appTab === 'viewMode' ? (
          <AppTabPanel
            shouldMount={viewModeMount.shouldMount}
            isReady={viewModeMount.isReady}
            loadingLabel="Загрузка режима просмотра…"
          >
            <ViewModePanel
              model={model}
              modelLoading={git.modelLoading}
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
              onSelectRelationshipFromProperties={handleSelectRelationshipWithUrl}
              onSelectElementFromProperties={handleSelectElementWithUrl}
              onCanvasNodeSelect={(node) => {
                if (node?.elementRef && selection.selectedDiagramId) {
                  handleSelectElementWithUrl(node.elementRef, {
                    diagramId: selection.selectedDiagramId,
                    node,
                  })
                  return
                }
                selection.setSelectedNode(node)
                selection.setSelectedElementId(node?.elementRef ?? null)
                if (node) {
                  selection.setSelectedRelationshipRef(null)
                }
              }}
              onCanvasRelationshipSelect={(ref) => {
                if (ref) {
                  handleSelectRelationshipWithUrl(ref)
                  return
                }
                selection.handleCanvasRelationshipSelect(null)
              }}
              onNavigateToDiagram={({ diagramId, node, elementId }) => {
                if (elementId) {
                  handleSelectElementWithUrl(elementId, {
                    diagramId,
                    node: node ?? undefined,
                  })
                  return
                }
                handleViewModeSelectDiagram(diagramId)
                selection.setSelectedNode(node ?? null)
                selection.setSelectedElementId(null)
                selection.setSelectedRelationshipRef(null)
              }}
              onSelectElement={handleSelectElementWithUrl}
              onSelectRelationship={handleSelectRelationshipWithUrl}
              onSelectDiagram={handleViewModeSelectDiagram}
              workspaceLayout={workspaceLayout}
            />
          </AppTabPanel>
        ) : null}
        {appTab === 'admin' ? <AdminPanel git={git} /> : null}
      </Layout.Content>
    </Layout>
  )
}

export default App
