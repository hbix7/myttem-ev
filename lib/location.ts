import type { BaseLocation, CoverageArea, Customer, SchedulingSettings, Site } from './types'

export interface LatLng { lat: number; lng: number }
export interface TravelEstimate { minutes: number; km: number; estimated: true }
export type TravelBand = 'green' | 'amber' | 'red'

export const BASE_LOCATION: BaseLocation = { name: 'Kajang', lat: 2.9927, lng: 101.7909 }

export const CHARGESINI_COVERAGE: CoverageArea[] = [
  { area: 'Sungai Long', postcodes: ['43000'], lat: 3.0415, lng: 101.7918, active: true },
  { area: 'Mahkota Cheras', postcodes: ['43200'], lat: 3.0165, lng: 101.8012, active: true },
  { area: 'Kajang', postcodes: ['43000', '43500'], lat: 2.9927, lng: 101.7909, active: true },
  { area: 'Bangi', postcodes: ['43650', '43600'], lat: 2.9600, lng: 101.7870, active: true },
  { area: 'Semenyih', postcodes: ['43500'], lat: 2.9476, lng: 101.8420, active: true },
  { area: 'Beranang', postcodes: ['43700'], lat: 2.8290, lng: 101.8530, active: true },
  { area: 'Cheras', postcodes: ['56000', '56100'], lat: 3.0840, lng: 101.7430, active: true },
  { area: 'Balakong', postcodes: ['43300'], lat: 3.0170, lng: 101.7480, active: true },
  { area: 'Seri Kembangan', postcodes: ['43300'], lat: 3.0250, lng: 101.7070, active: true },
  { area: 'Serdang', postcodes: ['43300', '43400'], lat: 3.0200, lng: 101.7120, active: true },
]

/* Areas UPE also works in but ChargeSini does not cover. Used for the area dropdown and map defaults. */
export const OTHER_AREAS: Record<string, LatLng> = {
  Klang: { lat: 3.0449, lng: 101.4455 },
  Puchong: { lat: 3.0330, lng: 101.6170 },
  Glenmarie: { lat: 3.0970, lng: 101.5900 },
  'Bandar Sunway': { lat: 3.0670, lng: 101.6030 },
  'Petaling Jaya': { lat: 3.1073, lng: 101.6067 },
  'Shah Alam': { lat: 3.0733, lng: 101.5185 },
}

export const DEFAULT_SCHEDULING: SchedulingSettings = {
  windows: {
    BIG: { start: '10:00', end: '14:30', minutes: 180 },
    SMALL: { start: '14:30', end: '16:30', minutes: 90 },
    ASSESSMENT: { start: '10:00', end: '12:00', minutes: 60 },
  },
  maxBigPerTeamDay: 1,
  travelGreenMax: 20,
  travelAmberMax: 30,
  speedKmh: 40,
  roadFactor: 1.4,
}

export const areaNames = (coverage: CoverageArea[]) => [...coverage.map(c => c.area), ...Object.keys(OTHER_AREAS).filter(a => !coverage.some(c => c.area === a))]

export const areaCoords = (area: string, coverage: CoverageArea[]): LatLng | undefined => coverage.find(c => c.area === area) ?? OTHER_AREAS[area]

export const siteCoords = (site: Pick<Site, 'lat' | 'lng' | 'area'> | undefined, coverage: CoverageArea[]): LatLng | undefined =>
  site && site.lat !== undefined && site.lng !== undefined ? { lat: site.lat, lng: site.lng } : site ? areaCoords(site.area, coverage) : undefined

/* A named area decides coverage on its own, so a postcode shared with an outside area can never widen it. Postcode is the fallback when no area is set. */
export const isInCoverage = (site: Pick<Site, 'area' | 'postcode'> | undefined, coverage: CoverageArea[]) => {
  if (!site) return false
  const active = coverage.filter(c => c.active)
  const area = site.area?.trim().toLowerCase()
  if (area) return active.some(c => c.area.toLowerCase() === area)
  return !!site.postcode && active.some(c => c.postcodes.includes(site.postcode.trim()))
}

export const MALAYSIA_BOUNDS = { south: 0.8, north: 7.5, west: 99.5, east: 119.5 }
export const validLat = (n: number) => Number.isFinite(n) && n >= MALAYSIA_BOUNDS.south && n <= MALAYSIA_BOUNDS.north
export const validLng = (n: number) => Number.isFinite(n) && n >= MALAYSIA_BOUNDS.west && n <= MALAYSIA_BOUNDS.east
export const isMyPostcode = (v: string) => /^\d{5}$/.test(v.trim())

/* Areas whose registered postcodes include this one. Several can share a postcode, so callers show them as choices. */
export const areasForPostcode = (postcode: string, coverage: CoverageArea[]) => isMyPostcode(postcode) ? coverage.filter(c => c.postcodes.includes(postcode.trim())).map(c => c.area) : []

/* Reads the postcode and the area out of free-text addresses such as imported rows, so nothing is left blank when the address already says it. */
export function inferLocation(address: string, coverage: CoverageArea[]): { postcode: string; area: string; lat?: number; lng?: number } {
  const text = address || ''
  const postcode = text.match(/\b(\d{5})\b/)?.[1] ?? ''
  const lower = text.toLowerCase()
  const known = [...coverage.map(c => c.area), ...Object.keys(OTHER_AREAS)]
  const byName = known.filter(a => lower.includes(a.toLowerCase())).sort((a, b) => b.length - a.length)[0]
  const byPostcode = areasForPostcode(postcode, coverage)
  const area = byName ?? (byPostcode.length === 1 ? byPostcode[0] : '')
  const c = area ? areaCoords(area, coverage) : undefined
  return { postcode, area, lat: c?.lat, lng: c?.lng }
}

export const isChillis = (customer?: Pick<Customer, 'name' | 'tags'>) => !!customer && (/chilli'?s/i.test(customer.name) || !!customer.tags?.includes("Chilli's"))

const rad = (d: number) => (d * Math.PI) / 180
export function haversineKm(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/* The only place travel time is computed. Swap the body for an OSRM or OpenRouteService call later; callers do not change. */
export function getTravelMinutes(from: LatLng, to: LatLng, opts: Pick<SchedulingSettings, 'speedKmh' | 'roadFactor'> = DEFAULT_SCHEDULING): TravelEstimate {
  const km = haversineKm(from, to) * opts.roadFactor
  return { minutes: Math.round((km / opts.speedKmh) * 60), km: Math.round(km * 10) / 10, estimated: true }
}

export const travelBand = (minutes: number, s: Pick<SchedulingSettings, 'travelGreenMax' | 'travelAmberMax'> = DEFAULT_SCHEDULING): TravelBand =>
  minutes <= s.travelGreenMax ? 'green' : minutes <= s.travelAmberMax ? 'amber' : 'red'

export const BAND_LABEL: Record<TravelBand, string> = { green: 'Short hop', amber: 'Acceptable', red: 'Too far' }
