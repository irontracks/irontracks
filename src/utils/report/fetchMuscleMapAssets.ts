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

const FRONT_OVERLAY_BY_MUSCLE: Record<string, string> = {
    chest: 'front-chest.png',
    delts_front: 'front-delts.png',
    delts_side: 'front-delts.png',
    biceps: 'front-biceps.png',
    forearms: 'front-forearms.png',
    abs: 'front-abs.png',
    quads: 'front-quads.png',
    calves: 'front-calves.png',
}

const BACK_OVERLAY_BY_MUSCLE: Record<string, string> = {
    upper_back: 'back-upper_back.png',
    lats: 'back-lats.png',
    delts_rear: 'back-delts_rear.png',
    triceps: 'back-triceps.png',
    spinal_erectors: 'back-spinal_erectors.png',
    glutes: 'back-glutes.png',
    hamstrings: 'back-hamstrings.png',
    calves: 'back-calves.png',
}

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

    const overlayFilesNeeded = new Set<string>()
    Object.entries(FRONT_OVERLAY_BY_MUSCLE).forEach(([id, file]) => {
        if (Number(muscles[id]?.ratio || 0) > 0) overlayFilesNeeded.add(file)
    })
    Object.entries(BACK_OVERLAY_BY_MUSCLE).forEach(([id, file]) => {
        if (Number(muscles[id]?.ratio || 0) > 0) overlayFilesNeeded.add(file)
    })

    const [baseFront, baseBack, maskFront, maskBack] = await Promise.all([
        fetchAsDataUrl(baseFrontPath),
        fetchAsDataUrl(baseBackPath),
        fetchAsDataUrl(maskFrontPath),
        fetchAsDataUrl(maskBackPath),
    ])

    const overlayEntries = await Promise.all(
        Array.from(overlayFilesNeeded).map(async (file) => {
            const url = await fetchAsDataUrl(`/muscle-overlays/${file}`)
            return [file, url] as const
        }),
    )

    const overlays: Record<string, string> = {}
    for (const [file, url] of overlayEntries) {
        if (url) overlays[file] = url
    }

    return { baseFront, baseBack, maskFront, maskBack, overlays }
}
