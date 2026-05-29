import { Empty, Typography } from 'antd'

export function AdminMetamodelSection() {
  return (
    <section className="admin-section" aria-label="Метамодель">
      <div className="tab-page-head">
        <Typography.Title level={3}>Метамодель</Typography.Title>
        <Typography.Paragraph type="secondary">
          Настройка типов элементов, связей и правил ArchiMate.
        </Typography.Paragraph>
      </div>
      <Empty description="Раздел в разработке." />
    </section>
  )
}
