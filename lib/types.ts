export type Id = string
export type Role = 'sysadmin'|'admin'|'owner'|'technician'|'portal'
export type JobStatus = 'Created'|'Assigned'|'In Progress'|'Completed'|'Invoiced'|'Closed'
export type Channel = 'Phone'|'Email'|'Walk-in'|'WhatsApp'|'Portal'|'Manual'
export type SlaState = 'On track'|'Warning'|'Breached'|'Met'
export interface User { id:Id; name:string; email:string; role:Role; active:boolean; customerId?:Id }
export interface Customer { id:Id; name:string; contact:string; phone:string; email:string; sqlAccCode:string; isCommercial:boolean }
export interface Site { id:Id; customerId:Id; name:string; address:string }
export interface Asset { id:Id; siteId:Id; type:string; serialNo:string }
export interface Principal { id:Id; code:'UPE'|'PROTON'|'CHARGESINI'|'ZEEKR'|'SANGITECH'; name:string }
export interface JobType { id:Id; code:string; name:string; isEv:boolean; evKind?:'Assessment'|'Installation'; slaHours:number; warnPct:number }
export interface ChecklistItem { id:Id; jobTypeId:Id; seq:number; label:string; input:'yesno'|'text'|'number'|'photo' }
export interface ChecklistAnswer { jobId:Id; itemId:Id; value:string; answeredAt:string }
export interface Job { id:Id; jobNo:string; subject:string; customerId:Id; siteId:Id; assetId?:Id; principalId?:Id; jobTypeId:Id; parentJobId?:Id; technicianId?:Id; status:JobStatus; channel:Channel; faultType?:string; equipment?:string; remarks?:string; contactPhone?:string; contactAddress?:string; scheduledAt?:string; startTime?:string; endTime?:string; createdAt:string; slaDue:string; holdSince?:string; pausedMs:number; evOutcome?:'Converted'|'Not converted' }
export interface JobHistory { id:Id; jobId:Id; userId:Id; event:string; fromStatus?:JobStatus; toStatus?:JobStatus; comment?:string; at:string }
export interface Attachment { id:Id; jobId:Id; kind:'photo'|'signature'|'chop'|'other'; name:string; dataUrl?:string; at:string }
export interface Deadline { id:Id; jobId:Id; day:number; label:string; dueAt:string; doneAt?:string }
export type NotificationStatus = 'Queued'|'Sent'|'Fallback sent'|'Failed'
export interface Notification { id:Id; jobId:Id; channel:'Email'|'WhatsApp'; subject:string; at:string; event?:string; status?:NotificationStatus; fallbackUsed?:boolean }
export interface CustomerReply { id:Id; jobId:Id; message:string; at:string; responded:boolean; note?:string }
export interface UsageCounter { month:string; whatsapp:number; email:number }
export interface NotificationResult { notification:Notification; toast:string }

export interface SyncQueueEntry { id:Id; jobId:Id; action:'start'|'checklist'|'photo'|'signature'|'chop'|'end'|'submit'; payload?:Record<string,string>; at:string }
export interface SyncConflict { id:Id; jobId:Id; detectedAt:string; fields:string[]; status:'Unresolved'|'Resolved'; deviceValues:Record<string,string>; serverValues:Record<string,string> }
export interface GeneratedDocument { id:Id; jobId:Id; docType:'Job Sheet'|'Quotation'|'Invoice'; createdAt:string; status:'Generated'|'Sent' }
export interface AvailabilityDay { date:string; maxInstalls:number; booked:number }
export interface Settings { approvalLimit:number; sstRate:number; deadlineDays:[number,number,number,number,number,number]; whatsappNumberStatus:'Verified'|'Restricted'|'Suspended'; templates:{id:Id;name:string;status:'Approved'|'Rejected'}[]; deviceOnline:boolean; conversionBaseline:{quotationsIssued:number;installationsCompleted:number} }
export interface AppState { users:User[]; customers:Customer[]; sites:Site[]; assets:Asset[]; principals:Principal[]; jobTypes:JobType[]; checklistItems:ChecklistItem[]; jobs:Job[]; history:JobHistory[]; answers:ChecklistAnswer[]; attachments:Attachment[]; deadlines:Deadline[]; notifications:Notification[]; settings:Settings; currentUserId:Id; demoOffset:number; setCurrentUser:(id:Id)=>void; advanceClock:(ms:number)=>void; resetClock:()=>void; createJob:(input:Partial<Job> & {slaHours?:number})=>string; assignTechnician:(jobId:Id,techId:Id,scheduledAt?:string,comment?:string)=>void; holdJob:(jobId:Id,reason:string,comment?:string)=>void; resumeJob:(jobId:Id,comment?:string)=>void; closeJob:(jobId:Id,comment?:string)=>void; raiseInvoice:(jobId:Id,comment?:string)=>void; addAttachment:(jobId:Id,file:Attachment)=>void }
