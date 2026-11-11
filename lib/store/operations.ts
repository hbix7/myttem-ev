'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useStore } from '@/lib/store'
import { evOnScheduled, createEvJob } from '@/lib/ev'
import { LOCKED, checkPlacement, dayOf, findTechForSlot, fmtDate, stamp, time12to24, timeOf, type TechAvailability, type Violation } from '@/lib/scheduling'
import { getNow } from '@/lib/clock'
import { dispatch } from '@/lib/messaging'
import { useWhatsAppStore, type WaMessage } from '@/lib/store/whatsapp'
import { normalizePhone, parseTemplate, type InboundMessage } from '@/lib/whatsapp'

type LeadStatus = 'Draft' | 'Confirmed' | 'Discarded' | 'Manual'
type Lead = { id:string; raw:string; status:LeadStatus; customerName:string; phone:string; address:string; vehicleModel:string; chargerModel:string; preferredDate:string; jobId?:string; kind:'email'; subject?:string; from?:string; receivedAt?:string }
type Availability = { date:string; technicianId:string; maxInstalls:number; booked:number }
export type ScheduleResult = { ok:true; overridden:boolean } | { ok:false; reason:'forbidden'|'offline'|'missing'|'locked'|'violations'|'reason-required'|'unavailable'; message:string; violations?:Violation[] }
type OperationsState = { availability:Availability[]; techAvailability:Record<string,TechAvailability>; leads:Lead[]; conflictSimulation:boolean; scheduleJob:(jobId:string, technicianId:string, date:string, time:string, overrideReason?:string)=>ScheduleResult; toggleDayOff:(technicianId:string, date:string)=>ScheduleResult; selfServiceBook:(token:string, date:string, time12:string)=>ScheduleResult; confirmLead:(id:string, fields:Partial<Lead>)=>string|undefined; discardLead:(id:string)=>void; addLead:(lead:Omit<Lead,'id'>)=>string; receiveEmail:(from:string,subject:string,body:string)=>'draft'|'manual'; ingestInbound:(messages:InboundMessage[])=>IngestSummary; toggleConflictSimulation:()=>void }
export type IngestSummary = { jobs:number; messages:number; duplicates:number }
const dates = Array.from({length:14},(_,i)=>{const d=new Date('2026-11-03T00:00:00+08:00');d.setDate(d.getDate()+i);return d.toISOString().slice(0,10)})
const techs=['u4','u5','u6']
const availability:Availability[] = dates.flatMap((date,di)=>techs.map((technicianId,ti)=>({date,technicianId,maxInstalls:2,booked:(di===1&&ti===0)||(di===4&&ti===1)||(di===6&&ti===2)?2:((di+ti)%3===0?1:0)})))
const techAvailability:Record<string,TechAvailability>={
u4:{workStart:'08:00',workEnd:'18:00',workDays:[1,2,3,4,5,6],daysOff:[]},
u5:{workStart:'08:30',workEnd:'17:30',workDays:[1,2,3,4,5],daysOff:['2026-11-06']},
u6:{workStart:'09:00',workEnd:'18:00',workDays:[1,2,3,4,5,6],daysOff:['2026-11-09']}}
const technicians=()=>useStore.getState().users.filter(u=>u.role==='technician'&&u.active)
const isOnline=()=>useStore.getState().settings.deviceOnline&&(typeof navigator==='undefined'||navigator.onLine!==false)
const currentRole=()=>{const s=useStore.getState();return s.users.find(u=>u.id===s.currentUserId)?.role}
const note=(jobId:string,event:string,comment?:string)=>useStore.setState(s=>({history:[...s.history,{id:crypto.randomUUID(),jobId,userId:s.currentUserId,event,comment,at:getNow().toISOString()}]}))
const leads:Lead[]=[
{id:'lead-1',kind:'email',status:'Draft',from:'nurul.huda@example.com',subject:'EV charger assessment request',receivedAt:'2026-11-03T08:42:00+08:00',raw:'Customer Name: Nurul Huda\nPhone: 013-8889900\nAddress: Cheras\nVehicle Model: Proton e.MAS 7\nCharger Model: 7kW AC\nPreferred Assessment Date: 12/11/2026',customerName:'Nurul Huda',phone:'013-8889900',address:'Cheras',vehicleModel:'Proton e.MAS 7',chargerModel:'7kW AC',preferredDate:'12/11/2026'},
{id:'lead-2',kind:'email',status:'Draft',from:'daniel.tan@example.com',subject:'Home charger quote',receivedAt:'2026-11-03T09:10:00+08:00',raw:'Customer Name: Daniel Tan\nPhone: 012-4442211\nAddress: Puchong\nVehicle Model: Zeekr-style vehicle\nCharger Model: 7kW AC\nPreferred Assessment Date: 14/11/2026',customerName:'Daniel Tan',phone:'012-4442211',address:'Puchong',vehicleModel:'Zeekr-style vehicle',chargerModel:'7kW AC',preferredDate:'14/11/2026'},
{id:'lead-3',kind:'email',status:'Manual',from:'info@greenpark-condo.example',subject:'Charging bays for our condominium',receivedAt:'2026-11-03T10:05:00+08:00',raw:'Hi, our management committee is looking at EV charging bays for the visitor car park. Could someone call us to discuss options?',customerName:'',phone:'',address:'',vehicleModel:'',chargerModel:'',preferredDate:''}]
export const useOperationsStore=create<OperationsState>()(persist((set,get)=>({availability,techAvailability,leads,conflictSimulation:false,toggleConflictSimulation:()=>set(s=>({conflictSimulation:!s.conflictSimulation})),scheduleJob:(jobId,technicianId,date,time,overrideReason)=>{
const core=useStore.getState()
if(currentRole()!=='admin')return {ok:false,reason:'forbidden',message:'Only admins can schedule jobs. Technicians cannot reschedule.'}
if(!isOnline())return {ok:false,reason:'offline',message:'No connection. Scheduling changes need a connection.'}
const job=core.jobs.find(j=>j.id===jobId);const tech=core.users.find(u=>u.id===technicianId)
if(!job||!tech)return {ok:false,reason:'missing',message:'Job or technician not found.'}
if(LOCKED.includes(job.status))return {ok:false,reason:'locked',message:'Only jobs that have not started can be rescheduled.'}
const violations=checkPlacement({job,type:core.jobTypes.find(t=>t.id===job.jobTypeId),tech,date,time,jobs:core.jobs,jobTypes:core.jobTypes,capacity:core.settings.techDailyCapacity,availability:get().techAvailability[technicianId]})
const reason=overrideReason?.trim()
if(violations.length&&!reason)return {ok:false,reason:'violations',message:'This placement breaks a scheduling rule.',violations}
if(violations.length&&reason!.length<5)return {ok:false,reason:'reason-required',message:'Enter a short reason (at least 5 characters) to override.',violations}
const from=job.scheduledAt?`${fmtDate(dayOf(job.scheduledAt))} ${timeOf(job.scheduledAt)}`:undefined
core.assignTechnician(jobId,technicianId,stamp(date,time),from?`Moved from ${from} to ${fmtDate(date)} ${time}`:`Scheduled for ${fmtDate(date)} ${time}`)
if(violations.length){
const rules=violations.map(v=>v.message)
note(jobId,'Scheduling override',`${rules.join(' ')} Reason: ${reason}`)
core.updateJob(jobId,{schedulingOverride:{reason:reason!,rules,by:core.currentUserId,at:getNow().toISOString()}})
}else core.updateJob(jobId,{schedulingOverride:undefined})
if(from)dispatch(jobId,'Reschedule confirmation',`Your appointment moved to ${fmtDate(date)} ${time}`)
return {ok:true,overridden:violations.length>0}},
toggleDayOff:(technicianId,date)=>{
if(currentRole()!=='admin')return {ok:false,reason:'forbidden',message:'Only admins can change availability.'}
if(!isOnline())return {ok:false,reason:'offline',message:'No connection. Availability changes need a connection.'}
set(s=>{const a=s.techAvailability[technicianId];if(!a)return s;const off=a.daysOff.includes(date);return {techAvailability:{...s.techAvailability,[technicianId]:{...a,daysOff:off?a.daysOff.filter(d=>d!==date):[...a.daysOff,date]}}}})
return {ok:true,overridden:false}},
selfServiceBook:(token,date,time12)=>{
const core=useStore.getState();const parent=core.jobs.find(j=>j.ev?.bookingToken===token);const installId=parent?.ev?.installJobId
if(!parent||!installId)return {ok:false,reason:'missing',message:'This booking link is not active.'}
const type=core.jobTypes.find(t=>t.id==='jt4');const time=time12to24(time12)
const {tech}=findTechForSlot({technicians:technicians(),date,time,type,jobs:core.jobs,jobTypes:core.jobTypes,capacity:core.settings.techDailyCapacity,availability:get().techAvailability})
if(!tech)return {ok:false,reason:'unavailable',message:'That time is no longer available. Please choose another slot.'}
core.updateJob(installId,{technicianId:tech.id,scheduledAt:stamp(date,time),status:'Assigned',selfService:true})
note(installId,'Customer self-service booking',`Booked via link for ${fmtDate(date)} ${time}. Limits applied, no override.`)
evOnScheduled(installId)
return {ok:true,overridden:false}},
confirmLead:(id,fields)=>{const lead=get().leads.find(l=>l.id===id);if(!lead)return;const merged={...lead,...fields};const jobId=createEvJob({principalId:'p3',customerName:merged.customerName||'Email customer',phone:merged.phone,address:merged.address,vehicle:merged.vehicleModel,chargerModel:merged.chargerModel,channel:lead.kind==='email'?'Email':'WhatsApp',remarks:`${merged.raw}${merged.preferredDate?`\nPreferred assessment date: ${merged.preferredDate}`:''}`});set(s=>({leads:s.leads.map(l=>l.id===id?{...l,...merged,status:'Confirmed',jobId}:l)}));return jobId},discardLead:id=>set(s=>({leads:s.leads.map(l=>l.id===id?{...l,status:'Discarded'}:l)})),addLead:lead=>{const id=crypto.randomUUID();set(s=>({leads:[{...lead,id},...s.leads]}));return id},
receiveEmail:(from,subject,body)=>{const t=parseTemplate(body);const base={id:crypto.randomUUID(),kind:'email' as const,from,subject,raw:body,receivedAt:new Date().toISOString()}
const lead:Lead=t?{...base,status:'Draft',...t}:{...base,status:'Manual',customerName:'',phone:'',address:'',vehicleModel:'',chargerModel:'',preferredDate:''}
set(s=>({leads:[lead,...s.leads]}));return t?'draft':'manual'},
ingestInbound:messages=>{
const summary:IngestSummary={jobs:0,messages:0,duplicates:0}
for(const m of messages){
const wa=useWhatsAppStore.getState()
if(wa.seenMessageIds.includes(m.id)){summary.duplicates++;continue}
wa.markSeen(m.id)
const text={text:m.text??'',image:m.text?`Image: ${m.text}`:'Image received',pdf:`PDF: ${m.fileName??'document'}`,voice:'Voice note',other:m.fileName?`File: ${m.fileName}`:'Unsupported message'}[m.kind]
const message:WaMessage={id:m.id,direction:'in',text,at:m.at,kind:m.kind}
const phone=normalizePhone(m.from)
const existing=wa.conversations.find(c=>normalizePhone(c.phone)===phone)
if(existing){wa.appendMessage(existing.id,message,{unread:true});summary.messages++;continue}
const core=useStore.getState()
const customer=core.customers.find(c=>normalizePhone(c.phone)===phone)
const open=customer?core.jobs.filter(j=>j.customerId===customer.id&&j.status!=='Closed').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]:undefined
const name=m.template?.customerName||customer?.name||m.name||`+${m.from}`
let jobId=open?.id
if(!jobId){
jobId=createEvJob({principalId:'p3',customerName:name,phone:`+${m.from}`,address:m.template?.address??'',vehicle:m.template?.vehicleModel??'',chargerModel:m.template?.chargerModel??'',channel:'WhatsApp',subject:m.template?undefined:`WhatsApp: ${text.slice(0,60)||'new enquiry'}`,remarks:`${text}${m.template?.preferredDate?`\nPreferred assessment date: ${m.template.preferredDate}`:''}`})
summary.jobs++
}else{note(open!.id,'WhatsApp conversation linked',`Message from +${m.from} added to this job`);summary.messages++}
useWhatsAppStore.getState().addConversation({id:crypto.randomUUID(),phone:m.from,name,jobId,unread:1,messages:[message]})
}
return summary}}),{name:'myttem-operations',version:3,migrate:()=>({}) as never}))
export type {Lead, Availability}
