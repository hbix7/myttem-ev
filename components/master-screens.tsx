'use client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Plus, Upload } from 'lucide-react'
import { AppShell, FilterBar, PageHeader, StatusPill } from '@/components/shared'
import { ChannelStatusPanel } from '@/components/comms'
import { Modal } from '@/components/kit'
import { useStore } from '@/lib/store'
import { useCommercialStore } from '@/lib/store/commercial'
import { flagMeta, useMasterStore, type FlagKey, type VocabKind } from '@/lib/store/master'
import { downloadCsv, readXlsxRows } from '@/lib/export'
import { roleLabel } from '@/lib/rbac'
import type { Customer, Role } from '@/lib/types'

const money = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const TENANT = 't-upe'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field-label">{label}{children}</label>
}

/* ---------------- Item Master ---------------- */
export function ItemMasterScreen() {
  const items = useCommercialStore(s => s.items)
  const { addItem, updateItem } = useCommercialStore.getState()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<{ id?: string; code: string; name: string; type: 'Part' | 'Service'; unitPrice: string } | null>(null)
  const rows = items.filter(i => `${i.code} ${i.name} ${i.type}`.toLowerCase().includes(q.toLowerCase()))
  const save = () => {
    if (!editing) return
    const price = Number(editing.unitPrice)
    if (!editing.code.trim() || !editing.name.trim() || !(price >= 0) || editing.unitPrice === '') return toast.error('Item code, description and a valid unit price are required')
    if (items.some(i => i.code.toLowerCase() === editing.code.trim().toLowerCase() && i.id !== editing.id)) return toast.error('Item code already exists')
    if (editing.id) updateItem(editing.id, { code: editing.code.trim(), name: editing.name.trim(), type: editing.type, unitPrice: price })
    else addItem({ code: editing.code.trim(), name: editing.name.trim(), type: editing.type, unitPrice: price })
    toast.success(editing.id ? 'Item updated' : 'Item created')
    setEditing(null)
  }
  return (
    <AppShell crumb="Master Data > Items">
      <PageHeader title="Item Master" crumb="Master Data > Items" action={<button className="button primary" onClick={() => setEditing({ code: '', name: '', type: 'Part', unitPrice: '' })}><Plus size={15} /> New item</button>} />
      <p className="page-intro">Parts and services used on quotations and invoices. The unit price is the UPE own price excl. SST; principal rate cards are managed under Rate Cards.</p>
      <FilterBar search={q} onSearch={setQ}>{null}</FilterBar>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Description</th><th>Type</th><th>Unit price (excl. SST)</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.map(i => (
              <tr key={i.id} className={i.active === false ? 'row-muted' : ''}>
                <td>{i.code}</td><td>{i.name}</td><td>{i.type}</td><td>{money(i.prices.UPE)}</td>
                <td><StatusPill>{i.active === false ? 'Inactive' : 'Active'}</StatusPill></td>
                <td className="row-actions">
                  <button className="button secondary sm" onClick={() => setEditing({ id: i.id, code: i.code, name: i.name, type: i.type as 'Part' | 'Service', unitPrice: String(i.prices.UPE) })}>Edit</button>
                  <button className="button secondary sm" onClick={() => { updateItem(i.id, { active: i.active === false }); toast.success(i.active === false ? 'Item reactivated' : 'Item deactivated') }}>{i.active === false ? 'Activate' : 'Deactivate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted" style={{ padding: 16 }}>No items match your search.</p>}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>{items.length} items. Deactivated items stay on past documents but cannot be added to new ones.</p>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit item' : 'New item'} description="Item code must be unique." footer={<><button className="button secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button primary" onClick={save}>Save</button></>}>
        {editing && (
          <div className="form-grid">
            <Field label="Item code"><input value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} /></Field>
            <Field label="Description"><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Type"><select value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value as 'Part' | 'Service' })}><option>Part</option><option>Service</option></select></Field>
            <Field label="Unit price (RM, excl. SST)"><input type="number" min="0" step="0.01" value={editing.unitPrice} onChange={e => setEditing({ ...editing, unitPrice: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </AppShell>
  )
}

/* ---------------- Dropdown vocabularies ---------------- */
const vocabTabs: { id: 'jobType' | VocabKind; label: string }[] = [
  { id: 'jobType', label: 'Job type' }, { id: 'faultType', label: 'Fault type' }, { id: 'equipment', label: 'Equipment' }, { id: 'site', label: 'Site' },
]
export function VocabularyScreen() {
  const [tab, setTab] = useState<'jobType' | VocabKind>('jobType')
  const vocab = useMasterStore(s => s.vocab)
  const { addVocab, updateVocab } = useMasterStore.getState()
  const jobTypes = useStore(s => s.jobTypes)
  const [draft, setDraft] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const list = tab === 'jobType' ? jobTypes.map(t => ({ id: t.id, value: t.name, active: t.active !== false })) : vocab.filter(v => v.kind === tab)
  const patchType = (id: string, patch: object) => useStore.setState(s => ({ jobTypes: s.jobTypes.map(t => t.id === id ? { ...t, ...patch } : t) }))
  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (list.some(x => x.value.toLowerCase() === v.toLowerCase())) return toast.error('That value already exists')
    if (tab === 'jobType') useStore.setState(s => ({ jobTypes: [...s.jobTypes, { id: crypto.randomUUID(), tenant_id: TENANT, active: true, code: v.slice(0, 3).toUpperCase(), name: v, isEv: false, slaHours: 48, warnPct: 80 }] }))
    else addVocab(tab, v)
    setDraft(''); toast.success('Value added')
  }
  const saveEdit = (id: string) => {
    const v = editVal.trim(); if (!v) return
    if (tab === 'jobType') patchType(id, { name: v }); else updateVocab(id, { value: v })
    setEditId(null); toast.success('Value updated')
  }
  const toggle = (id: string, active: boolean) => { if (tab === 'jobType') patchType(id, { active: !active }); else updateVocab(id, { active: !active }); toast.success(active ? 'Deactivated' : 'Reactivated') }
  return (
    <AppShell crumb="Master Data > Dropdowns">
      <PageHeader title="Dropdown Lists" crumb="Master Data > Dropdowns" />
      <p className="page-intro">Values offered when creating jobs. Deactivated values are hidden from new jobs but stay on existing records.</p>
      <div className="tabs" role="tablist">{vocabTabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setEditId(null) }}>{t.label}</button>)}</div>
      <div className="inline-add"><input placeholder={`Add ${vocabTabs.find(t => t.id === tab)?.label.toLowerCase()} value`} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} aria-label="New value" /><button className="button primary" onClick={add}><Plus size={15} /> Add</button></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Value</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{list.map(v => (
            <tr key={v.id} className={v.active ? '' : 'row-muted'}>
              <td>{editId === v.id ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(v.id) }} aria-label="Edit value" /> : v.value}</td>
              <td><StatusPill>{v.active ? 'Active' : 'Inactive'}</StatusPill></td>
              <td className="row-actions">
                {editId === v.id ? <button className="button primary sm" onClick={() => saveEdit(v.id)}>Save</button> : <button className="button secondary sm" onClick={() => { setEditId(v.id); setEditVal(v.value) }}>Edit</button>}
                <button className="button secondary sm" onClick={() => toggle(v.id, v.active)}>{v.active ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}

/* ---------------- Settings: approval limit, SLA, users & roles, flags ---------------- */
export function SettingsScreen() {
  const settings = useStore(s => s.settings)
  const jobTypes = useStore(s => s.jobTypes)
  const users = useStore(s => s.users)
  const flags = useMasterStore(s => s.flags)
  const [limit, setLimit] = useState(String(settings.approvalLimit))
  const [userModal, setUserModal] = useState<{ id?: string; name: string; email: string; role: Role } | null>(null)
  const patchType = (id: string, patch: object) => useStore.setState(s => ({ jobTypes: s.jobTypes.map(t => t.id === id ? { ...t, ...patch } : t) }))
  const saveLimit = () => {
    const n = Number(limit)
    if (!(n >= 0)) return toast.error('Enter a valid amount')
    useStore.setState(s => ({ settings: { ...s.settings, approvalLimit: n } }))
    toast.success(`Approval limit set to ${money(n)} excl. SST`)
  }
  const saveUser = () => {
    if (!userModal || !userModal.name.trim() || !/^\S+@\S+\.\S+$/.test(userModal.email)) return toast.error('Name and a valid email are required')
    if (userModal.id) useStore.setState(s => ({ users: s.users.map(u => u.id === userModal.id ? { ...u, name: userModal.name.trim(), email: userModal.email.trim(), role: userModal.role } : u) }))
    else useStore.setState(s => ({ users: [...s.users, { id: crypto.randomUUID(), tenant_id: TENANT, name: userModal.name.trim(), email: userModal.email.trim(), role: userModal.role, active: true }] }))
    toast.success('User saved'); setUserModal(null)
  }
  const staff = users.filter(u => u.role !== 'portal')
  return (
    <AppShell crumb="Settings">
      <PageHeader title="Settings" crumb="Settings" />
      <p className="page-intro">Confirmed values are editable by the administrator. Tenant: United Power Engineering.</p>

      <ChannelStatusPanel />

      <section className="card settings-block">
        <h2>Quotation approval limit</h2>
        <p className="muted">Quotations above this amount (excl. SST) go to the Owner for approval.</p>
        <div className="inline-add"><span className="muted">RM</span><input type="number" min="0" value={limit} onChange={e => setLimit(e.target.value)} aria-label="Approval limit in RM" /><button className="button primary" onClick={saveLimit}>Save</button></div>
      </section>

      <section className="card settings-block">
        <h2>SLA hours per job type</h2>
        <p className="muted">The clock runs while a job is open and stops at Completed. Warning at the percentage below, breach at 100%.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Job type</th><th>SLA hours</th><th>Warning at (%)</th></tr></thead>
          <tbody>{jobTypes.filter(t => t.active !== false).map(t => (
            <tr key={t.id}><td>{t.name}</td>
              <td><input className="narrow" type="number" min="1" value={t.slaHours} aria-label={`${t.name} SLA hours`} onChange={e => patchType(t.id, { slaHours: Math.max(1, Number(e.target.value) || 1) })} /></td>
              <td><input className="narrow" type="number" min="1" max="100" value={t.warnPct} aria-label={`${t.name} warning percent`} onChange={e => patchType(t.id, { warnPct: Math.min(100, Math.max(1, Number(e.target.value) || 80)) })} /></td></tr>))}
          </tbody></table></div>
      </section>

      <section className="card settings-block">
        <div className="block-head"><h2>Users and roles</h2><button className="button primary" onClick={() => setUserModal({ name: '', email: '', role: 'technician' })}><Plus size={15} /> New user</button></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{staff.map(u => (
            <tr key={u.id} className={u.active ? '' : 'row-muted'}><td>{u.name}</td><td>{u.email}</td><td>{roleLabel[u.role]}</td><td><StatusPill>{u.active ? 'Active' : 'Inactive'}</StatusPill></td>
              <td className="row-actions"><button className="button secondary sm" onClick={() => setUserModal({ id: u.id, name: u.name, email: u.email, role: u.role })}>Edit</button>
                <button className="button secondary sm" onClick={() => useStore.setState(s => ({ users: s.users.map(x => x.id === u.id ? { ...x, active: !x.active } : x) }))}>{u.active ? 'Deactivate' : 'Activate'}</button></td></tr>))}
          </tbody></table></div>
      </section>

      <section className="card settings-block">
        <h2>Milestone feature flags</h2>
        <div className="flag-list">{(Object.keys(flagMeta) as FlagKey[]).map(k => (
          <label key={k} className="flag-row"><input type="checkbox" checked={flags[k]} onChange={e => { useMasterStore.getState().setFlag(k, e.target.checked); toast.success(`${flagMeta[k].name} ${e.target.checked ? 'enabled' : 'disabled'}`) }} />
            <span><strong>{flagMeta[k].name}</strong><span className="muted"> {flagMeta[k].detail}</span></span></label>))}
        </div>
      </section>

      <Modal open={!!userModal} onClose={() => setUserModal(null)} title={userModal?.id ? 'Edit user' : 'New user'} description="Users sign in with their UPE email." footer={<><button className="button secondary" onClick={() => setUserModal(null)}>Cancel</button><button className="button primary" onClick={saveUser}>Save</button></>}>
        {userModal && (
          <div className="form-grid">
            <Field label="Name"><input value={userModal.name} onChange={e => setUserModal({ ...userModal, name: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={userModal.email} onChange={e => setUserModal({ ...userModal, email: e.target.value })} /></Field>
            <Field label="Role"><select value={userModal.role} onChange={e => setUserModal({ ...userModal, role: e.target.value as Role })}>{(['sysadmin', 'admin', 'owner', 'technician'] as Role[]).map(r => <option key={r} value={r}>{roleLabel[r]}</option>)}</select></Field>
          </div>
        )}
      </Modal>
    </AppShell>
  )
}

/* ---------------- SQL Accounting: one-time import and on-demand export ---------------- */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const pick = (header: string[], ...names: string[]) => header.findIndex(h => names.includes(norm(h)))

export function SqlAccountingScreen() {
  const [tab, setTab] = useState<'Import' | 'Export'>('Import')
  const imported = useCommercialStore(s => s.imported)
  const batches = useCommercialStore(s => s.batches)
  const customers = useStore(s => s.customers)
  const jobs = useStore(s => s.jobs)
  const [preview, setPreview] = useState<{ kind: 'customers' | 'items'; header: string[]; rows: string[][]; file: string } | null>(null)

  const load = async (kind: 'customers' | 'items', file: File) => {
    try {
      const all = await readXlsxRows(file)
      if (all.length < 2) return toast.error('The file has no data rows')
      setPreview({ kind, header: all[0], rows: all.slice(1), file: file.name })
    } catch { toast.error('Could not read that file. Use a .csv or .xlsx file.') }
  }
  const commit = () => {
    if (!preview) return
    const { kind, header, rows } = preview
    if (kind === 'items') {
      const c = pick(header, 'code', 'itemcode'), d = pick(header, 'description', 'name', 'itemname'), t = pick(header, 'type'), p = pick(header, 'unitprice', 'price', 'sellingprice')
      if (c < 0 || d < 0 || p < 0) return toast.error('Item file needs Code, Description and Unit Price columns')
      const parsed = rows.filter(r => r[c]).map(r => ({ code: r[c], name: r[d], type: (/serv/i.test(r[t] ?? '') ? 'Service' : 'Part') as 'Part' | 'Service', unitPrice: Number(String(r[p]).replace(/[^0-9.]/g, '')) || 0 }))
      const { added, updated } = useCommercialStore.getState().importItems(parsed)
      useCommercialStore.getState().markImported('items', [new Date().toISOString(), file2(preview.file)])
      toast.success(`Items imported: ${added} added, ${updated} updated`)
    } else {
      const n = pick(header, 'customer', 'customername', 'name', 'company'), ct = pick(header, 'contact', 'contactperson'), ph = pick(header, 'phone', 'tel', 'mobile'), em = pick(header, 'email'), ac = pick(header, 'sqlacccode', 'acccode', 'code', 'accountcode')
      if (n < 0) return toast.error('Customer file needs a Customer name column')
      let added = 0
      const list: Customer[] = [...useStore.getState().customers]
      for (const r of rows.filter(r => r[n])) {
        if (list.some(c => c.name.toLowerCase() === r[n].toLowerCase())) continue
        list.push({ id: crypto.randomUUID(), tenant_id: TENANT, name: r[n], contact: r[ct] ?? '', phone: r[ph] ?? '', email: r[em] ?? '', sqlAccCode: r[ac] ?? '', isCommercial: true }); added++
      }
      useStore.setState({ customers: list })
      useCommercialStore.getState().markImported('customers', [new Date().toISOString(), file2(preview.file)])
      toast.success(`Customers imported: ${added} new, ${rows.length - added} already existed`)
    }
    setPreview(null)
  }
  const exportJobs = () => {
    const st = useStore.getState()
    const done = st.jobs.filter(j => ['Completed', 'Invoiced', 'Closed'].includes(j.status))
    if (!done.length) return toast.error('No completed jobs to export')
    const batchNo = batches.length + 1
    const fileName = `SQL-EXPORT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(batchNo).padStart(3, '0')}.csv`
    downloadCsv(fileName, ['Job No', 'Customer', 'SQL Acc Code', 'Job Type', 'Completed At', 'Status'], done.map(j => {
      const c = st.customers.find(x => x.id === j.customerId)
      return [j.jobNo, c?.name, c?.sqlAccCode, st.jobTypes.find(t => t.id === j.jobTypeId)?.name, j.completedAt ?? j.endTime ?? '', j.status]
    }))
    useCommercialStore.setState(s => ({ batches: [...s.batches, { id: `BATCH-${String(batchNo).padStart(3, '0')}`, createdBy: st.users.find(u => u.id === st.currentUserId)?.name ?? 'Admin', createdAt: new Date().toISOString(), fileName, invoiceCount: done.length }] }))
    toast.success(`${done.length} completed jobs exported`)
  }
  const stamp = (k: string) => imported[k]?.[0] ? `Imported on ${imported[k][0].slice(0, 10)}${imported[k][1] ? ` (${imported[k][1]})` : ''}` : 'Not imported yet'
  const fileInputs = { customers: useRef<HTMLInputElement>(null), items: useRef<HTMLInputElement>(null) }
  return (
    <AppShell crumb="Integrations > SQL Accounting">
      <PageHeader title="SQL Accounting" crumb="Integrations > SQL Accounting" />
      <p className="page-intro">One-time import at start-up and an on-demand export. There is no scheduled export and no live link to SQL Accounting.</p>
      <div className="tabs" role="tablist">{(['Import', 'Export'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Import' ? (
        <div className="import-grid">
          {(['customers', 'items'] as const).map(k => (
            <section key={k} className="card settings-block">
              <h2>{k === 'customers' ? 'Customer list' : 'Item list'}</h2>
              <p className="muted">{stamp(k)}. {k === 'customers' ? `${customers.length} customers on file.` : 'Columns: Code, Description, Type, Unit Price.'}</p>
              <input ref={fileInputs[k]} type="file" accept=".csv,.xlsx" className="sr-only" aria-label={`Upload ${k} file`} onChange={e => { const f = e.target.files?.[0]; if (f) load(k, f); e.target.value = '' }} />
              <button className="button secondary" onClick={() => fileInputs[k].current?.click()}><Upload size={15} /> Choose CSV or XLSX</button>
            </section>
          ))}
          <p className="muted">The asset and site register is imported from its own page: <a href="/assets">Assets</a>.</p>
        </div>
      ) : (
        <div>
          <section className="card settings-block">
            <h2>Download completed job data</h2>
            <p className="muted">Creates an export batch and downloads a CSV of completed jobs ({jobs.filter(j => ['Completed', 'Invoiced', 'Closed'].includes(j.status)).length} available).</p>
            <button className="button primary" onClick={exportJobs}><Download size={15} /> Download completed job data</button>
          </section>
          <div className="table-wrap"><table><thead><tr><th>Batch</th><th>Created by</th><th>Created at</th><th>File</th><th>Jobs</th></tr></thead>
            <tbody>{batches.map(b => <tr key={b.id}><td>{b.id}</td><td>{b.createdBy}</td><td>{b.createdAt.slice(0, 16).replace('T', ' ')}</td><td>{b.fileName}</td><td>{b.invoiceCount}</td></tr>)}</tbody></table>
            {!batches.length && <p className="muted" style={{ padding: 16 }}>No export batches yet.</p>}</div>
        </div>
      )}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={`Preview: ${preview?.file ?? ''}`} description={`${preview?.rows.length ?? 0} rows detected. First 5 shown.`} width={720} footer={<><button className="button secondary" onClick={() => setPreview(null)}>Cancel</button><button className="button primary" onClick={commit}>Import {preview?.rows.length} rows</button></>}>
        {preview && <div className="table-wrap"><table><thead><tr>{preview.header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 5).map((r, i) => <tr key={i}>{preview.header.map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody></table></div>}
      </Modal>
    </AppShell>
  )
}
const file2 = (name: string) => name

/* ---------------- Asset / site register import ---------------- */
const targets = [
  { key: 'customer', label: 'Customer', required: true, names: ['customer', 'customername', 'company'] },
  { key: 'site', label: 'Site', required: true, names: ['site', 'sitename', 'location'] },
  { key: 'address', label: 'Address', required: false, names: ['address', 'siteaddress'] },
  { key: 'type', label: 'Asset type', required: false, names: ['assettype', 'asset', 'type', 'equipment'] },
  { key: 'serial', label: 'Serial no.', required: false, names: ['serial', 'serialno', 'serialnumber'] },
] as const

export function AssetRegisterScreen() {
  const assets = useStore(s => s.assets)
  const sites = useStore(s => s.sites)
  const customers = useStore(s => s.customers)
  const [q, setQ] = useState('')
  const [file, setFile] = useState<{ name: string; header: string[]; rows: string[][] } | null>(null)
  const [map, setMap] = useState<Record<string, number>>({})
  const input = useRef<HTMLInputElement>(null)
  const rows = useMemo(() => assets.map(a => { const s = sites.find(x => x.id === a.siteId); return { id: a.id, asset: a.type, serial: a.serialNo, site: s?.name ?? '', customer: customers.find(c => c.id === s?.customerId)?.name ?? '' } }).filter(r => Object.values(r).join(' ').toLowerCase().includes(q.toLowerCase())), [assets, sites, customers, q])
  const onFile = async (f: File) => {
    try {
      const all = await readXlsxRows(f)
      if (all.length < 2) return toast.error('The file has no data rows')
      const header = all[0]
      setMap(Object.fromEntries(targets.map(t => [t.key, pick(header, ...t.names)])))
      setFile({ name: f.name, header, rows: all.slice(1) })
    } catch { toast.error('Could not read that file. Use a .csv or .xlsx file.') }
  }
  const missing = targets.filter(t => t.required && (map[t.key] ?? -1) < 0)
  const mapped = (r: string[], k: string) => (map[k] ?? -1) >= 0 ? r[map[k]] ?? '' : ''
  const commit = () => {
    if (!file || missing.length) return
    const st = useStore.getState()
    const cust = [...st.customers], siteList = [...st.sites], assetList = [...st.assets]
    let a = 0, s = 0, c = 0
    for (const r of file.rows) {
      const cn = mapped(r, 'customer'), sn = mapped(r, 'site')
      if (!cn || !sn) continue
      let cu = cust.find(x => x.name.toLowerCase() === cn.toLowerCase())
      if (!cu) { cu = { id: crypto.randomUUID(), tenant_id: TENANT, name: cn, contact: '', phone: '', email: '', sqlAccCode: '', isCommercial: true }; cust.push(cu); c++ }
      let si = siteList.find(x => x.customerId === cu!.id && x.name.toLowerCase() === sn.toLowerCase())
      if (!si) { si = { id: crypto.randomUUID(), tenant_id: TENANT, customerId: cu.id, name: sn, address: mapped(r, 'address') }; siteList.push(si); s++ }
      const serial = mapped(r, 'serial'), type = mapped(r, 'type')
      if (type || serial) {
        if (serial && assetList.some(x => x.serialNo === serial)) continue
        assetList.push({ id: crypto.randomUUID(), tenant_id: TENANT, siteId: si.id, type: type || 'Asset', serialNo: serial }); a++
      }
    }
    useStore.setState({ customers: cust, sites: siteList, assets: assetList })
    useCommercialStore.getState().markImported('assets', [new Date().toISOString(), file.name])
    toast.success(`Imported ${a} assets, ${s} sites, ${c} customers`)
    setFile(null)
  }
  return (
    <AppShell crumb="Customers > Assets">
      <PageHeader title="Assets and sites" crumb="Customers > Assets" action={<><input ref={input} type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Upload asset register" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} /><button className="button primary" onClick={() => input.current?.click()}><Upload size={15} /> Import register</button></>} />
      <p className="page-intro">Asset and site register. Upload a CSV or XLSX, map the columns, preview, then import.</p>
      <FilterBar search={q} onSearch={setQ}>{null}</FilterBar>
      <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Serial</th><th>Site</th><th>Customer</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td>{r.asset}</td><td>{r.serial || '—'}</td><td>{r.site}</td><td>{r.customer}</td></tr>)}</tbody></table>
        {!rows.length && <p className="muted" style={{ padding: 16 }}>No assets found.</p>}</div>
      <Modal open={!!file} onClose={() => setFile(null)} title={`Map columns: ${file?.name ?? ''}`} description={`${file?.rows.length ?? 0} rows detected.`} width={760} footer={<><button className="button secondary" onClick={() => setFile(null)}>Cancel</button><button className="button primary" disabled={missing.length > 0} onClick={commit}>Import {file?.rows.length} rows</button></>}>
        {file && (
          <>
            <div className="form-grid">{targets.map(t => (
              <Field key={t.key} label={`${t.label}${t.required ? ' (required)' : ''}`}>
                <select value={map[t.key] ?? -1} onChange={e => setMap({ ...map, [t.key]: Number(e.target.value) })}>
                  <option value={-1}>Not mapped</option>{file.header.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select></Field>))}
            </div>
            {missing.length > 0 && <p className="field-error">Map: {missing.map(m => m.label).join(', ')}</p>}
            <div className="table-wrap"><table><thead><tr>{targets.map(t => <th key={t.key}>{t.label}</th>)}</tr></thead>
              <tbody>{file.rows.slice(0, 5).map((r, i) => <tr key={i}>{targets.map(t => <td key={t.key}>{mapped(r, t.key) || '—'}</td>)}</tr>)}</tbody></table></div>
          </>
        )}
      </Modal>
    </AppShell>
  )
}
