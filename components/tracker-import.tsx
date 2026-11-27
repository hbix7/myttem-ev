'use client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useCommercialStore, type PrincipalCode, type QuoteLine } from '@/lib/store/commercial'
import { readXlsxRows } from '@/lib/export'
import { parseTrackerDate } from '@/lib/tracker'
import type { ChargerType, CaseFlag, Customer, EvCase, EvMilestone, EvStatus, Job, PoStatus, Site } from '@/lib/types'

const TENANT = 't-upe'
const PRINCIPAL_ID: Partial<Record<PrincipalCode, string>> = { UPE: 'p1', CHARGESINI: 'p3' }

type FieldKey = 'customer' | 'contact' | 'vehicle' | 'charger' | 'location' | 'proposed' | 'actual' | 'quoteRef' | 'quoteOn' | 'po' | 'install' | 'inv' | 'invOn' | 'invSub' | 'pay' | 'poNo' | 'notes' | 'colour' | 'principal' | 'revLabel'
const FIELDS: { key: FieldKey; label: string; hints: RegExp }[] = [
  { key: 'customer', label: 'Customer', hints: /^(customer|name|client)/i },
  { key: 'contact', label: 'Contact number', hints: /contact|phone|mobile|tel/i },
  { key: 'vehicle', label: 'Car model', hints: /car|vehicle|model/i },
  { key: 'charger', label: 'Charger type', hints: /charger|phase/i },
  { key: 'location', label: 'Location', hints: /location|address|site/i },
  { key: 'proposed', label: 'Inspection proposed', hints: /proposed/i },
  { key: 'actual', label: 'Inspection actual', hints: /actual|inspection date|inspected/i },
  { key: 'quoteRef', label: 'Principal quotation ref', hints: /quotation ref|quote ref|quotation no|^quotation$|^quote$/i },
  { key: 'quoteOn', label: 'Quotation submitted', hints: /quotation (submitted|date)|quote (submitted|date)/i },
  { key: 'po', label: 'PO status', hints: /po status|^po$/i },
  { key: 'install', label: 'Installation date', hints: /install/i },
  { key: 'inv', label: 'SQL invoice no.', hints: /invoice (no|number)|sql inv|^invoice$/i },
  { key: 'invOn', label: 'Invoice submitted on', hints: /invoice (submitted|date)/i },
  { key: 'invSub', label: 'Invoice submission', hints: /submission/i },
  { key: 'pay', label: 'Payment', hints: /payment|paid/i },
  { key: 'poNo', label: 'PO number', hints: /po (no|number)/i },
  { key: 'notes', label: 'Notes', hints: /note|remark/i },
  { key: 'colour', label: 'Row colour', hints: /colou?r/i },
  { key: 'principal', label: 'Principal', hints: /principal|source/i },
  { key: 'revLabel', label: 'Revision label', hints: /revision/i },
]

type Kind = 'Normal' | 'Cancelled' | 'Superseded' | 'Revision'
type Submission = 'Not submitted' | 'Submitted' | 'Cancelled'
type Payment = 'Pending' | 'Outstanding' | 'Received'

interface ParsedRow {
  n: number
  customer: string
  address: string
  vehicle?: string
  charger?: ChargerType
  principal: PrincipalCode
  proposed?: string
  actual?: string
  install?: string
  quoteRef?: string
  quoteOn?: string
  po?: PoStatus
  poNo?: string
  inv?: string
  invOn?: string
  invSub?: Submission
  pay?: Payment
  notes?: string
  revLabel?: string
  kind: Kind
  issues: string[]
  warnings: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const dateOnly = (v?: string) => (v ? v.slice(0, 10) : '')

function parseCharger(v: string): ChargerType | undefined {
  if (/(^|\D)3|three/i.test(v)) return 'Phase 3'
  if (/(^|\D)1|single/i.test(v)) return 'Phase 1'
  return undefined
}
function parsePo(v: string): PoStatus | undefined {
  if (/cancel/i.test(v)) return 'Cancelled'
  if (/receiv/i.test(v)) return 'Received'
  if (/pend/i.test(v)) return 'Pending'
  return undefined
}
function parsePay(v: string): Payment | undefined {
  if (/outstand|overdue/i.test(v)) return 'Outstanding'
  if (/receiv|paid/i.test(v) && !/unpaid/i.test(v)) return 'Received'
  if (/pend|unpaid/i.test(v)) return 'Pending'
  return undefined
}
function parseSub(v: string): Submission | undefined {
  if (/cancel/i.test(v)) return 'Cancelled'
  if (/not/i.test(v)) return 'Not submitted'
  if (/submit/i.test(v)) return 'Submitted'
  return undefined
}
function parseKind(colour: string): Kind {
  const c = colour.toLowerCase()
  if (!c) return 'Normal'
  if (/supersed/.test(c)) return 'Superseded'
  if (/cancel|red/.test(c)) return 'Cancelled'
  if (/magenta|pink|purple|revision|variation/.test(c)) return 'Revision'
  return 'Normal'
}
function parsePrincipal(v: string, fallback: PrincipalCode): PrincipalCode {
  if (/charge|^cs$/i.test(v)) return 'CHARGESINI'
  if (/upe|own/i.test(v)) return 'UPE'
  return fallback
}

export function TrackerImportPage() {
  const input = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [header, setHeader] = useState<string[]>([])
  const [data, setData] = useState<string[][]>([])
  const [map, setMap] = useState<Record<FieldKey, number>>({} as Record<FieldKey, number>)
  const [defaultPrincipal, setDefaultPrincipal] = useState<PrincipalCode>('CHARGESINI')
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [kinds, setKinds] = useState<Record<number, Kind>>({})
  const [excluded, setExcluded] = useState<Record<number, boolean>>({})
  const [includeReview, setIncludeReview] = useState(false)
  const [summary, setSummary] = useState<string[]>([])

  const quotations = useCommercialStore(s => s.quotations)

  const load = async (file: File) => {
    try {
      const all = await readXlsxRows(file)
      if (all.length < 2) return toast.error('The file has no data rows')
      const h = all[0]
      const next = {} as Record<FieldKey, number>
      const taken = new Set<number>()
      for (const f of FIELDS) {
        const idx = h.findIndex((c, i) => !taken.has(i) && f.hints.test(c))
        next[f.key] = idx
        if (idx >= 0) taken.add(idx)
      }
      setFileName(file.name); setHeader(h); setData(all.slice(1).filter(r => r.some(c => c))); setMap(next); setKinds({}); setExcluded({}); setStep('map')
    } catch {
      toast.error('Could not read that file. Use a .csv or .xlsx file.')
    }
  }

  const parsed = useMemo<ParsedRow[]>(() => {
    if (step === 'upload' || step === 'map') return []
    const get = (r: string[], k: FieldKey) => (map[k] >= 0 && map[k] !== undefined ? (r[map[k]] ?? '').trim() : '')
    const seenRefs = new Map<string, number>()
    const existingRefs = new Set(quotations.map(q => norm(q.principalRef ?? '')).filter(Boolean))
    return data.map((r, i) => {
      const issues: string[] = []
      const warnings: string[] = []
      const date = (k: FieldKey, label: string) => {
        const raw = get(r, k)
        if (!raw) return undefined
        const v = parseTrackerDate(raw)
        if (!v) issues.push(`${label}: cannot read "${raw}"`)
        return v
      }
      const proposed = date('proposed', 'Inspection proposed')
      const actual = date('actual', 'Inspection actual')
      const install = date('install', 'Installation date')
      const quoteOn = date('quoteOn', 'Quotation submitted')
      const invOn = date('invOn', 'Invoice submitted on')
      const customer = get(r, 'customer')
      if (!customer) issues.push('Customer is empty')
      const quoteRef = get(r, 'quoteRef') || undefined
      const inv = get(r, 'inv') || undefined
      const invSub = parseSub(get(r, 'invSub')) ?? (invOn ? 'Submitted' : inv ? 'Not submitted' : undefined)
      const kind = kinds[i] ?? parseKind(get(r, 'colour'))
      const row: ParsedRow = {
        n: i + 2, customer, address: get(r, 'location'), vehicle: get(r, 'vehicle') || undefined, charger: parseCharger(get(r, 'charger')),
        principal: parsePrincipal(get(r, 'principal'), defaultPrincipal), proposed, actual, install, quoteRef, quoteOn,
        po: parsePo(get(r, 'po')), poNo: get(r, 'poNo') || undefined, inv, invOn, invSub, pay: parsePay(get(r, 'pay')),
        notes: get(r, 'notes') || undefined, revLabel: get(r, 'revLabel') || undefined, kind, issues, warnings,
      }
      const base = proposed || actual
      if (quoteOn && base && quoteOn.slice(0, 4) !== base.slice(0, 4)) warnings.push('Quotation date is in a different year from the inspection date')
      if (quoteRef) {
        const k = norm(quoteRef)
        if (seenRefs.has(k)) warnings.push(`Duplicate quotation ref (also on row ${seenRefs.get(k)})`)
        else if (existingRefs.has(k)) warnings.push('Quotation ref already exists in the app, row will update the matched case')
        seenRefs.set(k, seenRefs.get(k) ?? i + 2)
      }
      if (quoteOn && invOn && dateOnly(invOn) < dateOnly(quoteOn)) warnings.push('Invoice date is earlier than the quotation date')
      return row
    })
  }, [step, data, map, kinds, defaultPrincipal, quotations])

  const included = (p: ParsedRow, i: number) => {
    if (excluded[i]) return false
    return p.issues.length === 0 || includeReview
  }
  const reviewRows = parsed.filter(p => p.issues.length > 0)
  const importable = parsed.filter((p, i) => included(p, i) && p.customer)

  const runImport = () => {
    const st = useStore.getState()
    const cs = useCommercialStore.getState()
    const customers: Customer[] = [...st.customers]
    const sites: Site[] = [...st.sites]
    const jobs: Job[] = [...st.jobs]
    const newJobs: Job[] = []
    const newHistory: { id: string; jobId: string; userId: string; event: string; at: string }[] = []
    const lines = (principal: PrincipalCode): QuoteLine[] => [['svc2', 1], ['svc4', 1], ['svc3', 25], ['prt1', 1], ['prt2', 1]].flatMap(([id, qty]) => {
      const item = cs.items.find(x => x.id === id)
      if (!item) return []
      const price = item.prices[principal]
      return [{ itemId: id as string, qty: qty as number, unitPrice: price, originalUnitPrice: price }]
    })
    let evNo = jobs.filter(j => j.jobNo.startsWith('EVA-')).reduce((m, j) => Math.max(m, Number(j.jobNo.slice(4)) || 0), 0)
    const stats = { customers: 0, sites: 0, cases: 0, matched: 0, quotes: 0, invoices: 0, revisions: 0 }
    const batchJobByKey = new Map<string, string>()

    for (const [i, p] of parsed.entries()) {
      if (!included(p, i) || !p.customer) continue
      let cust = customers.find(c => norm(c.name) === norm(p.customer))
      if (!cust) {
        cust = { id: crypto.randomUUID(), tenant_id: TENANT, name: p.customer, contact: p.customer, phone: '', email: '', sqlAccCode: `TR-${String(customers.length + 1).padStart(4, '0')}`, isCommercial: false } as Customer
        customers.push(cust); stats.customers++
      }
      const addr = p.address || 'Address not provided'
      let site = sites.find(s => s.customerId === cust!.id && norm(s.address) === norm(addr))
      if (!site) {
        site = { id: crypto.randomUUID(), tenant_id: TENANT, customerId: cust.id, name: 'Imported site', address: addr, postcode: (addr.match(/\b\d{5}\b/) || [''])[0], area: '' } as Site
        sites.push(site); stats.sites++
      }
      const groupKey = `${cust.id}|${site.id}`
      const refMatch = p.quoteRef ? cs.quotations.find(q => norm(q.principalRef ?? '') === norm(p.quoteRef!)) : undefined
      let job: Job | undefined = refMatch ? jobs.find(j => j.id === refMatch.jobId) : undefined
      if (!job && p.kind === 'Normal') job = [...jobs, ...newJobs].find(j => j.customerId === cust!.id && j.siteId === site!.id && j.ev && !j.ev.revisionOf && (j.ev.caseFlag ?? 'Active') === 'Active' && !!j.ev.legacy)
      if (job && p.kind === 'Normal') {
        stats.matched++
        const ev = job.ev as EvCase
        const patch: Partial<EvCase> = {}
        if (!ev.vehicle && p.vehicle) patch.vehicle = p.vehicle
        if (!ev.chargerType && p.charger) patch.chargerType = p.charger
        if (!ev.inspectionProposed && p.proposed) patch.inspectionProposed = p.proposed
        if (!ev.inspectionActual && p.actual) patch.inspectionActual = p.actual
        if (!ev.installationDate && p.install) patch.installationDate = p.install
        if (!ev.poStatus && p.po) patch.poStatus = p.po
        if (!ev.poNumber && p.poNo) patch.poNumber = p.poNo
        if (!ev.notes && p.notes) patch.notes = p.notes
        useStore.setState(s => ({ jobs: s.jobs.map(j => j.id === job!.id ? { ...j, ev: { ...(j.ev as EvCase), ...patch } } : j) }))
        const jid = job.id
        const jno = job.jobNo
        const hasQuote = cs.quotations.some(q => q.jobId === jid)
        if (p.quoteRef && !hasQuote) {
          const qid = cs.createQuote({ jobId: jid, jobNo: jno, customer: p.customer, principal: p.principal, lines: lines(p.principal), status: p.po === 'Received' ? 'Accepted' : 'Sent', reminders: [], principalRef: p.quoteRef, submittedOn: dateOnly(p.quoteOn) || undefined })
          cs.updateQuote(qid, { createdAt: p.quoteOn ?? new Date().toISOString(), sentAt: p.quoteOn ?? new Date().toISOString() })
          stats.quotes++
        }
        if (p.inv && !useCommercialStore.getState().invoices.some(v => v.jobId === jid)) {
          const sub = lines(p.principal).reduce((a, l) => a + l.qty * l.unitPrice, 0)
          const iid = cs.createInvoice({ jobId: jid, jobNo: jno, customer: p.customer, lines: lines(p.principal), subtotal: sub, status: p.pay === 'Received' ? 'Paid' : p.invSub === 'Submitted' ? 'Signed off' : 'Draft', kind: 'ev', sqlInvoiceNo: p.inv, submittedOn: dateOnly(p.invOn) || undefined, submissionStatus: p.invSub, paymentStatus: p.pay ?? 'Pending' })
          cs.updateInvoice(iid, { createdAt: p.invOn ?? new Date().toISOString() })
          stats.invoices++
        }
        batchJobByKey.set(groupKey, jid)
        continue
      }

      evNo++
      const jobId = crypto.randomUUID()
      const jobNo = `EVA-${String(evNo).padStart(6, '0')}`
      const created = p.proposed || p.quoteOn || p.invOn || new Date().toISOString().slice(0, 10)
      const createdIso = created.length > 10 ? created : `${created}T09:00:00+08:00`
      const at: Partial<Record<EvMilestone, string>> = {}
      if (p.actual) at.assessed = p.actual
      if (p.quoteRef) at.quoted = p.quoteOn || created
      if (p.install) at.scheduled = p.install
      if (p.inv) at.invoiced = p.invOn || created
      if (p.pay === 'Received') at.closed = p.invOn || created
      const status: EvStatus = p.pay === 'Received' ? 'Closed' : p.inv ? 'Invoiced' : p.quoteRef ? 'Quoted' : 'Lead'
      const flag: CaseFlag = p.kind === 'Cancelled' ? 'Cancelled' : p.kind === 'Superseded' ? 'Superseded' : 'Active'
      const original = batchJobByKey.get(groupKey) ?? [...jobs, ...newJobs].find(j => j.customerId === cust!.id && j.siteId === site!.id && !j.ev?.revisionOf)?.id
      const revisionOf = p.kind === 'Revision' || p.kind === 'Superseded' ? original : undefined
      if (p.kind === 'Revision' && revisionOf) stats.revisions++
      const ev: EvCase = {
        status, at, vehicle: p.vehicle, followUps: 0, chargerType: p.charger, inspectionProposed: p.proposed, inspectionActual: p.actual, installationDate: p.install,
        poStatus: p.po, poNumber: p.poNo, caseFlag: flag, revisionOf, revisionLabel: p.revLabel || (p.kind === 'Revision' ? 'Revision' : undefined), notes: p.notes, legacy: true,
      }
      const job2 = {
        id: jobId, tenant_id: TENANT, jobNo, subject: `EV Assessment: ${p.vehicle || 'Tracker case'}`, jobTypeId: 'jt3', customerId: cust.id, siteId: site.id, principalId: PRINCIPAL_ID[p.principal],
        status: p.actual ? 'Completed' : 'Created', channel: 'Phone', createdAt: createdIso, slaDue: new Date(new Date(createdIso).getTime() + 48 * 3600000).toISOString(), pausedMs: 0,
        scheduledAt: p.install || p.proposed, completedAt: p.actual, ev,
      } as Job
      newJobs.push(job2)
      if (!batchJobByKey.has(groupKey)) batchJobByKey.set(groupKey, jobId)
      newHistory.push({ id: crypto.randomUUID(), jobId, userId: st.currentUserId, event: 'Imported from tracker (legacy)', at: createdIso })
      stats.cases++

      if (p.quoteRef) {
        const qid = cs.createQuote({ jobId, jobNo, customer: p.customer, principal: p.principal, lines: lines(p.principal), status: p.po === 'Received' ? 'Accepted' : 'Sent', reminders: [], principalRef: p.quoteRef, submittedOn: dateOnly(p.quoteOn) || undefined })
        cs.updateQuote(qid, { createdAt: p.quoteOn ?? createdIso, sentAt: p.quoteOn ?? createdIso })
        stats.quotes++
      }
      if (p.inv) {
        const sub = lines(p.principal).reduce((a, l) => a + l.qty * l.unitPrice, 0)
        const iid = cs.createInvoice({ jobId, jobNo, customer: p.customer, lines: lines(p.principal), subtotal: sub, status: p.pay === 'Received' ? 'Paid' : p.invSub === 'Submitted' ? 'Signed off' : 'Draft', kind: 'ev', sqlInvoiceNo: p.inv, submittedOn: dateOnly(p.invOn) || undefined, submissionStatus: p.invSub, paymentStatus: p.pay ?? 'Pending', paidOn: p.pay === 'Received' ? dateOnly(p.invOn) || undefined : undefined })
        cs.updateInvoice(iid, { createdAt: p.invOn ?? createdIso })
        stats.invoices++
      }
    }

    useStore.setState(s => ({ customers, sites, jobs: [...s.jobs, ...newJobs], history: [...s.history, ...newHistory] }))
    setSummary([
      `${stats.cases} new EV cases (flagged Legacy, no messages, deadlines or SLA)`,
      `${stats.matched} rows matched an existing case`,
      `${stats.customers} new customers, ${stats.sites} new sites`,
      `${stats.quotes} quotations, ${stats.invoices} invoices`,
      `${stats.revisions} revisions linked to their original case`,
      `${reviewRows.length} rows had unreadable data${includeReview ? ' (imported with the unreadable dates left empty)' : ' (skipped, see review list)'}`,
    ])
    setStep('done')
    toast.success('Tracker import complete')
  }

  const reset = () => { setStep('upload'); setData([]); setHeader([]); setFileName(''); setSummary([]) }
  const colHeader = (i: number) => (i >= 0 ? header[i] : '')

  return (
    <AppShell crumb="Administration > Tracker import">
      <PageHeader title="Tracker import" crumb="Administration > Tracker import" />
      <p className="page-intro">Upload your Excel installation tracker, map the columns, review, then import. Imported rows are marked Legacy and never trigger messages, deadlines, SLA warnings or notifications.</p>
      <p className="muted" role="note">Contact numbers are not imported from Excel. Add them in the app.</p>

      <input ref={input} type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Upload tracker file" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} />

      {step === 'upload' && (
        <section className="card settings-block">
          <h2>1. Upload file</h2>
          <p className="muted">Accepts .xlsx or .csv. The first row must contain column headings.</p>
          <button className="button primary" onClick={() => input.current?.click()}><Upload size={15} /> Choose file</button>
        </section>
      )}

      {step === 'map' && (
        <section className="card settings-block">
          <h2>2. Map columns</h2>
          <p className="muted">{fileName}: {data.length} rows. Pick which file column feeds each tracker field. Dates are read as DD/MM/YYYY with an optional time.</p>
          <label>Default principal (used when no Principal column is mapped)
            <select value={defaultPrincipal} onChange={e => setDefaultPrincipal(e.target.value as PrincipalCode)}>
              <option value="CHARGESINI">ChargeSini</option>
              <option value="UPE">UPE (own jobs)</option>
            </select>
          </label>
          <div className="table-wrap"><table>
            <thead><tr><th>Tracker field</th><th>File column</th></tr></thead>
            <tbody>{FIELDS.map(f => (
              <tr key={f.key}>
                <td>{f.label}{f.key === 'contact' && <span className="muted"> (values are never imported)</span>}</td>
                <td>
                  <select aria-label={`Column for ${f.label}`} value={map[f.key] ?? -1} onChange={e => setMap(m => ({ ...m, [f.key]: Number(e.target.value) }))}>
                    <option value={-1}>Not mapped</option>
                    {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="inline-add">
            <button className="button secondary" onClick={reset}>Cancel</button>
            <button className="button primary" disabled={map.customer < 0} onClick={() => setStep('preview')}>Preview import</button>
          </div>
          {map.customer < 0 && <p className="muted">Map the Customer column to continue.</p>}
        </section>
      )}

      {step === 'preview' && (
        <>
          <section className="card settings-block">
            <h2>3. Preview</h2>
            <p className="muted">{importable.length} of {parsed.length} rows will be imported. Contact number is left empty on every imported row. Use Row type to mark a row Cancelled, Superseded or Revision.</p>
            {reviewRows.length > 0 && (
              <div role="alert">
                <strong>{reviewRows.length} rows need review</strong>
                <ul>{reviewRows.slice(0, 20).map(p => <li key={p.n}>Row {p.n}: {p.issues.join('; ')}</li>)}</ul>
                <label className="inline-add"><input type="checkbox" checked={includeReview} onChange={e => setIncludeReview(e.target.checked)} /> Import review rows anyway (unreadable dates are left empty)</label>
              </div>
            )}
            <div className="inline-add">
              <button className="button secondary" onClick={() => setStep('map')}>Back to mapping</button>
              <button className="button primary" disabled={!importable.length} onClick={runImport}>Import {importable.length} rows</button>
            </div>
          </section>
          <section className="card settings-block">
            <div className="table-wrap"><table>
              <thead><tr><th>Import</th><th>Row</th><th>Customer</th><th>Contact number</th><th>Car model</th><th>Charger</th><th>Location</th><th>Quotation ref</th><th>PO</th><th>Invoice</th><th>Payment</th><th>Row type</th><th>Checks</th></tr></thead>
              <tbody>{parsed.map((p, i) => {
                const rowBg = p.kind === 'Cancelled' || p.kind === 'Superseded' ? 'row-red' : p.kind === 'Revision' ? 'row-magenta' : ''
                return (
                  <tr key={i} className={rowBg}>
                    <td><input type="checkbox" aria-label={`Import row ${p.n}`} checked={included(p, i)} onChange={e => setExcluded(x => ({ ...x, [i]: !e.target.checked }))} /></td>
                    <td>{p.n}</td>
                    <td>{p.customer || '-'}</td>
                    <td className="muted">-</td>
                    <td>{p.vehicle || '-'}</td>
                    <td>{p.charger || '-'}</td>
                    <td>{p.address || '-'}</td>
                    <td>{p.quoteRef || '-'}</td>
                    <td>{p.po || '-'}</td>
                    <td>{p.inv || '-'}</td>
                    <td>{p.pay || '-'}</td>
                    <td>
                      <select aria-label={`Row type for row ${p.n}`} value={p.kind} onChange={e => setKinds(k => ({ ...k, [i]: e.target.value as Kind }))}>
                        <option>Normal</option><option>Cancelled</option><option>Superseded</option><option>Revision</option>
                      </select>
                    </td>
                    <td>{[...p.issues, ...p.warnings].map((w, j) => <div key={j} className="muted">{w}</div>)}{!p.issues.length && !p.warnings.length && <span className="muted">OK</span>}</td>
                  </tr>
                )
              })}</tbody>
            </table></div>
          </section>
        </>
      )}

      {step === 'done' && (
        <section className="card settings-block">
          <h2>Import complete</h2>
          <ul>{summary.map(s => <li key={s}>{s}</li>)}</ul>
          <div className="inline-add">
            <a className="button primary" href="/ev/tracker">Open tracker</a>
            <button className="button secondary" onClick={reset}>Import another file</button>
          </div>
        </section>
      )}
    </AppShell>
  )
}
