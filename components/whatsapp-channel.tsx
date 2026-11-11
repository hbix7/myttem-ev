'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { StatusPill } from '@/components/shared'
import { useMasterStore } from '@/lib/store/master'
import { toE164, useWhatsAppStore, type ChannelConfig, type Provider } from '@/lib/store/whatsapp'
import { INTAKE_TEMPLATE_TEXT } from '@/lib/whatsapp'
import { templateDefs, type NumberStatus, type TemplateStatus, type VerificationStatus } from '@/lib/store/comms'

const numberTone = { Active: 'green', Restricted: 'orange', Suspended: 'red' } as const
const verifyTone = { Verified: 'green', Pending: 'orange', 'Not verified': 'red' } as const
const providerLabel: Record<Provider, string> = { mock: 'Mock (no external service)', twilio: 'Twilio', meta: 'Meta WhatsApp Business' }

type Secrets = { twilioToken: string; metaAccessToken: string; metaAppSecret: string; metaVerifyToken: string }
const noSecrets: Secrets = { twilioToken: '', metaAccessToken: '', metaAppSecret: '', metaVerifyToken: '' }

/* Reports what is missing for the chosen provider. The mock transport needs nothing. */
function missingFor(config: ChannelConfig, secrets: Secrets) {
  if (!/^\+\d{8,15}$/.test(config.businessNumber)) return ['a business number in E.164 format, for example +60312345678']
  if (config.provider === 'twilio') {
    return [
      !config.twilioSid.startsWith('AC') && 'a Twilio Account SID starting with AC',
      !config.twilioTokenStored && !secrets.twilioToken && 'a Twilio auth token',
    ].filter(Boolean) as string[]
  }
  if (config.provider === 'meta') {
    return [
      !config.metaWabaId && 'a WhatsApp Business Account ID',
      !config.metaPhoneNumberId && 'a phone number ID',
      !config.metaAccessTokenStored && !secrets.metaAccessToken && 'an access token',
      !config.metaAppSecretStored && !secrets.metaAppSecret && 'an app secret',
      !config.metaVerifyTokenStored && !secrets.metaVerifyToken && 'a webhook verify token',
    ].filter(Boolean) as string[]
  }
  return []
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="wa-field">
      <span className="wa-field-label">{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

export function WhatsAppChannelSettings({ draft, setDraft, secrets, setSecrets }: {
  draft: ChannelConfig; setDraft: (c: ChannelConfig) => void; secrets: Secrets; setSecrets: (s: Secrets) => void
}) {
  const patch = (p: Partial<ChannelConfig>) => setDraft({ ...draft, ...p, connection: 'disconnected' })
  const secretHint = (stored: boolean) => stored ? 'A token is stored. Enter a new value to replace it.' : 'No token stored.'
  return (
    <>
      <section className="card settings-block">
        <h2>Transport</h2>
        <div className="wa-grid">
          <Field label="Provider">
            <select value={draft.provider} onChange={e => patch({ provider: e.target.value as Provider })}>
              {(Object.keys(providerLabel) as Provider[]).map(p => <option key={p} value={p}>{providerLabel[p]}</option>)}
            </select>
          </Field>
          <Field label="Business number" hint="Saved in E.164. Spaces and a whatsapp: prefix are stripped.">
            <input inputMode="tel" value={draft.businessNumber} onChange={e => patch({ businessNumber: e.target.value })} onBlur={e => setDraft({ ...draft, businessNumber: toE164(e.target.value) })} />
          </Field>
        </div>
      </section>

      <section className="card settings-block">
        <h2>Twilio</h2>
        <div className="wa-grid">
          <Field label="Account SID"><input placeholder="AC..." value={draft.twilioSid} onChange={e => patch({ twilioSid: e.target.value.trim() })} autoComplete="off" /></Field>
          <Field label="Auth token" hint={secretHint(draft.twilioTokenStored)}>
            <input type="password" placeholder="Enter to replace" value={secrets.twilioToken} onChange={e => { setSecrets({ ...secrets, twilioToken: e.target.value }); setDraft({ ...draft, connection: 'disconnected' }) }} autoComplete="new-password" />
          </Field>
        </div>
      </section>

      <section className="card settings-block">
        <h2>Meta WhatsApp Business</h2>
        <p className="muted">Connect your existing WhatsApp Business Account through Meta. The webhook for inbound messages is <code className="mono">/api/whatsapp/webhook</code>.</p>
        <div className="wa-grid">
          <Field label="Business Account ID"><input value={draft.metaWabaId} onChange={e => patch({ metaWabaId: e.target.value.trim() })} autoComplete="off" /></Field>
          <Field label="Phone number ID"><input value={draft.metaPhoneNumberId} onChange={e => patch({ metaPhoneNumberId: e.target.value.trim() })} autoComplete="off" /></Field>
          <Field label="Access token" hint={secretHint(draft.metaAccessTokenStored)}>
            <input type="password" placeholder="Enter to replace" value={secrets.metaAccessToken} onChange={e => { setSecrets({ ...secrets, metaAccessToken: e.target.value }); setDraft({ ...draft, connection: 'disconnected' }) }} autoComplete="new-password" />
          </Field>
          <Field label="App secret" hint={secretHint(draft.metaAppSecretStored)}>
            <input type="password" placeholder="Enter to replace" value={secrets.metaAppSecret} onChange={e => { setSecrets({ ...secrets, metaAppSecret: e.target.value }); setDraft({ ...draft, connection: 'disconnected' }) }} autoComplete="new-password" />
          </Field>
          <Field label="Webhook verify token" hint={secretHint(draft.metaVerifyTokenStored)}>
            <input type="password" placeholder="Enter to replace" value={secrets.metaVerifyToken} onChange={e => { setSecrets({ ...secrets, metaVerifyToken: e.target.value }); setDraft({ ...draft, connection: 'disconnected' }) }} autoComplete="new-password" />
          </Field>
        </div>
      </section>
    </>
  )
}

/* Health controls and message templates that exercise every failure state. */
export function ChannelHealthPanel() {
  const wa = useWhatsAppStore()
  return (
    <section className="card settings-block" aria-labelledby="channel-health-title">
      <div className="block-head"><h2 id="channel-health-title">Number health and templates</h2><button className="button secondary sm" onClick={() => { wa.resetChannel(); toast.success('Channel reset to healthy') }}>Reset to healthy</button></div>
      <div className="kv-grid">
        <div><small>Number status</small><StatusPill tone={numberTone[wa.numberStatus]}>{wa.numberStatus}</StatusPill>
          <select aria-label="Number status" value={wa.numberStatus} onChange={e => wa.setNumberStatus(e.target.value as NumberStatus)}>{(['Active', 'Restricted', 'Suspended'] as const).map(s => <option key={s}>{s}</option>)}</select></div>
        <div><small>Business verification</small><StatusPill tone={verifyTone[wa.verification]}>{wa.verification}</StatusPill>
          <select aria-label="Business verification" value={wa.verification} onChange={e => wa.setVerification(e.target.value as VerificationStatus)}>{(['Verified', 'Pending', 'Not verified'] as const).map(s => <option key={s}>{s}</option>)}</select></div>
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

      <h3>Customer template for new enquiries</h3>
      <p className="muted">A customer who sends this exactly gets a job pre-filled. Any other first message still opens a conversation and creates a job from the message text.</p>
      <pre className="code-block">{INTAKE_TEMPLATE_TEXT}</pre>
    </section>
  )
}

/* Page body plus the header actions, kept together so Save and Test act on the same draft. */
export function useChannelForm() {
  const stored = useWhatsAppStore(w => w.config)
  const setConfig = useWhatsAppStore(w => w.setConfig)
  const [draft, setDraft] = useState<ChannelConfig>(stored)
  const [secrets, setSecrets] = useState<Secrets>(noSecrets)

  const withSecrets = (c: ChannelConfig): ChannelConfig => ({
    ...c,
    twilioTokenStored: c.twilioTokenStored || !!secrets.twilioToken,
    metaAccessTokenStored: c.metaAccessTokenStored || !!secrets.metaAccessToken,
    metaAppSecretStored: c.metaAppSecretStored || !!secrets.metaAppSecret,
    metaVerifyTokenStored: c.metaVerifyTokenStored || !!secrets.metaVerifyToken,
  })

  const save = () => {
    const next = withSecrets({ ...draft, businessNumber: toE164(draft.businessNumber) })
    setConfig(next)
    setDraft(next)
    setSecrets(noSecrets)
    toast.success('WhatsApp channel saved')
  }

  const test = () => {
    const next = withSecrets({ ...draft, businessNumber: toE164(draft.businessNumber) })
    const missing = missingFor(next, secrets)
    if (missing.length) {
      toast.error(`Cannot connect. Add ${missing.join(', ')}.`)
      return
    }
    const connected = { ...next, connection: 'connected' as const, testedAt: new Date().toISOString() }
    setConfig(connected)
    setDraft(connected)
    setSecrets(noSecrets)
    toast.success(next.provider === 'mock' ? 'Mock transport is ready. No external service is called.' : `${providerLabel[next.provider]} credentials are complete. Live delivery is checked by the first message.`)
  }

  return { draft, setDraft, secrets, setSecrets, save, test }
}

export function ChannelStatusCard({ config }: { config: ChannelConfig }) {
  const flag = useMasterStore(m => m.flags.C)
  return (
    <section className="card settings-block">
      <div className="block-head">
        <div>
          <h2>Channel status</h2>
          <p className="muted">Customers message <strong className="mono">{config.businessNumber}</strong>. Inbound messages are matched to this tenant by that number.</p>
        </div>
        <StatusPill tone={config.connection === 'connected' ? 'green' : 'grey'}>{config.connection}</StatusPill>
      </div>
      <p className="muted">WhatsApp allows free-form replies for 24 hours after a customer&apos;s last message. The current transport does not enforce that window, but the inbox still shows agents when it closes.</p>
      {!flag && <p className="muted">The WhatsApp channel is switched off. Enable Milestone C in Settings to receive messages.</p>}
    </section>
  )
}
