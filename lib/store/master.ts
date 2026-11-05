'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const TENANT = 't-upe'
export type VocabKind = 'faultType' | 'equipment' | 'site'
export interface VocabEntry { id: string; tenant_id: string; kind: VocabKind; value: string; active: boolean }
export type FlagKey = 'A' | 'B' | 'C'
export const flagMeta: Record<FlagKey, { name: string; detail: string }> = {
  A: { name: 'Milestone A: Core job management', detail: 'Jobs, scheduler, technician field app, SLA timers.' },
  B: { name: 'Milestone B: Commercial', detail: 'Quotations, owner approval, invoices, item master.' },
  C: { name: 'Milestone C: EV programme and integrations', detail: 'EV deadlines, chargebacks, SQL Accounting import and export.' },
}

const seed = (kind: VocabKind, values: string[]): VocabEntry[] => values.map((value, i) => ({ id: `${kind}-${i + 1}`, tenant_id: TENANT, kind, value, active: true }))

interface MasterState {
  vocab: VocabEntry[]
  flags: Record<FlagKey, boolean>
  addVocab: (kind: VocabKind, value: string) => void
  updateVocab: (id: string, patch: Partial<VocabEntry>) => void
  setFlag: (key: FlagKey, on: boolean) => void
}

export const useMasterStore = create<MasterState>()(persist((set) => ({
  vocab: [
    ...seed('faultType', ['Power trip', 'Overheating', 'Earth leakage', 'MCB failure', 'Voltage fluctuation', 'Burnt cable', 'No power supply']),
    ...seed('equipment', ['Distribution board', 'Main switchboard', 'UPS', 'Generator', 'EV charger', 'Chiller panel', 'Capacitor bank']),
    ...seed('site', ['Customer premises', 'Warehouse', 'Retail mall', 'Residential', 'Industrial plant']),
  ],
  flags: { A: true, B: true, C: true },
  addVocab: (kind, value) => set(s => ({ vocab: [...s.vocab, { id: crypto.randomUUID(), tenant_id: TENANT, kind, value: value.trim(), active: true }] })),
  updateVocab: (id, patch) => set(s => ({ vocab: s.vocab.map(v => v.id === id ? { ...v, ...patch } : v) })),
  setFlag: (key, on) => set(s => ({ flags: { ...s.flags, [key]: on } })),
}), { name: 'myttem-master', version: 1 }))

export const activeVocab = (vocab: VocabEntry[], kind: VocabKind) => vocab.filter(v => v.kind === kind && v.active).map(v => v.value)
