'use client'
import { useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'

export interface MapPoint { lat: number; lng: number; label: string; active?: boolean }
export interface MapPickerProps {
  lat?: number; lng?: number
  onPick?: (lat: number, lng: number) => void
  points?: MapPoint[]
  height?: number
  fallback: { lat: number; lng: number }
  zoom?: number
}

const pin = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 22] })

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lng], map.getZoom(), { animate: true }) }, [lat, lng, map])
  return null
}

function Clicks({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick?.(Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6) })
  return null
}

export default function MapPickerInner({ lat, lng, onPick, points = [], height = 260, fallback, zoom = 12 }: MapPickerProps) {
  const has = lat !== undefined && lng !== undefined
  const center = has ? { lat, lng } : fallback
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom style={{ height, width: '100%' }} className="map-frame">
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Clicks onPick={onPick} />
      {has && <Recenter lat={lat} lng={lng} />}
      {points.map(p => (
        <CircleMarker key={p.label} center={[p.lat, p.lng]} radius={7} pathOptions={{ color: p.active === false ? '#9ca3af' : '#3d6b5c', fillOpacity: 0.55, weight: 2 }}>
          <Tooltip direction="top">{p.label}</Tooltip>
        </CircleMarker>
      ))}
      {has && <Marker position={[lat, lng]} icon={pin} />}
    </MapContainer>
  )
}
