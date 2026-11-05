import { buildPdfDataUrl } from './export'
import { buildDocLines, docFileName, docTitle, ASSESS_CHECKS, type PrincipalCodeEv } from './evdocs'
import type { Customer, EvCase, EvMilestone, EvStatus, GeneratedDocument, Job, JobHistory, Site } from './types'

const base = new Date('2026-11-03T10:00:00+08:00')
const T = 't-upe'
const hoursAfter = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3600000).toISOString()
const ago = (h: number) => new Date(base.getTime() - h * 3600000).toISOString()

const PRINCIPAL_CODES: Record<string, PrincipalCodeEv> = { p1: 'UPE', p2: 'PROTON', p3: 'CHARGESINI', p4: 'ZEEKR', p5: 'SANGITECH' }
const PRINCIPAL_NAMES: Record<string, string> = { p1: 'United Power Engineering', p2: 'Proton e.MAS', p3: 'ChargeSini', p4: 'Zeekr', p5: 'Sangitech' }

const OFFSET: Record<EvMilestone, number> = { ack: 2, booked: 6, assessed: 30, quoted: 50, accepted: 80, paid: 100, scheduled: 110, installed: 200, report: 202, invoiced: 220, closed: 240 }
const MILESTONES: Record<EvStatus, EvMilestone[]> = {
  Lead: ['ack'],
  Assessed: ['ack', 'booked', 'assessed'],
  Quoted: ['ack', 'booked', 'assessed', 'quoted'],
  'Follow-up': ['ack', 'booked', 'assessed', 'quoted'],
  Accepted: ['ack', 'booked', 'assessed', 'quoted', 'accepted'],
  Lost: ['ack', 'booked', 'assessed', 'quoted'],
  Paid: ['ack', 'booked', 'assessed', 'quoted', 'accepted', 'paid'],
  Scheduled: ['ack', 'booked', 'assessed', 'quoted', 'accepted', 'paid', 'scheduled'],
  Installed: ['ack', 'booked', 'assessed', 'quoted', 'accepted', 'paid', 'scheduled', 'installed', 'report'],
  Invoiced: ['ack', 'booked', 'assessed', 'quoted', 'accepted', 'paid', 'scheduled', 'installed', 'report', 'invoiced'],
  Closed: ['ack', 'booked', 'assessed', 'quoted', 'accepted', 'paid', 'scheduled', 'installed', 'report', 'invoiced', 'closed'],
}

interface Spec { status: EvStatus; principal: string; ageH?: number; noAck?: boolean; followUps?: number; callTask?: boolean; bookedFuture?: boolean }

const NAMES = ['Aisyah Karim', 'Chong Wei Han', 'Priya Nair', 'Hakim Roslan', 'Siew Lan Ooi', 'Zulkifli Hamid', 'Evelyn Tay', 'Mohan Das', 'Nadia Samad', 'Kelvin Ng', 'Rohana Yusof', 'Jason Lee', 'Fatimah Zahra', 'Arjun Menon', 'Sharifah Aini', 'Daniel Wong', 'Hui Min Chan', 'Ismail Osman', 'Grace Lim', 'Faizal Ahmad', 'Lakshmi Pillai', 'Adrian Koh']
const AREAS = ['Mont Kiara, Kuala Lumpur', 'Bangsar South, Kuala Lumpur', 'Subang Jaya, Selangor', 'Petaling Jaya, Selangor', 'Setia Alam, Shah Alam', 'Puchong, Selangor', 'Cheras, Kuala Lumpur', 'Ampang, Selangor', 'Kajang, Selangor', 'Damansara Heights, Kuala Lumpur', 'Klang, Selangor']
const VEHICLES: Record<string, string[]> = { p1: ['Volvo EX30'], p2: ['Proton e.MAS 7', 'Proton e.MAS 5'], p3: ['BYD Atto 3', 'Tesla Model 3', 'Hyundai Ioniq 5', 'MG4 EV', 'BYD Seal'], p4: ['Zeekr 001', 'Zeekr X'], p5: ['Sangitech S1'] }

const SECOND = ['p2', 'p4', 'p5', 'p1']
const STATUS_ORDER: EvStatus[] = ['Lead', 'Assessed', 'Quoted', 'Follow-up', 'Accepted', 'Lost', 'Paid', 'Scheduled', 'Installed', 'Invoiced', 'Closed']
const specs: Spec[] = STATUS_ORDER.flatMap((status, i) => {
  const first: Spec = { status, principal: 'p3' }
  const second: Spec = { status, principal: SECOND[i % SECOND.length] }
  if (status === 'Lead') { first.noAck = true; first.ageH = 30; second.bookedFuture = true; second.ageH = 20 }
  if (status === 'Assessed') { first.ageH = 100 }
  if (status === 'Quoted') { first.ageH = 130 }
  if (status === 'Follow-up') { first.ageH = 300; first.followUps = 4; first.callTask = true; second.followUps = 2; second.ageH = 140 }
  if (status === 'Accepted') { first.ageH = 280 }
  return [first, second]
})

export interface QuoteSeed { jobId: string; jobNo: string; customer: string; principal: 'UPE' | 'PROTON' | 'CHARGESINI' | 'ZEEKR' | 'SANGITECH'; status: 'Sent' | 'Accepted' | 'Declined'; createdAt: string; sentAt: string; quoteId: string }
export interface InvoiceSeed { id: string; jobId: string; jobNo: string; customer: string; quoteId: string; status: 'Sent for sign-off' | 'Signed off'; createdAt: string; signedAt?: string }

export function buildEvSeed() {
  const customers: Customer[] = []
  const sites: Site[] = []
  const jobs: Job[] = []
  const history: JobHistory[] = []
  const documents: GeneratedDocument[] = []
  const quotes: QuoteSeed[] = []
  const invoices: InvoiceSeed[] = []
  let evi = 0

  specs.forEach((spec, i) => {
    const n = i + 1
    const name = NAMES[i % NAMES.length]
    const cid = `evc${n}`
    const sid = `evs${n}`
    const address = `${10 + i} Jalan ${['Kiara', 'Setia', 'Bukit', 'Damai', 'Laman'][i % 5]} ${i + 1}, ${AREAS[i % AREAS.length]}`
    customers.push({ id: cid, tenant_id: T, name, contact: name, phone: `+6012 77${String(i).padStart(2, '0')} 4${String(100 + i)}`, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, sqlAccCode: `EV-${100 + n}`, isCommercial: false } as Customer)
    sites.push({ id: sid, tenant_id: T, customerId: cid, name: 'Home site', address } as Site)

    const ageH = spec.ageH ?? OFFSET[MILESTONES[spec.status][MILESTONES[spec.status].length - 1]] + 20
    const createdAt = ago(ageH)
    const at: Partial<Record<EvMilestone, string>> = {}
    MILESTONES[spec.status].forEach(m => { if (!(m === 'ack' && spec.noAck)) at[m] = hoursAfter(createdAt, OFFSET[m]) })
    if (spec.noAck) delete at.booked
    if (spec.status === 'Lead' && !spec.bookedFuture) delete at.booked
    if (spec.status === 'Lead' && spec.bookedFuture) at.booked = hoursAfter(createdAt, 6)

    const vehicle = VEHICLES[spec.principal][i % VEHICLES[spec.principal].length]
    const jobNo = `EVA-${String(n).padStart(6, '0')}`
    const jobId = `evj${n}`
    const tech = ['u4', 'u5', 'u6'][i % 3]
    const quoteId = at.quoted ? `q-${jobNo}` : undefined
    const hasAssessment = !!at.assessed
    const ev: EvCase = {
      status: spec.status, at, vehicle, chargerModel: i % 4 === 0 ? '11kW AC' : '7kW AC', followUps: spec.followUps || 0, callTask: spec.callTask, quoteId,
      assessment: hasAssessment ? { photos: 6 + (i % 3), measurements: `Cable run ${12 + (i % 9)} m from DB to parking bay, ${4 + (i % 4)} m trunking`, remarks: 'Existing 63A main switch has capacity. Wall mount point confirmed with customer.', checklist: Object.fromEntries(ASSESS_CHECKS.map(c => [c, true])), at: at.assessed! } : undefined,
      outcome: spec.status === 'Lost' ? 'Declined' : spec.callTask ? 'No response' : undefined,
    }
    const scheduledEva = spec.bookedFuture ? '2026-11-05T09:00:00+08:00' : at.booked ? hoursAfter(createdAt, 12) : undefined
    const evaJob: Job = {
      id: jobId, jobNo, subject: `EV Assessment: ${vehicle}`, jobTypeId: 'jt3', customerId: cid, siteId: sid, principalId: spec.principal,
      status: hasAssessment ? 'Completed' : spec.bookedFuture ? 'Assigned' : 'Created', channel: i % 2 ? 'WhatsApp' : 'Portal',
      technicianId: at.booked ? tech : undefined, createdAt, slaDue: hoursAfter(createdAt, 48), pausedMs: 0, tenant_id: T,
      scheduledAt: scheduledEva, completedAt: at.assessed, ev,
    } as Job
    history.push({ id: `evh${n}`, jobId, userId: 'u2', event: 'EV case opened', toStatus: evaJob.status, at: createdAt })

    if (hasAssessment) {
      const code = PRINCIPAL_CODES[spec.principal]
      const ctx = { job: evaJob, principal: code, customer: customers[i], site: sites[i], technician: customers.length ? 'Farid Rahman' : undefined }
      documents.push({ id: `evd-taf-${n}`, jobId, docType: 'Technical Assessment Form', principal: PRINCIPAL_NAMES[spec.principal], createdAt: at.assessed!, status: 'Generated', fileName: docFileName('Technical Assessment Form', ctx), dataUrl: buildPdfDataUrl(docTitle('Technical Assessment Form', code), buildDocLines('Technical Assessment Form', ctx)) })
    }
    if (quoteId) {
      quotes.push({ jobId, jobNo, customer: name, principal: PRINCIPAL_CODES[spec.principal], status: ['Accepted', 'Paid', 'Scheduled', 'Installed', 'Invoiced', 'Closed'].includes(spec.status) ? 'Accepted' : spec.status === 'Lost' ? 'Declined' : 'Sent', createdAt: at.quoted!, sentAt: at.quoted!, quoteId })
    }

    jobs.push(evaJob)

    if (at.paid) {
      evi += 1
      const iNo = `EVI-${String(evi).padStart(6, '0')}`
      const iId = `evi${evi}`
      const done = !!at.installed
      const booked = !!at.scheduled
      const when = spec.status === 'Scheduled' ? (evi % 2 ? '2026-11-06T10:00:00+08:00' : '2026-11-10T14:00:00+08:00') : at.installed
      const installJob: Job = {
        id: iId, jobNo: iNo, subject: `EV charger installation: ${name}`, jobTypeId: 'jt4', customerId: cid, siteId: sid, principalId: spec.principal, parentJobId: jobId,
        status: done ? 'Completed' : booked ? 'Assigned' : 'Created', channel: 'Portal', technicianId: booked ? tech : undefined,
        createdAt: at.paid!, slaDue: hoursAfter(at.paid!, 72), pausedMs: 0, tenant_id: T, scheduledAt: booked ? when : undefined, completedAt: at.installed, selfService: booked,
      } as Job
      jobs.push(installJob)
      ev.installJobId = iId
      ev.bookingToken = `evb-${jobNo.toLowerCase()}`
      ev.payment = { amount: 2600 + (i % 5) * 120, date: at.paid!.slice(0, 10), ref: `FPX-${70000 + i * 13}` }
      history.push({ id: `evih${evi}`, jobId: iId, userId: 'u2', event: 'Installation job created after payment', toStatus: installJob.status, at: at.paid! })
      if (at.installed) {
        const code = PRINCIPAL_CODES[spec.principal]
        const ctx = { job: evaJob, principal: code, customer: customers[i], site: sites[i], technician: ['Farid Rahman', 'Kumar Raj', 'Hafiz Omar'][i % 3], quoteNo: undefined }
        documents.push({ id: `evd-ir-${n}`, jobId, docType: 'Installation Report', principal: PRINCIPAL_NAMES[spec.principal], createdAt: at.report!, status: 'Sent', sentTo: [PRINCIPAL_NAMES[spec.principal], customers[i].email], fileName: docFileName('Installation Report', ctx), dataUrl: buildPdfDataUrl(docTitle('Installation Report', code), buildDocLines('Installation Report', ctx)) })
      }
    }
    if (at.invoiced) {
      ev.invoiceId = `inv-${jobNo}`
      invoices.push({ id: ev.invoiceId, jobId, jobNo, customer: name, quoteId: quoteId!, status: spec.status === 'Closed' ? 'Signed off' : 'Sent for sign-off', createdAt: at.invoiced, signedAt: at.closed })
      ev.invoicedAmt = 2400 + (i % 6) * 190
      if (spec.principal !== 'p1') ev.claimableAmt = Math.round(ev.invoicedAmt * (0.55 + (i % 3) * 0.05))
    }
  })

  return { customers, sites, jobs, history, documents, quotes, invoices }
}
