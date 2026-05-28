import { useState } from 'react'
import { GitPanel } from '../git/git-panel'
import { AdminSidebar } from './admin-sidebar'
import { AdminMetamodelSection } from './admin-metamodel-section'
import { AdminAccountsSection } from './admin-accounts-section'

interface AdminPanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  git: any
}

export function AdminPanel(props: AdminPanelProps) {
  const { git } = props
  const [activeSection, setActiveSection] = useState('metamodel')

  return (
    <div className="layout admin-layout" role="tabpanel" aria-label="Администрирование">
      <AdminSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className="admin-content">
        {activeSection === 'metamodel' ? <AdminMetamodelSection /> : null}
        {activeSection === 'accounts' ? <AdminAccountsSection /> : null}
        {activeSection === 'git' ? <GitPanel git={git} variant="admin" /> : null}
      </div>
    </div>
  )
}
