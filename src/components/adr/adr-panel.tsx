import { Empty, Typography } from 'antd'

export function AdrPanel() {
  return (
    <main className="tab-page" role="tabpanel" aria-label="ADR">
      <div className="tab-page-head">
        <Typography.Title level={3}>ADR</Typography.Title>
        <Typography.Paragraph type="secondary">
          Architecture Decision Records.
        </Typography.Paragraph>
      </div>
      <Empty description="Раздел в разработке." />
    </main>
  )
}
