/**
 * Texto livre do usuário no Story — a legenda que ele escreve para sair junto do
 * treino, já na tipografia do template escolhido.
 *
 * Pedido do dono (03/08/2026): "uma maneira de permitir o usuário escrever alguma
 * coisa no template para postar junto, e as letras seguirem o mesmo padrão do
 * template. Assim o vídeo ou foto já vai 100% personalizado para o insta."
 *
 * Puro/client-safe: mede e quebra, não desenha nem toca em estado.
 */

import { storyFont, type StoryTemplate } from './storyTemplates'

/**
 * Dimensões do canvas repetidas aqui DE PROPÓSITO, em vez de importadas de
 * `storyComposerUtils`.
 *
 * Aquele módulo importa `drawCustomTextLayer` daqui, então importar de volta cria
 * um ciclo — e as constantes abaixo são lidas no TOPO deste arquivo, na carga do
 * módulo. Num ciclo ESM elas chegariam `undefined`, e `CUSTOM_TEXT_BASE_Y` viraria
 * NaN: a legenda simplesmente não apareceria, sem erro nenhum.
 *
 * `customText.test.ts` trava a igualdade com a fonte original — divergir quebra o
 * teste, não o story.
 */
const CANVAS_W = 720
const CANVAS_H = 1280
const SAFE_SIDE = 56

type Offset = { x: number; y: number }

/**
 * Teto de caracteres.
 *
 * O story é queimado em imagem/vídeo: texto demais não tem como ser cortado depois,
 * compete com os números do treino e invade a zona que o Instagram recorta. 280 dá
 * ~6 linhas — espaço de sobra para uma legenda, longe de virar parágrafo.
 */
export const CUSTOM_TEXT_MAX_CHARS = 280

/** Corpo do texto do usuário. Menor que o título (36) — é legenda, não manchete. */
export const CUSTOM_TEXT_FONT_SIZE = 34
export const CUSTOM_TEXT_LINE_H = CUSTOM_TEXT_FONT_SIZE + 10

/** Âncora: começa na margem esquerda, na faixa livre entre a marca e o bloco. */
export const CUSTOM_TEXT_BASE_X = SAFE_SIDE
export const CUSTOM_TEXT_BASE_Y = Math.round(CANVAS_H * 0.42)

/** Folga entre a tinta e o traçado da alça, em px de canvas. */
const CUSTOM_TEXT_PAD = 10

/** Largura útil do texto: entre as margens seguras. */
export const customTextMaxWidth = (): number => CANVAS_W - SAFE_SIDE * 2

/** Recorta no teto sem cortar no meio de um caractere multibyte. */
export const clampCustomText = (raw: unknown): string =>
    Array.from(String(raw ?? '')).slice(0, CUSTOM_TEXT_MAX_CHARS).join('')

/**
 * Quebra o texto na largura útil, respeitando as quebras que o usuário digitou.
 *
 * Palavra maior que a linha inteira (link colado, "AAAAAA…") é fatiada à força —
 * sem isso ela vazaria para fora da área segura, que é justamente o que o recorte
 * do Instagram comeria.
 */
export const wrapCustomText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] => {
    const out: string[] = []
    const width = Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : CANVAS_W

    for (const paragraph of String(text ?? '').split('\n')) {
        if (!paragraph.trim()) { out.push(''); continue }

        let line = ''
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const candidate = line ? `${line} ${word}` : word
            if (ctx.measureText(candidate).width <= width) { line = candidate; continue }

            if (line) { out.push(line); line = '' }

            // Palavra sozinha que não cabe: fatia por caractere.
            if (ctx.measureText(word).width > width) {
                let chunk = ''
                for (const ch of Array.from(word)) {
                    if (ctx.measureText(chunk + ch).width > width && chunk) {
                        out.push(chunk)
                        chunk = ch
                    } else {
                        chunk += ch
                    }
                }
                line = chunk
            } else {
                line = word
            }
        }
        out.push(line)
    }

    // Remove linhas vazias do fim — o usuário costuma deixar Enter sobrando, e elas
    // inflariam a caixa da alça sem nada dentro.
    while (out.length && !out[out.length - 1]) out.pop()
    return out
}

export interface CustomTextBox {
    lines: string[]
    w: number
    h: number
    dx: number
    dy: number
}

/**
 * Caixa do texto já quebrado, com o mesmo contrato de `measureBrandBox`: `dx`/`dy`
 * levam da âncora até o canto do traçado, para a alça e o hit-test do gesto usarem
 * o MESMO retângulo que o usuário enxerga.
 */
export const measureCustomTextBox = (
    template: StoryTemplate,
    text: string,
    scale = 1,
): CustomTextBox => {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1
    const clean = clampCustomText(text)
    const empty: CustomTextBox = { lines: [], w: 0, h: 0, dx: -CUSTOM_TEXT_PAD * s, dy: -CUSTOM_TEXT_PAD * s }
    if (!clean.trim()) return empty

    try {
        if (typeof document === 'undefined') return empty
        const ctx = document.createElement('canvas').getContext('2d')
        if (!ctx) return empty

        const F = template.fonts
        ctx.textBaseline = 'top'
        ctx.font = storyFont(F.family, F.titleWeight, CUSTOM_TEXT_FONT_SIZE)

        const lines = wrapCustomText(ctx, clean, customTextMaxWidth())
        if (!lines.length) return empty

        const widest = lines.reduce((max, l) => Math.max(max, ctx.measureText(l).width), 0)
        const h = lines.length * CUSTOM_TEXT_LINE_H

        return {
            lines,
            w: (widest + CUSTOM_TEXT_PAD * 2) * s,
            h: (h + CUSTOM_TEXT_PAD * 2) * s,
            dx: -CUSTOM_TEXT_PAD * s,
            dy: -CUSTOM_TEXT_PAD * s,
        }
    } catch {
        return empty
    }
}

/**
 * O texto passa da área segura do Instagram?
 *
 * Não bloqueia — avisa. Cortar a frase do usuário no meio seria pior do que deixá-lo
 * decidir encurtar ou reposicionar.
 */
export const customTextOverflows = (
    box: CustomTextBox,
    offset: Offset | null | undefined,
    safeBottomY: number,
): boolean => {
    if (!box.lines.length) return false
    const top = CUSTOM_TEXT_BASE_Y + (Number(offset?.y) || 0) + box.dy
    return top + box.h > safeBottomY
}

/**
 * Desenha a legenda do usuário.
 *
 * Vive em ESPAÇO PRÓPRIO, como a marca: desfaz o zoom/pan do bloco e aplica só o
 * offset dela. Sem isso, dar zoom nos números do treino esticaria a legenda junto —
 * e ela é um elemento independente, que o usuário posiciona por conta.
 *
 * A tipografia sai do template (família, peso e cor do título), que é o pedido:
 * escolher o estilo e o texto já sair no padrão dele.
 */
export const drawCustomTextLayer = (
    ctx: CanvasRenderingContext2D,
    template: StoryTemplate,
    text: string,
    offset: Offset | null | undefined,
): void => {
    const clean = clampCustomText(text)
    if (!clean.trim()) return

    const F = template.fonts
    ctx.save()
    try {
        /**
         * SEM inversa do transform do bloco — e isso é o ponto.
         *
         * `enterBrandSpace` precisa da inversa porque a marca é desenhada DENTRO do
         * transform do bloco. A legenda não: os renderers chamam esta função depois
         * do `ctx.restore()` que encerra aquele transform, então o contexto já está
         * limpo. Aplicar a inversa aqui deslocava o texto pelo NEGATIVO do pan do
         * bloco — com o bloco arrastado, a legenda sumia para fora da tela enquanto
         * a alça (HTML, alheia ao canvas) continuava no lugar certo. Pego na
         * conferência no aparelho, 03/08/2026.
         */
        ctx.translate(Number(offset?.x) || 0, Number(offset?.y) || 0)

        ctx.textBaseline = 'top'
        ctx.font = storyFont(F.family, F.titleWeight, CUSTOM_TEXT_FONT_SIZE)
        // Sombra pelo mesmo motivo da marca: legibilidade sobre foto clara.
        ctx.shadowColor = 'rgba(0,0,0,0.6)'
        ctx.shadowBlur = 10
        ctx.fillStyle = template.colors.title

        const lines = wrapCustomText(ctx, clean, customTextMaxWidth())
        lines.forEach((line, i) => {
            ctx.fillText(line, CUSTOM_TEXT_BASE_X, CUSTOM_TEXT_BASE_Y + i * CUSTOM_TEXT_LINE_H)
        })
    } finally {
        ctx.restore()
    }
}
