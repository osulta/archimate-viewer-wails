import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Empty, Select, Spin, TreeSelect, Typography } from 'antd'
import { DiagramCanvas } from '../diagram-canvas'
import {
  findDiagramInModel,
  resolveDiagramWithOverrides,
} from '../../lib/archimate/diagram-model'
import { buildDiagramTreeSelectData } from '../../lib/archimate/model-folder-tree'
import { computeDiagramCompareDiff } from '../../lib/archimate/diagram-compare'
import {
  fetchSingleFileModelAtRef,
  fetchSplitCompareBundleAtRef,
} from '../../lib/archimate/compare-model-load'
import { resolveDefaultCompareBranch } from '../../lib/git/resolve-default-compare-branch'
import { CompareCanvasSyncProvider } from './compare-canvas-sync'
import type {
  ParsedModel,
  DiagramOverridesMap,
  RelationshipOverridesMap,
} from '../../types/model'

function filterDiagramTreeNode(input: string, treeNode: { title?: unknown }): boolean {
  const needle = input.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return String(treeNode.title ?? '').toLowerCase().includes(needle)
}

function resolveModelManifestPath(modelPath: string | undefined | null, model: ParsedModel | null): string {
  const tracked = String(modelPath ?? '').trim()
  if (tracked) {
    return tracked
  }
  return model?.manifestPath ?? ''
}

interface GitIntegration {
  gitApiReady: boolean
  gitRepoProbe: { hasDotGit: boolean; currentBranch?: string }
  gitBranches: { list: Array<{ name: string }>; loading: boolean; defaultBranch?: string }
  loadGitBranches: (path?: string, options?: { fetch?: boolean }) => Promise<void>
  [key: string]: unknown
}

interface ChangesComparePanelProps {
  model: ParsedModel | null
  selectedDiagramId: string
  onSelectedDiagramIdChange: (diagramId: string) => void
  diagramOverrides: DiagramOverridesMap
  relationshipOverrides: RelationshipOverridesMap
  git: GitIntegration
  modelPath: string | null
  ensureDiagramLoaded?: (diagramId: string) => Promise<unknown>
}

export function ChangesComparePanel(props: ChangesComparePanelProps) {
  const {
    model,
    selectedDiagramId,
    onSelectedDiagramIdChange,
    diagramOverrides,
    relationshipOverrides,
    git,
    modelPath,
    ensureDiagramLoaded,
  } = props

  const { gitApiReady, gitRepoProbe, gitBranches, loadGitBranches } = git
  const isWailsDesktopRuntime =
    typeof window !== 'undefined' && window.location.protocol === 'wails:'
  const currentBranch = gitRepoProbe.currentBranch?.trim() || ''
  const isSplitModel = model?.format === 'split-files'

  const [compareBranch, setCompareBranch] = useState('')
  const [compareModel, setCompareModel] = useState<ParsedModel | null>(null)
  const [compareLoadState, setCompareLoadState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [compareError, setCompareError] = useState('')
  const [leftDiagramLoading, setLeftDiagramLoading] = useState(false)

  const manifestPath = useMemo(
    () => resolveModelManifestPath(modelPath, model),
    [modelPath, model],
  )

  const diagramOptions = useMemo(() => model?.diagrams ?? [], [model])

  const diagramTreeData = useMemo(
    () => buildDiagramTreeSelectData(diagramOptions),
    [diagramOptions],
  )

  const selectedDiagramStub = useMemo(
    () => diagramOptions.find((d) => d.id === selectedDiagramId) ?? null,
    [diagramOptions, selectedDiagramId],
  )

  useEffect(() => {
    if (!model?.diagrams?.length) {
      if (selectedDiagramId) {
        onSelectedDiagramIdChange?.('')
      }
      return
    }
    if (selectedDiagramId && model.diagrams.some((d) => d.id === selectedDiagramId)) {
      return
    }
    onSelectedDiagramIdChange?.(model.diagrams[0].id)
  }, [model, selectedDiagramId, onSelectedDiagramIdChange])

  useEffect(() => {
    if (!gitApiReady || !gitRepoProbe.hasDotGit) {
      return
    }
    void loadGitBranches(manifestPath || modelPath || undefined, { fetch: false })
  }, [gitApiReady, gitRepoProbe.hasDotGit, manifestPath, modelPath, loadGitBranches])

  const branchOptions = useMemo(() => {
    const names = gitBranches.list.map((b) => b.name).filter(Boolean)
    return [...new Set(names)]
  }, [gitBranches.list])

  useEffect(() => {
    if (compareBranch || branchOptions.length === 0) {
      return
    }
    setCompareBranch(
      resolveDefaultCompareBranch(branchOptions, {
        defaultBranch: gitBranches.defaultBranch,
      }),
    )
  }, [branchOptions, compareBranch, gitBranches.defaultBranch])

  const loadCompareBranch = useCallback(async () => {
    const pathForLoad = isSplitModel ? manifestPath : modelPath
    if (!pathForLoad || !compareBranch.trim()) {
      setCompareModel(null)
      setCompareLoadState('idle')
      setCompareError('')
      return
    }
    if (isSplitModel && !selectedDiagramStub?.sourceFile) {
      setCompareModel(null)
      setCompareLoadState('idle')
      setCompareError('')
      return
    }

    setCompareLoadState('loading')
    setCompareError('')
    try {
      const parsed = isSplitModel
        ? await fetchSplitCompareBundleAtRef(
            pathForLoad,
            compareBranch.trim(),
            selectedDiagramStub!.sourceFile!,
            selectedDiagramStub!.folderPath ?? '',
          )
        : await fetchSingleFileModelAtRef(pathForLoad, compareBranch.trim())
      setCompareModel(parsed)
      setCompareLoadState('done')
    } catch (err) {
      setCompareModel(null)
      setCompareLoadState('error')
      setCompareError(err instanceof Error ? err.message : String(err))
    }
  }, [
    compareBranch,
    isSplitModel,
    manifestPath,
    modelPath,
    selectedDiagramStub,
  ])

  useEffect(() => {
    void loadCompareBranch()
  }, [loadCompareBranch])

  useEffect(() => {
    if (!isSplitModel || !selectedDiagramId || !ensureDiagramLoaded) {
      return
    }
    const stub = model?.diagrams.find((d) => d.id === selectedDiagramId)
    if (stub?.loaded) {
      return
    }
    let cancelled = false
    setLeftDiagramLoading(true)
    void ensureDiagramLoaded(selectedDiagramId).finally(() => {
      if (!cancelled) {
        setLeftDiagramLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isSplitModel, selectedDiagramId, model?.diagrams, ensureDiagramLoaded])

  const leftDiagram = useMemo(() => {
    if (!model || !selectedDiagramId) {
      return null
    }
    const base = model.diagrams.find((d) => d.id === selectedDiagramId) ?? null
    if (!base) {
      return null
    }
    if (isSplitModel && !base.loaded) {
      return null
    }
    return resolveDiagramWithOverrides(base, diagramOverrides, relationshipOverrides, selectedDiagramId)
  }, [model, selectedDiagramId, diagramOverrides, relationshipOverrides, isSplitModel])

  const rightDiagram = useMemo(() => {
    if (!compareModel || !selectedDiagramStub) {
      return null
    }
    if (isSplitModel) {
      const diagram = compareModel.diagrams.find((d) => d.id === selectedDiagramId) ?? null
      return diagram?.loaded ? diagram : null
    }
    return findDiagramInModel(compareModel, selectedDiagramId, selectedDiagramStub.name)
  }, [compareModel, selectedDiagramId, selectedDiagramStub, isSplitModel])

  const leftTitle = currentBranch
    ? `Текущая ветка: ${currentBranch}`
    : 'Текущая модель (в памяти)'

  const compareDiff = useMemo(() => {
    if (!leftDiagram || !rightDiagram || !model || !compareModel) {
      return { changedNodeIds: [] as string[], changedConnectionIds: [] as string[] }
    }
    const { changedNodeIds, changedConnectionIds } = computeDiagramCompareDiff(
      leftDiagram,
      rightDiagram,
      model.elementById,
      compareModel.elementById,
    )
    return {
      changedNodeIds: [...changedNodeIds],
      changedConnectionIds: [...changedConnectionIds],
    }
  }, [leftDiagram, rightDiagram, model, compareModel])

  const pathForCompare = isSplitModel ? manifestPath : modelPath
  const pathMissingMessage = isSplitModel
    ? 'Путь к model/folder.xml в репозитории не определён.'
    : 'Путь к файлу модели в репозитории не определён.'

  const compareLoadingMessage = isSplitModel
    ? 'Загрузка диаграммы из ветки…'
    : 'Загрузка модели из ветки…'

  return (
    <main className="tab-page compare-page" role="tabpanel" aria-label="Сравнение изменений">
      <div className="tab-page-head">
        <Typography.Title level={3}>Сравнение изменений</Typography.Title>
        <Typography.Paragraph type="secondary">
          Сравнение диаграммы в текущей модели с версией из другой ветки
          {isSplitModel ? ' (split XML).' : '.'}
        </Typography.Paragraph>
      </div>

      <section className="compare-toolbar" aria-label="Параметры сравнения">
        <label className="git-label compare-toolbar-field">
          <span>Диаграмма</span>
          <TreeSelect
            showSearch
            treeNodeFilterProp="title"
            filterTreeNode={filterDiagramTreeNode}
            treeDefaultExpandAll
            value={selectedDiagramId || undefined}
            onChange={(value) => onSelectedDiagramIdChange?.(String(value))}
            disabled={!model || diagramOptions.length === 0}
            placeholder="— нет диаграмм —"
            treeData={diagramTreeData}
            notFoundContent="Диаграммы не найдены"
          />
        </label>
        <label className="git-label compare-toolbar-field">
          <span>Сравнить с веткой</span>
          <Select
            value={compareBranch || undefined}
            onChange={(value) => setCompareBranch(value)}
            disabled={!gitRepoProbe.hasDotGit || gitBranches.loading || branchOptions.length === 0}
            placeholder="— нет веток —"
            options={branchOptions.map((name) => ({
              value: name,
              label: `${name}${name === currentBranch ? ' (текущая)' : ''}`,
            }))}
          />
        </label>
      </section>

      {!model ? (
        <Empty
          className="compare-empty"
          description="Загрузите модель на вкладке «Моделирование» или клонируйте репозиторий в «Администрирование» → Git."
        />
      ) : !gitApiReady ? (
        <Empty
          className="compare-empty"
          description={
            isWailsDesktopRuntime
              ? 'Локальный API недоступен. Перезапустите приложение.'
              : 'API недоступен. Запустите npm run dev.'
          }
        />
      ) : !gitRepoProbe.hasDotGit ? (
        <Empty
          className="compare-empty"
          description="Репозиторий не найден. Настройте Git в «Администрирование» → Git."
        />
      ) : !pathForCompare ? (
        <Empty className="compare-empty" description={pathMissingMessage} />
      ) : (
        <CompareCanvasSyncProvider resetKey={selectedDiagramId}>
          <div className="compare-columns">
            <section className="compare-column" aria-label={leftTitle}>
              <Typography.Title level={5} className="compare-column-title">
                {leftTitle}
              </Typography.Title>
              {leftDiagramLoading ? (
                <p className="compare-empty">
                  <Spin size="small" /> Загрузка диаграммы…
                </p>
              ) : !leftDiagram ? (
                <Empty className="compare-empty" description="Диаграмма не найдена в текущей модели." />
              ) : (
                <DiagramCanvas
                  readOnly
                  diagram={leftDiagram}
                  diagramExportName={leftDiagram.name}
                  elementById={model.elementById}
                  relationshipById={model.relationshipById}
                  highlightNodeIds={compareDiff.changedNodeIds}
                  highlightConnectionIds={compareDiff.changedConnectionIds}
                />
              )}
            </section>

            <section className="compare-column" aria-label={`Ветка: ${compareBranch || '—'}`}>
              <Typography.Title level={5} className="compare-column-title">
                Ветка: {compareBranch || '—'}
                {compareLoadState === 'loading' ? ' (загрузка…)' : ''}
              </Typography.Title>
              {compareLoadState === 'error' ? (
                <Alert type="error" showIcon message={compareError} />
              ) : compareLoadState === 'loading' ? (
                <p className="compare-empty">
                  <Spin size="small" /> {compareLoadingMessage}
                </p>
              ) : !compareBranch ? (
                <Empty className="compare-empty" description="Выберите ветку для сравнения." />
              ) : !rightDiagram ? (
                <Empty
                  className="compare-empty"
                  description={`Диаграмма «${selectedDiagramStub?.name ?? selectedDiagramId}» не найдена в этой ветке.`}
                />
              ) : (
                <DiagramCanvas
                  readOnly
                  diagram={rightDiagram}
                  diagramExportName={rightDiagram.name}
                  elementById={compareModel!.elementById}
                  relationshipById={compareModel!.relationshipById}
                />
              )}
            </section>
          </div>
        </CompareCanvasSyncProvider>
      )}
    </main>
  )
}
