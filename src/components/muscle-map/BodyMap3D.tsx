'use client'

import { useEffect, useRef, useState } from 'react'
import type { ModelViewerElement } from '@google/model-viewer'
import { captureException } from '@sentry/nextjs'
import { attachMuscleColors, MUSCLE_3D_ROOT, type MuscleMap3DState } from '@/lib/muscleMap/colors3d'
import { MUSCLE_GROUPS, type MuscleId } from '@/utils/muscleMapConfig'

type Props = {
  muscles: MuscleMap3DState
  selected?: MuscleId | null
  view: 'front' | 'back'
  onSelect?: (id: MuscleId) => void
  onUnavailable: () => void
}
type Ready = { viewer: ModelViewerElement; colors: Awaited<ReturnType<typeof attachMuscleColors>> }

export default function BodyMap3D({ muscles, selected, view, onSelect, onUnavailable }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState<Ready | null>(null)
  useEffect(() => {
    const container = host.current
    if (!container) return
    let cancelled = false
    let viewer: ModelViewerElement | undefined
    let colors: Ready['colors'] | undefined
    const fail = (error: unknown) => {
      if (cancelled) return
      captureException(error instanceof Error ? error : new Error('Falha no visualizador muscular 3D'))
      onUnavailable()
    }
    const timeout = window.setTimeout(() => fail(new Error('Tempo de carregamento do mapa 3D excedido')), 25000)
    const load = async () => {
      await import('@google/model-viewer')
      if (cancelled) return
      viewer = document.createElement('model-viewer') as ModelViewerElement
      viewer.setAttribute('alt', 'Mapa muscular 3D. Arraste para girar; use pinça ou roda do mouse para aproximar.')
      viewer.setAttribute('camera-controls', '')
      viewer.setAttribute('disable-pan', '')
      viewer.setAttribute('touch-action', 'pan-y')
      viewer.setAttribute('camera-orbit', '0deg 90deg 105%')
      viewer.setAttribute('min-camera-orbit', 'auto 40deg 75%')
      viewer.setAttribute('max-camera-orbit', 'auto 130deg 160%')
      viewer.setAttribute('field-of-view', '30deg')
      viewer.setAttribute('interaction-prompt', 'none')
      viewer.style.cssText = 'display:block;width:100%;height:100%;background:#000'
      viewer.addEventListener('error', fail)
      viewer.addEventListener('load', async () => {
        try {
          if (!viewer || cancelled) return
          const attached = await attachMuscleColors(viewer)
          if (cancelled) { attached.dispose(); return }
          colors = attached
          window.clearTimeout(timeout)
          setReady({ viewer, colors: attached })
        } catch (error) { fail(error) }
      }, { once: true })
      container.appendChild(viewer)
      viewer.src = `${MUSCLE_3D_ROOT}manequim-original-3d.glb`
    }
    void load().catch(fail)
    return () => { cancelled = true; window.clearTimeout(timeout); colors?.dispose(); viewer?.removeEventListener('error', fail); viewer?.remove() }
  }, [onUnavailable])

  useEffect(() => {
    if (!ready) return
    let active = true
    void ready.colors.update(muscles, selected).catch(error => {
      if (!active) return
      captureException(error)
      onUnavailable()
    })
    return () => { active = false }
  }, [ready, muscles, selected, onUnavailable])

  useEffect(() => {
    if (ready) ready.viewer.cameraOrbit = `${view === 'front' ? 0 : 180}deg 90deg 105%`
  }, [ready, view])

  return <div>
    <div className="relative h-[400px] w-full" aria-busy={!ready}>
      <div ref={host} className="h-full w-full" />
      {!ready && <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Carregando manequim 3D…</p>}
    </div>
    <p className="text-center text-xs text-neutral-400">Arraste para girar · Pinça para aproximar</p>
    <button type="button" className="my-2 min-h-11 w-full rounded-lg border border-neutral-700 text-sm text-neutral-200" onClick={() => { if (ready) ready.viewer.cameraOrbit = `${view === 'front' ? 0 : 180}deg 90deg 105%` }}>Enquadrar</button>
    {onSelect && <label className="block text-xs text-neutral-400">Selecionar músculo
      <select className="mt-1 min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 text-base text-white" value={selected || ''} onChange={event => { const id = MUSCLE_GROUPS.find(muscle => muscle.id === event.target.value)?.id; if (id) onSelect(id) }}>
        <option value="" disabled>Selecione uma região</option>
        {MUSCLE_GROUPS.map(muscle => <option key={muscle.id} value={muscle.id}>{muscle.label} · {Number(muscles[muscle.id]?.sets || 0).toLocaleString('pt-BR')} séries</option>)}
      </select>
    </label>}
  </div>
}
