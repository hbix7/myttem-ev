import type { NotificationResult, NotificationStatus, Settings } from '@/lib/types'

export const templates = [
  'Assessment date confirmation','Installation date confirmation','Reschedule confirmation','Quotation follow-up','Quotation ready','Booking link ready','Invoice ready'
].map((name, i) => ({ id: `tpl-${i + 1}`, name, status: 'Approved' as const }))

const shortAlerts = new Set(['Assessment date confirmation','Installation date confirmation','Reschedule confirmation','Quotation follow-up'])
const documentEvents = new Set(['Quotation ready','Booking link ready','Invoice ready','Job sheet','Installation report'])

export function sendNotification(jobId: string, event: string, preferred: 'Email'|'WhatsApp', settings: Pick<Settings,'whatsappNumberStatus'|'templates'> = { whatsappNumberStatus: 'Verified', templates }) : NotificationResult {
  const rejected = settings.templates.some(template => template.name === event && template.status === 'Rejected')
  const canWhatsApp = preferred === 'WhatsApp' && shortAlerts.has(event) && !rejected && !['Restricted','Suspended'].includes(settings.whatsappNumberStatus)
  const fallback = preferred === 'WhatsApp' && !canWhatsApp
  const channel = canWhatsApp ? 'WhatsApp' : 'Email'
  const status: NotificationStatus = fallback ? 'Fallback sent' : 'Queued'
  return { notification: { id: crypto.randomUUID(), jobId, channel, subject: event, event, status, fallbackUsed: fallback, at: new Date().toISOString() }, toast: fallback ? 'WhatsApp unavailable - fallback email sent' : channel === 'Email' ? 'Email queued' : 'Email queued - WhatsApp ready ping sent' }
}

export const notificationIsDocument = (event: string) => documentEvents.has(event)
export const usageSeed = [
  { month: '2026-11', whatsapp: 312, email: 4180 },
  { month: '2026-10', whatsapp: 289, email: 3960 },
  { month: '2026-09', whatsapp: 344, email: 4510 },
  { month: '2026-08', whatsapp: 275, email: 3820 },
]
