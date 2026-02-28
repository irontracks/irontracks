'use client'

import React, { useState, useEffect } from 'react'
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
  /** Only show the calibration overlay when this is true (admin/dev only) */
  calibrationMode?: boolean
}

function ms(id: MuscleId, muscles: Record<string, MuscleState>, selected?: MuscleId | null, showAll?: boolean, intensity: number = 0.9) {
  const m = muscles?.[id] || {}
  const isSelected = selected === id

  let fillAlpha = m.color ? String(intensity) : '0.0'
  let fill = m.color || 'transparent'

  if (showAll) {
    fillAlpha = String(intensity > 0.6 ? intensity - 0.2 : intensity)
    fill = m.color || '#ef4444'
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
      transformOrigin: 'auto'
    }
  }
}

type Offset = { x: number; y: number; s: number; r: number };
type ViewOffsets = Record<string, Offset>;

const defaultOffsetsFront: ViewOffsets = {
  global: { x: 50, y: 55, s: 0.52, r: 0 },
  delts_front_l: { x: 0, y: 0, s: 1, r: 0 },
  delts_front_r: { x: 0, y: 0, s: 1, r: 0 },
  delts_side_l: { x: 0, y: 0, s: 1, r: 0 },
  delts_side_r: { x: 0, y: 0, s: 1, r: 0 },
  chest_l: { x: 0, y: 0, s: 1, r: 0 },
  chest_r: { x: 0, y: 0, s: 1, r: 0 },
  abs: { x: 0, y: 0, s: 1, r: 0 },
  biceps_l: { x: 0, y: 0, s: 1, r: 0 },
  biceps_r: { x: 0, y: 0, s: 1, r: 0 },
  quads_inner_l: { x: 0, y: 0, s: 1, r: 0 },
  quads_outer_l: { x: 0, y: 0, s: 1, r: 0 },
  quads_inner_r: { x: 0, y: 0, s: 1, r: 0 },
  quads_outer_r: { x: 0, y: 0, s: 1, r: 0 },
  calves_l: { x: 0, y: 0, s: 1, r: 0 },
  calves_r: { x: 0, y: 0, s: 1, r: 0 },
};

const defaultOffsetsBack: ViewOffsets = {
  global: { x: 50, y: 55, s: 0.52, r: 0 },
  upper_back: { x: 0, y: 0, s: 1, r: 0 },
  delts_rear_l: { x: 0, y: 0, s: 1, r: 0 },
  delts_rear_r: { x: 0, y: 0, s: 1, r: 0 },
  lats_l: { x: 0, y: 0, s: 1, r: 0 },
  lats_r: { x: 0, y: 0, s: 1, r: 0 },
  spinal_erectors_l: { x: 0, y: 0, s: 1, r: 0 },
  spinal_erectors_r: { x: 0, y: 0, s: 1, r: 0 },
  triceps_l: { x: 0, y: 0, s: 1, r: 0 },
  triceps_r: { x: 0, y: 0, s: 1, r: 0 },
  glutes_l: { x: 0, y: 0, s: 1, r: 0 },
  glutes_r: { x: 0, y: 0, s: 1, r: 0 },
  hamstrings_l: { x: 0, y: 0, s: 1, r: 0 },
  hamstrings_r: { x: 0, y: 0, s: 1, r: 0 },
  calves_rear_l: { x: 0, y: 0, s: 1, r: 0 },
  calves_rear_r: { x: 0, y: 0, s: 1, r: 0 },
};

export default function BodyMapSvg({ view, muscles, onSelect, selected, calibrationMode = false }: Props) {
  const [frontOffsets, setFrontOffsets] = useState<ViewOffsets>(defaultOffsetsFront)
  const [backOffsets, setBackOffsets] = useState<ViewOffsets>(defaultOffsetsBack)
  const [intensity, setIntensity] = useState(0.9)
  const [showAll, setShowAll] = useState(true)
  const [editingMuscle, setEditingMuscle] = useState<string>('global')

  // NEW: Load from localStorage on mount
  useEffect(() => {
    try {
      const savedFront = localStorage.getItem('calibration_front');
      const savedBack = localStorage.getItem('calibration_back');
      const savedInt = localStorage.getItem('calibration_intensity');

      setTimeout(() => {
        if (savedFront) setFrontOffsets(JSON.parse(savedFront));
        if (savedBack) setBackOffsets(JSON.parse(savedBack));
        if (savedInt) setIntensity(Number(savedInt));
      }, 0);
    } catch (e) {
      console.warn('Could not load calibration from local storge', e)
    }
  }, []);

  // NEW: Save to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('calibration_front', JSON.stringify(frontOffsets));
      localStorage.setItem('calibration_back', JSON.stringify(backOffsets));
      localStorage.setItem('calibration_intensity', String(intensity));
    } catch (e) {
      // ignore
    }
  }, [frontOffsets, backOffsets, intensity]);

  const offsets = view === 'front' ? frontOffsets : backOffsets;
  const setOffsets = view === 'front' ? setFrontOffsets : setBackOffsets;

  const s = (id: MuscleId) => ms(id, muscles, selected, showAll, intensity)
  const cl = (id: MuscleId, internalId: string) => () => {
    onSelect?.(id)
    setEditingMuscle(internalId)
  }

  const t = (id: string, defX = 0, defY = 0) => {
    const loc = offsets[id] || { x: 0, y: 0, s: 1, r: 0 };
    return `translate(${loc.x}, ${loc.y}) scale(${loc.s}) rotate(${loc.r}, ${defX}, ${defY})`
  }

  const gPos = offsets['global'] || { x: 50, y: 55, s: 0.52, r: 0 };

  return (
    <div className="relative w-full max-w-[280px] mx-auto select-none overflow-hidden rounded-2xl bg-black border border-neutral-800 flex items-center justify-center p-4 min-h-[460px]">

      {/* 3D Base */}
      <img
        key={view}
        src={view === 'front' ? '/body-front.png' : '/body-back.png'}
        alt={`Photorealistic Body Base ${view}`}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-90"
        style={{ objectPosition: 'center top' }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />

      {/* SVG Masks */}
      <svg
        viewBox="0 0 200 450"
        role="img"
        aria-label="Mapa muscular"
        className="w-full h-full relative z-10"
        style={{ position: 'absolute', inset: 0 }}
      >
        <g transform={`translate(${gPos.x}, ${gPos.y}) scale(${gPos.s}) rotate(${gPos.r}, 100, 225)`}>
          {view === 'front' ? (
            <>
              {/* FRONT DELTOIDS */}
              <g transform={t('delts_front_l', 72, 78)}>
                <path d="M60,66 C68,60 80,64 84,76 C80,90 70,94 60,90 C50,84 50,74 60,66 Z" {...s('delts_front')} onClick={cl('delts_front', 'delts_front_l')} />
              </g>
              <g transform={t('delts_front_r', 128, 78)}>
                <path d="M140,66 C132,60 120,64 116,76 C120,90 130,94 140,90 C150,84 150,74 140,66 Z" {...s('delts_front')} onClick={cl('delts_front', 'delts_front_r')} />
              </g>

              {/* SIDE DELTOIDS */}
              <g transform={t('delts_side_l', 32, 115)}>
                <path d="M34,98 C25,104 18,116 20,128 C24,136 34,138 42,132 C48,124 48,110 42,102 Z" {...s('delts_side')} onClick={cl('delts_side', 'delts_side_l')} />
              </g>
              <g transform={t('delts_side_r', 168, 115)}>
                <path d="M166,98 C175,104 182,116 180,128 C176,136 166,138 158,132 C152,124 152,110 158,102 Z" {...s('delts_side')} onClick={cl('delts_side', 'delts_side_r')} />
              </g>

              {/* PECTORALS */}
              <g transform={t('chest_l', 82, 100)}>
                <path d="M82,70 C82,70 100,66 100,76 L100,132 C87,140 70,132 64,118 C58,104 64,86 82,70 Z" {...s('chest')} onClick={cl('chest', 'chest_l')} />
              </g>
              <g transform={t('chest_r', 118, 100)}>
                <path d="M118,70 C118,70 100,66 100,76 L100,132 C113,140 130,132 136,118 C142,104 136,86 118,70 Z" {...s('chest')} onClick={cl('chest', 'chest_r')} />
              </g>

              {/* ABS */}
              <g transform={t('abs', 100, 160)}>
                <path d="M82,132 C92,138 108,138 118,132 L112,188 C104,192 96,192 88,188 Z" {...s('abs')} onClick={cl('abs', 'abs')} />
              </g>

              {/* BICEPS */}
              <g transform={t('biceps_l', 32, 145)}>
                <path d="M19,126 C17,138 18,154 22,164 C26,172 36,174 42,168 C48,158 48,140 44,128 C40,118 24,118 19,126 Z" {...s('biceps')} onClick={cl('biceps', 'biceps_l')} />
              </g>
              <g transform={t('biceps_r', 168, 145)}>
                <path d="M181,126 C183,138 182,154 178,164 C174,172 164,174 158,168 C152,158 152,140 156,128 C160,118 176,118 181,126 Z" {...s('biceps')} onClick={cl('biceps', 'biceps_r')} />
              </g>

              {/* QUADS */}
              <g transform={t('quads_inner_l', 76, 260)}>
                <path d="M68,228 C76,222 86,224 90,232 L92,300 C88,310 78,312 70,306 C62,298 62,270 68,228 Z" {...s('quads')} onClick={cl('quads', 'quads_inner_l')} />
              </g>
              <g transform={t('quads_outer_l', 58, 260)}>
                <path d="M54,232 C60,224 70,224 70,232 C64,262 62,288 60,304 C52,298 46,282 46,262 Z" {...s('quads')} onClick={cl('quads', 'quads_outer_l')} />
              </g>
              <g transform={t('quads_inner_r', 124, 260)}>
                <path d="M132,228 C124,222 114,224 110,232 L108,300 C112,310 122,312 130,306 C138,298 138,270 132,228 Z" {...s('quads')} onClick={cl('quads', 'quads_inner_r')} />
              </g>
              <g transform={t('quads_outer_r', 142, 260)}>
                <path d="M146,232 C140,224 130,224 130,232 C136,262 138,288 140,304 C148,298 154,282 154,262 Z" {...s('quads')} onClick={cl('quads', 'quads_outer_r')} />
              </g>

              {/* CALVES (Panturrilhas frente) */}
              <g transform={t('calves_l', 66, 350)}>
                <path d="M55,320 C62,312 76,314 82,322 C86,340 86,366 82,386 C78,394 70,396 63,392 C55,386 50,366 50,346 C50,334 52,326 55,320 Z" {...s('calves')} onClick={cl('calves', 'calves_l')} />
              </g>
              <g transform={t('calves_r', 134, 350)}>
                <path d="M145,320 C138,312 124,314 118,322 C114,340 114,366 118,386 C122,394 130,396 137,392 C145,386 150,366 150,346 C150,334 148,326 145,320 Z" {...s('calves')} onClick={cl('calves', 'calves_r')} />
              </g>
            </>
          ) : (
            <>
              {/* TRAPEZIUS (Costas Superiores) */}
              <g transform={t('upper_back', 100, 80)}>
                <path d="M68,64 C80,56 100,52 100,52 C100,52 120,56 132,64 L128,114 Q100,122 72,114 Z" {...s('upper_back')} onClick={cl('upper_back', 'upper_back')} />
              </g>

              {/* REAR DELTOIDS */}
              <g transform={t('delts_rear_l', 55, 78)}>
                <path d="M60,68 C52,62 42,66 38,78 C40,90 50,96 60,92 C70,88 72,78 66,70 Z" {...s('delts_rear')} onClick={cl('delts_rear', 'delts_rear_l')} />
              </g>
              <g transform={t('delts_rear_r', 145, 78)}>
                <path d="M140,68 C148,62 158,66 162,78 C160,90 150,96 140,92 C130,88 128,78 134,70 Z" {...s('delts_rear')} onClick={cl('delts_rear', 'delts_rear_r')} />
              </g>

              {/* LATS */}
              <g transform={t('lats_l', 66, 160)}>
                <path d="M70,116 C58,124 46,140 44,160 L48,196 C56,206 70,210 82,204 L90,192 C90,170 84,144 76,122 Z" {...s('lats')} onClick={cl('lats', 'lats_l')} />
              </g>
              <g transform={t('lats_r', 134, 160)}>
                <path d="M130,116 C142,124 154,140 156,160 L152,196 C144,206 130,210 118,204 L110,192 C110,170 116,144 124,122 Z" {...s('lats')} onClick={cl('lats', 'lats_r')} />
              </g>

              {/* SPINAL ERECTORS */}
              <g transform={t('spinal_erectors_l', 92, 160)}>
                <path d="M88,122 C92,118 98,120 100,126 L100,210 C96,214 88,212 86,208 C84,196 84,144 88,122 Z" {...s('spinal_erectors')} onClick={cl('spinal_erectors', 'spinal_erectors_l')} />
              </g>
              <g transform={t('spinal_erectors_r', 108, 160)}>
                <path d="M112,122 C108,118 102,120 100,126 L100,210 C104,214 112,212 114,208 C116,196 116,144 112,122 Z" {...s('spinal_erectors')} onClick={cl('spinal_erectors', 'spinal_erectors_r')} />
              </g>

              {/* TRICEPS */}
              <g transform={t('triceps_l', 32, 140)}>
                <path d="M36,102 C28,108 22,120 20,134 L20,170 C22,180 30,184 38,180 C44,172 46,150 44,126 C42,112 40,100 36,102 Z" {...s('triceps')} onClick={cl('triceps', 'triceps_l')} />
              </g>
              <g transform={t('triceps_r', 168, 140)}>
                <path d="M164,102 C172,108 178,120 180,134 L180,170 C178,180 170,184 162,180 C156,172 154,150 156,126 C158,112 160,100 164,102 Z" {...s('triceps')} onClick={cl('triceps', 'triceps_r')} />
              </g>

              {/* GLUTES */}
              <g transform={t('glutes_l', 66, 245)}>
                <path d="M52,222 C58,214 74,212 88,220 L92,262 C86,276 70,278 56,268 C44,256 44,238 52,222 Z" {...s('glutes')} onClick={cl('glutes', 'glutes_l')} />
              </g>
              <g transform={t('glutes_r', 134, 245)}>
                <path d="M148,222 C142,214 126,212 112,220 L108,262 C114,276 130,278 144,268 C156,256 156,238 148,222 Z" {...s('glutes')} onClick={cl('glutes', 'glutes_r')} />
              </g>

              {/* HAMSTRINGS */}
              <g transform={t('hamstrings_l', 66, 290)}>
                <path d="M52,266 C58,258 74,256 84,264 L88,318 C82,328 68,328 58,318 C48,304 46,286 52,266 Z" {...s('hamstrings')} onClick={cl('hamstrings', 'hamstrings_l')} />
              </g>
              <g transform={t('hamstrings_r', 134, 290)}>
                <path d="M148,266 C142,258 126,256 116,264 L112,318 C118,328 132,328 142,318 C152,304 154,286 148,266 Z" {...s('hamstrings')} onClick={cl('hamstrings', 'hamstrings_r')} />
              </g>

              {/* CALVES (Costas) */}
              <g transform={t('calves_rear_l', 66, 355)}>
                <path d="M52,324 C58,316 72,316 80,324 C84,342 84,368 78,386 C72,394 62,396 55,390 C46,382 46,360 46,342 C46,332 48,328 52,324 Z" {...s('calves')} onClick={cl('calves', 'calves_rear_l')} />
              </g>
              <g transform={t('calves_rear_r', 134, 355)}>
                <path d="M148,324 C142,316 128,316 120,324 C116,342 116,368 122,386 C128,394 138,396 145,390 C154,382 154,360 154,342 C154,332 152,328 148,324 Z" {...s('calves')} onClick={cl('calves', 'calves_rear_r')} />
              </g>
            </>
          )}
        </g>
      </svg>

      <div className="absolute inset-0 pointer-events-none rounded-2xl shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]" />

      {/* Calibration overlay — only visible for admins/devs when calibrationMode=true */}
      {calibrationMode && (
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
      )}
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
      <div className="fixed bottom-4 right-4 bg-black/90 p-3 rounded-xl border border-white/20 z-[9999] text-white backdrop-blur-sm cursor-pointer hover:bg-neutral-900 transition-colors shadow-2xl" onClick={() => setIsMinimized(false)}>
        🔧 EXPANDIR
      </div>
    )
  }

  const keys = Object.keys(offsets);
  const currentOffsets = offsets[editingMuscle] || { x: 0, y: 0, s: 1, r: 0 };

  const update = (key: keyof Offset, val: number) => {
    setOffsets((prev) => ({
      ...prev,
      [editingMuscle]: {
        ...(prev[editingMuscle] || { x: 0, y: 0, s: 1, r: 0 }),
        [key]: val
      }
    }))
  }

  const copyOffsets = () => {
    navigator.clipboard.writeText(JSON.stringify(offsets, null, 2))
    alert('Valores de alinhamento copiados para a área de transferência! Envie isto ao programador.')
  }

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 w-[340px] max-h-[90vh] overflow-y-auto bg-black/95 p-4 rounded-xl border border-white/20 z-[9999] text-white text-[12px] backdrop-blur-xl shadow-2xl flex flex-col gap-4">
      <div className="flex justify-between items-center border-b border-white/10 pb-2">
        <div className="font-bold text-yellow-500 text-sm">CALIBRAÇÃO - {view.toUpperCase()}</div>
        <div className="flex gap-2">
          <button onClick={() => setShowAll(!showAll)} className="px-3 py-1 bg-neutral-800 rounded border border-neutral-700 active:bg-neutral-700 text-[10px] font-bold">
            {showAll ? 'VISUAL' : 'MOLDES'}
          </button>
          <button onClick={() => setIsMinimized(true)} className="px-3 py-1 bg-red-900/40 text-red-400 rounded border border-red-900/50 hover:bg-red-900/60 font-bold transition-colors">
            X
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-neutral-400 font-bold tracking-widest text-[10px]">PEÇA ATUAL:</label>
        <select
          className="bg-neutral-900 text-white font-mono border border-neutral-700 rounded px-2 py-2 w-full outline-none focus:border-yellow-500"
          value={editingMuscle}
          onChange={e => setEditingMuscle(e.target.value)}
        >
          {keys.map(k => <option key={k} value={k}>{k.toUpperCase().replace(/_/g, ' ')}</option>)}
        </select>
        <div className="text-[10px] text-yellow-500/80 mt-1 italic">
          (Você também pode tocar direto no músculo na imagem)
        </div>
      </div>

      <div className="flex flex-col gap-3 bg-neutral-900/50 p-3 rounded-lg border border-white/5">
        <label className="text-neutral-400 font-bold tracking-widest text-[10px] mb-[-4px]">EIXO X (ESQUERDA / DIREITA)</label>
        <div className="flex justify-between items-center">
          <input type="range" min="-150" max="150" step="0.5" value={currentOffsets.x} onChange={e => update('x', Number(e.target.value))} className="flex-1 accent-yellow-500" />
          <input type="number" step="0.5" value={currentOffsets.x} onChange={e => update('x', Number(e.target.value))} className="w-14 bg-neutral-800 rounded px-1 text-center font-mono ml-3 border border-neutral-700" />
        </div>

        <label className="text-neutral-400 font-bold tracking-widest text-[10px] mb-[-4px] mt-1">EIXO Y (CIMA / BAIXO)</label>
        <div className="flex justify-between items-center">
          <input type="range" min="-150" max="250" step="0.5" value={currentOffsets.y} onChange={e => update('y', Number(e.target.value))} className="flex-1 accent-yellow-500" />
          <input type="number" step="0.5" value={currentOffsets.y} onChange={e => update('y', Number(e.target.value))} className="w-14 bg-neutral-800 rounded px-1 text-center font-mono ml-3 border border-neutral-700" />
        </div>

        <label className="text-neutral-400 font-bold tracking-widest text-[10px] mb-[-4px] mt-1">ROTAÇÃO</label>
        <div className="flex justify-between items-center">
          <input type="range" min="-180" max="180" step="1" value={currentOffsets.r} onChange={e => update('r', Number(e.target.value))} className="flex-1 accent-yellow-500" />
          <input type="number" step="1" value={currentOffsets.r} onChange={e => update('r', Number(e.target.value))} className="w-14 bg-neutral-800 rounded px-1 text-center font-mono ml-3 border border-neutral-700" />
        </div>

        <label className="text-neutral-400 font-bold tracking-widest text-[10px] mb-[-4px] mt-1">ESCALA (TAMANHO)</label>
        <div className="flex justify-between items-center">
          <input type="range" min="0.1" max="2.5" step="0.01" value={currentOffsets.s} onChange={e => update('s', Number(e.target.value))} className="flex-1 accent-yellow-500" />
          <input type="number" step="0.01" value={currentOffsets.s} onChange={e => update('s', Number(e.target.value))} className="w-14 bg-neutral-800 rounded px-1 text-center font-mono ml-3 border border-neutral-700" />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
        <label className="text-yellow-400 font-bold tracking-widest text-[10px]">INTENSIDADE DAS CORES</label>
        <div className="flex justify-between items-center">
          <input type="range" min="0.1" max="1.5" step="0.05" value={intensity} onChange={e => setIntensity(Number(e.target.value))} className="flex-1 accent-yellow-500" />
          <span className="w-14 text-center font-mono text-yellow-400 ml-3 bg-neutral-800 rounded py-[2px]">{intensity.toFixed(2)}</span>
        </div>
      </div>

      <button onClick={copyOffsets} className="w-full mt-2 py-2 rounded font-bold bg-yellow-500 hover:bg-yellow-400 text-black transition-colors flex items-center justify-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
        Copiar Coordenadas ({view.toUpperCase()})
      </button>
    </div>
  )
}
