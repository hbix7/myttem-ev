'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Lock, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell, PageHeader, useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useOperationsStore } from '@/lib/store/operations'
import { getNow } from '@/lib/clock'
import {
  DAY_END, DAY_START, LOCKED, SLOT_MINUTES, addDays, checkPlacement, dayOf, durationMinutes, fmtDate, fromMin, jobsOnDay, mondayOf, timeOf, toMin, todayMy, workDaysLabel,
  type TechAvailability, type Violation,
} from '@/lib/scheduling'
import type { Job, User } from '@/lib/types'

type View = 'Day' | 'Week'
type Pending = { job: Job; tech: User; date: string; time: string; violations: Violation[] }
type Hover = { techId: string; date: string; time: string }

const ROW = 28
const SLOTS = (DAY_END - DAY_START) / SLOT_MINUTES
const KIND_LABEL = { capacity: 'Over capacity', availability: 'Outside availability', 'double-booked': 'Double-booked' } as const

function useBrowserOnline() {
  return useSyncExternalStore(
    cb => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) } },
    () => navigator.onLine,
    () => true,
  )
}

function dayStatus(a: TechAvailability | undefined, date: string) {
  if (!a) return null
  if (a.daysOff.includes(date)) return 'On leave'
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay()
  return a.workDays.includes(wd) ? null : 'Day off'
}

function layout(list: Job[], durationOf: (j: Job) => number) {
  const items = list.map(job => { const start = toMin(timeOf(job.scheduledAt!)); return { job, start, end: start + durationOf(job), lane: 0, lanes: 1 } }).sort((a, b) => a.start - b.start)
  let cluster: typeof items = []
  let clusterEnd = 0
  const flush = () => { const n = Math.max(...cluster.map(c => c.lane)) + 1; cluster.forEach(c => { c.lanes = n }); cluster = []; clusterEnd = 0 }
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush()
    const used = cluster.filter(c => c.end > it.start).map(c => c.lane)
    let lane = 0
    while (used.includes(lane)) lane++
    it.lane = lane
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  if (cluster.length) flush()
  return items
}

export function SchedulerScreen() {
  const hydrated = useHydrated()
  if (!hydrated) return null
  return <Board />
}

function Board() {
  const jobs = useStore(s => s.jobs)
  const users = useStore(s => s.users)
  const jobTypes = useStore(s => s.jobTypes)
  const settings = useStore(s => s.settings)
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)?.role)
  const availability = useOperationsStore(s => s.techAvailability)
  const schedule = useOperationsStore(s => s.scheduleJob)
  const toggleLeave = useOperationsStore(s => s.toggleDayOff)
  const browserOnline = useBrowserOnline()

  const today = todayMy(getNow())
  const [view, setView] = useState<View>('Week')
  const [anchor, setAnchor] = useState(today)
  const [dragId, setDragId] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [manual, setManual] = useState<Job | null>(null)

  const techs = users.filter(u => u.role === 'technician' && u.active)
  const capacity = settings.techDailyCapacity
  const isAdmin = role === 'admin'
  const online = settings.deviceOnline && browserOnline
  const canMove = isAdmin && online
  const typeOf = (j: Job) => jobTypes.find(t => t.id === j.jobTypeId)
  const durationOf = (j: Job) => durationMinutes(typeOf(j))
  const days = view === 'Day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i))
  const unassigned = jobs.filter(j => j.status === 'Created')
  const dragged = dragId ? jobs.find(j => j.id === dragId) : undefined

  const check = (job: Job, tech: User, date: string, time: string) =>
    checkPlacement({ job, type: typeOf(job), tech, date, time, jobs, jobTypes, capacity, availability: availability[tech.id] })

  const suggest = (job: Job, tech: User, date: string) => {
    const weight = { availability: 100, 'double-booked': 10, capacity: 1 } as const
    let best = { time: availability[tech.id]?.workStart ?? '09:00', score: Infinity }
    for (let t = DAY_START; t + durationOf(job) <= DAY_END; t += SLOT_MINUTES) {
      const time = fromMin(t)
      const score = check(job, tech, date, time).reduce((n, v) => n + weight[v.kind], 0)
      if (score < best.score) best = { time, score }
      if (score === 0) break
    }
    return best.time
  }

  const place = (jobId: string, tech: User, date: string, time: string) => {
    setDragId(null)
    setHover(null)
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    if (job.technicianId === tech.id && job.scheduledAt && dayOf(job.scheduledAt) === date && timeOf(job.scheduledAt) === time) return
    const r = schedule(job.id, tech.id, date, time)
    if (r.ok) return void toast.success(`${job.jobNo} scheduled: ${tech.name.split(' ')[0]}, ${fmtDate(date)} ${time}`)
    if (r.reason === 'violations' && r.violations) return void setPending({ job, tech, date, time, violations: r.violations })
    toast.error(r.message)
  }

  const confirmOverride = (reason: string) => {
    if (!pending) return
    const r = schedule(pending.job.id, pending.tech.id, pending.date, pending.time, reason)
    if (r.ok) toast.success(`${pending.job.jobNo} saved with override. Reason written to job history.`)
    else toast.error(r.message)
    setPending(null)
  }

  const jobCardProps = (j: Job) => {
    const movable = canMove && !LOCKED.includes(j.status)
    return {
      draggable: movable,
      onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/plain', j.id); e.dataTransfer.effectAllowed = 'move'; setDragId(j.id) },
      onDragEnd: () => { setDragId(null); setHover(null) },
    }
  }
  const eventTitle = (j: Job) => `${j.jobNo}: ${j.subject}${j.schedulingOverride ? `\nOverride: ${j.schedulingOverride.reason}` : ''}`

  return (
    <AppShell crumb="Scheduler">
      <section className="page">
        <PageHeader
          title="Scheduler"
          crumb="Operations"
          action={<>
            <div className="segmented" role="group" aria-label="Calendar view">{(['Day', 'Week'] as const).map(v => <button key={v} className={view === v ? 'active' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>)}</div>
            <Link href="/jobs/new" className="button primary">+ New Job</Link>
          </>}
        />

        <div className="calendar-toolbar">
          <button className="button secondary" onClick={() => setAnchor(addDays(anchor, view === 'Day' ? -1 : -7))} aria-label="Previous"><ChevronLeft size={16} /></button>
          <button className="button secondary" onClick={() => setAnchor(today)}>Today</button>
          <button className="button secondary" onClick={() => setAnchor(addDays(anchor, view === 'Day' ? 1 : 7))} aria-label="Next"><ChevronRight size={16} /></button>
          <strong>{view === 'Day' ? fmtDate(anchor, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : `${fmtDate(days[0])} to ${fmtDate(days[6])}`}</strong>
          <span className="sch-spacer" />
          <span className={`sch-conn ${online ? 'on' : 'off'}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'Online' : 'Offline'}</span>
          <button className="button ghost" onClick={() => useStore.setState(s => ({ settings: { ...s.settings, deviceOnline: !s.settings.deviceOnline } }))}>{settings.deviceOnline ? 'Simulate offline' : 'Go back online'}</button>
        </div>

        {!isAdmin && <p className="sch-note"><Lock size={14} />View only. Only admins can schedule or override. Technicians cannot reschedule.</p>}
        {isAdmin && !online && <p className="sch-note warn"><WifiOff size={14} />You are offline. Scheduling changes need a connection, so moves are disabled until you reconnect.</p>}

        <div className="sch-board">
          <div className="sch-layout">
            <aside className="unassigned-rail" aria-label="Unassigned jobs">
              <p className="eyebrow">Unassigned jobs</p>
              <strong>{unassigned.length} to schedule</strong>
              {!unassigned.length && <small className="muted">Everything is assigned.</small>}
              {unassigned.map(j => (
                <div key={j.id} className="job-card unassigned" {...jobCardProps(j)}>
                  <code>{j.jobNo}</code><b>{j.subject}</b>
                  <small>{typeOf(j)?.name} · {durationOf(j) / 60}h</small>
                  {canMove && <button className="button secondary sm" onClick={() => setManual(j)}><CalendarClock size={14} />Schedule</button>}
                </div>
              ))}
              <div className="sch-legend">
                <span><i className="sw override" />Override applied</span>
                <span><i className="sw self" />Customer self-service</span>
                <span><i className="sw off" />Leave or outside hours</span>
              </div>
            </aside>

            <div className="calendar sch-cal">
              {view === 'Day' ? (
                <DayGrid
                  date={anchor} techs={techs} jobs={jobs} availability={availability} capacity={capacity} isAdmin={isAdmin} canMove={canMove} dragged={dragged} hover={hover}
                  durationOf={durationOf} check={check} jobCardProps={jobCardProps} eventTitle={eventTitle}
                  onHover={setHover} onDrop={(tech, date, time) => dragId && place(dragId, tech, date, time)}
                  onToggleLeave={(tech, date) => { const r = toggleLeave(tech.id, date); if (!r.ok) toast.error(r.message) }}
                />
              ) : (
                <WeekGrid
                  days={days} today={today} techs={techs} jobs={jobs} availability={availability} capacity={capacity} canMove={canMove} dragged={dragged} hover={hover}
                  check={check} suggest={suggest} jobCardProps={jobCardProps} eventTitle={eventTitle} durationOf={durationOf}
                  onHover={setHover} onDrop={(tech, date) => { const job = dragged; if (job) place(job.id, tech, date, suggest(job, tech, date)) }}
                  onOpenDay={d => { setAnchor(d); setView('Day') }}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {pending && <OverrideDialog pending={pending} onCancel={() => setPending(null)} onConfirm={confirmOverride} />}
      {manual && <ManualDialog job={manual} techs={techs} today={today} onCancel={() => setManual(null)} onSubmit={(tech, date, time) => { setManual(null); place(manual.id, tech, date, time) }} />}
    </AppShell>
  )
}

function TechHead({ tech, a, load, loadLabel, capacity, status }: { tech: User; a?: TechAvailability; load: number; loadLabel: string; capacity: number; status?: string | null }) {
  return (
    <div className="sch-tech">
      <strong>{tech.name}</strong>
      <small>{a ? `${a.workStart} to ${a.workEnd} · ${workDaysLabel(a)}` : 'No availability set'}</small>
      <small className={status ? 'sch-flagtext' : ''}>{status ?? 'Available'} · {loadLabel}</small>
      <div className={`sch-meter ${load >= capacity ? 'full' : ''}`} aria-hidden><i style={{ width: `${Math.min(100, (load / capacity) * 100)}%` }} /></div>
    </div>
  )
}

type GridCommon = {
  techs: User[]; jobs: Job[]; availability: Record<string, TechAvailability>; capacity: number; canMove: boolean; dragged?: Job; hover: Hover | null
  check: (job: Job, tech: User, date: string, time: string) => Violation[]
  jobCardProps: (j: Job) => object; eventTitle: (j: Job) => string; durationOf: (j: Job) => number
  onHover: (h: Hover | null) => void
}

function DayGrid(p: GridCommon & { date: string; isAdmin: boolean; onDrop: (tech: User, date: string, time: string) => void; onToggleLeave: (tech: User, date: string) => void }) {
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i)
  return (
    <div className="sch-day" style={{ gridTemplateColumns: `56px repeat(${p.techs.length}, minmax(200px, 1fr))` }}>
      <div className="sch-head-corner" />
      {p.techs.map(t => {
        const a = p.availability[t.id]
        const count = jobsOnDay(p.jobs, t.id, p.date).length
        return (
          <div key={t.id} className="sch-head-cell">
            <TechHead tech={t} a={a} load={count} capacity={p.capacity} status={dayStatus(a, p.date)} loadLabel={`${count} of ${p.capacity} jobs`} />
            {p.isAdmin && <button className="button ghost sm" onClick={() => p.onToggleLeave(t, p.date)}>{a?.daysOff.includes(p.date) ? 'Clear leave' : 'Mark leave'}</button>}
          </div>
        )
      })}
      <div className="sch-times" style={{ height: SLOTS * ROW }}>{hours.map((h, i) => <span key={h} style={{ top: i * 2 * ROW }}>{String(h).padStart(2, '0')}:00</span>)}</div>
      {p.techs.map(t => {
        const a = p.availability[t.id]
        const status = dayStatus(a, p.date)
        const events = layout(jobsOnDay(p.jobs, t.id, p.date), p.durationOf)
        const ghost = p.hover && p.hover.techId === t.id && p.hover.date === p.date && p.dragged ? { time: p.hover.time, violations: p.check(p.dragged, t, p.date, p.hover.time) } : null
        return (
          <div
            key={t.id}
            className="sch-col"
            style={{ height: SLOTS * ROW }}
            onDragOver={e => {
              if (!p.dragged || !p.canMove) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const slot = Math.min(SLOTS - 1, Math.max(0, Math.floor((e.clientY - r.top) / ROW)))
              const time = fromMin(DAY_START + slot * SLOT_MINUTES)
              if (!p.hover || p.hover.techId !== t.id || p.hover.date !== p.date || p.hover.time !== time) p.onHover({ techId: t.id, date: p.date, time })
            }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) p.onHover(null) }}
            onDrop={e => { e.preventDefault(); if (p.hover) p.onDrop(t, p.hover.date, p.hover.time) }}
          >
            {status && <div className="sch-off" style={{ top: 0, bottom: 0 }}><span>{status}</span></div>}
            {!status && a && toMin(a.workStart) > DAY_START && <div className="sch-off" style={{ top: 0, height: ((toMin(a.workStart) - DAY_START) / SLOT_MINUTES) * ROW }} />}
            {!status && a && toMin(a.workEnd) < DAY_END && <div className="sch-off" style={{ bottom: 0, height: ((DAY_END - toMin(a.workEnd)) / SLOT_MINUTES) * ROW }} />}
            {events.map(({ job, start, end, lane, lanes }) => (
              <Link
                key={job.id} href={`/jobs/${job.id}`} title={p.eventTitle(job)} {...p.jobCardProps(job)}
                className={`sch-ev ${job.schedulingOverride ? 'override' : ''} ${job.selfService ? 'self' : ''} ${LOCKED.includes(job.status) ? 'locked' : ''}`}
                style={{ top: ((start - DAY_START) / SLOT_MINUTES) * ROW, height: ((end - start) / SLOT_MINUTES) * ROW - 2, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
              >
                <code>{job.jobNo}</code>
                <span>{job.subject}</span>
                <small>{fromMin(start)} to {fromMin(end)}</small>
                {job.schedulingOverride && <em className="sch-flag"><AlertTriangle size={11} />Override: {job.schedulingOverride.reason}</em>}
                {job.selfService && <em className="sch-flag self">Self-service</em>}
              </Link>
            ))}
            {ghost && p.dragged && (
              <div className={`sch-ghost ${ghost.violations.length ? 'warn' : 'ok'}`} style={{ top: ((toMin(ghost.time) - DAY_START) / SLOT_MINUTES) * ROW, height: (p.durationOf(p.dragged) / SLOT_MINUTES) * ROW - 2 }}>
                <b>{ghost.time}</b>
                <span>{ghost.violations.length ? ghost.violations.map(v => KIND_LABEL[v.kind]).join(', ') : 'Fits'}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WeekGrid(p: GridCommon & { days: string[]; today: string; suggest: (job: Job, tech: User, date: string) => string; onDrop: (tech: User, date: string) => void; onOpenDay: (date: string) => void }) {
  return (
    <div className="sch-week" style={{ gridTemplateColumns: `120px repeat(${p.techs.length}, minmax(190px, 1fr))` }}>
      <div className="sch-head-corner" />
      {p.techs.map(t => {
        const weekCount = p.days.reduce((n, d) => n + jobsOnDay(p.jobs, t.id, d).length, 0)
        return <div key={t.id} className="sch-head-cell"><TechHead tech={t} a={p.availability[t.id]} load={weekCount} capacity={p.capacity * 5} loadLabel={`${weekCount} jobs this week`} /></div>
      })}
      {p.days.map(d => (
        <WeekRow key={d} date={d} isToday={d === p.today} {...p} />
      ))}
    </div>
  )
}

function WeekRow(p: Parameters<typeof WeekGrid>[0] & { date: string; isToday: boolean }) {
  return (
    <>
      <div className={`sch-daylabel ${p.isToday ? 'today' : ''}`}>
        <button className="link-button" onClick={() => p.onOpenDay(p.date)}>{fmtDate(p.date, { weekday: 'short' })}<br /><span>{fmtDate(p.date, { day: 'numeric', month: 'short' })}</span></button>
      </div>
      {p.techs.map(t => {
        const a = p.availability[t.id]
        const status = dayStatus(a, p.date)
        const list = layout(jobsOnDay(p.jobs, t.id, p.date), p.durationOf).map(x => x.job)
        const over = list.length > p.capacity
        const preview = p.hover && p.hover.techId === t.id && p.hover.date === p.date && p.dragged
          ? p.check(p.dragged, t, p.date, p.suggest(p.dragged, t, p.date)) : null
        return (
          <div
            key={`${t.id}-${p.date}`}
            className={`sch-cell ${status ? 'off' : ''} ${p.isToday ? 'today' : ''} ${preview ? (preview.length ? 'warn' : 'ok') : ''}`}
            onDragOver={e => { if (!p.dragged || !p.canMove) return; e.preventDefault(); if (!p.hover || p.hover.techId !== t.id || p.hover.date !== p.date) p.onHover({ techId: t.id, date: p.date, time: '' }) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) p.onHover(null) }}
            onDrop={e => { e.preventDefault(); p.onDrop(t, p.date) }}
          >
            <div className="sch-cell-top">
              <span className={`sch-load ${over || list.length === p.capacity ? 'full' : ''}`}>{list.length}/{p.capacity} jobs</span>
              {status && <span className="sch-off-tag">{status}</span>}
            </div>
            {list.map(job => (
              <Link
                key={job.id} href={`/jobs/${job.id}`} title={p.eventTitle(job)} {...p.jobCardProps(job)}
                className={`sch-chip ${job.schedulingOverride ? 'override' : ''} ${job.selfService ? 'self' : ''} ${LOCKED.includes(job.status) ? 'locked' : ''}`}
              >
                <code>{job.jobNo}</code>
                <span>{timeOf(job.scheduledAt!)} · {job.subject}</span>
                {job.schedulingOverride && <em className="sch-flag"><AlertTriangle size={11} />Override: {job.schedulingOverride.reason}</em>}
                {job.selfService && <em className="sch-flag self">Self-service</em>}
              </Link>
            ))}
            {preview && !!preview.length && <small className="sch-preview">{preview[0].message}</small>}
          </div>
        )
      })}
    </>
  )
}

function OverrideDialog({ pending, onCancel, onConfirm }: { pending: Pending; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const valid = reason.trim().length >= 5
  return (
    <div className="modal-backdrop" onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="override-title">
        <h2 id="override-title" className="sch-dialog-title"><AlertTriangle size={18} />Scheduling rule broken</h2>
        <p className="muted">{pending.job.jobNo} to {pending.tech.name}, {fmtDate(pending.date)} at {pending.time}.</p>
        <ul className="sch-violations">{pending.violations.map(v => <li key={v.kind}><strong>{KIND_LABEL[v.kind]}</strong><span>{v.message}</span></li>)}</ul>
        {pending.job.selfService && <p className="sch-note warn">This is a customer self-service booking. Customers cannot exceed these limits, so only an admin can override.</p>}
        <label>Reason for override (required)
          <textarea ref={ref} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: customer emergency, technician agreed to extra hours" />
        </label>
        <p className="muted sch-hint">The assignment is saved. The override and your reason are written to the job history and highlighted on the calendar.</p>
        <div className="modal-footer">
          <button className="button secondary" onClick={onCancel}>Cancel</button>
          <button className="button danger" disabled={!valid} onClick={() => onConfirm(reason.trim())}>Override anyway</button>
        </div>
      </div>
    </div>
  )
}

function ManualDialog({ job, techs, today, onCancel, onSubmit }: { job: Job; techs: User[]; today: string; onCancel: () => void; onSubmit: (tech: User, date: string, time: string) => void }) {
  const [techId, setTechId] = useState(techs[0]?.id ?? '')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('09:00')
  const times = Array.from({ length: SLOTS }, (_, i) => fromMin(DAY_START + i * SLOT_MINUTES))
  return (
    <div className="modal-backdrop" onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <h2 id="manual-title">Schedule {job.jobNo}</h2>
        <p className="muted">{job.subject}</p>
        <label>Technician<select className="field-input" value={techId} onChange={e => setTechId(e.target.value)}>{techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Date<input className="field-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Start time<select className="field-input" value={time} onChange={e => setTime(e.target.value)}>{times.map(t => <option key={t}>{t}</option>)}</select></label>
        <div className="modal-footer">
          <button className="button secondary" onClick={onCancel}>Cancel</button>
          <button className="button primary" disabled={!date || !techId} onClick={() => onSubmit(techs.find(t => t.id === techId)!, date, time)}>Schedule</button>
        </div>
      </div>
    </div>
  )
}
