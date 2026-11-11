'use client'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell, PageHeader, useHydrated } from '@/components/shared'
import { WhatsAppInbox } from '@/components/whatsapp-inbox'

export default function WhatsAppInboxPage() {
  const hydrated = useHydrated()
  return (
    <AppShell crumb="Communication">
      <PageHeader
        title="WhatsApp Inbox"
        crumb="Communication"
        subtitle="Every new number opens a conversation and creates a job automatically."
        action={<button className="button secondary" onClick={() => toast.success('Inbox is up to date')}><RefreshCw size={16} aria-hidden /> Refresh</button>}
      />
      <section className="content">{hydrated && <WhatsAppInbox />}</section>
    </AppShell>
  )
}
