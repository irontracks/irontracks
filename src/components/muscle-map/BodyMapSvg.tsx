'use client'

import React, { useState } from 'react'
import type { MuscleId } from '@/utils/muscleMapConfig'

type MuscleState = {
  color?: string
  sets?: number
  ratio?: number
  label?: string
}

type Props = {
  view: 'front' | 'back'
  muscles: Record<string, MuscleState>
  onSelect?: (muscleId: MuscleId) => void
  selected?: MuscleId | null
}

function ms(id: MuscleId, muscles: Record<string, MuscleState>, selected?: MuscleId | null, showAll?: boolean, intensity: number = 0.9) {
  const m = muscles?.[id] || {}
  const isSelected = selected === id

  let fillAlpha = m.color ? String(intensity) : '0.0'
  let fill = m.color || 'transparent'

  if (showAll) {
    fillAlpha = String(intensity > 0.6 ? intensity - 0.2 : intensity)
    fill = m.color || '#ef4444' // red fallback to see the shapes
  }

  return {
    fill,
    fillOpacity: fillAlpha,
    stroke: showAll ? 'rgba(255,255,255,0.6)' : 'transparent',
    strokeWidth: showAll ? 1 : 0,
    className: 'cursor-pointer transition-all duration-300 hover:fill-opacity-100',
    style: {
      mixBlendMode: (showAll ? 'normal' : 'multiply') as React.CSSProperties['mixBlendMode'],
      filter: isSelected && !showAll ? 'drop-shadow(0 0 6px rgba(245,158,11,0.8)) blur(3.5px)' : (showAll ? 'none' : 'blur(3.5px)'),
    }
  }
}

type Offset = { x: number; y: number; s: number };
type ViewOffsets = Record<string, Offset>;

const defaultOffsetsFront: ViewOffsets = {
  global: { x: 50, y: 55, s: 0.52 },
  delts_front: { x: 0, y: 0, s: 1 },
  delts_side: { x: 0, y: 0, s: 1 },
  chest: { x: 0, y: 0, s: 1 },
  abs: { x: 0, y: 0, s: 1 },
  biceps: { x: 0, y: 0, s: 1 },
  quads: { x: 0, y: 0, s: 1 },
  calves: { x: 0, y: 0, s: 1 },
};

const defaultOffsetsBack: ViewOffsets = {
  global: { x: 50, y: 55, s: 0.52 },
  upper_back: { x: 0, y: 0, s: 1 },
  delts_rear: { x: 0, y: 0, s: 1 },
  lats: { x: 0, y: 0, s: 1 },
  spinal_erectors: { x: 0, y: 0, s: 1 },
  triceps: { x: 0, y: 0, s: 1 },
  glutes: { x: 0, y: 0, s: 1 },
  hamstrings: { x: 0, y: 0, s: 1 },
  calves: { x: 0, y: 0, s: 1 },
};

export default function BodyMapSvg({ view, muscles, onSelect, selected }: Props) {
  const [frontOffsets, setFrontOffsets] = useState<ViewOffsets>(defaultOffsetsFront)
  const [backOffsets, setBackOffsets] = useState<ViewOffsets>(defaultOffsetsBack)
  const [intensity, setIntensity] = useState(0.9)
  const [showAll, setShowAll] = useState(true)
  const [editingMuscle, setEditingMuscle] = useState<string>('global')

  const offsets = view === 'front' ? frontOffsets : backOffsets;
  const setOffsets = view === 'front' ? setFrontOffsets : setBackOffsets;

  const s = (id: MuscleId) => ms(id, muscles, selected, showAll, intensity)
  const cl = (id: MuscleId) => () => {
    onSelect?.(id)
    setEditingMuscle(id)
  }

  // Helper to get grouped transforms
  const t = (id: string) => {
    const glob = offsets['global'] || { x: 50, y: 55, s: 0.52 };
    const loc = offsets[id] || { x: 0, y: 0, s: 1 };

    // Apply global translate & scale, then local translate & scale around the center loosely
    // We just do local translate relative to the muscle group
    return `translate(${loc.x}, ${loc.y}) scale(${loc.s})`
  }

  const gPos = offsets['global'] || { x: 50, y: 55, s: 0.52 };

  return (
    <div className="relative w-full max-w-[280px] mx-auto select-none overflow-hidden rounded-2xl bg-black border border-neutral-800 flex items-center justify-center p-4 min-h-[460px]">

      {/* 3D Realista Base */}
      <img
        key={view}
        src={view === 'front' ? '/body-front.png' : '/body-back.png'}
        alt={`Photorealistic Body Base ${view}`}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-90"
        style={{ objectPosition: 'center top' }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />

      {/* SVG Máscara */}
      <svg
        viewBox="0 0 200 450"
        role="img"
        aria-label="Mapa muscular"
        className="w-full h-full relative z-10"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${gPos.x}, ${gPos.y}) scale(${gPos.s})`}>
          {view === 'front' ? (
            <>
              {/* ─── FRONT DELTOIDS ─── */}
              <g transform={t('delts_front')}>
                <path d="M60,66 C68,60 80,64 84,76 C80,90 70,94 60,90 C50,84 50,74 60,66 Z" {...s('delts_front')} onClick={cl('delts_front')} />
                <path d="M140,66 C132,60 120,64 116,76 C120,90 130,94 140,90 C150,84 150,74 140,66 Z" {...s('delts_front')} onClick={cl('delts_front')} />
              </g>

              {/* ─── SIDE DELTOIDS ─── */}
              <g transform={t('delts_side')}>
                <path d="M34,98 C25,104 18,116 20,128 C24,136 34,138 42,132 C48,124 48,110 42,102 Z" {...s('delts_side')} onClick={cl('delts_side')} />
                <path d="M166,98 C175,104 182,116 180,128 C176,136 166,138 158,132 C152,124 152,110 158,102 Z" {...s('delts_side')} onClick={cl('delts_side')} />
              </g>

              {/* ─── PECTORALS ─── */}
              <g transform={t('chest')}>
                <path d="M82,70 C82,70 100,66 100,76 L100,132 C87,140 70,132 64,118 C58,104 64,86 82,70 Z" {...s('chest')} onClick={cl('chest')} />
                <path d="M118,70 C118,70 100,66 100,76 L100,132 C113,140 130,132 136,118 C142,104 136,86 118,70 Z" {...s('chest')} onClick={cl('chest')} />
              </g>

              {/* ─── ABS ─── */}
              <g transform={t('abs')}>
                <path d="M82,132 C92,138 108,138 118,132 L112,188 C104,192 96,192 88,188 Z" {...s('abs')} onClick={cl('abs')} />
              </g>

              {/* ─── BICEPS ─── */}
              <g transform={t('biceps')}>
                <path d="M19,126 C17,138 18,154 22,164 C26,172 36,174 42,168 C48,158 48,140 44,128 C40,118 24,118 19,126 Z" {...s('biceps')} onClick={cl('biceps')} />
                <path d="M181,126 C183,138 182,154 178,164 C174,172 164,174 158,168 C152,158 152,140 156,128 C160,118 176,118 181,126 Z" {...s('biceps')} onClick={cl('biceps')} />
              </g>

              {/* ─── QUADRICEPS ─── */}
              <g transform={t('quads')}>
                <path d="M68,228 C76,222 86,224 90,232 L92,300 C88,310 78,312 70,306 C62,298 62,270 68,228 Z" {...s('quads')} onClick={cl('quads')} />
                <path d="M54,232 C60,224 70,224 70,232 C64,262 62,288 60,304 C52,298 46,282 46,262 Z" {...s('quads')} onClick={cl('quads')} />
                <path d="M132,228 C124,222 114,224 110,232 L108,300 C112,310 122,312 130,306 C138,298 138,270 132,228 Z" {...s('quads')} onClick={cl('quads')} />
                <path d="M146,232 C140,224 130,224 130,232 C136,262 138,288 140,304 C148,298 154,282 154,262 Z" {...s('quads')} onClick={cl('quads')} />
              </g>

              {/* ─── CALVES (Panturrilhas frente) ─── */}
              <g transform={t('calves')}>
                <path d="M55,320 C62,312 76,314 82,322 C86,340 86,366 82,386 C78,394 70,396 63,392 C55,386 50,366 50,346 C50,334 52,326 55,320 Z" {...s('calves')} onClick={cl('calves')} />
                <path d="M145,320 C138,312 124,314 118,322 C114,340 114,366 118,386 C122,394 130,396 137,392 C145,386 150,366 150,346 C150,334 148,326 145,320 Z" {...s('calves')} onClick={cl('calves')} />
              </g>
            </>
          ) : (
            <>
              {/* ─── TRAPEZIUS (Costas Superiores) ─── */}
              <g transform={t('upper_back')}>
                <path d="M68,64 C80,56 100,52 100,52 C100,52 120,56 132,64 L128,114 Q100,122 72,114 Z" {...s('upper_back')} onClick={cl('upper_back')} />
              </g>

              {/* ─── REAR DELTOIDS ─── */}
              <g transform={t('delts_rear')}>
                <path d="M60,68 C52,62 42,66 38,78 C40,90 50,96 60,92 C70,88 72,78 66,70 Z" {...s('delts_rear')} onClick={cl('delts_rear')} />
                <path d="M140,68 C148,62 158,66 162,78 C160,90 150,96 140,92 C130,88 128,78 134,70 Z" {...s('delts_rear')} onClick={cl('delts_rear')} />
              </g>

              {/* ─── LATS ─── */}
              <g transform={t('lats')}>
                <path d="M70,116 C58,124 46,140 44,160 L48,196 C56,206 70,210 82,204 L90,192 C90,170 84,144 76,122 Z" {...s('lats')} onClick={cl('lats')} />
                <path d="M130,116 C142,124 154,140 156,160 L152,196 C144,206 130,210 118,204 L110,192 C110,170 116,144 124,122 Z" {...s('lats')} onClick={cl('lats')} />
              </g>

              {/* ─── SPINAL ERECTORS ─── */}
              <g transform={t('spinal_erectors')}>
                <path d="M88,122 C92,118 98,120 100,126 L100,210 C96,214 88,212 86,208 C84,196 84,144 88,122 Z" {...s('spinal_erectors')} onClick={cl('spinal_erectors')} />
                <path d="M112,122 C108,118 102,120 100,126 L100,210 C104,214 112,212 114,208 C116,196 116,144 112,122 Z" {...s('spinal_erectors')} onClick={cl('spinal_erectors')} />
              </g>

              {/* ─── TRICEPS ─── */}
              <g transform={t('triceps')}>
                <path d="M36,102 C28,108 22,120 20,134 L20,170 C22,180 30,184 38,180 C44,172 46,150 44,126 C42,112 40,100 36,102 Z" {...s('triceps')} onClick={cl('triceps')} />
                <path d="M164,102 C172,108 178,120 180,134 L180,170 C178,180 170,184 162,180 C156,172 154,150 156,126 C158,112 160,100 164,102 Z" {...s('triceps')} onClick={cl('triceps')} />
              </g>

              {/* ─── GLUTES ─── */}
              <g transform={t('glutes')}>
                <path d="M52,222 C58,214 74,212 88,220 L92,262 C86,276 70,278 56,268 C44,256 44,238 52,222 Z" {...s('glutes')} onClick={cl('glutes')} />
                <path d="M148,222 C142,214 126,212 112,220 L108,262 C114,276 130,278 144,268 C156,256 156,238 148,222 Z" {...s('glutes')} onClick={cl('glutes')} />
              </g>

              {/* ─── HAMSTRINGS ─── */}
              <g transform={t('hamstrings')}>
                <path d="M52,266 C58,258 74,256 84,264 L88,318 C82,328 68,328 58,318 C48,304 46,286 52,266 Z" {...s('hamstrings')} onClick={cl('hamstrings')} />
                <path d="M148,266 C142,258 126,256 116,264 L112,318 C118,328 132,328 142,318 C152,304 154,286 148,266 Z" {...s('hamstrings')} onClick={cl('hamstrings')} />
              </g>

              {/* ─── CALVES (Costas) ─── */}
              <g transform={t('calves')}>
                <path d="M52,324 C58,316 72,316 80,324 C84,342 84,368 78,386 C72,394 62,396 55,390 C46,382 46,360 46,342 C46,332 48,328 52,324 Z" {...s('calves')} onClick={cl('calves')} />
                <path d="M148,324 C142,316 128,316 120,324 C116,342 116,368 122,386 C128,394 138,396 145,390 C154,382 154,360 154,342 C154,332 152,328 148,324 Z" {...s('calves')} onClick={cl('calves')} />
              </g>
            </>
          )}
        </g>
      </svg>

      <div className="absolute inset-0 pointer-events-none rounded-2xl shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]" />

      <CalibrationOverlay
        offsets={offsets}
        setOffsets={setOffsets}
        intensity={intensity}
        setIntensity={setIntensity}
        view={view}
        showAll={showAll}
        setShowAll={setShowAll}
        editingMuscle={editingMuscle}
        setEditingMuscle={setEditingMuscle}
      />
    </div>
  )
}

function CalibrationOverlay({
  offsets,
  setOffsets,
  intensity,
  setIntensity,
  view,
  showAll,
  setShowAll,
  editingMuscle,
  setEditingMuscle
}: {
  offsets: ViewOffsets
  setOffsets: (fn: (prev: ViewOffsets) => ViewOffsets) => void
  intensity: number
  setIntensity: (i: number) => void
  view: string
  showAll: boolean
  setShowAll: (v: boolean) => void
  editingMuscle: string
  setEditingMuscle: (m: string) => void
}) {
  const [isMinimized, setIsMinimized] = useState(false)

  if (isMinimized) {
    return (
      <div className="absolute top-2 left-2 bg-black/90 p-2 rounded-xl border border-white/20 z-50 text-white text-[10px] backdrop-blur-sm cursor-pointer" onClick={() => setIsMinimized(false)}>
        🔧 Expandir
      </div>
    )
  }

  const keys = Object.keys(offsets);
  const currentOffsets = offsets[editingMuscle] || { x: 0, y: 0, s: 1 };

  const update = (key: keyof Offset, val: number) => {
    setOffsets((prev) => ({
      ...prev,
      [editingMuscle]: {
        ...(prev[editingMuscle] || { x: 0, y: 0, s: 1 }),
        [key]: val
      }
    }))
  }

  return (
    <div className="absolute top-2 left-2 right-2 bg-black/90 p-3 rounded-xl border border-white/20 z-50 text-white text-[10px] backdrop-blur-sm shadow-xl flex flex-col gap-2">
      <div className="flex justify-between items-center border-b border-white/10 pb-1">
        <div className="font-bold text-yellow-500 text-xs">Calibração: {view.toUpperCase()}</div>
        <div className="flex gap-1">
          <button onClick={() => setShowAll(!showAll)} className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 active:bg-neutral-700">
            {showAll ? 'VISUAL FINAL' : 'MOLDES'}
          </button>
          <button onClick={() => setIsMinimized(true)} className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 active:bg-neutral-700">➖</button>
        </div>
      </div>

      <div className="flex gap-2 mb-1">
        <select
          className="bg-neutral-800 text-white border border-neutral-700 rounded px-1 py-1 w-full"
          value={editingMuscle}
          onChange={e => setEditingMuscle(e.target.value)}
        >
          {keys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <div className="flex items-center">
          {editingMuscle !== 'global' && <span className="text-yellow-400 font-bold whitespace-nowrap text-[9px] uppercase tracking-wider ml-1">(Toque no Músculo)</span>}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <label className="w-6">X</label>
        <input type="range" min="-100" max="200" value={currentOffsets.x} onChange={e => update('x', Number(e.target.value))} className="flex-1 ml-2 accent-yellow-500" />
        <span className="w-6 text-right ml-2 font-mono">{currentOffsets.x}</span>
      </div>
      <div className="flex justify-between items-center">
        <label className="w-6">Y</label>
        <input type="range" min="-100" max="200" value={currentOffsets.y} onChange={e => update('y', Number(e.target.value))} className="flex-1 ml-2 accent-yellow-500" />
        <span className="w-6 text-right ml-2 font-mono">{currentOffsets.y}</span>
      </div>
      <div className="flex justify-between items-center">
        <label className="w-6">Z</label>
        <input type="range" min="0.3" max="2.0" step="0.01" value={currentOffsets.s} onChange={e => update('s', Number(e.target.value))} className="flex-1 ml-2 accent-yellow-500" />
        <span className="w-6 text-right ml-2 font-mono">{currentOffsets.s}</span>
      </div>

      <div className="flex justify-between items-center border-t border-white/10 pt-1">
        <label className="w-10 text-yellow-400">Intens</label>
        <input type="range" min="0.1" max="1.5" step="0.05" value={intensity} onChange={e => setIntensity(Number(e.target.value))} className="flex-1 accent-yellow-500" />
        <span className="w-6 text-right font-mono text-yellow-400">{intensity.toFixed(2)}</span>
      </div>
    </div>
  )
}
