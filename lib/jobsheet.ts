import { buildPdfDataUrl } from './export'
import { slaInfo } from './selectors'
import type { ChecklistAnswer, ChecklistItem, Customer, GeneratedDocument, Job, JobType, User } from './types'

interface Ctx { job: Job; type?: JobType; customer?: Customer; tech?: User; answers: ChecklistAnswer[]; checklist: ChecklistItem[]; officeEmail: string }

export const OFFICE_EMAIL = 'office@upe.com.my'

export function buildJobSheet({ job, type, customer, tech, answers, checklist }: Omit<Ctx, 'officeEmail'>) {
  const sla = slaInfo(job, type)
  const lines = [
    `Job no: ${job.jobNo}`,
    `Subject: ${job.subject}`,
    `Job type: ${type?.name ?? '-'}`,
    `Customer: ${customer?.name ?? '-'}`,
    `Technician: ${tech?.name ?? 'Unassigned'}`,
    `Started: ${job.startTime ? job.startTime.slice(0, 16).replace('T', ' ') : '-'}`,
    `Ended: ${job.endTime ? job.endTime.slice(0, 16).replace('T', ' ') : '-'}`,
    `SLA result: ${sla.label}`,
    '',
    'Checklist',
    ...answers.filter(a => a.jobId === job.id).map(a => `  ${checklist.find(c => c.id === a.itemId)?.label ?? a.itemId}: ${a.value}`),
    ...(answers.some(a => a.jobId === job.id) ? [] : ['  No checklist answers recorded']),
    '',
    `Remarks: ${job.remarks ?? '-'}`,
  ]
  return buildPdfDataUrl(`Digital job sheet ${job.jobNo}`, lines)
}

export function makeJobSheetDocument(ctx: Ctx): GeneratedDocument {
  const dataUrl = buildJobSheet(ctx)
  const sentTo = [ctx.customer?.email, ctx.officeEmail].filter((e): e is string => !!e)
  return { id: crypto.randomUUID(), jobId: ctx.job.id, docType: 'Job Sheet', createdAt: new Date().toISOString(), status: 'Sent', fileName: `${ctx.job.jobNo}-job-sheet.pdf`, sentTo, dataUrl }
}
