'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, FileText, Send, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell, EmptyState, FilterBar, PageHeader, StatusPill, useHydrated } from '@/components/shared'
import { Price } from '@/components/commercial'
import { useStore } from '@/lib/store'
import { useCommercialStore, type Invoice, type InvoiceStatus } from '@/lib/store/commercial'
import { useEvStore } from '@/lib/store/ev'
import { sendNotification } from '@/lib/store/comms'
import { can } from '@/lib/rbac'

const tabs: ('All' | InvoiceStatus)[] = ['All', 'Draft', 'Sent for sign-off', 'Signed off', 'Paid', 'Invoiced']
const steps: InvoiceStatus[] = ['Draft', 'Sent for sign-off', 'Signed off', 'Paid', 'Invoiced']

function ExportChip({ invoice }: { invoice: Invoice }) {
  const batch = useCommercialStore(s => s.batches.find(b => b.id === invoice.exportBatchId))
  if (!invoice.exportBatchId) return <span className="badge tone-amber">Pending SQL export</span>
  return <span className="badge tone-green">Exported {batch?.fileName ?? invoice.exportBatchId}</span>
}

export function InvoiceList() {
  const hydrated = useHydrated()
  const invoices = useCommercialStore(s => s.invoices)
  const [tab, setTab] = useState<(typeof tabs)[number]>('All')
  const [search, setSearch] = useState('')
  const rows = useMemo(() => invoices.filter(i => (tab === 'All' || i.status === tab) && `${i.invoiceNo} ${i.jobNo} ${i.customer}`.toLowerCase().includes(search.toLowerCase())), [invoices, tab, search])
  if (!hydrated) return null
  return (
    <AppShell crumb="Invoices">
      <PageHeader title="Invoices" />
      <div className="content">
        <div className="tabs">{tabs.map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
        <FilterBar search={search} onSearch={setSearch} placeholder="Search invoice, job or customer..." />
        <div className="table-card">
          <table>
            <thead><tr><th>Invoice</th><th>Job</th><th>Customer</th><th>Total incl SST</th><th>Status</th><th>SQL Accounting</th></tr></thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id}>
                  <td><Link href={`/invoices/${i.id}`} className="link mono">{i.invoiceNo}</Link></td>
                  <td>{i.jobNo}</td><td>{i.customer}</td>
                  <td><Price amount={i.total} /></td>
                  <td><StatusPill>{i.status}</StatusPill></td>
                  <td><ExportChip invoice={i} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <EmptyState title="No invoices found" helper="Invoices are raised from completed jobs." />}
        </div>
      </div>
    </AppShell>
  )
}

export function InvoiceDetail({ id }: { id: string }) {
  const hydrated = useHydrated()
  const invoice = useCommercialStore(s => s.invoices.find(i => i.id === id))
  const items = useCommercialStore(s => s.items)
  const update = useCommercialStore(s => s.updateInvoice)
  const role = useStore(s => s.users.find(u => u.id === s.currentUserId)!.role)
  const job = useStore(s => s.jobs.find(j => j.id === invoice?.jobId))
  const settings = useStore(s => s.settings)
  const [signedBy, setSignedBy] = useState('')
  if (!hydrated) return null
  if (!invoice) return <AppShell><EmptyState title="Invoice not found" helper="Return to the invoice list." action={<Link className="button secondary" href="/invoices">Back to invoices</Link>} /></AppShell>

  const canEdit = can(role, 'invoice', 'U')
  const isEv = !!job && ['EVA', 'EVI'].some(p => invoice.jobNo.startsWith(p)) || invoice.jobNo.startsWith('EV')
  const stepIndex = steps.indexOf(invoice.status)

  const sendForSignOff = () => {
    update(invoice.id, { status: 'Sent for sign-off' })
    const r = sendNotification(invoice.jobId, 'Invoice ready', 'Email', settings)
    toast.success(r.toast)
  }
  const signOff = () => {
    if (!signedBy.trim()) { toast.error('Enter the name of the customer signatory'); return }
    update(invoice.id, { status: 'Signed off', signedBy, signedAt: new Date().toISOString() })
    toast.success('Customer sign-off recorded')
  }
  const confirmPayment = () => {
    update(invoice.id, { status: 'Paid', paymentConfirmedAt: new Date().toISOString() })
    if (isEv) {
      useEvStore.getState().confirmPayment(invoice.jobId, invoice.customer, invoice.jobNo)
      sendNotification(invoice.jobId, 'Booking link ready', 'Email', settings)
      toast.success('Payment confirmed. Booking link sent to the customer.')
    } else toast.success('Payment confirmed')
  }

  return (
    <AppShell crumb={`Invoices > ${invoice.invoiceNo}`}>
      <PageHeader title={invoice.invoiceNo} subtitle={`${invoice.customer} · ${invoice.jobNo}`} action={<Link className="button secondary" href="/invoices">Back</Link>} />
      <div className="content">
        <div className="stepper card" style={{ marginBottom: 16 }}>
          {steps.map((s, i) => <div key={s} className={`step ${stepIndex >= i ? 'done' : ''}`}><span>{i + 1}</span><small>{s}</small></div>)}
        </div>
        <div className="detail-grid">
          <section className="card">
            <div className="card-header"><div><h2>Line items</h2><p className="muted">Amounts in RM, SST {Math.round(settings.sstRate * 100)}%</p></div><StatusPill>{invoice.status}</StatusPill></div>
            <table>
              <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
              <tbody>
                {invoice.lines.map(l => {
                  const item = items.find(x => x.id === l.itemId)
                  return <tr key={l.itemId}><td>{item?.code} · {item?.name}</td><td>{l.qty}</td><td><Price amount={l.unitPrice} /></td><td><Price amount={l.qty * l.unitPrice} /></td></tr>
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Subtotal</td><td><Price amount={invoice.subtotal} /></td></tr>
                <tr><td colSpan={3}>SST</td><td><Price amount={invoice.sst} /></td></tr>
                <tr><td colSpan={3}><strong>Total</strong></td><td><strong><Price amount={invoice.total} /></strong></td></tr>
              </tfoot>
            </table>
          </section>
          <aside className="card">
            <h2>Next step</h2>
            <p className="muted">Invoices are exported to SQL Accounting in batches. The accounting system stays the source of truth for e-Invoice submission.</p>
            <div className="stack">
              <div className="approval-card"><strong>SQL Accounting</strong><ExportChip invoice={invoice} /></div>
              {invoice.signedBy && <div className="approval-card"><strong>Signed off by {invoice.signedBy}</strong><small>{new Date(invoice.signedAt!).toLocaleString('en-MY')}</small></div>}
              {invoice.paymentConfirmedAt && <div className="approval-card"><strong>Payment confirmed</strong><small>{new Date(invoice.paymentConfirmedAt).toLocaleString('en-MY')}</small></div>}
              {canEdit && invoice.status === 'Draft' && <button className="button primary full" onClick={sendForSignOff}><Send size={15} />Send for customer sign-off</button>}
              {canEdit && invoice.status === 'Sent for sign-off' && (
                <>
                  <label>Customer signatory<input value={signedBy} onChange={e => setSignedBy(e.target.value)} placeholder="Name of person signing" /></label>
                  <button className="button primary full" onClick={signOff}><Check size={15} />Record sign-off</button>
                </>
              )}
              {canEdit && invoice.status === 'Signed off' && <button className="button primary full" onClick={confirmPayment}><Wallet size={15} />Confirm payment received</button>}
              {invoice.status === 'Paid' && !invoice.exportBatchId && <Link className="button secondary full" href="/integrations/sql"><FileText size={15} />Go to SQL export</Link>}
              {!canEdit && <p className="muted">View only for your role.</p>}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
