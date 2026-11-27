'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MapPin, Plus, Wand2 } from 'lucide-react'
import { AppShell, EmptyState, PageHeader, StatusPill } from '@/components/shared'
import { Modal } from '@/components/kit'
import { MapPicker } from '@/components/map-picker'
import { useStore } from '@/lib/store'
import { BASE_LOCATION, areaCoords, areaNames, areasForPostcode, inferLocation, isInCoverage, isMyPostcode, validLat, validLng } from '@/lib/location'
import type { Site } from '@/lib/types'

const TENANT = 't-upe'

interface Draft { id?: string; customerId: string; name: string; address: string; postcode: string; area: string; lat: string; lng: string }
const blank = (customerId = ''): Draft => ({ customerId, name: '', address: '', postcode: '', area: '', lat: '', lng: '', })
const toDraft = (s: Site): Draft => ({ id: s.id, customerId: s.customerId, name: s.name, address: s.address, postcode: s.postcode, area: s.area, lat: s.lat === undefined ? '' : String(s.lat), lng: s.lng === undefined ? '' : String(s.lng) })

type Filter = 'all' | 'missing' | 'covered' | 'outside'

export function SitesScreen() {
  const sites = useStore(s => s.sites)
  const customers = useStore(s => s.customers)
  const coverage = useStore(s => s.settings.coverage)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [draft, setDraft] = useState<Draft | null>(null)

  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? '-'
  const missing = (s: Site) => !s.area?.trim() || !s.postcode?.trim() || s.lat === undefined || s.lng === undefined
  const counts = useMemo(() => ({ missing: sites.filter(missing).length, total: sites.length }), [sites])

  const rows = sites.filter(s => {
    const text = `${s.name} ${customerName(s.customerId)} ${s.address} ${s.area} ${s.postcode}`.toLowerCase()
    if (!text.includes(q.toLowerCase())) return false
    if (filter === 'missing') return missing(s)
    if (filter === 'covered') return isInCoverage(s, coverage)
    if (filter === 'outside') return !isInCoverage(s, coverage)
    return true
  })

  const fillFromAddresses = () => {
    let filled = 0
    useStore.setState(st => ({
      sites: st.sites.map(s => {
        if (!missing(s)) return s
        const found = inferLocation(s.address, st.settings.coverage)
        const area = s.area?.trim() || found.area
        const postcode = s.postcode?.trim() || found.postcode
        const c = area ? areaCoords(area, st.settings.coverage) : undefined
        const next = { ...s, area, postcode, lat: s.lat ?? c?.lat, lng: s.lng ?? c?.lng }
        if (next.area !== s.area || next.postcode !== s.postcode || next.lat !== s.lat) filled++
        return next
      }),
    }))
    if (filled) toast.success(`Filled postcode, area or coordinates on ${filled} site${filled > 1 ? 's' : ''}`)
    else toast.info('Nothing could be read from the addresses. Edit those sites by hand.')
  }

  return (
    <AppShell crumb="Directory > Sites">
      <PageHeader
        title="Sites"
        subtitle="Every site needs a postcode, an area and map coordinates. Travel estimates and ChargeSini coverage checks depend on them."
        action={<div className="button-row">
          {counts.missing > 0 && <button className="button secondary" onClick={fillFromAddresses}><Wand2 size={15} /> Fill from addresses</button>}
          <button className="button primary" onClick={() => setDraft(blank(customers[0]?.id))}><Plus size={15} /> New site</button>
        </div>}
      />
      <div className="rate-body">
        {counts.missing > 0 && (
          <div className="notice amber" role="status">
            <MapPin size={16} aria-hidden />
            <span><strong>{counts.missing} of {counts.total} sites</strong> are missing a postcode, area or coordinates. Jobs at these sites get no travel estimate and cannot be checked against ChargeSini coverage.</span>
          </div>
        )}
        <div className="filter-bar">
          <input className="field-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search site, customer, address, area..." aria-label="Search sites" />
          <select className="field-input" aria-label="Filter sites" value={filter} onChange={e => setFilter(e.target.value as Filter)}>
            <option value="all">All sites</option>
            <option value="missing">Needs location details</option>
            <option value="covered">Inside ChargeSini coverage</option>
            <option value="outside">Outside ChargeSini coverage</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Site</th><th>Customer</th><th>Address</th><th>Postcode</th><th>Area</th><th>Coordinates</th><th>ChargeSini</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{customerName(s.customerId)}</td>
                  <td className="cell-wrap">{s.address || <span className="muted">-</span>}</td>
                  <td>{s.postcode || <StatusPill tone="amber">Missing</StatusPill>}</td>
                  <td>{s.area || <StatusPill tone="amber">Missing</StatusPill>}</td>
                  <td className="mono-cell">{s.lat !== undefined && s.lng !== undefined ? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : <StatusPill tone="amber">Missing</StatusPill>}</td>
                  <td>{!s.area ? <span className="muted">Unknown</span> : isInCoverage(s, coverage) ? <StatusPill tone="green">Covered</StatusPill> : <StatusPill tone="grey">Not covered</StatusPill>}</td>
                  <td className="row-actions"><button className="button secondary sm" onClick={() => setDraft(toDraft(s))}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <EmptyState title="No sites match" helper="Try a different search or filter." />}
        </div>
      </div>
      <SiteModal draft={draft} onChange={setDraft} />
    </AppShell>
  )
}

function SiteModal({ draft, onChange }: { draft: Draft | null; onChange: (d: Draft | null) => void }) {
  const customers = useStore(s => s.customers)
  const coverage = useStore(s => s.settings.coverage)
  const [errors, setErrors] = useState<Record<string, string>>({})
  if (!draft) return <Modal open={false} onClose={() => onChange(null)} title="Site" />

  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const lat = draft.lat === '' ? undefined : Number(draft.lat)
  const lng = draft.lng === '' ? undefined : Number(draft.lng)
  const hasPin = lat !== undefined && lng !== undefined && validLat(lat) && validLng(lng)
  const suggestions = areasForPostcode(draft.postcode, coverage)
  const known = areaCoords(draft.area, coverage)
  const covered = isInCoverage({ area: draft.area, postcode: draft.postcode }, coverage)

  const changePostcode = (postcode: string) => {
    const patch: Partial<Draft> = { postcode: postcode.replace(/\D/g, '').slice(0, 5) }
    const hits = areasForPostcode(patch.postcode!, coverage)
    if (!draft.area && hits.length === 1) Object.assign(patch, areaPatch(hits[0]))
    set(patch)
  }
  const areaPatch = (area: string): Partial<Draft> => {
    const c = areaCoords(area, coverage)
    return c && !hasPin ? { area, lat: String(c.lat), lng: String(c.lng) } : { area }
  }
  const useAreaCentre = () => { if (known) set({ lat: String(known.lat), lng: String(known.lng) }) }

  const save = () => {
    const e: Record<string, string> = {}
    if (!draft.customerId) e.customerId = 'Choose a customer'
    if (!draft.name.trim()) e.name = 'Enter a site name'
    if (!draft.address.trim()) e.address = 'Enter the street address'
    if (!isMyPostcode(draft.postcode)) e.postcode = 'Enter a 5 digit postcode'
    if (!draft.area.trim()) e.area = 'Choose or type an area'
    if (draft.lat === '' || draft.lng === '') e.coords = 'Pin the site on the map or enter latitude and longitude'
    else if (!hasPin) e.coords = 'Coordinates must be inside Malaysia'
    setErrors(e)
    if (Object.keys(e).length) return
    const site: Site = { id: draft.id ?? crypto.randomUUID(), tenant_id: TENANT, customerId: draft.customerId, name: draft.name.trim(), address: draft.address.trim(), postcode: draft.postcode.trim(), area: draft.area.trim(), lat, lng }
    useStore.setState(s => ({ sites: draft.id ? s.sites.map(x => x.id === draft.id ? { ...x, ...site } : x) : [...s.sites, site] }))
    toast.success(draft.id ? 'Site updated' : 'Site added')
    onChange(null)
  }

  const close = () => { setErrors({}); onChange(null) }
  const err = (k: string) => errors[k] && <span className="field-error" role="alert">{errors[k]}</span>

  return (
    <Modal open onClose={close} width={760} title={draft.id ? 'Edit site' : 'New site'} description="Postcode, area and coordinates drive travel estimates and coverage checks."
      footer={<><button className="button secondary" onClick={close}>Cancel</button><button className="button primary" onClick={save}>Save site</button></>}>
      <div className="form-grid">
        <label className="field-label">Customer
          <select className="field-input" value={draft.customerId} onChange={e => set({ customerId: e.target.value })}>
            <option value="">Select customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>{err('customerId')}
        </label>
        <label className="field-label">Site name
          <input className="field-input" value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Home site" />{err('name')}
        </label>
        <label className="field-label span-2">Address
          <input className="field-input" value={draft.address} onChange={e => set({ address: e.target.value })} placeholder="Street, taman, town" />{err('address')}
        </label>
        <label className="field-label">Postcode
          <input className="field-input" inputMode="numeric" maxLength={5} value={draft.postcode} onChange={e => changePostcode(e.target.value)} placeholder="43000" />{err('postcode')}
          {suggestions.length > 1 && !draft.area && (
            <span className="suggest-row">Area for this postcode:{suggestions.map(a => <button type="button" key={a} className="chip-remove" onClick={() => set(areaPatch(a))}>{a}</button>)}</span>
          )}
        </label>
        <label className="field-label">Area
          <input className="field-input" list="site-areas" value={draft.area} onChange={e => set({ area: e.target.value })} onBlur={() => set(areaPatch(draft.area.trim()))} placeholder="Choose or type an area" />
          <datalist id="site-areas">{areaNames(coverage).map(a => <option key={a} value={a} />)}</datalist>{err('area')}
        </label>
        <div className="span-2 coverage-note" data-tone={!draft.area ? 'none' : covered ? 'ok' : 'out'}>
          {!draft.area ? 'Choose an area to see whether ChargeSini covers it.' : covered ? `${draft.area} is inside ChargeSini coverage.` : `${draft.area} is outside ChargeSini coverage. ChargeSini jobs cannot be booked here.`}
        </div>
        <label className="field-label">Latitude
          <input className="field-input" inputMode="decimal" value={draft.lat} onChange={e => set({ lat: e.target.value })} placeholder="3.0415" />
        </label>
        <label className="field-label">Longitude
          <input className="field-input" inputMode="decimal" value={draft.lng} onChange={e => set({ lng: e.target.value })} placeholder="101.7918" />
        </label>
        <div className="span-2">
          {errors.coords && <span className="field-error" role="alert">{errors.coords}</span>}
          <div className="map-head">
            <span className="muted">Click the map to place the pin.</span>
            {known && <button type="button" className="button ghost sm" onClick={useAreaCentre}>Use centre of {draft.area}</button>}
          </div>
          <MapPicker lat={hasPin ? lat : undefined} lng={hasPin ? lng : undefined} fallback={known ?? BASE_LOCATION} onPick={(la, ln) => set({ lat: String(la), lng: String(ln) })} />
        </div>
      </div>
    </Modal>
  )
}
