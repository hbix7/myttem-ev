'use client'
import { AppShell, PageHeader, useHydrated } from '@/components/shared'
import { EmailIntake } from '@/components/intake'

export default function EmailIntakePage() {
  const hydrated = useHydrated()
  return (
    <AppShell crumb="Communication">
      <PageHeader title="Email intake" crumb="Communication" />
      <section className="content">{hydrated && <EmailIntake />}</section>
    </AppShell>
  )
}
