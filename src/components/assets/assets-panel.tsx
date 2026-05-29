import { Empty, Typography } from 'antd'

export function AssetsPanel() {
  return (
    <main className="tab-page" role="tabpanel" aria-label="Активы">
      <div className="tab-page-head">
        <Typography.Title level={3}>Активы</Typography.Title>
        <Typography.Paragraph type="secondary">
          Управление активами модели.
        </Typography.Paragraph>
      </div>
      <Empty description="Раздел в разработке." />
    </main>
  )
}
