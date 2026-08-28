import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { inflateSync } from 'zlib'
import { join } from 'path'
import { BACK_OVERLAYS, FRONT_OVERLAYS } from '@/lib/muscleMap/overlays'

/**
 * O overlay do músculo tem que cair DENTRO do corpo.
 *
 * ── O BUG QUE ESTE GUARD EXISTE PARA PEGAR ────────────────────────────────
 * `front-forearms.png` acendeu as MÃOS em vez dos antebraços por cinco meses,
 * nos dois gêneros, desde o commit que o criou (07cd40a0a, jun/2026). A arte
 * estava certa — desenha antebraços anatômicos. Errada era a GEOMETRIA: os dois
 * antebraços ocupavam x=[77,206] e [432,562] numa tela de 640, quando a
 * silhueta vai de x=178 a 462. Ou seja, quase toda a tinta caía FORA do corpo.
 *
 * Como a composição recorta o overlay pela máscara da silhueta, sobrava só a
 * interseção — e ela calhava de ser a região das mãos. Nada quebrava, nada
 * logava, e o teste de alfa (`muscleOverlayAlphaRecortado`) passava verde: o
 * arquivo TINHA alfa, TINHA recorte, só estava no lugar errado.
 *
 * Medido no arquivo defeituoso: **2,3%** dos pixels dentro da silhueta, e
 * 66.132 px opacos — MAIS que o corpo inteiro (62.884).
 *
 * ── OS LIMIARES, E POR QUE ESTES ──────────────────────────────────────────
 * Medidos nos 15 overlays reais (masculino e feminino), não escolhidos no chute:
 *
 *     pior overlay legítimo:  back-delts_rear no feminino, 63,5% dentro
 *     melhor:                 front-forearms (regerado), 100%
 *     o defeito:              2,3%
 *
 * O piso é 50% — abaixo do pior caso legítimo e MUITO acima do defeito. Não
 * aperto mais que isso de propósito: um overlay pode legitimamente transbordar
 * a silhueta (o `back-delts_rear` desenha o ombro com folga, e o corpo feminino
 * é mais estreito ali). Guard que acusa uso correto é afrouxado na primeira
 * semana — ver "os oito jeitos de errar" no CLAUDE.md.
 *
 * O teto de ÁREA é o segundo ângulo, e ele pega o que a fração não pega: um
 * borrão gigante centrado no corpo teria fração alta e ainda assim estaria
 * errado. Nenhum músculo isolado ocupa 40% da silhueta (o maior real é o
 * `back-glutes`, com 20%).
 */

const N = 640
const PUBLIC_DIR = join(process.cwd(), 'public')
const OVERLAY_DIR = join(PUBLIC_DIR, 'muscle-overlays')

/** Fração mínima da tinta que precisa cair dentro da silhueta. */
const PISO_DENTRO = 0.5
/** Fração máxima da silhueta que um único músculo pode ocupar. */
const TETO_AREA = 0.4

/**
 * Decodificador PNG mínimo — só o que estes assets são: RGBA, 8 bits, sem
 * entrelaçamento (conferido nos 19 arquivos). Existe para o guard não depender
 * de `sharp`, que neste repo não é dependência declarada: chega junto do Next e
 * pode sumir num upgrade, levando o guard com ele.
 */
function alfaDoPng(caminho: string): Uint8Array {
    const buf = readFileSync(caminho)
    const largura = buf.readUInt32BE(16)
    const altura = buf.readUInt32BE(20)
    const bitDepth = buf[24]
    const colorType = buf[25]
    const interlace = buf[28]
    if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`${caminho}: esperado RGBA 8-bit sem entrelaçamento (got depth=${bitDepth} type=${colorType} interlace=${interlace})`)
    }

    // Concatena todos os chunks IDAT antes de inflar — PNG grande vem em vários.
    const partes: Buffer[] = []
    let pos = 8
    while (pos < buf.length) {
        const tam = buf.readUInt32BE(pos)
        const tipo = buf.toString('ascii', pos + 4, pos + 8)
        if (tipo === 'IDAT') partes.push(buf.subarray(pos + 8, pos + 8 + tam))
        if (tipo === 'IEND') break
        pos += 12 + tam
    }
    const bruto = inflateSync(Buffer.concat(partes))

    const canais = 4
    const passo = largura * canais
    const saida = new Uint8Array(largura * altura * canais)
    let off = 0
    for (let y = 0; y < altura; y++) {
        const filtro = bruto[off++]
        const linha = bruto.subarray(off, off + passo)
        off += passo
        const destino = y * passo
        for (let i = 0; i < passo; i++) {
            const cru = linha[i]
            const a = i >= canais ? saida[destino + i - canais] : 0
            const b = y > 0 ? saida[destino - passo + i] : 0
            const c = i >= canais && y > 0 ? saida[destino - passo + i - canais] : 0
            let valor: number
            switch (filtro) {
                case 0: valor = cru; break
                case 1: valor = cru + a; break
                case 2: valor = cru + b; break
                case 3: valor = cru + ((a + b) >> 1); break
                case 4: {
                    const p = a + b - c
                    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
                    valor = cru + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
                    break
                }
                default: throw new Error(`${caminho}: filtro PNG desconhecido ${filtro}`)
            }
            saida[destino + i] = valor & 0xff
        }
    }

    const alfa = new Uint8Array(largura * altura)
    for (let i = 0; i < largura * altura; i++) alfa[i] = saida[i * canais + 3]
    return alfa
}

const silhueta = (arquivo: string): Uint8Array => {
    const a = alfaDoPng(join(PUBLIC_DIR, arquivo))
    const out = new Uint8Array(N * N)
    for (let i = 0; i < N * N; i++) out[i] = a[i] > 128 ? 1 : 0
    return out
}

const MASCARAS = {
    front: ['body-front-mask.png', 'body-front-female-mask.png'],
    back: ['body-back-mask.png', 'body-back-female-mask.png'],
} as const

describe('overlay do mapa muscular cai dentro do corpo', () => {
    const casos = [
        ...FRONT_OVERLAYS.map((o) => ({ file: o.file, vista: 'front' as const })),
        ...BACK_OVERLAYS.map((o) => ({ file: o.file, vista: 'back' as const })),
    ]

    it('a lista de overlays não está vazia — sem isto o guard passaria por não medir nada', () => {
        expect(casos.length).toBeGreaterThanOrEqual(10)
    })

    for (const { file, vista } of casos) {
        it(`${file}: a tinta cai dentro da silhueta, nos dois gêneros`, () => {
            const alfa = alfaDoPng(join(OVERLAY_DIR, file))
            let opacos = 0
            for (let i = 0; i < N * N; i++) if (alfa[i] > 128) opacos++
            expect(opacos, `${file} não tem pixel opaco nenhum`).toBeGreaterThan(0)

            for (const arquivoMascara of MASCARAS[vista]) {
                const corpo = silhueta(arquivoMascara)
                let dentro = 0
                let areaCorpo = 0
                for (let i = 0; i < N * N; i++) {
                    if (corpo[i] === 1) areaCorpo++
                    if (alfa[i] > 128 && corpo[i] === 1) dentro++
                }
                const fracao = dentro / opacos
                expect(
                    fracao,
                    `${file} contra ${arquivoMascara}: só ${(100 * fracao).toFixed(1)}% da tinta cai dentro do corpo. ` +
                    'O overlay está deslocado ou fora de escala — a máscara vai recortar o que sobra e o app ' +
                    'acenderá a parte errada do corpo, em silêncio (foi o bug das MÃOS em front-forearms).',
                ).toBeGreaterThanOrEqual(PISO_DENTRO)

                expect(
                    opacos / areaCorpo,
                    `${file} pinta ${opacos} px contra ${areaCorpo} do corpo inteiro. ` +
                    'Nenhum músculo isolado ocupa tanto: isso é borrão, não recorte.',
                ).toBeLessThanOrEqual(TETO_AREA)
            }
        })
    }
})
