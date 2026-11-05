import { getNow } from './clock'
import { slaInfo, isClosed } from './selectors'
import type { Job, JobType, User } from './types'
import type { Invoice, Quotation } from './store/commercial'

const WEEK = 7 * 86400000

/* Single source for every dashboard and report number, so figures agree everywhere. */
export function weeklyVolume(jobs: Job[], weeks = 7) {
  const now = getNow().getTime()
  return Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * WEEK
    const start = end - WEEK
    const inWeek = jobs.filter(j => { const t = new Date(j.createdAt).getTime(); return t > start && t <= end })
    return { label: `W${i + 1}`, start, end, count: inWeek.length }
  })
}

export const isOpen = (j: Job) => !isClosed(j)

export function utilisation(jobs: Job[], techId: string, capacity: number) {
  const open = jobs.filter(j => j.technicianId === techId && isOpen(j)).length
  return { open, capacity, pct: Math.round((open / Math.max(1, capacity)) * 100) }
}

export function technicianUtilisation(jobs: Job[], users: User[], capacity: number) {
  return users.filter(u => u.role === 'technician' && u.active).map(u => ({ user: u, ...utilisation(jobs, u.id, capacity), total: jobs.filter(j => j.technicianId === u.id).length }))
}

export function computeKpis(jobs: Job[], jobTypes: JobType[], quotations: Quotation[], _invoices: Invoice[]) {
  const typeOf = (j: Job) => jobTypes.find(t => t.id === j.jobTypeId)
  const open = jobs.filter(isOpen)
  const states = open.map(j => ({ job: j, info: slaInfo(j, typeOf(j)) }))
  const evaJobs = jobs.filter(j => j.jobNo.startsWith('EVA'))
  const evaDone = evaJobs.filter(j => isClosed(j))
  const evi = jobs.filter(j => j.jobNo.startsWith('EVI'))
  const completedJobs = jobs.filter(isClosed)
  return {
    open: open.length,
    warnings: states.filter(s => s.info.state === 'Warning'),
    breachedOpen: states.filter(s => s.info.state === 'Breached'),
    pendingInvoice: jobs.filter(j => j.status === 'Completed'),
    ownerApproval: quotations.filter(q => q.status === 'Pending owner approval'),
    conversionPct: evaDone.length ? Math.round((evi.length / evaDone.length) * 100) : 0,
    slaMet: completedJobs.filter(j => slaInfo(j, typeOf(j)).state === 'Met').length,
    slaBreachedClosed: completedJobs.filter(j => slaInfo(j, typeOf(j)).state === 'Breached').length,
    byStatus: (s: string) => jobs.filter(j => j.status === s).length,
  }
}

export function volumeByType(jobs: Job[], jobTypes: JobType[]) {
  return jobTypes.map(t => ({ type: t, count: jobs.filter(j => j.jobTypeId === t.id).length }))
}
