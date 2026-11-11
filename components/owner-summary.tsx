'use client'
import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { getNow } from '@/lib/clock'
import { rm } from '@/lib/invoicing'
import { profitTotals } from '@/lib/profit'
import { useCommercialStore, type Invoice, type Quotation } from '@/lib/store/commercial'

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const inMonth = (iso: string | undefined, key: string) => !!iso && iso.slice(0, 7) === key
const monthName = (d: Date) => d.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })

const notYetSent: Quotation['status'][] = ['Draft', 'Pending owner approval']

function Meter({ value, label, tone = 'green' }: { value: number; label: string; tone?: 'green' | 'blue' | 'amber' }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="owner-meter" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className={`tone-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function ProfitSection() {
  const invoices = useCommercialStore(s => s.invoices)
  const items = useCommercialStore(s => s.items)
  const target = useCommercialStore(s => s.monthlyProfitTarget)
  const setTarget = useCommercialStore(s => s.setMonthlyProfitTarget)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(target))

  const now = getNow()
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const thisKey = monthKey(now)
  const lastKey = monthKey(last)
  const billed = (list: Invoice[], key: string) => list.filter(i => i.status !== 'Draft' && inMonth(i.createdAt, key))
  const cur = useMemo(() => profitTotals(billed(invoices, thisKey), items), [invoices, items, thisKey])
  const prev = useMemo(() => profitTotals(billed(invoices, lastKey), items), [invoices, items, lastKey])

  const diff = cur.profit - prev.profit
  const diffPct = prev.profit > 0 ? Math.round((diff / prev.profit) * 100) : null
  const targetPct = target > 0 ? Math.round((cur.profit / target) * 100) : 0
  const remaining = Math.max(0, target - cur.profit)
  const Trend = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus
  const trendTone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'

  const headline = prev.profit === 0 && cur.profit === 0
    ? 'No billed jobs yet this month or last month.'
    : diff === 0
      ? 'You are earning the same as last month.'
      : `You kept ${rm(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than last month${diffPct !== null ? ` (${Math.abs(diffPct)}% ${diff > 0 ? 'up' : 'down'})` : ''}.`

  const save = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ''))
    if (Number.isFinite(n)) setTarget(n)
    setEditing(false)
  }

  return (
    <section className="owner-card" aria-labelledby="owner-profit">
      <header>
        <h2 id="owner-profit">How much money did we keep?</h2>
        <p>Profit is what is left of your invoices after paying for parts and labour. Costs are estimated, so treat this as a close guide, not an accounting figure.</p>
      </header>

      <div className="owner-compare">
        <div className="owner-figure">
          <span>{monthName(now)} (this month)</span>
          <strong>{rm(cur.profit)}</strong>
          <small>From {rm(cur.revenue)} billed to customers</small>
        </div>
        <div className="owner-figure muted-figure">
          <span>{monthName(last)} (last month)</span>
          <strong>{rm(prev.profit)}</strong>
          <small>From {rm(prev.revenue)} billed to customers</small>
        </div>
      </div>

      <p className={`owner-trend ${trendTone}`}><Trend size={16} aria-hidden />{headline}</p>

      <div className="owner-target">
        <div className="owner-target-head">
          <div>
            <h3>Monthly profit goal</h3>
            {editing
              ? <form className="owner-target-edit" onSubmit={e => { e.preventDefault(); save() }}>
                  <label className="sr-only" htmlFor="profit-target">Monthly profit goal in RM</label>
                  <span>RM</span>
                  <input id="profit-target" inputMode="decimal" value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
                  <button className="button sm primary" type="submit">Save</button>
                  <button className="button sm secondary" type="button" onClick={() => { setDraft(String(target)); setEditing(false) }}>Cancel</button>
                </form>
              : <p>Your goal is <b>{rm(target)}</b> a month. <button className="link-button" onClick={() => { setDraft(String(target)); setEditing(true) }}>Change goal</button></p>}
          </div>
          <strong className="owner-pct">{targetPct}%</strong>
        </div>
        <Meter value={targetPct} label="Progress towards monthly profit goal" tone={targetPct >= 100 ? 'green' : targetPct >= 60 ? 'blue' : 'amber'} />
        <p className="owner-note">{target === 0 ? 'Set a goal to see how close you are.' : remaining === 0 ? 'Goal reached. Anything more from here is a bonus.' : `${rm(remaining)} still to go to reach this month's goal.`}</p>
      </div>
    </section>
  )
}

function QuotationSection() {
  const quotations = useCommercialStore(s => s.quotations)
  const now = getNow()
  const key = monthKey(now)
  const sent = useMemo(() => quotations.filter(q => !notYetSent.includes(q.status) && inMonth(q.sentAt ?? q.createdAt, key)), [quotations, key])
  const won = sent.filter(q => q.status === 'Accepted')
  const declined = sent.filter(q => q.status === 'Declined')
  const waiting = sent.length - won.length - declined.length
  const rate = sent.length ? Math.round((won.length / sent.length) * 100) : 0
  const wonValue = won.reduce((n, q) => n + q.total, 0)
  const sentValue = sent.reduce((n, q) => n + q.total, 0)

  return (
    <section className="owner-card" aria-labelledby="owner-quotes">
      <header>
        <h2 id="owner-quotes">Are our quotations turning into work?</h2>
        <p>A quotation is the price you send a customer before the job. It is completed when the customer says yes.</p>
      </header>

      <div className="owner-compare">
        <div className="owner-figure">
          <span>Quotations sent</span>
          <strong>{sent.length}</strong>
          <small>Worth {rm(sentValue)} in {monthName(now)}</small>
        </div>
        <div className="owner-figure">
          <span>Quotations completed</span>
          <strong>{won.length}</strong>
          <small>Customer said yes, worth {rm(wonValue)}</small>
        </div>
      </div>

      <div className="owner-target">
        <div className="owner-target-head">
          <h3>Customers who said yes</h3>
          <strong className="owner-pct">{rate}%</strong>
        </div>
        <Meter value={rate} label="Share of sent quotations that were completed" tone="green" />
        <ul className="owner-legend">
          <li><i className="tone-green" />{won.length} accepted</li>
          <li><i className="tone-amber" />{waiting} still waiting for an answer</li>
          <li><i className="tone-grey" />{declined.length} declined</li>
        </ul>
        <p className="owner-note">{sent.length === 0 ? 'No quotations have been sent this month yet.' : waiting > 0 ? 'Follow up on the quotations still waiting. A quick call often turns a maybe into a yes.' : 'Every quotation sent this month has an answer.'}</p>
      </div>
    </section>
  )
}

export function OwnerSummary() {
  return (
    <div className="owner-grid">
      <ProfitSection />
      <QuotationSection />
    </div>
  )
}
