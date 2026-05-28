import { useCallback, useState } from 'react'
import { linters } from '../../../linters/index'
import type { ParsedModel } from '../../types/model'

interface LinterFinding {
  elementId: string
  name: string
  type: string
}

interface LinterResult {
  message: string
  findings: LinterFinding[]
  findingsStyle?: string
}

function formatElementType(type: string | undefined | null): string {
  const raw = String(type ?? '').trim()
  if (!raw) {
    return '—'
  }
  return raw.replace(/^archimate:/i, '')
}

interface LintersPanelProps {
  model: ParsedModel | null
}

export function LintersPanel(props: LintersPanelProps) {
  const { model } = props
  const [resultsById, setResultsById] = useState<Record<string, LinterResult>>(() => ({}))
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(linters.map((item) => [item.id, true])),
  )

  const handleToggleExpanded = useCallback((linterId: string) => {
    setExpandedById((prev) => ({ ...prev, [linterId]: !prev[linterId] }))
  }, [])

  const handleRunLinter = useCallback(
    (linterId: string) => {
      const linter = linters.find((item) => item.id === linterId)
      if (!linter) {
        return
      }
      const result = linter.run(model ?? null)
      setResultsById((prev) => ({ ...prev, [linterId]: result }))
    },
    [model],
  )

  const handleRunAll = useCallback(() => {
    const next: Record<string, LinterResult> = {}
    for (const linter of linters) {
      next[linter.id] = linter.run(model ?? null)
    }
    setResultsById(next)
  }, [model])

  return (
    <main className="tab-page linters-page" role="tabpanel" aria-label="Линтеры">
      <div className="tab-page-head">
        <h2>Линтеры</h2>
        <p>Проверки целостности и качества модели ArchiMate.</p>
      </div>

      {!model ? (
        <p className="linters-empty">
          Загрузите модель на вкладке «Моделирование» или клонируйте репозиторий в «Администрирование» → Git.
        </p>
      ) : (
        <>
          <div className="linters-toolbar">
            <button type="button" className="save-btn linters-run-all" onClick={handleRunAll}>
              Запустить все
            </button>
          </div>
          <ul className="linters-list">
            {linters.map((linter) => {
              const result = resultsById[linter.id]
              const hasRun = result != null
              const isExpanded = expandedById[linter.id] !== false

              return (
                <li key={linter.id} className="linter-card">
                  <div className="linter-card-head">
                    <div className="linter-card-text">
                      <button
                        type="button"
                        className="linter-card-title"
                        aria-expanded={isExpanded}
                        onClick={() => handleToggleExpanded(linter.id)}
                      >
                        {linter.title}
                      </button>
                      <p className="linter-card-desc">{linter.description}</p>
                    </div>
                    <button
                      type="button"
                      className="git-action-btn linter-run-btn"
                      onClick={() => handleRunLinter(linter.id)}
                    >
                      Запустить
                    </button>
                  </div>
                  {!hasRun ? (
                    <p className="linter-result linter-result-idle">
                      Проверка ещё не запускалась.
                    </p>
                  ) : isExpanded ? (
                    <>
                      <p
                        className={
                          result.findings.length > 0 &&
                          result.findingsStyle !== 'neutral'
                            ? 'linter-result linter-result-warn'
                            : 'linter-result'
                        }
                      >
                        {result.message}
                      </p>
                      {result.findings.length > 0 ? (
                        <ul className="linter-findings">
                          {result.findings.map((item) => (
                            <li key={item.elementId} className="linter-finding">
                              <span className="linter-finding-name">{item.name}</span>
                              <span className="linter-finding-meta">
                                {formatElementType(item.type)}
                              </span>
                              <span className="linter-finding-id">{item.elementId}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
