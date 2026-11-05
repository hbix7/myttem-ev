import type { Job, JobType, User } from './types'

/* Pure scheduling rules. All timestamps are Malaysia time (+08:00) and are sliced as strings, never re-parsed, so the result is the same on every machine. */

export interface TechAvailability { workStart: string; workEnd: string; workDays: number[]; daysOff: string[] }
export type RuleKind = 'capacity' | 'availability' | 'double-booked'
export interface Violation { kind: RuleKind; message: string }

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
