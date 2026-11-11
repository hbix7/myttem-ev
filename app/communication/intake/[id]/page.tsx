'use client'
import { use } from 'react'
import { AppShell, PageHeader, useHydrated } from '@/components/shared'
import { EmailDetail } from '@/components/intake'
import { useOperationsStore } from '@/lib/store/operations'

export default function EmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const hydrated = useHydrated()
  const subject = useOperationsStore(s => s.leads.find(l => l.id === id)?.subject)
  return (
    <AppShell crumb="Email intake">
      <PageHeader title={subject || 'Email request'} crumb="Email intake" />
      <section className="content">{hydrated && <EmailDetail id={id} />}</section>
    </AppShell>
  )
}
