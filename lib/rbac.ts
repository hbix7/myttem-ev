import type { Role } from './types'
export const homeForRole = (role: Role) => role === 'technician' ? '/tech' : role === 'portal' ? '/portal' : '/jobs'
export function can(role: Role, entity: string, action: string) {
  if (role === 'sysadmin') return true
  if (role === 'portal') return entity === 'job' && action === 'R'
  if (role === 'technician') return (entity === 'job' && ['R','U'].includes(action)) || (entity === 'customer' && action === 'R')
  if (role === 'owner') return ['job','customer','site','asset','quotation','invoice','report','dashboard','document'].includes(entity) && ['R','A'].includes(action)
  return true
}
export const nav = [
  {section:'Overview',label:'Dashboard',href:'/dashboard',roles:['sysadmin','admin','owner']},
  {section:'Work Management',label:'Jobs',href:'/jobs',roles:['sysadmin','admin','owner','technician','portal']},
  {section:'Work Management',label:'Scheduler',href:'/scheduler',roles:['sysadmin','admin','owner']},
  {section:'Work Management',label:'Pending intake',href:'/intake',roles:['sysadmin','admin']},
  {section:'Commercial',label:'Quotations',href:'/quotations',roles:['sysadmin','admin','owner']},
  {section:'Commercial',label:'Invoices',href:'/invoices',roles:['sysadmin','admin','owner']},
  {section:'EV Programme',label:'EV deadlines',href:'/ev/deadlines',roles:['sysadmin','admin','owner']},
  {section:'EV Programme',label:'EV chargebacks',href:'/ev/chargebacks',roles:['sysadmin','admin','owner']},
  {section:'EV Programme',label:'EV conversion',href:'/ev/conversion',roles:['sysadmin','admin','owner']},
  {section:'Documents',label:'Document templates',href:'/documents/templates',roles:['sysadmin','admin','owner']},
  {section:'Documents',label:'Generated documents',href:'/documents/generated',roles:['sysadmin','admin','owner']},
  {section:'Directory',label:'Customers',href:'/customers',roles:['sysadmin','admin','owner','technician','portal']},
  {section:'Directory',label:'Master Data',href:'/master-data',roles:['sysadmin','admin','owner']},
  {section:'Communication',label:'Communication',href:'/communication/notifications',roles:['sysadmin','admin']},
  {section:'Insights',label:'Reports',href:'/reports',roles:['sysadmin','admin','owner']},
  {section:'Administration',label:'Sync Conflicts',href:'/sync-conflicts',roles:['sysadmin','admin']},
  {section:'Administration',label:'SQL Accounting',href:'/integrations/sql',roles:['admin']},
  {section:'Administration',label:'SLA',href:'/sla',roles:['sysadmin','admin']},
  {section:'Administration',label:'Portal Users',href:'/portal-users',roles:['sysadmin','admin']},
  {section:'Administration',label:'Settings',href:'/settings',roles:['sysadmin','admin']},
]
