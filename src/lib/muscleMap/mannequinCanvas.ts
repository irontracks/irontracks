/**
 * mannequinCanvas.ts — o manequim do mapa muscular desenhado em CANVAS.
 *
 * Existe para o Story: quem não quer aparecer na foto publica o próprio corpo
 * de treino, com os músculos da sessão acesos. O resultado entra no composer
 * pela MESMA porta da foto (vira um `File` e passa por `loadMedia`), então
 * zoom, pan, layouts, marca, legenda, export e publicação funcionam sem que
 * nenhum renderer saiba que aquilo não é uma fotografia.
 *
 * ⚠️ Duas armadilhas medidas nos PNGs antes de escrever o desenho:
 *
 * 1. **As bases são 100% OPACAS** (fundo preto sólido, medido: `opaque=100%`).
 *    Desenhadas com `source-over` elas cobrem o gradiente do template com um
 *    retângulo preto. Por isso vão com `globalCompositeOperation = 'lighten'`
 *    — o mesmo truque que o `PoseGuide` e o `BodyMeasurementMap` já usam com
 *    `mixBlendMode`. Os overlays, esses sim recortados por alpha, vão normais.
 * 2. **A máscara de costas inclui a sombra do chão** (alpha em toda a largura
 *    nas linhas de baixo). O recorte de origem tira as bordas para o corpo
 *    ocupar a caixa — e a sombra, sendo escura, some no `lighten` de qualquer
 *    forma.
 *
 * jsdom não implementa `getContext('2d')`: o guard deste módulo cobre o PLANO
 * de camadas (quem pinta, com que opacidade) e a fiação. O resultado na tela é
 * conferência visual.
 */
import {
    FRONT_OVERLAYS,
    BACK_OVERLAYS,
    OVERLAY_FOLDER,
    dedupOverlays,
    ratioToOpacity,
} from './overlays'
import type { SessionMuscles } from './sessionMuscles'

export type MannequinView = 'front' | 'back'
export type MannequinGender = 'male' | 'female'

/**
 * Recorte de origem (os PNGs são 640×640 e alinhados entre si). Corta o ar das
 * laterais para o corpo encher a caixa; medido sobre as máscaras, onde o corpo
 * ocupa x≈177–463.
 */
export const MANNEQUIN_SRC = { x: 152, y: 8, w: 336, h: 632 } as const

export type MannequinLayer = { file: string; opacity: number }

/** Camadas a pintar numa vista, já deduplicadas e sem as apagadas. */
export const planMannequinLayers = (
    view: MannequinView,
    muscles: SessionMuscles,
): MannequinLayer[] =>
    dedupOverlays(
        view === 'front' ? FRONT_OVERLAYS : BACK_OVERLAYS,
        (id) => Number(muscles[id]?.ratio || 0),
    )
        .map((o) => ({ file: o.file, opacity: ratioToOpacity(o.maxRatio) }))
        .filter((l) => l.opacity > 0)

export const baseSrcFor = (view: MannequinView, gender: MannequinGender): string =>
    view === 'front'
        ? (gender === 'female' ? '/body-front-female.png' : '/body-front.png')
        : (gender === 'female' ? '/body-back-female.png' : '/body-back.png')

export const maskSrcFor = (view: MannequinView, gender: MannequinGender): string =>
    view === 'front'
        ? (gender === 'female' ? '/body-front-female-mask.png' : '/body-front-mask.png')
        : (gender === 'female' ? '/body-back-female-mask.png' : '/body-back-mask.png')

export const overlaySrc = (file: string): string => `${OVERLAY_FOLDER}/${file}`

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        // `reject` direto no `onerror` entrega o EVENTO, não um Error — vira
        // "Event captured as promise rejection" no Sentry, sem stack.
        img.onerror = () => reject(new Error(`mannequin_asset_failed:${src}`))
        img.src = src
    })

/** Uma vista (corpo + músculos acesos), recortada e encaixada em dx/dy/dw/dh. */
export const drawMannequinView = (
    ctx: CanvasRenderingContext2D,
    opts: {
        base: HTMLImageElement
        mask: HTMLImageElement | null
        layers: { image: HTMLImageElement; opacity: number }[]
        dx: number; dy: number; dw: number; dh: number
    },
) => {
    const { base, mask, layers, dx, dy, dw, dh } = opts
    const S = MANNEQUIN_SRC

    ctx.save()
    ctx.globalCompositeOperation = 'lighten'
    ctx.drawImage(base, S.x, S.y, S.w, S.h, dx, dy, dw, dh)
    ctx.restore()

    if (!layers.length) return

    // Os músculos são compostos fora e recortados pela silhueta ANTES de entrar
    // no canvas final: aplicar a máscara direto no principal apagaria o fundo
    // já pintado (o `destination-in` age sobre tudo que estiver embaixo).
    const off = document.createElement('canvas')
    off.width = 640
    off.height = 640
    const octx = off.getContext('2d')
    if (!octx) return

    layers.forEach(({ image, opacity }) => {
        octx.globalAlpha = opacity
        octx.drawImage(image, 0, 0, 640, 640)
    })
    octx.globalAlpha = 1

    if (mask) {
        octx.globalCompositeOperation = 'destination-in'
        octx.drawImage(mask, 0, 0, 640, 640)
        octx.globalCompositeOperation = 'source-over'
    }

    ctx.drawImage(off, S.x, S.y, S.w, S.h, dx, dy, dw, dh)
}

/** Geometria das duas vistas dentro do canvas do story. */
export const mannequinLayout = (canvasW: number, canvasH: number) => {
    const side = Math.round(canvasW * 0.022)
    const gap = Math.round(canvasW * 0.022)
    const dw = Math.floor((canvasW - side * 2 - gap) / 2)
    const dh = Math.round((dw * MANNEQUIN_SRC.h) / MANNEQUIN_SRC.w)
    // Metade de cima: o gradiente do template escurece a partir de ~35% da
    // altura e o bloco de métricas mora embaixo.
    const dy = Math.round(canvasH * 0.05)
    return { dy, dh, front: { dx: side, dw }, back: { dx: side + dw + gap, dw } }
}

/**
 * Compõe o manequim inteiro (fundo do template + as duas vistas) e devolve o
 * PNG pronto para virar a "foto" do story.
 */
export const buildMannequinBlob = async (opts: {
    muscles: SessionMuscles
    gender: MannequinGender
    /** Gradiente de fundo do template escolhido (`overlay.fallbackBg`). */
    background: readonly [string, string]
    canvasW: number
    canvasH: number
}): Promise<Blob> => {
    const { muscles, gender, background, canvasW, canvasH } = opts

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('mannequin_canvas_unavailable')

    const g = ctx.createLinearGradient(0, 0, canvasW, canvasH)
    g.addColorStop(0, background[0])
    g.addColorStop(1, background[1])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvasW, canvasH)

    const views: MannequinView[] = ['front', 'back']
    const plans = views.map((view) => ({ view, layers: planMannequinLayers(view, muscles) }))

    const files = Array.from(new Set(plans.flatMap((p) => p.layers.map((l) => l.file))))
    const [bases, masks, overlayImages] = await Promise.all([
        Promise.all(views.map((v) => loadImage(baseSrcFor(v, gender)))),
        // A silhueta é um refinamento: sem ela os músculos ainda caem no lugar.
        Promise.all(views.map((v) => loadImage(maskSrcFor(v, gender)).catch(() => null))),
        Promise.all(files.map(async (f) => [f, await loadImage(overlaySrc(f)).catch(() => null)] as const)),
    ])
    const byFile = new Map(overlayImages)

    const geo = mannequinLayout(canvasW, canvasH)
    plans.forEach((plan, i) => {
        const box = plan.view === 'front' ? geo.front : geo.back
        drawMannequinView(ctx, {
            base: bases[i],
            mask: masks[i],
            layers: plan.layers
                .map((l) => ({ image: byFile.get(l.file) || null, opacity: l.opacity }))
                .filter((l): l is { image: HTMLImageElement; opacity: number } => !!l.image),
            dx: box.dx, dy: geo.dy, dw: box.dw, dh: geo.dh,
        })
    })

    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('mannequin_blob_failed'))),
            'image/png',
        )
    })
}
