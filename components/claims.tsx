'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { FileDown, X } from 'lucide-react'
import { AppShell, PageHeader, StatusPill } from '@/components/shared'
import { ChargebacksTable } from '@/components/ev-operations'
import { useCan } from '@/components/access'
import { useStore } from '@/lib/store'
import { CLAIM_FLOW, nextActionLabel, nextClaimStatus, useClaimStore, type Claim } from '@/lib/store/claims'
import { logAudit } from '@/lib/store/audit'
import { downloadClaimPdf } from '@/lib/pdf'
import { getNow } from '@/lib/clock'

const rm = (n: number) => `RM ${n.toLocaleString('en-MY')}`
const day = (iso: string) => new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })
const overdue = (c: Claim) => !['Paid', 'Rejected'].includes(c.status) && new Date(c.dueAt).getTime() < getNow().getTime()

function useActor() {
  return useStore(s => s.users.find(u => u.id === s.currentUserId)?.name ?? 'Staff')
}

function ClaimDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const claim = useClaimStore(s => s.claims.find(c => c.id === id))
  const { advance, reject, addNote, addAttachment } = useClaimStore()
  const by = useActor()
  const canEdit = useCan('claims', 'edit')
  const canApprove = useCan('claims', 'approve')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  if (!claim) return null

  const next = nextClaimStatus(claim.status)
  const needsApproval = claim.status === 'Under Review'
  const blocked = needsApproval && !canApprove
  const step = () => {
    advance(claim.id, by)
    logAudit('EV Claims', claim.status === 'Rejected' ? 'Raised again' : `Moved to ${next ?? 'Raised'}`, claim.claimNo)
    toast.success(`${claim.claimNo} updated`)
  }

  return (
    <aside className="drawer-panel" aria-label={`Claim ${claim.claimNo}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{claim.claimNo}</h2>
        <button className="button ghost" onClick={onClose} aria-label="Close claim"><X size={16} /></button>
      </div>
      <div><StatusPill>{claim.status}</StatusPill></div>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>
        <strong>{claim.customer}</strong> ({claim.principal})<br />
        Case {claim.jobNo}<br />
        Amount {rm(claim.amount)}<br />
        Due {day(claim.dueAt)}{overdue(claim) && <> <StatusPill tone="red">Overdue</StatusPill></>}<br />
        <span className="muted">{claim.reason}</span>
      </div>
      {claim.rejectedReason && <div className="notice">Rejected: {claim.rejectedReason}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canEdit && (next || claim.status === 'Rejected') && (
          <button className="button primary" disabled={blocked} onClick={step} title={blocked ? 'Only an Owner can approve' : undefined}>{nextActionLabel(claim.status)}</button>
        )}
        {canApprove && ['Submitted', 'Under Review'].includes(claim.status) && <button className="button danger-outline" onClick={() => setRejecting(true)}>Reject</button>}
        <button className="button secondary" onClick={async () => { toast.success(`Saved ${await downloadClaimPdf(claim)}`) }}><FileDown size={14} /> PDF</button>
      </div>
      {blocked && <small className="muted">Approval of a claim needs an Owner.</small>}
      {rejecting && (
        <div className="tpl-form">
          <label>Reason for rejection<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
          <button className="button danger" onClick={() => { if (!reason.trim()) return toast.error('Enter a reason'); reject(claim.id, by, reason.trim()); logAudit('EV Claims', 'Rejected', claim.claimNo, reason.trim()); setRejecting(false); setReason('') }}>Confirm rejection</button>
        </div>
      )}

      <h3 style={{ fontSize: 13, margin: 0 }}>Attachments</h3>
      <ul className="timeline">
        {claim.attachments.map(a => <li key={a}>{a}</li>)}
        {canEdit && <li><button className="button secondary" onClick={() => { addAttachment(claim.id, `document-${claim.attachments.length + 1}.pdf`); toast.success('Attachment added') }}>Add attachment</button></li>}
      </ul>

      <h3 style={{ fontSize: 13, margin: 0 }}>Timeline</h3>
      <ul className="timeline">
        {[...claim.timeline].reverse().map((e, i) => <li key={i}><strong>{e.status}</strong><small>{day(e.at)} by {e.by}</small></li>)}
      </ul>

      <h3 style={{ fontSize: 13, margin: 0 }}>Notes</h3>
      <ul className="timeline">{claim.notes.map((n, i) => <li key={i}>{n.text}<small>{n.by}, {day(n.at)}</small></li>)}</ul>
      {canEdit && (
        <div className="tpl-form">
          <textarea aria-label="New note" value={note} onChange={e => setNote(e.target.value)} />
          <button className="button secondary" onClick={() => { if (!note.trim()) return; addNote(claim.id, by, note.trim()); setNote('') }}>Add note</button>
        </div>
      )}
    </aside>
  )
}

function NewClaim({ onDone }: { onDone: () => void }) {
  const jobs = useStore(s => s.jobs.filter(j => j.ev))
  const { customers, principals } = useStore()
  const by = useActor()
  const addClaim = useClaimStore(s => s.addClaim)
  const [jobId, setJobId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  return (
    <section className="table-card tpl-form" style={{ padding: 16 }}>
      <label>EV case
        <select value={jobId} onChange={e => setJobId(e.target.value)}>
          <option value="">Choose a case</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.jobNo}</option>)}
        </select>
      </label>
      <label>Amount (RM)<input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label>Reason<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="button primary" onClick={() => {
          const job = jobs.find(j => j.id === jobId)
          if (!job || !Number(amount) || !reason.trim()) return toast.error('Choose a case, amount and reason')
          const id = addClaim({ jobId: job.id, jobNo: job.jobNo, customer: customers.find(c => c.id === job.customerId)?.name ?? '', principal: principals.find(p => p.id === job.principalId)?.name ?? '', amount: Number(amount), reason: reason.trim(), attachments: [], by })
          logAudit('EV Claims', 'Raised claim', job.jobNo, rm(Number(amount)))
          toast.success('Claim raised')
          void id
          onDone()
        }}>Raise claim</button>
        <button className="button ghost" onClick={onDone}>Cancel</button>
      </div>
    </section>
  )
}

export function ClaimsPage() {
  const claims = useClaimStore(s => s.claims)
  const canCreate = useCan('claims', 'create')
  const [tab, setTab] = useState<'board' | 'amounts'>('board')
  const [open, setOpen] = useState<string>()
  const [creating, setCreating] = useState(false)
  const rejected = claims.filter(c => c.status === 'Rejected')
  const columns = [...CLAIM_FLOW.map(s => ({ s, items: claims.filter(c => c.status === s) })), ...(rejected.length ? [{ s: 'Rejected' as const, items: rejected }] : [])]

  return (
    <AppShell crumb="EV > Chargeback claims">
      <PageHeader title="EV chargeback claims" subtitle="Track each claim from raised to paid. Claims past their due date are flagged."
        action={canCreate && tab === 'board' ? <button className="button primary" onClick={() => setCreating(true)}>New claim</button> : undefined} />
      <main className="content">
        <div role="tablist" aria-label="Claims views" style={{ display: 'flex', gap: 8 }}>
          <button role="tab" aria-selected={tab === 'board'} className={`button ${tab === 'board' ? 'primary' : 'secondary'}`} onClick={() => setTab('board')}>Claims board</button>
          <button role="tab" aria-selected={tab === 'amounts'} className={`button ${tab === 'amounts' ? 'primary' : 'secondary'}`} onClick={() => setTab('amounts')}>Invoiced amounts</button>
        </div>
        {tab === 'board' ? (
          <>
            {creating && <NewClaim onDone={() => setCreating(false)} />}
            <div className="claim-board" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(200px, 1fr))` }}>
              {columns.map(col => (
                <section key={col.s} className="claim-col" aria-label={col.s}>
                  <h3><span>{col.s}</span><span>{col.items.length}</span></h3>
                  {col.items.map(c => (
                    <button key={c.id} className="claim-card" onClick={() => setOpen(c.id)}>
                      <strong>{c.claimNo}</strong>
                      <span>{c.customer}</span>
                      <span>{rm(c.amount)}</span>
                      <small>{c.principal} - due {day(c.dueAt)}</small>
                      {overdue(c) && <StatusPill tone="red">Overdue</StatusPill>}
                    </button>
                  ))}
                </section>
              ))}
            </div>
          </>
        ) : <ChargebacksTable />}
      </main>
      {open && <ClaimDrawer id={open} onClose={() => setOpen(undefined)} />}
    </AppShell>
  )
}
