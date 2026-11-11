'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { AppShell, PageHeader, StatusPill } from '@/components/shared'
import { useCan } from '@/components/access'
import { useStore } from '@/lib/store'
import { roleLabel } from '@/lib/rbac'
import { DEMO_ROLES, PERMISSIONS, PERM_ACTIONS, PERM_MODULES } from '@/lib/permissions'
import { logAudit } from '@/lib/store/audit'
import type { Role } from '@/lib/types'

const ROLE_OPTIONS: Role[] = ['owner', 'admin', 'technician']

export default function UsersPage() {
  const { users } = useStore()
  const canCreate = useCan('users', 'create')
  const canEdit = useCan('users', 'edit')
  const [form, setForm] = useState({ name: '', email: '', role: 'admin' as Role })

  const setUser = (id: string, patch: Partial<{ role: Role; active: boolean }>, what: string, who: string) => {
    useStore.setState(s => ({ users: s.users.map(u => (u.id === id ? { ...u, ...patch } : u)) }))
    logAudit('Users and Roles', what, who)
  }

  const add = () => {
    if (!form.name.trim() || !form.email.includes('@')) { toast.error('Enter a name and a valid email'); return }
    useStore.setState(s => ({ users: [...s.users, { id: `u${Date.now()}`, name: form.name.trim(), email: form.email.trim(), role: form.role, active: true }] }))
    logAudit('Users and Roles', 'Added user', form.name.trim(), `Role: ${roleLabel[form.role]}`)
    toast.success(`${form.name.trim()} added`)
    setForm({ name: '', email: '', role: 'admin' })
  }

  const staff = users.filter(u => u.role !== 'portal')

  return (
    <AppShell crumb="Administration > Users and Roles">
      <PageHeader title="Users and roles" subtitle="Who can sign in, and what each role can see and do." />
      <main className="content">
        {canCreate && (
          <section className="table-card" style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>Role
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>{ROLE_OPTIONS.map(r => <option key={r} value={r}>{roleLabel[r]}</option>)}</select>
            </label>
            <button className="button primary" onClick={add}>Add user</button>
          </section>
        )}
        <section className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {staff.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td className="muted">{u.email}</td>
                  <td>
                    {canEdit && u.role !== 'sysadmin' ? (
                      <select value={u.role} aria-label={`Role for ${u.name}`} onChange={e => setUser(u.id, { role: e.target.value as Role }, 'Changed role', `${u.name} to ${roleLabel[e.target.value as Role]}`)}>
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{roleLabel[r]}</option>)}
                      </select>
                    ) : roleLabel[u.role]}
                  </td>
                  <td>
                    {canEdit ? (
                      <button className="button secondary" onClick={() => setUser(u.id, { active: !u.active }, u.active ? 'Deactivated user' : 'Activated user', u.name)}>{u.active ? 'Deactivate' : 'Activate'}</button>
                    ) : <StatusPill>{u.active ? 'Active' : 'Inactive'}</StatusPill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <h2 style={{ fontSize: 16, margin: '8px 0 0' }}>Permission matrix</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Each cell lists the actions the role can perform: view, create, edit, approve, export.</p>
        <section className="table-wrap">
          <table className="data-table perm-grid">
            <thead><tr><th>Module</th>{DEMO_ROLES.map(r => <th key={r}>{roleLabel[r]}</th>)}</tr></thead>
            <tbody>
              {PERM_MODULES.map((m, i) => (
                <>
                  {(i === 0 || PERM_MODULES[i - 1].group !== m.group) && <tr key={`g-${m.group}`} className="perm-group"><td colSpan={4}>{m.group}</td></tr>}
                  <tr key={m.id}>
                    <td>{m.label}</td>
                    {DEMO_ROLES.map(r => {
                      const set = PERMISSIONS[m.id]?.[r] ?? []
                      return <td key={r}>{set.length ? PERM_ACTIONS.filter(a => set.includes(a)).join(', ') : <span className="muted">No access</span>}</td>
                    })}
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </AppShell>
  )
}
