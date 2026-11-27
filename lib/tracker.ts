import type { Customer, Job, Site } from '@/lib/types'
import type { Invoice, Quotation, PrincipalCode } from '@/lib/store/commercial'
import { PRINCIPAL_NAMES } from '@/lib/store/commercial'
import { principalCode } from '@/lib/ev'

export const TRACKER_COLUMNS = ['Customer', 'Contact number', 'Car model', 'Charger type', 'Location', 'Inspection proposed', 'Inspection actual', 'Principal quotation ref', 'Quotation submitted', 'PO status', 'Installation date', 'SQL invoice no.', 'Invoice submitted on', 'Invoice submission', 'Payment', 'PO number', 'Notes'] as const

export type RowColor = 'none' | 'red' | 'magenta'
export interface TrackerRow {
  job: Job
  customer?: Customer
  site?: Site
  quote?: Quotation
  invoice?: Invoice
  principal: PrincipalCode
  contact: string
  color: RowColor
  quoteGreen: boolean
  dimmed: boolean
  isRevision: boolean
}

export function buildTrackerRows(jobs: Job[], customers: Customer[], sites: Site[], quotes: Quotation[], invoices: Invoice[]): TrackerRow[] {
  const cases = jobs.filter(j => j.ev)
  const ids = new Set(cases.map(j => j.id))
  const make = (job: Job): TrackerRow => {
    const ev = job.ev!
    const customer = customers.find(c => c.id === job.customerId)
    const site = sites.find(s => s.id === job.siteId)
    const quote = quotes.find(q => q.id === ev.quoteId) || quotes.find(q => q.jobId === job.id)
    const invoice = invoices.find(i => i.id === ev.invoiceId) || invoices.find(i => i.jobId === job.id && i.kind === 'ev')
    const red = ev.caseFlag === 'Cancelled' || ev.caseFlag === 'Superseded'
    const isRevision = !!ev.revisionOf
    return {
      job, customer, site, quote, invoice, principal: principalCode(job.principalId),
      contact: job.contactPhone || customer?.phone || '',
      color: red ? 'red' : isRevision ? 'magenta' : 'none',
      quoteGreen: ev.poStatus === 'Received' && invoice?.submissionStatus === 'Submitted' && invoice?.paymentStatus === 'Received',
      dimmed: ev.caseFlag === 'Superseded' && cases.some(c => c.ev?.revisionOf === job.id),
      isRevision,
    }
  }
  const sorted = [...cases].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const out: TrackerRow[] = []
  const placed = new Set<string>()
  const place = (job: Job) => {
    if (placed.has(job.id)) return
    placed.add(job.id)
    out.push(make(job))
    sorted.filter(c => c.ev?.revisionOf === job.id).forEach(place)
  }
  sorted.filter(j => !j.ev?.revisionOf || !ids.has(j.ev.revisionOf)).forEach(place)
  sorted.forEach(place)
  return out
}

export function rowSearchText(r: TrackerRow) {
  return [r.customer?.name, r.contact, r.quote?.principalRef, r.quote?.quoteNo, r.invoice?.sqlInvoiceNo, r.invoice?.invoiceNo, r.job.ev?.poNumber, r.job.contactAddress, r.site?.address, r.job.jobNo].filter(Boolean).join(' ').toLowerCase()
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Date (YYYY-MM-DD) or date with time (YYYY-MM-DDTHH:mm) to DD/MM/YYYY and 2.30PM. */
export function fmtTracker(v?: string) {
  if (!v) return ''
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return v
  const date = `${m[3]}/${m[2]}/${m[1]}`
  if (!m[4] || (m[4] === '00' && m[5] === '00' && v.length <= 10)) return date
  let h = Number(m[4])
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${date} ${h}.${m[5]}${suffix}`
}
export const dayOnly = (v?: string) => (v ? v.slice(0, 10) : '')
export const timeOnly = (v?: string) => (v && v.length > 10 ? v.slice(11, 16) : '')
export const joinDateTime = (date: string, time: string) => (date ? (time ? `${date}T${time}` : date) : undefined)

/** Parses DD/MM/YYYY with optional time such as "20/1/2025 / 2.30PM". Returns undefined when it cannot be read. */
export function parseTrackerDate(input: string): string | undefined {
  const text = (input || '').trim()
  if (!text) return undefined
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (iso) return iso[4] ? `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}` : `${iso[1]}-${iso[2]}-${iso[3]}`
  const d = text.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/)
  if (!d) {
    if (/GMT|UTC/.test(text) && !Number.isNaN(Date.parse(text))) {
      const dt = new Date(text)
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
    }
    return undefined
  }
  let [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])]
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCMonth() !== month - 1) return undefined
  const date = `${year}-${pad(month)}-${pad(day)}`
  const rest = text.slice((d.index || 0) + d[0].length)
  const t = rest.match(/(\d{1,2})\s*(?:[.:]\s*(\d{2}))?\s*(am|pm)\b/i) || rest.match(/(\d{1,2}):(\d{2})()/)
  if (!t) return date
  let h = Number(t[1])
  const min = Number(t[2] || 0)
  const ap = (t[3] || '').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return date
  return `${date}T${pad(h)}:${pad(min)}`
}

export const PILL: Record<string, string> = {
  Received: 'green', Submitted: 'green', Pending: 'yellow', 'Not submitted': 'yellow', Outstanding: 'darkred', Cancelled: 'grey', 'Phase 1': 'blue', 'Phase 3': 'green',
}
const XL_FILL: Record<string, { bg: string; fg: string }> = {
  green: { bg: '#C6EFCE', fg: '#006100' }, yellow: { bg: '#FFEB9C', fg: '#7F6000' }, darkred: { bg: '#9C0006', fg: '#FFFFFF' }, grey: { bg: '#595959', fg: '#FFFFFF' }, blue: { bg: '#BDD7EE', fg: '#1F4E79' },
}
const ROW_FILL: Record<RowColor, string | undefined> = { none: undefined, red: '#FFC7CE', magenta: '#F4B6E8' }

export function trackerCells(r: TrackerRow): string[] {
  const ev = r.job.ev!
  const inv = r.invoice
  return [
    r.customer?.name || '', r.contact, ev.vehicle || '', ev.chargerType || '', r.job.contactAddress || r.site?.address || '',
    fmtTracker(ev.inspectionProposed), fmtTracker(ev.inspectionActual), r.quote?.principalRef || '', fmtTracker(r.quote?.submittedOn || (r.quote?.sentAt ? r.quote.sentAt.slice(0, 10) : '')),
    ev.poStatus || '', fmtTracker(ev.installationDate), inv?.sqlInvoiceNo || '', fmtTracker(inv?.submittedOn), inv?.submissionStatus || '', inv?.paymentStatus || '', ev.poNumber || '', ev.notes || '',
  ]
}

export async function exportTrackerXlsx(rows: TrackerRow[], tab: 'All' | PrincipalCode) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const head = TRACKER_COLUMNS.map(h => ({ value: h as string, fontWeight: 'bold' as const, backgroundColor: '#1F2937', color: '#FFFFFF' }))
  const pillCols = new Set([3, 9, 13, 14])
  const body = rows.map(r => {
    const base = ROW_FILL[r.color]
    return trackerCells(r).map((v, i) => {
      const cell: Record<string, unknown> = { value: v }
      if (base) cell.backgroundColor = base
      if (i === 7 && r.quoteGreen) { cell.backgroundColor = '#92D050'; cell.fontWeight = 'bold' }
      if (pillCols.has(i) && v) { const f = XL_FILL[PILL[v]]; if (f) { cell.backgroundColor = f.bg; cell.color = f.fg } }
      return cell
    })
  })
  const name = `myttem-tracker-${tab === 'All' ? 'all' : PRINCIPAL_NAMES[tab].toLowerCase()}.xlsx`
  await writeExcelFile([head, ...body] as never, { columns: TRACKER_COLUMNS.map((_, i) => ({ width: [24, 18, 16, 12, 40, 20, 20, 20, 18, 12, 20, 16, 18, 16, 14, 14, 30][i] })) } as never).toFile(name)
  return name
}

/** Marks submitted, unpaid invoices Outstanding once they pass the configured number of days. Never touches Received or Cancelled invoices. */
export function applyOutstanding(invoices: Invoice[], days: number, todayKey: string): string[] {
  const limit = new Date(`${todayKey}T00:00:00+08:00`).getTime() - days * 86400000
  return invoices
    .filter(i => i.submissionStatus === 'Submitted' && i.submittedOn && i.paymentStatus !== 'Received' && i.paymentStatus !== 'Outstanding' && new Date(`${i.submittedOn.slice(0, 10)}T00:00:00+08:00`).getTime() <= limit)
    .map(i => i.id)
}
