'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { StatusPill } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useMasterStore } from '@/lib/store/master'
import { useOperationsStore, type IngestSummary } from '@/lib/store/operations'
import { CHARGESINI_NUMBER, SANDBOX_PHONE_NUMBER_ID, useWhatsAppStore } from '@/lib/store/whatsapp'
import { templateDefs, type NumberStatus, type TemplateStatus, type VerificationStatus } from '@/lib/store/comms'
import { INTAKE_FIELDS, INTAKE_TEMPLATE_TEXT, buildMetaPayload, type InboundMessage, type SandboxMessage } from '@/lib/whatsapp'

const jsonFetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json() as Promise<{ messages: InboundMessage[] }>)

/* Pulls messages the webhook has queued and files them as intake drafts, manual-entry items or job replies. */
export function InboundSync() {
  const enabled = useMasterStore(m => m.flags.C)
  const ingest = useOperationsStore(s => s.ingestInbound)
  useSWR(enabled ? '/api/whatsapp/inbox' : null, jsonFetcher, {
    refreshInterval: 5000,
    onSuccess: data => {
      if (!data.messages?.length) return
      const result = ingest(data.messages)
      if (result.drafts + result.manual + result.replies > 0) toast.success(summaryText(result))
    },
  })
  return null
}

export const summaryText = (r: IngestSummary) => {
  const parts = [
    r.drafts && `${r.drafts} intake draft${r.drafts > 1 ? 's' : ''}`,
    r.manual && `${r.manual} for manual entry`,
    r.replies && `${r.replies} customer repl${r.replies > 1 ? 'ies' : 'y'}`,
    r.duplicates && `${r.duplicates} duplicate${r.duplicates > 1 ? 's' : ''} ignored`,
  ].filter(Boolean)
  return parts.length ? `WhatsApp: ${parts.join(', ')}` : 'No messages'
}

const tabs = [
  { href: '/communication/notifications', label: 'Notifications' },
  { href: '/communication/replies', label: 'Customer replies', whatsapp: true },
  { href: '/communication/sandbox', label: 'WhatsApp sandbox', whatsapp: true },
  { href: '/communication/usage', label: 'Usage' },
]

export function CommsTabs() {
  const pathname = usePathname()
  const on = useMasterStore(m => m.flags.C)
  return (
    <nav className="tabs underline" aria-label="Communication sections">
      {tabs.filter(t => on || !t.whatsapp).map(t => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : ''} aria-current={pathname === t.href ? 'page' : undefined}>{t.label}</Link>
      ))}
    </nav>
  )
}

const numberTone = { Active: 'green', Restricted: 'orange', Suspended: 'red' } as const
const verifyTone = { Verified: 'green', Pending: 'orange', 'Not verified': 'red' } as const

/* Settings: the single dedicated ChargeSini number, its health, and the controls that exercise every failure state. */
export function ChannelStatusPanel() {
  const on = useMasterStore(m => m.flags.C)
  const wa = useWhatsAppStore()
  if (!on) return null
  return (
    <section className="card settings-block" aria-labelledby="channel-status-title">
      <div className="block-head"><h2 id="channel-status-title">WhatsApp channel status</h2><button className="button secondary sm" onClick={() => { wa.resetChannel(); toast.success('Channel reset to healthy') }}>Reset to healthy</button></div>
      <p className="muted">One dedicated ChargeSini number handles intake, short alerts and ready notices. Documents always go by email.</p>
      <div className="kv-grid">
        <div><small>Number</small><strong className="mono">{CHARGESINI_NUMBER}</strong></div>
        <div><small>Number status</small><StatusPill tone={numberTone[wa.numberStatus]}>{wa.numberStatus}</StatusPill>
          <select aria-label="Number status" value={wa.numberStatus} onChange={e => wa.setNumberStatus(e.target.value as NumberStatus)}>{(['Active', 'Restricted', 'Suspended'] as const).map(s => <option key={s}>{s}</option>)}</select></div>
        <div><small>Business verification</small><StatusPill tone={verifyTone[wa.verification]}>{wa.verification}</StatusPill>
          <select aria-label="Business verification" value={wa.verification} onChange={e => wa.setVerification(e.target.value as VerificationStatus)}>{(['Verified', 'Pending', 'Not verified'] as const).map(s => <option key={s}>{s}</option>)}</select></div>
        <div><small>Webhook</small><strong className="mono">/api/whatsapp/webhook</strong></div>
      </div>

      <h3>Message templates</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>Template</th><th>Type</th><th>Meta status</th></tr></thead>
        <tbody>{templateDefs.map(t => (
          <tr key={t.name}><td>{t.name}</td><td>{t.kind === 'alert' ? 'Short alert' : 'Ready notice'}</td>
            <td><StatusPill tone={wa.templateStatus[t.name] === 'Approved' ? 'green' : wa.templateStatus[t.name] === 'Pending' ? 'orange' : 'red'}>{wa.templateStatus[t.name]}</StatusPill>{' '}
              <select aria-label={`${t.name} status`} value={wa.templateStatus[t.name]} onChange={e => wa.setTemplateStatus(t.name, e.target.value as TemplateStatus)}>{(['Approved', 'Pending', 'Rejected'] as const).map(s => <option key={s}>{s}</option>)}</select></td></tr>))}
        </tbody></table></div>

      <div className="flag-list">
        <label className="flag-row"><input type="checkbox" checked={wa.parallelRun} onChange={e => wa.setParallelRun(e.target.checked)} />
          <span><strong>Parallel run</strong><span className="muted"> Alerts also go by email while WhatsApp is proven. Turn off to rely on WhatsApp alone.</span></span></label>
        <label className="flag-row"><input type="checkbox" checked={wa.failNextDelivery} onChange={e => wa.armDeliveryFailure(e.target.checked)} />
          <span><strong>Fail the next WhatsApp delivery</strong><span className="muted"> Test control. The next send is recorded as failed and falls back to email.</span></span></label>
      </div>

      <h3>Intake template</h3>
      <p className="muted">Customers send this exactly. All six fields are needed for an intake draft; anything else lands in Manual entry needed.</p>
      <pre className="code-block">{INTAKE_TEMPLATE_TEXT}</pre>
    </section>
  )
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
      const payload = buildMetaPayload({ from: sender.phone, name: sender.name, phoneNumberId: SANDBOX_PHONE_NUMBER_ID, displayNumber: CHARGESINI_NUMBER, message })
      const res = await fetch('/api/whatsapp/webhook?dryRun=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
      const data = (await res.json()) as { messages: InboundMessage[] }
      const result = ingest(data.messages)
      const outcome = summaryText(result).replace('WhatsApp: ', '')
      const tone = result.drafts ? 'green' : result.replies ? 'blue' : result.duplicates ? 'grey' : 'orange'
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
      <p className="helper-banner">Messages are posted to the real webhook parser in dry-run mode, so no Meta credentials are needed. Results land in Pending intake or on the matching job.</p>
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

      <section className="card settings-block" aria-live="polite">
        <h2>Results</h2>
        {log.length ? (
          <ul className="plain-list">{log.map(l => <li key={l.id}>{l.at} · {l.sent} <StatusPill tone={l.tone}>{l.outcome}</StatusPill></li>)}</ul>
        ) : <p className="muted">Nothing sent yet.</p>}
        <div className="button-row"><Link className="button secondary" href="/intake">Open Pending intake</Link><Link className="button secondary" href="/communication/replies">Open customer replies</Link></div>
      </section>
    </div>
  )
}
