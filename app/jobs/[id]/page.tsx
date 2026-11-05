'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AppShell, EmptyState, PageHeader, StatusPill, useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useCommercialStore } from '@/lib/store/commercial'
import { Price } from '@/components/commercial'
import { jobTabs } from '@/components/job/tabs'
import { getNow } from '@/lib/clock'
import { slaState, timeRemaining } from '@/lib/selectors'
import { can } from '@/lib/rbac'
import { sendNotification } from '@/lib/store/comms'
import { toast } from 'sonner'

const progress = ['Created', 'Assigned', 'In Progress', 'Completed', 'Invoiced', 'Closed']

export default function JobDetail() {
  const hydrated = useHydrated()
  const { id } = useParams<{ id: string }>()
  const store = useStore()
  const quotes = useCommercialStore(s => s.quotations)
  const invoices = useCommercialStore(s => s.invoices)
  const [tab, setTab] = useState<string>('overview')
  const [comment, setComment] = useState('')
  const [tech, setTech] = useState('')
  const job = store.jobs.find(j => j.id === id)

  if (!hydrated || !job) {
    return <AppShell crumb="Jobs"><EmptyState title={hydrated ? 'Job not found' : 'Loading job'} helper="Return to the job list." action={<Link href="/jobs" className="button primary">Back to Jobs</Link>} /></AppShell>
  }

  const customer = store.customers.find(c => c.id === job.customerId)
  const site = store.sites.find(s => s.id === job.siteId)
  const type = store.jobTypes.find(t => t.id === job.jobTypeId)
  const principal = store.principals.find(p => p.id === job.principalId)
  const technician = store.users.find(u => u.id === job.technicianId)
  const current = store.users.find(u => u.id === store.currentUserId)!
  const canAct = can(current.role, 'job', 'U') && current.role === 'admin'
  const history = store.history.filter(h => h.jobId === job.id).sort((a, b) => b.at.localeCompare(a.at))
  const notifications = store.notifications.filter(n => n.jobId === job.id).sort((a, b) => b.at.localeCompare(a.at))
  const isEv = !!type?.isEv
  const jobQuotes = isEv ? quotes.filter(q => q.jobId === job.id) : []
  const jobInvoices = invoices.filter(i => i.jobId === job.id)
  const state = slaState(job, type)
  const stepIndex = progress.indexOf(job.status)
  const baseTabs = current.role === 'portal' ? jobTabs.filter(t => ['overview', 'quotation'].includes(t.id)) : jobTabs
  const visibleTabs = isEv ? baseTabs : baseTabs.map(t => (t.id === 'quotation' ? { ...t, label: 'Invoice' } : t))

  const assign = () => {
    if (!tech) { toast.error('Select a technician'); return }
    store.assignTechnician(job.id, tech, job.scheduledAt, comment)
    setComment(''); toast.success('Technician assigned')
  }
  const hold = () => {
    if (job.holdSince) { store.resumeJob(job.id, comment); toast.success('Job resumed. SLA clock running.') }
    else { store.holdJob(job.id, comment || 'Awaiting customer', comment); toast.success('Job on hold. SLA clock paused.') }
    setComment('')
  }
  const ping = (event: string) => {
    const result = sendNotification(job.id, event, 'WhatsApp', store.settings)
    useStore.setState(s => ({ notifications: [...s.notifications, result.notification] }))
    toast.success(result.toast)
  }

  return (
    <AppShell crumb={`Jobs > ${job.jobNo}`}>
      <PageHeader title={job.subject} subtitle={`${job.jobNo} · ${customer?.name ?? ''}`} action={<Link href="/jobs" className="button secondary">Back to Jobs</Link>} />
      <main className="content detail-layout">
        <section className="detail-main">
          <section className="header-card">
            <div className="pill-row">
              <StatusPill>{job.status}</StatusPill>
              <StatusPill tone="grey">{type?.name}</StatusPill>
              {principal && <StatusPill tone="blue">{principal.name}</StatusPill>}
              <StatusPill tone={state}>{state} · {timeRemaining(job)} {new Date(job.slaDue).getTime() > getNow().getTime() ? 'left' : 'overdue'}</StatusPill>
              {job.holdSince && <StatusPill tone="orange">On hold</StatusPill>}
            </div>
            <div className="stepper">
              {progress.map((p, i) => <div key={p} className={`step ${stepIndex >= i ? 'done' : ''}`}><span>{i + 1}</span><small>{p}</small></div>)}
            </div>
          </section>

          {canAct && (
            <section className="actions-card">
              <div><h2>Next actions</h2><p>Every action is written to the job history.</p></div>
              <div className="action-row">
                <select value={tech} onChange={e => setTech(e.target.value)} aria-label="Technician">
                  <option value="">Assign or reassign technician</option>
                  {store.users.filter(u => u.role === 'technician').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="button secondary" onClick={assign}>Assign</button>
                {job.status === 'Completed' && (isEv
                  ? <button className="button primary" onClick={() => { store.raiseInvoice(job.id, comment); toast.success('Invoice raised'); setComment('') }}>Raise invoice</button>
                  : <Link className="button primary" href={`/invoices/new?jobId=${job.id}`}>Raise invoice</Link>)}
                {job.status === 'Invoiced' && <button className="button primary" onClick={() => { store.closeJob(job.id, comment); toast.success('Job closed'); setComment('') }}>Close job</button>}
                {!['Closed', 'Invoiced'].includes(job.status) && <button className="button secondary" onClick={hold}>{job.holdSince ? 'Resume job' : 'Put on hold'}</button>}
              </div>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comment for the history log (optional)" aria-label="Comment" />
            </section>
          )}

          <div className="tabs underline">
            {visibleTabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>

          {tab === 'overview' && (
            <section className="content-card">
              <div className="kv-grid">
                <div><small>Customer</small><strong>{customer?.name}</strong></div>
                <div><small>Site</small><strong>{site?.name}</strong><span>{site?.address}</span></div>
                <div><small>Technician</small><strong>{technician?.name ?? 'Unassigned'}</strong></div>
                <div><small>Channel</small><strong>{job.channel}</strong></div>
                <div><small>Scheduled</small><strong>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString('en-MY') : 'Not scheduled'}</strong></div>
                <div><small>SLA due</small><strong>{new Date(job.slaDue).toLocaleString('en-MY')}</strong></div>
                {isEv && <div><small>Principal</small><strong>{principal?.name ?? 'Missing'}</strong></div>}
                {job.remarks && <div className="wide"><small>Remarks</small><strong>{job.remarks}</strong></div>}
              </div>
            </section>
          )}

          {tab === 'checklist' && (
            <section className="content-card">
              <h2>Checklist and evidence</h2>
              {store.answers.filter(a => a.jobId === job.id).length || store.attachments.filter(a => a.jobId === job.id).length ? (
                <ul className="plain-list">
                  {store.answers.filter(a => a.jobId === job.id).map(a => <li key={a.itemId}>{store.checklistItems.find(c => c.id === a.itemId)?.label ?? a.itemId}: <strong>{a.value}</strong></li>)}
                  {store.attachments.filter(a => a.jobId === job.id).map(a => <li key={a.id}>{a.kind}: {a.name}</li>)}
                </ul>
              ) : <EmptyState title="Nothing captured yet" helper="The technician fills the checklist and captures photos, signature and company chop on site." />}
            </section>
          )}

          {tab === 'history' && (
            <section className="content-card">
              <div className="card-heading"><h2>History</h2><button className="button secondary" onClick={() => window.print()}>Export / Print</button></div>
              {history.length ? (
                <div className="history-table">
                  <div className="history-head"><span>When</span><span>Who</span><span>Event</span><span>From to</span><span>Comment</span></div>
                  {history.map(h => (
                    <div className="history-row" key={h.id}>
                      <span>{new Date(h.at).toLocaleString('en-MY')}</span>
                      <span>{store.users.find(u => u.id === h.userId)?.name}</span>
                      <span>{h.event}</span>
                      <span>{h.fromStatus && h.toStatus ? `${h.fromStatus} to ${h.toStatus}` : h.toStatus ?? '-'}</span>
                      <span>{h.comment || '-'}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No history yet" helper="Status changes, assignments and holds appear here." />}
            </section>
          )}

          {tab === 'quotation' && (
            <section className="content-card">
              <h2>{isEv ? 'Quotation and invoice' : 'Invoice'}</h2>
              {!isEv && <p className="muted">Commercial jobs have no quotation step. Raise the invoice once the job is completed.</p>}
              {jobQuotes.length + jobInvoices.length === 0 && <EmptyState title="Nothing raised for this job" helper={isEv ? 'Quotations and invoices linked to this job appear here.' : 'The invoice for this job appears here once raised.'} action={!isEv && job.status === 'Completed' && canAct ? <Link className="button primary" href={`/invoices/new?jobId=${job.id}`}>Raise invoice</Link> : undefined} />}
              <ul className="plain-list">
                {jobQuotes.map(q => <li key={q.id}><Link className="link mono" href={`/quotations/${q.id}`}>{q.quoteNo}</Link> <StatusPill>{q.status}</StatusPill> <Price amount={q.total} /></li>)}
                {jobInvoices.map(i => <li key={i.id}><Link className="link mono" href={`/invoices/${i.id}`}>{i.invoiceNo}</Link> <StatusPill>{i.status}</StatusPill> <Price amount={i.total} /></li>)}
              </ul>
            </section>
          )}

          {tab === 'communication' && (
            <section className="content-card">
              <div className="card-heading">
                <h2>Communication</h2>
                {canAct && <div className="button-row">
                  <button className="button secondary" onClick={() => ping('Assessment date confirmation')}>Send date confirmation</button>
                  {isEv && <button className="button secondary" onClick={() => ping('Quotation follow-up')}>Send follow-up</button>}
                </div>}
              </div>
              {notifications.length ? (
                <ul className="plain-list">
                  {notifications.map(n => <li key={n.id}>{new Date(n.at).toLocaleString('en-MY')} · {n.event ?? n.subject} · {n.channel} <StatusPill>{n.status ?? 'Sent'}</StatusPill></li>)}
                </ul>
              ) : <EmptyState title="No messages sent" helper="WhatsApp is used for short alerts. Documents go by email with a WhatsApp ready ping." />}
            </section>
          )}
        </section>
      </main>
    </AppShell>
  )
}
