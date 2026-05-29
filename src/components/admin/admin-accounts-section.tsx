import { Empty, Typography } from 'antd'

export function AdminAccountsSection() {
  return (
    <section className="admin-section" aria-label="Учетные записи">
      <div className="tab-page-head">
        <Typography.Title level={3}>Учетные записи</Typography.Title>
        <Typography.Paragraph type="secondary">
          Управление пользователями и правами доступа.
        </Typography.Paragraph>
      </div>
      <Empty description="Раздел в разработке." />
    </section>
  )
}
