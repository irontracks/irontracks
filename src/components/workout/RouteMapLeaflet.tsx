'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { GeoTrackPoint } from '@/utils/geoUtils'

// Critical Leaflet CSS inlined — guarantees tiles render correctly without
// depending on external CSS file loading (fixes blank map on iOS WKWebView)
const LEAFLET_CRITICAL_CSS = `
.leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,
.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,
.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute;left:0;top:0}
.leaflet-container{overflow:hidden;-webkit-tap-highlight-color:transparent;
font-size:12px;line-height:1.5;background:#0a0a0a}
.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow{
-webkit-user-select:none;user-select:none;-webkit-user-drag:none}
.leaflet-tile{filter:inherit;visibility:hidden}
.leaflet-tile-loaded{visibility:inherit}
.leaflet-tile-pane{z-index:200}
.leaflet-overlay-pane{z-index:400}
.leaflet-shadow-pane{z-index:500}
.leaflet-marker-pane{z-index:600}
.leaflet-tooltip-pane{z-index:650}
.leaflet-popup-pane{z-index:700}
.leaflet-map-pane canvas{z-index:100}
.leaflet-map-pane svg{z-index:200}
.leaflet-tile-container{pointer-events:none}
.leaflet-zoom-animated{-webkit-transform-origin:0 0;transform-origin:0 0}
.leaflet-fade-anim .leaflet-tile,.leaflet-fade-anim .leaflet-popup{
opacity:0;-webkit-transition:opacity 0.2s linear;transition:opacity 0.2s linear}
.leaflet-fade-anim .leaflet-tile-loaded,.leaflet-fade-anim .leaflet-map-pane .leaflet-popup{opacity:1}
.leaflet-control-container .leaflet-control-zoom{display:none}
`

// Inject critical CSS once
if (typeof window !== 'undefined') {
  const id = 'leaflet-critical-css'
  if (!document.getElementById(id)) {
    const style = document.createElement('style')
    style.id = id
    style.textContent = LEAFLET_CRITICAL_CSS
    document.head.appendChild(style)
  }
}

// Tile URL — proxied through same origin via Next.js rewrites
const CARTO_DARK = '/map-tiles/carto/dark_all/{z}/{x}/{y}.png'
const OSM_FALLBACK = '/map-tiles/osm/{z}/{x}/{y}.png'

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
      fadeAnimation: true,
    }).setView([-23.55, -46.63], 13)

    const cartoLayer = L.tileLayer(CARTO_DARK, { maxZoom: 19 })

    let tileLoadCount = 0
    let tileErrorCount = 0

    cartoLayer.on('tileload', () => {
      tileLoadCount++
      if (tileLoadCount >= 1) setTileStatus('ok')
    })

    cartoLayer.on('tileerror', () => {
      tileErrorCount++
      if (tileErrorCount >= 4 && tileLoadCount === 0) {
        map.removeLayer(cartoLayer)
        const osmLayer = L.tileLayer(OSM_FALLBACK, { maxZoom: 19 })
        osmLayer.on('tileload', () => setTileStatus('ok'))
        osmLayer.on('tileerror', () => setTileStatus('error'))
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
