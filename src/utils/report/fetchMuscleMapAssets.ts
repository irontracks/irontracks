import { FRONT_OVERLAYS, BACK_OVERLAYS, OVERLAY_FOLDER } from '@/lib/muscleMap/overlays'

/**
 * Pre-fetches every PNG the PDF muscle-map needs and returns them as base64
 * data URLs so `buildMuscleMapHtml` can embed them inline.
 *
 * The exported HTML is opened by iOS share sheets / file:// blobs / print
 * previews — contexts that can't reach back to https://irontracks.com.br for
 * external resources. Same problem (and same fix) as `fetchLogoDataUrl`.
 *
 * Only fetches overlays for muscles with ratio > 0 to keep the payload small
 * (~50–200 KB total instead of ~1 MB).
 */

export interface MuscleMapAssets {
    baseFront: string | null
    baseBack: string | null
    maskFront: string | null
    maskBack: string | null
    /** keyed by overlay filename (e.g. "front-chest.png") */
    overlays: Record<string, string>
}

const _cache = new Map<string, string>()

const fetchAsDataUrl = async (path: string): Promise<string | null> => {
    const cached = _cache.get(path)
    if (cached) return cached
    try {
        const res = await fetch(path)
        if (!res.ok) return null
        const blob = await res.blob()
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => {
                const result = reader.result as string
                _cache.set(path, result)
                resolve(result)
            }
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
        })
    } catch {
        return null
    }
}

type MuscleEntry = { ratio?: number; sets?: number }

export async function fetchMuscleMapAssets(
    gender: 'male' | 'female' | 'not_informed',
    muscleData: Record<string, unknown> | null | undefined,
): Promise<MuscleMapAssets> {
    const isFemale = gender === 'female'
    const baseFrontPath = isFemale ? '/body-front-female.png' : '/body-front.png'
    const baseBackPath = isFemale ? '/body-back-female.png' : '/body-back.png'
    const maskFrontPath = isFemale ? '/body-front-female-mask.png' : '/body-front-mask.png'
    const maskBackPath = isFemale ? '/body-back-female-mask.png' : '/body-back-mask.png'

    const muscles = muscleData && typeof muscleData === 'object' && muscleData.muscles && typeof muscleData.muscles === 'object'
        ? (muscleData.muscles as Record<string, MuscleEntry>)
        : {}

    // Tabela músculo→PNG vem de `lib/muscleMap/overlays` — a mesma que a tela
    // do mapa e o manequim do Story usam.
    const overlayFilesNeeded = new Set<string>()
    ;[...FRONT_OVERLAYS, ...BACK_OVERLAYS].forEach(({ muscleId, file }) => {
        if (Number(muscles[muscleId]?.ratio || 0) > 0) overlayFilesNeeded.add(file)
    })

    const [baseFront, baseBack, maskFront, maskBack] = await Promise.all([
        fetchAsDataUrl(baseFrontPath),
        fetchAsDataUrl(baseBackPath),
        fetchAsDataUrl(maskFrontPath),
        fetchAsDataUrl(maskBackPath),
    ])

    const overlayEntries = await Promise.all(
        Array.from(overlayFilesNeeded).map(async (file) => {
            const url = await fetchAsDataUrl(`${OVERLAY_FOLDER}/${file}`)
            return [file, url] as const
        }),
    )

    const overlays: Record<string, string> = {}
    for (const [file, url] of overlayEntries) {
        if (url) overlays[file] = url
    }

    return { baseFront, baseBack, maskFront, maskBack, overlays }
}
