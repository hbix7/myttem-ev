'use client'
import dynamic from 'next/dynamic'
import type { MapPickerProps } from './map-picker-inner'

const Inner = dynamic(() => import('./map-picker-inner'), {
  ssr: false,
  loading: () => <div className="map-frame map-loading" role="status">Loading map...</div>,
})

export type { MapPoint } from './map-picker-inner'

export function MapPicker(props: MapPickerProps) {
  return <Inner {...props} />
}
