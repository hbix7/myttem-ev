'use client'
import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useOperationsStore } from '@/lib/store/operations'
import { useSchedEnv } from '@/lib/use-sched-env'
import { getNow } from '@/lib/clock'
import { addDays, fmtDate, todayMy } from '@/lib/scheduling'
import { suggestDates, type Rating } from '@/lib/suggest'
import type { BookingOptions } from '@/lib/types'

const RATING_COPY: Record<Rating, string> = { Recommended: 'Best fit', Possible: 'Available', 'Not available': 'Fully booked' }

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
  const byDate = Object.fromEntries(suggestions.map(s => [s.date, s]))

  if (!hydrated) return null
  if (!parent || !installJob) return <main className="booking-page"><h1>This link isn&apos;t active yet</h1><p>Payment must be confirmed before booking is available.</p></main>

  const customer = env.customers.find(c => c.id === parent.customerId)?.name || ''
  const principal = principals.find(p => p.id === parent.principalId)?.name || ''

  if (installJob.scheduleState === 'Confirmed' && installJob.scheduledAt) {
    return (
      <main className="booking-page">
        <div className="booking-logo">myttem</div>
        <h1>Your installation is confirmed for {fmtDate(installJob.scheduledAt.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</h1>
        <p>To reschedule or cancel, please call us on 03-0000 0000</p>
      </main>
    )
  }
  if (installJob.scheduleState === 'Draft' && installJob.bookingOptions) {
    const o = installJob.bookingOptions
    return (
      <main className="booking-page">
        <div className="booking-logo">myttem</div>
        <h1>We have your preferred dates</h1>
        <p>Our team will confirm one of these shortly: {[o.preferred, ...o.options].map(d => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })).join(', ')}.</p>
        <p>To change them, please call us on 03-0000 0000</p>
      </main>
    )
  }

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
    <main className="booking-page">
      <div className="booking-logo">myttem</div>
      <p>Principal: {principal}</p>
      <p>UPE: myttem EV</p>
      <h1>Choose your installation dates</h1>
      <p>{customer} · {parent.jobNo}</p>
      <p>Pick 4 dates. The first one you tap is your preferred date, the next three are alternatives. Our team will confirm one.</p>
      <div className="date-strip" role="group" aria-label="Installation dates">
        {days.map(d => {
          const s = byDate[d]
          const index = picked.indexOf(d)
          return (
            <button key={d} className={`${index >= 0 ? 'selected' : ''} ${s?.rating === 'Recommended' ? 'recommended' : ''}`} disabled={s?.rating === 'Not available'} aria-pressed={index >= 0} onClick={() => toggle(d)}>
              {fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}
              <small>{index >= 0 ? (index === 0 ? 'Preferred' : `Alternative ${index}`) : RATING_COPY[s?.rating ?? 'Possible']}</small>
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="booking-error">{error}</p>}
      <button className="button primary full" onClick={confirm}>Send my dates</button>
    </main>
  )
}
