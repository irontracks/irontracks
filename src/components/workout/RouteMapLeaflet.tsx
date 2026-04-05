'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { GeoTrackPoint } from '@/utils/geoUtils'

// Inject Leaflet CSS once at runtime (avoids SSR/bundler issues with CSS imports)
if (typeof window !== 'undefined') {
  const LEAFLET_CSS_ID = 'leaflet-css'
  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement('link')
    link.id = LEAFLET_CSS_ID
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    link.crossOrigin = ''
    document.head.appendChild(link)
  }
}

// CartoDB Dark tiles — free, no API key, matches IronTracks dark theme
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR =
  '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OSM</a>'

interface RouteMapLeafletProps {
  /** GPS track points to render */
  points: GeoTrackPoint[]
  /** Map container height in pixels. Defaults to 200. */
  height?: number
  /** Whether tracking is live — follows latest point */
  live?: boolean
}

/** Leaflet route map component — renders a GPS track on dark tiles like Strava. */
export default function RouteMapLeaflet({ points, height = 200, live }: RouteMapLeafletProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const polylineRef = useRef<L.Polyline | null>(null)
  const startMarkerRef = useRef<L.CircleMarker | null>(null)
  const endMarkerRef = useRef<L.CircleMarker | null>(null)

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
    }).setView([-23.55, -46.63], 13) // default São Paulo

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update route whenever points change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const latLngs: L.LatLngExpression[] = points.map(p => [p.latitude, p.longitude])

    // Polyline
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

    // Start marker
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

    // End / current-position marker
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

    // Fit bounds
    if (latLngs.length >= 2) {
      const bounds = L.latLngBounds(latLngs)
      if (live) {
        // During live tracking, keep latest point visible
        const lastPos = latLngs[latLngs.length - 1] as [number, number]
        map.setView(lastPos, map.getZoom() < 15 ? 15 : map.getZoom(), { animate: true })
      } else {
        map.fitBounds(bounds, { padding: [20, 20], animate: true })
      }
    } else if (latLngs.length === 1) {
      const pos = latLngs[0] as [number, number]
      map.setView(pos, 16)
    }
  }, [points, live])

  // Handle map resize when container becomes visible
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const timer = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(timer)
  }, [height])

  if (points.length < 2 && !live) return null

  return (
    <div
      ref={containerRef}
      className="mb-3 rounded-xl overflow-hidden"
      style={{
        height,
        border: '1px solid rgba(34,197,94,0.15)',
        background: '#0a0a0a',
      }}
    />
  )
}
