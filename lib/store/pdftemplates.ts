'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PdfTemplate { id: string; name: string; header: string; footer: string; logoText: string; terms: string }

const header = 'United Power Engineering Sdn Bhd\nNo. 12, Jalan Industri 3, Shah Alam, Selangor\nTel +603 5522 1000 | service@upe.com.my'
const footer = 'Thank you for choosing United Power Engineering.'
const t = (id: string, name: string, terms: string): PdfTemplate => ({ id, name, header, footer, logoText: 'UPE', terms })

export const DEFAULT_TEMPLATES: PdfTemplate[] = [
  t('quotation', 'Quotation', 'Valid for 30 days. Prices in RM, SST added where applicable. 50% deposit before installation.'),
  t('invoice', 'Invoice', 'Payment due within 14 days. Late payments may incur a 1.5% monthly charge.'),
  t('job-sheet', 'Job Sheet', 'Technician must complete the checklist and get customer sign-off before leaving site.'),
  t('ev-assessment', 'EV Assessment Report', 'This report reflects site conditions on the date of assessment.'),
  t('ev-installation', 'EV Installation Report', 'Installation carried out to local electrical standards. Warranty 12 months on workmanship.'),
  t('chargeback', 'Chargeback Claim', 'Claims must be submitted within 7 days of job completion.'),
  t('delivery-note', 'Delivery Note', 'Goods received in good condition unless noted. Sign below to confirm.'),
  t('service-report', 'Service Report', 'Findings and recommendations are valid as of the service date.'),
  t('site-inspection', 'Site Inspection', 'Inspection covers visible and accessible equipment only.'),
  t('monthly-summary', 'Monthly Summary', 'Figures are unaudited management figures in RM.'),
]

interface State { templates: PdfTemplate[]; update: (id: string, patch: Partial<PdfTemplate>) => void; reset: (id: string) => void }

export const usePdfTemplates = create<State>()(persist((set) => ({
  templates: DEFAULT_TEMPLATES,
  update: (id, patch) => set(s => ({ templates: s.templates.map(x => x.id === id ? { ...x, ...patch } : x) })),
  reset: (id) => set(s => ({ templates: s.templates.map(x => x.id === id ? DEFAULT_TEMPLATES.find(d => d.id === id)! : x) })),
}), { name: 'myttem-pdf-templates', version: 1 }))
