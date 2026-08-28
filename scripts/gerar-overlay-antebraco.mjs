#!/usr/bin/env node
/**
 * Gera `public/muscle-overlays/front-forearms.png` a partir da arte de origem
 * (`scripts/assets/front-forearms-source.png`) + das silhuetas do manequim.
 *
 * ── POR QUE ESTE SCRIPT EXISTE ─────────────────────────────────────────────
 * O overlay de antebraço acendia as MÃOS, nos dois gêneros, desde que nasceu
 * (commit 07cd40a0a). A arte NUNCA esteve errada — ela desenha antebraços
 * anatômicos corretos. O que estava errado era a GEOMETRIA: os dois antebraços
 * ocupavam x=[77,206] e [432,562] numa tela de 640, ou seja, **fora do corpo**
 * (a silhueta vai de x=178 a 462). Como a composição recorta o overlay pela
 * máscara da silhueta, sobrava só a interseção — que calha de ser a região das
 * mãos. Medida do defeito: 66.132 px opacos, MAIS que o corpo inteiro (62.884),
 * contra 3.365 do bíceps.
 *
 * Reexportar a arte 3D exigiria o asset-source, que não está no repo. Mas não
 * é preciso: a forma correta do antebraço já existe no projeto — é a própria
 * silhueta do manequim entre o cotovelo e o punho. Este script usa a silhueta
 * como FORMA e a arte original como TEXTURA (as fibras musculares).
 *
 * ── AS MEDIDAS, E DE ONDE SAÍRAM ──────────────────────────────────────────
 * Varrendo a máscara linha a linha, a largura do braço conta a história:
 *
 *     y=250 → 37px   (cotovelo, articulação larga)
 *     y=270 → 33px
 *     y=290 → 25px
 *     y=310 → 22px   (punho, mínimo)
 *     y=320 → 33px   (alarga de novo: começou a MÃO)
 *     y=335 → runs fragmentados (dedos)
 *
 * Daí COTOVELO_Y=252 e PUNHO_Y=314. Abaixo disso é mão — e acender mão é
 * exatamente o bug que este arquivo conserta.
 *
 * ── OS DOIS GÊNEROS ────────────────────────────────────────────────────────
 * `/muscle-overlays/` é compartilhado por masculino e feminino (só a base e a
 * máscara trocam — ver o cabeçalho de `lib/muscleMap/overlays.ts`). A forma sai
 * da INTERSEÇÃO das duas silhuetas, então o overlay nunca vaza em nenhum dos
 * dois. Medido: nesta faixa as duas diferem por 1–3 px.
 *
 * Uso:  node scripts/gerar-overlay-antebraco.mjs [--check]
 *       --check  não escreve nada; só reporta as métricas do arquivo atual.
 */
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const N = 640
const RAIZ = process.cwd()
const P = (...p) => path.join(RAIZ, ...p)

const MASK_MASC = P('public', 'body-front-mask.png')
const MASK_FEM = P('public', 'body-front-female-mask.png')
const ARTE = P('scripts', 'assets', 'front-forearms-source.png')
const SAIDA = P('public', 'muscle-overlays', 'front-forearms.png')

/** Cotovelo e punho, medidos na silhueta (ver cabeçalho). */
const COTOVELO_Y = 252
const PUNHO_Y = 314

/** Cor de preenchimento onde a textura não alcança — o laranja dos irmãos. */
const COR_FALLBACK = [188, 122, 74]

/**
 * Quantas linhas afinam em cada ponta (cotovelo e punho).
 *
 * Sem isto o overlay termina em CORTE RETO, e um traço horizontal duro no meio
 * do braço não se parece com músculo nenhum — os outros 14 terminam em ponta.
 * Conferido na tela antes e depois.
 */
const LINHAS_DE_PONTA = 8

/**
 * Quanto do TOPO da arte descartar antes de esticá-la.
 *
 * A arte de origem tem um brilho forte na ponta do cotovelo. Esticada até a
 * caixa inteira, esse brilho vira uma faixa clara horizontal atravessando o
 * antebraço — lê como uma tampa bege, não como músculo. Descartando a ponta,
 * o que sobra são as fibras.
 */
const DESCARTE_TOPO_ARTE = 0.14

async function raw(file) {
    const { data, info } = await sharp(file)
        .resize(N, N, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    return { data, canais: info.channels }
}

/** Máscara booleana (alfa > 128) de um arquivo. */
async function silhueta(file) {
    const { data, canais } = await raw(file)
    const out = new Uint8Array(N * N)
    for (let i = 0; i < N * N; i++) out[i] = data[i * canais + 3] > 128 ? 1 : 0
    return out
}

/** Runs horizontais contíguos de uma linha, ignorando ruído de 1–2 px. */
function runsDaLinha(mask, y) {
    const out = []
    let ini = -1
    for (let x = 0; x <= N; x++) {
        const on = x < N && mask[y * N + x] === 1
        if (on && ini < 0) ini = x
        if (!on && ini >= 0) {
            if (x - 1 - ini >= 2) out.push([ini, x - 1])
            ini = -1
        }
    }
    return out
}

/**
 * A forma do antebraço: silhueta comum aos dois gêneros, entre cotovelo e
 * punho, e só nos RUNS LATERAIS — o do meio é o tronco, que nesta altura é o
 * quadril. Sem essa separação o overlay pintaria a virilha junto.
 */
function formaDoAntebraco(comum) {
    const alvo = new Uint8Array(N * N)
    for (let y = COTOVELO_Y; y <= PUNHO_Y; y++) {
        // Quanto encolher de cada lado nesta linha, para as pontas afinarem.
        const doTopo = y - COTOVELO_Y
        const daBase = PUNHO_Y - y
        const borda = Math.min(doTopo, daBase)
        const t = Math.min(1, borda / LINHAS_DE_PONTA)
        const encolher = (larg) => Math.round((larg / 2) * (1 - Math.sin((t * Math.PI) / 2)) * 0.8)

        const runs = runsDaLinha(comum, y)
        const esq = runs.filter((r) => r[1] < 300)
        const dir = runs.filter((r) => r[0] > 340)
        const escolhidos = []
        if (esq.length) escolhidos.push(esq[0])
        if (dir.length) escolhidos.push(dir[dir.length - 1])
        for (const [x0, x1] of escolhidos) {
            const k = encolher(x1 - x0 + 1)
            for (let x = x0 + k; x <= x1 - k; x++) alvo[y * N + x] = 1
        }
    }
    return alvo
}

/** Caixa de um lado da forma. */
function caixa(mask, lado) {
    let x0 = N, x1 = -1, y0 = N, y1 = -1
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            if (mask[y * N + x] !== 1) continue
            if (lado === 'esq' ? x >= 320 : x < 320) continue
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
        }
    }
    return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

async function main() {
    const check = process.argv.includes('--check')

    const [masc, fem] = await Promise.all([silhueta(MASK_MASC), silhueta(MASK_FEM)])
    const comum = new Uint8Array(N * N)
    for (let i = 0; i < N * N; i++) comum[i] = masc[i] & fem[i]

    const alvo = formaDoAntebraco(comum)
    const totalAlvo = alvo.reduce((a, b) => a + b, 0)

    if (check) {
        const atual = await raw(SAIDA)
        let opacos = 0
        for (let i = 0; i < N * N; i++) if (atual.data[i * atual.canais + 3] > 128) opacos++
        let dentro = 0
        for (let i = 0; i < N * N; i++) {
            if (atual.data[i * atual.canais + 3] > 128 && comum[i] === 1) dentro++
        }
        console.log(`forma esperada: ${totalAlvo} px`)
        console.log(`arquivo atual : ${opacos} px opacos, ${dentro} dentro da silhueta (${((100 * dentro) / Math.max(1, opacos)).toFixed(1)}%)`)
        return
    }

    // Textura: a arte original, com cada antebraço redimensionado para a caixa
    // do braço correspondente. A distorção é irrelevante — é fibra muscular,
    // não contorno; o contorno vem da silhueta.
    const arte = await raw(ARTE)
    const arteMask = new Uint8Array(N * N)
    for (let i = 0; i < N * N; i++) {
        // A arte de origem é RGB opaco com fundo preto: o que é "tinta" se
        // reconhece pelo brilho, não pelo alfa (que é 255 em tudo).
        const r = arte.data[i * arte.canais], g = arte.data[i * arte.canais + 1], b = arte.data[i * arte.canais + 2]
        arteMask[i] = r + g + b > 90 ? 1 : 0
    }

    const saida = Buffer.alloc(N * N * 4, 0)

    for (const lado of ['esq', 'dir']) {
        const cAlvo = caixa(alvo, lado)
        const cArte = caixa(arteMask, lado)
        if (cAlvo.x1 < 0 || cArte.x1 < 0) throw new Error(`caixa vazia no lado ${lado}`)

        // Duas etapas de propósito: `resize → extract → resize` na MESMA
        // pipeline faz o sharp responder "bad extract area" — o segundo resize
        // atropela o primeiro e o recorte perde a referência de tamanho.
        const arte640 = await sharp(ARTE).resize(N, N, { fit: 'fill' }).png().toBuffer()
        const cortaTopo = Math.round(cArte.h * DESCARTE_TOPO_ARTE)
        const recorte = await sharp(arte640)
            .extract({ left: cArte.x0, top: cArte.y0 + cortaTopo, width: cArte.w, height: cArte.h - cortaTopo })
            .resize(cAlvo.w, cAlvo.h, { fit: 'fill' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
        const tex = recorte.data
        const tc = recorte.info.channels

        for (let y = cAlvo.y0; y <= cAlvo.y1; y++) {
            for (let x = cAlvo.x0; x <= cAlvo.x1; x++) {
                if (alvo[y * N + x] !== 1) continue
                const ti = ((y - cAlvo.y0) * cAlvo.w + (x - cAlvo.x0)) * tc
                let r = tex[ti], g = tex[ti + 1], b = tex[ti + 2]
                // Onde a arte é fundo (preto), usa o laranja da família em vez
                // de deixar um buraco escuro dentro do músculo aceso.
                if (r + g + b < 90) [r, g, b] = COR_FALLBACK
                const oi = (y * N + x) * 4
                saida[oi] = r
                saida[oi + 1] = g
                saida[oi + 2] = b
                // Alfa BINÁRIO: é assim que os outros 14 overlays são (medido —
                // zero pixels entre 1 e 127). Antialias aqui criaria uma borda
                // fantasma que a máscara da composição não corta.
                saida[oi + 3] = 255
            }
        }
    }

    const png = await sharp(saida, { raw: { width: N, height: N, channels: 4 } })
        .png({ compressionLevel: 9 })
        .toBuffer()
    writeFileSync(SAIDA, png)

    let escritos = 0
    for (let i = 0; i < N * N; i++) if (saida[i * 4 + 3] > 128) escritos++
    console.log(`${path.relative(RAIZ, SAIDA)}: ${escritos} px opacos (${(png.length / 1024).toFixed(1)} KB)`)
    console.log(`faixa y ${COTOVELO_Y}–${PUNHO_Y} (cotovelo→punho); 100% dentro da silhueta comum aos dois gêneros`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
