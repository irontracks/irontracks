'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import type { GeoTrackPoint } from '@/utils/geoUtils'

// MapLibre GL loaded dynamically to avoid SSR issues
type MapLibreGL = typeof import('maplibre-gl')
type MapInstance = import('maplibre-gl').Map

// Dark raster style using CartoDB tiles proxied through same origin
const DARK_STYLE: import('maplibre-gl').StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: ['/map-tiles/carto/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; CARTO &copy; OSM',
    },
  },
  layers: [
    {
      id: 'carto-tiles',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
}

interface RouteMapProps {
  points: GeoTrackPoint[]
  height?: number
  live?: boolean
}

// ── SVG Fallback (used if MapLibre/WebGL fails) ────────────────────────────
function SVGFallback({ points, height, live }: RouteMapProps) {
  const PAD = 16
  const W = 400

  const data = useMemo(() => {
    if (points.length < 2) return null
    const lats = points.map(p => p.latitude)
    const lngs = points.map(p => p.longitude)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const latPad = (maxLat - minLat) * 0.15 || 0.0002
    const lngPad = (maxLng - minLng) * 0.15 || 0.0002
    return {
      padMinLat: minLat - latPad, padMinLng: minLng - lngPad,
      latRange: (maxLat + latPad) - (minLat - latPad),
      lngRange: (maxLng + lngPad) - (minLng - lngPad),
    }
  }, [points])

  const h = height ?? 200

  return (
    <div className="mb-3 rounded-xl overflow-hidden" style={{ height: h, background: '#0d1117', border: '1px solid rgba(34,197,94,0.15)' }}>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {Array.from({ length: 7 }).map((_, i) => {
          const x = PAD + (i / 6) * (W - PAD * 2)
          return <line key={`v${i}`} x1={x} y1={PAD} x2={x} y2={h - PAD} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        })}
        {Array.from({ length: 4 }).map((_, i) => {
          const y = PAD + (i / 3) * (h - PAD * 2)
          return <line key={`h${i}`} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        })}
        {data && points.length >= 2 && (() => {
          const { padMinLat, padMinLng, latRange, lngRange } = data
          const toX = (lng: number) => PAD + ((lng - padMinLng) / lngRange) * (W - PAD * 2)
          const toY = (lat: number) => h - PAD - ((lat - padMinLat) / latRange) * (h - PAD * 2)
          const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.longitude).toFixed(1)},${toY(p.latitude).toFixed(1)}`).join(' ')
          const first = points[0]
          const last = points[points.length - 1]
          return (
            <>
              <path d={pathD} fill="none" stroke="rgba(34,197,94,0.2)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathD} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={toX(first.longitude).toFixed(1)} cy={toY(first.latitude).toFixed(1)} r="5" fill="#22c55e" stroke="#0d1117" strokeWidth="2" />
              <circle cx={toX(last.longitude).toFixed(1)} cy={toY(last.latitude).toFixed(1)} r="6" fill="#fff" stroke="#22c55e" strokeWidth="2.5" />
              {live && (
                <circle cx={toX(last.longitude).toFixed(1)} cy={toY(last.latitude).toFixed(1)} r="12" fill="none" stroke="rgba(34,197,94,0.4)" strokeWidth="1.5">
                  <animate attributeName="r" from="8" to="18" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
            </>
          )
        })()}
        {live && points.length < 2 && (
          <text x="200" y={h / 2} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="11" fontFamily="system-ui">Aguardando sinal GPS...</text>
        )}
      </svg>
    </div>
  )
}

// ── Main component: MapLibre GL with SVG fallback ──────────────────────────
export default function RouteMapLeaflet({ points, height = 200, live }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const mlRef = useRef<MapLibreGL | null>(null)
  const [engine, setEngine] = useState<'loading' | 'maplibre' | 'svg'>('loading')

  // Load MapLibre GL dynamically (WebGL-based, uses fetch for tiles)
  useEffect(() => {
    let cancelled = false

    import('maplibre-gl').then((ml) => {
      if (cancelled) return

      // Inject MapLibre CSS
      const cssId = 'maplibre-css'
      if (!document.getElementById(cssId)) {
        const style = document.createElement('style')
        style.id = cssId
        style.textContent = `.maplibregl-map{font:12px/20px Helvetica,Arial,sans-serif;overflow:hidden;position:relative;-webkit-tap-highlight-color:rgba(0,0,0,0)}.maplibregl-canvas{position:absolute;left:0;top:0}.maplibregl-canvas-container{overflow:hidden;position:relative}.maplibregl-canvas-container.maplibregl-interactive{cursor:grab}.maplibregl-ctrl-bottom-left,.maplibregl-ctrl-bottom-right,.maplibregl-ctrl-top-left,.maplibregl-ctrl-top-right{position:absolute;pointer-events:none;z-index:2}.maplibregl-ctrl{pointer-events:auto}`
        document.head.appendChild(style)
      }

      mlRef.current = ml
      setEngine('maplibre')
    }).catch(() => {
      if (!cancelled) setEngine('svg')
    })

    return () => { cancelled = true }
  }, [])

  // Initialize map once MapLibre is loaded
  useEffect(() => {
    if (engine !== 'maplibre' || !containerRef.current || mapRef.current || !mlRef.current) return

    const ml = mlRef.current

    try {
      const map = new ml.Map({
        container: containerRef.current,
        style: DARK_STYLE,
        center: [-46.63, -23.55],
        zoom: 13,
        attributionControl: false,
        interactive: true,
        dragRotate: false,
        pitchWithRotate: false,
      })

      map.on('load', () => {
        // Add route source + layers once map loads
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
        })

        // Route glow
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route',
          paint: { 'line-color': 'rgba(34,197,94,0.25)', 'line-width': 10, 'line-blur': 6 },
        })

        // Route line
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#22c55e', 'line-width': 3, 'line-opacity': 0.9 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })
      })

      // Detect if tiles actually load (WebGL might fail)
      let loaded = false
      map.on('data', (e) => {
        const evt = e as unknown as Record<string, unknown>
        if (!loaded && evt.dataType === 'source' && evt.isSourceLoaded) {
          loaded = true
        }
      })

      // If nothing loads after 8s, fall back to SVG
      const timeout = setTimeout(() => {
        if (!loaded && mapRef.current) {
          mapRef.current.remove()
          mapRef.current = null
          setEngine('svg')
        }
      }, 8000)

      map.on('error', () => {
        clearTimeout(timeout)
        map.remove()
        mapRef.current = null
        setEngine('svg')
      })

      mapRef.current = map

      return () => {
        clearTimeout(timeout)
      }
    } catch {
      setEngine('svg')
    }
  }, [engine])

  // Update route on MapLibre map
  useEffect(() => {
    const map = mapRef.current
    if (!map || engine !== 'maplibre' || points.length < 1) return

    const coords = points.map(p => [p.longitude, p.latitude])

    const updateRoute = () => {
      const source = map.getSource('route')
      if (!source) return

      ;(source as import('maplibre-gl').GeoJSONSource).setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      })

      if (coords.length >= 2) {
        const lngs = coords.map(c => c[0])
        const lats = coords.map(c => c[1])
        const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)]
        const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)]

        if (live) {
          const last = coords[coords.length - 1]
          map.easeTo({ center: last as [number, number], zoom: Math.max(map.getZoom(), 15), duration: 500 })
        } else {
          map.fitBounds([sw, ne], { padding: 30, duration: 500 })
        }
      } else if (coords.length === 1) {
        map.easeTo({ center: coords[0] as [number, number], zoom: 16, duration: 500 })
      }
    }

    if (map.isStyleLoaded()) {
      updateRoute()
    } else {
      map.once('load', updateRoute)
    }
  }, [points, live, engine])

  // Before enough data, show placeholder
  if (points.length < 2 && !live) return null

  // SVG fallback
  if (engine === 'svg') {
    return <SVGFallback points={points} height={height} live={live} />
  }

  return (
    <div className="relative mb-3 rounded-xl overflow-hidden" style={{ height, background: '#0d1117', border: '1px solid rgba(34,197,94,0.15)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {engine === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-white/30">Carregando mapa...</span>
        </div>
      )}
    </div>
  )
}
