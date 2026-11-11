'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getNow } from '@/lib/clock'

export type ClaimStatus = 'Raised' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Paid'
export const CLAIM_FLOW: ClaimStatus[] = ['Raised', 'Submitted', 'Under Review', 'Approved', 'Paid']
export interface ClaimEvent { status: ClaimStatus; at: string; by: string; note?: string }
export interface Claim {
  id: string; claimNo: string; jobId: string; jobNo: string; customer: string; principal: string
  amount: number; reason: string; status: ClaimStatus; raisedAt: string; dueAt: string
  attachments: string[]; notes: { at: string; by: string; text: string }[]; timeline: ClaimEvent[]; rejectedReason?: string
}

const base = new Date('2026-11-03T10:00:00+08:00').getTime()
const day = 86400000
const iso = (d: number) => new Date(base + d * day).toISOString()
const mk = (n: number, jobNo: string, customer: string, principal: string, amount: number, reason: string, status: ClaimStatus, raised: number, due: number, steps: ClaimStatus[]): Claim => ({
  id: `clm${n}`, claimNo: `CLM-${String(n).padStart(4, '0')}`, jobId: '', jobNo, customer, principal, amount, reason, status, raisedAt: iso(raised), dueAt: iso(due),
  attachments: n % 2 ? ['installation-report.pdf', 'site-photos.zip'] : ['invoice-copy.pdf'], notes: [],
  timeline: steps.map((s, i) => ({ status: s, at: iso(raised + i * 2), by: i % 2 ? 'Dato\' Ramesh' : 'Siti Aminah' })),
})
const seed: Claim[] = [
  mk(1, 'EVI-000001', 'Ahmad Zulkifli', 'ChargeSini', 1800, 'Installation of 7kW wallbox completed', 'Paid', -24, -4, ['Raised', 'Submitted', 'Under Review', 'Approved', 'Paid']),
  mk(2, 'EVI-000002', 'Tan Mei Ling', 'ChargeSini', 2250, 'Wallbox and cable run, 12m', 'Approved', -14, 4, ['Raised', 'Submitted', 'Under Review', 'Approved']),
  mk(3, 'EVI-000003', 'Hartini Ismail', 'Proton e.MAS', 1950, 'Installation, standard package', 'Under Review', -10, 2, ['Raised', 'Submitted', 'Under Review']),
  mk(4, 'EVA-000004', 'Lim Wei Jie', 'ChargeSini', 450, 'Site assessment fee', 'Submitted', -6, 1, ['Raised', 'Submitted']),
  mk(5, 'EVI-000004', 'Farah Nadia', 'Zeekr', 2600, 'Installation with DB upgrade', 'Raised', -3, 5, ['Raised']),
  mk(6, 'EVI-000005', 'Rajan Pillai', 'ChargeSini', 1800, 'Installation, report late', 'Raised', -30, -6, ['Raised']),
  mk(7, 'EVA-000005', 'Aisyah Karim', 'ChargeSini', 450, 'Assessment photos incomplete', 'Rejected', -18, -8, ['Raised', 'Submitted', 'Under Review', 'Rejected']),
  mk(8, 'EVI-000006', 'Priya Nair', 'Sangitech', 2100, 'Wallbox and earthing', 'Submitted', -5, 3, ['Raised', 'Submitted']),
]
seed[6].rejectedReason = 'Assessment photos did not meet the minimum of 6.'

interface ClaimState {
  claims: Claim[]
  addClaim: (c: { jobId: string; jobNo: string; customer: string; principal: string; amount: number; reason: string; attachments: string[]; by: string }) => string
  advance: (id: string, by: string, note?: string) => void
  reject: (id: string, by: string, reason: string) => void
  addNote: (id: string, by: string, text: string) => void
  addAttachment: (id: string, name: string) => void
}

export const nextClaimStatus = (s: ClaimStatus): ClaimStatus | undefined => {
  const i = CLAIM_FLOW.indexOf(s)
  return i >= 0 && i < CLAIM_FLOW.length - 1 ? CLAIM_FLOW[i + 1] : undefined
}
export const nextActionLabel = (s: ClaimStatus) => ({ Raised: 'Submit to principal', Submitted: 'Mark under review', 'Under Review': 'Mark approved', Approved: 'Record payment', Rejected: 'Raise again', Paid: '' }[s])

export const useClaimStore = create<ClaimState>()(persist((set) => ({
  claims: seed,
  addClaim: (c) => {
    const id = crypto.randomUUID()
    set(s => {
      const now = getNow().toISOString()
      const claim: Claim = { id, claimNo: `CLM-${String(s.claims.length + 1).padStart(4, '0')}`, jobId: c.jobId, jobNo: c.jobNo, customer: c.customer, principal: c.principal, amount: c.amount, reason: c.reason, status: 'Raised', raisedAt: now, dueAt: new Date(getNow().getTime() + 7 * day).toISOString(), attachments: c.attachments, notes: [], timeline: [{ status: 'Raised', at: now, by: c.by }] }
      return { claims: [claim, ...s.claims] }
    })
    return id
  },
  advance: (id, by, note) => set(s => ({
    claims: s.claims.map(c => {
      if (c.id !== id) return c
      const next = c.status === 'Rejected' ? 'Raised' : nextClaimStatus(c.status)
      if (!next) return c
      return { ...c, status: next, rejectedReason: undefined, timeline: [...c.timeline, { status: next, at: getNow().toISOString(), by, note }] }
    }),
  })),
  reject: (id, by, reason) => set(s => ({
    claims: s.claims.map(c => c.id === id ? { ...c, status: 'Rejected', rejectedReason: reason, timeline: [...c.timeline, { status: 'Rejected', at: getNow().toISOString(), by, note: reason }] } : c),
  })),
  addNote: (id, by, text) => set(s => ({ claims: s.claims.map(c => c.id === id ? { ...c, notes: [...c.notes, { at: getNow().toISOString(), by, text }] } : c) })),
  addAttachment: (id, name) => set(s => ({ claims: s.claims.map(c => c.id === id ? { ...c, attachments: [...c.attachments, name] } : c) })),
}), { name: 'myttem-claims', version: 1 }))

export const claimDaysLeft = (c: Claim) => Math.ceil((new Date(c.dueAt).getTime() - getNow().getTime()) / day)
export const isClaimOpen = (c: Claim) => !['Paid', 'Rejected'].includes(c.status)
export const isClaimOverdue = (c: Claim) => isClaimOpen(c) && claimDaysLeft(c) < 0
export const isClaimDueSoon = (c: Claim) => isClaimOpen(c) && claimDaysLeft(c) >= 0 && claimDaysLeft(c) <= 3
