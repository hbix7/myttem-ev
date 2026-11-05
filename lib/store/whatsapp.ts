'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomerReply } from '@/lib/types'
import { templateDefs, type NumberStatus, type TemplateStatus, type VerificationStatus } from '@/lib/store/comms'

export const CHARGESINI_NUMBER = '+60 12-555 0199'
export const SANDBOX_PHONE_NUMBER_ID = 'sandbox-phone-number-id'

const approved = Object.fromEntries(templateDefs.map(t => [t.name, 'Approved' as TemplateStatus]))

const seedReplies: CustomerReply[] = [
  { id: 'reply-1', jobId: 'j1', message: 'Please confirm the proposed installation date.', at: '2026-11-02T09:20:00+08:00', responded: false },
  { id: 'reply-2', jobId: 'j5', message: 'Quotation approved. Please proceed.', at: '2026-11-01T14:05:00+08:00', responded: true },
  { id: 'reply-3', jobId: 'j3', message: 'Can you call me about the access window?', at: '2026-11-03T08:40:00+08:00', responded: false },
]

interface WhatsAppState {
  numberStatus: NumberStatus
  verification: VerificationStatus
  templateStatus: Record<string, TemplateStatus>
  parallelRun: boolean
  failNextDelivery: boolean
  replies: CustomerReply[]
  seenMessageIds: string[]
  setNumberStatus: (s: NumberStatus) => void
  setVerification: (s: VerificationStatus) => void
  setTemplateStatus: (name: string, s: TemplateStatus) => void
  setParallelRun: (on: boolean) => void
  armDeliveryFailure: (on: boolean) => void
  addReply: (reply: CustomerReply) => void
  markResponded: (id: string) => void
  markSeen: (id: string) => void
  resetChannel: () => void
}

export const useWhatsAppStore = create<WhatsAppState>()(persist((set) => ({
  numberStatus: 'Active',
  verification: 'Verified',
  templateStatus: approved,
  parallelRun: true,
  failNextDelivery: false,
  replies: seedReplies,
  seenMessageIds: [],
  setNumberStatus: numberStatus => set({ numberStatus }),
  setVerification: verification => set({ verification }),
  setTemplateStatus: (name, status) => set(s => ({ templateStatus: { ...s.templateStatus, [name]: status } })),
  setParallelRun: parallelRun => set({ parallelRun }),
  armDeliveryFailure: failNextDelivery => set({ failNextDelivery }),
  addReply: reply => set(s => ({ replies: [reply, ...s.replies] })),
  markResponded: id => set(s => ({ replies: s.replies.map(r => r.id === id ? { ...r, responded: true } : r) })),
  markSeen: id => set(s => ({ seenMessageIds: [...s.seenMessageIds.slice(-199), id] })),
  resetChannel: () => set({ numberStatus: 'Active', verification: 'Verified', templateStatus: approved, failNextDelivery: false }),
}), { name: 'myttem-whatsapp', version: 1 }))
