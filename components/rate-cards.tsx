'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { AppShell, EmptyState, PageHeader } from '@/components/shared'
import { useStore } from '@/lib/store'
import { useCommercialStore, PRINCIPAL_CODES, PRINCIPAL_NAMES, rateCardLabel, type PrincipalCode, type RateItem } from '@/lib/store/commercial'

const money = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`

function PriceCell({ item, code, canEdit }: { item: RateItem; code: PrincipalCode; canEdit: boolean }) {
  const setPrice = useCommercialStore(s => s.setPrice)
  const current = item.prices[code]
  const [draft, setDraft] = useState(String(current))
  const [synced, setSynced] = useState(current)
  if (synced !== current) { setSynced(current); setDraft(String(current)) }

  const commit = () => {
    const next = Number(draft)
    if (!Number.isFinite(next) || next < 0) { setDraft(String(current)); toast.error('Enter a price of zero or more'); return }
    if (next === current) return
    setPrice(item.id, code, next)
    toast.success(`${item.code} updated to ${money(next)} on the ${PRINCIPAL_NAMES[code]} rate card`)
  }

  if (!canEdit) return <span>{money(current)}</span>
  return (
    <span className="rate-input">
      <span className="muted">RM</span>
      <input
        className="field-input"
        type="number" min="0" step="0.01" inputMode="decimal"
        aria-label={`${item.name} price on the ${PRINCIPAL_NAMES[code]} rate card`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
    </span>
  )
}

export function RateCardsScreen() {
  const [code, setCode] = useState<PrincipalCode>('ZEEKR')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('All')
  const items = useCommercialStore(s => s.items).filter(i => i.active !== false)
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)?.role)
  const canEdit = role === 'admin' || role === 'owner'

  const rows = items.filter(i =>
    (type === 'All' || i.type === type) && `${i.code} ${i.name}`.toLowerCase().includes(search.toLowerCase()))
  const types = ['All', ...Array.from(new Set(items.map(i => i.type)))]

  return (
    <AppShell crumb="Master Data > Rate Cards">
      <PageHeader
        title="Rate cards"
        subtitle={canEdit ? 'Set the unit price for each item, per rate card. Changes apply to new quotations immediately; existing quotations keep their prices.' : 'View-only. Admin or owner can change prices.'}
      />
      <div className="rate-body">
      <div className="tabs" role="tablist">
        {PRINCIPAL_CODES.map(c => (
          <button key={c} role="tab" aria-selected={code === c} className={code === c ? 'active' : ''} onClick={() => setCode(c)}>{PRINCIPAL_NAMES[c]}</button>
        ))}
      </div>
      <div className="filter-bar">
        <input className="field-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item code or name..." />
        <select className="field-input" aria-label="Item type" value={type} onChange={e => setType(e.target.value)}>
          {types.map(t => <option key={t} value={t}>{t === 'All' ? 'All types' : t}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Code</th><th>Item</th><th>Type</th><th className="num">{rateCardLabel(code)} price (excl. SST)</th></tr>
          </thead>
          <tbody>
            {rows.map(i => (
              <tr key={i.id}>
                <td>{i.code}</td>
                <td>{i.name}</td>
                <td>{i.type}</td>
                <td className="num"><PriceCell item={i} code={code} canEdit={canEdit} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <EmptyState title="No items match" helper="Try a different search or type filter." />}
      </div>
      </div>
    </AppShell>
  )
}
