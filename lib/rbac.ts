import type { Role } from './types'

export type Entity =
  | 'users' | 'dropdowns' | 'customer' | 'site' | 'asset' | 'item' | 'ratecard' | 'job' | 'checklist' | 'jobsheet'
  | 'quotation' | 'invoice' | 'chargeback' | 'deadline' | 'template' | 'generated' | 'availability' | 'lead'
  | 'notification' | 'sqlexport' | 'syncconflict' | 'dashboard' | 'portaluser'
export type Action = 'C' | 'R' | 'U' | 'D' | 'A'

/* Access matrix from the SOW: C create, R read, U update, D delete, A approve. A missing role means no access. */
const matrix: Record<Entity, Partial<Record<Role, string>>> = {
  users:         { sysadmin: 'CRUD', admin: 'R' },
  dropdowns:     { sysadmin: 'CRUD', admin: 'R', owner: 'R' },
  customer:      { sysadmin: 'CRUD', admin: 'CRUD', owner: 'R', technician: 'R', portal: 'R' },
  site:          { sysadmin: 'CRUD', admin: 'CRUD', owner: 'R', technician: 'R', portal: 'R' },
  asset:         { sysadmin: 'CRUD', admin: 'CRUD', owner: 'R', technician: 'R', portal: 'R' },
  item:          { sysadmin: 'R', admin: 'CRUD', owner: 'R' },
  ratecard:      { sysadmin: 'R', admin: 'CRUD', owner: 'R' },
  job:           { sysadmin: 'R', admin: 'CRUD', owner: 'R', technician: 'RU', portal: 'R' },
  checklist:     { sysadmin: 'R', admin: 'RU', owner: 'R', technician: 'CRU' },
  jobsheet:      { sysadmin: 'R', admin: 'R', owner: 'R', technician: 'R', portal: 'R' },
  quotation:     { sysadmin: 'R', admin: 'CRU', owner: 'RA' },
  invoice:       { sysadmin: 'R', admin: 'CRU', owner: 'R' },
  chargeback:    { sysadmin: 'R', admin: 'CRU', owner: 'R' },
  deadline:      { sysadmin: 'R', admin: 'RU', owner: 'R' },
  template:      { sysadmin: 'CRU', admin: 'R', owner: 'R' },
  generated:     { sysadmin: 'R', admin: 'R', owner: 'R' },
  availability:  { sysadmin: 'R', admin: 'CRU', owner: 'R', technician: 'R' },
  lead:          { sysadmin: 'R', admin: 'CRU', owner: 'R' },
  notification:  { sysadmin: 'R', admin: 'RU', owner: 'R' },
  sqlexport:     { admin: 'CR' },
  syncconflict:  { admin: 'RU' },
  dashboard:     { sysadmin: 'R', admin: 'R', owner: 'R' },
  portaluser:    { sysadmin: 'CRUD', admin: 'R' },
}

export function can(role: Role, entity: Entity, action: Action) {
  return (matrix[entity][role] ?? '').includes(action)
}

export const roleLabel: Record<Role, string> = {
  sysadmin: 'System Administrator', admin: 'Admin', owner: 'Owner / Approver', technician: 'Technician', portal: 'Portal User',
}

export const homeForRole = (role: Role) => role === 'technician' ? '/tech' : role === 'portal' ? '/portal' : role === 'owner' ? '/quotations' : '/'

export interface NavItem { section: string; label: string; href: string; roles: Role[]; entity?: Entity }
const all: Role[] = ['sysadmin', 'admin', 'owner']
export const nav: NavItem[] = [
  { section: 'Overview', label: 'Dashboard', href: '/', roles: all },
  { section: 'Work Management', label: 'Jobs', href: '/jobs', roles: ['admin', 'owner'] },
  { section: 'Work Management', label: 'Scheduler', href: '/scheduler', roles: ['admin'] },
  { section: 'Work Management', label: 'Pending intake', href: '/intake', roles: ['admin'] },
  { section: 'Commercial', label: 'Quotations', href: '/quotations', roles: ['admin', 'owner'] },
  { section: 'Commercial', label: 'Invoices', href: '/invoices', roles: ['admin', 'owner'] },
  { section: 'EV Programme', label: 'EV pipeline', href: '/ev/pipeline', roles: ['admin', 'owner'] },
  { section: 'EV Programme', label: 'EV deadlines', href: '/ev/deadlines', roles: ['admin', 'owner'] },
  { section: 'EV Programme', label: 'EV chargebacks', href: '/ev/chargebacks', roles: ['admin', 'owner'] },
  { section: 'EV Programme', label: 'EV conversion', href: '/ev/conversion', roles: ['admin', 'owner'] },
  { section: 'Documents', label: 'Document templates', href: '/documents/templates', roles: ['sysadmin', 'admin'] },
  { section: 'Documents', label: 'Generated documents', href: '/documents/generated', roles: ['sysadmin', 'admin'] },
  { section: 'Directory', label: 'Customers', href: '/customers', roles: ['sysadmin', 'admin'] },
  { section: 'Directory', label: 'Master Data', href: '/master/items', roles: ['sysadmin', 'admin'] },
  { section: 'Communication', label: 'Communication', href: '/communication/notifications', roles: ['admin'] },
  { section: 'Insights', label: 'Reports', href: '/reports', roles: all },
  { section: 'Administration', label: 'Sync Conflicts', href: '/sync-conflicts', roles: ['admin'] },
  { section: 'Administration', label: 'SQL Accounting', href: '/integrations/sql', roles: ['admin'] },
  { section: 'Administration', label: 'SLA', href: '/admin/sla', roles: ['sysadmin', 'admin'] },
  { section: 'Administration', label: 'Portal Users', href: '/admin/portal-users', roles: ['sysadmin', 'admin'] },
  { section: 'Administration', label: 'Settings', href: '/settings', roles: ['sysadmin', 'admin'] },
]

/* Owner sees the approval queue first, so Commercial moves ahead of Work Management. */
export function sectionOrder(role: Role, sections: string[]) {
  if (role !== 'owner') return sections
  const rank = (s: string) => (s === 'Overview' ? 0 : s === 'Commercial' ? 1 : 2)
  return [...sections].sort((a, b) => rank(a) - rank(b))
}

/* Routes a role may open on desktop. Anything else redirects home. */
export function canOpenPath(role: Role, pathname: string) {
  if (role === 'technician') return pathname.startsWith('/tech')
  if (role === 'portal') return pathname.startsWith('/portal')
  const extra = ['/jobs/new', '/quotations/new', '/sites', '/assets', '/master', '/communication', '/book']
  if (pathname.startsWith('/book')) return true
  const hit = nav.filter(n => n.href !== '/' && pathname.startsWith(n.href.split('/').slice(0, 2).join('/')) && n.roles.includes(role))
  if (pathname === '/') return nav[0].roles.includes(role)
  if (hit.length) return true
  if (role === 'sysadmin') return ['/customers', '/sites', '/assets', '/master', '/documents', '/reports', '/admin', '/settings'].some(p => pathname.startsWith(p))
  return role === 'admin' && extra.some(p => pathname.startsWith(p))
}
