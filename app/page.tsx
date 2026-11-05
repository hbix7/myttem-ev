'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, FileWarning, Percent, Receipt, ShieldAlert, UserCheck } from 'lucide-react'
import { AppShell, ExportMenu, PageHeader, ShellSkeleton, StatusPill, initials, useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useCommercialStore } from '@/lib/store/commercial'
import { computeKpis, technicianUtilisation, weeklyVolume } from '@/lib/metrics'

const statuses = ['Created', 'Assigned', 'In Progress', 'Completed', 'Invoiced', 'Closed'] as const
const statusTone: Record<string, string> = { Created: 'slate', Assigned: 'blue', 'In Progress': 'amber', Completed: 'green', Invoiced: 'violet', Closed: 'grey' }

function Kpi({ label, value, hint, icon, tone, href, accent }: { label: string; value: string | number; hint?: string; icon: React.ReactNode; tone: string; href?: string; accent?: 'red' | 'amber' }) {
  const body = (
    <>
      <div className="kpi-top"><small>{label}</small><span className="kpi-icon">{icon}</span></div>
      <div className="kpi-value"><strong>{value}</strong>{hint && <span>{hint}</span>}</div>
    </>
  )
  const cls = `kpi-card tone-${tone} ${accent ? `accent-${accent}` : ''}`
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}

export default function Dashboard() {
  const hydrated = useHydrated()
  const { jobs, users, jobTypes, settings } = useStore()
  const quotations = useCommercialStore(s => s.quotations)
  const invoices = useCommercialStore(s => s.invoices)
  const [range, setRange] = useState('This month')
  const counts = useMemo(() => Object.fromEntries(statuses.map(s => [s, jobs.filter(j => j.status === s).length])), [jobs])
  if (!hydrated) return <ShellSkeleton />

  const k = computeKpis(jobs, jobTypes, quotations, invoices)
  const warnings = k.warnings
  const breached = k.breachedOpen
  const pending = k.pendingInvoice
  const conversion = k.conversionPct
  const openJobs = k.open
  const weekly = weeklyVolume(jobs).map(w => w.count)
  const weeklyMax = Math.max(1, ...weekly)
  const utilRows = technicianUtilisation(jobs, users, settings.techDailyCapacity || 3)
  const maxCount = Math.max(1, ...Object.values(counts))

  return (
    <AppShell crumb="Dashboard">
      <PageHeader title="Operations dashboard" action={
        <>
          <select value={range} onChange={e => setRange(e.target.value)} aria-label="Date range"><option>This month</option><option>Last 30 days</option><option>Last quarter</option></select>
          <ExportMenu jobs={jobs} />
        </>
      } />
      <section className="content">
        <div className="kpi-grid">
          <Kpi label="Open jobs" value={openJobs} icon={<CalendarClock />} tone="blue" href="/jobs" />
          <Kpi label="SLA warnings" value={warnings.length} hint="80% threshold" icon={<ShieldAlert />} tone="amber" accent="amber" href="/jobs" />
          <Kpi label="SLA breached" value={breached.length} icon={<FileWarning />} tone="red" accent="red" href="/jobs" />
          <Kpi label="Pending invoice" value={pending.length} icon={<Receipt />} tone="violet" href="/invoices" />
          <Kpi label="Owner approval" value={k.ownerApproval.length} icon={<UserCheck />} tone="slate" href="/quotations" />
          <Kpi label="ChargeSini conversion" value={`${conversion}%`} icon={<Percent />} tone="teal" href="/ev/conversion" />
        </div>

        <nav className="card pipeline" aria-label="Job pipeline">
          {statuses.map(s => (
            <Link href={`/jobs?status=${encodeURIComponent(s)}`} key={s} className={`tone-${statusTone[s]}`}>
              <span className="pipe-label"><i />{s}</span>
              <strong>{counts[s]}</strong>
              <span className="bar"><span style={{ width: `${(counts[s] / maxCount) * 100}%` }} /></span>
            </Link>
          ))}
        </nav>

        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Volume</p><h2>Job volume by week</h2></div><span className="muted">{range}</span></div>
            <div className="bar-chart" role="img" aria-label={`Weekly job volume: ${weekly.map((v, i) => `W${i + 1} ${v}`).join(', ')}`}>
              <div className="grid-lines" aria-hidden="true">{[1, 0.75, 0.5, 0.25, 0].map(n => <i key={n}><b>{Math.round(n * weeklyMax)}</b></i>)}</div>
              {weekly.map((v, i) => (
                <div className="bar-col" key={i} tabIndex={0}>
                  <div className="plot"><span style={{ height: `${(v / weeklyMax) * 100}%` }} data-value={v} /></div>
                  <small>W{i + 1}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Capacity</p><h2>Technician utilisation</h2></div></div>
            {utilRows.map(({ user: u, open, capacity, pct: raw }) => {
              const pct = Math.min(100, raw)
              const over = raw >= 90
              return (
                <div className="util-row" key={u.id}>
                  <span className="person"><span className="avatar sm">{initials(u.name)}</span><strong>{u.name}</strong></span>
                  <div className={`mini-progress ${over ? 'over' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${u.name} utilisation`}><span style={{ width: `${pct}%` }} /></div>
                  <span className="pct">{open} of {capacity} open ({raw}%){over && <small>At capacity</small>}</span>
                </div>
              )
            })}
          </section>
        </div>

        <div className="dashboard-grid">
          <section className="panel mini-table">
            <div className="panel-heading"><h2>Response-time warnings</h2><Link href="/reports" className="view-all">View report<ArrowRight size={14} /></Link></div>
            <table>
              <thead><tr><th>Job</th><th>Subject</th><th>Status</th></tr></thead>
              <tbody>
                {[...k.breachedOpen, ...k.warnings].slice(0, 5).map(({ job: j, info }) => (
                  <tr key={j.id}>
                    <td><Link href={`/jobs/${j.id}`} className="link mono">{j.jobNo}</Link></td>
                    <td>{j.subject}</td>
                    <td><StatusPill>{info.state}</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-heading"><h2>EV deadline watchlist</h2><Link href="/ev/deadlines" className="view-all">View all<ArrowRight size={14} /></Link></div>
            {jobs.filter(j => j.jobNo.startsWith('EVA') || j.jobNo.startsWith('EVI')).slice(0, 5).map(j => (
              <div className="watch-row" key={j.id}>
                <Link href={`/jobs/${j.id}`}><strong className="mono">{j.jobNo}</strong><span>{j.subject}</span></Link>
                <span className="countdown due-soon">D{Math.min(6, (j.id.charCodeAt(1) || 1) % 6 + 1)} · due soon</span>
              </div>
            ))}
          </section>
        </div>
      </section>
    </AppShell>
  )
}
