'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import BodyMapSvg from './BodyMapSvg'
import BodyMap3DModal from './BodyMap3DModal'
import type { MuscleMap3DState } from '@/lib/muscleMap/colors3d'
import type { MuscleId } from '@/utils/muscleMapConfig'

const BodyMap3D = dynamic(() => import('./BodyMap3D'), { ssr: false, loading: () => <p role="status" className="py-8 text-center text-neutral-400">Preparando 3D…</p> })
type Props = {
  view: 'front' | 'back'
  muscles: MuscleMap3DState
  musclesForView: MuscleMap3DState
  selected?: MuscleId | null
  gender?: 'male' | 'female' | 'not_informed'
  onSelect?: (id: MuscleId) => void
}

export default function BodyMapInteractive({ muscles, musclesForView, ...props }: Props) {
  const [is3dOpen, setIs3dOpen] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const fail = useCallback(() => { setUnavailable(true); setIs3dOpen(false) }, [])
  const supports3d = props.gender !== 'female'
  return <div>
    {supports3d && <div className="mb-3 flex justify-center gap-2" role="group" aria-label="Modo do mapa muscular">
      <button type="button" aria-pressed={!is3dOpen} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 aria-pressed:border-yellow-500 aria-pressed:text-yellow-500" onClick={() => setIs3dOpen(false)}>2D</button>
      <button type="button" aria-haspopup="dialog" aria-expanded={is3dOpen} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 aria-expanded:border-yellow-500 aria-expanded:text-yellow-500" onClick={() => { setUnavailable(false); setIs3dOpen(true) }}>3D</button>
    </div>}
    <BodyMapSvg {...props} muscles={musclesForView} />
    {is3dOpen && supports3d && <BodyMap3DModal onClose={() => setIs3dOpen(false)}>
      <BodyMap3D view={props.view} muscles={muscles} selected={props.selected} onSelect={props.onSelect} onUnavailable={fail} />
    </BodyMap3DModal>}
    {unavailable && <p role="status" className="mt-2 text-xs text-neutral-400">O 3D não carregou. Seu mapa continua disponível em 2D.</p>}
  </div>
}
