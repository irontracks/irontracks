'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { GeoTrackPoint } from '@/utils/geoUtils'

// Inject Leaflet CSS once at runtime — self-hosted to avoid cross-origin issues
if (typeof window !== 'undefined') {
  const LEAFLET_CSS_ID = 'leaflet-css'
  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement('link')
    link.id = LEAFLET_CSS_ID
    link.rel = 'stylesheet'
    link.href = '/leaflet.css'
    document.head.appendChild(link)
  }
}

// Tile providers — try CartoDB Dark first, fall back to OSM
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const OSM_STANDARD = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

interface RouteMapLeafletProps {
  points: GeoTrackPoint[]
  height?: number
  live?: boolean
}

export default function RouteMapLeaflet({ points, height = 200, live }: RouteMapLeafletProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const polylineRef = useRef<L.Polyline | null>(null)
  const startMarkerRef = useRef<L.CircleMarker | null>(null)
  const endMarkerRef = useRef<L.CircleMarker | null>(null)
  const [tileStatus, setTileStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: true,
    }).setView([-23.55, -46.63], 13)

    // Try CartoDB Dark first
    const cartoLayer = L.tileLayer(CARTO_DARK, {
      maxZoom: 19,
      subdomains: 'abcd',
      crossOrigin: true,
    })

    let tileLoadCount = 0
    let tileErrorCount = 0

    cartoLayer.on('tileload', () => {
      tileLoadCount++
      if (tileLoadCount >= 1) setTileStatus('ok')
    })

    cartoLayer.on('tileerror', () => {
      tileErrorCount++
      // If first 4 tiles all fail, switch to OSM fallback
      if (tileErrorCount >= 4 && tileLoadCount === 0) {
        map.removeLayer(cartoLayer)
        const osmLayer = L.tileLayer(OSM_STANDARD, {
          maxZoom: 19,
          crossOrigin: true,
        })
        osmLayer.on('tileload', () => setTileStatus('ok'))
        osmLayer.addTo(map)
      }
    })

    cartoLayer.addTo(map)
    mapRef.current = map

    // Force recalculate size after mount + accordion animation
    const t1 = setTimeout(() => map.invalidateSize(), 100)
    const t2 = setTimeout(() => map.invalidateSize(), 400)
    const t3 = setTimeout(() => map.invalidateSize(), 1000)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update route whenever points change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const latLngs: L.LatLngExpression[] = points.map(p => [p.latitude, p.longitude])

    if (polylineRef.current) {
      polylineRef.current.setLatLngs(latLngs)
    } else if (latLngs.length >= 2) {
      polylineRef.current = L.polyline(latLngs, {
        color: '#22c55e',
        weight: 3.5,
        opacity: 0.85,
        smoothFactor: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)
    }

    if (latLngs.length >= 1) {
      const startPos = latLngs[0] as [number, number]
      if (startMarkerRef.current) {
        startMarkerRef.current.setLatLng(startPos)
      } else {
        startMarkerRef.current = L.circleMarker(startPos, {
          radius: 6,
          color: '#22c55e',
          fillColor: '#22c55e',
          fillOpacity: 1,
          weight: 2,
        }).addTo(map)
      }
    }

    if (latLngs.length >= 2) {
      const endPos = latLngs[latLngs.length - 1] as [number, number]
      if (endMarkerRef.current) {
        endMarkerRef.current.setLatLng(endPos)
      } else {
        endMarkerRef.current = L.circleMarker(endPos, {
          radius: 7,
          color: '#22c55e',
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 2.5,
        }).addTo(map)
      }
    }

    if (latLngs.length >= 2) {
      if (live) {
        const lastPos = latLngs[latLngs.length - 1] as [number, number]
        map.setView(lastPos, map.getZoom() < 15 ? 15 : map.getZoom(), { animate: true })
      } else {
        const bounds = L.latLngBounds(latLngs)
        map.fitBounds(bounds, { padding: [20, 20], animate: true })
      }
    } else if (latLngs.length === 1) {
      const pos = latLngs[0] as [number, number]
      map.setView(pos, 16)
    }
  }, [points, live])

  if (points.length < 2 && !live) return null

  return (
    <div className="relative mb-3 rounded-xl overflow-hidden" style={{ height, background: '#0a0a0a', border: '1px solid rgba(34,197,94,0.15)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {tileStatus === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/30">Carregando mapa...</span>
        </div>
      )}
      {tileStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-red-400/60">Falha ao carregar tiles</span>
        </div>
      )}
    </div>
  )
}
