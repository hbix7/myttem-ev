/* Pure helpers shared by the webhook route (server) and the sandbox / intake (client). No browser or Node-only APIs. */

export const INTAKE_FIELDS = [
  { key: 'customerName', label: 'Customer Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'vehicleModel', label: 'Vehicle Model' },
  { key: 'chargerModel', label: 'Charger Model' },
  { key: 'preferredDate', label: 'Preferred Assessment Date' },
] as const

export type IntakeKey = (typeof INTAKE_FIELDS)[number]['key']
export type IntakeFields = Record<IntakeKey, string>

export const INTAKE_TEMPLATE_TEXT = INTAKE_FIELDS.map(f => `${f.label}: `).join('\n')

export type InboundKind = 'text' | 'image' | 'pdf' | 'voice' | 'other'
export interface InboundMessage {
  id: string
  from: string
  name?: string
  at: string
  kind: InboundKind
  text?: string
  fileName?: string
  /** Set only when a text message carries all six template fields. */
  template?: IntakeFields
}

export const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('60') ? digits.slice(2) : digits.replace(/^0/, '')
}

/** A message matches only when every one of the six labelled fields is present and filled in. */
export function parseTemplate(text: string): IntakeFields | null {
  const found: Partial<IntakeFields> = {}
  for (const segment of text.split(/\r?\n|\s\/\s/)) {
    const hit = segment.match(/^\s*([A-Za-z ]+?)\s*:\s*(.+?)\s*$/)
    if (!hit) continue
    const field = INTAKE_FIELDS.find(f => f.label.toLowerCase() === hit[1].trim().toLowerCase())
    if (field && !found[field.key]) found[field.key] = hit[2]
  }
  return INTAKE_FIELDS.every(f => found[f.key]) ? (found as IntakeFields) : null
}

type MetaMessage = {
  id: string; from: string; timestamp?: string; type: string
  text?: { body?: string }
  image?: { caption?: string }
  document?: { filename?: string; mime_type?: string; caption?: string }
  audio?: { voice?: boolean }
}

export function normalizeMetaPayload(body: unknown, expectedPhoneNumberId?: string): { messages: InboundMessage[]; skipped: number } {
  const messages: InboundMessage[] = []
  let skipped = 0
  const entries = (body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? []
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value as { metadata?: { phone_number_id?: string }; contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: MetaMessage[] } | undefined
      if (!value?.messages) continue
      if (expectedPhoneNumberId && value.metadata?.phone_number_id !== expectedPhoneNumberId) { skipped += value.messages.length; continue }
      for (const m of value.messages) {
        const at = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString()
        const name = value.contacts?.find(c => c.wa_id === m.from)?.profile?.name
        const base = { id: m.id, from: m.from, name, at }
        if (m.type === 'text') {
          const text = m.text?.body ?? ''
          messages.push({ ...base, kind: 'text', text, template: parseTemplate(text) ?? undefined })
        } else if (m.type === 'image') messages.push({ ...base, kind: 'image', text: m.image?.caption })
        else if (m.type === 'audio') messages.push({ ...base, kind: 'voice' })
        else if (m.type === 'document') {
          const isPdf = /pdf/i.test(m.document?.mime_type ?? '') || /\.pdf$/i.test(m.document?.filename ?? '')
          messages.push({ ...base, kind: isPdf ? 'pdf' : 'other', fileName: m.document?.filename, text: m.document?.caption })
        } else messages.push({ ...base, kind: 'other' })
      }
    }
  }
  return { messages, skipped }
}

export type SandboxMessage =
  | { type: 'text'; body: string }
  | { type: 'image'; caption?: string }
  | { type: 'document'; filename: string; mime: string }
  | { type: 'audio' }

/** Builds a payload in the same shape Meta's Cloud API posts, so the sandbox exercises the real parser. */
export function buildMetaPayload(opts: { from: string; name: string; phoneNumberId: string; displayNumber: string; message: SandboxMessage }) {
  const id = `wamid.SANDBOX${Math.random().toString(36).slice(2, 12).toUpperCase()}`
  const m = opts.message
  const message: Record<string, unknown> = { id, from: opts.from, timestamp: String(Math.floor(Date.now() / 1000)), type: m.type }
  if (m.type === 'text') message.text = { body: m.body }
  if (m.type === 'image') message.image = { id: 'media-1', mime_type: 'image/jpeg', caption: m.caption }
  if (m.type === 'document') message.document = { id: 'media-2', filename: m.filename, mime_type: m.mime }
  if (m.type === 'audio') message.audio = { id: 'media-3', mime_type: 'audio/ogg; codecs=opus', voice: true }
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'sandbox-waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: opts.displayNumber, phone_number_id: opts.phoneNumberId }, contacts: [{ profile: { name: opts.name }, wa_id: opts.from }], messages: [message] } }] }],
  }
}
