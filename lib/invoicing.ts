import { buildPdfDataUrl, downloadDataUrl } from './export'
import type { Invoice, RateItem } from './store/commercial'
import type { Job } from './types'

export const E_INVOICE_NOTE = 'e-Invoice (MyInvois) submission, credit notes and refunds are handled in SQL Accounting.'

export const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/* Hours on site rounded up to the next half hour, minimum one hour. */
export function labourHours(job: Pick<Job, 'startTime' | 'endTime'>) {
  if (!job.startTime || !job.endTime) return 1
  const hours = (new Date(job.endTime).getTime() - new Date(job.startTime).getTime()) / 3_600_000
  return Math.max(1, Math.ceil(hours * 2) / 2)
}

export function downloadInvoicePdf(invoice: Invoice, items: RateItem[], sstRate: number) {
  const lines = [
    `Invoice no: ${invoice.invoiceNo}`,
    `Date: ${invoice.createdAt.slice(0, 10)}`,
    `Job: ${invoice.jobNo}`,
    `Customer: ${invoice.customer}`,
    '',
    'All line amounts are excl. SST',
    '',
    ...invoice.lines.map(l => {
      const item = items.find(x => x.id === l.itemId)
      return `${item?.code ?? l.itemId}  ${item?.name ?? ''}  |  ${l.qty} x ${rm(l.unitPrice)} = ${rm(l.qty * l.unitPrice)} excl. SST`
    }),
    '',
    `Subtotal (excl. SST): ${rm(invoice.subtotal)}`,
    `SST ${Math.round(sstRate * 100)}%: ${rm(invoice.sst)}`,
    `Total (incl. SST): ${rm(invoice.total)}`,
    '',
    E_INVOICE_NOTE,
  ]
  downloadDataUrl(buildPdfDataUrl(`Tax invoice ${invoice.invoiceNo}`, lines), `${invoice.invoiceNo}.pdf`)
}
