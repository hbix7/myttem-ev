'use client'
import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { useOperationsStore } from '@/lib/store/operations'
import type { SchedEnv } from '@/lib/scheduling'

export function useSchedEnv(): SchedEnv {
  const jobs = useStore(s => s.jobs)
  const jobTypes = useStore(s => s.jobTypes)
  const sites = useStore(s => s.sites)
  const customers = useStore(s => s.customers)
  const principals = useStore(s => s.principals)
  const users = useStore(s => s.users)
  const settings = useStore(s => s.settings)
  const teams = useOperationsStore(s => s.teams)
  const techAvailability = useOperationsStore(s => s.techAvailability)
  return useMemo(
    () => ({ jobs, jobTypes, sites, customers, principals, users, teams, techAvailability, capacity: settings.techDailyCapacity, scheduling: settings.scheduling, base: settings.baseLocation, coverage: settings.coverage }),
    [jobs, jobTypes, sites, customers, principals, users, teams, techAvailability, settings],
  )
}
