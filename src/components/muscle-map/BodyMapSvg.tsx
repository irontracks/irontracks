'use client'

import React from 'react'
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

function ms(id: MuscleId, muscles: Record<string, MuscleState>, selected?: MuscleId | null) {
  const m = muscles?.[id] || {}
  const isSelected = selected === id

  // No modo realista, o SVG atua como "MÁSCARA DE LUZ" sobre a foto 3D real de fundo (blend-mode: multiply).
  // Se o músculo não for treinado, ele fica transparente (não afeta a foto original).
  // Se for treinado, ele ganha a cor (ex: vermelho/laranja) e a cor se funde com os reflexos da foto.

  // Como fallback, se não tiver cor (ยังไม่ได้รับการฝึกฝน), fica transparente para ver a foto limpa
  const fillAlpha = m.color ? '0.8' : '0.0'
  const fill = m.color || 'transparent'

  return {
    fill,
    fillOpacity: fillAlpha,
    // Em uma implementação real com a foto no fundo, nós usaríamos mix-blend-mode no container pai,
    // mas aqui no SVG podemos aplicar estilos também se necessário.
    stroke: 'transparent',
    strokeWidth: 0,
    className: 'cursor-pointer transition-all duration-300 hover:fill-opacity-90',
    style: {
      mixBlendMode: 'color' as const, // Usa 'color' ou 'overlay' para tingir a imagem preservando brilhos e sombras
      filter: isSelected ? 'drop-shadow(0 0 6px rgba(245,158,11,0.8)) blur(3px)' : 'blur(3px)', // Blur sutíl espalha a cor realisticamente
    }
  }
}

export default function BodyMapSvg({ view, muscles, onSelect, selected }: Props) {
  const s = (id: MuscleId) => ms(id, muscles, selected)
  const cl = (id: MuscleId) => () => onSelect?.(id)

  return (
    <div className="relative w-full max-w-[280px] mx-auto select-none overflow-hidden rounded-2xl bg-black border border-neutral-800 flex items-center justify-center p-4 min-h-[400px]">

      {/* 3D Realista Base - Camada Inferior */}
      {/* A imagem original tem áreas em branco/transparente grandes, então centralizamos ela. */}
      <img
        src={view === 'front' ? '/body-front.png' : '/body-back.png'}
        alt="Photorealistic Body Base"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-90"
        style={{
          objectPosition: 'center top'
        }}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />

      {/* SVG Máscara - Camada Superior */}
      {/* Ajustamos o viewBox para cobrir exatamente a proporção da imagem renderizada */}
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

        {/* 
          Aplicamos um transform global G para escalar e mover o molde vetorial (os paths padrão)
          para que ele encaixe em cima do boneco específico que foi anexado.
          Ajustes mágicos: scale(0.65) e translate(X, Y) para alinhar perfeitamente sobre a foto.
        */}
        <g transform="translate(26, 20) scale(0.74)">
          {view === 'front' ? (
            <>
              {/* ─── FRONT DELTOIDS ─── */}
              <path d="M60,66 C68,60 80,64 84,76 C80,90 70,94 60,90 C50,84 50,74 60,66 Z" {...s('delts_front')} onClick={cl('delts_front')} />
              <path d="M140,66 C132,60 120,64 116,76 C120,90 130,94 140,90 C150,84 150,74 140,66 Z" {...s('delts_front')} onClick={cl('delts_front')} />

              {/* ─── SIDE DELTOIDS ─── */}
              <path d="M34,98 C25,104 18,116 20,128 C24,136 34,138 42,132 C48,124 48,110 42,102 Z" {...s('delts_side')} onClick={cl('delts_side')} />
              <path d="M166,98 C175,104 182,116 180,128 C176,136 166,138 158,132 C152,124 152,110 158,102 Z" {...s('delts_side')} onClick={cl('delts_side')} />

              {/* ─── PECTORALS ─── */}
              <path d="M82,70 C82,70 100,66 100,76 L100,132 C87,140 70,132 64,118 C58,104 64,86 82,70 Z" {...s('chest')} onClick={cl('chest')} />
              <path d="M118,70 C118,70 100,66 100,76 L100,132 C113,140 130,132 136,118 C142,104 136,86 118,70 Z" {...s('chest')} onClick={cl('chest')} />

              {/* ─── ABS (Gomos individuais para maior realismo) ─── */}
              <ellipse cx="91" cy="142" rx="9.5" ry="10" {...s('abs')} onClick={cl('abs')} />
              <ellipse cx="91" cy="161" rx="9" ry="9" {...s('abs')} onClick={cl('abs')} />
              <ellipse cx="91" cy="178" rx="8.5" ry="8" {...s('abs')} onClick={cl('abs')} />
              <ellipse cx="109" cy="142" rx="9.5" ry="10" {...s('abs')} onClick={cl('abs')} />
              <ellipse cx="109" cy="161" rx="9" ry="9" {...s('abs')} onClick={cl('abs')} />
              <ellipse cx="109" cy="178" rx="8.5" ry="8" {...s('abs')} onClick={cl('abs')} />

              {/* ─── BICEPS ─── */}
              <path d="M19,126 C17,138 18,154 22,164 C26,172 36,174 42,168 C48,158 48,140 44,128 C40,118 24,118 19,126 Z" {...s('biceps')} onClick={cl('biceps')} />
              <path d="M181,126 C183,138 182,154 178,164 C174,172 164,174 158,168 C152,158 152,140 156,128 C160,118 176,118 181,126 Z" {...s('biceps')} onClick={cl('biceps')} />

              {/* ─── QUADRICEPS ─── */}
              <path d="M68,228 C76,222 86,224 90,232 L92,300 C88,310 78,312 70,306 C62,298 62,270 68,228 Z" {...s('quads')} onClick={cl('quads')} />
              <path d="M54,232 C60,224 70,224 70,232 C64,262 62,288 60,304 C52,298 46,282 46,262 Z" {...s('quads')} onClick={cl('quads')} />
              <path d="M132,228 C124,222 114,224 110,232 L108,300 C112,310 122,312 130,306 C138,298 138,270 132,228 Z" {...s('quads')} onClick={cl('quads')} />
              <path d="M146,232 C140,224 130,224 130,232 C136,262 138,288 140,304 C148,298 154,282 154,262 Z" {...s('quads')} onClick={cl('quads')} />

              {/* ─── CALVES (Panturrilhas frente) ─── */}
              <path d="M55,320 C62,312 76,314 82,322 C86,340 86,366 82,386 C78,394 70,396 63,392 C55,386 50,366 50,346 C50,334 52,326 55,320 Z" {...s('calves')} onClick={cl('calves')} />
              <path d="M145,320 C138,312 124,314 118,322 C114,340 114,366 118,386 C122,394 130,396 137,392 C145,386 150,366 150,346 C150,334 148,326 145,320 Z" {...s('calves')} onClick={cl('calves')} />
            </>
          ) : (
            <>
              {/* ─── TRAPEZIUS (Costas Superiores) ─── */}
              <path d="M68,64 C80,56 100,52 100,52 C100,52 120,56 132,64 L128,114 Q100,122 72,114 Z" {...s('upper_back')} onClick={cl('upper_back')} />

              {/* ─── REAR DELTOIDS ─── */}
              <path d="M60,68 C52,62 42,66 38,78 C40,90 50,96 60,92 C70,88 72,78 66,70 Z" {...s('delts_rear')} onClick={cl('delts_rear')} />
              <path d="M140,68 C148,62 158,66 162,78 C160,90 150,96 140,92 C130,88 128,78 134,70 Z" {...s('delts_rear')} onClick={cl('delts_rear')} />

              {/* ─── LATS (Dorsais) ─── */}
              <path d="M70,116 C58,124 46,140 44,160 L48,196 C56,206 70,210 82,204 L90,192 C90,170 84,144 76,122 Z" {...s('lats')} onClick={cl('lats')} />
              <path d="M130,116 C142,124 154,140 156,160 L152,196 C144,206 130,210 118,204 L110,192 C110,170 116,144 124,122 Z" {...s('lats')} onClick={cl('lats')} />

              {/* ─── SPINAL ERECTORS ─── */}
              <path d="M88,122 C92,118 98,120 100,126 L100,210 C96,214 88,212 86,208 C84,196 84,144 88,122 Z" {...s('spinal_erectors')} onClick={cl('spinal_erectors')} />
              <path d="M112,122 C108,118 102,120 100,126 L100,210 C104,214 112,212 114,208 C116,196 116,144 112,122 Z" {...s('spinal_erectors')} onClick={cl('spinal_erectors')} />

              {/* ─── TRICEPS ─── */}
              <path d="M36,102 C28,108 22,120 20,134 L20,170 C22,180 30,184 38,180 C44,172 46,150 44,126 C42,112 40,100 36,102 Z" {...s('triceps')} onClick={cl('triceps')} />
              <path d="M164,102 C172,108 178,120 180,134 L180,170 C178,180 170,184 162,180 C156,172 154,150 156,126 C158,112 160,100 164,102 Z" {...s('triceps')} onClick={cl('triceps')} />

              {/* ─── GLUTES ─── */}
              <path d="M52,222 C58,214 74,212 88,220 L92,262 C86,276 70,278 56,268 C44,256 44,238 52,222 Z" {...s('glutes')} onClick={cl('glutes')} />
              <path d="M148,222 C142,214 126,212 112,220 L108,262 C114,276 130,278 144,268 C156,256 156,238 148,222 Z" {...s('glutes')} onClick={cl('glutes')} />

              {/* ─── HAMSTRINGS (Posterior de Coxa) ─── */}
              <path d="M52,266 C58,258 74,256 84,264 L88,318 C82,328 68,328 58,318 C48,304 46,286 52,266 Z" {...s('hamstrings')} onClick={cl('hamstrings')} />
              <path d="M148,266 C142,258 126,256 116,264 L112,318 C118,328 132,328 142,318 C152,304 154,286 148,266 Z" {...s('hamstrings')} onClick={cl('hamstrings')} />

              {/* ─── CALVES (Panturrilhas costas) ─── */}
              <path d="M52,324 C58,316 72,316 80,324 C84,342 84,368 78,386 C72,394 62,396 55,390 C46,382 46,360 46,342 C46,332 48,328 52,324 Z" {...s('calves')} onClick={cl('calves')} />
              <path d="M148,324 C142,316 128,316 120,324 C116,342 116,368 122,386 C128,394 138,396 145,390 C154,382 154,360 154,342 C154,332 152,328 148,324 Z" {...s('calves')} onClick={cl('calves')} />
            </>
          )}
        </g>
      </svg>

      {/* 
        Linhas auxiliares visuais do Skeleton (caso a imagem não esteja carregada).
        Em produção real com as fotos importadas, essas linhas base podem ser deletadas.
      */}
      <svg viewBox="0 0 200 450" className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        <ellipse cx="100" cy="26" rx="21" ry="24" fill="transparent" stroke="white" strokeWidth="1" />
        <path d="M60,64 C46,70 36,82 34,100 L32,192 C32,210 44,222 52,226 L52,270 C52,282 56,288 64,292 L64,302 C74,306 84,308 94,308 L94,322 C92,336 88,360 86,388 L84,428 C84,434 88,438 94,438 L106,438 C112,438 116,434 116,428 L114,388 C112,360 108,336 106,322 L106,308 C116,308 126,306 136,302 L136,292 C144,288 148,282 148,270 L148,226 C156,222 168,210 168,192 L166,100 C164,82 154,70 140,64 C126,58 100,54 100,54 C100,54 74,58 60,64 Z" fill="transparent" stroke="white" strokeWidth="1" />
        <path d="M36,100 C26,108 19,122 18,140 L17,176 C17,188 22,196 30,198 L40,198 C47,196 51,188 51,178 L51,118 C49,106 44,98 36,100 Z" fill="transparent" stroke="white" strokeWidth="1" />
        <path d="M164,100 C174,108 181,122 182,140 L183,176 C183,188 178,196 170,198 L160,198 C153,196 149,188 149,178 L149,118 C151,106 156,98 164,100 Z" fill="transparent" stroke="white" strokeWidth="1" />
      </svg>
      {/* Luz global e brilho suave */}
      <div className="absolute inset-0 pointer-events-none rounded-2xl shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]" />
    </div>
  )
}

