import { useCallback, useState } from 'react'
import { Alert, Button, Card, Empty, List, Space, Tag, Typography } from 'antd'
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
        <Typography.Title level={3}>Линтеры</Typography.Title>
        <Typography.Paragraph type="secondary">
          Проверки целостности и качества модели ArchiMate.
        </Typography.Paragraph>
      </div>

      {!model ? (
        <Empty description="Загрузите модель на вкладке «Моделирование» или клонируйте репозиторий в «Администрирование» → Git." />
      ) : (
        <>
          <div className="linters-toolbar">
            <Button type="primary" onClick={handleRunAll}>
              Запустить все
            </Button>
          </div>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {linters.map((linter) => {
              const result = resultsById[linter.id]
              const hasRun = result != null
              const isWarn =
                hasRun && result.findings.length > 0 && result.findingsStyle !== 'neutral'

              return (
                <Card
                  key={linter.id}
                  size="small"
                  className="linter-card"
                  title={linter.title}
                  extra={
                    <Button size="small" onClick={() => handleRunLinter(linter.id)}>
                      Запустить
                    </Button>
                  }
                >
                  <Typography.Paragraph type="secondary" className="linter-card-desc">
                    {linter.description}
                  </Typography.Paragraph>
                  {!hasRun ? (
                    <Typography.Text type="secondary" italic>
                      Проверка ещё не запускалась.
                    </Typography.Text>
                  ) : (
                    <>
                      <Alert
                        type={isWarn ? 'warning' : 'success'}
                        showIcon
                        message={result.message}
                      />
                      {result.findings.length > 0 ? (
                        <List
                          className="linter-findings"
                          size="small"
                          dataSource={result.findings}
                          renderItem={(item) => (
                            <List.Item key={item.elementId}>
                              <List.Item.Meta
                                title={item.name}
                                description={item.elementId}
                              />
                              <Tag>{formatElementType(item.type)}</Tag>
                            </List.Item>
                          )}
                        />
                      ) : null}
                    </>
                  )}
                </Card>
              )
            })}
          </Space>
        </>
      )}
    </main>
  )
}
