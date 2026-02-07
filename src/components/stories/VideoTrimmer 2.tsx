'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, Play, Pause, Scissors } from 'lucide-react'

interface VideoTrimmerProps {
  duration: number
  value: [number, number]
  onChange: (range: [number, number]) => void
  onPreview: (playing: boolean) => void
  currentTime: number
}

const MIN_DURATION = 1 // 1 second
const MAX_DURATION = 60 // 60 seconds

export default function VideoTrimmer({ duration, value, onChange, onPreview, currentTime }: VideoTrimmerProps) {
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  
  // Helpers to convert time <-> pixels
  const getPercent = (time: number) => Math.max(0, Math.min(100, (time / duration) * 100))
  
  const handlePointerDown = (type: 'start' | 'end', e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(type)
    // @ts-ignore
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = pct * duration
    
    let [start, end] = value
    
    if (dragging === 'start') {
      // Constraints: start < end - min, start > end - max
      // Actually simpler: 
      // New start must be <= end - MIN
      // New start must be >= end - MAX
      const maxStart = end - MIN_DURATION
      const minStart = Math.max(0, end - MAX_DURATION)
      start = Math.max(minStart, Math.min(maxStart, time))
    } else {
      // end > start + min, end < start + max
      const minEnd = start + MIN_DURATION
      const maxEnd = Math.min(duration, start + MAX_DURATION)
      end = Math.max(minEnd, Math.min(maxEnd, time))
    }
    
    onChange([start, end])
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setDragging(null)
    // @ts-ignore
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // Format time
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    const ms = Math.floor((s % 1) * 10)
    return `${m}:${sec.toString().padStart(2, '0')}.${ms}`
  }

  return (
    <div className="w-full space-y-3 bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
      <div className="flex items-center justify-between text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
        <div className="flex items-center gap-2">
            <Scissors size={14} className="text-yellow-500" />
            <span>Editor de Tempo</span>
        </div>
        <div className="flex items-center gap-2">
            <span className={value[1] - value[0] > 60 ? 'text-red-500' : 'text-white'}>
                {fmt(value[1] - value[0])}s
            </span>
            <span className="text-neutral-600">/ 60.0s</span>
        </div>
      </div>

      <div className="relative w-full h-12 select-none touch-none overflow-hidden" 
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onPointerLeave={handlePointerUp}
      >
         <div 
            ref={trackRef}
            className="absolute top-0 bottom-0 left-0 bg-neutral-800 rounded-lg overflow-hidden transition-all duration-200"
            style={{ width: `${zoom * 100}%` }}
         >
            {/* Playhead */}
            <div 
                className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                style={{ left: `${getPercent(currentTime)}%` }}
            />

            {/* Selected Range */}
            <div 
                className="absolute top-0 bottom-0 bg-yellow-500/20 border-t-2 border-b-2 border-yellow-500/50 z-10"
                style={{ 
                    left: `${getPercent(value[0])}%`, 
                    right: `${100 - getPercent(value[1])}%` 
                }}
            >
                {/* Drag Handles */}
                <div 
                    className="absolute left-0 top-0 bottom-0 w-4 -ml-2 bg-yellow-500 cursor-ew-resize flex items-center justify-center hover:scale-110 active:scale-110 transition-transform z-30 rounded-l-md"
                    onPointerDown={(e) => handlePointerDown('start', e)}
                >
                    <div className="w-0.5 h-4 bg-black/50 rounded-full" />
                </div>
                <div 
                    className="absolute right-0 top-0 bottom-0 w-4 -mr-2 bg-yellow-500 cursor-ew-resize flex items-center justify-center hover:scale-110 active:scale-110 transition-transform z-30 rounded-r-md"
                    onPointerDown={(e) => handlePointerDown('end', e)}
                >
                    <div className="w-0.5 h-4 bg-black/50 rounded-full" />
                </div>
            </div>

            {/* Time Markers */}
            <div className="absolute bottom-0 left-0 right-0 h-1 flex justify-between px-1 pointer-events-none opacity-50">
                {[...Array(10)].map((_, i) => (
                    <div key={i} className="w-px h-full bg-neutral-600" />
                ))}
            </div>
         </div>
      </div>

      <div className="flex items-center justify-between">
         <div className="flex items-center gap-2">
            <button 
                onClick={() => setZoom(Math.max(1, zoom - 0.5))}
                className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-50"
                disabled={zoom <= 1}
            >
                <ZoomOut size={14} />
            </button>
            <span className="text-[10px] font-bold text-neutral-500">{zoom}x</span>
            <button 
                onClick={() => setZoom(Math.min(4, zoom + 0.5))}
                className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-50"
                disabled={zoom >= 4}
            >
                <ZoomIn size={14} />
            </button>
         </div>
         
         <div className="text-[10px] text-neutral-500 font-mono">
            {fmt(value[0])} - {fmt(value[1])}
         </div>
      </div>
    </div>
  )
}
