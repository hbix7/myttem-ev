import type { Customer, Job, Site } from './types'

export type EvDocType = 'Technical Assessment Form' | 'Installation Report'
export type PrincipalCodeEv = 'UPE' | 'PROTON' | 'CHARGESINI' | 'ZEEKR' | 'SANGITECH'

export const ASSESS_CHECKS = [
  'Parking bay location confirmed',
  'Distribution board capacity checked',
  'Cable route measured',
  'Earthing system checked',
  'Mobile signal at charger point checked',
  'Customer briefed on scope and next steps',
] as const

export const INSTALL_CHECKS = [
  'Wallbox mounted and secured',
  'Cable run and conduit completed',
  'Earthing tested and recorded',
  'Charger energised and tested with vehicle',
  'Customer shown how to use the charger',
] as const

export const PHOTO_LABELS = ['Distribution board', 'Parking bay', 'Cable route', 'Wall mounting point', 'Meter and main switch', 'Earthing point', 'Site overview', 'Other'] as const

const PRINCIPAL_NAME: Record<PrincipalCodeEv, string> = {
  UPE: 'United Power Engineering',
  PROTON: 'Proton e.MAS',
  CHARGESINI: 'ChargeSini',
  ZEEKR: 'Zeekr',
  SANGITECH: 'Sangitech',
}

export interface EvTemplate { id: string; principal: PrincipalCodeEv; type: EvDocType; status: 'Approved' | 'Provisional, layout not yet confirmed'; fields: string[] }

const TAF_FIELDS = ['Customer and site details', 'Vehicle and charger model', 'Distribution board and earthing findings', 'Cable route measurements', 'Assessor remarks and photo count']
const IR_FIELDS = ['Customer and site details', 'Installation checklist results', 'Test readings and remarks', 'Customer sign-off']
const PROVISIONAL = new Set<PrincipalCodeEv>(['ZEEKR', 'SANGITECH'])

export const EV_TEMPLATES: EvTemplate[] = (['UPE', 'PROTON', 'CHARGESINI', 'ZEEKR', 'SANGITECH'] as PrincipalCodeEv[]).flatMap(principal => (
  (['Technical Assessment Form', 'Installation Report'] as EvDocType[]).map(type => ({
    id: `${type === 'Technical Assessment Form' ? 'taf' : 'ir'}-${principal.toLowerCase()}`,
    principal,
    type,
    status: PROVISIONAL.has(principal) ? 'Provisional, layout not yet confirmed' as const : 'Approved' as const,
    fields: type === 'Technical Assessment Form' ? TAF_FIELDS : IR_FIELDS,
  }))
))

export interface DocContext { job: Job; principal: PrincipalCodeEv; customer?: Customer; site?: Site; technician?: string; quoteNo?: string; quoteTotal?: number; installChecks?: Record<string, boolean> }

export function docFileName(type: EvDocType, ctx: DocContext) {
  return `${ctx.job.jobNo}-${type === 'Technical Assessment Form' ? 'TAF' : 'installation-report'}-${ctx.principal.toLowerCase()}.pdf`
}

export function docTitle(type: EvDocType, principal: PrincipalCodeEv) {
  const short = type === 'Technical Assessment Form' ? 'Technical Assessment Form (TAF)' : 'Installation Report'
  return `${PRINCIPAL_NAME[principal]} ${short}${PROVISIONAL.has(principal) ? ' [PROVISIONAL]' : ''}`
}

const yesNo = (v?: boolean) => (v ? 'Yes' : 'No')

export function buildDocLines(type: EvDocType, ctx: DocContext): string[] {
  const { job, customer, site, principal } = ctx
  const ev = job.ev
  const lines = [
    `Reference: ${job.jobNo}`,
    `Principal: ${PRINCIPAL_NAME[principal]}`,
    `Customer: ${customer?.name || 'Not recorded'}`,
    `Phone: ${customer?.phone || 'Not recorded'}`,
    `Site address: ${site?.address || 'Not recorded'}`,
    `Vehicle: ${ev?.vehicle || 'Not recorded'}`,
    `Charger model: ${ev?.chargerModel || 'Not recorded'}`,
    '',
  ]
  if (type === 'Technical Assessment Form') {
    const a = ev?.assessment
    lines.push(`Assessed by: ${ctx.technician || 'Not recorded'}`)
    lines.push(`Assessment date: ${a?.at ? a.at.slice(0, 10) : 'Not recorded'}`)
    lines.push('', 'Checklist')
    ASSESS_CHECKS.forEach(c => lines.push(`- ${c}: ${yesNo(a?.checklist?.[c])}`))
    lines.push('', 'Measurements', a?.measurements || 'None recorded', '', 'Remarks', a?.remarks || 'None', '', `Photos attached: ${a?.photos ?? 0}`)
  } else {
    lines.push(`Installed by: ${ctx.technician || 'Not recorded'}`)
    lines.push(`Installation date: ${ev?.at.installed ? ev.at.installed.slice(0, 10) : 'Not recorded'}`)
    if (ctx.quoteNo) lines.push(`Quotation: ${ctx.quoteNo}${ctx.quoteTotal ? ` (RM ${ctx.quoteTotal.toFixed(2)})` : ''}`)
    lines.push('', 'Installation checklist')
    INSTALL_CHECKS.forEach(c => lines.push(`- ${c}: ${yesNo(ctx.installChecks?.[c] ?? true)}`))
    lines.push('', 'Customer sign-off: Obtained on site')
  }
  if (PROVISIONAL.has(principal)) lines.push('', 'Note: this principal layout is provisional and not yet confirmed.')
  return lines
}
