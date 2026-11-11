'use client'
import { Plug, Save } from 'lucide-react'
import { AppShell, PageHeader, useHydrated } from '@/components/shared'
import { ChannelHealthPanel, ChannelStatusCard, WhatsAppChannelSettings, useChannelForm } from '@/components/whatsapp-channel'

export default function WhatsAppChannelPage() {
  const hydrated = useHydrated()
  const form = useChannelForm()
  return (
    <AppShell crumb="Settings">
      <PageHeader
        title="WhatsApp Channel"
        crumb="Settings"
        action={
          <>
            <button className="button secondary" onClick={form.test}><Plug size={16} aria-hidden /> Test connection</button>
            <button className="button primary" onClick={form.save}><Save size={16} aria-hidden /> Save</button>
          </>
        }
      />
      {hydrated && (
        <section className="content">
          <ChannelStatusCard config={form.draft} />
          <WhatsAppChannelSettings draft={form.draft} setDraft={form.setDraft} secrets={form.secrets} setSecrets={form.setSecrets} />
          <ChannelHealthPanel />
        </section>
      )}
    </AppShell>
  )
}
