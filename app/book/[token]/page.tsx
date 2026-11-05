'use client'
import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useOperationsStore } from '@/lib/store/operations'
import { addDays, findTechForSlot, fmtDate, time12to24 } from '@/lib/scheduling'

const SLOTS = ['9:30 AM', '11:30 AM', '2:00 PM', '4:00 PM']
const FIRST_DAY = '2026-11-04'

export default function BookingPage() {
  const { token } = useParams<{ token: string }>()
  const hydrated = useHydrated()
  const jobs = useStore(s => s.jobs)
  const customers = useStore(s => s.customers)
  const principals = useStore(s => s.principals)
  const parent = jobs.find(j => j.ev?.bookingToken === token)
  const installJob = jobs.find(j => j.id === parent?.ev?.installJobId)
  const booking = parent && installJob ? { jobNo: parent.jobNo, customer: customers.find(c => c.id === parent.customerId)?.name || '', principal: principals.find(p => p.id === parent.principalId)?.name || '', status: installJob.scheduledAt ? 'Confirmed' : 'Link sent', date: installJob.scheduledAt?.slice(0, 10), time: installJob.scheduledAt ? new Date(installJob.scheduledAt).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }).toUpperCase() : '' } : undefined
  const users = useStore(s => s.users)
  const jobTypes = useStore(s => s.jobTypes)
  const capacity = useStore(s => s.settings.techDailyCapacity)
  const availability = useOperationsStore(s => s.techAvailability)
  const book = useOperationsStore(s => s.selfServiceBook)
  const [date, setDate] = useState(addDays(FIRST_DAY, 6))
  const [time, setTime] = useState(SLOTS[0])
  const [error, setError] = useState('')

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(FIRST_DAY, i)), [])
  const technicians = useMemo(() => users.filter(u => u.role === 'technician' && u.active), [users])
  const type = jobTypes.find(t => t.id === 'jt4')
  const freeTechs = (d: string, t12: string) => findTechForSlot({ technicians, date: d, time: time12to24(t12), type, jobs, jobTypes, capacity, availability }).free.length
  const dayOpen = (d: string) => SLOTS.some(s => freeTechs(d, s) > 0)

  if (!hydrated) return null
  if (!booking) return <main className="booking-page"><h1>This link isn&apos;t active yet</h1><p>Payment must be confirmed before booking is available.</p></main>
  if (booking.status === 'Confirmed') {
    return (
      <main className="booking-page">
        <div className="booking-logo">myttem</div>
        <h1>Your installation is confirmed for {booking.date ? fmtDate(booking.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''}, {booking.time}</h1>
        <p>To reschedule or cancel, please call us on 03-0000 0000</p>
      </main>
    )
  }

  const left = freeTechs(date, time)
  const confirm = () => {
    const r = book(token, date, time)
    setError(r.ok ? '' : r.message)
  }

  return (
    <main className="booking-page">
      <div className="booking-logo">myttem</div>
      <p>Principal: {booking.principal}</p>
      <p>UPE: myttem EV</p>
      <h1>Choose your installation date</h1>
      <p>{booking.customer} · {booking.jobNo}</p>
      <div className="date-strip" role="group" aria-label="Installation date">
        {days.map(d => (
          <button key={d} className={date === d ? 'selected' : ''} disabled={!dayOpen(d)} aria-pressed={date === d} onClick={() => { setDate(d); setError('') }}>
            {fmtDate(d, { weekday: 'short', day: 'numeric' })}
          </button>
        ))}
      </div>
      <div className="slot-grid" role="group" aria-label="Installation time">
        {SLOTS.map(s => {
          const n = freeTechs(date, s)
          return (
            <button key={s} className={time === s ? 'selected' : ''} disabled={n === 0} aria-pressed={time === s} onClick={() => { setTime(s); setError('') }}>
              {s}<small>{n === 0 ? 'Fully booked' : `${n} ${n === 1 ? 'slot' : 'slots'} left`}</small>
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="booking-error">{error}</p>}
      <button className="button primary full" disabled={left === 0} onClick={confirm}>Confirm installation</button>
    </main>
  )
}
