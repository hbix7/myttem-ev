'use client'
import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { CalendarCheck, CalendarClock, Clock, Phone, X } from 'lucide-react'
import { useHydrated } from '@/components/shared'
import { AvailabilityCalendar } from '@/components/availability-calendar'
import { useStore } from '@/lib/store'
import { useOperationsStore } from '@/lib/store/operations'
import { useSchedEnv } from '@/lib/use-sched-env'
import { getNow } from '@/lib/clock'
import { addDays, fmtDate, todayMy } from '@/lib/scheduling'
import { suggestDates } from '@/lib/suggest'
import type { BookingOptions } from '@/lib/types'

const SLOT_LABELS = ['Preferred', 'Alternative 1', 'Alternative 2', 'Alternative 3']
const SHORT_DATE = { weekday: 'short', day: 'numeric', month: 'short' } as const
const LONG_DATE = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } as const

function Shell({ principal, children }: { principal?: string; children: ReactNode }) {
  return (
    <main className="bk-page">
      <div className="bk-shell">
        <header className="bk-brand">
          <span className="brand-mark" aria-hidden="true">m</span>
          <div>
            <strong>myttem</strong>
            {principal && <small>EV installation for {principal}</small>}
          </div>
        </header>
        {children}
        <p className="bk-help">
          <Phone size={14} aria-hidden="true" />
          Need help? Call us on <a href="tel:0300000000">03-0000 0000</a>
        </p>
      </div>
    </main>
  )
}

function Message({ icon, tone, title, children }: { icon: ReactNode; tone: 'green' | 'blue' | 'amber'; title: string; children: ReactNode }) {
  return (
    <section className="bk-card bk-message" aria-live="polite">
      <span className={`bk-icon tone-${tone}`}>{icon}</span>
      <h1>{title}</h1>
      {children}
    </section>
  )
}

export default function BookingPage() {
  const { token } = useParams<{ token: string }>()
  const hydrated = useHydrated()
  const env = useSchedEnv()
  const submit = useOperationsStore(s => s.submitBooking)
  const principals = useStore(s => s.principals)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')

  const parent = env.jobs.find(j => j.ev?.bookingToken === token)
  const installJob = env.jobs.find(j => j.id === parent?.ev?.installJobId)
  const today = todayMy(getNow())
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i + 1)), [today])
  const suggestions = useMemo(() => (installJob ? suggestDates(env, installJob, days, today) : []), [env, installJob, days, today])
  const byDate = useMemo(() => Object.fromEntries(suggestions.map(s => [s.date, s])), [suggestions])

  if (!hydrated) return null

  if (!parent || !installJob) {
    return (
      <Shell>
        <Message icon={<Clock size={22} />} tone="amber" title="This link isn't active yet">
          <p>Booking opens once your payment has been confirmed. We will let you know as soon as it is ready.</p>
        </Message>
      </Shell>
    )
  }

  const customer = env.customers.find(c => c.id === parent.customerId)?.name || ''
  const principal = principals.find(p => p.id === parent.principalId)?.name || ''

  if (installJob.scheduleState === 'Confirmed' && installJob.scheduledAt) {
    return (
      <Shell principal={principal}>
        <Message icon={<CalendarCheck size={22} />} tone="green" title="Your installation is confirmed">
          <p className="bk-date-hero">{fmtDate(installJob.scheduledAt.slice(0, 10), LONG_DATE)}</p>
          <p>To reschedule or cancel, please give us a call.</p>
        </Message>
      </Shell>
    )
  }

  if (installJob.scheduleState === 'Draft' && installJob.bookingOptions) {
    const o = installJob.bookingOptions
    const sent = [o.preferred, ...o.options]
    return (
      <Shell principal={principal}>
        <Message icon={<CalendarClock size={22} />} tone="blue" title="We have your preferred dates">
          <p>Our team will confirm one of these shortly. You will hear from us once it is booked.</p>
          <ol className="bk-sent">
            {sent.map((d, i) => (
              <li key={d}>
                <span>{SLOT_LABELS[i]}</span>
                <strong>{fmtDate(d, SHORT_DATE)}</strong>
              </li>
            ))}
          </ol>
          <p className="muted">Need to change them? Please give us a call.</p>
        </Message>
      </Shell>
    )
  }

  const remaining = 4 - picked.length

  const toggle = (d: string) => {
    setError('')
    setPicked(p => (p.includes(d) ? p.filter(x => x !== d) : p.length >= 4 ? p : [...p, d]))
  }
  const confirm = () => {
    if (picked.length !== 4) return setError('Please choose 4 dates: your preferred date first, then 3 alternatives.')
    const [preferred, ...options] = picked
    const available = picked.find(d => byDate[d]?.rating !== 'Not available')
    if (!available) return setError('None of these dates are available. Please choose different dates.')
    const best = suggestions.find(s => s.rating === 'Recommended')?.date
    const bookingOptions: BookingOptions = { preferred, options: options as BookingOptions['options'], recommended: best }
    const r = submit(token, bookingOptions, available)
    setError(r.ok ? '' : r.message)
  }

  return (
    <Shell principal={principal}>
      <section className="bk-card">
        <div className="bk-title">
          <h1>Choose your installation dates</h1>
          <p className="bk-meta">
            {customer && <span>{customer}</span>}
            <span className="chip mono">{parent.jobNo}</span>
          </p>
        </div>

        <ol className="bk-steps">
          <li><b>1</b>Tap the date you would like most. This is your preferred date.</li>
          <li><b>2</b>Tap 3 more dates as alternatives.</li>
          <li><b>3</b>Send them to us and we will confirm one.</li>
        </ol>

        <div className="bk-slots" role="group" aria-label="Your chosen dates">
          {SLOT_LABELS.map((label, i) => {
            const d = picked[i]
            return (
              <div key={label} className={`bk-slot${d ? ' filled' : ''}${i === picked.length ? ' next' : ''}${i === 0 ? ' first' : ''}`}>
                <span className="bk-slot-label">{label}</span>
                {d ? (
                  <>
                    <strong>{fmtDate(d, SHORT_DATE)}</strong>
                    <button type="button" className="bk-slot-clear" aria-label={`Remove ${label}: ${fmtDate(d, SHORT_DATE)}`} onClick={() => toggle(d)}><X size={12} /></button>
                  </>
                ) : (
                  <span className="bk-slot-empty">{i === picked.length ? 'Pick a date' : 'Not chosen'}</span>
                )}
              </div>
            )
          })}
        </div>

        <AvailabilityCalendar variant="customer" suggestions={suggestions} picks={picked} onPick={s => toggle(s.date)} />

        {error && <p role="alert" className="booking-error">{error}</p>}

        <button type="button" className="button primary full bk-submit" onClick={confirm} disabled={remaining > 0}>
          {remaining > 0 ? `Choose ${remaining} more ${remaining === 1 ? 'date' : 'dates'}` : 'Send my dates'}
        </button>
      </section>
    </Shell>
  )
}
