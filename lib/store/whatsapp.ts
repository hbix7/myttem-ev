'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { templateDefs, type NumberStatus, type TemplateStatus, type VerificationStatus } from '@/lib/store/comms'

export const CHARGESINI_NUMBER = '+60125550199'
export const SANDBOX_PHONE_NUMBER_ID = 'sandbox-phone-number-id'

const approved = Object.fromEntries(templateDefs.map(t => [t.name, 'Approved' as TemplateStatus]))

export type Provider = 'mock' | 'twilio' | 'meta'
export type WaMessage = {
  id: string
  direction: 'in' | 'out'
  text: string
  at: string
  kind?: 'text' | 'image' | 'pdf' | 'voice' | 'other'
  agentId?: string
  solution?: boolean
}
/** One thread per customer phone. Every thread belongs to a job that was auto-created or matched on first contact. */
export type Conversation = {
  id: string
  phone: string
  name: string
  jobId: string
  assignedTo?: string
  unread: number
  firstResponseAt?: string
  firstSolutionAt?: string
  messages: WaMessage[]
}
export type ChannelConfig = {
  provider: Provider
  businessNumber: string
  twilioSid: string
  twilioTokenStored: boolean
  metaWabaId: string
  metaPhoneNumberId: string
  metaAccessTokenStored: boolean
  metaAppSecretStored: boolean
  metaVerifyTokenStored: boolean
  connection: 'connected' | 'disconnected'
  testedAt?: string
}

/** Strips spaces, dashes and a "whatsapp:" prefix so the number is saved in E.164. */
export const toE164 = (value: string) => {
  const digits = value.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '')
  const plus = digits.startsWith('+') ? '+' : ''
  return plus + digits.replace(/\+/g, '')
}

const seedConversations: Conversation[] = [
  {
    id: 'conv-1', phone: '60123334455', name: 'Nurul Aini', jobId: 'j1', unread: 1,
    messages: [{ id: 'm1', direction: 'in', text: 'Please confirm the proposed installation date.', at: '2026-11-02T09:20:00+08:00' }],
  },
  {
    id: 'conv-2', phone: '60175556677', name: 'Kelvin Ong', jobId: 'j5', assignedTo: 'u1', unread: 0,
    firstResponseAt: '2026-11-01T14:20:00+08:00',
    messages: [
      { id: 'm2', direction: 'in', text: 'Quotation approved. Please proceed.', at: '2026-11-01T14:05:00+08:00' },
      { id: 'm3', direction: 'out', text: 'Thank you. We will schedule the installation and confirm the slot shortly.', at: '2026-11-01T14:20:00+08:00', agentId: 'u1' },
    ],
  },
  {
    id: 'conv-3', phone: '60198887766', name: 'Farah Idris', jobId: 'j3', unread: 1,
    messages: [{ id: 'm4', direction: 'in', text: 'Can you call me about the access window?', at: '2026-11-03T08:40:00+08:00' }],
  },
]

const defaultConfig: ChannelConfig = {
  provider: 'mock', businessNumber: CHARGESINI_NUMBER, twilioSid: '', twilioTokenStored: false,
  metaWabaId: '', metaPhoneNumberId: '', metaAccessTokenStored: false, metaAppSecretStored: false, metaVerifyTokenStored: false,
  connection: 'disconnected',
}

interface WhatsAppState {
  numberStatus: NumberStatus
  verification: VerificationStatus
  templateStatus: Record<string, TemplateStatus>
  parallelRun: boolean
  failNextDelivery: boolean
  conversations: Conversation[]
  seenMessageIds: string[]
  config: ChannelConfig
  setNumberStatus: (s: NumberStatus) => void
  setVerification: (s: VerificationStatus) => void
  setTemplateStatus: (name: string, s: TemplateStatus) => void
  setParallelRun: (on: boolean) => void
  armDeliveryFailure: (on: boolean) => void
  markSeen: (id: string) => void
  resetChannel: () => void
  setConfig: (patch: Partial<ChannelConfig>) => void
  addConversation: (c: Conversation) => void
  appendMessage: (conversationId: string, message: WaMessage, opts?: { unread?: boolean }) => void
  markRead: (conversationId: string) => void
  sendReply: (conversationId: string, text: string, agentId: string, solution: boolean) => void
}

export const useWhatsAppStore = create<WhatsAppState>()(persist((set) => ({
  numberStatus: 'Active',
  verification: 'Verified',
  templateStatus: approved,
  parallelRun: true,
  failNextDelivery: false,
  conversations: seedConversations,
  seenMessageIds: [],
  config: defaultConfig,
  setNumberStatus: numberStatus => set({ numberStatus }),
  setVerification: verification => set({ verification }),
  setTemplateStatus: (name, status) => set(s => ({ templateStatus: { ...s.templateStatus, [name]: status } })),
  setParallelRun: parallelRun => set({ parallelRun }),
  armDeliveryFailure: failNextDelivery => set({ failNextDelivery }),
  markSeen: id => set(s => ({ seenMessageIds: [...s.seenMessageIds.slice(-199), id] })),
  resetChannel: () => set({ numberStatus: 'Active', verification: 'Verified', templateStatus: approved, failNextDelivery: false }),
  setConfig: patch => set(s => ({ config: { ...s.config, ...patch } })),
  addConversation: c => set(s => ({ conversations: [c, ...s.conversations] })),
  appendMessage: (conversationId, message, opts) => set(s => ({
    conversations: s.conversations.map(c => c.id === conversationId ? { ...c, messages: [...c.messages, message], unread: opts?.unread ? c.unread + 1 : c.unread } : c),
  })),
  markRead: conversationId => set(s => ({ conversations: s.conversations.map(c => c.id === conversationId && c.unread ? { ...c, unread: 0 } : c) })),
  sendReply: (conversationId, text, agentId, solution) => set(s => ({
    conversations: s.conversations.map(c => {
      if (c.id !== conversationId) return c
      const at = new Date().toISOString()
      return {
        ...c,
        assignedTo: c.assignedTo ?? agentId,
        unread: 0,
        firstResponseAt: c.firstResponseAt ?? at,
        firstSolutionAt: solution ? c.firstSolutionAt ?? at : c.firstSolutionAt,
        messages: [...c.messages, { id: crypto.randomUUID(), direction: 'out', text, at, agentId, solution }],
      }
    }),
  })),
}), { name: 'myttem-whatsapp', version: 2, migrate: () => ({}) as never }))
