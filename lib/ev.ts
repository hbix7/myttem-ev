import { useStore } from '@/lib/store'
import { useCommercialStore, quoteTotal, type PrincipalCode } from '@/lib/store/commercial'
import { getNow } from '@/lib/clock'
import { buildPdfDataUrl } from '@/lib/export'
import { buildDocLines, docFileName, docTitle, type EvDocType } from '@/lib/evdocs'
import type { EvCase, EvMilestone, EvStatus, GeneratedDocument, Job, Settings } from '@/lib/types'

export const EV_STAGES: EvStatus[] = ['Lead', 'Assessed', 'Quoted', 'Follow-up', 'Accepted', 'Paid', 'Scheduled', 'Installed', 'Invoiced', 'Closed']
export const EV_BOARD_COLUMNS: EvStatus[] = [...EV_STAGES, 'Lost']
export const CS_PRINCIPAL_ID = 'p3'

export const DEADLINE_DEFS: { key: string; label: string; milestone: EvMilestone }[] = [
  { key: 'D1', label: 'Acknowledge lead', milestone: 'ack' },
  { key: 'D2', label: 'Complete assessment', milestone: 'assessed' },
  { key: 'D3', label: 'Submit quotation', milestone: 'quoted' },
  { key: 'D4', label: 'Customer approval and payment', milestone: 'paid' },
  { key: 'D5', label: 'Complete installation', milestone: 'installed' },
  { key: 'D6', label: 'Submit installation report', milestone: 'report' },
]

const core = () => useStore.getState()
const nowIso = () => getNow().toISOString()
const PRINCIPAL_CODE: Record<string, PrincipalCode> = { p1: 'UPE', p2: 'PROTON', p3: 'CHARGESINI', p4: 'ZEEKR', p5: 'SANGITECH' }
export const principalCode = (principalId?: string): PrincipalCode => PRINCIPAL_CODE[principalId || 'p1'] || 'UPE'

export const isEvCase = (job: Job) => !!job.ev
export const isChargeSini = (job: Job) => job.principalId === CS_PRINCIPAL_ID

function note(jobId: string, event: string, comment?: string) {
  useStore.setState(s => ({ history: [...s.history, { id: crypto.randomUUID(), jobId, userId: s.currentUserId, event, comment, at: nowIso() }] }))
}

function email(jobId: string, subject: string, event: string) {
  useStore.setState(s => ({ notifications: [...s.notifications, { id: crypto.randomUUID(), jobId, channel: 'Email' as const, subject, event, status: 'Queued' as const, at: nowIso() }] }))
}

function patchCase(jobId: string, patch: Partial<EvCase> & { milestone?: EvMilestone }) {
  const job = core().jobs.find(j => j.id === jobId)
  if (!job?.ev) return
  const { milestone, ...rest } = patch
  const at = milestone ? { ...job.ev.at, [milestone]: nowIso() } : job.ev.at
  core().updateJob(jobId, { ev: { ...job.ev, ...rest, at } })
}

const findJob = (id: string) => core().jobs.find(j => j.id === id)

export type DeadlineState = 'On track' | 'At risk' | 'Overdue' | 'Done on time' | 'Done late' | 'Not applicable'
export interface DeadlineRow { key: string; label: string; days: number; dueAt: string; originalDueAt: string; doneAt?: string; state: DeadlineState; adjusted?: { reason: string; by: string }; msLeft: number }

export function evDeadlines(job: Job, settings: Pick<Settings, 'deadlineDays'>, at = getNow()): DeadlineRow[] {
  const ev = job.ev
  const created = new Date(job.createdAt).getTime()
  return DEADLINE_DEFS.map((def, i) => {
    const days = settings.deadlineDays[i]
    const originalDueAt = new Date(created + days * 86400000).toISOString()
    const adj = ev?.deadlineAdjust?.[def.key]
    const dueAt = adj?.dueAt || originalDueAt
    const doneAt = ev?.at[def.milestone]
    const msLeft = new Date(dueAt).getTime() - at.getTime()
    let state: DeadlineState
    if (ev?.status === 'Lost' && !doneAt) state = 'Not applicable'
    else if (doneAt) state = new Date(doneAt).getTime() <= new Date(dueAt).getTime() ? 'Done on time' : 'Done late'
    else if (msLeft < 0) state = 'Overdue'
    else if (msLeft < Math.min(86400000, days * 86400000 * 0.25)) state = 'At risk'
    else state = 'On track'
    return { key: def.key, label: def.label, days, dueAt, originalDueAt, doneAt, state, adjusted: adj ? { reason: adj.reason, by: adj.by } : undefined, msLeft }
  })
}

export function countdown(msLeft: number) {
  const abs = Math.abs(msLeft)
  const d = Math.floor(abs / 86400000)
  const h = Math.floor((abs % 86400000) / 3600000)
  const text = d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((abs % 3600000) / 60000)}m`
  return msLeft < 0 ? `${text} overdue` : `${text} left`
}

export function adjustDeadline(jobId: string, key: string, dueAt: string, reason: string) {
  const job = findJob(jobId)
  if (!job?.ev) return false
  const row = evDeadlines(job, core().settings).find(r => r.key === key)
  if (!row || reason.trim().length < 5) return false
  const by = core().users.find(u => u.id === core().currentUserId)?.name || 'Admin'
  patchCase(jobId, { deadlineAdjust: { ...job.ev.deadlineAdjust, [key]: { dueAt, original: row.originalDueAt, reason: reason.trim(), by } } })
  note(jobId, `Deadline ${key} adjusted`, reason.trim())
  return true
}

export function nextAction(job: Job): string {
  const ev = job.ev
  if (!ev) return ''
  switch (ev.status) {
    case 'Lead': return ev.at.ack ? (job.scheduledAt ? 'Awaiting assessment' : 'Book assessment') : 'Acknowledge lead'
    case 'Assessed': return 'Needs quotation'
    case 'Quoted': return 'Awaiting customer'
    case 'Follow-up': return ev.callTask ? 'Call customer' : 'Follow-up emails running'
    case 'Accepted': return 'Waiting on payment'
    case 'Paid': return 'Customer to book install'
    case 'Scheduled': return 'Installation booked'
    case 'Installed': return 'Raise invoice'
    case 'Invoiced': return 'Awaiting sign-off'
    case 'Closed': return 'Complete'
    case 'Lost': return 'Lost'
  }
}

interface NewEvInput { principalId: string; customerName: string; phone: string; address: string; vehicle: string; chargerModel: string; channel?: Job['channel']; subject?: string; remarks?: string }

export function createEvJob(input: NewEvInput) {
  const s = core()
  let customer = s.customers.find(c => c.name.toLowerCase() === input.customerName.trim().toLowerCase())
  let siteId = customer ? s.sites.find(x => x.customerId === customer!.id)?.id : undefined
  if (!customer) {
    const id = crypto.randomUUID()
    customer = { id, tenant_id: 't-upe', name: input.customerName.trim(), contact: input.customerName.trim(), phone: input.phone, email: `${input.customerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`, sqlAccCode: `EV-${s.customers.length + 1}`, isCommercial: false } as typeof s.customers[number]
    siteId = crypto.randomUUID()
    const newSiteId = siteId
    useStore.setState(st => ({ customers: [...st.customers, customer!], sites: [...st.sites, { id: newSiteId, tenant_id: 't-upe', customerId: customer!.id, name: 'Home site', address: input.address }] }))
  }
  const jobId = s.createJob({ subject: input.subject || `EV Assessment: ${input.vehicle || 'new lead'}`, customerId: customer.id, siteId, jobTypeId: 'jt3', channel: input.channel || 'Manual', principalId: input.principalId, remarks: input.remarks })
  core().updateJob(jobId, { ev: { status: 'Lead', at: { ack: nowIso() }, vehicle: input.vehicle, chargerModel: input.chargerModel, followUps: 0 } })
  note(jobId, 'Lead acknowledged', 'EV case opened')
  email(jobId, 'We have received your EV charger enquiry', 'Lead acknowledgement')
  return jobId
}

export function acknowledgeLead(jobId: string) {
  patchCase(jobId, { milestone: 'ack' })
  note(jobId, 'Lead acknowledged')
  email(jobId, 'We have received your EV charger enquiry', 'Lead acknowledgement')
}

export function evOnScheduled(jobId: string) {
  const job = findJob(jobId)
  if (!job) return
  if (job.ev && job.ev.status === 'Lead' && !job.ev.at.booked) {
    patchCase(jobId, { milestone: 'booked' })
    email(jobId, 'Your assessment date is confirmed', 'Assessment date confirmation')
  }
  if (job.parentJobId) {
    const parent = findJob(job.parentJobId)
    if (parent?.ev && ['Paid', 'Scheduled'].includes(parent.ev.status)) {
      patchCase(parent.id, { status: 'Scheduled', milestone: 'scheduled' })
      note(parent.id, 'Installation scheduled', job.scheduledAt)
      email(parent.id, 'Your installation is confirmed', 'Installation confirmation')
    }
  }
}

function makeDoc(jobId: string, type: EvDocType, send: boolean, installChecks?: Record<string, boolean>) {
  const job = findJob(jobId)
  if (!job) return undefined
  const s = core()
  const code = principalCode(job.principalId)
  const customer = s.customers.find(c => c.id === job.customerId)
  const site = s.sites.find(x => x.id === job.siteId)
  const tech = s.users.find(u => u.id === job.technicianId)?.name
  const quote = job.ev?.quoteId ? useCommercialStore.getState().quotations.find(q => q.id === job.ev?.quoteId) : undefined
  const ctx = { job, principal: code, customer, site, technician: tech, quoteNo: quote?.quoteNo, quoteTotal: quote?.total, installChecks }
  const dataUrl = buildPdfDataUrl(docTitle(type, code), buildDocLines(type, ctx))
  const principalName = s.principals.find(p => p.id === job.principalId)?.name
  const doc: GeneratedDocument = { id: crypto.randomUUID(), jobId, docType: type, principal: principalName, createdAt: nowIso(), status: send ? 'Sent' : 'Generated', fileName: docFileName(type, ctx), dataUrl, sentTo: send ? [principalName || code, customer?.email].filter(Boolean) as string[] : undefined }
  useStore.setState(st => ({ documents: [...st.documents, doc] }))
  if (send) email(jobId, `${type} ${job.jobNo}`, type)
  return doc
}

export const generateEvDoc = makeDoc

export function emailDoc(docId: string) {
  const d = core().documents.find(x => x.id === docId)
  if (!d) return
  const job = findJob(d.jobId)
  const cust = core().customers.find(c => c.id === job?.customerId)
  useStore.setState(st => ({ documents: st.documents.map(x => x.id === docId ? { ...x, status: 'Sent' as const, sentTo: [d.principal || 'Principal', cust?.email].filter(Boolean) as string[] } : x) }))
  email(d.jobId, `${d.docType} ${job?.jobNo || ''}`, d.docType)
}

export function recordAssessment(jobId: string, data: { photos: number; measurements: string; remarks: string; checklist: Record<string, boolean> }) {
  const job = findJob(jobId)
  if (!job?.ev) return { ok: false, message: 'This is not an EV case.' }
  const min = core().settings.minAssessmentPhotos
  if (data.photos < min) return { ok: false, message: `Attach at least ${min} photos (${data.photos} so far).` }
  if (!data.measurements.trim()) return { ok: false, message: 'Enter the cable route and distance measurements.' }
  if (Object.values(data.checklist).filter(Boolean).length < Object.keys(data.checklist).length) return { ok: false, message: 'Tick every checklist item before submitting.' }
  const at = nowIso()
  patchCase(jobId, { status: 'Assessed', milestone: 'assessed', assessment: { ...data, at } })
  useStore.setState(st => ({ jobs: st.jobs.map(j => j.id === jobId ? { ...j, status: 'Completed', completedAt: at, endTime: j.endTime || at } : j) }))
  note(jobId, 'Assessment completed', `${data.photos} photos attached`)
  makeDoc(jobId, 'Technical Assessment Form', false)
  email(jobId, 'Your site assessment is complete', 'Assessment complete')
  return { ok: true, message: 'Assessment submitted. TAF generated.' }
}

export function evOnQuoteSent(jobId: string, quoteId: string) {
  const job = findJob(jobId)
  if (!job?.ev) return
  if (['Lead', 'Assessed'].includes(job.ev.status)) {
    patchCase(jobId, { status: 'Quoted', quoteId, milestone: 'quoted' })
    note(jobId, 'Quotation sent to customer')
  }
  email(jobId, 'Your EV charger quotation', 'Quotation')
}

export function evOnQuoteLinked(jobId: string, quoteId: string) {
  patchCase(jobId, { quoteId })
}

export function recordQuoteOutcome(jobId: string, outcome: 'Accepted' | 'Declined', reason?: string) {
  const job = findJob(jobId)
  if (!job?.ev) return
  const qid = job.ev.quoteId
  if (qid) useCommercialStore.getState().updateQuote(qid, { status: outcome, declineReason: reason })
  if (outcome === 'Accepted') {
    patchCase(jobId, { status: 'Accepted', milestone: 'accepted', outcome, callTask: false })
    note(jobId, 'Customer accepted the quotation')
  } else {
    patchCase(jobId, { status: 'Lost', outcome, callTask: false })
    note(jobId, 'Customer declined the quotation', reason)
  }
}

export function recordPayment(jobId: string, payment: { amount: number; date: string; ref: string }) {
  const job = findJob(jobId)
  if (!job?.ev || job.ev.status !== 'Accepted') return { ok: false, message: 'Payment can only be recorded after the customer accepts.' }
  if (!(payment.amount > 0) || !payment.ref.trim()) return { ok: false, message: 'Enter the amount received and a payment reference.' }
  const token = `evb-${job.jobNo.toLowerCase()}`
  const installId = core().createJob({ subject: `EV charger installation: ${core().customers.find(c => c.id === job.customerId)?.name || job.jobNo}`, customerId: job.customerId, siteId: job.siteId, jobTypeId: 'jt4', channel: 'Portal', principalId: job.principalId, parentJobId: job.id })
  core().updateJob(installId, { selfService: false })
  patchCase(jobId, { status: 'Paid', milestone: 'paid', payment, bookingToken: token, installJobId: installId })
  note(jobId, 'Payment received', `RM ${payment.amount.toFixed(2)}, ref ${payment.ref}`)
  email(jobId, 'Payment received: choose your installation date', 'Booking link')
  return { ok: true, message: 'Payment recorded. Booking link sent to the customer.' }
}

export function evOnInstalled(installJobId: string) {
  const inst = findJob(installJobId)
  const parent = inst?.parentJobId ? findJob(inst.parentJobId) : undefined
  if (!inst || !parent?.ev || ['Installed', 'Invoiced', 'Closed'].includes(parent.ev.status)) return
  useStore.setState(st => ({ jobs: st.jobs.map(j => j.id === installJobId && j.status !== 'Completed' ? { ...j, status: 'Completed', completedAt: nowIso(), endTime: j.endTime || nowIso() } : j) }))
  patchCase(parent.id, { status: 'Installed', milestone: 'installed' })
  note(parent.id, 'Installation completed')
  makeDoc(parent.id, 'Installation Report', true)
  patchCase(parent.id, { milestone: 'report' })
}

export function raiseEvInvoice(jobId: string) {
  const job = findJob(jobId)
  if (!job?.ev || job.ev.status !== 'Installed') return undefined
  const q = useCommercialStore.getState().quotations.find(x => x.id === job.ev?.quoteId)
  const c = core().customers.find(x => x.id === job.customerId)
  const lines = q?.lines || []
  const id = useCommercialStore.getState().createInvoice({ jobId, jobNo: job.jobNo, customer: c?.name || '', lines, subtotal: quoteTotal(lines).subtotal, status: 'Sent for sign-off', kind: 'ev' })
  patchCase(jobId, { status: 'Invoiced', milestone: 'invoiced', invoiceId: id, invoicedAmt: job.ev.invoicedAmt ?? Math.round(quoteTotal(lines).total) })
  note(jobId, 'Invoice raised and sent for customer sign-off')
  email(jobId, 'Invoice for your EV charger installation', 'Invoice')
  return id
}

export function closeEvCase(jobId: string) {
  const job = findJob(jobId)
  if (!job?.ev || job.ev.status !== 'Invoiced') return
  if (job.ev.invoiceId) useCommercialStore.getState().updateInvoice(job.ev.invoiceId, { status: 'Signed off', signedAt: nowIso(), signedBy: core().customers.find(c => c.id === job.customerId)?.name })
  patchCase(jobId, { status: 'Closed', milestone: 'closed' })
  useStore.setState(st => ({ jobs: st.jobs.map(j => j.id === jobId ? { ...j, status: 'Closed' } : j) }))
  note(jobId, 'Customer signed off. Case closed')
}

export function updateChargeback(jobId: string, patch: { invoicedAmt?: number; claimableAmt?: number }) {
  const job = findJob(jobId)
  if (!job?.ev) return
  core().updateJob(jobId, { ev: { ...job.ev, ...patch } })
}

/** Daily automation: follow-up emails after a quotation is sent, then a call task once the D4 deadline passes. */
export function runEvAutomation() {
  const s = core()
  const t = getNow().getTime()
  for (const job of s.jobs) {
    const ev = job.ev
    if (!ev || !['Quoted', 'Follow-up'].includes(ev.status) || !ev.at.quoted) continue
    const daysSince = Math.floor((t - new Date(ev.at.quoted).getTime()) / 86400000)
    const due = evDeadlines(job, s.settings)[3]
    const pastDeadline = new Date(due.dueAt).getTime() < t
    const target = Math.min(daysSince, Math.max(0, Math.floor((new Date(due.dueAt).getTime() - new Date(ev.at.quoted).getTime()) / 86400000)))
    if (!pastDeadline && target > ev.followUps) {
      for (let i = ev.followUps; i < target; i++) email(job.id, `Reminder ${i + 1}: your EV charger quotation`, 'Follow-up email')
      patchCase(job.id, { status: 'Follow-up', followUps: target })
      note(job.id, 'Follow-up emails sent', `${target} reminder(s) so far`)
    } else if (pastDeadline && !ev.callTask) {
      patchCase(job.id, { status: 'Follow-up', callTask: true, outcome: 'No response' })
      note(job.id, 'Call customer task created', 'Quotation deadline passed with no decision')
    }
  }
}

export interface EvKpi { cases: number; byStatus: Record<string, number>; quotationsIssued: number; installed: number; conversionPct: number | null; overdueDeadlines: number }

export function evKpis(jobs: Job[], settings: Pick<Settings, 'deadlineDays'>): EvKpi {
  const evJobs = jobs.filter(isEvCase)
  const cs = evJobs.filter(isChargeSini)
  const byStatus: Record<string, number> = {}
  evJobs.forEach(j => { byStatus[j.ev!.status] = (byStatus[j.ev!.status] || 0) + 1 })
  const quotationsIssued = cs.filter(j => j.ev!.at.quoted).length
  const installed = cs.filter(j => j.ev!.at.installed).length
  const overdueDeadlines = cs.reduce((n, j) => n + evDeadlines(j, settings).filter(d => d.state === 'Overdue').length, 0)
  return { cases: evJobs.length, byStatus, quotationsIssued, installed, conversionPct: quotationsIssued ? Math.round((installed / quotationsIssued) * 1000) / 10 : null, overdueDeadlines }
}
