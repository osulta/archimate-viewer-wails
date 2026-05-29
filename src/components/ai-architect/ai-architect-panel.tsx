import { Empty, Typography } from 'antd'

export function AiArchitectPanel() {
  return (
    <main className="tab-page" role="tabpanel" aria-label="AI Architect">
      <div className="tab-page-head">
        <Typography.Title level={3}>AI Architect</Typography.Title>
        <Typography.Paragraph type="secondary">
          Ассистент архитектора на базе ИИ.
        </Typography.Paragraph>
      </div>
      <Empty description="Раздел в разработке." />
    </main>
  )
}
