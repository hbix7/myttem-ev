'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell, BarChart3, CalendarClock, Check, ChevronDown, ChevronRight, ClipboardList, Database, Download, FileText, Inbox, LayoutDashboard,
  LogOut, Menu, MessageSquare, Moon, Package, PanelLeftClose, PanelLeftOpen, Receipt, Search, Settings, Shield, SlidersHorizontal, Sun, Users, Wrench, X, Zap, ShoppingCart, FolderOpen, Briefcase,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { useFieldStore } from '@/lib/store/field'
import { useOperationsStore } from '@/lib/store/operations'
import { getNow } from '@/lib/clock'
import { runEvAutomation } from '@/lib/ev'
import { nav, sectionOrder, canOpenPath, homeForRole, roleLabel } from '@/lib/rbac'
import { slaInfo } from '@/lib/selectors'
import { buildPdfDataUrl, downloadCsv, downloadDataUrl, downloadXlsx } from '@/lib/export'
import type { Job } from '@/lib/types'
import { toast } from 'sonner'

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

/* ---------- Status tones ---------- */
const toneByLabel: Record<string, string> = {
  Created: 'slate', Assigned: 'blue', 'In Progress': 'amber', Completed: 'green', Invoiced: 'violet', Closed: 'grey',
  'On track': 'green', Warning: 'amber', Breached: 'red', Met: 'teal',
  Draft: 'grey', Sent: 'blue', Accepted: 'green', Declined: 'red', 'Pending owner approval': 'amber', 'Awaiting approval': 'amber',
  'Sent for sign-off': 'amber', 'Signed off': 'green', Paid: 'green', 'On hold': 'orange', Overdue: 'red',
  'Not submitted': 'grey', Submitting: 'blue', 'Pending validation': 'amber', Valid: 'green', Invalid: 'red', Cancelled: 'grey', Rejected: 'orange',
}
const toneNames = ['slate', 'blue', 'amber', 'green', 'violet', 'grey', 'red', 'teal', 'orange']
export function toneFor(text: string): string {
  if (toneByLabel[text]) return toneByLabel[text]
  if (/Breach|Declin|Overdue|Invalid|Fail/.test(text)) return 'red'
  if (/Warn|Await|Due|Pending|Hold/.test(text)) return 'amber'
  if (/Complet|Approv|Met|Paid|Valid|Success/.test(text)) return 'green'
  if (/Created|Open/.test(text)) return 'slate'
  if (/Assign|Sent/.test(text)) return 'blue'
  if (/Progress/.test(text)) return 'amber'
  return 'grey'
}
export function StatusPill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const text = typeof children === 'string' ? children : String(Array.isArray(children) ? children[0] : children)
  const key = tone === 'zinc' ? 'grey' : tone && toneNames.includes(tone) ? tone : toneFor(tone ?? text)
  return <span className={`badge tone-${key}`}>{children}</span>
}

/* ---------- Page header ---------- */
const subtitles: Record<string, string> = {
  Jobs: 'Track every service job from intake to invoice.',
  'Operations dashboard': 'Live view of workload, SLA health and approvals.',
  Scheduler: 'Assign technicians and balance daily capacity.',
  Quotations: 'Draft, approve and follow up customer quotations.',
  Invoices: 'Raise invoices, get customer sign-off and export them to SQL Accounting.',
  'EV deadlines': 'Countdowns for each EV programme milestone.',
  'EV chargebacks': 'Invoiced, claimable and referral amounts per case.',
  'EV conversion': 'Quotations issued against installations completed.',
  Customers: 'Customer accounts, contacts and sites.',
  Reports: 'Operational and commercial reporting.',
  'Pending intake': 'Review incoming requests before they become jobs.',
}
export function PageHeader({ title, subtitle, action }: { title: string; crumb?: string; subtitle?: string; action?: React.ReactNode }) {
  const sub = subtitle ?? subtitles[title]
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <p className="subtitle">{sub}</p>}
      </div>
      {action && <div className="page-header-actions">{action}</div>}
    </div>
  )
}

/* ---------- Theme ---------- */
export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), [])
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('myttem-theme', next ? 'dark' : 'light') } catch {}
    setDark(next)
  }
  return (
    <button className="icon-button" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

export function initials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, close])
  return ref
}

function UserMenu() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { users, currentUserId, setCurrentUser, advanceClock, resetClock } = useStore()
  const user = users.find(u => u.id === currentUserId)!
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <div className="sidebar-foot" ref={ref}>
      {open && (
        <div className="menu-pop user-menu" role="menu">
          <p className="menu-label">Switch role (demo)</p>
          {users.filter(u => ['u3', 'u2', 'u4'].includes(u.id)).map(u => (
            <button key={u.id} role="menuitem" className={`menu-item ${u.id === currentUserId ? 'selected' : ''}`} onClick={() => { setCurrentUser(u.id); setOpen(false); toast.success(`Switched to ${roleLabel[u.role]}`); router.push(homeForRole(u.role)) }}>
              {u.name}<span>{roleLabel[u.role]}</span>
            </button>
          ))}
          <div className="menu-divider" />
          <p className="menu-label">Advance demo clock</p>
          <button role="menuitem" className="menu-item" onClick={() => advanceClock(3600000)}>+1 hour</button>
          <button role="menuitem" className="menu-item" onClick={() => advanceClock(86400000)}>+1 day</button>
          <button role="menuitem" className="menu-item" onClick={() => { resetClock(); setOpen(false) }}>Reset clock</button>
          <button role="menuitem" className="menu-item" onClick={() => { useFieldStore.getState().toggleConflictSimulation(); setOpen(false); toast.success('Next offline sync will create a conflict') }}>Simulate sync conflict</button>
          <div className="menu-divider" />
          <button role="menuitem" className="menu-item danger" onClick={() => { setOpen(false); toast('Log out is disabled in this demo') }}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: 'inherit', fontSize: 13, textTransform: 'none' }}><LogOut size={14} /> Log out</span></button>
        </div>
      )}
      <button className="user-block" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <span className="avatar">{initials(user.name)}</span>
        <span className="user-copy">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
          <span className="role-badge">{roleLabel[user.role]}</span>
        </span>
        <ChevronDown size={14} className="chev" style={{ color: 'var(--muted-foreground)' }} />
      </button>
    </div>
  )
}

/* ---------- Navigation ---------- */
const sectionIcons: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  Overview: LayoutDashboard, 'Work Management': ClipboardList, Commercial: Receipt, 'EV Programme': Zap, Documents: FileText,
  Directory: Users, Communication: MessageSquare, Insights: BarChart3, Administration: Settings,
}
function NavIcon({ label }: { label: string }) {
  const p = { size: 18, strokeWidth: 1.75 }
  if (label === 'Dashboard') return <LayoutDashboard {...p} />
  if (label === 'Jobs') return <Briefcase {...p} />
  if (label === 'Scheduler') return <CalendarClock {...p} />
  if (label === 'Pending intake') return <Inbox {...p} />
  if (label === 'Quotations') return <FileText {...p} />
  if (label === 'Invoices') return <Receipt {...p} />
  if (label.startsWith('EV')) return <Zap {...p} />
  if (label.includes('Document')) return <FolderOpen {...p} />
  if (label === 'Customers') return <Users {...p} />
  if (label === 'Master Data') return <Database {...p} />
  if (label === 'Communication') return <MessageSquare {...p} />
  if (label === 'Reports') return <BarChart3 {...p} />
  if (label === 'SQL Accounting') return <ShoppingCart {...p} />
  if (label === 'SLA') return <Shield {...p} />
  if (label === 'Portal Users') return <Users {...p} />
  if (label === 'Settings') return <Settings {...p} />
  if (label === 'Sync Conflicts') return <SlidersHorizontal {...p} />
  return <Package {...p} />
}

const isActivePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/')

export function AppShell({ children, crumb }: { children: React.ReactNode; crumb?: string; action?: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { users, currentUserId } = useStore()
  const user = users.find(u => u.id === currentUserId)!
  const demoOffset = useStore(s => s.demoOffset)
  useEffect(() => { runEvAutomation() }, [demoOffset])
  const visible = nav.filter(n => n.roles.includes(user.role))
  const activeItem = visible.filter(i => isActivePath(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]
  const activeSection = activeItem?.section
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(activeSection ? [activeSection] : []))
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  const draftLeadCount = useOperationsStore(s => s.leads.filter(l => l.status === 'Draft').length)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('myttem-sidebar') === 'collapsed')
      const saved = JSON.parse(localStorage.getItem('myttem-nav-open') || 'null') as string[] | null
      if (saved) setOpenSections(new Set([...saved, ...(activeSection ? [activeSection] : [])]))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (activeSection) setOpenSections(prev => (prev.has(activeSection) ? prev : new Set(prev).add(activeSection)))
    setMobileOpen(false)
  }, [pathname, activeSection])
  useEffect(() => {
    if (!canOpenPath(user.role, pathname)) router.replace(homeForRole(user.role))
  }, [pathname, router, user.role])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    setTip(null)
    try { localStorage.setItem('myttem-sidebar', next ? 'collapsed' : 'expanded') } catch {}
  }
  const toggleSection = (section: string) => setOpenSections(prev => {
    const next = new Set(prev)
    if (next.has(section)) next.delete(section); else next.add(section)
    try { localStorage.setItem('myttem-nav-open', JSON.stringify([...next])) } catch {}
    return next
  })
  const showTip = (e: React.SyntheticEvent<HTMLElement>, label: string) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 })
  }

  const sections = sectionOrder(user.role, Array.from(new Set(visible.map(i => i.section))))
  const crumbParts = crumb?.includes('>')
    ? crumb.split('>').map(s => s.trim())
    : activeItem && pathname === activeItem.href ? [activeItem.section, activeItem.label]
    : [crumb ?? activeItem?.section ?? 'Jobs', pathname.split('/').filter(Boolean).pop()?.replaceAll('-', ' ') || 'Jobs']
  const crumbLink = crumb?.includes('>') ? (visible.find(i => i.label === crumbParts[0] || i.label === crumbParts[0].replace(/s$/, ''))?.href ?? activeItem?.href) : undefined

  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'drawer-open' : ''}`}>
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-head">
          <div className="brand-mark"><Wrench size={18} /></div>
          <div className="brand-copy"><strong>Myttem Service Management</strong><small>United Power Engineering</small></div>
          <button className="icon-button mobile-only" style={{ marginLeft: 'auto' }} aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <nav className="nav-scroll">
          <div className="nav-expanded">
            {sections.map(section => {
              const isOpen = openSections.has(section)
              const Icon = sectionIcons[section] ?? Package
              const id = `nav-${section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
              return (
                <div key={section}>
                  <button className={`nav-group-btn ${activeSection === section ? 'has-active' : ''}`} aria-expanded={isOpen} aria-controls={id} onClick={() => toggleSection(section)}>
                    <Icon size={18} strokeWidth={1.75} /><span className="group-label">{section}</span><ChevronRight size={14} className="chev" />
                  </button>
                  <div id={id} className="nav-collapse" data-open={isOpen}>
                    <div className="nav-collapse-inner">
                      <ul className="nav-sub">
                        {visible.filter(i => i.section === section).map(item => (
                          <li key={item.href}>
                            <Link href={item.href} className={`nav-link ${activeItem?.href === item.href ? 'active' : ''}`} aria-current={activeItem?.href === item.href ? 'page' : undefined} tabIndex={isOpen ? 0 : -1}>
                              <NavIcon label={item.label} /><span className="nav-label">{item.label}</span>
                              {item.label === 'Pending intake' && draftLeadCount > 0 && <b className="count">{draftLeadCount}</b>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="nav-flat">
            {sections.map((section, si) => (
              <div key={section} style={{ display: 'contents' }}>
                {si > 0 && <hr />}
                {visible.filter(i => i.section === section).map(item => (
                  <Link key={item.href} href={item.href} aria-label={item.label} className={`nav-link ${activeItem?.href === item.href ? 'active' : ''}`}
                    onMouseEnter={e => showTip(e, item.label)} onMouseLeave={() => setTip(null)} onFocus={e => showTip(e, item.label)} onBlur={() => setTip(null)}>
                    <NavIcon label={item.label} />
                    {item.label === 'Pending intake' && draftLeadCount > 0 && <b className="count">{draftLeadCount}</b>}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </nav>
        <UserMenu />
      </aside>
      {tip && <div className="side-tip" style={{ top: tip.top, left: tip.left }} role="tooltip">{tip.label}</div>}
      <div className="drawer-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <main className="main">
        <header className="topbar">
          <button className="icon-button desktop-only" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleCollapsed}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="icon-button mobile-only" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={18} /></button>
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            {crumbParts.map((part, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <ChevronRight size={14} />}
                {i === crumbParts.length - 1 ? <strong style={{ textTransform: 'capitalize' }}>{part}</strong>
                  : i === 0 && crumbLink ? <Link href={crumbLink}>{part}</Link> : <span>{part}</span>}
              </span>
            ))}
          </nav>
          <div className="top-actions">
            <Link href="/intake" className="icon-button" aria-label={`Notifications${draftLeadCount ? `, ${draftLeadCount} pending` : ''}`}>
              <Bell size={18} />{draftLeadCount > 0 && <span className="dot-badge">{draftLeadCount}</span>}
            </Link>
            <ThemeToggle />
            <span className="avatar sm" aria-hidden="true" style={{ marginLeft: 4 }}>{initials(user.name)}</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}

/* ---------- Loading skeleton shown until the persisted store hydrates ---------- */
export function ShellSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="app-shell" aria-busy="true" aria-label="Loading">
      <aside className="sidebar">
        <div className="sidebar-head"><span className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} /><span className="skeleton" style={{ width: 140, height: 14 }} /></div>
        <div className="nav-scroll">{Array.from({ length: 7 }).map((_, i) => <span key={i} className="skeleton" style={{ height: 32, margin: '4px 0' }} />)}</div>
      </aside>
      <main className="main">
        <header className="topbar"><span className="skeleton" style={{ width: 180, height: 14 }} /></header>
        <div className="page-header"><div><span className="skeleton" style={{ width: 220, height: 30 }} /><span className="skeleton" style={{ width: 320, height: 14, marginTop: 10 }} /></div></div>
        <div className="content">
          <div className="table-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: rows }).map((_, i) => <span key={i} className="skeleton" style={{ height: 22 }} />)}
          </div>
        </div>
      </main>
    </div>
  )
}

/* ---------- Filters ---------- */
export function FilterBar({ search, onSearch, children, placeholder = 'Search job no. or subject...', chips = [], onClear }: {
  search: string; onSearch: (v: string) => void; children?: React.ReactNode; placeholder?: string
  chips?: { label: string; onRemove: () => void }[]; onClear?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="filter-wrap">
      <div className="filter-bar">
        <div className="search">
          <Search size={16} />
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder={placeholder} aria-label="Search" />
        </div>
        {children && (
          <button className="button secondary filters-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <SlidersHorizontal size={15} />More filters
          </button>
        )}
        {children && <div className={`filters ${open ? 'open' : ''}`}>{children}</div>}
      </div>
      {chips.length > 0 && (
        <div className="active-filters" aria-label="Active filters">
          {chips.map(c => (
            <button key={c.label} className="chip-remove" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`}>{c.label}<X size={12} /></button>
          ))}
          {onClear && <button className="link-button" onClick={onClear}>Clear all</button>}
        </div>
      )}
    </div>
  )
}

export function SlaCell({ job }: { job: Job }) {
  const type = useStore(s => s.jobTypes.find(t => t.id === job.jobTypeId))
  const info = slaInfo(job, type)
  return (
    <div className="sla-cell">
      <StatusPill tone={info.state}>{info.state}</StatusPill>
      <span>{info.frozen ? (info.state === 'Met' ? 'Stopped at completion' : info.label) : info.label}</span>
    </div>
  )
}

export function ExportMenu({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const build = () => {
    const st = useStore.getState()
    const header = ['Job', 'Subject', 'Customer', 'Type', 'Status', 'Channel', 'Technician', 'SLA', 'Created']
    const rows = jobs.map(j => {
      const t = st.jobTypes.find(x => x.id === j.jobTypeId)
      return [j.jobNo, j.subject, st.customers.find(c => c.id === j.customerId)?.name ?? '', t?.name ?? '', j.status, j.channel, st.users.find(u => u.id === j.technicianId)?.name ?? 'Unassigned', slaInfo(j, t).label, j.createdAt.slice(0, 10)]
    })
    return { header, rows }
  }
  const run = async (kind: 'xlsx' | 'csv' | 'pdf') => {
    const { header, rows } = build()
    if (kind === 'csv') downloadCsv('myttem-jobs.csv', header, rows)
    if (kind === 'xlsx') await downloadXlsx('myttem-jobs.xlsx', header, rows)
    if (kind === 'pdf') downloadDataUrl(buildPdfDataUrl('Myttem jobs report', rows.map(r => r.slice(0, 7).join('  |  '))), 'myttem-jobs.pdf')
    toast.success(`${kind.toUpperCase()} export downloaded (${rows.length} jobs)`)
    setOpen(false)
  }
  return (
    <div className="row-menu-wrap" ref={ref}>
      <button className="button secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Download size={15} />Export<ChevronDown size={14} /></button>
      {open && (
        <div className="menu-pop row-menu" role="menu">
          <button role="menuitem" className="menu-item" onClick={() => run('xlsx')}>Excel (.xlsx)</button>
          <button role="menuitem" className="menu-item" onClick={() => run('csv')}>CSV (.csv)</button>
          <button role="menuitem" className="menu-item" onClick={() => run('pdf')}>PDF (.pdf)</button>
        </div>
      )}
    </div>
  )
}

export function EmptyState({ title, helper, action, icon }: { title: string; helper: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon ?? <FileText size={22} />}</span>
      <strong>{title}</strong>
      <span>{helper}</span>
      {action}
    </div>
  )
}

export function LiveIndicator({ label = 'Updated live' }: { label?: string }) {
  return <span className="live"><i aria-hidden="true" />{label}</span>
}

export { Check }
