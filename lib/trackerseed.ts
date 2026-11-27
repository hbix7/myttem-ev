import type { ChargerType, Customer, EvCase, EvMilestone, EvStatus, Job, JobHistory, Site, CaseFlag, PoStatus } from './types'

const T = 't-upe'
type Pc = 'UPE' | 'CHARGESINI'
type Submission = 'Not submitted' | 'Submitted' | 'Cancelled'
type Payment = 'Pending' | 'Outstanding' | 'Received'

export interface TrackerQuoteSeed { id: string; jobId: string; jobNo: string; customer: string; principal: Pc; status: 'Sent' | 'Accepted'; createdAt: string; sentAt: string; principalRef: string; submittedOn: string }
export interface TrackerInvoiceSeed { id: string; jobId: string; jobNo: string; customer: string; principal: Pc; quoteId?: string; sqlInvoiceNo: string; submittedOn?: string; submissionStatus: Submission; paymentStatus: Payment; paidOn?: string; createdAt: string }

interface Row {
  key: string; customer: string; phone: string; vehicle?: string; charger?: ChargerType; address: string; area?: string; principal: Pc
  proposed?: string; actual?: string; install?: string
  quoteRef?: string; quoteOn?: string; po?: PoStatus; poNo?: string
  inv?: string; invOn?: string; invSub?: Submission; pay?: Payment; paidOn?: string
  flag?: CaseFlag; revisionOf?: string; revisionLabel?: string; notes?: string; sameCustomerAs?: string
}

const rows: Row[] = [
  { key: 'a1', customer: 'Aiman Testcustomer', phone: '+60 12-000 0001', vehicle: 'Demo EV A', charger: 'Phase 3', address: '1 Jalan Contoh 1/1, Taman Demo, 40000 Shah Alam', principal: 'CHARGESINI', proposed: '2026-03-10T14:30', actual: '2026-03-10T14:30', quoteRef: 'T-90001', quoteOn: '2026-03-12', po: 'Received', poNo: '900001', inv: 'INV 9001', invOn: '2026-04-02', invSub: 'Submitted', pay: 'Received', paidOn: '2026-04-20' },
  { key: 'a2', customer: 'Sample Lim', phone: '', vehicle: 'Demo EV B', charger: 'Phase 3', address: '2 Jalan Contoh 2/2, Taman Demo, 47500 Subang Jaya', principal: 'CHARGESINI', proposed: '2026-03-11T10:00', actual: '2026-03-11T10:00', quoteRef: 'T-90002', quoteOn: '2026-03-13', po: 'Received', poNo: '900002', inv: 'INV 9002', invOn: '2026-04-05', invSub: 'Submitted', pay: 'Outstanding' },
  { key: 'a2v', customer: 'Sample Lim', phone: '', vehicle: 'Demo EV B', charger: 'Phase 3', address: '2 Jalan Contoh 2/2, Taman Demo, 47500 Subang Jaya', principal: 'CHARGESINI', flag: 'Superseded', revisionOf: 'a2', revisionLabel: 'Variation Order', notes: 'Variation Order', po: 'Pending' },
  { key: 'a3', customer: 'Dummy Rahman', phone: '+60 12-000 0003', vehicle: 'Demo EV C', charger: 'Phase 1', address: '3 Jalan Contoh 3/3, Kajang', principal: 'CHARGESINI', proposed: '2026-03-14T11:00', quoteRef: 'T-90003', quoteOn: '2026-03-16', po: 'Pending' },
  { key: 'a3r', customer: 'Dummy Rahman', phone: '+60 12-000 0003', vehicle: 'Demo EV C', charger: 'Phase 1', address: '3 Jalan Contoh 3/3, Kajang', principal: 'CHARGESINI', revisionOf: 'a3', revisionLabel: 'Rev 1', quoteRef: 'T-90003-R1', quoteOn: '2026-03-20', po: 'Pending', pay: 'Pending', invSub: 'Not submitted' },
  { key: 'a4', customer: 'Test Tan', phone: '+60 12-000 0004', vehicle: 'Demo EV D', charger: 'Phase 1', address: '4 Jalan Contoh 4/4, Petaling Jaya', principal: 'CHARGESINI', proposed: '2026-03-05T15:00', quoteRef: 'T-90004', quoteOn: '2026-03-07', po: 'Cancelled', flag: 'Cancelled' },
  { key: 'u1', customer: 'Contoh Wong', phone: '+60 12-000 0005', vehicle: 'Demo EV E', charger: 'Phase 3', address: '5 Jalan Contoh 5/5, Cyberjaya', principal: 'UPE', install: '2026-03-20T10:00', quoteRef: 'QT-90010', quoteOn: '2026-03-09', po: 'Received', inv: 'INV 9010', invOn: '2026-03-25', invSub: 'Submitted', pay: 'Received', paidOn: '2026-04-10' },
  { key: 'u2', customer: 'Placeholder Singh', phone: '', charger: 'Phase 1', address: '6 Jalan Contoh 6/6, Puchong', principal: 'UPE', quoteRef: 'QT-90011', notes: 'SINGLE PHASE UPGRADE TP 10MM' },
  { key: 'u3', customer: 'Demo Invoice Only', phone: '', address: '', principal: 'UPE', inv: 'INV 9012' },
]

const PRINCIPAL_ID: Record<Pc, string> = { UPE: 'p1', CHARGESINI: 'p3' }
const iso = (local?: string) => (local ? (local.length > 10 ? `${local}:00+08:00` : `${local}T09:00:00+08:00`) : undefined)

export function buildTrackerSeed() {
  const customers: Customer[] = []
  const sites: Site[] = []
  const jobs: Job[] = []
  const history: JobHistory[] = []
  const quotes: TrackerQuoteSeed[] = []
  const invoices: TrackerInvoiceSeed[] = []
  const custByName = new Map<string, Customer>()
  const siteByAddr = new Map<string, Site>()
  const jobIds = new Map<string, string>()

  rows.forEach((r, i) => {
    const n = i + 1
    let cust = custByName.get(r.customer)
    if (!cust) {
      cust = { id: `trc${custByName.size + 1}`, tenant_id: T, name: r.customer, contact: r.customer, phone: r.phone, email: `${r.customer.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, sqlAccCode: `TR-${900 + custByName.size + 1}`, isCommercial: false } as Customer
      custByName.set(r.customer, cust)
      customers.push(cust)
    }
    const addrKey = `${cust.id}|${r.address}`
    let site = siteByAddr.get(addrKey)
    if (!site) {
      site = { id: `trs${siteByAddr.size + 1}`, tenant_id: T, customerId: cust.id, name: 'Home site', address: r.address, postcode: (r.address.match(/\b\d{5}\b/) || [''])[0], area: '' } as Site
      siteByAddr.set(addrKey, site)
      sites.push(site)
    }

    const jobId = `trj${n}`
    const jobNo = `EVA-${String(900 + n).padStart(6, '0')}`
    jobIds.set(r.key, jobId)
    const created = iso(r.proposed) || iso(r.quoteOn) || iso(r.invOn) || '2026-03-01T09:00:00+08:00'
    const at: Partial<Record<EvMilestone, string>> = {}
    if (r.actual) at.assessed = iso(r.actual)
    if (r.quoteRef) at.quoted = iso(r.quoteOn) || created
    if (r.install) at.scheduled = iso(r.install)
    if (r.inv) at.invoiced = iso(r.invOn) || created
    if (r.pay === 'Received') at.closed = iso(r.paidOn)
    const status: EvStatus = r.pay === 'Received' ? 'Closed' : r.inv ? 'Invoiced' : r.quoteRef ? 'Quoted' : 'Lead'
    const quoteId = r.quoteRef ? `q-${jobNo}` : undefined
    const invoiceId = r.inv || r.pay ? `inv-${jobNo}` : undefined
    const ev: EvCase = {
      status, at, vehicle: r.vehicle, followUps: 0, quoteId, invoiceId,
      chargerType: r.charger, inspectionProposed: r.proposed, inspectionActual: r.actual, installationDate: r.install,
      poStatus: r.po, poNumber: r.poNo, caseFlag: r.flag || 'Active', revisionOf: r.revisionOf ? jobIds.get(r.revisionOf) : undefined, revisionLabel: r.revisionLabel, notes: r.notes, legacy: true,
    }
    jobs.push({
      id: jobId, jobNo, subject: `EV Assessment: ${r.vehicle || 'Tracker case'}`, jobTypeId: 'jt3', customerId: cust.id, siteId: site.id, principalId: PRINCIPAL_ID[r.principal],
      status: r.actual ? 'Completed' : 'Created', channel: 'Phone', createdAt: created, slaDue: new Date(new Date(created).getTime() + 48 * 3600000).toISOString(), pausedMs: 0, tenant_id: T,
      scheduledAt: iso(r.install || r.proposed), completedAt: iso(r.actual), contactPhone: r.phone || undefined, ev,
    } as Job)
    history.push({ id: `trh${n}`, jobId, userId: 'u2', event: 'Imported from tracker', at: created })

    if (quoteId) quotes.push({ id: quoteId, jobId, jobNo, customer: r.customer, principal: r.principal, status: r.po === 'Received' ? 'Accepted' : 'Sent', createdAt: at.quoted!, sentAt: at.quoted!, principalRef: r.quoteRef!, submittedOn: r.quoteOn || at.quoted!.slice(0, 10) })
    if (invoiceId) invoices.push({ id: invoiceId, jobId, jobNo, customer: r.customer, principal: r.principal, quoteId, sqlInvoiceNo: r.inv || '', submittedOn: r.invOn, submissionStatus: r.invSub || (r.invOn ? 'Submitted' : 'Not submitted'), paymentStatus: r.pay || 'Pending', paidOn: r.paidOn, createdAt: at.invoiced || created })
  })

  return { customers, sites, jobs, history, quotes, invoices }
}
