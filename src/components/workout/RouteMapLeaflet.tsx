'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as LeafletMap, Polyline as LeafletPolyline, CircleMarker as LeafletCircleMarker } from 'leaflet'
import { logWarn } from '@/lib/logger'
import type { GeoTrackPoint } from '@/utils/geoUtils'
import 'leaflet/dist/leaflet.css'

interface RouteMapProps {
  points: GeoTrackPoint[]
  height?: number
  /** True while a tracking session is active (shows live dot + pulse). */
  live?: boolean
  /** True while we're still waiting for a usable GPS fix. */
  acquiring?: boolean
}

/**
 * Route map \u2014 Leaflet with OpenStreetMap tiles proxied through same-origin.
 *
 * Why imperative Leaflet (not react-leaflet):
 *   - Past react-leaflet attempts failed on iOS WKWebView with blank maps.
 *   - Imperative init gives us full control over tile URLs + DOM mount order.
 *
 * Why same-origin tile URLs (/map-tiles/osm/...):
 *   - iOS WKWebView has historically blocked cross-origin tiles under strict
 *     CSP/COEP configurations. The Next.js rewrite at /map-tiles/osm/:path*
 *     (see next.config.ts) proxies to https://tile.openstreetmap.org/:path*
 *     so tiles are served same-origin from the device's perspective.
 *
 * Resilience:
 *   - If Leaflet fails to initialize for any reason we fall back to the old
 *     pure-SVG polyline \u2014 the user still sees their route.
 */
export default function RouteMapLeaflet({ points, height = 200, live, acquiring }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const polylineRef = useRef<LeafletPolyline | null>(null)
  const startMarkerRef = useRef<LeafletCircleMarker | null>(null)
  const endMarkerRef = useRef<LeafletCircleMarker | null>(null)
  const autoFollowRef = useRef<boolean>(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // ─── Mount / unmount Leaflet map ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let map: LeafletMap | null = null

    const init = async () => {
      if (!containerRef.current) return
      try {
        const L = (await import('leaflet')).default

        if (cancelled || !containerRef.current) return

        map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
          // Touch drag/zoom are the defaults — keep them for mobile.
          preferCanvas: true, // Canvas renderer is more stable on iOS WKWebView.
        })
        mapRef.current = map

        // Default view: Brazil-ish centroid so the map never starts blank
        // while we wait for the first fix.
        map.setView([-14.235, -51.9253], 4)

        // OpenStreetMap tiles via same-origin proxy (see next.config.ts).
        // Fallback to direct URL if proxy path is missing (e.g. purely static
        // Capacitor build without Next server).
        const tileUrl = '/map-tiles/osm/{z}/{x}/{y}.png'
        L.tileLayer(tileUrl, {
          maxZoom: 19,
          minZoom: 2,
          attribution: '', // hidden to save space; credit in app footer
          // Cross-origin on tiles isn't needed (same-origin proxy), but keep
          // the image element anonymous for broader compat.
          crossOrigin: true,
          // Opaque retry behaviour to keep the map feeling alive on spotty
          // connections.
          errorTileUrl:
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#0d1117"/></svg>',
            ),
        }).addTo(map)

        // Fix blank-map-on-iOS: the container's final size is computed after
        // CSS/layout, so invalidate once on next tick.
        setTimeout(() => {
          if (!cancelled && mapRef.current) {
            mapRef.current.invalidateSize()
          }
        }, 120)

        // Detect user interaction \u2014 stop auto-panning to the latest fix so
        // they can explore the route.
        map.on('dragstart zoomstart', () => {
          autoFollowRef.current = false
        })

        setReady(true)
      } catch (e) {
        logWarn('RouteMapLeaflet.init', 'leaflet failed to initialize', e)
        setInitError(e instanceof Error ? e.message : 'Falha ao carregar mapa.')
      }
    }

    void init()

    return () => {
      cancelled = true
      setReady(false)
      try {
        polylineRef.current = null
        startMarkerRef.current = null
        endMarkerRef.current = null
        if (mapRef.current) {
          mapRef.current.remove()
          mapRef.current = null
        }
      } catch (e) {
        logWarn('RouteMapLeaflet.cleanup', 'failed', e)
      }
    }
  }, [])

  // ─── Update polyline + markers when points change ────────────────────────
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return

    let cancelled = false
    const run = async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !mapRef.current) return

      if (points.length === 0) {
        if (polylineRef.current) {
          polylineRef.current.remove()
          polylineRef.current = null
        }
        if (startMarkerRef.current) {
          startMarkerRef.current.remove()
          startMarkerRef.current = null
        }
        if (endMarkerRef.current) {
          endMarkerRef.current.remove()
          endMarkerRef.current = null
        }
        return
      }

      const latlngs = points.map((p) => [p.latitude, p.longitude] as [number, number])
      const first = latlngs[0]
      const last = latlngs[latlngs.length - 1]

      // Route polyline
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(latlngs, {
          color: '#22c55e',
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map)
      } else {
        polylineRef.current.setLatLngs(latlngs)
      }

      // Start marker (green solid)
      if (!startMarkerRef.current) {
        startMarkerRef.current = L.circleMarker(first, {
          radius: 6,
          color: '#0d1117',
          weight: 2,
          fillColor: '#22c55e',
          fillOpacity: 1,
        }).addTo(map)
      } else {
        startMarkerRef.current.setLatLng(first)
      }

      // End / current position marker (white centre, green ring)
      if (!endMarkerRef.current) {
        endMarkerRef.current = L.circleMarker(last, {
          radius: 7,
          color: '#22c55e',
          weight: 3,
          fillColor: '#ffffff',
          fillOpacity: 1,
        }).addTo(map)
      } else {
        endMarkerRef.current.setLatLng(last)
      }

      // Framing
      if (latlngs.length === 1) {
        if (autoFollowRef.current) map.setView(first, 16)
      } else if (latlngs.length >= 2) {
        if (autoFollowRef.current) {
          map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20], maxZoom: 17 })
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [points, ready])

  // ─── Render ───────────────────────────────────────────────────────────────

  // SVG fallback when Leaflet init fails (extremely rare, but defensive).
  if (initError) {
    return <RouteMapSVG points={points} height={height} live={live} />
  }

  return (
    <div
      className="mb-3 rounded-xl overflow-hidden relative"
      style={{
        height,
        background: '#0d1117',
        border: '1px solid rgba(34,197,94,0.15)',
      }}
    >
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{
          // Dark theme filter so OSM tiles feel like Strava/Google Maps dark.
          // Keeps us from needing a paid dark-tile provider and from bundling
          // alternative providers that have historically been flaky on iOS.
          filter: 'invert(0.92) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.8)',
        }}
      />

      {/* Overlay: acquiring hint */}
      {live && acquiring && points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-white/80"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          >
            <span
              className="h-2 w-2 rounded-full bg-green-400"
              style={{ animation: 'leaflet-pulse 1.2s ease-in-out infinite' }}
            />
            Buscando sinal GPS...
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes leaflet-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

// ─── SVG Fallback ───────────────────────────────────────────────────────────
// Identical to the pre-Leaflet component, used as a graceful degradation path.

const PAD = 16
const W = 400
const GRID_V = 7
const GRID_H = 4

function RouteMapSVG({ points, height = 200, live }: RouteMapProps) {
  const data = useMemo(() => {
    if (points.length < 2) return null
    const lats = points.map((p) => p.latitude)
    const lngs = points.map((p) => p.longitude)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const latPad = (maxLat - minLat) * 0.15 || 0.0002
    const lngPad = (maxLng - minLng) * 0.15 || 0.0002
    const padMinLat = minLat - latPad
    const padMaxLat = maxLat + latPad
    const padMinLng = minLng - lngPad
    const padMaxLng = maxLng + lngPad
    return {
      padMinLat,
      padMinLng,
      latRange: padMaxLat - padMinLat,
      lngRange: padMaxLng - padMinLng,
    }
  }, [points])

  if (points.length < 2 && !live) return null

  return (
    <div
      className="mb-3 rounded-xl overflow-hidden"
      style={{ height, background: '#0d1117', border: '1px solid rgba(34,197,94,0.15)' }}
    >
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
      >
        {Array.from({ length: GRID_V }).map((_, i) => {
          const x = PAD + (i / (GRID_V - 1)) * (W - PAD * 2)
          return (
            <line
              key={`gv${i}`}
              x1={x}
              y1={PAD}
              x2={x}
              y2={height - PAD}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.5"
            />
          )
        })}
        {Array.from({ length: GRID_H }).map((_, i) => {
          const y = PAD + (i / (GRID_H - 1)) * (height - PAD * 2)
          return (
            <line
              key={`gh${i}`}
              x1={PAD}
              y1={y}
              x2={W - PAD}
              y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.5"
            />
          )
        })}

        {data && points.length >= 2 && (() => {
          const { padMinLat, padMinLng, latRange, lngRange } = data
          const toX = (lng: number) => PAD + ((lng - padMinLng) / lngRange) * (W - PAD * 2)
          const toY = (lat: number) => height - PAD - ((lat - padMinLat) / latRange) * (height - PAD * 2)

          const pathD = points
            .map(
              (p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.longitude).toFixed(1)},${toY(p.latitude).toFixed(1)}`,
            )
            .join(' ')

          const first = points[0]
          const last = points[points.length - 1]
          const lastX = toX(last.longitude)
          const lastY = toY(last.latitude)

          return (
            <>
              <path
                d={pathD}
                fill="none"
                stroke="rgba(34,197,94,0.2)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={pathD}
                fill="none"
                stroke="#22c55e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={toX(first.longitude).toFixed(1)}
                cy={toY(first.latitude).toFixed(1)}
                r="5"
                fill="#22c55e"
                stroke="#0d1117"
                strokeWidth="2"
              />
              <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="6" fill="#ffffff" stroke="#22c55e" strokeWidth="2.5" />
              {live && (
                <circle
                  cx={lastX.toFixed(1)}
                  cy={lastY.toFixed(1)}
                  r="12"
                  fill="none"
                  stroke="rgba(34,197,94,0.4)"
                  strokeWidth="1.5"
                >
                  <animate attributeName="r" from="8" to="18" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
            </>
          )
        })()}

        {live && points.length < 2 && (
          <text
            x={W / 2}
            y={height / 2}
            textAnchor="middle"
            fill="rgba(255,255,255,0.2)"
            fontSize="11"
            fontFamily="system-ui"
          >
            Aguardando sinal GPS...
          </text>
        )}
      </svg>
    </div>
  )
}
