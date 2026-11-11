'use client'
import { AppShell, PageHeader, useHydrated } from '@/components/shared'
import { WhatsAppSandbox } from '@/components/comms'

export default function SandboxPage() {
  const hydrated = useHydrated()
  if (!hydrated) return null
  return (
    <AppShell crumb="Communication">
      <PageHeader title="WhatsApp sandbox" crumb="Communication" subtitle="Simulate inbound WhatsApp messages without Meta credentials." />
      <section className="content">
        <WhatsAppSandbox />
      </section>
    </AppShell>
  )
}
