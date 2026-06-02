import { Button, Empty, Space, Spin, Typography } from 'antd'
import { ReloadOutlined, SaveOutlined, SwapOutlined } from '@ant-design/icons'
import { Sidebar } from '../sidebar/sidebar'
import { DiagramCanvas } from '../diagram-canvas'
import { ObjectPropertiesPanel } from '../object-properties-panel'
import { GitSidebarInfoBlock, GitSidebarWorkflow } from '../git/git-workflow-blocks'
import type { useGitIntegration } from '../../hooks/use-git-integration'
import type { useSplitModelRuntime } from '../../hooks/use-split-model-runtime'
import type { ModelEditState } from '../../hooks/model-editor/use-model-edit-state'
import type { ModelSelectionState } from '../../hooks/model-editor/use-model-selection'
import type { ModelMutations } from '../../hooks/model-editor/use-model-mutations'
import type { ModelSaveHandlers } from '../../hooks/model-editor/use-model-save'
import type { Point } from '../../types/model'

type GitIntegration = ReturnType<typeof useGitIntegration>
type SplitModelRuntime = ReturnType<typeof useSplitModelRuntime>

export interface ModelingWorkspaceProps {
  git: GitIntegration
  editState: ModelEditState
  selection: ModelSelectionState
  mutations: ModelMutations
  save: ModelSaveHandlers
  splitRuntime: SplitModelRuntime
  onOpenCompareChanges: () => void
}

export function ModelingWorkspace({
  git,
  editState,
  selection,
  mutations,
  save,
  splitRuntime,
  onOpenCompareChanges,
}: ModelingWorkspaceProps) {
  const { model, error, elementOverrides, relationshipMetaOverrides, linkCreateMode, objectPropsTab, setObjectPropsTab, saveStatusMessage, modelSaving, pendingLinkType, linkCreateSourceId, pendingElementFocusRef } = editState

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
    handleSelectRelationshipType,
    handleSelectRelationshipFromProperties,
    handleSelectElementFromProperties,
  } = selection
  const saveTargetPath =
    git.modelLayout === 'split-files'
      ? (git.gitRepoPath ?? undefined)
      : (git.buildRepoModelWriteRelativePath() ?? undefined)

  return (
    <div className="layout">
      <Sidebar
        git={git}
        model={model}
        error={error}
        elementOverrides={elementOverrides}
        relationshipMetaOverrides={relationshipMetaOverrides}
        selectedElementId={selectedElementId}
        selectedRelationshipRef={selectedRelationshipRef}
        selectedDiagramId={selectedDiagramId}
        activeRelationshipType={pendingLinkType}
        linkCreateSourceId={linkCreateSourceId}
        onSelectRelationshipType={handleSelectRelationshipType}
        onReloadModel={save.handleReloadModel}
        onSaveEditedModel={save.handleSaveEditedModel}
        canSaveModel={Boolean(model)}
        modelLayoutHint={
          git.modelLayout === 'split-files'
            ? 'Модель: множество XML (split). Сохраняются изменённые файлы.'
            : ''
        }
        saveTargetPath={
          git.modelLayout === 'split-files'
            ? (git.gitRepoPath ?? undefined)
            : (git.buildRepoModelWriteRelativePath() ?? undefined)
        }
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
        onSelectRelationship={(relationshipId, diagramId) => {
          setSelectedNode(null)
          setSelectedElementId(null)
          setSelectedRelationshipRef(relationshipId)
          setSelectedBendpointIndex(null)
          if (diagramId) {
            setSelectedDiagramId(diagramId)
          }
        }}
        onSelectDiagram={handleSelectDiagram}
      />

      <main className="content">
        <div className="content-head">
          <div className="content-head-text">
            <Typography.Title level={3} style={{ margin: 0 }}>
              {selectedDiagram?.name ?? 'Диаграмма не выбрана'}
            </Typography.Title>
            <Typography.Text type="secondary">
              {selectedDiagram?.type ?? 'Canvas preview'}
            </Typography.Text>
          </div>
          <Space className="content-head-actions" size={8}>
            <Button
              icon={<ReloadOutlined />}
              title={
                saveTargetPath
                  ? `Заново загрузить модель из GIT_REPO_ROOT/${saveTargetPath}`
                  : 'Заново загрузить model.archimate из репозитория Git'
              }
              disabled={git.gitCommandLoading || git.modelLoading || splitRuntime.isDiagramLoading}
              onClick={() => void save.handleReloadModel?.()}
            >
              Обновить модель
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              title={
                saveTargetPath
                  ? `Перезаписать GIT_REPO_ROOT/${saveTargetPath}`
                  : 'Записать изменения в файл модели в репозитории Git'
              }
              loading={modelSaving}
              disabled={
                git.gitCommandLoading ||
                git.modelLoading ||
                splitRuntime.isDiagramLoading ||
                modelSaving ||
                !model
              }
              onClick={() => void save.handleSaveEditedModel?.()}
            >
              {modelSaving ? 'Сохранение…' : 'Сохранить модель'}
            </Button>
            {selectedDiagramId && model ? (
              <Button
                type="primary"
                ghost
                icon={<SwapOutlined />}
                className="content-compare-link"
                onClick={onOpenCompareChanges}
              >
                Сравнение изменений
              </Button>
            ) : null}
          </Space>
        </div>
        {splitRuntime.diagramLoadingId &&
        splitRuntime.diagramLoadingId === selectedDiagramId ? (
          <p className="content-diagram-loader" role="status" aria-live="polite">
            <Spin size="small" />
            Загрузка диаграммы…
          </p>
        ) : null}
        <GitSidebarInfoBlock
          className="content-git-info"
          gitOutput={git.gitOutput}
        />
        <GitSidebarWorkflow git={git} />
        <DiagramCanvas
          diagram={selectedDiagram?.loaded === false ? null : selectedDiagram}
          diagramExportName={selectedDiagram?.name}
          elementById={elementByIdForCanvas}
          relationshipById={relationshipByIdForUi}
          diagrams={model?.diagrams}
          selectedNodeId={selectedNode?.id ?? ''}
          selectedRelationshipRef={selectedRelationshipRef}
          linkCreateMode={linkCreateMode}
          linkCreateSourceId={linkCreateSourceId}
          onNodeSelect={(node) => {
            setSelectedNode(node)
            setSelectedElementId(node?.elementRef ?? null)
            if (node && !linkCreateMode) {
              setSelectedRelationshipRef(null)
              setSelectedBendpointIndex(null)
            }
          }}
          onNodeMove={(nodeId, dx, dy) => mutations.moveNode(selectedDiagramId, nodeId, dx, dy)}
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
        />
        {(selectedRelationshipRef && selectedRelationship) ||
        selectedNodeLive ||
        selectedElementId ||
        (selectedDiagramId && selectedDiagram) ? (
          <ObjectPropertiesPanel
            selectedRelationshipRef={selectedRelationshipRef}
            selectedRelationship={selectedRelationship}
            selectedNodeLive={selectedNodeLive}
            selectedElementId={selectedElementId}
            selectedElement={selectedElement}
            selectedDiagram={selectedDiagram}
            selectedDiagramId={selectedDiagramId}
            onUpdateDiagramMetadata={mutations.updateDiagramMetadata}
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
              setSelectedDiagramId(diagramId)
              setSelectedNode(nodes[0] ?? null)
              setSelectedElementId(selectedElementRefForUsage)
              setSelectedRelationshipRef(null)
            }}
            onUpdateNodeFillColor={(nodeId, fillColor) => {
              if (selectedDiagramId) {
                mutations.updateNodeFillColor(selectedDiagramId, nodeId, fillColor)
              }
            }}
            elementLoadingId={splitRuntime.elementLoadingId}
          />
        ) : (
          <Empty
            className="props-empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Выберите диаграмму, объект или связь, чтобы увидеть свойства."
          />
        )}
      </main>
    </div>
  )
}
