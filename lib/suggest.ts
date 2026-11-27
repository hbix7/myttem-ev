import { checkTeamPlacement, firstFreeTime, isBlocking, jobsOnTeamDay, minutesOf, slotOf, travelNeighbours, type JobLike, type SchedEnv, type Violation } from './scheduling'
import type { SlotKind, Team } from './types'

export type Rating = 'Recommended' | 'Possible' | 'Not available'
export interface DateSuggestion {
  date: string
  rating: Rating
  reason: string
  score: number
  teamId?: string
  time?: string
  slot: SlotKind
  violations: Violation[]
}

interface Candidate { team: Team; time: string; score: number; reason: string; violations: Violation[] }

/* Scoring weights live here so the postcode and area rules can be refined without touching the scheduler. */
export const SCORE = { base: 50, sameArea: 25, perTravelMinute: 1, emptyDay: 5, warning: 8 }

function evaluate(env: SchedEnv, job: JobLike, team: Team, date: string): Candidate | { blocked: string } {
  const free = firstFreeTime(env, job, team, date)
  const blocking = free.violations.filter(isBlocking)
  if (!free.free) return { blocked: blocking[0]?.message ?? `${team.name} has no free time that day.` }
  const site = env.sites.find(s => s.id === job.siteId)
  const day = jobsOnTeamDay(env, team.id, date, job.id)
  const sameArea = day.filter(j => site && env.sites.find(s => s.id === j.siteId)?.area === site.area)
  const { before, after } = travelNeighbours(env, job, team.id, date, free.time)
  const hops = [before.minutes, after?.minutes].filter((m): m is number => m !== undefined)
  const worst = hops.length ? Math.max(...hops) : 0
  const warnings = free.violations.filter(v => !isBlocking(v)).length
  const score = SCORE.base + sameArea.length * SCORE.sameArea - worst * SCORE.perTravelMinute + (day.length ? 0 : SCORE.emptyDay) - warnings * SCORE.warning
  let reason: string
  if (sameArea.length) {
    const gap = before.job && before.minutes !== undefined ? before.minutes : after?.minutes
    reason = `${sameArea.length} ${sameArea.length === 1 ? 'job' : 'jobs'} already in ${site?.area}${gap !== undefined ? `, ${gap} min apart` : ''}`
  } else if (day.length) reason = `${day.length} ${day.length === 1 ? 'job' : 'jobs'} that day, nearest is ${worst} min away (est.)`
  else reason = `${team.name} is free all day${site?.area ? `, ${worst} min from base to ${site.area}` : ''}`
  if (warnings) reason += `. ${free.violations.find(v => !isBlocking(v))!.message}`
  return { team, time: free.time, score, reason, violations: free.violations }
}

export function suggestDates(env: SchedEnv, job: JobLike, dates: string[], today: string): DateSuggestion[] {
  const slot = slotOf(job, env.jobTypes)
  void minutesOf
  const teams = env.teams.filter(t => t.memberIds.some(id => env.users.some(u => u.id === id && u.active)))
  const rows: DateSuggestion[] = dates.map(date => {
    if (date < today) return { date, rating: 'Not available', reason: 'This date is in the past.', score: -1, slot, violations: [] }
    if (!teams.length) return { date, rating: 'Not available', reason: 'No active team.', score: -1, slot, violations: [] }
    const results = teams.map(t => evaluate(env, job, t, date))
    const ok = results.filter((r): r is Candidate => 'team' in r).sort((a, b) => b.score - a.score)
    if (!ok.length) {
      const blocked = results.filter((r): r is { blocked: string } => 'blocked' in r)
      return { date, rating: 'Not available', reason: blocked[0]?.blocked ?? 'No free team lane.', score: -1, slot, violations: checkTeamPlacement(env, job, teams[0], date, env.scheduling.windows[slot].start).filter(isBlocking) }
    }
    const best = ok[0]
    return { date, rating: 'Possible', reason: best.reason, score: best.score, teamId: best.team.id, time: best.time, slot, violations: best.violations }
  })
  const top = rows.filter(r => r.rating === 'Possible').sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))[0]
  if (top) top.rating = 'Recommended'
  return rows
}
