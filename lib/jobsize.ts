import type { Contract, Quotation, RateItem } from '@/lib/store/commercial'
import type { Job, JobType, JobSize, SlotKind } from './types'
import { deriveSlot } from './scheduling'

export const AUTO_BIG_LABEL = 'Big – additional item (auto)'
export const EV_INSTALL_BIG_LABEL = 'Big – EV installation (auto)'

const additionalIds = (items: RateItem[]) => new Set(items.filter(i => i.isAdditional).map(i => i.id))

/* A job is forced to Big when its linked quotation or contract holds any item flagged as additional. */
export function hasAdditionalItem(items: RateItem[], quote?: Pick<Quotation, 'lines'>, contract?: Pick<Contract, 'lines'>) {
  const ids = additionalIds(items)
  return [...(quote?.lines ?? []), ...(contract?.lines ?? [])].some(l => ids.has(l.itemId))
}

export function resolveSize(args: { type?: JobType; chosen?: JobSize; items: RateItem[]; quotes?: Quotation[]; contract?: Contract }) {
  const { type, chosen, items, quotes = [], contract } = args
  if (type?.evKind === 'Assessment') return { jobSize: undefined as JobSize | undefined, auto: false, slot: 'ASSESSMENT' as SlotKind }
  const evInstall = type?.evKind === 'Installation'
  const auto = evInstall || quotes.some(q => hasAdditionalItem(items, q)) || hasAdditionalItem(items, undefined, contract)
  const jobSize: JobSize = auto ? 'Big' : chosen ?? 'Small'
  return { jobSize, auto, evInstall, slot: deriveSlot(type, jobSize) }
}

export const quotesForJob = (job: Pick<Job, 'id' | 'quoteId' | 'parentJobId'>, quotations: Quotation[]) => quotations.filter(q => q.jobId === job.id || q.id === job.quoteId || (!!job.parentJobId && q.jobId === job.parentJobId))
