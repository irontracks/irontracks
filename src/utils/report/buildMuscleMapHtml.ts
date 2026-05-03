/**
 * Pure HTML generator for the weekly muscle map section in the PDF/HTML
 * export. Mirrors the visual logic of `BodyMapSvg.tsx` but emits a static
 * string suitable for `buildReportHTML()` to inject.
 *
 * Strategy
 * ────────
 * - Frente + Costas side by side (no toggle in the export).
 * - Same PNG overlays as the React component (`/muscle-overlays/*.png`),
 *   referenced by absolute URL so the printed/saved HTML resolves them.
 * - Per-muscle opacity = clamp(ratio * 0.85, 0.15..1) — matches
 *   `ratioToOpacity` in BodyMapSvg.
 * - CSS `mask-image` clips overlays to the body silhouette, just like the
 *   React component.
 *
 * Why HTML+CSS instead of inline SVG paths
 * ────────────────────────────────────────
 * Re-implementing the muscle silhouettes as SVG paths would duplicate
 * hundreds of bezier curves. The PNG-overlay approach lets us reuse the
 * artwork that already exists.
 */

const FRONT_OVERLAYS: { muscleId: string; file: string }[] = [
    { muscleId: 'chest', file: 'front-chest.png' },
    { muscleId: 'delts_front', file: 'front-delts.png' },
    { muscleId: 'delts_side', file: 'front-delts.png' },
    { muscleId: 'biceps', file: 'front-biceps.png' },
    { muscleId: 'forearms', file: 'front-forearms.png' },
    { muscleId: 'abs', file: 'front-abs.png' },
    { muscleId: 'quads', file: 'front-quads.png' },
    { muscleId: 'calves', file: 'front-calves.png' },
]

const BACK_OVERLAYS: { muscleId: string; file: string }[] = [
    { muscleId: 'upper_back', file: 'back-upper_back.png' },
    { muscleId: 'lats', file: 'back-lats.png' },
    { muscleId: 'delts_rear', file: 'back-delts_rear.png' },
    { muscleId: 'triceps', file: 'back-triceps.png' },
    { muscleId: 'spinal_erectors', file: 'back-spinal_erectors.png' },
    { muscleId: 'glutes', file: 'back-glutes.png' },
    { muscleId: 'hamstrings', file: 'back-hamstrings.png' },
    { muscleId: 'calves', file: 'back-calves.png' },
]

const ratioToOpacity = (ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return 0
    return Math.min(1, Math.max(0.15, ratio * 0.85))
}

type MuscleEntry = { ratio?: number; sets?: number; view?: string }

const dedupForView = (
    overlays: typeof FRONT_OVERLAYS,
    muscles: Record<string, MuscleEntry>,
) => {
    const seen = new Map<string, number>()
    for (const o of overlays) {
        const ratio = Number(muscles?.[o.muscleId]?.ratio || 0)
        const prev = seen.get(o.file) ?? 0
        if (ratio > prev) seen.set(o.file, ratio)
    }
    return Array.from(seen.entries()).map(([file, maxRatio]) => ({ file, maxRatio }))
}

interface BuildOptions {
    /** Origin URL for the asset paths (e.g. https://irontracks.com.br). When
     *  the HTML is opened locally as a file, absolute URLs let the browser
     *  reach back to production for the PNGs. */
    origin?: string
    gender?: 'male' | 'female' | 'not_informed'
}

const buildOneSilhouette = (
    view: 'front' | 'back',
    muscles: Record<string, MuscleEntry>,
    opts: BuildOptions,
) => {
    const isFemale = opts.gender === 'female'
    const overlayFolder = `${opts.origin || ''}/muscle-overlays`
    const baseSrc = view === 'front'
        ? `${opts.origin || ''}/${isFemale ? 'body-front-female.png' : 'body-front.png'}`
        : `${opts.origin || ''}/${isFemale ? 'body-back-female.png' : 'body-back.png'}`
    const maskSrc = view === 'front'
        ? `${opts.origin || ''}/${isFemale ? 'body-front-female-mask.png' : 'body-front-mask.png'}`
        : `${opts.origin || ''}/${isFemale ? 'body-back-female-mask.png' : 'body-back-mask.png'}`

    const overlays = view === 'front' ? FRONT_OVERLAYS : BACK_OVERLAYS
    const layers = dedupForView(overlays, muscles)

    const overlayDivs = layers
        .map(({ file, maxRatio }) => {
            const opacity = ratioToOpacity(maxRatio)
            if (opacity <= 0) return ''
            return `<div style="
                position:absolute; inset:0;
                background-image:url('${overlayFolder}/${file}');
                background-size:contain; background-position:center; background-repeat:no-repeat;
                opacity:${opacity.toFixed(3)};
            "></div>`
        })
        .join('')

    const viewLabel = view === 'front' ? 'Frente' : 'Costas'

    return `
        <div style="flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:8px;">
            <div style="
                position:relative; width:100%; max-width:240px; aspect-ratio:1/1;
                background:#000; border-radius:16px; overflow:hidden;
            ">
                <div style="
                    position:absolute; inset:0;
                    background-image:url('${baseSrc}');
                    background-size:contain; background-position:center; background-repeat:no-repeat;
                "></div>
                <div style="
                    position:absolute; inset:0;
                    -webkit-mask-image:url('${maskSrc}');
                    mask-image:url('${maskSrc}');
                    -webkit-mask-size:contain; mask-size:contain;
                    -webkit-mask-position:center; mask-position:center;
                    -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
                ">${overlayDivs}</div>
                <div style="
                    position:absolute; inset:0; pointer-events:none; border-radius:16px;
                    box-shadow: inset 0 0 30px rgba(0,0,0,0.95);
                "></div>
            </div>
            <div style="font-size:11px; font-weight:900; letter-spacing:0.2em; text-transform:uppercase; color:#9ca3af;">${viewLabel}</div>
        </div>
    `
}

const LEGEND_BUCKETS: { label: string; color: string }[] = [
    { label: 'Nenhum', color: '#374151' },
    { label: 'Baixo', color: '#fbbf24' },
    { label: 'Na meta', color: '#ea580c' },
    { label: 'Alto', color: '#dc2626' },
    { label: 'Acima', color: '#991b1b' },
]

const buildLegend = () => `
    <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin-top:12px;">
        ${LEGEND_BUCKETS.map(b => `
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${b.color};"></span>
                <span style="font-size:10px; font-weight:900; letter-spacing:0.15em; text-transform:uppercase; color:#d1d5db;">${b.label}</span>
            </div>
        `).join('')}
    </div>
`

/**
 * Returns an HTML string for the "Mapa Muscular" section. Returns empty
 * string when there's no muscle data — caller can safely append it.
 */
export function buildMuscleMapHtml(
    muscleData: Record<string, unknown> | null | undefined,
    opts: BuildOptions = {},
): string {
    const muscles = muscleData && typeof muscleData === 'object' && muscleData.muscles && typeof muscleData.muscles === 'object'
        ? (muscleData.muscles as Record<string, MuscleEntry>)
        : null
    if (!muscles) return ''

    const hasAnyData = Object.values(muscles).some(m => Number(m?.sets || 0) > 0)
    if (!hasAnyData) return ''

    const front = buildOneSilhouette('front', muscles, opts)
    const back = buildOneSilhouette('back', muscles, opts)

    return `
        <div class="section-block">
            <div class="section-title"><span class="section-dot"></span>Mapa Muscular — Sua semana</div>
            <div style="display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap;">
                ${front}
                ${back}
            </div>
            ${buildLegend()}
        </div>
    `
}
