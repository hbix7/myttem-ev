'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell, PageHeader, SlaCell, StatusPill, useHydrated } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useCommercialStore } from '@/lib/store/commercial'
import { buildPdfDataUrl, downloadDataUrl, downloadXlsx, type Cell } from '@/lib/export'
import { computeKpis, technicianUtilisation, volumeByType, weeklyVolume } from '@/lib/metrics'
import { slaInfo } from '@/lib/selectors'

const tabs = ['Job volume', 'Technician utilisation', 'Response-time warnings', 'Jobs pending invoice'] as const
type Tab = (typeof tabs)[number]

export default function ReportsPage() {
  const hydrated = useHydrated()
  const { jobs, users, customers, jobTypes, settings } = useStore()
  const quotations = useCommercialStore(s => s.quotations)
  const invoices = useCommercialStore(s => s.invoices)
  const [tab, setTab] = useState<Tab>(tabs[0])
  if (!hydrated) return null

  const k = computeKpis(jobs, jobTypes, quotations, invoices)
  const weeks = weeklyVolume(jobs)
  const weekMax = Math.max(1, ...weeks.map(w => w.count))
  const byType = volumeByType(jobs, jobTypes)
  const util = technicianUtilisation(jobs, users, settings.techDailyCapacity || 3)
  const warned = [...k.breachedOpen, ...k.warnings]
  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? ''

  const data = (): { header: string[]; rows: Cell[][] } => {
    if (tab === 'Job volume') return { header: ['Week', 'Jobs created'], rows: weeks.map(w => [w.label, w.count]) }
    if (tab === 'Technician utilisation') return { header: ['Technician', 'Total jobs', 'Open jobs', 'Capacity', 'Utilisation %'], rows: util.map(u => [u.user.name, u.total, u.open, u.capacity, u.pct]) }
    if (tab === 'Response-time warnings') return { header: ['Job', 'Subject', 'SLA state', 'Time'], rows: warned.map(({ job, info }) => [job.jobNo, job.subject, info.state, info.label]) }
    return { header: ['Job', 'Customer', 'Subject', 'Completed'], rows: k.pendingInvoice.map(j => [j.jobNo, customerName(j.customerId), j.subject, (j.completedAt ?? j.endTime ?? '').slice(0, 10)]) }
  }
  const exportAs = async (kind: 'pdf' | 'xlsx') => {
    const { header, rows } = data()
    const name = `myttem-${tab.toLowerCase().replace(/\s+/g, '-')}`
    if (kind === 'xlsx') await downloadXlsx(`${name}.xlsx`, header, rows)
    else downloadDataUrl(buildPdfDataUrl(`Myttem report: ${tab}`, [header.join('  |  '), ...rows.map(r => r.join('  |  '))]), `${name}.pdf`)
    toast.success(`${tab} exported as ${kind.toUpperCase()}`)
  }

  return (
    <AppShell crumb="Reports">
      <PageHeader title="Reports" crumb="Reports" action={<><button className="button secondary" onClick={() => exportAs('xlsx')}><Download size={15} />Excel</button><button className="button secondary" onClick={() => exportAs('pdf')}><Download size={15} />PDF</button></>} />
      <section className="content">
        <div className="tabs" role="tablist">{tabs.map(t => <button role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} key={t} onClick={() => setTab(t)}>{t}</button>)}</div>
        <div className="report-card">
          {tab === 'Job volume' && (
            <>
              <h2>Job volume by week</h2>
              <p className="muted">{jobs.length} jobs in total, same figures as the dashboard.</p>
              <div className="bar-chart" role="img" aria-label={`Weekly job volume: ${weeks.map(w => `${w.label} ${w.count}`).join(', ')}`}>
                {weeks.map(w => <div className="bar-col" key={w.label}><div className="plot"><span style={{ height: `${(w.count / weekMax) * 100}%` }} data-value={w.count} /></div><small>{w.label}</small></div>)}
              </div>
              <table><thead><tr><th>Job type</th><th>Jobs</th><th>Open</th></tr></thead>
                <tbody>{byType.map(({ type, count }) => <tr key={type.id}><td>{type.name}</td><td>{count}</td><td>{jobs.filter(j => j.jobTypeId === type.id && !['Completed', 'Invoiced', 'Closed'].includes(j.status)).length}</td></tr>)}</tbody></table>
            </>
          )}
          {tab === 'Technician utilisation' && (
            <table><thead><tr><th>Technician</th><th>Total jobs</th><th>Open</th><th>Utilisation</th></tr></thead>
              <tbody>{util.map(u => <tr key={u.user.id}><td>{u.user.name}</td><td>{u.total}</td><td>{u.open} of {u.capacity}</td>
                <td><div className={`mini-progress ${u.pct >= 90 ? 'over' : ''}`} role="progressbar" aria-valuenow={Math.min(100, u.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${u.user.name} utilisation`}><span style={{ width: `${Math.min(100, u.pct)}%` }} /></div> {u.pct}%</td></tr>)}</tbody></table>
          )}
          {tab === 'Response-time warnings' && (
            <>
              <table><thead><tr><th>Job</th><th>Subject</th><th>SLA</th></tr></thead>
                <tbody>{warned.map(({ job }) => <tr key={job.id}><td><Link href={`/jobs/${job.id}`}>{job.jobNo}</Link></td><td>{job.subject}</td><td><SlaCell job={job} /></td></tr>)}</tbody></table>
              {!warned.length && <p className="muted">No open jobs are at or past the warning threshold.</p>}
              <p className="muted">Closed jobs: {k.slaMet} met, {k.slaBreachedClosed} breached (frozen at completion).</p>
            </>
          )}
          {tab === 'Jobs pending invoice' && (
            <>
              <table><thead><tr><th>Job</th><th>Customer</th><th>Subject</th><th>Status</th></tr></thead>
                <tbody>{k.pendingInvoice.map(j => <tr key={j.id}><td><Link href={`/jobs/${j.id}`}>{j.jobNo}</Link></td><td>{customerName(j.customerId)}</td><td>{j.subject}</td><td><StatusPill>{slaInfo(j, jobTypes.find(t => t.id === j.jobTypeId)).state}</StatusPill></td></tr>)}</tbody></table>
              {!k.pendingInvoice.length && <p className="muted">Every completed job has been invoiced.</p>}
            </>
          )}
        </div>
      </section>
    </AppShell>
  )
}
