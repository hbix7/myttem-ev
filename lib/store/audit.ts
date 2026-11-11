'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useStore } from '@/lib/store'
import { useCommercialStore } from '@/lib/store/commercial'
import { useClaimStore } from '@/lib/store/claims'
import { getNow } from '@/lib/clock'

export interface AuditEntry { id: string; at: string; userId: string; userName: string; role: string; module: string; action: string; target: string; detail?: string }

const seedAt = (h: number) => new Date(new Date('2026-11-03T10:00:00+08:00').getTime() - h * 3600000).toISOString()
const seed: AuditEntry[] = [
  { id: 'a1', at: seedAt(2), userId: 'u2', userName: 'Siti Aminah', role: 'admin', module: 'Quotations', action: 'Sent for approval', target: 'Quotation over RM 3,000' },
  { id: 'a2', at: seedAt(5), userId: 'u3', userName: "Dato' Ramesh", role: 'owner', module: 'Quotations', action: 'Approved', target: 'Quotation sent to customer' },
  { id: 'a3', at: seedAt(9), userId: 'u2', userName: 'Siti Aminah', role: 'admin', module: 'Jobs', action: 'Assigned technician', target: 'JOB-000007', detail: 'Assigned to Kumar Raj' },
  { id: 'a4', at: seedAt(26), userId: 'u2', userName: 'Siti Aminah', role: 'admin', module: 'Invoices', action: 'Created', target: 'INV-000008' },
  { id: 'a5', at: seedAt(30), userId: 'u3', userName: "Dato' Ramesh", role: 'owner', module: 'Settings', action: 'Changed approval threshold', target: 'RM 2,000 to RM 3,000' },
  { id: 'a6', at: seedAt(50), userId: 'u1', userName: 'Aiman Hakim', role: 'sysadmin', module: 'Users and Roles', action: 'Added user', target: 'Hafiz Omar', detail: 'Role: Technician' },
]

interface AuditState { entries: AuditEntry[]; add: (e: Omit<AuditEntry, 'id' | 'at' | 'userName' | 'role'> & { at?: string }) => void }

export const useAuditStore = create<AuditState>()(persist((set) => ({
  entries: seed,
  add: (e) => {
    const user = useStore.getState().users.find(u => u.id === e.userId)
    set(s => ({ entries: [{ ...e, id: crypto.randomUUID(), at: e.at ?? getNow().toISOString(), userName: user?.name ?? 'System', role: user?.role ?? 'system' }, ...s.entries].slice(0, 500) }))
  },
}), { name: 'myttem-audit', version: 1 }))

export function logAudit(module: string, action: string, target: string, detail?: string) {
  useAuditStore.getState().add({ userId: useStore.getState().currentUserId, module, action, target, detail })
}

const pushHistory = (jobId: string, event: string) => useStore.setState(s => ({
  history: [...s.history, { id: `auto-${crypto.randomUUID()}`, jobId, userId: s.currentUserId, event, at: getNow().toISOString() }],
}))

let started = false
/* Watches every store for status changes. Each change is written to the job history and the audit log. */
export function startAuditWatchers() {
  if (started || typeof window === 'undefined') return
  started = true
  useStore.subscribe((s, prev) => {
    if (s.history.length <= prev.history.length) return
    s.history.slice(prev.history.length).forEach(h => {
      if (h.id.startsWith('auto-')) return
      const job = s.jobs.find(j => j.id === h.jobId)
      useAuditStore.getState().add({ userId: h.userId, module: 'Jobs', action: h.event, target: job?.jobNo ?? h.jobId, detail: h.toStatus ? `${h.fromStatus ? h.fromStatus + ' to ' : ''}${h.toStatus}` : h.comment, at: h.at })
    })
  })
  useCommercialStore.subscribe((s, prev) => {
    s.quotations.forEach(q => {
      const old = prev.quotations.find(x => x.id === q.id)
      if (!old) { logAudit('Quotations', 'Created', q.quoteNo, q.customer); pushHistory(q.jobId, `Quotation ${q.quoteNo} created`); return }
      if (old.status !== q.status) { logAudit('Quotations', `Status: ${q.status}`, q.quoteNo, `${old.status} to ${q.status}`); pushHistory(q.jobId, `Quotation ${q.quoteNo} is now ${q.status}`) }
    })
    s.invoices.forEach(i => {
      const old = prev.invoices.find(x => x.id === i.id)
      if (!old) { logAudit('Invoices', 'Created', i.invoiceNo, i.customer); pushHistory(i.jobId, `Invoice ${i.invoiceNo} created`); return }
      if (old.status !== i.status) { logAudit('Invoices', `Status: ${i.status}`, i.invoiceNo, `${old.status} to ${i.status}`); pushHistory(i.jobId, `Invoice ${i.invoiceNo} is now ${i.status}`) }
    })
  })
  useClaimStore.subscribe((s, prev) => {
    s.claims.forEach(c => {
      const old = prev.claims.find(x => x.id === c.id)
      if (!old) { logAudit('Chargebacks', 'Claim raised', c.claimNo, `${c.jobNo}, RM ${c.amount}`); if (c.jobId) pushHistory(c.jobId, `Claim ${c.claimNo} raised`); return }
      if (old.status !== c.status) { logAudit('Chargebacks', `Status: ${c.status}`, c.claimNo, `${old.status} to ${c.status}`); if (c.jobId) pushHistory(c.jobId, `Claim ${c.claimNo} is now ${c.status}`) }
    })
  })
}
