'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Briefcase, MessageSquare, Plus } from 'lucide-react'
import { AppShell, EmptyState, ExportMenu, FilterBar, PageHeader, ShellSkeleton, SlaCell, StatusPill, initials, useHydrated } from '@/components/shared'
import { DataTable, type Column } from '@/components/kit'
import { useStore } from '@/lib/store'
import type { Job } from '@/lib/types'

const statuses = ['Created', 'Assigned', 'In Progress', 'Completed', 'Invoiced', 'Closed']

export default function JobsPage() {
  const hydrated = useHydrated()
  const router = useRouter()
  const { jobs, customers, users, jobTypes, principals } = useStore()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [assignee, setAssignee] = useState('')
  const [type, setType] = useState('')
  const [principal, setPrincipal] = useState('')
  const [sla, setSla] = useState('')

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status')
    if (s) setStatus(s)
  }, [])

  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? '—'
  const filtered = useMemo(() => jobs.filter(j => {
    const s = search.toLowerCase()
    return (!s || j.jobNo.toLowerCase().includes(s) || j.subject.toLowerCase().includes(s))
      && (!status || j.status === status)
      && (!assignee || j.technicianId === assignee) && (!type || j.jobTypeId === type) && (!principal || j.principalId === principal)
  }), [jobs, search, status, assignee, type, principal])

  if (!hydrated) return <ShellSkeleton />

  const chips = [
    status && { label: `Status: ${status}`, onRemove: () => setStatus('') },
    sla && { label: `SLA: ${sla}`, onRemove: () => setSla('') },
    assignee && { label: `Assignee: ${users.find(u => u.id === assignee)?.name}`, onRemove: () => setAssignee('') },
    type && { label: `Type: ${jobTypes.find(t => t.id === type)?.name}`, onRemove: () => setType('') },
    principal && { label: `Principal: ${principals.find(p => p.id === principal)?.name}`, onRemove: () => setPrincipal('') },
  ].filter(Boolean) as { label: string; onRemove: () => void }[]
  const clear = () => { setStatus(''); setSla(''); setAssignee(''); setType(''); setPrincipal('') }

  const columns: Column<Job>[] = [
    { key: 'job', header: 'Job', sortValue: j => j.jobNo, render: j => (
      <><span className="mono job-link">{j.jobNo}</span><span className="channel-line"><MessageSquare size={11} />{j.channel}</span></>
    ) },
    { key: 'subject', header: 'Subject', sortValue: j => j.subject, render: j => (
      <div className="subject-cell">{j.subject}<small>{jobTypes.find(t => t.id === j.jobTypeId)?.name}</small></div>
    ) },
    { key: 'status', header: 'Status', sortValue: j => statuses.indexOf(j.status), render: j => <StatusPill>{j.status}</StatusPill> },
    { key: 'sla', header: 'SLA', render: j => <SlaCell job={j} /> },
    { key: 'tech', header: 'Technician', render: j => {
      const t = users.find(u => u.id === j.technicianId)
      return t ? <span className="person"><span className="avatar sm">{initials(t.name)}</span>{t.name}</span>
        : <span className="person unassigned"><span className="avatar sm dashed">?</span>Unassigned</span>
    } },
    { key: 'customer', header: 'Customer', sortValue: j => customerName(j.customerId), render: j => customerName(j.customerId) },
    { key: 'updated', header: 'Last updated', sortValue: j => j.createdAt, render: j => <span className="muted">{new Date(j.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span> },
  ]

  return (
    <AppShell crumb="Jobs">
      <PageHeader title="Jobs" action={<><ExportMenu jobs={filtered} /><Link href="/jobs/new" className="button primary"><Plus size={16} />New Job</Link></>} />
      <section className="content">
        <FilterBar search={search} onSearch={setSearch} chips={chips} onClear={clear}>
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All status</option>{statuses.map(x => <option key={x}>{x}</option>)}</select>
          <select value={sla} onChange={e => setSla(e.target.value)} aria-label="SLA state"><option value="">All SLA states</option>{['On track', 'Warning', 'Breached', 'Met'].map(x => <option key={x}>{x}</option>)}</select>
          
          <select value={assignee} onChange={e => setAssignee(e.target.value)} aria-label="Assignee"><option value="">All assignees</option>{users.filter(u => u.role === 'technician').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <select value={type} onChange={e => setType(e.target.value)} aria-label="Job type"><option value="">All job types</option>{jobTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={principal} onChange={e => setPrincipal(e.target.value)} aria-label="Principal"><option value="">All principals</option>{principals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </FilterBar>
        <DataTable title="All jobs" columns={columns} rows={filtered} rowKey={j => j.id} count={filtered.length} footerLabel="jobs"
          onRowClick={j => router.push(`/jobs/${j.id}`)}
          empty={<EmptyState icon={<Briefcase size={22} />} title="No jobs match these filters" helper="Try removing a filter or searching for a different job number."
            action={<button className="button secondary" onClick={() => { clear(); setSearch('') }}>Clear filters</button>} />} />
      </section>
    </AppShell>
  )
}
