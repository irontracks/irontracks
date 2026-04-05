'use client'

import { useMemo } from 'react'
import type { GeoTrackPoint } from '@/utils/geoUtils'

interface RouteMapProps {
  points: GeoTrackPoint[]
  height?: number
  live?: boolean
}

const PAD = 16
const W = 400
const GRID_V = 7
const GRID_H = 4

/**
 * GPS-style route map — pure SVG, zero external dependencies.
 * Dark background with subtle grid and green route polyline with glow.
 * Works reliably on all platforms including iOS WKWebView.
 */
export default function RouteMapLeaflet({ points, height = 200, live }: RouteMapProps) {
  const data = useMemo(() => {
    if (points.length < 2) return null

    const lats = points.map(p => p.latitude)
    const lngs = points.map(p => p.longitude)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    // 15% padding so route doesn't touch edges
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
        {/* Grid lines */}
        {Array.from({ length: GRID_V }).map((_, i) => {
          const x = PAD + (i / (GRID_V - 1)) * (W - PAD * 2)
          return <line key={`gv${i}`} x1={x} y1={PAD} x2={x} y2={height - PAD} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        })}
        {Array.from({ length: GRID_H }).map((_, i) => {
          const y = PAD + (i / (GRID_H - 1)) * (height - PAD * 2)
          return <line key={`gh${i}`} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        })}

        {/* Route */}
        {data && points.length >= 2 && (() => {
          const { padMinLat, padMinLng, latRange, lngRange } = data
          const toX = (lng: number) => PAD + ((lng - padMinLng) / lngRange) * (W - PAD * 2)
          const toY = (lat: number) => height - PAD - ((lat - padMinLat) / latRange) * (height - PAD * 2)

          const pathD = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.longitude).toFixed(1)},${toY(p.latitude).toFixed(1)}`)
            .join(' ')

          const first = points[0]
          const last = points[points.length - 1]
          const lastX = toX(last.longitude)
          const lastY = toY(last.latitude)

          return (
            <>
              {/* Route glow */}
              <path d={pathD} fill="none" stroke="rgba(34,197,94,0.2)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              {/* Route line */}
              <path d={pathD} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {/* Start marker */}
              <circle cx={toX(first.longitude).toFixed(1)} cy={toY(first.latitude).toFixed(1)} r="5" fill="#22c55e" stroke="#0d1117" strokeWidth="2" />
              {/* End / current position */}
              <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="6" fill="#ffffff" stroke="#22c55e" strokeWidth="2.5" />
              {/* Pulse animation when live */}
              {live && (
                <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="12" fill="none" stroke="rgba(34,197,94,0.4)" strokeWidth="1.5">
                  <animate attributeName="r" from="8" to="18" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
            </>
          )
        })()}

        {/* Waiting for GPS */}
        {live && points.length < 2 && (
          <text x={W / 2} y={height / 2} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="11" fontFamily="system-ui">
            Aguardando sinal GPS...
          </text>
        )}
      </svg>
    </div>
  )
}
