import type { BaseLocation, CoverageArea, Customer, Job, JobType, Principal, SchedulingSettings, Site, SlotKind, Team, User } from './types'
import { getTravelMinutes, isChillis, isInCoverage, siteCoords } from './location'

export { suggestDates } from './suggest'

/* Pure scheduling rules. All timestamps are Malaysia time (+08:00) and are sliced as strings, never re-parsed, so the result is the same on every machine. */

export interface TechAvailability { workStart: string; workEnd: string; workDays: number[]; daysOff: string[] }
export type RuleKind = 'capacity' | 'availability' | 'double-booked' | 'big-limit' | 'slot-window' | 'travel' | 'coverage' | 'priority'
export interface Violation { kind: RuleKind; message: string; severity?: 'block' | 'warning' }
export const isBlocking = (v: Violation) => v.severity !== 'warning'

export const DAY_START = 8 * 60
export const DAY_END = 18 * 60
export const SLOT_MINUTES = 30
export const FINISHED: Job['status'][] = ['Completed', 'Invoiced', 'Closed']
export const LOCKED: Job['status'][] = ['In Progress', 'Completed', 'Invoiced', 'Closed']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
export const dayOf = (iso: string) => iso.slice(0, 10)
export const timeOf = (iso: string) => iso.slice(11, 16)
export const stamp = (date: string, time: string) => `${date}T${time}:00+08:00`
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()
export const addDays = (date: string, n: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
export const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7))
export const todayMy = (now: Date) => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
export const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-MY', { ...opts, timeZone: 'UTC' })
export const time12to24 = (t: string) => { const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim()); if (!m) return t; let h = Number(m[1]) % 12; if (m[3].toUpperCase() === 'PM') h += 12; return `${String(h).padStart(2, '0')}:${m[2]}` }

export function durationMinutes(type?: JobType) {
  if (type?.isEv) return type.evKind === 'Installation' ? 120 : 60
  return type?.code === 'SRV' ? 180 : 120
}

export function workDaysLabel(a: TechAvailability) {
  const d = [...a.workDays].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))
  if (!d.length) return 'No working days'
  const contiguous = d.every((v, i) => i === 0 || ((v + 6) % 7) - ((d[i - 1] + 6) % 7) === 1)
  return contiguous && d.length > 1 ? `${WEEKDAYS[d[0]]} to ${WEEKDAYS[d[d.length - 1]]}` : d.map(v => WEEKDAYS[v]).join(', ')
}

export interface PlacementInput {
  job: Pick<Job, 'id'>
  type?: JobType
  tech: Pick<User, 'id' | 'name'>
  date: string
  time: string
  jobs: Job[]
  jobTypes: JobType[]
  capacity: number
  availability?: TechAvailability
}

export function jobsOnDay(jobs: Job[], techId: string, date: string, excludeId?: string) {
  return jobs.filter(j => j.id !== excludeId && j.technicianId === techId && j.scheduledAt && dayOf(j.scheduledAt) === date)
}

export function checkPlacement(i: PlacementInput): Violation[] {
  const out: Violation[] = []
  const first = i.tech.name.split(' ')[0]
  const start = toMin(i.time)
  const end = start + durationMinutes(i.type)
  const a = i.availability
  if (a) {
    if (a.daysOff.includes(i.date)) out.push({ kind: 'availability', message: `${first} is on leave on ${fmtDate(i.date)}.` })
    else if (!a.workDays.includes(weekdayOf(i.date))) out.push({ kind: 'availability', message: `${first} does not work on ${fmtDate(i.date, { weekday: 'long' })}s.` })
    else if (start < toMin(a.workStart) || end > toMin(a.workEnd)) out.push({ kind: 'availability', message: `${i.time} to ${fromMin(end)} is outside ${first}'s hours (${a.workStart} to ${a.workEnd}).` })
  }
  const others = jobsOnDay(i.jobs, i.tech.id, i.date, i.job.id)
  if (others.length + 1 > i.capacity) out.push({ kind: 'capacity', message: `${first} would have ${others.length + 1} jobs on ${fmtDate(i.date)}. Daily capacity is ${i.capacity}.` })
  const clash = others.filter(o => {
    const os = toMin(timeOf(o.scheduledAt!))
    const oe = os + durationMinutes(i.jobTypes.find(t => t.id === o.jobTypeId))
    return start < oe && os < end
  })
  if (clash.length) out.push({ kind: 'double-booked', message: `Double-booked with ${clash.map(c => c.jobNo).join(', ')} (${first} already has work at this time).` })
  return out
}

/* Used by customer self-service booking: the least busy technician who can take the slot with no rule broken. */
export function findTechForSlot(args: { technicians: User[]; date: string; time: string; type?: JobType; jobs: Job[]; jobTypes: JobType[]; capacity: number; availability: Record<string, TechAvailability> }) {
  const free = args.technicians
    .filter(t => !checkPlacement({ job: { id: '__new' }, type: args.type, tech: t, date: args.date, time: args.time, jobs: args.jobs, jobTypes: args.jobTypes, capacity: args.capacity, availability: args.availability[t.id] }).length)
    .sort((a, b) => jobsOnDay(args.jobs, a.id, args.date).length - jobsOnDay(args.jobs, b.id, args.date).length)
  return { free, tech: free[0] as User | undefined }
}


/* ---------- Team lanes: one team, one day, one lane ---------- */

export interface SchedEnv {
  jobs: Job[]; jobTypes: JobType[]; sites: Site[]; customers: Customer[]; principals: Principal[]; teams: Team[]; users: User[]
  techAvailability: Record<string, TechAvailability>; capacity: number; scheduling: SchedulingSettings; base: BaseLocation; coverage: CoverageArea[]
}
export type JobLike = Pick<Job, 'id' | 'siteId' | 'customerId' | 'jobTypeId'> & Partial<Pick<Job, 'principalId' | 'jobSize' | 'slot'>>

export const SLOT_LABEL: Record<SlotKind, string> = { BIG: 'Big', SMALL: 'Small', ASSESSMENT: 'Assessment' }

export function deriveSlot(type: JobType | undefined, size?: Job['jobSize']): SlotKind {
  if (type?.evKind === 'Assessment') return 'ASSESSMENT'
  if (type?.evKind === 'Installation') return size === 'Big' ? 'BIG' : 'SMALL'
  return size === 'Big' ? 'BIG' : 'SMALL'
}
export const slotOf = (job: JobLike, types: JobType[]): SlotKind => job.slot ?? deriveSlot(types.find(t => t.id === job.jobTypeId), job.jobSize)
export const minutesOf = (job: JobLike, env: Pick<SchedEnv, 'jobTypes' | 'scheduling'>) => env.scheduling.windows[slotOf(job, env.jobTypes)].minutes
export const teamOfJob = (job: Job, teams: Team[]) => job.teamId ?? teams.find(t => !!job.technicianId && t.memberIds.includes(job.technicianId))?.id
export const jobsOnTeamDay = (env: Pick<SchedEnv, 'jobs' | 'teams'>, teamId: string, date: string, excludeId?: string) =>
  env.jobs.filter(j => j.id !== excludeId && j.scheduledAt && dayOf(j.scheduledAt) === date && teamOfJob(j, env.teams) === teamId)

export function memberAvailable(a: TechAvailability | undefined, date: string, start: number, end: number) {
  if (!a) return false
  if (a.daysOff.includes(date) || !a.workDays.includes(weekdayOf(date))) return false
  return start >= toMin(a.workStart) && end <= toMin(a.workEnd)
}
export const availableMembers = (env: Pick<SchedEnv, 'techAvailability' | 'users'>, team: Team, date: string, time: string, minutes: number) =>
  team.memberIds.filter(id => env.users.some(u => u.id === id && u.active) && memberAvailable(env.techAvailability[id], date, toMin(time), toMin(time) + minutes))

export interface Neighbour { job: Job; minutes: number; from: 'base' | 'job' }
export function travelNeighbours(env: SchedEnv, job: JobLike, teamId: string, date: string, time: string) {
  const mine = siteCoords(env.sites.find(s => s.id === job.siteId), env.coverage)
  const start = toMin(time)
  const day = jobsOnTeamDay(env, teamId, date, job.id).map(j => ({ j, start: toMin(timeOf(j.scheduledAt!)) })).sort((a, b) => a.start - b.start)
  const prev = [...day].reverse().find(x => x.start <= start)
  const next = day.find(x => x.start > start)
  const coords = (j: Job) => siteCoords(env.sites.find(s => s.id === j.siteId), env.coverage)
  const t = (a?: { lat: number; lng: number }, b?: { lat: number; lng: number }) => (a && b ? getTravelMinutes(a, b, env.scheduling).minutes : undefined)
  const before = prev ? { job: prev.j, from: 'job' as const, minutes: t(coords(prev.j), mine) } : { job: undefined, from: 'base' as const, minutes: t(env.base, mine) }
  const after = next ? { job: next.j, minutes: t(mine, coords(next.j)) } : undefined
  return { before, after }
}

export function checkTeamPlacement(env: SchedEnv, job: JobLike, team: Team, date: string, time: string): Violation[] {
  const out: Violation[] = []
  const slot = slotOf(job, env.jobTypes)
  const win = env.scheduling.windows[slot]
  const minutes = win.minutes
  const start = toMin(time)
  const end = start + minutes
  const type = env.jobTypes.find(t => t.id === job.jobTypeId)
  const site = env.sites.find(s => s.id === job.siteId)
  const customer = env.customers.find(c => c.id === job.customerId)
  const others = jobsOnTeamDay(env, team.id, date, job.id)

  if (!team.memberIds.length) out.push({ kind: 'availability', message: `${team.name} has no members.` })
  else if (!availableMembers(env, team, date, time, minutes).length) out.push({ kind: 'availability', message: `No one in ${team.name} is available on ${fmtDate(date)} from ${time} to ${fromMin(end)} (leave, day off or outside working hours).` })

  if (others.length + 1 > env.capacity) out.push({ kind: 'capacity', message: `${team.name} would have ${others.length + 1} jobs on ${fmtDate(date)}. Daily capacity is ${env.capacity}.` })

  const clash = others.filter(o => {
    const os = toMin(timeOf(o.scheduledAt!))
    const oe = os + minutesOf(o, env)
    return start < oe && os < end
  })
  if (clash.length) out.push({ kind: 'double-booked', message: `Double-booked with ${clash.map(c => c.jobNo).join(', ')} (${team.name} already has work at this time).` })

  if (slot === 'BIG') {
    const bigs = others.filter(o => slotOf(o, env.jobTypes) === 'BIG')
    if (bigs.length >= env.scheduling.maxBigPerTeamDay) out.push({ kind: 'big-limit', message: `${team.name} already has a Big job on ${fmtDate(date)} (${bigs.map(b => b.jobNo).join(', ')}). Limit is ${env.scheduling.maxBigPerTeamDay} per day.` })
  }

  if (start < toMin(win.start) || end > toMin(win.end)) out.push({ kind: 'slot-window', message: `${SLOT_LABEL[slot]} jobs must sit between ${win.start} and ${win.end}. This one runs ${time} to ${fromMin(end)}.` })

  const { before, after } = travelNeighbours(env, job, team.id, date, time)
  const limit = env.scheduling.travelAmberMax
  if (before.minutes !== undefined && before.minutes > limit) out.push({ kind: 'travel', message: `Travel from ${before.job ? before.job.jobNo : `base (${env.base.name})`} is ${before.minutes} min (est.). The limit is ${limit} min.` })
  if (after?.minutes !== undefined && after.minutes > limit) out.push({ kind: 'travel', message: `Travel to ${after.job.jobNo} is ${after.minutes} min (est.). The limit is ${limit} min.` })

  const principal = env.principals.find(p => p.id === job.principalId)
  if (principal?.code === 'CHARGESINI' && !isInCoverage(site, env.coverage)) out.push({ kind: 'coverage', message: `${site?.area || 'This area'} is outside ChargeSini coverage. ChargeSini jobs can only be booked in covered areas.` })

  if (slot === 'ASSESSMENT' && start >= toMin('10:00') && start < toMin('12:00')) {
    const waiting = env.jobs.filter(j => !j.scheduledAt && j.status === 'Created' && j.id !== job.id && isChillis(env.customers.find(c => c.id === j.customerId)))
    const sameArea = waiting.filter(j => env.sites.find(s => s.id === j.siteId)?.area === site?.area)
    if (waiting.length && (sameArea.length || !site)) out.push({ kind: 'priority', severity: 'warning', message: "Chilli's ad-hoc jobs take priority in this window." })
  }
  void customer; void type
  return out
}

/* The least-loaded available member leads the visit; the team is the schedulable unit. */
export function leadTechFor(env: SchedEnv, team: Team, date: string, time: string, minutes: number) {
  const ids = availableMembers(env, team, date, time, minutes)
  const pool = ids.length ? ids : team.memberIds
  return [...pool].sort((a, b) => env.jobs.filter(j => j.technicianId === a && j.scheduledAt && dayOf(j.scheduledAt) === date).length - env.jobs.filter(j => j.technicianId === b && j.scheduledAt && dayOf(j.scheduledAt) === date).length)[0]
}

/* First start time inside the slot window that breaks no blocking rule. */
export function firstFreeTime(env: SchedEnv, job: JobLike, team: Team, date: string) {
  const slot = slotOf(job, env.jobTypes)
  const win = env.scheduling.windows[slot]
  let best: { time: string; violations: Violation[] } | undefined
  for (let t = toMin(win.start); t + win.minutes <= toMin(win.end); t += SLOT_MINUTES) {
    const violations = checkTeamPlacement(env, job, team, date, fromMin(t))
    const blocking = violations.filter(isBlocking)
    if (!blocking.length) return { time: fromMin(t), violations, free: true as const }
    if (!best || blocking.length < best.violations.filter(isBlocking).length) best = { time: fromMin(t), violations }
  }
  return { time: best?.time ?? win.start, violations: best?.violations ?? [], free: false as const }
}
