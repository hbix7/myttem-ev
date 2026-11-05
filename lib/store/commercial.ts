'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getNow } from '@/lib/clock'

export type QuoteStatus = 'Draft'|'Pending owner approval'|'Sent'|'Accepted'|'Declined'|'Adjusted'
export type InvoiceStatus = 'Draft'|'Sent for sign-off'|'Signed off'|'Paid'|'Invoiced'
export type ItemType = 'Service'|'Part'
export type PrincipalCode = 'UPE'|'PROTON'|'CHARGESINI'|'ZEEKR'|'SANGITECH'
export interface RateItem { id:string; tenant_id?:string; code:string; name:string; type:ItemType; prices:Record<PrincipalCode,number>; active?:boolean }
export interface QuoteLine { itemId:string; qty:number; unitPrice:number; originalUnitPrice:number }
export interface Quotation { id:string; quoteNo:string; jobId:string; jobNo:string; customer:string; principal:PrincipalCode; lines:QuoteLine[]; subtotal:number; sst:number; total:number; status:QuoteStatus; createdAt:string; sentAt?:string; originalTotal?:number; declineReason?:string; directCall?:boolean; reminders:string[] }
export interface Invoice { id:string; invoiceNo:string; jobId:string; jobNo:string; customer:string; lines:QuoteLine[]; subtotal:number; sst:number; total:number; status:InvoiceStatus; createdAt:string; paymentConfirmedAt?:string; exportBatchId?:string; signedBy?:string; signedAt?:string }
export interface SqlExportBatch { id:string; createdBy:string; createdAt:string; fileName:string; invoiceCount:number }
interface CommercialState { items:RateItem[]; quotations:Quotation[]; invoices:Invoice[]; batches:SqlExportBatch[]; imported:Record<string,string[]>; createQuote:(q:Omit<Quotation,'id'|'quoteNo'|'createdAt'|'subtotal'|'sst'|'total'>)=>string; updateQuote:(id:string, patch:Partial<Quotation>)=>void; createInvoice:(i:Omit<Invoice,'id'|'invoiceNo'|'createdAt'|'sst'|'total'>)=>string; updateInvoice:(id:string, patch:Partial<Invoice>)=>void; addBatch:(batch:SqlExportBatch)=>void; markImported:(kind:string, rows:string[])=>void; addItem:(i:{code:string;name:string;type:ItemType;unitPrice:number})=>void; updateItem:(id:string, patch:{code?:string;name?:string;type?:ItemType;unitPrice?:number;active?:boolean})=>void; importItems:(rows:{code:string;name:string;type:ItemType;unitPrice:number}[])=>{added:number;updated:number} }
const items:RateItem[]=([
{id:'svc1',code:'SVC-001',name:'Technical assessment visit',type:'Service',prices:{UPE:150,PROTON:140,CHARGESINI:125,ZEEKR:120,SANGITECH:130}},
{id:'svc2',code:'SVC-002',name:'7kW AC wallbox installation (labour)',type:'Service',prices:{UPE:600,PROTON:570,CHARGESINI:530,ZEEKR:520,SANGITECH:550}},
{id:'svc3',code:'SVC-003',name:'Cable run, per metre',type:'Service',prices:{UPE:35,PROTON:33,CHARGESINI:31,ZEEKR:30,SANGITECH:32}},
{id:'svc4',code:'SVC-004',name:'Earthing and testing',type:'Service',prices:{UPE:180,PROTON:175,CHARGESINI:155,ZEEKR:160,SANGITECH:170}},
{id:'prt1',code:'PRT-001',name:'MCB 32A',type:'Part',prices:{UPE:45,PROTON:43,CHARGESINI:38,ZEEKR:40,SANGITECH:42}},
{id:'prt2',code:'PRT-002',name:'Isolator switch 40A',type:'Part',prices:{UPE:60,PROTON:58,CHARGESINI:52,ZEEKR:55,SANGITECH:58}},
{id:'prt3',code:'PRT-003',name:'Wallbox mounting kit',type:'Part',prices:{UPE:90,PROTON:85,CHARGESINI:78,ZEEKR:80,SANGITECH:85}},
{id:'svc5',code:'SVC-005',name:'Breakdown call-out, first hour',type:'Service',prices:{UPE:220,PROTON:210,CHARGESINI:200,ZEEKR:200,SANGITECH:205}},
{id:'svc6',code:'SVC-006',name:'Preventive maintenance, per DB',type:'Service',prices:{UPE:260,PROTON:250,CHARGESINI:240,ZEEKR:240,SANGITECH:245}},
{id:'svc7',code:'SVC-007',name:'Thermographic scan',type:'Service',prices:{UPE:480,PROTON:460,CHARGESINI:440,ZEEKR:440,SANGITECH:450}},
{id:'prt4',code:'PRT-004',name:'MCCB 100A 3-pole',type:'Part',prices:{UPE:380,PROTON:370,CHARGESINI:350,ZEEKR:355,SANGITECH:360}},
{id:'prt5',code:'PRT-005',name:'RCCB 40A 30mA',type:'Part',prices:{UPE:165,PROTON:160,CHARGESINI:150,ZEEKR:152,SANGITECH:155}},
{id:'prt6',code:'PRT-006',name:'Contactor 32A',type:'Part',prices:{UPE:140,PROTON:135,CHARGESINI:128,ZEEKR:130,SANGITECH:132}},
{id:'prt7',code:'PRT-007',name:'Surge protection device Type 2',type:'Part',prices:{UPE:320,PROTON:310,CHARGESINI:295,ZEEKR:300,SANGITECH:305}},
{id:'prt8',code:'PRT-008',name:'4mm2 PVC cable, per metre',type:'Part',prices:{UPE:6,PROTON:6,CHARGESINI:5.5,ZEEKR:5.5,SANGITECH:5.8}},
{id:'prt9',code:'PRT-009',name:'Type 2 charging cable 5m',type:'Part',prices:{UPE:450,PROTON:430,CHARGESINI:410,ZEEKR:415,SANGITECH:420}},
{id:'prt10',code:'PRT-010',name:'Indicator light and push-button set',type:'Part',prices:{UPE:35,PROTON:34,CHARGESINI:32,ZEEKR:32,SANGITECH:33}},
]).map(i=>({...i,tenant_id:'t-upe',active:true})) as RateItem[]
const seedLines=(ids:string[],principal:PrincipalCode):QuoteLine[]=>ids.map((itemId,i)=>{const item=items.find(x=>x.id===itemId)!;const qty=[2,1,1,45,3,4][i]||1;const price=item.prices[principal];return {itemId,qty,unitPrice:price,originalUnitPrice:price}})
const calc=(lines:QuoteLine[])=>{const subtotal=lines.reduce((sum,l)=>sum+l.qty*l.unitPrice,0);return {subtotal,sst:subtotal*.08,total:subtotal*1.08}}
const q1Lines=seedLines(['svc2','svc4','svc1','svc3','prt1','prt2'],'UPE');const q1Calc=calc(q1Lines)
const q2Lines:QuoteLine[]=[{itemId:'svc2',qty:3,unitPrice:600,originalUnitPrice:600}];const q2Calc=calc(q2Lines)
const seededQuotations:Quotation[]=[{id:'q1',quoteNo:'QT-000007',jobId:'j7',jobNo:'JOB-000007',customer:'Sunway Retail Sdn Bhd',principal:'UPE',lines:q1Lines,...q1Calc,status:'Pending owner approval',createdAt:'2026-11-03T08:00:00+08:00',reminders:[]},{id:'q2',quoteNo:'QT-000008',jobId:'j8',jobNo:'JOB-000008',customer:'Klang Logistics Hub Sdn Bhd',principal:'UPE',lines:q2Lines,...q2Calc,status:'Sent',createdAt:'2026-11-03T09:00:00+08:00',sentAt:'2026-11-03T09:00:00+08:00',reminders:[]}]
const invLines:QuoteLine[]=[{itemId:'svc2',qty:1,unitPrice:600,originalUnitPrice:600},{itemId:'svc4',qty:1,unitPrice:180,originalUnitPrice:180}];const invCalc=calc(invLines)
export const useCommercialStore=create<CommercialState>()(persist((set,get)=>({items,quotations:seededQuotations,invoices:[{id:'i1',invoiceNo:'INV-000008',jobId:'j8',jobNo:'JOB-000008',customer:'Klang Logistics Hub Sdn Bhd',lines:invLines,...invCalc,status:'Invoiced',createdAt:'2026-11-03T09:30:00+08:00'}],batches:[],imported:{},createQuote:(q)=>{const id=crypto.randomUUID();const n=`QT-${String(get().quotations.length+7).padStart(6,'0')}`;const c=calc(q.lines);set(s=>({quotations:[...s.quotations,{...q,...c,id,quoteNo:n,createdAt:getNow().toISOString()}]}));return id},updateQuote:(id,patch)=>set(s=>({quotations:s.quotations.map(q=>q.id===id?{...q,...patch}:q)})),createInvoice:(i)=>{const id=crypto.randomUUID();const n=`INV-${String(get().invoices.length+8).padStart(6,'0')}`;const c=calc(i.lines);set(s=>({invoices:[...s.invoices,{...i,...c,id,invoiceNo:n,createdAt:getNow().toISOString()}]}));return id},updateInvoice:(id,patch)=>set(s=>({invoices:s.invoices.map(i=>i.id===id?{...i,...patch}:i)})),addBatch:(batch)=>set(s=>({batches:[...s.batches,batch]})),markImported:(kind,rows)=>set(s=>({imported:{...s.imported,[kind]:rows}})),addItem:(i)=>set(s=>({items:[...s.items,{id:crypto.randomUUID(),tenant_id:'t-upe',code:i.code,name:i.name,type:i.type,active:true,prices:{UPE:i.unitPrice,PROTON:i.unitPrice,CHARGESINI:i.unitPrice,ZEEKR:i.unitPrice,SANGITECH:i.unitPrice}}]})),updateItem:(id,patch)=>set(s=>({items:s.items.map(x=>{if(x.id!==id)return x;const {unitPrice,...rest}=patch;return {...x,...rest,prices:unitPrice===undefined?x.prices:{...x.prices,UPE:unitPrice}}})})),importItems:(rows)=>{let added=0,updated=0;set(s=>{const items=[...s.items];for(const r of rows){const idx=items.findIndex(x=>x.code.toLowerCase()===r.code.toLowerCase());if(idx>=0){items[idx]={...items[idx],name:r.name,type:r.type,prices:{...items[idx].prices,UPE:r.unitPrice}};updated++}else{items.push({id:crypto.randomUUID(),tenant_id:'t-upe',code:r.code,name:r.name,type:r.type,active:true,prices:{UPE:r.unitPrice,PROTON:r.unitPrice,CHARGESINI:r.unitPrice,ZEEKR:r.unitPrice,SANGITECH:r.unitPrice}});added++}}return {items}});return {added,updated}}}),{name:'myttem-commercial',version:2,migrate:()=>({}) as never}))
export const rateCardLabel=(code:PrincipalCode)=>code==='UPE'?'UPE own card':code
export const quoteTotal=(lines:QuoteLine[])=>calc(lines)
