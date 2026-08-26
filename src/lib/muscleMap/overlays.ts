/**
 * overlays.ts — QUAL PNG pinta QUAL músculo, e com que opacidade.
 *
 * Extraído de `components/muscle-map/BodyMapSvg.tsx` quando o manequim do Story
 * passou a desenhar o mesmo corpo em canvas. Duas listas destas divergiriam no
 * dia em que um músculo ganhasse asset novo — e a divergência seria silenciosa,
 * porque cada superfície continuaria desenhando "certo" pela sua própria lista.
 *
 * Os PNGs (640×640, alinhados entre si por construção) JÁ vêm coloridos: o que
 * varia por volume é só a OPACIDADE. Quem mexer aqui mexe nas duas telas.
 */
import type { MuscleId } from '@/utils/muscleMapConfig'

export type OverlayEntry = { muscleId: MuscleId; file: string }

export const FRONT_OVERLAYS: OverlayEntry[] = [
    { muscleId: 'chest', file: 'front-chest.png' },
    { muscleId: 'delts_front', file: 'front-delts.png' },
    { muscleId: 'delts_side', file: 'front-delts.png' },
    { muscleId: 'biceps', file: 'front-biceps.png' },
    { muscleId: 'forearms', file: 'front-forearms.png' },
    { muscleId: 'abs', file: 'front-abs.png' },
    { muscleId: 'quads', file: 'front-quads.png' },
    { muscleId: 'calves', file: 'front-calves.png' },
]

export const BACK_OVERLAYS: OverlayEntry[] = [
    { muscleId: 'upper_back', file: 'back-upper_back.png' },
    { muscleId: 'lats', file: 'back-lats.png' },
    { muscleId: 'delts_rear', file: 'back-delts_rear.png' },
    { muscleId: 'triceps', file: 'back-triceps.png' },
    { muscleId: 'spinal_erectors', file: 'back-spinal_erectors.png' },
    { muscleId: 'glutes', file: 'back-glutes.png' },
    { muscleId: 'hamstrings', file: 'back-hamstrings.png' },
    { muscleId: 'calves', file: 'back-calves.png' },
]

/**
 * Pasta ÚNICA de overlays, para os dois gêneros. O que muda com o gênero é a
 * BASE e a MÁSCARA do corpo (`baseSrcFor`/`maskSrcFor` no manequim, e os pares
 * equivalentes na tela e no PDF) — nunca o overlay.
 *
 * Existiu uma `/muscle-overlays-female` (13/03/2026); ela foi tirada do render
 * no mesmo dia (commit eb55b1b03) por dois motivos que continuam valendo: estes
 * PNGs já desenham anatomia feminina (o `front-chest.png` é um torso com seios)
 * e as bases femininas foram refeitas alinhadas ao mesmo enquadramento do
 * manequim masculino. A pasta órfã foi apagada em 26/08/2026 — medida antes:
 * arte de OUTRO manequim, 100% opaca (sem o alfa que recorta o músculo) e cada
 * arquivo num enquadramento próprio, sem alinhamento possível por escala e
 * translação. Guard: `src/__tests__/muscleOverlayAlphaRecortado.test.ts`.
 */
export const OVERLAY_FOLDER = '/muscle-overlays'

export type DedupedOverlay = { file: string; muscleIds: MuscleId[]; maxRatio: number }

/**
 * Uma imagem pode servir a mais de um músculo (o deltoide frontal e o lateral
 * dividem `front-delts.png`). Desenhar a mesma camada duas vezes soma opacidade
 * e o ombro fica mais aceso que o peitoral treinado em dobro.
 */
export const dedupOverlays = (
    overlays: OverlayEntry[],
    ratioOf: (id: MuscleId) => number,
): DedupedOverlay[] => {
    const seen = new Map<string, DedupedOverlay>()
    for (const o of overlays) {
        const ratio = Number(ratioOf(o.muscleId)) || 0
        const existing = seen.get(o.file)
        if (existing) {
            existing.muscleIds.push(o.muscleId)
            existing.maxRatio = Math.max(existing.maxRatio, ratio)
        } else {
            seen.set(o.file, { file: o.file, muscleIds: [o.muscleId], maxRatio: ratio })
        }
    }
    return Array.from(seen.values())
}

/**
 * Opacidade a partir do volume relativo. O piso de 0,15 é proposital: músculo
 * treinado de leve precisa APARECER — some, e o mapa mente por omissão.
 */
export const ratioToOpacity = (ratio: number, boost = false): number => {
    if (!(Number(ratio) > 0)) return 0
    const base = Math.min(1, Math.max(0.15, ratio * 0.85))
    return boost ? Math.min(1, base + 0.2) : base
}
