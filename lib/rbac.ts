import type { Role } from './types'
export const homeForRole = (role: Role) => role === 'technician' ? '/tech' : role === 'portal' ? '/portal' : '/jobs'
export function can(role: Role, entity: string, action: string) {
  if (role === 'sysadmin') return true
  if (role === 'portal') return entity === 'job' && action === 'R'
  if (role === 'technician') return (entity === 'job' && ['R','U'].includes(action)) || (entity === 'customer' && action === 'R')
  if (role === 'owner') return ['job','customer','site','asset','quotation','invoice','report','dashboard','document'].includes(entity) && ['R','A'].includes(action)
  return true
}
export const nav = [{label:'Dashboard',href:'/dashboard',roles:['sysadmin','admin','owner']},{label:'Jobs',href:'/jobs',roles:['sysadmin','admin','owner','technician','portal']},{label:'Scheduler',href:'/scheduler',roles:['sysadmin','admin']},{label:'Pending intake',href:'/intake',roles:['sysadmin','admin']},{label:'Quotations',href:'/quotations',roles:['sysadmin','admin','owner']},{label:'Invoices',href:'/invoices',roles:['sysadmin','admin','owner']},{label:'EV Programme',href:'/ev',roles:['sysadmin','admin','owner']},{label:'Documents',href:'/documents',roles:['sysadmin','admin','owner']},{label:'Customers',href:'/customers',roles:['sysadmin','admin','owner','technician','portal']},{label:'Master Data',href:'/master-data',roles:['sysadmin','admin','owner']},{label:'Communication',href:'/communication',roles:['sysadmin','admin']},{label:'Reports',href:'/reports',roles:['sysadmin','admin','owner']},{label:'Sync Conflicts',href:'/sync-conflicts',roles:['sysadmin','admin']},{label:'SQL Accounting',href:'/sql-accounting',roles:['admin']},{label:'SLA',href:'/sla',roles:['sysadmin','admin']},{label:'Portal Users',href:'/portal-users',roles:['sysadmin','admin']},{label:'Settings',href:'/settings',roles:['sysadmin','admin']} ]
