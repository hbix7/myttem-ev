'use client'
import { useMemo, useState } from 'react'
import { AppShell, PageHeader } from '@/components/shared'
import { useCan } from '@/components/access'
import { useAuditStore } from '@/lib/store/audit'
import { downloadCsv } from '@/lib/export'
import { roleLabel } from '@/lib/rbac'
import type { Role } from '@/lib/types'

export default function AuditPage() {
  const entries = useAuditStore(s => s.entries)
  const canExport = useCan('audit', 'export')
  const [q, setQ] = useState('')
  const [mod, setMod] = useState('all')
  const modules = useMemo(() => Array.from(new Set(entries.map(e => e.module))).sort(), [entries])
  const rows = entries.filter(e => (mod === 'all' || e.module === mod) && `${e.userName} ${e.action} ${e.target} ${e.detail ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const when = (iso: string) => new Date(iso).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const role = (r: string) => roleLabel[r as Role] ?? r

  return (
    <AppShell crumb="Administration > Audit log">
      <PageHeader title="Audit log" subtitle="Who did what and when. Entries are added automatically and cannot be edited."
        action={canExport ? <button className="button secondary" onClick={() => downloadCsv('audit-log.csv', ['When', 'User', 'Role', 'Module', 'Action', 'Target', 'Detail'], rows.map(e => [e.at, e.userName, role(e.role), e.module, e.action, e.target, e.detail ?? '']))}>Export CSV</button> : undefined} />
      <main className="content">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input type="search" placeholder="Search user, action or target" aria-label="Search audit log" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 260 }} />
          <select aria-label="Filter by module" value={mod} onChange={e => setMod(e.target.value)}>
            <option value="all">All modules</option>
            {modules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <section className="table-wrap">
          <table className="data-table">
            <thead><tr><th>When</th><th>User</th><th>Module</th><th>Action</th><th>Target</th></tr></thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id}>
                  <td className="muted">{when(e.at)}</td>
                  <td><strong>{e.userName}</strong><br /><small className="muted">{role(e.role)}</small></td>
                  <td>{e.module}</td>
                  <td>{e.action}{e.detail && <><br /><small className="muted">{e.detail}</small></>}</td>
                  <td>{e.target}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">No entries match.</td></tr>}
            </tbody>
          </table>
        </section>
      </main>
    </AppShell>
  )
}
