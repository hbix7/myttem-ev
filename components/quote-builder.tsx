'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/shared'
import { Price } from '@/components/commercial'
import { useStore } from '@/lib/store'
import {
  useCommercialStore, quoteTotal, rateCardLabel, CUSTOM_ITEM_ID, PRINCIPAL_CODES, PRINCIPAL_NAMES,
  type PrincipalCode, type QuoteLine,
} from '@/lib/store/commercial'
import { evOnQuoteLinked, evOnQuoteSent, principalCode } from '@/lib/ev'

const CHARGER_MODELS = ['7kW AC', '11kW AC', '22kW AC', '60kW DC', 'Other']
const money = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`

const catalogueLine = (itemId: string, principal: PrincipalCode, items: ReturnType<typeof useCommercialStore.getState>['items'], qty = 1): QuoteLine => {
  const price = items.find(x => x.id === itemId)?.prices[principal] ?? 0
  return { itemId, qty, unitPrice: price, originalUnitPrice: price }
}

export function QuoteBuilder() {
  const router = useRouter()
  const items = useCommercialStore(s => s.items).filter(i => i.active !== false)
  const createQuote = useCommercialStore(s => s.createQuote)
  const convert = useCommercialStore(s => s.convertQuoteToInvoice)
  const jobs = useStore(s => s.jobs)
  const customers = useStore(s => s.customers)
  const limit = useStore(s => s.settings.approvalLimit)

  const [customerId, setCustomerId] = useState('')
  const [jobId, setJobId] = useState('')
  const [principal, setPrincipal] = useState<PrincipalCode>('UPE')
  const [vehicle, setVehicle] = useState('')
  const [chargerModel, setChargerModel] = useState(CHARGER_MODELS[0])
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<QuoteLine[]>([])
  const [ready, setReady] = useState(false)

  const customerJobs = useMemo(
    () => jobs.filter(j => j.customerId === customerId && (j.jobNo.startsWith('EV') || !!j.ev)),
    [jobs, customerId],
  )
  const knownVehicles = useMemo(() => Array.from(new Set(jobs.map(j => j.ev?.vehicle).filter(Boolean) as string[])), [jobs])

  const repriceTo = (code: PrincipalCode, current: QuoteLine[]) =>
    current.map(l => (l.itemId === CUSTOM_ITEM_ID ? l : catalogueLine(l.itemId, code, items, l.qty)))

  const pickJob = (id: string, keepCustomer = false) => {
    setJobId(id)
    const job = jobs.find(j => j.id === id)
    if (!job) return
    if (!keepCustomer) setCustomerId(job.customerId)
    const code = principalCode(job.principalId)
    setPrincipal(code)
    setLines(ls => repriceTo(code, ls))
    if (job.ev?.vehicle) setVehicle(job.ev.vehicle)
    if (job.ev?.chargerModel && CHARGER_MODELS.includes(job.ev.chargerModel)) setChargerModel(job.ev.chargerModel)
  }

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('jobId')
    const defaultCode: PrincipalCode = 'UPE'
    setLines([catalogueLine('svc2', defaultCode, useCommercialStore.getState().items)])
    if (fromUrl) pickJob(fromUrl)
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeCustomer = (id: string) => {
    setCustomerId(id)
    if (jobId && jobs.find(j => j.id === jobId)?.customerId !== id) setJobId('')
  }
  const changePrincipal = (code: PrincipalCode) => {
    setPrincipal(code)
    setLines(ls => repriceTo(code, ls))
  }
  const setLine = (i: number, patch: Partial<QuoteLine>) => setLines(ls => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  const pickItem = (i: number, itemId: string) => {
    if (itemId === CUSTOM_ITEM_ID) setLine(i, { itemId, code: 'CUSTOM', description: '', unitPrice: 0, originalUnitPrice: 0 })
    else setLines(ls => ls.map((l, n) => (n === i ? catalogueLine(itemId, principal, items, l.qty) : l)))
  }

  const totals = quoteTotal(lines)
  const high = totals.subtotal > limit
  const customer = customers.find(c => c.id === customerId)

  const persist = (send: boolean) => {
    if (!customer) { toast.error('Choose a customer first'); return undefined }
    if (!lines.length) { toast.error('Add at least one line item'); return undefined }
    if (lines.some(l => l.itemId === CUSTOM_ITEM_ID && !l.description?.trim())) { toast.error('Describe every custom line item'); return undefined }
    if (lines.some(l => !(l.qty > 0))) { toast.error('Every line needs a quantity above zero'); return undefined }
    const job = jobs.find(j => j.id === jobId)
    const id = createQuote({
      jobId: job?.id ?? '', jobNo: job?.jobNo ?? '—', customer: customer.name, customerId: customer.id,
      vehicle: vehicle.trim() || undefined, chargerModel, notes: notes.trim() || undefined,
      principal, lines, status: send ? (high ? 'Pending owner approval' : 'Sent') : 'Draft', reminders: [],
    })
    if (job?.ev) {
      evOnQuoteLinked(job.id, id)
      if (send && !high) evOnQuoteSent(job.id, id)
    }
    return id
  }
  const save = (send: boolean) => {
    const id = persist(send)
    if (!id) return
    toast.success(send ? (high ? 'Sent to owner for approval' : 'Quotation sent to customer') : 'Draft saved')
    router.push(`/quotations/${id}`)
  }
  const saveAndConvert = () => {
    const id = persist(false)
    if (!id) return
    const invoiceId = convert(id)
    toast.success('Quotation saved and converted to an invoice')
    router.push(invoiceId ? `/invoices/${invoiceId}` : `/quotations/${id}`)
  }

  if (!ready) return <AppShell crumb="Quotations > New"><PageHeader title="New quotation" /></AppShell>

  return (
    <AppShell crumb="Quotations > New">
      <PageHeader title="New quotation" subtitle="Choose the customer and rate card, add the vehicle, then build the line items." action={<Link className="button secondary" href="/quotations">Cancel</Link>} />
      <div className="commercial-grid page-pad">
        <div className="quote-stack">
          <section className="card">
            <div className="card-header"><h2>Customer and rate card</h2><span className="muted">Prices excl. SST</span></div>
            <div className="quote-meta">
              <label>Customer
                <select className="field-input" value={customerId} onChange={e => changeCustomer(e.target.value)}>
                  <option value="">Select a customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Rate card
                <select className="field-input" value={principal} onChange={e => changePrincipal(e.target.value as PrincipalCode)}>
                  {PRINCIPAL_CODES.map(c => <option key={c} value={c}>{PRINCIPAL_NAMES[c]}</option>)}
                </select>
              </label>
              <label>Linked EV job <span className="muted">(optional)</span>
                <select className="field-input" value={jobId} disabled={!customerId} onChange={e => (e.target.value ? pickJob(e.target.value, true) : setJobId(''))}>
                  <option value="">{customerId ? (customerJobs.length ? 'No linked job' : 'No EV jobs for this customer') : 'Choose a customer first'}</option>
                  {customerJobs.map(j => <option key={j.id} value={j.id}>{j.jobNo} · {j.subject}</option>)}
                </select>
              </label>
              <label>Vehicle model
                <input className="field-input" list="quote-vehicles" value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="e.g. Zeekr 001" />
                <datalist id="quote-vehicles">{knownVehicles.map(v => <option key={v} value={v} />)}</datalist>
              </label>
              <label>Charger model
                <select className="field-input" value={chargerModel} onChange={e => setChargerModel(e.target.value)}>
                  {CHARGER_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="quote-notes">Notes
                <textarea className="field-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Site conditions, scope remarks or terms for this customer" />
              </label>
            </div>
          </section>

          <section className="card">
            <div className="card-header"><h2>Line items</h2><span className="muted">Priced from the {rateCardLabel(principal)} rate card</span></div>
            <div className="line-editor">
              {lines.map((l, i) => {
                const custom = l.itemId === CUSTOM_ITEM_ID
                return (
                  <div className={`quote-line ${custom ? 'custom' : ''}`} key={i}>
                    <select className="field-input" aria-label="Item" value={l.itemId} onChange={e => pickItem(i, e.target.value)}>
                      <option value={CUSTOM_ITEM_ID}>Custom item (not on rate card)</option>
                      {items.map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                    </select>
                    {custom && <input className="field-input quote-desc" aria-label="Description" placeholder="Describe the item or service" value={l.description ?? ''} onChange={e => setLine(i, { description: e.target.value })} />}
                    <input className="field-input qty" aria-label="Quantity" type="number" min="1" value={l.qty} onChange={e => setLine(i, { qty: Number(e.target.value) })} />
                    {custom
                      ? <input className="field-input quote-price" aria-label="Unit price" type="number" min="0" step="0.01" value={l.unitPrice} onChange={e => setLine(i, { unitPrice: Number(e.target.value), originalUnitPrice: Number(e.target.value) })} />
                      : <span className="muted">{money(l.unitPrice)} each</span>}
                    <strong>{money(l.qty * l.unitPrice)}</strong>
                    <button className="button ghost sm" aria-label="Remove line" onClick={() => setLines(ls => ls.filter((_, n) => n !== i))}><Trash2 size={14} /></button>
                  </div>
                )
              })}
              {!lines.length && <p className="muted">No line items yet.</p>}
            </div>
            <div className="action-row">
              <button className="button secondary" onClick={() => setLines(ls => [...ls, catalogueLine('svc1', principal, items)])}><Plus size={14} /> Add line item</button>
              <button className="button ghost" onClick={() => setLines(ls => [...ls, { itemId: CUSTOM_ITEM_ID, code: 'CUSTOM', description: '', qty: 1, unitPrice: 0, originalUnitPrice: 0 }])}><Plus size={14} /> Add custom item</button>
            </div>
          </section>
        </div>

        <aside className="card totals">
          <h2>Totals</h2>
          <div className="quote-summary">
            <span className="muted">{customer?.name ?? 'No customer selected'}</span>
            <span className="muted">{PRINCIPAL_NAMES[principal]} rate card{vehicle ? ` · ${vehicle}` : ''}</span>
          </div>
          <div><span>Subtotal</span><strong><Price amount={totals.subtotal} /></strong></div>
          <div><span>SST 8%</span><strong><Price amount={totals.sst} /></strong></div>
          <div className="grand"><span>Total</span><strong><Price amount={totals.total} /></strong></div>
          <div className={`approval-banner ${high ? 'amber' : ''}`}>{high ? `Above ${money(limit)}: requires owner approval` : `At or below ${money(limit)}: can be sent directly`}</div>
          <button className="button secondary full" onClick={() => save(false)}>Save draft</button>
          <button className="button primary full" onClick={() => save(true)}>{high ? 'Send to owner' : 'Send to customer'}</button>
          <button className="button secondary full" onClick={saveAndConvert}>Save and convert to invoice</button>
        </aside>
      </div>
    </AppShell>
  )
}
