import { getNow } from './clock'
import type { Job, JobType, SlaState } from './types'
export function slaState(job:Job, type?:JobType):SlaState { const now=getNow().getTime(); const end=job.endTime?new Date(job.endTime).getTime():now; const ratio=(Math.min(now,end)-new Date(job.createdAt).getTime()-job.pausedMs)/(new Date(job.slaDue).getTime()-new Date(job.createdAt).getTime()); if(['Completed','Invoiced','Closed'].includes(job.status)) return ratio<1?'Met':'Breached'; if(ratio>=1)return 'Breached'; if(ratio>=(type?.warnPct??.8))return 'Warning'; return 'On track' }
export function timeRemaining(job:Job){const ms=new Date(job.slaDue).getTime()-getNow().getTime(); const abs=Math.abs(ms); const h=Math.floor(abs/3600000),m=Math.floor(abs%3600000/60000); return `${ms<0?'-':''}${h}h ${m}m`}
