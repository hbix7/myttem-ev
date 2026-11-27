'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { AppShell, PageHeader, StatusPill } from '@/components/shared'
import { Modal } from '@/components/kit'
import { MapPicker } from '@/components/map-picker'
import { useStore } from '@/lib/store'
import { useOperationsStore } from '@/lib/store/operations'
import { BASE_LOCATION, isMyPostcode, validLat, validLng } from '@/lib/location'
import type { CoverageArea } from '@/lib/types'

type Tab = 'teams' | 'coverage'

export function TeamsCoverageScreen() {
  const [tab, setTab] = useState<Tab>('teams')
  const teams = useOperationsStore(s => s.teams)
  const coverage = useStore(s => s.settings.coverage)
  return (
    <AppShell crumb="Settings > Teams and coverage">
      <PageHeader title="Teams and coverage" subtitle="Who goes out together, and where ChargeSini jobs can be booked." />
      <div className="rate-body">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'teams'} className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>Teams<b>{teams.length}</b></button>
          <button role="tab" aria-selected={tab === 'coverage'} className={tab === 'coverage' ? 'active' : ''} onClick={() => setTab('coverage')}>Coverage areas<b>{coverage.length}</b></button>
        </div>
        {tab === 'teams' ? <TeamsTab /> : <CoverageTab />}
      </div>
    </AppShell>
  )
}

/* ---------------- Teams ---------------- */
interface TeamDraft { id?: string; name: string; colour: string; active: boolean; memberIds: string[] }

function TeamsTab() {
  const teams = useOperationsStore(s => s.teams)
  const users = useStore(s => s.users)
  const [draft, setDraft] = useState<TeamDraft | null>(null)
  const technicians = users.filter(u => u.role === 'technician' && u.active)
  const nameOf = (id: string) => users.find(u => u.id === id)?.name ?? 'Unknown'
  const teamOf = (userId: string) => teams.find(t => t.memberIds.includes(userId) && t.id !== draft?.id)

  const save = () => {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return toast.error('Enter a team name')
    if (teams.some(t => t.id !== draft.id && t.name.toLowerCase() === name.toLowerCase())) return toast.error('Another team already uses that name')
    useOperationsStore.setState(s => {
      const moved = new Set(draft.memberIds)
      const cleaned = s.teams.map(t => t.id === draft.id ? t : { ...t, memberIds: t.memberIds.filter(m => !moved.has(m)) })
      if (draft.id) return { teams: cleaned.map(t => t.id === draft.id ? { ...t, name, colour: draft.colour, active: draft.active, memberIds: draft.memberIds } : t) }
      return { teams: [...cleaned, { id: crypto.randomUUID(), name, colour: draft.colour, active: draft.active, memberIds: draft.memberIds }] }
    })
    toast.success(draft.id ? 'Team updated' : 'Team added')
    setDraft(null)
  }
  const toggleMember = (id: string) => draft && setDraft({ ...draft, memberIds: draft.memberIds.includes(id) ? draft.memberIds.filter(m => m !== id) : [...draft.memberIds, id] })

  return (
    <>
      <div className="block-head">
        <p className="muted">Every team with at least one member appears on the scheduler. A technician belongs to one team at a time.</p>
        <button className="button primary" onClick={() => setDraft({ name: '', colour: '#5b6b8c', active: true, memberIds: [] })}><Plus size={15} /> New team</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Team</th><th>Members</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.id} className={t.memberIds.length ? '' : 'row-muted'}>
                <td><span className="team-name"><span className="swatch" style={{ background: t.colour }} aria-hidden />{t.name}</span></td>
                <td>{t.memberIds.length ? t.memberIds.map(nameOf).join(', ') : <span className="muted">No members</span>}</td>
                <td><StatusPill tone={t.memberIds.length ? 'green' : 'grey'}>{t.memberIds.length ? 'On scheduler' : 'Hidden, no members'}</StatusPill></td>
                <td className="row-actions">
                  <button className="button secondary sm" onClick={() => setDraft({ id: t.id, name: t.name, colour: t.colour, active: t.active, memberIds: t.memberIds })}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit team' : 'New team'} description="Members are technicians who work as one crew on the scheduler."
        footer={<><button className="button secondary" onClick={() => setDraft(null)}>Cancel</button><button className="button primary" onClick={save}>Save team</button></>}>
        {draft && (
          <div className="form-grid">
            <label className="field-label">Team name
              <input className="field-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Team C" />
            </label>
            <label className="field-label">Colour
              <input className="field-input colour-input" type="color" value={draft.colour} onChange={e => setDraft({ ...draft, colour: e.target.value })} />
            </label>
            <fieldset className="span-2 member-list">
              <legend>Members</legend>
              {technicians.map(u => {
                const other = teamOf(u.id)
                return (
                  <label key={u.id} className="flag-row">
                    <input type="checkbox" checked={draft.memberIds.includes(u.id)} onChange={() => toggleMember(u.id)} />
                    <span>{u.name}{other && <span className="muted"> currently in {other.name}, will move here</span>}</span>
                  </label>
                )
              })}
              {!technicians.length && <p className="muted">No active technicians. Add one under Settings, Users and roles.</p>}
            </fieldset>
          </div>
        )}
      </Modal>
    </>
  )
}

/* ---------------- Coverage ---------------- */
interface AreaDraft { index?: number; area: string; postcodes: string; lat: string; lng: string; active: boolean }

function CoverageTab() {
  const coverage = useStore(s => s.settings.coverage)
  const base = useStore(s => s.settings.baseLocation)
  const sites = useStore(s => s.sites)
  const [draft, setDraft] = useState<AreaDraft | null>(null)
  const [baseDraft, setBaseDraft] = useState({ name: base.name, lat: String(base.lat), lng: String(base.lng) })
  const used = (name: string) => sites.filter(s => s.area?.toLowerCase() === name.toLowerCase()).length

  const setCoverage = (next: CoverageArea[]) => useStore.setState(s => ({ settings: { ...s.settings, coverage: next } }))
  const parsePostcodes = (v: string) => Array.from(new Set(v.split(/[\s,]+/).filter(Boolean)))

  const save = () => {
    if (!draft) return
    const area = draft.area.trim()
    const postcodes = parsePostcodes(draft.postcodes)
    const lat = Number(draft.lat), lng = Number(draft.lng)
    if (!area) return toast.error('Enter an area name')
    if (coverage.some((c, i) => i !== draft.index && c.area.toLowerCase() === area.toLowerCase())) return toast.error('That area already exists')
    if (postcodes.some(p => !isMyPostcode(p))) return toast.error('Postcodes must be 5 digits, separated by commas')
    if (draft.lat === '' || draft.lng === '' || !validLat(lat) || !validLng(lng)) return toast.error('Pin the area centre on the map, inside Malaysia')
    const entry: CoverageArea = { area, postcodes, lat, lng, active: draft.active }
    if (draft.index === undefined) setCoverage([...coverage, entry])
    else {
      const old = coverage[draft.index].area
      setCoverage(coverage.map((c, i) => i === draft.index ? entry : c))
      if (old !== area) useStore.setState(s => ({ sites: s.sites.map(x => x.area === old ? { ...x, area } : x) }))
    }
    toast.success(draft.index === undefined ? 'Coverage area added' : 'Coverage area updated')
    setDraft(null)
  }
  const remove = (i: number) => {
    const c = coverage[i]
    if (used(c.area)) return toast.error(`${used(c.area)} site(s) use ${c.area}. Deactivate it instead.`)
    setCoverage(coverage.filter((_, j) => j !== i)); toast.success(`${c.area} removed`)
  }
  const saveBase = () => {
    const lat = Number(baseDraft.lat), lng = Number(baseDraft.lng)
    if (!baseDraft.name.trim() || !validLat(lat) || !validLng(lng)) return toast.error('Enter a name and valid coordinates')
    useStore.setState(s => ({ settings: { ...s.settings, baseLocation: { name: baseDraft.name.trim(), lat, lng } } }))
    toast.success('Base location saved')
  }

  const dLat = draft && draft.lat !== '' ? Number(draft.lat) : undefined
  const dLng = draft && draft.lng !== '' ? Number(draft.lng) : undefined
  const pinned = dLat !== undefined && dLng !== undefined && validLat(dLat) && validLng(dLng)

  return (
    <>
      <div className="block-head">
        <p className="muted">ChargeSini jobs can only be booked at sites in an active area below. Any other location is blocked on the scheduler.</p>
        <button className="button primary" onClick={() => setDraft({ area: '', postcodes: '', lat: '', lng: '', active: true })}><Plus size={15} /> New area</button>
      </div>
      <MapPicker height={300} fallback={BASE_LOCATION} zoom={11} points={coverage.map(c => ({ lat: c.lat, lng: c.lng, label: c.area, active: c.active }))} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Area</th><th>Postcodes</th><th>Centre</th><th>Sites</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {coverage.map((c, i) => (
              <tr key={c.area} className={c.active ? '' : 'row-muted'}>
                <td>{c.area}</td>
                <td>{c.postcodes.length ? c.postcodes.join(', ') : <span className="muted">None listed</span>}</td>
                <td className="mono-cell">{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</td>
                <td>{used(c.area)}</td>
                <td><StatusPill tone={c.active ? 'green' : 'grey'}>{c.active ? 'Covered' : 'Paused'}</StatusPill></td>
                <td className="row-actions">
                  <button className="button secondary sm" onClick={() => setDraft({ index: i, area: c.area, postcodes: c.postcodes.join(', '), lat: String(c.lat), lng: String(c.lng), active: c.active })}>Edit</button>
                  <button className="button secondary sm" onClick={() => setCoverage(coverage.map((x, j) => j === i ? { ...x, active: !x.active } : x))}>{c.active ? 'Pause' : 'Resume'}</button>
                  <button className="button danger-outline sm" onClick={() => remove(i)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card settings-block">
        <h2>Base location</h2>
        <p className="muted">Teams start the day here. The first job of the day is measured from this point.</p>
        <div className="base-row">
          <label className="field-label">Name<input className="field-input" value={baseDraft.name} onChange={e => setBaseDraft({ ...baseDraft, name: e.target.value })} /></label>
          <label className="field-label">Latitude<input className="field-input" inputMode="decimal" value={baseDraft.lat} onChange={e => setBaseDraft({ ...baseDraft, lat: e.target.value })} /></label>
          <label className="field-label">Longitude<input className="field-input" inputMode="decimal" value={baseDraft.lng} onChange={e => setBaseDraft({ ...baseDraft, lng: e.target.value })} /></label>
          <button className="button primary" onClick={saveBase}>Save</button>
        </div>
      </section>

      <Modal open={!!draft} onClose={() => setDraft(null)} width={720} title={draft?.index === undefined ? 'New coverage area' : 'Edit coverage area'} description="Sites in this area count as covered. The centre is the fallback point for travel estimates."
        footer={<><button className="button secondary" onClick={() => setDraft(null)}>Cancel</button><button className="button primary" onClick={save}>Save area</button></>}>
        {draft && (
          <div className="form-grid">
            <label className="field-label">Area name<input className="field-input" value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })} placeholder="e.g. Kajang" /></label>
            <label className="field-label">Postcodes<input className="field-input" value={draft.postcodes} onChange={e => setDraft({ ...draft, postcodes: e.target.value })} placeholder="43000, 43500" /></label>
            <label className="field-label">Latitude<input className="field-input" inputMode="decimal" value={draft.lat} onChange={e => setDraft({ ...draft, lat: e.target.value })} /></label>
            <label className="field-label">Longitude<input className="field-input" inputMode="decimal" value={draft.lng} onChange={e => setDraft({ ...draft, lng: e.target.value })} /></label>
            <div className="span-2">
              <p className="muted map-head">Click the map to set the area centre.</p>
              <MapPicker lat={pinned ? dLat : undefined} lng={pinned ? dLng : undefined} fallback={BASE_LOCATION} onPick={(la, ln) => setDraft({ ...draft, lat: String(la), lng: String(ln) })} />
            </div>
            <label className="flag-row span-2"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /><span>Covered by ChargeSini</span></label>
          </div>
        )}
      </Modal>
    </>
  )
}
