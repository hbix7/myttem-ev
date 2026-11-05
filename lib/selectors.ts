import { getNow } from './clock'
import type { Job, JobType, SlaState } from './types'

const CLOSED = ['Completed', 'Invoiced', 'Closed']
export const isClosed = (job: Job) => CLOSED.includes(job.status)

export function formatDuration(ms: number) {
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  if (h === 0) return `${m}m`
  const rounded = Math.round(abs / 360000) / 10
  return h >= 10 || Number.isInteger(rounded) ? `${Math.round(rounded)}h` : `${rounded}h`
}

export interface SlaInfo { state: SlaState; frozen: boolean; ratio: number; remainingMs: number; overByMs: number; label: string }

/* The timer runs only while a job is open and not on hold. At Completed it freezes at completedAt. */
export function slaInfo(job: Job, type?: JobType): SlaInfo {
  const created = new Date(job.createdAt).getTime()
  const total = Math.max(1, new Date(job.slaDue).getTime() - created)
  const frozen = isClosed(job)
  const stop = frozen
    ? new Date(job.completedAt ?? job.endTime ?? job.createdAt).getTime()
    : job.holdSince ? new Date(job.holdSince).getTime() : getNow().getTime()
  const elapsed = Math.max(0, stop - created - job.pausedMs)
  const ratio = elapsed / total
  const overByMs = Math.max(0, elapsed - total)
  const remainingMs = total - elapsed
  if (frozen) {
    const met = ratio <= 1
    return { state: met ? 'Met' : 'Breached', frozen, ratio, remainingMs, overByMs, label: met ? 'Met' : `Breached by ${formatDuration(overByMs)}` }
  }
  const state: SlaState = ratio >= 1 ? 'Breached' : ratio >= (type?.warnPct ?? 0.8) ? 'Warning' : 'On track'
  const label = ratio >= 1 ? `${formatDuration(overByMs)} overdue` : `${formatDuration(remainingMs)} left`
  return { state, frozen, ratio, remainingMs, overByMs, label }
}

export function slaState(job: Job, type?: JobType): SlaState { return slaInfo(job, type).state }

export function timeRemaining(job: Job) {
  const i = slaInfo(job)
  return `${i.remainingMs < 0 ? '-' : ''}${formatDuration(i.remainingMs)}`
}
