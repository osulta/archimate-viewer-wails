interface AdminSection {
  id: string
  label: string
}

const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'metamodel', label: 'Метамодель' },
  { id: 'accounts', label: 'Учетные записи' },
  { id: 'git', label: 'Git' },
]

interface AdminSidebarProps {
  activeSection: string
  onSectionChange: (sectionId: string) => void
}

export function AdminSidebar(props: AdminSidebarProps) {
  const { activeSection, onSectionChange } = props

  return (
    <aside className="admin-sidebar" aria-label="Разделы администрирования">
      <h2 className="admin-sidebar-title">Администрирование</h2>
      <nav className="admin-sidebar-nav">
        <ul className="admin-sidebar-list">
          {ADMIN_SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            return (
              <li key={section.id}>
                <button
                  type="button"
                  className={
                    isActive ? 'admin-sidebar-item admin-sidebar-item-active' : 'admin-sidebar-item'
                  }
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSectionChange(section.id)}
                >
                  {section.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
