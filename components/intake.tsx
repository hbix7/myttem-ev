'use client'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared'
import { useOperationsStore, type Lead } from '@/lib/store/operations'

const FIELDS: [keyof Lead, string][] = [
  ['customerName', 'Customer name'],
  ['phone', 'Phone'],
  ['address', 'Address'],
  ['vehicleModel', 'Vehicle model'],
  ['chargerModel', 'Charger model'],
  ['preferredDate', 'Preferred assessment date'],
]

const received = (lead: Lead) => lead.receivedAt ? new Date(lead.receivedAt).toLocaleString('en-MY') : ''

function DraftCard({ lead }: { lead: Lead }) {
  const [fields, setFields] = useState(lead)
  const confirm = useOperationsStore(s => s.confirmLead)
  const discard = useOperationsStore(s => s.discardLead)
  const set = (key: keyof Lead, value: string) => setFields(f => ({ ...f, [key]: value }))
  return (
    <article className="intake-card">
      <div className="raw-message">
        <span className="channel-tag">Email</span>
        {lead.subject && <strong>{lead.subject}</strong>}
        <p style={{ whiteSpace: 'pre-wrap' }}>{lead.raw}</p>
        <small>From {lead.from} · Received {received(lead)}</small>
      </div>
      <div className="parsed-fields">
        {FIELDS.map(([key, label]) => (
          <label key={key}>{label}<input value={String(fields[key] ?? '')} onChange={e => set(key, e.target.value)} /></label>
        ))}
        <div className="card-actions">
          <button className="button primary" onClick={() => {
            const jobId = confirm(lead.id, fields)
            const job = jobId && useOperationsStore.getState().leads.find(l => l.id === lead.id)?.jobId
            toast.success(`Created ${job || 'EV job'}`)
          }}>Confirm and create job</button>
          <button className="button secondary" onClick={() => { if (window.confirm('Discard this request?')) { discard(lead.id); toast.success('Request discarded') } }}>Discard</button>
        </div>
      </div>
    </article>
  )
}

function ManualCard({ lead }: { lead: Lead }) {
  const discard = useOperationsStore(s => s.discardLead)
  return (
    <article className="intake-card manual-card">
      <div className="raw-message">
        <span className="channel-tag">Manual entry needed</span>
        {lead.subject && <strong>{lead.subject}</strong>}
        <p style={{ whiteSpace: 'pre-wrap' }}>{lead.raw}</p>
        <small>From {lead.from} · Received {received(lead)}</small>
      </div>
      <div className="card-actions">
        <Link className="button primary" href={`/jobs/new?raw=${encodeURIComponent(lead.raw)}`}>Create job from this email</Link>
        <button className="button secondary" onClick={() => { discard(lead.id); toast.success('Request discarded') }}>Discard</button>
      </div>
    </article>
  )
}

/* Email is the only channel that waits here for review. WhatsApp conversations create their job automatically. */
export function EmailIntake() {
  const [tab, setTab] = useState<'drafts' | 'manual'>('drafts')
  const leads = useOperationsStore(s => s.leads)
  const drafts = leads.filter(l => l.status === 'Draft')
  const manual = leads.filter(l => l.status === 'Manual')
  const list = tab === 'drafts' ? drafts : manual
  return (
    <>
      <p className="helper-banner">Email requests wait here for review. WhatsApp messages never appear in this list: each new number opens a conversation in the WhatsApp inbox and a job is created automatically.</p>
      <div className="tabs">
        <button className={tab === 'drafts' ? 'active' : ''} onClick={() => setTab('drafts')}>Drafts to review <b>{drafts.length}</b></button>
        <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>Manual entry needed <b>{manual.length}</b></button>
      </div>
      {list.length === 0
        ? <EmptyState title={tab === 'drafts' ? 'No drafts to review' : 'Nothing needs manual entry'} helper="New email requests appear here as they arrive." />
        : <div className="intake-list">{list.map(l => tab === 'drafts' ? <DraftCard key={l.id} lead={l} /> : <ManualCard key={l.id} lead={l} />)}</div>}
    </>
  )
}
