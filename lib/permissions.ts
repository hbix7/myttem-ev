import type { Role } from './types'

export type PermAction = 'view' | 'create' | 'edit' | 'approve' | 'export'
export const PERM_ACTIONS: PermAction[] = ['view', 'create', 'edit', 'approve', 'export']
export type DemoRole = 'owner' | 'admin' | 'technician'
export const DEMO_ROLES: DemoRole[] = ['owner', 'admin', 'technician']

export interface PermModule { id: string; label: string; group: string; paths: string[] }

/* One row per module. Paths are matched by prefix, longest first. */
export const PERM_MODULES: PermModule[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview', paths: ['/'] },
  { id: 'jobs', label: 'Jobs and job sheets', group: 'Work Management', paths: ['/jobs', '/tech'] },
  { id: 'scheduler', label: 'Scheduler', group: 'Work Management', paths: ['/scheduler'] },
  { id: 'sla', label: 'SLA settings', group: 'Work Management', paths: ['/admin/sla'] },
  { id: 'quotations', label: 'Quotations', group: 'Sales', paths: ['/quotations'] },
  { id: 'invoices', label: 'Invoices', group: 'Sales', paths: ['/invoices', '/integrations'] },
  { id: 'inventory', label: 'Item master, price list, assets, sites', group: 'Inventory', paths: ['/master', '/assets', '/sites'] },
  { id: 'customers', label: 'Customers', group: 'Inventory', paths: ['/customers'] },
  { id: 'ev', label: 'EV pipeline and deadlines', group: 'EV', paths: ['/ev/pipeline', '/ev/deadlines', '/ev/conversion'] },
  { id: 'claims', label: 'EV chargeback claims', group: 'EV', paths: ['/ev/chargebacks'] },
  { id: 'communication', label: 'Communication', group: 'Communication', paths: ['/communication', '/intake', '/sync-conflicts'] },
  { id: 'reports', label: 'Reports', group: 'Insights', paths: ['/reports'] },
  { id: 'profit', label: 'Profit figures', group: 'Insights', paths: [] },
  { id: 'templates', label: 'PDF templates', group: 'Settings', paths: ['/documents'] },
  { id: 'settings', label: 'Settings and approval threshold', group: 'Settings', paths: ['/settings'] },
  { id: 'users', label: 'Users and roles', group: 'Settings', paths: ['/admin/users', '/admin/portal-users'] },
  { id: 'audit', label: 'Audit log', group: 'Settings', paths: ['/admin/audit'] },
]

const A = (s: string): PermAction[] => s.split('').map(c => ({ v: 'view', c: 'create', e: 'edit', a: 'approve', x: 'export' } as const)[c as 'v'])

/* Module x role x action. Missing means no access. */
export const PERMISSIONS: Record<string, Partial<Record<DemoRole, PermAction[]>>> = {
  dashboard:     { owner: A('vx'),    admin: A('vx') },
  jobs:          { owner: A('vcex'),  admin: A('vcex'), technician: A('ve') },
  scheduler:     { owner: A('v'),     admin: A('vce') },
  sla:           { owner: A('vce'),   admin: A('v') },
  quotations:    { owner: A('vceax'), admin: A('vcex') },
  invoices:      { owner: A('vceax'), admin: A('vcex') },
  inventory:     { owner: A('vcex'),  admin: A('vcex') },
  customers:     { owner: A('vcex'),  admin: A('vcex') },
  ev:            { owner: A('vcex'),  admin: A('vcex') },
  claims:        { owner: A('vceax'), admin: A('vcex') },
  communication: { owner: A('v'),     admin: A('vce') },
  reports:       { owner: A('vx'),    admin: A('vx') },
  profit:        { owner: A('v') },
  templates:     { owner: A('vce'),   admin: A('v') },
  settings:      { owner: A('vce'),   admin: A('v') },
  users:         { owner: A('vce') },
  audit:         { owner: A('vx') },
}

export const roleToDemo = (role: Role): DemoRole | undefined =>
  role === 'owner' ? 'owner' : role === 'admin' || role === 'sysadmin' ? 'admin' : role === 'technician' ? 'technician' : undefined

export function canDo(role: Role, moduleId: string, action: PermAction) {
  if (role === 'sysadmin' && (moduleId === 'users' || moduleId === 'audit')) return action === 'view' || action === 'create' || action === 'edit'
  const r = roleToDemo(role)
  return !!r && !!PERMISSIONS[moduleId]?.[r]?.includes(action)
}

export const canSeeProfit = (role?: Role) => !!role && canDo(role, 'profit', 'view')
export const canSeePrices = (role?: Role) => role === 'owner' || role === 'admin' || role === 'sysadmin'

export function moduleForPath(pathname: string): PermModule | undefined {
  let best: PermModule | undefined
  let bestLen = -1
  for (const m of PERM_MODULES) for (const p of m.paths) {
    const hit = p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/')
    if (hit && p.length > bestLen) { best = m; bestLen = p.length }
  }
  return best
}

/* Public routes never show Access denied. */
const PUBLIC = ['/login', '/book', '/portal', '/api']
export function canViewPath(role: Role, pathname: string) {
  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + '/'))) return true
  if (role === 'portal') return false
  const m = moduleForPath(pathname)
  if (!m) return role === 'owner' || role === 'admin' || role === 'sysadmin'
  if (m.id === 'jobs' && role === 'technician') return pathname.startsWith('/tech')
  if (role === 'technician') return false
  return canDo(role, m.id, 'view')
}
