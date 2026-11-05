'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppShell, PageHeader, StatusPill, EmptyState } from '@/components/shared'
import { useStore } from '@/lib/store'
import { adjustDeadline, countdown, evDeadlines, isChargeSini, isEvCase, updateChargeback, type DeadlineRow } from '@/lib/ev'
import { getNow } from '@/lib/clock'
import type { Job } from '@/lib/types'

const stateClass = (s: DeadlineRow['state']) => s === 'Overdue' ? 'overdue' : s === 'At risk' ? 'due-soon' : s.startsWith('Done') ? 'done' : 'on-track'

function OverrideDialog({ job, row, onClose }: { job: Job; row: DeadlineRow; onClose: () => void }) {
  const [date, setDate] = useState(row.dueAt.slice(0, 10))
  const [reason, setReason] = useState('')
  const save = () => {
    const ok = adjustDeadline(job.id, row.key, new Date(`${date}T18:00:00+08:00`).toISOString(), reason)
    if (ok) { toast.success('Deadline adjusted. Original date kept in the record.'); onClose() } else toast.error('Enter a reason of at least five characters')
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Adjust deadline">
      <div className="modal-card">
        <h2>Adjust {job.jobNo} {row.key}: {row.label}</h2>
        <p className="muted">Original due: {row.originalDueAt.slice(0, 10)}{row.adjusted ? ` · Last adjusted by ${row.adjusted.by}: ${row.adjusted.reason}` : ''}</p>
        <label>New date<input className="field-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Required reason<textarea className="field-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why the deadline is changing" /></label>
        <div className="button-row">
          <button className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={!reason.trim()} onClick={save}>Confirm change</button>
        </div>
      </div>
    </div>
  )
}

export function DeadlinesPage() {
  const jobs = useStore(s => s.jobs)
  const settings = useStore(s => s.settings)
  useStore(s => s.demoOffset)
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState<{ job: Job; row: DeadlineRow }>()
  const cases = jobs.filter(j => isEvCase(j) && isChargeSini(j) && j.ev!.status !== 'Lost')
  const rows = cases.map(job => ({ job, ds: evDeadlines(job, settings) })).filter(r => filter === 'All' || r.ds.some(d => d.state === filter))
  return (
    <AppShell crumb="EV > Deadlines">
      <PageHeader title="EV deadlines" crumb="EV > Deadlines" subtitle="ChargeSini D1 to D6, counted from the day the lead arrives. Select a cell to adjust a date." />
      <main className="content">
        <div className="segmented">
          {['All', 'Overdue', 'At risk'].map(f => <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        <section className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Case</th>{settings.deadlineDays.map((d, i) => <th key={i}>D{i + 1} <span className="muted">({d}d)</span></th>)}</tr></thead>
            <tbody>
              {rows.map(({ job, ds }) => (
                <tr key={job.id}>
                  <td><Link className="link" href={`/jobs/${job.id}`}><strong>{job.jobNo}</strong></Link><div className="muted">{job.ev!.status}</div></td>
                  {ds.map(d => (
                    <td key={d.key}>
                      <button className={`countdown ${stateClass(d.state)}`} onClick={() => setSelected({ job, row: d })} aria-label={`${job.jobNo} ${d.key} ${d.state}`}>
                        {d.state.startsWith('Done') ? d.state : d.state === 'Not applicable' ? 'n/a' : countdown(d.msLeft)}
                        {d.adjusted && <small> adjusted</small>}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <EmptyState title="Nothing to show" helper="No ChargeSini cases match this filter." />}
        </section>
      </main>
      {selected && <OverrideDialog job={selected.job} row={selected.row} onClose={() => setSelected(undefined)} />}
    </AppShell>
  )
}

export function ChargebacksPage() {
  const jobs = useStore(s => s.jobs)
  const customers = useStore(s => s.customers)
  const rows = jobs.filter(j => j.ev?.invoicedAmt !== undefined)
  const total = rows.reduce((n, j) => ({ inv: n.inv + (j.ev!.invoicedAmt || 0), claim: n.claim + (j.ev!.claimableAmt || 0) }), { inv: 0, claim: 0 })
  return (
    <AppShell crumb="EV > Chargebacks">
      <PageHeader title="EV chargebacks" crumb="EV > Chargebacks" subtitle="Amounts invoiced to the customer against the portion claimable from the principal. Cases appear here once invoiced." />
      <main className="content">
        <section className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Case</th><th>Principal</th><th>Customer</th><th>Invoiced (RM)</th><th>Claimable (RM)</th><th>Customer pays (RM)</th></tr></thead>
            <tbody>
              {rows.map(j => (
                <tr key={j.id}>
                  <td><Link className="link" href={`/jobs/${j.id}`}><strong>{j.jobNo}</strong></Link></td>
                  <td>{useStore.getState().principals.find(p => p.id === j.principalId)?.name}</td>
                  <td>{customers.find(c => c.id === j.customerId)?.name}</td>
                  <td><input className="inline-input" type="number" min={0} defaultValue={j.ev!.invoicedAmt} aria-label={`Invoiced amount for ${j.jobNo}`} onBlur={e => { updateChargeback(j.id, { invoicedAmt: Number(e.target.value) }); toast.success('Chargeback saved') }} /></td>
                  <td><input className="inline-input" type="number" min={0} defaultValue={j.ev!.claimableAmt ?? 0} aria-label={`Claimable amount for ${j.jobNo}`} onBlur={e => { updateChargeback(j.id, { claimableAmt: Number(e.target.value) }); toast.success('Chargeback saved') }} /></td>
                  <td>{Math.max(0, (j.ev!.invoicedAmt || 0) - (j.ev!.claimableAmt || 0)).toLocaleString('en-MY')}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr><td colSpan={3}><strong>Total</strong></td><td><strong>{total.inv.toLocaleString('en-MY')}</strong></td><td><strong>{total.claim.toLocaleString('en-MY')}</strong></td><td><strong>{(total.inv - total.claim).toLocaleString('en-MY')}</strong></td></tr></tfoot>}
          </table>
          {!rows.length && <EmptyState title="No chargebacks yet" helper="Raise an invoice on an installed EV case to start a chargeback." />}
        </section>
      </main>
    </AppShell>
  )
}

const monthKey = (iso?: string) => iso?.slice(0, 7)

export function ConversionPage() {
  const jobs = useStore(s => s.jobs)
  const [month, setMonth] = useState(getNow().toISOString().slice(0, 7))
  const cs = useMemo(() => jobs.filter(j => isEvCase(j) && isChargeSini(j)), [jobs])
  const stats = (m: string) => {
    const issued = cs.filter(j => monthKey(j.ev!.at.quoted) === m).length
    const done = cs.filter(j => monthKey(j.ev!.at.installed) === m).length
    return { issued, done, pct: issued ? Math.round((done / issued) * 1000) / 10 : null }
  }
  const cur = stats(month)
  const declined = cs.filter(j => j.ev!.outcome === 'Declined' && monthKey(j.ev!.at.quoted) === month).length
  const trend = Array.from({ length: 6 }, (_, i) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - (5 - i)); const k = d.toISOString().slice(0, 7); return { k, ...stats(k) } })
  const maxIssued = Math.max(1, ...trend.map(t => t.issued))
  return (
    <AppShell crumb="EV > Conversion">
      <PageHeader title="EV conversion" crumb="EV > Conversion" />
      <main className="content">
        <section className="conversion-hero">
          <div>
            <span className="eyebrow">{month}</span>
            <div className="conversion-number">{cur.pct === null ? 'n/a' : `${cur.pct}%`}</div>
            <p>installations completed / quotations issued × 100, ChargeSini cases</p>
          </div>
          <label>Month<input className="field-input" type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
        </section>
        <section className="stats-grid">
          <div className="stat-card"><span>Quotations issued</span><strong>{cur.issued}</strong></div>
          <div className="stat-card"><span>Installations completed</span><strong>{cur.done}</strong></div>
          <div className="stat-card"><span>Declined (counts against conversion)</span><strong>{declined}</strong></div>
        </section>
        <section className="panel">
          <h2>6-month trend</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Month</th><th>Quotations</th><th>Installed</th><th>Conversion</th><th aria-label="Volume" /></tr></thead>
              <tbody>
                {trend.map(t => (
                  <tr key={t.k}>
                    <td>{t.k}</td><td>{t.issued}</td><td>{t.done}</td>
                    <td>{t.pct === null ? <StatusPill>No quotations</StatusPill> : `${t.pct}%`}</td>
                    <td style={{ width: '40%' }}><div style={{ height: 8, width: `${(t.issued / maxIssued) * 100}%`, background: 'currentColor', opacity: 0.35, borderRadius: 4 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  )
}
