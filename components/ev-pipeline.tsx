'use client'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppShell, PageHeader, StatusPill, EmptyState, useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useCommercialStore } from '@/lib/store/commercial'
import { ASSESS_CHECKS } from '@/lib/evdocs'
import {
  EV_BOARD_COLUMNS, EV_STAGES, acknowledgeLead, closeEvCase, countdown, createEvJob, emailDoc, evDeadlines, evOnInstalled,
  isChargeSini, isEvCase, nextAction, raiseEvInvoice, recordAssessment, recordPayment, recordQuoteOutcome,
} from '@/lib/ev'
import type { Job } from '@/lib/types'

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }) : '')
const money = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`

function AssessmentForm({ job }: { job: Job }) {
  const minPhotos = useStore(s => s.settings.minAssessmentPhotos)
  const [photos, setPhotos] = useState<string[]>([])
  const [measurements, setMeasurements] = useState('')
  const [remarks, setRemarks] = useState('')
  const [checks, setChecks] = useState<Record<string, boolean>>(() => Object.fromEntries(ASSESS_CHECKS.map(c => [c, false])))
  const submit = () => {
    const r = recordAssessment(job.id, { photos: photos.length, measurements, remarks, checklist: checks })
    r.ok ? toast.success(r.message) : toast.error(r.message)
  }
  return (
    <div className="ev-form">
      <h3>Site assessment</h3>
      <label>Photos (minimum {minPhotos})
        <input className="field-input" type="file" accept="image/*" multiple onChange={e => setPhotos(Array.from(e.target.files || []).map(f => f.name))} />
      </label>
      <p className="muted">{photos.length} attached</p>
      <label>Cable route and distance measurements
        <textarea className="field-input" value={measurements} onChange={e => setMeasurements(e.target.value)} placeholder="e.g. DB to bay 18 m, surface trunking, one wall penetration" />
      </label>
      <fieldset>
        <legend>Checklist</legend>
        {ASSESS_CHECKS.map(c => (
          <label key={c} className="check-row"><input type="checkbox" checked={checks[c]} onChange={e => setChecks(s => ({ ...s, [c]: e.target.checked }))} /> {c}</label>
        ))}
      </fieldset>
      <label>Remarks<textarea className="field-input" value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
      <button className="button primary" onClick={submit}>Submit assessment and generate TAF</button>
    </div>
  )
}

function PaymentForm({ job, total }: { job: Job; total: number }) {
  const [amount, setAmount] = useState(String(total || ''))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [ref, setRef] = useState('')
  const submit = () => {
    const r = recordPayment(job.id, { amount: Number(amount), date, ref })
    r.ok ? toast.success(r.message) : toast.error(r.message)
  }
  return (
    <div className="ev-form">
      <h3>Record payment</h3>
      <label>Amount received (RM)<input className="field-input" type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label>Date received<input className="field-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Payment reference<input className="field-input" value={ref} onChange={e => setRef(e.target.value)} placeholder="Bank transfer reference" /></label>
      <button className="button primary" onClick={submit}>Confirm payment and send booking link</button>
    </div>
  )
}

export function EvWorkflowPanel({ job }: { job: Job }) {
  const ev = job.ev
  const settings = useStore(s => s.settings)
  const documents = useStore(s => s.documents)
  const jobs = useStore(s => s.jobs)
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)?.role)
  const quote = useCommercialStore(s => s.quotations.find(q => q.id === ev?.quoteId))
  useStore(s => s.demoOffset)
  if (!ev) return null
  const staff = role === 'admin' || role === 'owner' || role === 'technician'
  const admin = role === 'admin'
  const stageIdx = ev.status === 'Follow-up' ? EV_STAGES.indexOf('Quoted') : EV_STAGES.indexOf(ev.status)
  const deadlines = isChargeSini(job) ? evDeadlines(job, settings) : []
  const docs = documents.filter(d => d.jobId === job.id && ['Technical Assessment Form', 'Installation Report'].includes(d.docType))
  const install = jobs.find(j => j.id === ev.installJobId)
  const decline = () => {
    const reason = window.prompt('Reason the customer declined')
    if (reason?.trim()) { recordQuoteOutcome(job.id, 'Declined', reason.trim()); toast.success('Case marked lost') }
  }

  return (
    <section className="content-card ev-panel" aria-label="EV workflow">
      <div className="card-heading">
        <h2>EV workflow</h2>
        <StatusPill>{ev.status === 'Lost' ? 'Lost' : nextAction(job)}</StatusPill>
      </div>
      <ol className="ev-stages">
        {EV_STAGES.map((s, i) => <li key={s} className={ev.status === 'Lost' ? '' : i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''} aria-current={i === stageIdx ? 'step' : undefined}>{s}</li>)}
      </ol>

      {ev.callTask && <div className="notice">No reply to the quotation. Call the customer, then record their decision.</div>}

      {ev.status === 'Lead' && !ev.at.ack && admin && <button className="button primary" onClick={() => { acknowledgeLead(job.id); toast.success('Lead acknowledged') }}>Acknowledge lead</button>}
      {ev.status === 'Lead' && !job.scheduledAt && <p className="muted">Assign a technician and date from Next actions to book the assessment.</p>}
      {ev.status === 'Lead' && staff && <AssessmentForm job={job} />}

      {ev.status === 'Assessed' && admin && <Link className="button primary" href={`/quotations/new?jobId=${job.id}`}>Prepare quotation</Link>}

      {['Quoted', 'Follow-up'].includes(ev.status) && (
        <div className="ev-form">
          <p>{quote ? <>Quotation <Link className="link mono" href={`/quotations/${quote.id}`}>{quote.quoteNo}</Link> sent. {ev.followUps} follow-up email(s) so far.</> : 'Quotation sent.'}</p>
          {admin && <div className="action-row"><button className="button primary" onClick={() => { recordQuoteOutcome(job.id, 'Accepted'); toast.success('Marked accepted') }}>Customer accepted</button><button className="button danger" onClick={decline}>Customer declined</button></div>}
        </div>
      )}

      {ev.status === 'Accepted' && admin && <PaymentForm job={job} total={quote?.total ?? 0} />}
      {ev.status === 'Accepted' && !admin && <p className="muted">Waiting for the office to confirm payment.</p>}

      {ev.status === 'Paid' && ev.bookingToken && (
        <div className="ev-form">
          <p>Payment {ev.payment ? `${money(ev.payment.amount)} (${ev.payment.ref})` : ''} received. The customer chooses their own installation slot:</p>
          <Link className="link mono" href={`/book/${ev.bookingToken}`}>/book/{ev.bookingToken}</Link>
        </div>
      )}

      {ev.status === 'Scheduled' && install && (
        <div className="ev-form">
          <p>Installation booked for {fmt(install.scheduledAt)}{install.technicianId ? ` with ${useStore.getState().users.find(u => u.id === install.technicianId)?.name}` : ''}. <Link className="link" href={`/jobs/${install.id}`}>Open installation job</Link></p>
          {staff && <button className="button primary" onClick={() => { evOnInstalled(install.id); toast.success('Installation completed. Report generated and emailed.') }}>Mark installation complete</button>}
        </div>
      )}

      {ev.status === 'Installed' && admin && <button className="button primary" onClick={() => { raiseEvInvoice(job.id); toast.success('Invoice raised and sent for sign-off') }}>Raise invoice</button>}
      {ev.status === 'Invoiced' && admin && (
        <div className="ev-form">
          {ev.invoiceId && <p><Link className="link" href={`/invoices/${ev.invoiceId}`}>Open invoice</Link></p>}
          <button className="button primary" onClick={() => { closeEvCase(job.id); toast.success('Customer sign-off recorded. Case closed.') }}>Record customer sign-off</button>
        </div>
      )}

      {deadlines.length > 0 && (
        <div>
          <h3>ChargeSini deadlines</h3>
          <ul className="plain-list">
            {deadlines.map(d => <li key={d.key}><strong>{d.key}</strong> {d.label}: <span className={`countdown ${d.state === 'Overdue' ? 'overdue' : d.state === 'At risk' ? 'due-soon' : d.state.startsWith('Done') ? 'done' : 'on-track'}`}>{d.state.startsWith('Done') ? d.state : d.state === 'Not applicable' ? 'n/a' : countdown(d.msLeft)}</span></li>)}
          </ul>
        </div>
      )}

      {docs.length > 0 && (
        <div>
          <h3>Documents</h3>
          <ul className="plain-list">
            {docs.map(d => (
              <li key={d.id}>
                {d.docType} · {fmt(d.createdAt)} · <StatusPill>{d.status === 'Sent' ? 'Emailed' : 'Generated'}</StatusPill>{' '}
                {d.dataUrl && <a className="link" href={d.dataUrl} download={d.fileName}>Download PDF</a>}{' '}
                {admin && <button className="button ghost" onClick={() => { emailDoc(d.id); toast.success('Document emailed') }}>Email</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function NewLeadDialog({ onClose }: { onClose: () => void }) {
  const principals = useStore(s => s.principals)
  const [f, setF] = useState({ principalId: 'p3', customerName: '', phone: '', address: '', vehicle: '', chargerModel: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(s => ({ ...s, [k]: e.target.value }))
  const save = () => {
    if (!f.customerName.trim() || !f.phone.trim()) { toast.error('Customer name and phone are required'); return }
    createEvJob(f)
    toast.success('EV lead created and acknowledged')
    onClose()
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="New EV lead">
      <div className="modal-card">
        <h2>New EV lead</h2>
        <label>Principal<select className="field-input" value={f.principalId} onChange={set('principalId')}>{principals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Customer name<input className="field-input" value={f.customerName} onChange={set('customerName')} /></label>
        <label>Phone<input className="field-input" value={f.phone} onChange={set('phone')} /></label>
        <label>Address<input className="field-input" value={f.address} onChange={set('address')} /></label>
        <label>Vehicle<input className="field-input" value={f.vehicle} onChange={set('vehicle')} placeholder="e.g. Proton e.MAS 7" /></label>
        <label>Charger model<input className="field-input" value={f.chargerModel} onChange={set('chargerModel')} /></label>
        <div className="button-row"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" onClick={save}>Create lead</button></div>
      </div>
    </div>
  )
}

export function EvPipelinePage() {
  const hydrated = useHydrated()
  const jobs = useStore(s => s.jobs)
  const customers = useStore(s => s.customers)
  const settings = useStore(s => s.settings)
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)?.role)
  const [open, setOpen] = useState(false)
  if (!hydrated) return null
  const cases = jobs.filter(isEvCase)
  return (
    <AppShell crumb="EV > Pipeline">
      <PageHeader title="EV pipeline" crumb="EV > Pipeline" subtitle="Every EV case from lead to sign-off." action={role === 'admin' ? <button className="button primary" onClick={() => setOpen(true)}>+ New EV lead</button> : undefined} />
      <main className="content">
        {!cases.length && <EmptyState title="No EV cases yet" helper="Create a lead to start the pipeline." />}
        <div className="ev-board">
          {EV_BOARD_COLUMNS.map(col => {
            const items = cases.filter(j => j.ev!.status === col)
            return (
              <section key={col} className="ev-column" aria-label={col}>
                <h2>{col} <span className="muted">{items.length}</span></h2>
                {items.map(j => {
                  const worst = isChargeSini(j) ? evDeadlines(j, settings).find(d => d.state === 'Overdue' || d.state === 'At risk') : undefined
                  return (
                    <Link key={j.id} href={`/jobs/${j.id}`} className="ev-card">
                      <strong>{j.jobNo}</strong>
                      <span>{customers.find(c => c.id === j.customerId)?.name}</span>
                      {j.ev!.vehicle && <small className="muted">{j.ev!.vehicle}</small>}
                      <small>{nextAction(j)}</small>
                      {worst && <small className={`countdown ${worst.state === 'Overdue' ? 'overdue' : 'due-soon'}`}>{worst.key} {worst.state === 'Overdue' ? 'overdue' : countdown(worst.msLeft)}</small>}
                    </Link>
                  )
                })}
              </section>
            )
          })}
        </div>
      </main>
      {open && <NewLeadDialog onClose={() => setOpen(false)} />}
    </AppShell>
  )
}
