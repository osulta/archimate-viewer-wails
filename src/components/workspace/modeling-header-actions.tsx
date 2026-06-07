import { Button, Space, Tooltip } from 'antd'
import {
  FullscreenExitOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  SaveOutlined,
  SwapOutlined,
} from '@ant-design/icons'

export interface ModelingHeaderActionsProps {
  saveTargetPath?: string
  modelSaving: boolean
  modelLoading: boolean
  gitCommandLoading: boolean
  canSaveModel: boolean
  canCompare: boolean
  canvasFocusMode: boolean
  onReloadModel?: () => void | Promise<void>
  onSaveEditedModel?: () => void | Promise<void>
  onOpenCompareChanges?: () => void
  onToggleCanvasFocus?: () => void
}

export function ModelingHeaderActions({
  saveTargetPath,
  modelSaving,
  modelLoading,
  gitCommandLoading,
  canSaveModel,
  canCompare,
  canvasFocusMode,
  onReloadModel,
  onSaveEditedModel,
  onOpenCompareChanges,
  onToggleCanvasFocus,
}: ModelingHeaderActionsProps) {
  const reloadTitle = saveTargetPath
    ? `Заново загрузить модель из GIT_REPO_ROOT/${saveTargetPath}`
    : 'Заново загрузить model.archimate из репозитория Git'
  const saveTitle = saveTargetPath
    ? `Перезаписать GIT_REPO_ROOT/${saveTargetPath}`
    : 'Записать изменения в файл модели в репозитории Git'
  const actionsDisabled = gitCommandLoading || modelLoading || modelSaving

  return (
    <Space className="modeling-header-actions" size={4}>
      <Tooltip title={reloadTitle}>
        <Button
          type="text"
          icon={<ReloadOutlined />}
          disabled={actionsDisabled}
          aria-label="Обновить модель"
          onClick={() => void onReloadModel?.()}
        />
      </Tooltip>
      <Tooltip title={saveTitle}>
        <Button
          type="text"
          icon={<SaveOutlined />}
          loading={modelSaving}
          disabled={actionsDisabled || !canSaveModel}
          aria-label={modelSaving ? 'Сохранение модели' : 'Сохранить модель'}
          onClick={() => void onSaveEditedModel?.()}
        />
      </Tooltip>
      {canCompare ? (
        <Tooltip title="Сравнение изменений текущей диаграммы">
          <Button
            type="text"
            icon={<SwapOutlined />}
            aria-label="Сравнение изменений"
            onClick={onOpenCompareChanges}
          />
        </Tooltip>
      ) : null}
      <Tooltip
        title={
          canvasFocusMode
            ? 'Выйти из полноэкранного canvas (Esc)'
            : 'Canvas на весь экран'
        }
      >
        <Button
          type={canvasFocusMode ? 'primary' : 'text'}
          icon={canvasFocusMode ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          aria-label={canvasFocusMode ? 'Выйти из полноэкранного canvas' : 'Canvas на весь экран'}
          aria-pressed={canvasFocusMode}
          onClick={onToggleCanvasFocus}
        />
      </Tooltip>
    </Space>
  )
}
