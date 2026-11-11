'use client'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { toast } from 'sonner'
import { StatusPill } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useMasterStore } from '@/lib/store/master'
import { useOperationsStore, type IngestSummary } from '@/lib/store/operations'
import { SANDBOX_PHONE_NUMBER_ID, useWhatsAppStore } from '@/lib/store/whatsapp'
import { INTAKE_FIELDS, INTAKE_TEMPLATE_TEXT, buildMetaPayload, type InboundMessage, type SandboxMessage } from '@/lib/whatsapp'

const jsonFetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json() as Promise<{ messages: InboundMessage[] }>)

export const summaryText = (r: IngestSummary) => {
  const parts = [
    r.jobs && `${r.jobs} new job${r.jobs > 1 ? 's' : ''} created`,
    r.messages && `${r.messages} message${r.messages > 1 ? 's' : ''} added to a conversation`,
    r.duplicates && `${r.duplicates} duplicate${r.duplicates > 1 ? 's' : ''} ignored`,
  ].filter(Boolean)
  return parts.length ? `WhatsApp: ${parts.join(', ')}` : 'No messages'
}

/* Pulls messages the webhook has queued. Each new customer number opens a conversation and an auto-created job. */
export function useInboundSync() {
  const enabled = useMasterStore(m => m.flags.C)
  const ingest = useOperationsStore(s => s.ingestInbound)
  const { mutate, isValidating } = useSWR(enabled ? '/api/whatsapp/inbox' : null, jsonFetcher, {
    refreshInterval: 5000,
    onSuccess: data => {
      if (!data.messages?.length) return
      const result = ingest(data.messages)
      if (result.jobs + result.messages > 0) toast.success(summaryText(result))
    },
  })
  return { refresh: () => mutate(), refreshing: isValidating, enabled }
}

export function InboundSync() {
  useInboundSync()
  return null
}

type Sender = { label: string; phone: string; name: string }
type LogEntry = { id: string; at: string; sent: string; outcome: string; tone: string }

const completeTemplate = (): Record<string, string> => ({
  customerName: 'Aisha Rahman', phone: '012-3456789', address: 'Bangsar South, KL', vehicleModel: 'BYD Atto 3', chargerModel: '7kW AC wallbox', preferredDate: '18 Nov 2026',
})

export function WhatsAppSandbox() {
  const on = useMasterStore(m => m.flags.C)
  const customers = useStore(s => s.customers)
  const ingest = useOperationsStore(s => s.ingestInbound)
  const receiveEmail = useOperationsStore(s => s.receiveEmail)
  const displayNumber = useWhatsAppStore(w => w.config.businessNumber)
  const [emailFrom, setEmailFrom] = useState('aisha.rahman@example.com')
  const [emailSubject, setEmailSubject] = useState('EV charger assessment request')
  const [senderKey, setSenderKey] = useState('new')
  const [fields, setFields] = useState(completeTemplate)
  const [freeText, setFreeText] = useState('Hi, do you install chargers in Penang?')
  const [log, setLog] = useState<LogEntry[]>([])
  const [busy, setBusy] = useState(false)

  const senders: Sender[] = [
    { label: 'New number (not a customer)', phone: '60198765432', name: 'Unknown sender' },
    ...customers.filter(c => c.phone).slice(0, 6).map(c => ({ label: `${c.name} (existing customer)`, phone: `60${c.phone.replace(/\D/g, '').replace(/^60/, '').replace(/^0/, '')}`, name: c.contact || c.name })),
  ]
  const sender = senders.find(s => s.label === senderKey) ?? senders[0]

  const send = async (label: string, message: SandboxMessage) => {
    setBusy(true)
    try {
      const payload = buildMetaPayload({ from: sender.phone, name: sender.name, phoneNumberId: SANDBOX_PHONE_NUMBER_ID, displayNumber, message })
      const res = await fetch('/api/whatsapp/webhook?dryRun=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
      const data = (await res.json()) as { messages: InboundMessage[] }
      const result = ingest(data.messages)
      const outcome = summaryText(result).replace('WhatsApp: ', '')
      const tone = result.jobs ? 'green' : result.messages ? 'blue' : 'grey'
      setLog(l => [{ id: crypto.randomUUID(), at: new Date().toLocaleTimeString('en-MY'), sent: label, outcome, tone }, ...l].slice(0, 12))
      toast.success(summaryText(result))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sandbox send failed')
    } finally { setBusy(false) }
  }

  if (!on) return <p className="helper-banner">Enable Milestone C in Settings to use the WhatsApp sandbox.</p>

  const asText = INTAKE_FIELDS.map(f => `${f.label}: ${fields[f.key]}`).join('\n')
  const incomplete = INTAKE_FIELDS.filter(f => f.key !== 'chargerModel').map(f => `${f.label}: ${fields[f.key]}`).join('\n')

  return (
    <div className="stack">
      <p className="helper-banner">Messages are posted to the real webhook parser in dry-run mode, so no Meta credentials are needed. Every new number opens a conversation in the WhatsApp inbox and auto-creates a job. Email requests go to Email intake.</p>
      <section className="card settings-block">
        <h2>Sender</h2>
        <label>Send as
          <select value={sender.label} onChange={e => setSenderKey(e.target.value)} aria-label="Sender">{senders.map(s => <option key={s.label}>{s.label}</option>)}</select>
        </label>
        <small className="muted mono">From +{sender.phone}</small>
      </section>

      <section className="card settings-block">
        <h2>Intake template</h2>
        <div className="form-grid">{INTAKE_FIELDS.map(f => (
          <label key={f.key}>{f.label}<input value={fields[f.key]} onChange={e => setFields(v => ({ ...v, [f.key]: e.target.value }))} /></label>))}
        </div>
        <div className="button-row">
          <button className="button primary" disabled={busy} onClick={() => send('Complete intake template', { type: 'text', body: asText })}>Send complete template</button>
          <button className="button secondary" disabled={busy} onClick={() => send('Template missing Charger Model', { type: 'text', body: incomplete })}>Send with a field missing</button>
        </div>
      </section>

      <section className="card settings-block">
        <h2>Other messages</h2>
        <label>Free text<input value={freeText} onChange={e => setFreeText(e.target.value)} /></label>
        <div className="button-row">
          <button className="button secondary" disabled={busy} onClick={() => send('Free text', { type: 'text', body: freeText })}>Send text</button>
          <button className="button secondary" disabled={busy} onClick={() => send('Photo', { type: 'image', caption: 'Wall where the charger goes' })}>Send photo</button>
          <button className="button secondary" disabled={busy} onClick={() => send('PDF', { type: 'document', filename: 'tnb-bill.pdf', mime: 'application/pdf' })}>Send PDF</button>
          <button className="button secondary" disabled={busy} onClick={() => send('Voice note', { type: 'audio' })}>Send voice note</button>
        </div>
      </section>

      <section className="card settings-block">
        <h2>Email intake</h2>
        <p className="muted">Email is the only channel that lands in Email intake for review. A complete template becomes a draft; anything else needs manual entry.</p>
        <div className="form-grid">
          <label>From<input value={emailFrom} onChange={e => setEmailFrom(e.target.value)} /></label>
          <label>Subject<input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} /></label>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={() => { const r = receiveEmail(emailFrom, emailSubject, asText); toast.success(r === 'draft' ? 'Email added to Email intake' : 'Email added to Manual entry needed'); setLog(l => [{ id: crypto.randomUUID(), at: new Date().toLocaleTimeString('en-MY'), sent: 'Email with complete template', outcome: r === 'draft' ? 'Intake draft' : 'Manual entry', tone: r === 'draft' ? 'green' : 'orange' }, ...l].slice(0, 12)) }}>Send template by email</button>
          <button className="button secondary" onClick={() => { receiveEmail(emailFrom, emailSubject, freeText); toast.success('Email added to Manual entry needed'); setLog(l => [{ id: crypto.randomUUID(), at: new Date().toLocaleTimeString('en-MY'), sent: 'Free-text email', outcome: 'Manual entry', tone: 'orange' }, ...l].slice(0, 12)) }}>Send free-text email</button>
        </div>
      </section>

      <section className="card settings-block" aria-live="polite">
        <h2>Results</h2>
        {log.length ? (
          <ul className="plain-list">{log.map(l => <li key={l.id}>{l.at} · {l.sent} <StatusPill tone={l.tone}>{l.outcome}</StatusPill></li>)}</ul>
        ) : <p className="muted">Nothing sent yet.</p>}
        <div className="button-row"><Link className="button secondary" href="/communication/whatsapp">Open WhatsApp inbox</Link><Link className="button secondary" href="/communication/intake">Open Email intake</Link></div>
      </section>
    </div>
  )
}
