import type { Notification, NotificationResult } from '@/lib/types'

export type NumberStatus = 'Active' | 'Restricted' | 'Suspended'
export type VerificationStatus = 'Verified' | 'Pending' | 'Not verified'
export type TemplateStatus = 'Approved' | 'Rejected' | 'Pending'

/** Short WhatsApp alerts. Each is sent as a Meta-approved template. */
export const alertTemplates = ['Assessment date confirmation', 'Installation date confirmation', 'Reschedule confirmation', 'Quotation follow-up'] as const

/** Documents always go by email. WhatsApp only receives a short "ready" notice for these three. */
export const readyNotices: Record<string, string> = {
  Quotation: 'Quotation ready',
  'Booking link': 'Booking link ready',
  Invoice: 'Invoice ready',
}

export const templateDefs = [
  ...alertTemplates.map(name => ({ name, kind: 'alert' as const })),
  ...Object.values(readyNotices).map(name => ({ name, kind: 'ready-notice' as const })),
]

export interface ChannelHealth {
  flagOn: boolean
  numberStatus: NumberStatus
  templateStatus: Record<string, TemplateStatus>
  parallelRun: boolean
  /** When true the next WhatsApp send is treated as a delivery failure. */
  failDelivery: boolean
}

const make = (jobId: string, channel: Notification['channel'], subject: string, event: string, extra: Partial<Notification>): Notification => ({
  id: crypto.randomUUID(), jobId, channel, subject, event, at: new Date().toISOString(), ...extra,
})

/** Why WhatsApp cannot be used for this template right now, or null when it can. */
export function whatsappBlock(template: string, h: ChannelHealth): string | null {
  if (h.numberStatus !== 'Active') return `Number ${h.numberStatus.toLowerCase()}`
  const status = h.templateStatus[template] ?? 'Approved'
  if (status !== 'Approved') return `Template ${status.toLowerCase()}`
  return null
}

export interface PlanResult extends NotificationResult { consumedFailure: boolean }

export function planNotification(jobId: string, event: string, subject: string, h: ChannelHealth): PlanResult {
  const notifications: Notification[] = []
  let consumedFailure = false
  const readyTemplate = readyNotices[event]
  const isAlert = (alertTemplates as readonly string[]).includes(event)

  if (readyTemplate) {
    notifications.push(make(jobId, 'Email', subject, event, { status: 'Queued', kind: 'document', detail: 'Document sent by email' }))
    if (h.flagOn) {
      const block = whatsappBlock(readyTemplate, h)
      if (block) {
        notifications.push(make(jobId, 'WhatsApp', readyTemplate, readyTemplate, { status: 'Failed', kind: 'ready-notice', detail: `${block}. Notice skipped, document already emailed` }))
      } else if (h.failDelivery) {
        consumedFailure = true
        notifications.push(make(jobId, 'WhatsApp', readyTemplate, readyTemplate, { status: 'Failed', kind: 'ready-notice', detail: 'Delivery failed. Document already emailed' }))
      } else {
        notifications.push(make(jobId, 'WhatsApp', readyTemplate, readyTemplate, { status: 'Sent', kind: 'ready-notice', detail: 'Short notice only. No document or link' }))
      }
    }
    return { notifications, consumedFailure, toast: notifications.length > 1 && notifications[1].status === 'Sent' ? 'Email queued. WhatsApp ready notice sent' : 'Email queued' }
  }

  if (!isAlert || !h.flagOn) {
    notifications.push(make(jobId, 'Email', subject, event, { status: 'Queued' }))
    return { notifications, consumedFailure, toast: 'Email queued' }
  }

  const block = whatsappBlock(event, h)
  if (block) {
    notifications.push(make(jobId, 'Email', subject, event, { status: 'Fallback sent', fallbackUsed: true, kind: 'alert', detail: `${block}. WhatsApp skipped` }))
    return { notifications, consumedFailure, toast: `${block}. Fallback email sent` }
  }
  if (h.failDelivery) {
    consumedFailure = true
    notifications.push(make(jobId, 'WhatsApp', subject, event, { status: 'Failed', kind: 'alert', detail: 'Delivery failed' }))
    notifications.push(make(jobId, 'Email', subject, event, { status: 'Fallback sent', fallbackUsed: true, kind: 'alert', detail: 'WhatsApp delivery failed. Sent by email instead' }))
    return { notifications, consumedFailure, toast: 'WhatsApp delivery failed. Fallback email sent' }
  }
  notifications.push(make(jobId, 'WhatsApp', subject, event, { status: 'Sent', kind: 'alert' }))
  if (h.parallelRun) notifications.push(make(jobId, 'Email', subject, event, { status: 'Queued', kind: 'alert', detail: 'Parallel run: sent on both channels' }))
  return { notifications, consumedFailure, toast: h.parallelRun ? 'Sent on WhatsApp and email (parallel run)' : 'WhatsApp alert sent' }
}

export const usageSeed = [
  { month: '2026-11', whatsapp: 312, email: 4180 },
  { month: '2026-10', whatsapp: 289, email: 3960 },
  { month: '2026-09', whatsapp: 344, email: 4510 },
  { month: '2026-08', whatsapp: 275, email: 3820 },
]
