'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Check, MessageSquare, Paperclip } from 'lucide-react'
import { AppShell, EmptyState, PageHeader, StatusPill, useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useCommercialStore } from '@/lib/store/commercial'
import { Price } from '@/components/commercial'
import { EvWorkflowPanel } from '@/components/ev-pipeline'
import { jobTabs } from '@/components/job/tabs'
import { getNow } from '@/lib/clock'
import { slaInfo, slaState } from '@/lib/selectors'
import { can } from '@/lib/rbac'
import { dispatch } from '@/lib/messaging'
import { useMasterStore } from '@/lib/store/master'
import { useWhatsAppStore } from '@/lib/store/whatsapp'
import { toast } from 'sonner'
import { downloadEvJobPdf } from '@/lib/pdf'

const progress = ['Created', 'Assigned', 'In Progress', 'Completed', 'Invoiced', 'Closed']
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-MY') : 'Not set')

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="jd-row"><span>{label}</span><strong>{value}</strong></div>
}

export default function JobDetail() {
  const hydrated = useHydrated()
  const { id } = useParams<{ id: string }>()
  const store = useStore()
  const quotes = useCommercialStore(s => s.quotations)
  const invoices = useCommercialStore(s => s.invoices)
  const whatsappOn = useMasterStore(m => m.flags.C)
  const conversations = useWhatsAppStore(w => w.conversations)
  const [tab, setTab] = useState<string>('overview')
  const [comment, setComment] = useState('')
  const [isPublic, setIsPublic] = useState(true)
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
  const attachments = store.attachments.filter(a => a.jobId === job.id)
  const isEv = !!type?.isEv
  const jobQuotes = isEv ? quotes.filter(q => q.jobId === job.id) : []
  const jobInvoices = invoices.filter(i => i.jobId === job.id)
  const conversation = conversations.find(c => c.jobId === job.id)
  const state = slaState(job, type)
  const sla = slaInfo(job, type)
  const stepIndex = progress.indexOf(job.status)
  const baseTabs = current.role === 'portal' ? jobTabs.filter(t => ['overview', 'quotation'].includes(t.id)) : jobTabs
  const visibleTabs = isEv ? baseTabs : baseTabs.map(t => (t.id === 'quotation' ? { ...t, label: 'Invoice' } : t))
  const barTone = state === 'Breached' ? 'var(--tone-red)' : state === 'Warning' ? 'var(--tone-amber)' : 'var(--tone-blue)'
  const firstResponse = [...history].reverse().find(h => h.event !== 'Created' && !h.event.startsWith('Comment (internal)'))?.at

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
  const ping = (event: string) => toast.success(dispatch(job.id, event).toast)
  const post = () => {
    const body = comment.trim()
    if (!body) return
    useStore.setState(s => ({ history: [...s.history, { id: crypto.randomUUID(), jobId: job.id, userId: s.currentUserId, event: isPublic ? 'Comment (public)' : 'Comment (internal)', comment: body, at: getNow().toISOString() }] }))
    setComment('')
    toast.success(isPublic ? 'Comment posted' : 'Internal note saved')
  }

  return (
    <AppShell crumb={`Jobs > ${job.jobNo}`}>
      <PageHeader
        title={job.subject}
        subtitle={customer?.name}
        action={<>
          {job.ev && <button className="button secondary" onClick={async () => { toast.success(`Saved ${await downloadEvJobPdf(job)}`) }}>Download PDF</button>}
          <Link href="/jobs" className="button secondary">Back to Jobs</Link>
        </>}
      />
      <main className="content jd">
        <section className="header-card jd-head">
          <div className="jd-head-top">
            <div className="pill-row">
              <span className="job-number">{job.jobNo}</span>
              <StatusPill>{job.status}</StatusPill>
              <StatusPill tone="grey">{type?.name}</StatusPill>
              {principal && <StatusPill tone="blue">{principal.name}</StatusPill>}
              <StatusPill tone="grey">{job.channel}</StatusPill>
              {job.holdSince && <StatusPill tone="orange">On hold</StatusPill>}
            </div>
            <span className={`jd-sla-text ${state}`}>SLA <b>{sla.label}</b></span>
          </div>
          <ol className="jd-steps" aria-label="Job progress">
            {progress.map((p, i) => {
              const done = stepIndex > i
              const now = stepIndex === i
              return (
                <li key={p} className={`jd-step ${done ? 'done' : ''} ${now ? 'now' : ''}`} aria-current={now ? 'step' : undefined}>
                  <span className="jd-dot">{done ? <Check size={14} aria-hidden /> : i + 1}</span>
                  <small>{p}</small>
                </li>
              )
            })}
          </ol>
        </section>

        <div className="jd-grid">
          <div className="jd-main">
            {canAct && (
              <section className="card jd-card">
                <header className="jd-card-head"><h2>Actions</h2><p>Advance this job through the lifecycle. Every action is written to the history.</p></header>
                <div className="jd-card-body">
                  <div className="action-row">
                    <select value={tech} onChange={e => setTech(e.target.value)} aria-label="Technician">
                      <option value="">Assign or reassign technician</option>
                      {store.users.filter(u => u.role === 'technician').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <button className="button secondary" onClick={assign}>Assign</button>
                    {job.status === 'Completed' && !job.ev && (isEv
                      ? <button className="button primary" onClick={() => { store.raiseInvoice(job.id, comment); toast.success('Invoice raised'); setComment('') }}>Raise invoice</button>
                      : <Link className="button primary" href={`/invoices/new?jobId=${job.id}`}>Raise invoice</Link>)}
                    {job.status === 'Invoiced' && !job.ev && <button className="button primary" onClick={() => { store.closeJob(job.id, comment); toast.success('Job closed'); setComment('') }}>Close job</button>}
                    {!['Closed', 'Invoiced'].includes(job.status) && <button className="button secondary" onClick={hold}>{job.holdSince ? 'Resume job' : 'Put on hold'}</button>}
                  </div>
                </div>
              </section>
            )}

            <div className="tabs underline">
              {visibleTabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
            </div>

            {job.ev && <EvWorkflowPanel job={job} />}

            {tab === 'overview' && (
              <>
                <section className="card jd-card">
                  <div className="jd-card-body">
                    <h3 className="jd-label">Description</h3>
                    <p className="jd-desc">{job.remarks || 'No description was provided for this job.'}</p>
                  </div>
                </section>

                <section className="card jd-card">
                  <div className="jd-card-body">
                    <label className="jd-label" htmlFor="jd-comment">Add comment</label>
                    <textarea id="jd-comment" className="jd-textarea" rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Write a public comment or internal note..." />
                    <div className="jd-comment-row">
                      <label className="jd-check"><input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /> Public (visible to requester)</label>
                      <button className="button secondary" onClick={post} disabled={!comment.trim()}><MessageSquare size={16} aria-hidden /> Post</button>
                    </div>
                  </div>
                </section>

                <section className="card jd-card">
                  <div className="jd-card-body">
                    <h3 className="jd-label">Activity ({history.length})</h3>
                    {history.length ? (
                      <ul className="jd-activity">
                        {history.map(h => (
                          <li key={h.id}>
                            <div className="jd-act-top">
                              <span><strong>{store.users.find(u => u.id === h.userId)?.name ?? 'System'}</strong> <span className="chip tone-amber">{h.event}</span></span>
                              <time>{when(h.at)}</time>
                            </div>
                            {(h.fromStatus && h.toStatus) && <p>{h.fromStatus} to {h.toStatus}</p>}
                            {h.comment && <p>{h.comment}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="muted">Status changes, assignments and comments appear here.</p>}
                  </div>
                </section>
              </>
            )}

            {tab === 'checklist' && (
              <section className="content-card">
                <h2>Checklist and evidence</h2>
                {store.answers.filter(a => a.jobId === job.id).length || attachments.length ? (
                  <ul className="plain-list">
                    {store.answers.filter(a => a.jobId === job.id).map(a => <li key={a.itemId}>{store.checklistItems.find(c => c.id === a.itemId)?.label ?? a.itemId}: <strong>{a.value}</strong></li>)}
                    {attachments.map(a => <li key={a.id}>{a.kind}: {a.name}</li>)}
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
                        <span>{when(h.at)}</span>
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
                {whatsappOn && conversation && (
                  <div className="reply-block">
                    <div className="card-heading"><h3>WhatsApp conversation</h3><Link className="button secondary sm" href="/communication/whatsapp">Open in inbox</Link></div>
                    <div className="wa-messages wa-inline">
                      {conversation.messages.map(m => (
                        <div key={m.id} className={`wa-bubble ${m.direction}`}>
                          {m.direction === 'out' && <small className="wa-agent">{store.users.find(u => u.id === m.agentId)?.name ?? 'Agent'}</small>}
                          <p>{m.text}</p>
                          <small>{new Date(m.at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {notifications.length ? (
                  <ul className="plain-list">
                    {notifications.map(n => <li key={n.id}>{when(n.at)} · {n.event ?? n.subject} · {n.channel} <StatusPill>{n.status ?? 'Sent'}</StatusPill></li>)}
                  </ul>
                ) : !conversation && <EmptyState title="No messages sent" helper={whatsappOn ? 'WhatsApp is used for short alerts. Documents go by email with a WhatsApp ready ping.' : 'Messages for this job are sent by email.'} />}
              </section>
            )}
          </div>

          <aside className="jd-side">
            <section className="card jd-card">
              <div className="jd-card-body">
                <h3 className="jd-label"><Paperclip size={14} aria-hidden /> Attachments</h3>
                {attachments.length
                  ? <ul className="plain-list">{attachments.map(a => <li key={a.id}>{a.kind}: {a.name}</li>)}</ul>
                  : <p className="muted">No attachments yet.</p>}
              </div>
            </section>

            <section className="card jd-card">
              <div className="jd-card-body">
                <h3 className="jd-title">SLA</h3>
                <div className="jd-sla">
                  <div className="jd-sla-top"><span className="jd-label">Time to resolve</span><strong className={`jd-sla-val ${state}`}>{sla.label}</strong></div>
                  <div className="jd-bar" role="progressbar" aria-valuenow={Math.min(100, Math.round(sla.ratio * 100))} aria-valuemin={0} aria-valuemax={100} aria-label="SLA elapsed">
                    <span style={{ width: `${Math.min(100, sla.ratio * 100)}%`, background: barTone }} />
                  </div>
                  <small className="muted">Due {when(job.slaDue)}</small>
                </div>
              </div>
            </section>

            <section className="card jd-card">
              <div className="jd-card-body">
                <h3 className="jd-title">Details</h3>
                <Row label="Status" value={<StatusPill>{job.status}</StatusPill>} />
                <h4 className="jd-group">Classification</h4>
                <Row label="Job type" value={type?.name ?? '-'} />
                <Row label="Channel" value={job.channel} />
                {isEv && <Row label="Principal" value={principal?.name ?? 'Missing'} />}
                <h4 className="jd-group">People</h4>
                <Row label="Customer" value={customer?.name ?? '-'} />
                <Row label="Technician" value={technician?.name ?? 'Unassigned'} />
                <h4 className="jd-group">Place</h4>
                <Row label="Site" value={site?.name ?? '-'} />
                <Row label="Address" value={site?.address ?? '-'} />
                <h4 className="jd-group">Timeline</h4>
                <Row label="Created" value={when(job.createdAt)} />
                <Row label="Scheduled" value={job.scheduledAt ? when(job.scheduledAt) : 'Not scheduled'} />
                <Row label="First response" value={firstResponse ? when(firstResponse) : 'Not yet'} />
                <Row label="SLA due" value={when(job.slaDue)} />
              </div>
            </section>
          </aside>
        </div>
      </main>
    </AppShell>
  )
}
