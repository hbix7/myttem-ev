'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Lock, Save, Undo2, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell, PageHeader, useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useOperationsStore } from '@/lib/store/operations'
import { useSchedEnv } from '@/lib/use-sched-env'
import { getNow } from '@/lib/clock'
import { BAND_LABEL, getTravelMinutes, isChillis, travelBand } from '@/lib/location'
import {
  DAY_END, DAY_START, LOCKED, SLOT_LABEL, SLOT_MINUTES, addDays, checkTeamPlacement, dayOf, firstFreeTime, fmtDate, fromMin, isBlocking, jobsOnTeamDay, minutesOf, mondayOf,
  slotOf, stamp, teamOfJob, timeOf, toMin, todayMy, travelNeighbours, type SchedEnv, type Violation,
} from '@/lib/scheduling'
import type { Job, SlotKind, Team } from '@/lib/types'

type View = 'Day' | 'Week'
type Draft = { teamId: string; date: string; time: string }
type PendingItem = { job: Job; team: Team; date: string; time: string; violations: Violation[] }
type Hover = { teamId: string; date: string; time: string }

const ROW = 28
const SLOTS = (DAY_END - DAY_START) / SLOT_MINUTES
const KIND_LABEL: Record<Violation['kind'], string> = {
  capacity: 'Over capacity', availability: 'Outside availability', 'double-booked': 'Double-booked', 'big-limit': 'Big job limit', 'slot-window': 'Outside slot window',
  travel: 'Travel too far', coverage: 'Outside coverage', priority: "Chilli's priority",
}

function useBrowserOnline() {
  return useSyncExternalStore(
    cb => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) } },
    () => navigator.onLine,
    () => true,
  )
}

function layout(list: Job[], minutes: (j: Job) => number) {
  const items = list.map(job => { const start = toMin(timeOf(job.scheduledAt!)); return { job, start, end: start + minutes(job), lane: 0, lanes: 1 } }).sort((a, b) => a.start - b.start)
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
  const baseEnv = useSchedEnv()
  const settings = useStore(s => s.settings)
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)?.role)
  const schedule = useOperationsStore(s => s.scheduleJob)
  const toggleLeave = useOperationsStore(s => s.toggleDayOff)
  const browserOnline = useBrowserOnline()

  const today = todayMy(getNow())
  const [view, setView] = useState<View>('Week')
  const [anchor, setAnchor] = useState(today)
  const [dragId, setDragId] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [pending, setPending] = useState<PendingItem[] | null>(null)
  const [manual, setManual] = useState<Job | null>(null)
  const [filters, setFilters] = useState({ type: '', size: '', principal: '', area: '' })

  const env: SchedEnv = useMemo(
    () => ({ ...baseEnv, jobs: baseEnv.jobs.map(j => { const d = drafts[j.id]; return d ? { ...j, teamId: d.teamId, scheduledAt: stamp(d.date, d.time), scheduleState: 'Draft' as const } : j }) }),
    [baseEnv, drafts],
  )
  const teams = env.teams.filter(t => t.active)
  const isAdmin = role === 'admin'
  const online = settings.deviceOnline && browserOnline
  const canMove = isAdmin && online
  const typeOf = (j: Job) => env.jobTypes.find(t => t.id === j.jobTypeId)
  const siteOf = (j: Job) => env.sites.find(s => s.id === j.siteId)
  const days = view === 'Day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i))
  const dragged = dragId ? env.jobs.find(j => j.id === dragId) : undefined
  const draftCount = Object.keys(drafts).length

  const unassigned = useMemo(() => {
    const list = baseEnv.jobs.filter(j => j.status === 'Created' && !j.scheduledAt && !drafts[j.id]).filter(j => {
      if (filters.type && j.jobTypeId !== filters.type) return false
      if (filters.size && slotOf(j, baseEnv.jobTypes) !== filters.size) return false
      if (filters.principal && j.principalId !== filters.principal) return false
      if (filters.area && baseEnv.sites.find(s => s.id === j.siteId)?.area !== filters.area) return false
      return true
    })
    const rank = (j: Job) => (isChillis(baseEnv.customers.find(c => c.id === j.customerId)) ? 0 : 1)
    const area = (j: Job) => baseEnv.sites.find(s => s.id === j.siteId)?.area ?? ''
    return list.sort((a, b) => rank(a) - rank(b) || area(a).localeCompare(area(b)) || a.createdAt.localeCompare(b.createdAt))
  }, [baseEnv, drafts, filters])
  const awaiting = baseEnv.jobs.filter(j => j.scheduleState === 'Draft' && j.scheduledAt && !drafts[j.id])
  const areas = Array.from(new Set(baseEnv.sites.map(s => s.area).filter(Boolean))).sort()

  useEffect(() => {
    if (!draftCount) return
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const linkGuard = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || !a.href.startsWith(window.location.origin)) return
      if (!window.confirm(`You have ${draftCount} unsaved scheduling ${draftCount === 1 ? 'change' : 'changes'}. Leave without saving?`)) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', linkGuard, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', linkGuard, true) }
  }, [draftCount])

  const check = (job: Job, team: Team, date: string, time: string) => checkTeamPlacement(env, job, team, date, time)

  const place = (jobId: string, team: Team, date: string, time: string) => {
    setDragId(null)
    setHover(null)
    const job = env.jobs.find(j => j.id === jobId)
    if (!job) return
    const current = job.scheduledAt && teamOfJob(job, env.teams) === team.id && dayOf(job.scheduledAt) === date && timeOf(job.scheduledAt) === time
    if (current && job.scheduleState !== 'Draft') return
    setDrafts(d => ({ ...d, [jobId]: { teamId: team.id, date, time } }))
    const v = check(job, team, date, time)
    const blocking = v.filter(isBlocking)
    if (blocking.length) toast.warning(`${job.jobNo} draft has ${blocking.length} rule ${blocking.length === 1 ? 'issue' : 'issues'}. Review them when you save.`)
  }

  const discard = () => setDrafts({})

  const saveAll = () => {
    const blocked: PendingItem[] = []
    const remaining: Record<string, Draft> = {}
    let saved = 0
    for (const [jobId, d] of Object.entries(drafts)) {
      const job = baseEnv.jobs.find(j => j.id === jobId)
      const team = baseEnv.teams.find(t => t.id === d.teamId)
      if (!job || !team) continue
      const r = schedule(jobId, d.teamId, d.date, d.time)
      if (r.ok) saved++
      else if (r.reason === 'violations' && r.violations) { blocked.push({ job, team, date: d.date, time: d.time, violations: r.violations }); remaining[jobId] = d }
      else { toast.error(`${job.jobNo}: ${r.message}`); remaining[jobId] = d }
    }
    setDrafts(remaining)
    if (saved) toast.success(`${saved} ${saved === 1 ? 'job' : 'jobs'} scheduled.`)
    if (blocked.length) setPending(blocked)
  }

  const confirmOverride = (reason: string) => {
    if (!pending) return
    const remaining = { ...drafts }
    for (const p of pending) {
      const r = schedule(p.job.id, p.team.id, p.date, p.time, reason)
      if (r.ok) delete remaining[p.job.id]
      else toast.error(`${p.job.jobNo}: ${r.message}`)
    }
    setDrafts(remaining)
    toast.success('Saved with override. The reason is written to each job history.')
    setPending(null)
  }

  const reviewAwaiting = (j: Job) => {
    const team = env.teams.find(t => t.id === teamOfJob(j, env.teams))
    if (team && j.scheduledAt) setDrafts(d => ({ ...d, [j.id]: { teamId: team.id, date: dayOf(j.scheduledAt!), time: timeOf(j.scheduledAt!) } }))
  }

  const jobCardProps = (j: Job) => {
    const movable = canMove && !LOCKED.includes(j.status)
    return {
      draggable: movable,
      onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/plain', j.id); e.dataTransfer.effectAllowed = 'move'; setDragId(j.id) },
      onDragEnd: () => { setDragId(null); setHover(null) },
    }
  }

  const common: GridCommon = { env, teams, canMove, dragged, hover, check, jobCardProps, onHover: setHover, siteOf, drafts }

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
        {draftCount > 0 && (
          <div className="sch-draftbar" role="status">
            <span><strong>{draftCount}</strong> unsaved {draftCount === 1 ? 'change' : 'changes'}. Nothing is booked until you save.</span>
            <span className="sch-spacer" />
            <button className="button secondary" onClick={discard}><Undo2 size={14} />Discard</button>
            <button className="button primary" onClick={saveAll} disabled={!canMove}><Save size={14} />Save schedule</button>
          </div>
        )}

        <div className="sch-board">
          <div className="sch-layout">
            <aside className="unassigned-rail" aria-label="Unassigned jobs">
              <p className="eyebrow">Unassigned jobs</p>
              <strong>{unassigned.length} to schedule</strong>
              <div className="sch-filters">
                <select className="field-input" aria-label="Filter by job type" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}><option value="">All job types</option>{env.jobTypes.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                <select className="field-input" aria-label="Filter by size" value={filters.size} onChange={e => setFilters(f => ({ ...f, size: e.target.value }))}><option value="">All sizes</option>{(['BIG', 'SMALL', 'ASSESSMENT'] as SlotKind[]).map(k => <option key={k} value={k}>{SLOT_LABEL[k]}</option>)}</select>
                <select className="field-input" aria-label="Filter by principal" value={filters.principal} onChange={e => setFilters(f => ({ ...f, principal: e.target.value }))}><option value="">All principals</option>{env.principals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select className="field-input" aria-label="Filter by area" value={filters.area} onChange={e => setFilters(f => ({ ...f, area: e.target.value }))}><option value="">All areas</option>{areas.map(a => <option key={a}>{a}</option>)}</select>
              </div>
              {!unassigned.length && <small className="muted">Nothing matches. Everything is assigned.</small>}
              {unassigned.map(j => {
                const slot = slotOf(j, env.jobTypes)
                const site = siteOf(j)
                const chillis = isChillis(env.customers.find(c => c.id === j.customerId))
                return (
                  <div key={j.id} className={`job-card unassigned slot-${slot}`} {...jobCardProps(j)}>
                    <div className="sch-tags"><code>{j.jobNo}</code><span className={`slot-tag slot-${slot}`}>{SLOT_LABEL[slot]}</span>{chillis && <span className="slot-tag chillis">Chilli&apos;s</span>}</div>
                    <b>{j.subject}</b>
                    <small>{typeOf(j)?.name} · {site?.area || 'No area'} · {minutesOf(j, env) / 60}h</small>
                    {canMove && <button className="button secondary sm" onClick={() => setManual(j)}><CalendarClock size={14} />Schedule</button>}
                  </div>
                )
              })}

              {awaiting.length > 0 && (
                <>
                  <p className="eyebrow sch-rail-gap">Awaiting confirmation</p>
                  {awaiting.map(j => (
                    <div key={j.id} className="job-card slot-SMALL">
                      <code>{j.jobNo}</code><b>{j.subject}</b>
                      <small>Customer asked for {fmtDate(dayOf(j.scheduledAt!))}</small>
                      {canMove && <button className="button secondary sm" onClick={() => reviewAwaiting(j)}>Review and confirm</button>}
                    </div>
                  ))}
                </>
              )}

              <div className="sch-legend">
                <span><i className="sw slot-BIG" />Big job (10:00 to 14:30)</span>
                <span><i className="sw slot-SMALL" />Small job (14:30 to 16:30)</span>
                <span><i className="sw slot-ASSESSMENT" />Assessment (10:00 to 12:00)</span>
                <span><i className="sw draft" />Unsaved draft</span>
                <span><i className="sw override" />Override applied</span>
                <span><i className="sw off" />Leave or outside hours</span>
              </div>
            </aside>

            <div className="calendar sch-cal">
              {!teams.length ? <p className="sch-empty">No active teams. Add one in Settings, Teams.</p> : view === 'Day' ? (
                <DayGrid
                  {...common} date={anchor} isAdmin={isAdmin}
                  onDrop={(team, date, time) => dragId && place(dragId, team, date, time)}
                  onToggleLeave={(userId, date) => { const r = toggleLeave(userId, date); if (!r.ok) toast.error(r.message) }}
                />
              ) : (
                <WeekGrid
                  {...common} days={days} today={today}
                  onDrop={(team, date) => { if (dragged) place(dragged.id, team, date, firstFreeTime(env, dragged, team, date).time) }}
                  onOpenDay={d => { setAnchor(d); setView('Day') }}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {pending && <OverrideDialog pending={pending} onCancel={() => setPending(null)} onConfirm={confirmOverride} />}
      {manual && <ManualDialog env={env} job={manual} teams={teams} today={today} onCancel={() => setManual(null)} onSubmit={(team, date, time) => { setManual(null); place(manual.id, team, date, time) }} />}
    </AppShell>
  )
}

type GridCommon = {
  env: SchedEnv; teams: Team[]; canMove: boolean; dragged?: Job; hover: Hover | null; drafts: Record<string, Draft>
  check: (job: Job, team: Team, date: string, time: string) => Violation[]
  jobCardProps: (j: Job) => object
  siteOf: (j: Job) => SchedEnv['sites'][number] | undefined
  onHover: (h: Hover | null) => void
}

function JobBody({ job, env, siteOf, showTime }: { job: Job; env: SchedEnv; siteOf: GridCommon['siteOf']; showTime?: boolean }) {
  const slot = slotOf(job, env.jobTypes)
  const principal = env.principals.find(p => p.id === job.principalId)
  const chillis = isChillis(env.customers.find(c => c.id === job.customerId))
  return (
    <>
      <div className="sch-tags"><code>{job.jobNo}</code><span className={`slot-tag slot-${slot}`}>{SLOT_LABEL[slot]}</span>{chillis && <span className="slot-tag chillis">Chilli&apos;s</span>}</div>
      <span>{job.subject}</span>
      <small>{showTime && job.scheduledAt ? `${timeOf(job.scheduledAt)} · ` : ''}{siteOf(job)?.area || 'No area'}{principal ? ` · ${principal.name}` : ''}</small>
      {job.scheduleState === 'Draft' && <em className="sch-flag draft">Draft</em>}
      {job.schedulingOverride && <em className="sch-flag"><AlertTriangle size={11} />Override</em>}
    </>
  )
}

function eventClass(j: Job, env: SchedEnv) {
  return `slot-${slotOf(j, env.jobTypes)}${LOCKED.includes(j.status) ? ' locked' : ''}${j.schedulingOverride ? ' override' : ''}${j.scheduleState === 'Draft' ? ' is-draft' : ''}`
}
const eventTitle = (j: Job) => `${j.jobNo}: ${j.subject}${j.schedulingOverride ? `\nOverride: ${j.schedulingOverride.reason}` : ''}`

function TeamHead({ team, env, date, dayJobs, onToggleLeave, isAdmin }: { team: Team; env: SchedEnv; date: string; dayJobs: Job[]; onToggleLeave?: (userId: string, date: string) => void; isAdmin?: boolean }) {
  const members = team.memberIds.map(id => env.users.find(u => u.id === id)).filter(Boolean) as SchedEnv['users']
  const big = dayJobs.filter(j => slotOf(j, env.jobTypes) === 'BIG').length
  return (
    <div className="sch-tech">
      <strong><i className="team-dot" style={{ background: team.colour }} />{team.name}</strong>
      <small>{dayJobs.length}/{env.capacity} jobs · Big {big}/{env.scheduling.maxBigPerTeamDay}</small>
      <div className="sch-members">
        {members.map(m => {
          const off = env.techAvailability[m.id]?.daysOff.includes(date)
          return onToggleLeave && isAdmin
            ? <button key={m.id} className={`member-chip ${off ? 'off' : ''}`} onClick={() => onToggleLeave(m.id, date)} aria-pressed={!!off} title={off ? 'Remove leave' : 'Mark leave'}>{m.name.split(' ')[0]}{off ? ' (leave)' : ''}</button>
            : <span key={m.id} className={`member-chip ${off ? 'off' : ''}`}>{m.name.split(' ')[0]}{off ? ' (leave)' : ''}</span>
        })}
        {!members.length && <small>No members</small>}
      </div>
      <div className={`sch-meter ${dayJobs.length >= env.capacity ? 'full' : ''}`} aria-hidden><i style={{ width: `${Math.min(100, (dayJobs.length / env.capacity) * 100)}%` }} /></div>
    </div>
  )
}

function TravelNote({ env, job, team, date, time }: { env: SchedEnv; job: Job; team: Team; date: string; time: string }) {
  const { before, after } = travelNeighbours(env, job, team.id, date, time)
  const parts = [
    before.minutes !== undefined && { label: `${before.minutes} min from ${before.job ? before.job.jobNo : `base (${env.base.name})`}`, band: travelBand(before.minutes, env.scheduling) },
    after?.minutes !== undefined && { label: `${after.minutes} min to ${after.job.jobNo}`, band: travelBand(after.minutes, env.scheduling) },
  ].filter(Boolean) as { label: string; band: 'green' | 'amber' | 'red' }[]
  return <>{parts.map(p => <span key={p.label} className={`travel-band ${p.band}`}>{p.label} (est.) · {BAND_LABEL[p.band]}</span>)}</>
}

function DayGrid(p: GridCommon & { date: string; isAdmin: boolean; onDrop: (team: Team, date: string, time: string) => void; onToggleLeave: (userId: string, date: string) => void }) {
  const { env } = p
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i)
  const minutes = (j: Job) => minutesOf(j, env)
  const win = env.scheduling.windows
  const band = (k: SlotKind) => ({ top: ((toMin(win[k].start) - DAY_START) / SLOT_MINUTES) * ROW, height: ((toMin(win[k].end) - toMin(win[k].start)) / SLOT_MINUTES) * ROW })
  return (
    <div className="sch-day" style={{ gridTemplateColumns: `56px repeat(${p.teams.length}, minmax(240px, 1fr))` }}>
      <div className="sch-head-corner" />
      {p.teams.map(t => <div key={t.id} className="sch-head-cell"><TeamHead team={t} env={env} date={p.date} dayJobs={jobsOnTeamDay(env, t.id, p.date)} isAdmin={p.isAdmin} onToggleLeave={p.onToggleLeave} /></div>)}
      <div className="sch-times" style={{ height: SLOTS * ROW }}>{hours.map(h => <span key={h} style={{ top: ((h * 60 - DAY_START) / SLOT_MINUTES) * ROW }}>{String(h).padStart(2, '0')}:00</span>)}</div>
      {p.teams.map(t => {
        const events = layout(jobsOnTeamDay(env, t.id, p.date), minutes)
        const h = p.hover && p.hover.teamId === t.id && p.hover.date === p.date ? p.hover : null
        const ghostViolations = h && p.dragged ? p.check(p.dragged, t, h.date, h.time) : []
        const blocking = ghostViolations.filter(isBlocking)
        return (
          <div
            key={t.id} className="sch-col" style={{ height: SLOTS * ROW }}
            onDragOver={e => {
              if (!p.canMove) return
              e.preventDefault()
              const rect = e.currentTarget.getBoundingClientRect()
              const slot = Math.max(0, Math.min(SLOTS - 1, Math.floor((e.clientY - rect.top) / ROW)))
              const time = fromMin(DAY_START + slot * SLOT_MINUTES)
              if (!h || h.time !== time) p.onHover({ teamId: t.id, date: p.date, time })
            }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) p.onHover(null) }}
            onDrop={e => { e.preventDefault(); if (h) p.onDrop(t, h.date, h.time) }}
          >
            {(['BIG', 'SMALL', 'ASSESSMENT'] as SlotKind[]).map(k => <div key={k} className={`sch-band slot-${k}`} style={band(k)}><span>{SLOT_LABEL[k]}</span></div>)}
            {events.map(({ job, start, end, lane, lanes }) => (
              <Link
                key={job.id} href={`/jobs/${job.id}`} className={`sch-ev ${eventClass(job, env)}`} title={eventTitle(job)} {...p.jobCardProps(job)}
                style={{ top: ((start - DAY_START) / SLOT_MINUTES) * ROW, height: Math.max(ROW, ((end - start) / SLOT_MINUTES) * ROW - 2), left: `calc(${(lane / lanes) * 100}% + 4px)`, width: `calc(${100 / lanes}% - 8px)` }}
              >
                <JobBody job={job} env={env} siteOf={p.siteOf} showTime />
              </Link>
            ))}
            {h && p.dragged && (
              <div className={`sch-ghost ${blocking.length ? 'warn' : 'ok'}`} style={{ top: ((toMin(h.time) - DAY_START) / SLOT_MINUTES) * ROW, height: Math.max(ROW, (minutes(p.dragged) / SLOT_MINUTES) * ROW - 2) }}>
                <strong>{h.time} to {fromMin(toMin(h.time) + minutes(p.dragged))}</strong>
                {ghostViolations.map(v => <span key={v.kind + v.message} className="sch-preview">{KIND_LABEL[v.kind]}</span>)}
                <TravelNote env={env} job={p.dragged} team={t} date={h.date} time={h.time} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WeekGrid(p: GridCommon & { days: string[]; today: string; onDrop: (team: Team, date: string) => void; onOpenDay: (date: string) => void }) {
  const { env } = p
  return (
    <div className="sch-week" style={{ gridTemplateColumns: `100px repeat(${p.teams.length}, minmax(260px, 1fr))` }}>
      <div className="sch-head-corner" />
      {p.teams.map(t => <div key={t.id} className="sch-head-cell"><TeamHead team={t} env={env} date={p.today} dayJobs={p.days.flatMap(d => jobsOnTeamDay(env, t.id, d))} /></div>)}
      {p.days.map(d => (
        <WeekRow key={d} {...p} date={d} />
      ))}
    </div>
  )
}

function WeekRow(p: GridCommon & { date: string; today: string; days: string[]; onDrop: (team: Team, date: string) => void; onOpenDay: (date: string) => void }) {
  const { env, date } = p
  return (
    <>
      <button className={`sch-daylabel ${date === p.today ? 'today' : ''}`} onClick={() => p.onOpenDay(date)}>{fmtDate(date, { weekday: 'short' })}<br /><span>{fmtDate(date, { day: 'numeric', month: 'short' })}</span></button>
      {p.teams.map(t => {
        const list = jobsOnTeamDay(env, t.id, date).sort((a, b) => toMin(timeOf(a.scheduledAt!)) - toMin(timeOf(b.scheduledAt!)))
        const h = p.hover && p.hover.teamId === t.id && p.hover.date === date ? p.hover : null
        const violations = h && p.dragged ? p.check(p.dragged, t, date, h.time) : []
        const blocking = violations.filter(isBlocking)
        const count = (k: SlotKind) => list.filter(j => slotOf(j, env.jobTypes) === k).length
        const areas = Array.from(new Set(list.map(j => p.siteOf(j)?.area).filter(Boolean)))
        return (
          <div
            key={t.id} className={`sch-cell ${date === p.today ? 'today' : ''} ${h ? (blocking.length ? 'warn' : 'ok') : ''}`}
            onDragOver={e => { if (!p.canMove || !p.dragged) return; e.preventDefault(); if (!h) p.onHover({ teamId: t.id, date, time: firstFreeTime(env, p.dragged, t, date).time }) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) p.onHover(null) }}
            onDrop={e => { e.preventDefault(); p.onDrop(t, date) }}
          >
            <div className="sch-cell-top">
              <span className="sch-load-line">Big {count('BIG')}/{env.scheduling.maxBigPerTeamDay} · Small {count('SMALL')} · Assess {count('ASSESSMENT')}</span>
              <span className={`sch-load ${list.length >= env.capacity ? 'full' : ''}`}>{list.length}/{env.capacity}</span>
            </div>
            {areas.length > 0 && <small className="sch-areas">{areas.join(', ')}</small>}
            {list.map((j, i) => {
              const next = list[i + 1]
              const from = p.siteOf(j)
              const to = next && p.siteOf(next)
              const a = from?.lat !== undefined && from?.lng !== undefined ? { lat: from.lat, lng: from.lng } : undefined
              const b = to && to.lat !== undefined && to.lng !== undefined ? { lat: to.lat, lng: to.lng } : undefined
              return (
                <div key={j.id} className="sch-stack">
                  <Link href={`/jobs/${j.id}`} className={`sch-chip ${eventClass(j, env)}`} title={eventTitle(j)} {...p.jobCardProps(j)}>
                    <JobBody job={j} env={env} siteOf={p.siteOf} showTime />
                  </Link>
                  {a && b && <HopLabel env={env} a={a} b={b} />}
                </div>
              )
            })}
            {h && p.dragged && (
              <div className={`sch-ghost-chip ${blocking.length ? 'warn' : 'ok'}`}>
                <strong>{p.dragged.jobNo} at {h.time}</strong>
                {violations.map(v => <span key={v.kind + v.message} className="sch-preview">{KIND_LABEL[v.kind]}</span>)}
                <TravelNote env={env} job={p.dragged} team={t} date={date} time={h.time} />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function HopLabel({ env, a, b }: { env: SchedEnv; a: { lat: number; lng: number }; b: { lat: number; lng: number } }) {
  const m = getTravelMinutes(a, b, env.scheduling).minutes
  const band = travelBand(m, env.scheduling)
  return <span className={`travel-band ${band}`}>{m} min (est.) · {BAND_LABEL[band]}</span>
}

function OverrideDialog({ pending, onCancel, onConfirm }: { pending: PendingItem[]; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const valid = reason.trim().length >= 5
  return (
    <div className="modal-backdrop" onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="override-title">
        <h2 id="override-title" className="sch-dialog-title"><AlertTriangle size={18} />Scheduling rules broken</h2>
        {pending.map(item => (
          <div key={item.job.id} className="sch-pending">
            <p className="muted">{item.job.jobNo} to {item.team.name}, {fmtDate(item.date)} at {item.time}.</p>
            <ul className="sch-violations">{item.violations.map(v => <li key={v.kind + v.message}><strong>{KIND_LABEL[v.kind]}</strong><span>{v.message}</span></li>)}</ul>
            {item.job.selfService && <p className="sch-note warn">Customer self-service booking. Customers cannot exceed these limits, so only an admin can override.</p>}
          </div>
        ))}
        <label>Reason for override (required)
          <textarea ref={ref} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: customer emergency, team agreed to extra hours" />
        </label>
        <p className="muted sch-hint">The assignments are saved. The override and your reason are written to each job history and highlighted on the calendar.</p>
        <div className="modal-footer">
          <button className="button secondary" onClick={onCancel}>Back to drafts</button>
          <button className="button danger" disabled={!valid} onClick={() => onConfirm(reason.trim())}>Override anyway</button>
        </div>
      </div>
    </div>
  )
}

function ManualDialog({ env, job, teams, today, onCancel, onSubmit }: { env: SchedEnv; job: Job; teams: Team[]; today: string; onCancel: () => void; onSubmit: (team: Team, date: string, time: string) => void }) {
  const slot = slotOf(job, env.jobTypes)
  const win = env.scheduling.windows[slot]
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [date, setDate] = useState(today)
  const team = teams.find(t => t.id === teamId)
  const [time, setTime] = useState(win.start)
  const times: string[] = []
  for (let t = toMin(win.start); t + win.minutes <= toMin(win.end); t += SLOT_MINUTES) times.push(fromMin(t))
  const violations = team && date ? checkTeamPlacement(env, job, team, date, time) : []
  return (
    <div className="modal-backdrop" onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <h2 id="manual-title">Schedule {job.jobNo}</h2>
        <p className="muted">{job.subject} · {SLOT_LABEL[slot]} job, {win.minutes / 60}h, between {win.start} and {win.end}</p>
        <label>Team<select className="field-input" value={teamId} onChange={e => setTeamId(e.target.value)}>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Date<input className="field-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Start time<select className="field-input" value={time} onChange={e => setTime(e.target.value)}>{times.map(t => <option key={t}>{t}</option>)}</select></label>
        {violations.length > 0 && <ul className="sch-violations">{violations.map(v => <li key={v.kind + v.message}><strong>{KIND_LABEL[v.kind]}</strong><span>{v.message}</span></li>)}</ul>}
        <div className="modal-footer">
          <button className="button secondary" onClick={onCancel}>Cancel</button>
          <button className="button primary" disabled={!date || !team} onClick={() => team && onSubmit(team, date, time)}>Add to drafts</button>
        </div>
      </div>
    </div>
  )
}
