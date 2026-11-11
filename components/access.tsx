'use client'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { canDo, type PermAction } from '@/lib/permissions'
import { homeForRole, roleLabel } from '@/lib/rbac'

export function useCan(moduleId: string, action: PermAction) {
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)?.role)
  return !!role && canDo(role, moduleId, action)
}

const DEMO_USERS: { id: string; label: string }[] = [
  { id: 'u3', label: 'Owner' },
  { id: 'u2', label: 'Admin' },
  { id: 'u4', label: 'Technician' },
]

export function RoleSwitcher() {
  const router = useRouter()
  const { users, currentUserId, setCurrentUser } = useStore()
  const current = users.find(u => u.id === currentUserId)
  const value = DEMO_USERS.some(d => d.id === currentUserId) ? currentUserId : 'u2'
  return (
    <label className="role-switch">
      <span className="sr-only">Viewing as</span>
      <span aria-hidden="true">Viewing as</span>
      <select
        value={value}
        aria-label={`Viewing as ${current ? roleLabel[current.role] : ''}`}
        onChange={e => {
          const u = users.find(x => x.id === e.target.value)
          if (!u) return
          setCurrentUser(u.id)
          toast.success(`Now viewing as ${roleLabel[u.role]}`)
          router.push(homeForRole(u.role))
        }}
      >
        {DEMO_USERS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
      </select>
    </label>
  )
}

export function AccessDenied() {
  const router = useRouter()
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)?.role ?? 'admin')
  return (
    <div className="content">
      <div className="denied" role="alert">
        <ShieldAlert size={32} strokeWidth={1.5} />
        <h1>Access denied</h1>
        <p>Your role ({roleLabel[role]}) does not have permission to open this page. Ask an Owner to change your access in Users and Roles.</p>
        <button className="button primary" onClick={() => router.push(homeForRole(role))}>Go to my home page</button>
      </div>
    </div>
  )
}
