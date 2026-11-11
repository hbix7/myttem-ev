'use client'
import { AppShell, PageHeader, useHydrated } from '@/components/shared'
import { CommsTabs } from '@/components/comms'
import { EmailIntake } from '@/components/intake'

export default function PendingIntakePage() {
  const hydrated = useHydrated()
  return (
    <AppShell crumb="Communication">
      <PageHeader title="Pending intake" crumb="Communication" />
      <section className="content">
        <CommsTabs />
        {hydrated && <EmailIntake />}
      </section>
    </AppShell>
  )
}
