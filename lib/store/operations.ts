'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useStore } from '@/lib/store'
import type { Job } from '@/lib/types'

type LeadStatus = 'Draft' | 'Confirmed' | 'Discarded' | 'Manual'
type Lead = { id:string; raw:string; status:LeadStatus; customerName:string; phone:string; address:string; vehicleModel:string; chargerModel:string; preferredDate:string; jobId?:string; kind:'whatsapp'|'voice'|'text'|'image'|'pdf'; duration?:string }
type Availability = { date:string; technicianId:string; maxInstalls:number; booked:number }
type OperationsState = { availability:Availability[]; leads:Lead[]; conflictSimulation:boolean; assignScheduled:(jobId:string, technicianId:string, scheduledAt:string)=>void; confirmLead:(id:string, fields:Partial<Lead>)=>string|undefined; discardLead:(id:string)=>void; toggleConflictSimulation:()=>void }
const dates = Array.from({length:14},(_,i)=>{const d=new Date('2026-11-03T00:00:00+08:00');d.setDate(d.getDate()+i);return d.toISOString().slice(0,10)})
const techs=['u4','u5','u6']
const availability:Availability[] = dates.flatMap((date,di)=>techs.map((technicianId,ti)=>({date,technicianId,maxInstalls:2,booked:(di===1&&ti===0)||(di===4&&ti===1)||(di===6&&ti===2)?2:((di+ti)%3===0?1:0)})))
const leads:Lead[]=[
{id:'lead-1',kind:'whatsapp',status:'Draft',raw:'Customer Name: Nurul Huda / Phone: 013-8889900 / Address: Cheras / Vehicle Model: Proton e.MAS 7 / Charger Model: 7kW AC / Preferred Assessment Date: 12/11/2026',customerName:'Nurul Huda',phone:'013-8889900',address:'Cheras',vehicleModel:'Proton e.MAS 7',chargerModel:'7kW AC',preferredDate:'12/11/2026'},
{id:'lead-2',kind:'whatsapp',status:'Draft',raw:'Customer Name: Daniel Tan / Phone: 012-4442211 / Address: Puchong / Vehicle Model: Zeekr-style vehicle / Charger Model: 7kW AC / Preferred Assessment Date: 14/11/2026',customerName:'Daniel Tan',phone:'012-4442211',address:'Puchong',vehicleModel:'Zeekr-style vehicle',chargerModel:'7kW AC',preferredDate:'14/11/2026'},
{id:'lead-3',kind:'voice',status:'Manual',raw:'Voice note 0:42',customerName:'',phone:'',address:'',vehicleModel:'',chargerModel:'',preferredDate:'',duration:'0:42'}]
export const useOperationsStore=create<OperationsState>()(persist((set,get)=>({availability,leads,conflictSimulation:false,toggleConflictSimulation:()=>set(s=>({conflictSimulation:!s.conflictSimulation})),assignScheduled:(jobId,technicianId,scheduledAt)=>{const current=useStore.getState(); const job=current.jobs.find(j=>j.id===jobId); if(!job)return; current.assignTechnician(jobId,technicianId,scheduledAt,'Rescheduled'); set(s=>({availability:s.availability.map(a=>a.date===scheduledAt.slice(0,10)&&a.technicianId===technicianId?{...a,booked:a.booked+1}:a)}))},confirmLead:(id,fields)=>{const lead=get().leads.find(l=>l.id===id);if(!lead)return;const merged={...lead,...fields};const core=useStore.getState();const customer=core.customers.find(c=>c.name.toLowerCase()===merged.customerName.toLowerCase());const jobId=core.createJob({subject:`EV Assessment — ${merged.vehicleModel}`,customerId:customer?.id||'c1',channel:'WhatsApp',priority:'P3',remarks:merged.raw,principalId:'p3',scheduledAt:merged.preferredDate?`2026-11-${merged.preferredDate.slice(0,2).padStart(2,'0')}T09:00:00+08:00`:undefined});set(s=>({leads:s.leads.map(l=>l.id===id?{...l,...merged,status:'Confirmed',jobId}:l)}));return jobId},discardLead:id=>set(s=>({leads:s.leads.map(l=>l.id===id?{...l,status:'Discarded'}:l)}))}),{name:'myttem-operations'}))
export type {Lead, Availability}
