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
import { useArchimateApp } from './hooks/model-editor/use-archimate-app'

function App() {
  const app = useArchimateApp()
  const {
    appTab,
    setAppTab,
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

  const { model, error, elementOverrides, relationshipMetaOverrides, pendingElementFocusRef } =
    editState

  return (
    <Layout className="app-shell">
      <AppHeader
        activeTab={appTab}
        onTabChange={(tab) => setAppTab(tab as AppTab)}
        canUndo={mutations.canvasHistory.canUndo}
        canRedo={mutations.canvasHistory.canRedo}
        undoLabel={mutations.canvasHistory.undoLabel}
        redoLabel={mutations.canvasHistory.redoLabel}
        onUndo={mutations.undoCanvasCommand}
        onRedo={mutations.redoCanvasCommand}
      />
      <Layout.Content className="app-body">
        {appTab === 'modeling' ? (
          <ModelingWorkspace
            git={git}
            editState={editState}
            selection={selection}
            mutations={mutations}
            save={save}
            splitRuntime={splitRuntime}
            onOpenCompareChanges={handleOpenCompareChanges}
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
              selection.setSelectedDiagramId(diagramId)
              selection.setSelectedNode(node ?? null)
              selection.setSelectedElementId(elementId)
              selection.setSelectedRelationshipRef(null)
            }}
            onSelectElement={(elementId, found) => {
              selection.setSelectedRelationshipRef(null)
              if (found?.pending) {
                pendingElementFocusRef.current = elementId
                selection.setSelectedDiagramId(found.diagramId)
                selection.setSelectedElementId(elementId)
                selection.setSelectedNode(null)
                return
              }
              selection.setSelectedElementId(elementId)
              selection.setSelectedNode(null)
              if (found?.node) {
                selection.setSelectedDiagramId(found.diagramId)
                selection.setSelectedNode(found.node)
              }
            }}
            onSelectRelationship={(relationshipId, diagramId) => {
              selection.setSelectedNode(null)
              selection.setSelectedElementId(null)
              selection.setSelectedRelationshipRef(relationshipId)
              selection.setSelectedBendpointIndex(null)
              if (diagramId) {
                selection.setSelectedDiagramId(diagramId)
              }
            }}
            onSelectDiagram={selection.handleSelectDiagram}
          />
        ) : null}
        {appTab === 'admin' ? <AdminPanel git={git} /> : null}
      </Layout.Content>
    </Layout>
  )
}

export default App
