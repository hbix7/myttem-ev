'use client'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, fmtDate, weekdayOf } from '@/lib/scheduling'
import type { DateSuggestion } from '@/lib/suggest'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const LEGEND = [
  { cls: 'rec', label: 'Recommended', hint: 'Best fit for the team' },
  { cls: 'ok', label: 'Available', hint: 'A team is free' },
  { cls: 'na', label: 'Fully booked', hint: 'No team can take it' },
  { cls: 'out', label: 'Not offered', hint: 'Past or outside the window' },
] as const

function monthLabel(month: string) {
  return fmtDate(`${month}-01`, { month: 'long', year: 'numeric' })
}

function statusOf(s?: DateSuggestion) {
  if (!s) return 'out'
  if (s.rating === 'Recommended') return 'rec'
  if (s.rating === 'Possible') return 'ok'
  return 'na'
}

export function AvailabilityCalendar({ suggestions, selected, onPick }: { suggestions: DateSuggestion[]; selected?: string; onPick: (s: DateSuggestion) => void }) {
  const byDate = useMemo(() => new Map(suggestions.map(s => [s.date, s])), [suggestions])
  const firstMonth = suggestions[0]?.date.slice(0, 7)
  const lastMonth = suggestions[suggestions.length - 1]?.date.slice(0, 7)
  const bookable = suggestions.find(s => s.rating === 'Recommended') ?? suggestions.find(s => s.rating === 'Possible')
  const [chosenMonth, setMonth] = useState<string>()
  const month = chosenMonth ?? (selected ?? bookable?.date ?? suggestions[0]?.date)?.slice(0, 7) ?? ''
  const [hovered, setHovered] = useState<string>()

  if (!firstMonth || !lastMonth || !month) return null

  const first = `${month}-01`
  const lead = (weekdayOf(first) + 6) % 7
  const [y, m] = month.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  const prev = addDays(first, -1).slice(0, 7)
  const next = addDays(first, 32).slice(0, 7)

  const focus = byDate.get(hovered ?? selected ?? '')
  const focusDate = hovered ?? selected

  return (
    <div className="sd-wrap">
      <div className="sd-cal">
        <div className="sd-head">
          <button type="button" className="icon-button" aria-label="Previous month" disabled={month <= firstMonth} onClick={() => setMonth(prev)}><ChevronLeft size={16} /></button>
          <strong aria-live="polite">{monthLabel(month)}</strong>
          <button type="button" className="icon-button" aria-label="Next month" disabled={month >= lastMonth} onClick={() => setMonth(next)}><ChevronRight size={16} /></button>
        </div>
        <div className="sd-grid" role="grid" aria-label={`Availability for ${monthLabel(month)}`}>
          {WEEKDAYS.map(d => <span key={d} className="sd-dow" role="columnheader">{d}</span>)}
          {cells.map((date, i) => {
            if (!date) return <span key={`b${i}`} />
            const s = byDate.get(date)
            const status = statusOf(s)
            const pickable = status === 'rec' || status === 'ok'
            const isSel = selected === date
            const label = `${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}, ${s ? (s.rating === 'Possible' ? 'available' : s.rating.toLowerCase()) : 'not offered'}`
            return (
              <button
                type="button"
                role="gridcell"
                key={date}
                aria-label={label}
                aria-disabled={!pickable}
                aria-pressed={isSel}
                className={`sd-day ${status}${isSel ? ' sel' : ''}`}
                onMouseEnter={() => setHovered(date)}
                onMouseLeave={() => setHovered(undefined)}
                onFocus={() => setHovered(date)}
                onBlur={() => setHovered(undefined)}
                onClick={() => { if (pickable && s) onPick(s) }}
              >
                <span>{Number(date.slice(8))}</span>
                {pickable && s?.time && <small>{s.time}</small>}
              </button>
            )
          })}
        </div>
        <ul className="sd-legend" aria-label="Colour guide">
          {LEGEND.map(l => <li key={l.cls} title={l.hint}><i className={`sd-swatch ${l.cls}`} />{l.label}</li>)}
          <li><i className="sd-swatch sel" />Selected</li>
        </ul>
      </div>
      <p className="sd-detail" aria-live="polite">
        {focus && focusDate
          ? <><strong>{fmtDate(focusDate, { weekday: 'short', day: 'numeric', month: 'short' })}</strong> · {focus.rating === 'Possible' ? 'Available' : focus.rating}{focus.time && focus.rating !== 'Not available' ? ` at ${focus.time}` : ''}. <span className="muted">{focus.reason}</span></>
          : <span className="muted">Hover or focus a date to see why it is rated that way, then click to book it.</span>}
      </p>
    </div>
  )
}
