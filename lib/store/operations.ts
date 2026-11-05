'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useStore } from '@/lib/store'
import { useEvStore } from '@/lib/store/ev'
import { LOCKED, checkPlacement, dayOf, findTechForSlot, fmtDate, stamp, time12to24, timeOf, type TechAvailability, type Violation } from '@/lib/scheduling'
import { getNow } from '@/lib/clock'

type LeadStatus = 'Draft' | 'Confirmed' | 'Discarded' | 'Manual'
type Lead = { id:string; raw:string; status:LeadStatus; customerName:string; phone:string; address:string; vehicleModel:string; chargerModel:string; preferredDate:string; jobId?:string; kind:'whatsapp'|'voice'|'text'|'image'|'pdf'; duration?:string }
type Availability = { date:string; technicianId:string; maxInstalls:number; booked:number }
export type ScheduleResult = { ok:true; overridden:boolean } | { ok:false; reason:'forbidden'|'offline'|'missing'|'locked'|'violations'|'reason-required'|'unavailable'; message:string; violations?:Violation[] }
type OperationsState = { availability:Availability[]; techAvailability:Record<string,TechAvailability>; leads:Lead[]; conflictSimulation:boolean; scheduleJob:(jobId:string, technicianId:string, date:string, time:string, overrideReason?:string)=>ScheduleResult; toggleDayOff:(technicianId:string, date:string)=>ScheduleResult; selfServiceBook:(token:string, date:string, time12:string)=>ScheduleResult; confirmLead:(id:string, fields:Partial<Lead>)=>string|undefined; discardLead:(id:string)=>void; toggleConflictSimulation:()=>void }
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
{id:'lead-1',kind:'whatsapp',status:'Draft',raw:'Customer Name: Nurul Huda / Phone: 013-8889900 / Address: Cheras / Vehicle Model: Proton e.MAS 7 / Charger Model: 7kW AC / Preferred Assessment Date: 12/11/2026',customerName:'Nurul Huda',phone:'013-8889900',address:'Cheras',vehicleModel:'Proton e.MAS 7',chargerModel:'7kW AC',preferredDate:'12/11/2026'},
{id:'lead-2',kind:'whatsapp',status:'Draft',raw:'Customer Name: Daniel Tan / Phone: 012-4442211 / Address: Puchong / Vehicle Model: Zeekr-style vehicle / Charger Model: 7kW AC / Preferred Assessment Date: 14/11/2026',customerName:'Daniel Tan',phone:'012-4442211',address:'Puchong',vehicleModel:'Zeekr-style vehicle',chargerModel:'7kW AC',preferredDate:'14/11/2026'},
{id:'lead-3',kind:'voice',status:'Manual',raw:'Voice note 0:42',customerName:'',phone:'',address:'',vehicleModel:'',chargerModel:'',preferredDate:'',duration:'0:42'}]
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
return {ok:true,overridden:violations.length>0}},
toggleDayOff:(technicianId,date)=>{
if(currentRole()!=='admin')return {ok:false,reason:'forbidden',message:'Only admins can change availability.'}
if(!isOnline())return {ok:false,reason:'offline',message:'No connection. Availability changes need a connection.'}
set(s=>{const a=s.techAvailability[technicianId];if(!a)return s;const off=a.daysOff.includes(date);return {techAvailability:{...s.techAvailability,[technicianId]:{...a,daysOff:off?a.daysOff.filter(d=>d!==date):[...a.daysOff,date]}}}})
return {ok:true,overridden:false}},
selfServiceBook:(token,date,time12)=>{
const ev=useEvStore.getState();const booking=ev.bookings.find(b=>b.token===token)
if(!booking)return {ok:false,reason:'missing',message:'This booking link is not active.'}
const core=useStore.getState();const type=core.jobTypes.find(t=>t.id==='jt4');const time=time12to24(time12)
const {tech}=findTechForSlot({technicians:technicians(),date,time,type,jobs:core.jobs,jobTypes:core.jobTypes,capacity:core.settings.techDailyCapacity,availability:get().techAvailability})
if(!tech)return {ok:false,reason:'unavailable',message:'That time is no longer available. Please choose another slot.'}
const cust=core.customers.find(c=>c.name.toLowerCase()===booking.customer.toLowerCase())
const jobId=core.createJob({subject:`EV charger installation: ${booking.customer}`,customerId:cust?.id||'ev1',jobTypeId:'jt4',channel:'Portal',principalId:'p3',technicianId:tech.id,scheduledAt:stamp(date,time)})
core.updateJob(jobId,{selfService:true})
note(jobId,'Customer self-service booking',`Booked via link for ${fmtDate(date)} ${time}. Limits applied, no override.`)
ev.confirmBooking(token,date,time12)
useEvStore.setState(s=>({bookings:s.bookings.map(b=>b.token===token?{...b,technician:tech.name,installationJobId:jobId}:b)}))
return {ok:true,overridden:false}},
confirmLead:(id,fields)=>{const lead=get().leads.find(l=>l.id===id);if(!lead)return;const merged={...lead,...fields};const core=useStore.getState();const customer=core.customers.find(c=>c.name.toLowerCase()===merged.customerName.toLowerCase());const jobId=core.createJob({subject:`EV Assessment — ${merged.vehicleModel}`,customerId:customer?.id||'c1',channel:'WhatsApp',remarks:merged.raw,principalId:'p3',scheduledAt:merged.preferredDate?`2026-11-${merged.preferredDate.slice(0,2).padStart(2,'0')}T09:00:00+08:00`:undefined});set(s=>({leads:s.leads.map(l=>l.id===id?{...l,...merged,status:'Confirmed',jobId}:l)}));return jobId},discardLead:id=>set(s=>({leads:s.leads.map(l=>l.id===id?{...l,status:'Discarded'}:l)}))}),{name:'myttem-operations',version:2,migrate:()=>({}) as never}))
export type {Lead, Availability}
