'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Download, Search } from 'lucide-react'
import { AppShell, PageHeader, EmptyState } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useCommercialStore, PRINCIPAL_NAMES, type PrincipalCode, type Invoice } from '@/lib/store/commercial'
import { todayKL } from '@/lib/clock'
import { applyOutstanding, buildTrackerRows, rowSearchText, dayOnly, timeOnly, joinDateTime, exportTrackerXlsx, TRACKER_COLUMNS, PILL, type TrackerRow } from '@/lib/tracker'
import type { ChargerType, EvCase, PoStatus } from '@/lib/types'

const CHARGERS: ChargerType[] = ['Phase 1', 'Phase 3']
const CHARGER_LABEL: Record<ChargerType, string> = { 'Phase 1': 'Phase 1 (Single phase, 7kW)', 'Phase 3': 'Phase 3 (Three phase, 22kW)' }
const PO: PoStatus[] = ['Pending', 'Received', 'Cancelled']
const SUBMISSION = ['Not submitted', 'Submitted', 'Cancelled'] as const
const PAYMENT = ['Pending', 'Outstanding', 'Received'] as const
const Dash = () => <span className="muted">-</span>

function TextCell({ value, onSave, label, wide, multiline, placeholder }: { value: string; onSave: (v: string) => void; label: string; wide?: boolean; multiline?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => { if (v !== value) onSave(v.trim()) }
  const props = { className: `tk-input${wide ? ' wide' : ''}`, value: v, 'aria-label': label, placeholder: placeholder ?? '-', onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value), onBlur: commit }
  return multiline ? <textarea rows={2} {...props} /> : <input {...props} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}

function PillSelect<T extends string>({ value, options, onChange, label, labels }: { value?: T; options: readonly T[]; onChange: (v: T | undefined) => void; label: string; labels?: Partial<Record<T, string>> }) {
  const tone = value ? PILL[value] || 'grey' : 'none'
  return (
    <select className={`tk-pill tk-${tone}`} aria-label={label} value={value || ''} onChange={e => onChange((e.target.value || undefined) as T | undefined)}>
      <option value="">-</option>
      {options.map(o => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
    </select>
  )
}

function DateTimeCell({ value, onSave, label }: { value?: string; onSave: (v?: string) => void; label: string }) {
  const date = dayOnly(value)
  const time = timeOnly(value)
  return (
    <div className="tk-dt">
      <input type="date" className="tk-input" aria-label={`${label} date`} value={date} onChange={e => onSave(joinDateTime(e.target.value, time))} />
      {date && <input type="time" className="tk-input" aria-label={`${label} time`} value={time} onChange={e => onSave(joinDateTime(date, e.target.value))} />}
    </div>
  )
}

export function TrackerPage() {
  const jobs = useStore(s => s.jobs)
  const customers = useStore(s => s.customers)
  const sites = useStore(s => s.sites)
  const updateJob = useStore(s => s.updateJob)
  const updateSite = useStore(s => s.updateSite)
  const quotations = useCommercialStore(s => s.quotations)
  const invoices = useCommercialStore(s => s.invoices)
  const updateQuote = useCommercialStore(s => s.updateQuote)
  const updateInvoice = useCommercialStore(s => s.updateInvoice)
  const createQuote = useCommercialStore(s => s.createQuote)
  const createInvoice = useCommercialStore(s => s.createInvoice)

  const outstandingDays = useStore(s => s.settings.outstandingAfterDays ?? 30)
  useEffect(() => {
    const ids = applyOutstanding(invoices, outstandingDays, todayKL())
    ids.forEach(id => updateInvoice(id, { paymentStatus: 'Outstanding' }))
  }, [invoices, outstandingDays, updateInvoice])
  const [tab, setTab] = useState<'All' | PrincipalCode>('CHARGESINI')
  const [q, setQ] = useState('')
  const [charger, setCharger] = useState('')
  const [po, setPo] = useState('')
  const [submission, setSubmission] = useState('')
  const [payment, setPayment] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)

  const all = useMemo(() => buildTrackerRows(jobs, customers, sites, quotations, invoices), [jobs, customers, sites, quotations, invoices])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter(r => {
      const ev = r.job.ev!
      if (tab !== 'All' && r.principal !== tab) return false
      if (!showCancelled && (ev.caseFlag === 'Cancelled' || ev.poStatus === 'Cancelled')) return false
      if (needle && !rowSearchText(r).includes(needle)) return false
      if (charger && ev.chargerType !== charger) return false
      if (po && ev.poStatus !== po) return false
      if (submission && r.invoice?.submissionStatus !== submission) return false
      if (payment && r.invoice?.paymentStatus !== payment) return false
      if (from || to) {
        const dates = [ev.inspectionProposed, ev.inspectionActual, ev.installationDate, r.quote?.submittedOn, r.invoice?.submittedOn].filter(Boolean).map(d => dayOnly(d))
        if (!dates.some(d => (!from || d >= from) && (!to || d <= to))) return false
      }
      return true
    })
  }, [all, tab, q, charger, po, submission, payment, from, to, showCancelled])

  const counts = useMemo(() => ({
    All: all.length, CHARGESINI: all.filter(r => r.principal === 'CHARGESINI').length, UPE: all.filter(r => r.principal === 'UPE').length,
  }), [all])

  const patchEv = (r: TrackerRow, patch: Partial<EvCase>) => updateJob(r.job.id, { ev: { ...r.job.ev!, ...patch } })

  const saveQuote = (r: TrackerRow, patch: { principalRef?: string; submittedOn?: string }) => {
    if (r.quote) return updateQuote(r.quote.id, patch)
    const id = createQuote({ jobId: r.job.id, jobNo: r.job.jobNo, customer: r.customer?.name || r.job.jobNo, principal: r.principal, lines: [], status: 'Draft', reminders: [], ...patch } as never)
    patchEv(r, { quoteId: id })
  }
  const saveInvoice = (r: TrackerRow, patch: Partial<Invoice>) => {
    if (r.invoice) return updateInvoice(r.invoice.id, patch)
    const id = createInvoice({ jobId: r.job.id, jobNo: r.job.jobNo, customer: r.customer?.name || r.job.jobNo, lines: [], subtotal: 0, status: 'Draft', kind: 'ev', submissionStatus: 'Not submitted', paymentStatus: 'Pending', ...patch } as never)
    patchEv(r, { invoiceId: id })
  }

  const exportNow = async () => {
    try { const name = await exportTrackerXlsx(rows, tab); toast.success(`Exported ${rows.length} rows to ${name}`) } catch { toast.error('Export failed') }
  }

  return (
    <AppShell crumb="EV Job > Tracker">
      <PageHeader title="Installation tracker" subtitle="One row per EV case. Select any cell to edit it. Rows can stay incomplete." action={<button className="button secondary" onClick={exportNow}><Download size={16} />Export Excel</button>} />
      <main className="content">
        <div className="tk-toolbar">
          <div className="segmented" role="tablist" aria-label="Principal">
            {([['CHARGESINI', 'ChargeSini'], ['UPE', 'UPE'], ['All', 'All']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l} <span className="muted">{counts[k]}</span></button>)}
          </div>
          <label className="tk-search"><Search size={16} aria-hidden /><input className="tk-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer, contact, quotation ref, invoice no., PO no., address" aria-label="Search tracker" /></label>
        </div>
        <div className="tk-filters">
          <select className="field-input" aria-label="Charger type" value={charger} onChange={e => setCharger(e.target.value)}><option value="">All chargers</option>{CHARGERS.map(c => <option key={c}>{c}</option>)}</select>
          <select className="field-input" aria-label="PO status" value={po} onChange={e => setPo(e.target.value)}><option value="">All PO</option>{PO.map(c => <option key={c}>{c}</option>)}</select>
          <select className="field-input" aria-label="Invoice submission" value={submission} onChange={e => setSubmission(e.target.value)}><option value="">All invoices</option>{SUBMISSION.map(c => <option key={c}>{c}</option>)}</select>
          <select className="field-input" aria-label="Payment" value={payment} onChange={e => setPayment(e.target.value)}><option value="">All payments</option>{PAYMENT.map(c => <option key={c}>{c}</option>)}</select>
          <label className="tk-range">From<input className="field-input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="tk-range">To<input className="field-input" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          <label className="tk-toggle"><input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />Show cancelled</label>
        </div>
        <section className="tk-wrap" aria-label="Installation tracker table">
          <table className="tk-table">
            <thead><tr>{TRACKER_COLUMNS.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => {
                const ev = r.job.ev!
                const inv = r.invoice
                const name = r.customer?.name || r.job.jobNo
                return (
                  <tr key={r.job.id} className={`tk-row tk-row-${r.color}${r.dimmed ? ' dimmed' : ''}`}>
                    <td className="tk-sticky">
                      <Link className="link" href={`/jobs/${r.job.id}`}><strong>{r.customer?.name || <span className="muted">Unnamed</span>}</strong></Link>
                      <div className="tk-meta">
                        <span className={`tk-badge tk-p-${r.principal}`}>{PRINCIPAL_NAMES[r.principal]}</span>
                        {ev.revisionLabel && <span className="tk-badge tk-rev">{ev.revisionLabel}</span>}
                        {ev.caseFlag && ev.caseFlag !== 'Active' && <span className="tk-badge tk-flag">{ev.caseFlag}</span>}
                        {ev.legacy && <span className="tk-badge tk-legacy">Legacy</span>}
                      </div>
                    </td>
                    <td><TextCell label={`Contact number for ${name}`} value={r.contact} onSave={v => updateJob(r.job.id, { contactPhone: v || undefined })} /></td>
                    <td><TextCell label={`Car model for ${name}`} value={ev.vehicle || ''} onSave={v => patchEv(r, { vehicle: v || undefined })} /></td>
                    <td><PillSelect label={`Charger type for ${name}`} value={ev.chargerType} options={CHARGERS} labels={CHARGER_LABEL} onChange={v => patchEv(r, { chargerType: v })} /></td>
                    <td><TextCell wide multiline label={`Location for ${name}`} value={r.site?.address || ''} onSave={v => r.site && updateSite(r.site.id, { address: v })} /></td>
                    <td><DateTimeCell label={`Inspection proposed for ${name}`} value={ev.inspectionProposed} onSave={v => patchEv(r, { inspectionProposed: v })} /></td>
                    <td><DateTimeCell label={`Inspection actual for ${name}`} value={ev.inspectionActual} onSave={v => patchEv(r, { inspectionActual: v })} /></td>
                    <td className={r.quoteGreen ? 'tk-green' : ''}>
                      <TextCell label={`Principal quotation ref for ${name}`} value={r.quote?.principalRef || ''} onSave={v => saveQuote(r, { principalRef: v || undefined })} />
                      {r.quote && <div className="tk-meta muted">{r.quote.quoteNo}</div>}
                    </td>
                    <td><DateTimeCell label={`Quotation submitted for ${name}`} value={r.quote?.submittedOn} onSave={v => saveQuote(r, { submittedOn: v })} /></td>
                    <td><PillSelect label={`PO status for ${name}`} value={ev.poStatus} options={PO} onChange={v => patchEv(r, { poStatus: v })} /></td>
                    <td><DateTimeCell label={`Installation date for ${name}`} value={ev.installationDate} onSave={v => patchEv(r, { installationDate: v })} /></td>
                    <td><TextCell label={`SQL invoice no. for ${name}`} value={inv?.sqlInvoiceNo || ''} onSave={v => saveInvoice(r, { sqlInvoiceNo: v || undefined })} /></td>
                    <td><DateTimeCell label={`Invoice submitted on for ${name}`} value={inv?.submittedOn} onSave={v => saveInvoice(r, { submittedOn: v })} /></td>
                    <td><PillSelect label={`Invoice submission for ${name}`} value={inv?.submissionStatus} options={SUBMISSION} onChange={v => saveInvoice(r, { submissionStatus: v })} /></td>
                    <td><PillSelect label={`Payment for ${name}`} value={inv?.paymentStatus} options={PAYMENT} onChange={v => saveInvoice(r, { paymentStatus: v })} /></td>
                    <td><TextCell label={`PO number for ${name}`} value={ev.poNumber || ''} onSave={v => patchEv(r, { poNumber: v || undefined })} /></td>
                    <td><TextCell wide multiline label={`Notes for ${name}`} value={ev.notes || ''} onSave={v => patchEv(r, { notes: v || undefined })} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length && <EmptyState title="No tracker rows" helper="Nothing matches these filters. Clear a filter or turn on Show cancelled." />}
        </section>
        <p className="muted tk-legend">Red row: cancelled or superseded. Magenta row: revision of another case. Green quotation cell: PO received, invoice submitted and payment received.</p>
      </main>
    </AppShell>
  )
}
