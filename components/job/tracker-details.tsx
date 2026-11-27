'use client'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { useCommercialStore, PRINCIPAL_NAMES, type Invoice } from '@/lib/store/commercial'
import { todayKL } from '@/lib/clock'
import { applyOutstanding, buildTrackerRows, dayOnly, timeOnly, joinDateTime, PILL } from '@/lib/tracker'
import type { ChargerType, EvCase, Job, PoStatus } from '@/lib/types'

const CHARGERS: ChargerType[] = ['Phase 1', 'Phase 3']
const CHARGER_LABEL: Record<ChargerType, string> = { 'Phase 1': 'Phase 1 (Single phase, 7kW)', 'Phase 3': 'Phase 3 (Three phase, 22kW)' }
const PO: PoStatus[] = ['Pending', 'Received', 'Cancelled']
const SUBMISSION = ['Not submitted', 'Submitted', 'Cancelled'] as const
const PAYMENT = ['Pending', 'Outstanding', 'Received'] as const

/** Marks submitted, unpaid invoices Outstanding once they pass the configured number of days. */
export function useOutstandingSweep() {
  const invoices = useCommercialStore(s => s.invoices)
  const updateInvoice = useCommercialStore(s => s.updateInvoice)
  const days = useStore(s => s.settings.outstandingAfterDays ?? 30)
  useEffect(() => {
    applyOutstanding(invoices, days, todayKL()).forEach(id => updateInvoice(id, { paymentStatus: 'Outstanding' }))
  }, [invoices, days, updateInvoice])
}

function TextField({ value, onSave, label, multiline, placeholder }: { value: string; onSave: (v: string) => void; label: string; multiline?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => { if (v.trim() !== value) onSave(v.trim()) }
  const props = { className: 'tk-input', value: v, 'aria-label': label, placeholder: placeholder ?? 'Not set', onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value), onBlur: commit }
  return multiline ? <textarea rows={3} {...props} /> : <input {...props} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}

function PillSelect<T extends string>({ value, options, onChange, label, labels }: { value?: T; options: readonly T[]; onChange: (v: T | undefined) => void; label: string; labels?: Partial<Record<T, string>> }) {
  const tone = value ? PILL[value] || 'grey' : 'none'
  return (
    <select className={`tk-pill tk-${tone}`} aria-label={label} value={value || ''} onChange={e => onChange((e.target.value || undefined) as T | undefined)}>
      <option value="">Not set</option>
      {options.map(o => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
    </select>
  )
}

function DateTimeField({ value, onSave, label }: { value?: string; onSave: (v?: string) => void; label: string }) {
  const date = dayOnly(value)
  const time = timeOnly(value)
  return (
    <div className="tk-dt">
      <input type="date" className="tk-input" aria-label={`${label} date`} value={date} onChange={e => onSave(joinDateTime(e.target.value, time))} />
      {date && <input type="time" className="tk-input" aria-label={`${label} time`} value={time} onChange={e => onSave(joinDateTime(date, e.target.value))} />}
    </div>
  )
}

function Field({ label, wide, done, children }: { label: string; wide?: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <div className={`tk-field${wide ? ' wide' : ''}`} data-done={done}>
      <span className="tk-label">{label}{!done && <i className="tk-missing">Missing</i>}</span>
      {children}
    </div>
  )
}

export function TrackerDetailsCard({ job }: { job: Job }) {
  const customers = useStore(s => s.customers)
  const sites = useStore(s => s.sites)
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)?.role)
  const updateJob = useStore(s => s.updateJob)
  const updateSite = useStore(s => s.updateSite)
  const quotations = useCommercialStore(s => s.quotations)
  const invoices = useCommercialStore(s => s.invoices)
  const updateQuote = useCommercialStore(s => s.updateQuote)
  const updateInvoice = useCommercialStore(s => s.updateInvoice)
  const createQuote = useCommercialStore(s => s.createQuote)
  const createInvoice = useCommercialStore(s => s.createInvoice)
  useOutstandingSweep()
  const [missingOnly, setMissingOnly] = useState(false)

  const r = useMemo(() => buildTrackerRows([job], customers, sites, quotations, invoices)[0], [job, customers, sites, quotations, invoices])
  if (!r || !job.ev || (role !== 'admin' && role !== 'owner' && role !== 'sysadmin')) return null
  const ev = job.ev
  const inv = r.invoice

  const patchEv = (patch: Partial<EvCase>) => updateJob(job.id, { ev: { ...ev, ...patch } })
  const saveQuote = (patch: { principalRef?: string; submittedOn?: string }) => {
    if (r.quote) return updateQuote(r.quote.id, patch)
    const id = createQuote({ jobId: job.id, jobNo: job.jobNo, customer: r.customer?.name || job.jobNo, principal: r.principal, lines: [], status: 'Draft', reminders: [], ...patch } as never)
    patchEv({ quoteId: id })
  }
  const saveInvoice = (patch: Partial<Invoice>) => {
    if (inv) return updateInvoice(inv.id, patch)
    const id = createInvoice({ jobId: job.id, jobNo: job.jobNo, customer: r.customer?.name || job.jobNo, lines: [], subtotal: 0, status: 'Draft', kind: 'ev', submissionStatus: 'Not submitted', paymentStatus: 'Pending', ...patch } as never)
    patchEv({ invoiceId: id })
  }

  const checks = [
    r.contact, ev.vehicle, ev.chargerType, r.site?.address || job.contactAddress, ev.inspectionProposed, ev.inspectionActual, r.quote?.principalRef, r.quote?.submittedOn,
    ev.poStatus, ev.installationDate, inv?.sqlInvoiceNo, inv?.submittedOn, inv?.submissionStatus, inv?.paymentStatus, ev.poNumber, ev.notes,
  ]
  const filled = checks.filter(Boolean).length

  return (
    <section className="card jd-card" aria-label="Installation tracker details">
      <header className="jd-card-head tk-head">
        <div className="tk-head-top">
          <div>
            <h2>Tracker details</h2>
            <p>Changes save automatically when you leave a field. Empty fields are fine.</p>
          </div>
          <label className="tk-toggle">
            <input type="checkbox" checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} />
            Show missing only
          </label>
        </div>
        <div className="tk-progress">
          <div className="tk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={filled} aria-label="Tracker fields filled"><span style={{ width: `${(filled / checks.length) * 100}%` }} /></div>
          <span>{filled} of {checks.length} filled</span>
        </div>
      </header>
      <div className={`jd-card-body tk-sections${missingOnly ? ' tk-only-missing' : ''}`}>
        <div className="tk-meta">
          <span className={`tk-badge tk-p-${r.principal}`}>{PRINCIPAL_NAMES[r.principal]}</span>
          {ev.revisionLabel && <span className="tk-badge tk-rev">{ev.revisionLabel}</span>}
          {ev.caseFlag && ev.caseFlag !== 'Active' && <span className="tk-badge tk-flag">{ev.caseFlag}</span>}
          {ev.legacy && <span className="tk-badge tk-legacy">Legacy</span>}
        </div>
        {missingOnly && filled === checks.length && <p className="tk-allset">Every tracker field is filled in.</p>}

        <section className="tk-section">
        <h3 className="tk-group">Customer and site</h3>
        <div className="tk-grid">
          <Field label="Contact number" done={!!r.contact}><TextField label="Contact number" value={r.contact} onSave={v => updateJob(job.id, { contactPhone: v || undefined })} /></Field>
          <Field label="Car model" done={!!ev.vehicle}><TextField label="Car model" value={ev.vehicle || ''} onSave={v => patchEv({ vehicle: v || undefined })} /></Field>
          <Field label="Charger type" done={!!ev.chargerType}><PillSelect label="Charger type" value={ev.chargerType} options={CHARGERS} labels={CHARGER_LABEL} onChange={v => patchEv({ chargerType: v })} /></Field>
          <Field label="Location" wide done={!!(r.site?.address || job.contactAddress)}>
            <TextField multiline label="Location" value={r.site?.address || job.contactAddress || ''} onSave={v => (r.site ? updateSite(r.site.id, { address: v }) : updateJob(job.id, { contactAddress: v || undefined }))} />
          </Field>
        </div>
        </section>

        <section className="tk-section">
        <h3 className="tk-group">Inspection and quotation</h3>
        <div className="tk-grid">
          <Field label="Inspection proposed" done={!!ev.inspectionProposed}><DateTimeField label="Inspection proposed" value={ev.inspectionProposed} onSave={v => patchEv({ inspectionProposed: v })} /></Field>
          <Field label="Inspection actual" done={!!ev.inspectionActual}><DateTimeField label="Inspection actual" value={ev.inspectionActual} onSave={v => patchEv({ inspectionActual: v })} /></Field>
          <Field label="Principal quotation ref" done={!!r.quote?.principalRef}>
            <TextField label="Principal quotation ref" value={r.quote?.principalRef || ''} onSave={v => saveQuote({ principalRef: v || undefined })} />
            {r.quote && <small className="muted">Internal quote {r.quote.quoteNo}</small>}
          </Field>
          <Field label="Quotation submitted" done={!!r.quote?.submittedOn}><DateTimeField label="Quotation submitted" value={r.quote?.submittedOn} onSave={v => saveQuote({ submittedOn: v })} /></Field>
        </div>
        </section>

        <section className="tk-section">
        <h3 className="tk-group">Purchase order and installation</h3>
        <div className="tk-grid">
          <Field label="PO status" done={!!ev.poStatus}><PillSelect label="PO status" value={ev.poStatus} options={PO} onChange={v => patchEv({ poStatus: v })} /></Field>
          <Field label="PO number" done={!!ev.poNumber}><TextField label="PO number" value={ev.poNumber || ''} onSave={v => patchEv({ poNumber: v || undefined })} /></Field>
          <Field label="Installation date" done={!!ev.installationDate}><DateTimeField label="Installation date" value={ev.installationDate} onSave={v => patchEv({ installationDate: v })} /></Field>
        </div>
        </section>

        <section className="tk-section">
        <h3 className="tk-group">Invoice and payment</h3>
        <div className="tk-grid">
          <Field label="SQL invoice no." done={!!inv?.sqlInvoiceNo}><TextField label="SQL invoice no." value={inv?.sqlInvoiceNo || ''} onSave={v => saveInvoice({ sqlInvoiceNo: v || undefined })} /></Field>
          <Field label="Invoice submitted on" done={!!inv?.submittedOn}><DateTimeField label="Invoice submitted on" value={inv?.submittedOn} onSave={v => saveInvoice({ submittedOn: v })} /></Field>
          <Field label="Invoice submission" done={!!inv?.submissionStatus}><PillSelect label="Invoice submission" value={inv?.submissionStatus} options={SUBMISSION} onChange={v => saveInvoice({ submissionStatus: v })} /></Field>
          <Field label="Payment" done={!!inv?.paymentStatus}><PillSelect label="Payment" value={inv?.paymentStatus} options={PAYMENT} onChange={v => saveInvoice({ paymentStatus: v })} /></Field>
        </div>
        </section>

        <section className="tk-section">
        <h3 className="tk-group">Notes</h3>
        <Field label="Notes" wide done={!!ev.notes}><TextField multiline label="Notes" value={ev.notes || ''} onSave={v => patchEv({ notes: v || undefined })} /></Field>
        </section>
      </div>
    </section>
  )
}
