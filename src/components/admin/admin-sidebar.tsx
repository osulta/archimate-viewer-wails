import { Menu, Typography } from 'antd'
import { ApartmentOutlined, TeamOutlined, BranchesOutlined } from '@ant-design/icons'

interface AdminSection {
  id: string
  label: string
  icon: React.ReactNode
}

const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'metamodel', label: 'Метамодель', icon: <ApartmentOutlined /> },
  { id: 'accounts', label: 'Учетные записи', icon: <TeamOutlined /> },
  { id: 'git', label: 'Git', icon: <BranchesOutlined /> },
]

interface AdminSidebarProps {
  activeSection: string
  onSectionChange: (sectionId: string) => void
}

export function AdminSidebar(props: AdminSidebarProps) {
  const { activeSection, onSectionChange } = props

  return (
    <aside className="admin-sidebar" aria-label="Разделы администрирования">
      <Typography.Title level={5} className="admin-sidebar-title">
        Администрирование
      </Typography.Title>
      <Menu
        className="admin-sidebar-nav"
        mode="inline"
        selectedKeys={[activeSection]}
        onClick={({ key }) => onSectionChange(key)}
        items={ADMIN_SECTIONS.map((section) => ({
          key: section.id,
          icon: section.icon,
          label: section.label,
        }))}
      />
    </aside>
  )
}
