'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Mail, X } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, StatusPill } from '@/components/shared'
import { useOperationsStore, type Lead } from '@/lib/store/operations'

const FIELDS: [keyof Lead, string][] = [
  ['customerName', 'Customer name'],
  ['phone', 'Phone'],
  ['address', 'Address'],
  ['vehicleModel', 'Vehicle model'],
  ['chargerModel', 'Charger model'],
  ['preferredDate', 'Preferred assessment date'],
]

type Filter = 'All' | 'Pending' | 'Accepted' | 'Rejected'
const FILTERS: Filter[] = ['All', 'Pending', 'Accepted', 'Rejected']

const isPending = (l: Lead) => l.status === 'Draft' || l.status === 'Manual'
const label = (l: Lead): Exclude<Filter, 'All'> => isPending(l) ? 'Pending' : l.status === 'Confirmed' ? 'Accepted' : 'Rejected'
const tone = { Pending: 'amber', Accepted: 'green', Rejected: 'grey' } as const
const when = (l: Lead) => l.receivedAt ? new Date(l.receivedAt).toLocaleString('en-MY') : ''
const initials = (l: Lead) => (l.from ?? l.customerName ?? '?').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '?'
const title = (l: Lead) => l.subject || l.raw.split('\n')[0].slice(0, 80) || '(no subject)'

function acceptLead(lead: Lead, fields: Partial<Lead> = {}) {
  const { confirmLead } = useOperationsStore.getState()
  confirmLead(lead.id, fields)
  const job = useOperationsStore.getState().leads.find(l => l.id === lead.id)?.jobId
  toast.success(`Created ${job || 'EV job'}`)
}

function rejectLead(lead: Lead) {
  useOperationsStore.getState().discardLead(lead.id)
  toast.success('Email rejected')
}

function ModeSelect() {
  const mode = useOperationsStore(s => s.emailMode)
  const setMode = useOperationsStore(s => s.setEmailMode)
  return (
    <label className="email-mode">
      <span>New emails:</span>
      <select value={mode} onChange={e => { setMode(e.target.value as 'manual' | 'auto'); toast.success(e.target.value === 'auto' ? 'Complete emails now create jobs automatically' : 'New emails will wait for review') }}>
        <option value="manual">Wait for review (manual)</option>
        <option value="auto">Create job automatically</option>
      </select>
    </label>
  )
}

function Row({ lead }: { lead: Lead }) {
  const router = useRouter()
  const state = label(lead)
  const open = () => router.push(`/communication/intake/${lead.id}`)
  return (
    <li className="email-row" onClick={open}>
      <span className={`email-dot ${state.toLowerCase()}`} aria-hidden />
      <span className="avatar">{initials(lead)}</span>
      <div className="email-main">
        <div className="email-subject">
          <Link href={`/communication/intake/${lead.id}`} onClick={e => e.stopPropagation()}>{title(lead)}</Link>
          <StatusPill tone={tone[state]}>{state}</StatusPill>
        </div>
        <small>{lead.from ?? 'Unknown sender'}</small>
      </div>
      <time>{when(lead)}</time>
      <div className="email-actions" onClick={e => e.stopPropagation()}>
        {state === 'Pending' && (
          <>
            {lead.status === 'Draft'
              ? <button className="button sm accept" onClick={() => acceptLead(lead)}><CheckCircle2 size={14} />Accept</button>
              : <Link className="button sm accept" href={`/communication/intake/${lead.id}`}><CheckCircle2 size={14} />Review</Link>}
            <button className="button sm secondary" onClick={() => rejectLead(lead)}><X size={14} />Reject</button>
          </>
        )}
        {state === 'Accepted' && lead.jobId && <Link className="button sm secondary" href={`/jobs/${lead.jobId}`}>View job</Link>}
      </div>
    </li>
  )
}

/* Email is the only channel that waits here for review. WhatsApp conversations create their job automatically. */
export function EmailIntake() {
  const [filter, setFilter] = useState<Filter>('All')
  const leads = useOperationsStore(s => s.leads)
  const rows = useMemo(() => leads.filter(l => filter === 'All' || label(l) === filter), [leads, filter])
  return (
    <>
      <div className="email-card">
        <span className="email-card-icon"><Mail size={20} /></span>
        <div>
          <strong>Email intake</strong>
          <p>Requests that arrive by email wait here until you accept them. WhatsApp chats never appear here: they open a job on their own.</p>
        </div>
      </div>
      <div className="email-toolbar">
        <div className="filter-pills" role="tablist" aria-label="Filter emails">
          {FILTERS.map(f => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <ModeSelect />
      </div>
      {rows.length === 0
        ? <EmptyState title="No emails here" helper="New email requests appear in this list as they arrive." />
        : <ul className="email-list">{rows.map(l => <Row key={l.id} lead={l} />)}</ul>}
    </>
  )
}

export function EmailDetail({ id }: { id: string }) {
  const lead = useOperationsStore(s => s.leads.find(l => l.id === id))
  const [fields, setFields] = useState<Partial<Lead>>({})
  if (!lead) return <EmptyState title="Email not found" helper="It may have been removed. Go back to Email intake." action={<Link className="button secondary" href="/communication/intake">Back to Email intake</Link>} />
  const state = label(lead)
  const value = (key: keyof Lead) => String(fields[key] ?? lead[key] ?? '')
  return (
    <div className="email-detail">
      <section className="email-message">
        <header>
          <div className="email-message-meta">
            <Mail size={16} />
            <StatusPill tone={tone[state]}>{state}</StatusPill>
          </div>
          <h2>{title(lead)}</h2>
        </header>
        <dl>
          <div><dt>From</dt><dd>{lead.from ?? 'Unknown sender'}</dd></div>
          <div><dt>Received</dt><dd>{when(lead)}</dd></div>
        </dl>
        <div className="email-body">
          <span>Message</span>
          <p>{lead.raw || '(no text body)'}</p>
        </div>
      </section>

      {state === 'Pending' && (
        <section className="email-message">
          <header><h2>Job details</h2><p>{lead.status === 'Manual' ? 'No template was found in this email. Fill in what you know before accepting.' : 'Read from the email. Fix anything that looks wrong before accepting.'}</p></header>
          <div className="email-fields">
            {FIELDS.map(([key, text]) => (
              <label key={key}>{text}<input value={value(key)} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))} /></label>
            ))}
          </div>
        </section>
      )}

      <section className="email-review">
        {state === 'Pending' && (
          <>
            <span>Review this email:</span>
            <button className="button accept" onClick={() => acceptLead(lead, fields)}><CheckCircle2 size={16} />Accept &amp; create job</button>
            <button className="button secondary" onClick={() => { rejectLead(lead) }}><X size={16} />Reject</button>
          </>
        )}
        {state === 'Accepted' && (
          <>
            <span>This email was accepted.</span>
            {lead.jobId && <Link className="button accept" href={`/jobs/${lead.jobId}`}>View job</Link>}
          </>
        )}
        {state === 'Rejected' && <span>This email was rejected and no job was created.</span>}
      </section>
    </div>
  )
}
