'use client'
import { usePdfTemplates, type PdfTemplate } from '@/lib/store/pdftemplates'
import { useStore } from '@/lib/store'
import { useCommercialStore, type Invoice, type Quotation } from '@/lib/store/commercial'
import { logAudit } from '@/lib/store/audit'
import type { Claim } from '@/lib/store/claims'
import type { Job } from '@/lib/types'

const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (no: string, prefix: string) => `${prefix}-${String(Number(no.replace(/\D/g, '')) || 0).padStart(4, '0')}`
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')
const template = (id: string): PdfTemplate => usePdfTemplates.getState().templates.find(t => t.id === id)!

const INK: [number, number, number] = [24, 32, 44]
const MUTED: [number, number, number] = [100, 110, 124]
const ACCENT: [number, number, number] = [15, 108, 98]

async function start(tpl: PdfTemplate, title: string, meta: [string, string][]) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...ACCENT); doc.roundedRect(40, 36, 44, 44, 6, 6, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(tpl.logoText.slice(0, 4), 62, 63, { align: 'center' })
  doc.setTextColor(...INK); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  const lines = tpl.header.split('\n')
  doc.text(lines[0] ?? '', 96, 50)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  lines.slice(1).forEach((l, i) => doc.text(l, 96, 64 + i * 12))
  doc.setDrawColor(220, 224, 230); doc.line(40, 98, W - 40, 98)
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(title.toUpperCase(), 40, 128)
  let y = 150
  doc.setFontSize(9)
  meta.forEach(([k, v], i) => {
    const col = i % 2, x = 40 + col * 260
    if (col === 0 && i > 0) y += 16
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED); doc.text(k, x, y)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.text(v, x + 90, y)
  })
  return { doc, autoTable, W, y: y + 24 }
}

function finish(doc: import('jspdf').jsPDF, tpl: PdfTemplate, y: number, file: string, sign?: string[]) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  if (y > H - 190) { doc.addPage(); y = 60 }
  if (tpl.terms) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text('Terms', 40, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(tpl.terms, W - 80), 40, y + 14); y += 14 + doc.splitTextToSize(tpl.terms, W - 80).length * 11 + 16
  }
  if (sign?.length) {
    sign.forEach((label, i) => {
      const x = 40 + i * 260
      doc.setDrawColor(...MUTED); doc.line(x, y + 36, x + 200, y + 36)
      doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(label, x, y + 48)
    })
  }
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(tpl.footer, 40, H - 28); doc.text(`Page ${p} of ${pages}`, W - 40, H - 28, { align: 'right' })
  }
  doc.save(`${file}.pdf`)
}

const tableTheme = { theme: 'striped' as const, headStyles: { fillColor: ACCENT, textColor: 255, fontSize: 9 }, styles: { fontSize: 9, cellPadding: 6, textColor: INK }, alternateRowStyles: { fillColor: [245, 247, 249] as [number, number, number] } }

function totals(doc: import('jspdf').jsPDF, W: number, y: number, rows: [string, string, boolean?][]) {
  rows.forEach(([k, v, bold], i) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9); doc.setTextColor(...(bold ? INK : MUTED))
    doc.text(k, W - 200, y + i * 16); doc.text(v, W - 40, y + i * 16, { align: 'right' })
  })
  return y + rows.length * 16 + 12
}

function lineRows(lines: { itemId: string; qty: number; unitPrice: number; code?: string; description?: string }[]) {
  const items = useCommercialStore.getState().items
  return lines.map(l => {
    const it = items.find(x => x.id === l.itemId)
    return [it?.code ?? l.code ?? l.itemId, it?.name ?? l.description ?? '', String(l.qty), rm(l.unitPrice), rm(l.qty * l.unitPrice)]
  })
}

export async function downloadQuotationPdf(q: Quotation) {
  const tpl = template('quotation')
  const { doc, autoTable, W, y } = await start(tpl, 'Quotation', [['Quotation no', q.quoteNo], ['Date', day(q.createdAt)], ['Customer', q.customer], ['Job', q.jobNo], ['Principal', q.principal], ['Status', q.status]])
  autoTable(doc, { startY: y, head: [['Code', 'Description', 'Qty', 'Unit price', 'Amount']], body: lineRows(q.lines), columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }, ...tableTheme })
  const after = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20
  const end = totals(doc, W, after, [['Subtotal', rm(q.subtotal)], ['SST', rm(q.sst)], ['Total', rm(q.total), true]])
  const file = num(q.quoteNo, 'QUO')
  logAudit('Quotations', 'Downloaded PDF', q.quoteNo)
  finish(doc, tpl, end, file, ['Authorised signature', 'Customer acceptance'])
  return `${file}.pdf`
}

export async function downloadInvoicePdf(i: Invoice) {
  const tpl = template('invoice')
  const sstRate = useStore.getState().settings.sstRate
  const { doc, autoTable, W, y } = await start(tpl, 'Tax invoice', [['Invoice no', i.invoiceNo], ['Date', day(i.createdAt)], ['Customer', i.customer], ['Job', i.jobNo], ['Status', i.status], ['Payment', i.paymentConfirmedAt ? `Paid ${day(i.paymentConfirmedAt)}` : 'Outstanding']])
  autoTable(doc, { startY: y, head: [['Code', 'Description', 'Qty', 'Unit price', 'Amount']], body: lineRows(i.lines), columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }, ...tableTheme })
  const after = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20
  const end = totals(doc, W, after, [['Subtotal (excl. SST)', rm(i.subtotal)], [`SST ${Math.round(sstRate * 100)}%`, rm(i.sst)], ['Total (incl. SST)', rm(i.total), true]])
  const file = num(i.invoiceNo, 'INV')
  logAudit('Invoices', 'Downloaded PDF', i.invoiceNo)
  finish(doc, tpl, end, file, i.signedBy ? [`Signed off by ${i.signedBy}`] : ['Customer sign-off'])
  return `${file}.pdf`
}

export async function downloadEvJobPdf(job: Job) {
  const s = useStore.getState()
  const isInstall = !!job.ev && ['Installed', 'Invoiced', 'Closed', 'Scheduled', 'Paid'].includes(job.ev.status)
  const tpl = template(isInstall ? 'ev-installation' : 'ev-assessment')
  const customer = s.customers.find(c => c.id === job.customerId)
  const site = s.sites.find(x => x.id === job.siteId)
  const tech = s.users.find(u => u.id === job.technicianId)
  const principal = s.principals.find(p => p.id === job.principalId)
  const { doc, autoTable, W, y } = await start(tpl, isInstall ? 'EV installation job' : 'EV assessment job', [
    ['Job no', job.jobNo], ['Status', job.ev?.status ?? job.status], ['Customer', customer?.name ?? '-'], ['Phone', customer?.phone ?? job.contactPhone ?? '-'],
    ['Site', site?.name ?? '-'], ['Address', site?.address ?? job.contactAddress ?? '-'], ['Principal', principal?.name ?? '-'], ['Technician', tech?.name ?? 'Unassigned'],
    ['Vehicle', job.ev?.vehicle ?? '-'], ['Charger', job.ev?.chargerModel ?? '-'], ['Scheduled', day(job.scheduledAt)], ['Created', day(job.createdAt)],
  ])
  const milestones = Object.entries(job.ev?.at ?? {}).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), day(v as string)])
  autoTable(doc, { startY: y, head: [['Milestone', 'Date']], body: milestones.length ? milestones : [['No milestones yet', '-']], ...tableTheme })
  let end = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20
  const a = job.ev?.assessment
  if (a) {
    autoTable(doc, { startY: end, head: [['Assessment check', 'Result']], body: [...Object.entries(a.checklist).map(([k, v]) => [k, v ? 'Pass' : 'Not done']), ['Photos taken', String(a.photos)], ['Measurements', a.measurements || '-'], ['Remarks', a.remarks || '-']], ...tableTheme })
    end = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20
  }
  void W
  const file = num(job.jobNo, 'EVJ')
  logAudit('Jobs', 'Downloaded PDF', job.jobNo)
  finish(doc, tpl, end, file, ['Technician signature', 'Customer signature'])
  return `${file}.pdf`
}

export async function downloadClaimPdf(c: Claim) {
  const tpl = template('chargeback')
  const { doc, autoTable, W, y } = await start(tpl, 'Chargeback claim', [['Claim no', c.claimNo], ['Raised', day(c.raisedAt)], ['Job', c.jobNo], ['Due', day(c.dueAt)], ['Customer', c.customer], ['Principal', c.principal], ['Status', c.status], ['Amount', rm(c.amount)]])
  autoTable(doc, { startY: y, head: [['Status', 'Date', 'By', 'Note']], body: c.timeline.map(t => [t.status, day(t.at), t.by, t.note ?? '']), ...tableTheme })
  const end = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20
  void W
  const file = num(c.claimNo, 'CLM')
  logAudit('Chargebacks', 'Downloaded PDF', c.claimNo)
  finish(doc, tpl, end, file)
  return `${file}.pdf`
}

export async function previewTemplatePdf(tpl: PdfTemplate) {
  const { doc, autoTable, W, y } = await start(tpl, tpl.name, [['Document no', 'SAMPLE-0001'], ['Date', day(new Date().toISOString())], ['Customer', 'Sample Customer Sdn Bhd'], ['Job', 'JOB-000000']])
  autoTable(doc, { startY: y, head: [['Code', 'Description', 'Qty', 'Unit price', 'Amount']], body: [['SVC-001', 'Sample service line', '1', rm(250), rm(250)], ['PRT-014', 'Sample part', '2', rm(90), rm(180)]], ...tableTheme })
  const after = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20
  const end = totals(doc, W, after, [['Total', rm(430), true]])
  finish(doc, tpl, end, `${tpl.id}-sample`, ['Authorised signature'])
}
