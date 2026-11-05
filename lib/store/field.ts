'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getNow } from '@/lib/clock'
import { useStore } from '@/lib/store'
import { makeJobSheetDocument, OFFICE_EMAIL } from '@/lib/jobsheet'
import type { Attachment, AvailabilityDay, ChecklistAnswer, GeneratedDocument, Job, JobHistory, SyncConflict, SyncQueueEntry } from '@/lib/types'

type FieldState = {
  jobs: Job[]
  answers: ChecklistAnswer[]
  attachments: Attachment[]
  queue: SyncQueueEntry[]
  conflicts: SyncConflict[]
  documents: GeneratedDocument[]
  history: JobHistory[]
  availability: AvailabilityDay[]
  armedConflict: boolean
  startJob: (id: string) => void
  answer: (jobId: string, itemId: string, value: string) => void
  addAttachment: (jobId: string, attachment: Attachment) => void
  endJob: (id: string) => void
  submitJob: (id: string) => void
  toggleConflictSimulation: () => void
  flush: () => void
  resolveConflict: (id: string, mode: 'device'|'server'|'merged', values?: Record<string,string>) => void
}

const seededConflicts: SyncConflict[] = [
  { id: 'sc-10', jobId: 'j10', detectedAt: '2026-11-03T09:42:00+08:00', fields: ['endTime', 'remarks'], status: 'Unresolved', deviceValues: { endTime: '2026-11-03 09:30', remarks: 'Panel tested and safe.' }, serverValues: { endTime: '2026-11-03 09:10', remarks: 'Awaiting office review.' } },
  { id: 'sc-9', jobId: 'j9', detectedAt: '2026-11-02T16:20:00+08:00', fields: ['checklist answer'], status: 'Resolved', deviceValues: { 'checklist answer': 'Yes' }, serverValues: { 'checklist answer': 'No' } },
]
const availability = Array.from({ length: 14 }, (_, i) => { const d = new Date('2026-11-03T00:00:00+08:00'); d.setDate(d.getDate() + i); return { date: d.toISOString().slice(0, 10), maxInstalls: i % 3 === 0 ? 3 : 2, booked: i % 4 } })
const offline = (get: () => FieldState) => !useStore.getState().settings.deviceOnline
const enqueue = (set: any, get: () => FieldState, jobId: string, action: SyncQueueEntry['action'], payload?: Record<string,string>) => { const entry = { id: crypto.randomUUID(), jobId, action, payload, at: getNow().toISOString() }; set((s: FieldState) => ({ queue: [...s.queue, entry] })); if (!offline(get)) get().flush() }

export const useFieldStore = create<FieldState>()(persist((set, get) => ({
  jobs: useStore.getState().jobs.filter(j => j.technicianId === 'u4'), answers: [], attachments: [], queue: [], conflicts: seededConflicts, documents: [], history: [], availability, armedConflict: false,
  startJob: (id) => { set(s => ({ jobs: s.jobs.map(j => j.id === id ? { ...j, status: 'In Progress', startTime: getNow().toISOString() } : j) })); enqueue(set, get, id, 'start') },
  answer: (jobId, itemId, value) => { set(s => ({ answers: [...s.answers.filter(a => !(a.jobId === jobId && a.itemId === itemId)), { jobId, itemId, value, answeredAt: getNow().toISOString() }] })); enqueue(set, get, jobId, 'checklist', { itemId, value }) },
  addAttachment: (jobId, attachment) => { set(s => ({ attachments: [...s.attachments, attachment] })); enqueue(set, get, jobId, attachment.kind === 'other' ? 'photo' : attachment.kind, { name: attachment.name }) },
  endJob: (id) => { set(s => ({ jobs: s.jobs.map(j => j.id === id ? { ...j, endTime: getNow().toISOString() } : j) })); enqueue(set, get, id, 'end') },
  submitJob: (id) => {
    const done = getNow().toISOString()
    const base = get().jobs.find(j => j.id === id)
    if (!base) return
    const finished: Job = { ...base, status: 'Completed', completedAt: done, endTime: base.endTime ?? done }
    const st = useStore.getState()
    const doc = makeJobSheetDocument({ job: finished, type: st.jobTypes.find(t => t.id === finished.jobTypeId), customer: st.customers.find(c => c.id === finished.customerId), tech: st.users.find(u => u.id === finished.technicianId), answers: get().answers, checklist: st.checklistItems, officeEmail: OFFICE_EMAIL })
    const sheeted = { ...finished, jobSheetId: doc.id }
    set(s => ({ jobs: s.jobs.map(j => j.id === id ? sheeted : j), documents: [...s.documents, doc] }))
    useStore.setState(s => ({ jobs: s.jobs.map(j => j.id === id ? { ...j, ...sheeted } : j) }))
    enqueue(set, get, id, 'submit')
  },
  toggleConflictSimulation: () => set(s => ({ armedConflict: !s.armedConflict })),
  flush: () => { const { queue, armedConflict } = get(); if (!queue.length) return; const first = queue[0]; if (armedConflict) { set(s => ({ conflicts: [...s.conflicts, { id: crypto.randomUUID(), jobId: first.jobId, detectedAt: getNow().toISOString(), fields: ['endTime', 'checklist answer', 'remarks'], status: 'Unresolved', deviceValues: { endTime: 'Device 18:00', 'checklist answer': 'Yes', remarks: 'Captured offline' }, serverValues: { endTime: 'Server 17:45', 'checklist answer': 'No', remarks: 'Office copy' } }], armedConflict: false })); return } const jobIds = [...new Set(queue.map(q => q.jobId))]; set(s => ({ queue: [], jobs: s.jobs.map(j => jobIds.includes(j.id) ? { ...j, status: 'Completed' } : j), documents: [...s.documents, ...jobIds.map(jobId => ({ id: crypto.randomUUID(), jobId, docType: 'Job Sheet' as const, createdAt: getNow().toISOString(), status: 'Generated' as const }))], history: [...s.history, ...jobIds.map(jobId => ({ id: crypto.randomUUID(), jobId, userId: 'u4', event: 'Synced from device', toStatus: 'Completed' as const, at: getNow().toISOString() }))] }));
  },
  resolveConflict: (id, mode, values) => { const c = get().conflicts.find(x => x.id === id); if (!c) return; const chosen = mode === 'device' ? c.deviceValues : mode === 'server' ? c.serverValues : values || c.serverValues; set(s => ({ conflicts: s.conflicts.map(x => x.id === id ? { ...x, status: 'Resolved' } : x), jobs: s.jobs.map(j => j.id === c.jobId ? { ...j, status: mode === 'device' ? 'Completed' : j.status, endTime: chosen.endTime || j.endTime, remarks: chosen.remarks || j.remarks } : j), history: [...s.history, { id: crypto.randomUUID(), jobId: c.jobId, userId: 'u2', event: `Sync conflict resolved (${mode})`, at: getNow().toISOString() }] })); }
}), { name: 'myttem-field-store' }))
