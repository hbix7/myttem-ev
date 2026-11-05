'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppShell, EmptyState, PageHeader, useHydrated } from '@/components/shared'
import { Price } from '@/components/commercial'
import { useStore } from '@/lib/store'
import { quoteTotal, useCommercialStore, type QuoteLine } from '@/lib/store/commercial'
import { E_INVOICE_NOTE, labourHours } from '@/lib/invoicing'
import type { Job } from '@/lib/types'

export function InvoiceBuilder({ jobId }: { jobId?: string }) {
  const hydrated = useHydrated()
  const jobs = useStore(s => s.jobs)
  const jobTypes = useStore(s => s.jobTypes)
  const invoices = useCommercialStore(s => s.invoices)
  const [picked, setPicked] = useState(jobId ?? '')
  if (!hydrated) return null

  const isCommercial = (j: Job) => !jobTypes.find(t => t.id === j.jobTypeId)?.isEv
  const candidates = jobs.filter(j => isCommercial(j) && j.status === 'Completed' && !invoices.some(i => i.jobId === j.id))
  const job = jobs.find(j => j.id === picked)
  const existing = job ? invoices.find(i => i.jobId === job.id) : undefined

  return (
    <AppShell crumb="Invoices > New">
      <PageHeader title="Raise invoice" subtitle="Commercial jobs are invoiced straight from the completed job. No quotation step." action={<Link className="button secondary" href="/invoices">Back</Link>} />
      <div className="content">
        <section className="card" style={{ marginBottom: 16 }}>
          <label>Completed job
            <select className="field-input" value={picked} onChange={e => setPicked(e.target.value)}>
              <option value="">Select a completed job</option>
              {candidates.map(j => <option key={j.id} value={j.id}>{j.jobNo} · {j.subject}</option>)}
              {job && !candidates.some(c => c.id === job.id) && <option value={job.id}>{job.jobNo} · {job.subject}</option>}
            </select>
          </label>
          {!candidates.length && !job && <p className="muted">No completed commercial jobs are waiting to be invoiced.</p>}
        </section>

        {job && existing && <EmptyState title="This job already has an invoice" helper={existing.invoiceNo} action={<Link className="button primary" href={`/invoices/${existing.id}`}>Open invoice</Link>} />}
        {job && !existing && !isCommercial(job) && <EmptyState title="EV jobs are not invoiced here" helper="EV invoices follow the quotation and payment flow." />}
        {job && !existing && isCommercial(job) && job.status !== 'Completed' && <EmptyState title="The job is not completed yet" helper="An invoice can be raised once the technician completes the job." />}
        {job && !existing && isCommercial(job) && job.status === 'Completed' && <Editor key={job.id} job={job} />}
      </div>
    </AppShell>
  )
}

function Editor({ job }: { job: Job }) {
  const router = useRouter()
  const items = useCommercialStore(s => s.items).filter(i => i.active !== false)
  const createInvoice = useCommercialStore(s => s.createInvoice)
  const raiseInvoice = useStore(s => s.raiseInvoice)
  const customer = useStore(s => s.customers.find(c => c.id === job.customerId))
  const hours = labourHours(job)
  const labour = items.find(i => i.id === 'svc5') ?? items.find(i => i.type === 'Service')
  const [lines, setLines] = useState<QuoteLine[]>(labour ? [{ itemId: labour.id, qty: hours, unitPrice: labour.prices.UPE, originalUnitPrice: labour.prices.UPE }] : [])
  const totals = quoteTotal(lines)
  const setLine = (i: number, patch: Partial<QuoteLine>) => setLines(ls => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  const pickItem = (i: number, itemId: string) => {
    const item = items.find(x => x.id === itemId)
    if (item) setLine(i, { itemId, unitPrice: item.prices.UPE, originalUnitPrice: item.prices.UPE })
  }
  const addLine = (type: 'Service' | 'Part') => {
    const item = items.find(x => x.type === type)
    if (item) setLines(ls => [...ls, { itemId: item.id, qty: 1, unitPrice: item.prices.UPE, originalUnitPrice: item.prices.UPE }])
  }
  const submit = () => {
    if (!lines.length || lines.some(l => !(l.qty > 0))) { toast.error('Add at least one line with a quantity above zero'); return }
    const id = createInvoice({ jobId: job.id, jobNo: job.jobNo, customer: customer?.name ?? '', lines, subtotal: totals.subtotal, status: 'Draft', kind: 'commercial' })
    raiseInvoice(job.id, 'Invoice raised from completed job')
    toast.success('Invoice raised. Job moved to Invoiced.')
    router.push(`/invoices/${id}`)
  }

  return (
    <div className="commercial-grid">
      <section className="card">
        <div className="card-header"><div><h2>{job.jobNo} · {job.subject}</h2><p className="muted">{customer?.name}. Labour is prefilled from time on site ({hours}h). Prices come from the Item Master, excl. SST.</p></div></div>
        <div className="line-editor">
          {lines.map((l, i) => (
            <div className="quote-line" key={i}>
              <select className="field-input" aria-label="Item" value={l.itemId} onChange={e => pickItem(i, e.target.value)}>
                {items.map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
              </select>
              <input className="field-input qty" type="number" min="0.5" step="0.5" aria-label="Quantity" value={l.qty} onChange={e => setLine(i, { qty: Number(e.target.value) })} />
              <Price amount={l.unitPrice} />
              <button className="button ghost" onClick={() => setLines(ls => ls.filter((_, n) => n !== i))}>Remove</button>
            </div>
          ))}
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={() => addLine('Part')}>+ Add part</button>
          <button className="button secondary" onClick={() => addLine('Service')}>+ Add labour or service</button>
        </div>
      </section>
      <aside className="card totals">
        <h2>Totals</h2>
        <div><span>Subtotal (excl. SST)</span><strong><Price amount={totals.subtotal} /></strong></div>
        <div><span>SST 8%</span><strong><Price amount={totals.sst} /></strong></div>
        <div className="grand"><span>Total</span><strong><Price amount={totals.total} /></strong></div>
        <p className="muted">{E_INVOICE_NOTE}</p>
        <button className="button primary full" onClick={submit}>Raise invoice</button>
      </aside>
    </div>
  )
}
