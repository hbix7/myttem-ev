'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { homeForRole, roleLabel } from '@/lib/rbac'
import { logAudit } from '@/lib/store/audit'

export default function LoginPage() {
  const router = useRouter()
  const { users, setCurrentUser } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const demo = users.filter(u => ['u3', 'u2', 'u4'].includes(u.id))

  const enter = (id: string) => {
    const u = users.find(x => x.id === id)
    if (!u || !u.active) { toast.error('This account is inactive'); return }
    setCurrentUser(u.id)
    logAudit('Sign in', 'Signed in', u.name, roleLabel[u.role])
    router.push(homeForRole(u.role))
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={e => {
        e.preventDefault()
        const u = users.find(x => x.email.toLowerCase() === email.trim().toLowerCase())
        if (!u || !password) { toast.error('Check your email and password'); return }
        enter(u.id)
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="brand-mark"><Wrench size={18} /></div>
          <div className="brand-copy"><strong>Myttem Service Management</strong><small>United Power Engineering</small></div>
        </div>
        <h1>Sign in</h1>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@upe.com.my" /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="button primary" type="submit">Sign in</button>
        <div className="demo-accounts">
          <small style={{ color: 'var(--muted-foreground)' }}>Demo accounts</small>
          {demo.map(u => (
            <button type="button" key={u.id} onClick={() => enter(u.id)}>
              <span>{u.name}</span><span style={{ color: 'var(--muted-foreground)' }}>{roleLabel[u.role]}</span>
            </button>
          ))}
        </div>
      </form>
    </main>
  )
}
