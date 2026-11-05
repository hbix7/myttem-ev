'use client'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { AppShell, EmptyState, PageHeader, StatusPill, useHydrated } from '@/components/shared'
import { CommsTabs } from '@/components/comms'
import { useStore } from '@/lib/store'
import { useMasterStore } from '@/lib/store/master'
import { useWhatsAppStore } from '@/lib/store/whatsapp'

export default function RepliesPage() {
  const hydrated = useHydrated()
  const jobs = useStore(s => s.jobs)
  const on = useMasterStore(m => m.flags.C)
  const replies = useWhatsAppStore(w => w.replies)
  const markResponded = useWhatsAppStore(w => w.markResponded)
  const [notes, setNotes] = useState<Record<string, string>>({})
  if (!hydrated) return null
  const sorted = [...replies].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <AppShell crumb="Communication">
      <PageHeader title="Customer replies" crumb="Communication" />
      <section className="content">
        <CommsTabs />
        {!on ? <EmptyState title="WhatsApp is off" helper="Customer replies arrive over WhatsApp. Enable Milestone C in Settings to receive them." /> : (
          <>
            <p className="helper-banner">Replies are answered by phone or WhatsApp. This is not a chat inbox.</p>
            <div className="stack">
              {sorted.length === 0 && <EmptyState title="No replies yet" helper="Customer messages that match a job with a known phone number show up here." />}
              {sorted.map(r => {
                const job = jobs.find(j => j.id === r.jobId)
                return (
                  <article className="reply-card" key={r.id}>
                    <div className="reply-top">
                      <div>
                        <Link href={`/jobs/${r.jobId}`} className="eyebrow">{job?.jobNo ?? r.jobId}</Link>
                        <p>{r.message}</p>
                        <small>{new Date(r.at).toLocaleString('en-MY')}</small>
                      </div>
                      <StatusPill>{r.responded ? 'Responded' : 'Awaiting response'}</StatusPill>
                    </div>
                    {!r.responded && (
                      <div className="reply-action">
                        <input placeholder="Log call / WhatsApp reply" aria-label="Reply note" value={notes[r.id] ?? ''} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} />
                        <button className="button primary" onClick={() => { markResponded(r.id); toast.success('Reply marked responded') }}>Mark responded</button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </>
        )}
      </section>
    </AppShell>
  )
}
