/**
 * Guard do bug "a barra do descanso cobre o Salvar" (relato de usuário real,
 * 14/08/2026: "cê tá no descanso e abre ali pra adicionar série/exercício, não
 * consegue salvar porque [a barra] fica bem em cima — ou tem que encerrar o
 * descanso pra salvar").
 *
 * Mecânica: o <ActiveWorkout> é `fixed inset-0 z-[50]` — position + z-index
 * criam um CONTEXTO DE EMPILHAMENTO, então TODO overlay renderizado dentro
 * dele disputa com a barra do descanso (RestTimerOverlay, raiz) como 50 × 2100
 * e PERDE, não importa o z interno (subir para 1400 nunca resolveu). A saída,
 * já usada pelo check-out pós-treino, é PORTAL para o document.body + z acima
 * da barra.
 *
 * Invariantes:
 *  1. O <Modals /> inteiro é renderizado via createPortal no ActiveWorkout —
 *     a família toda (editor completo, adicionar/editar exercício, organizar,
 *     deload e os 13 modais de método) sai do contexto z-50 de uma vez.
 *  2. Todo overlay `fixed inset-0 z-[N]` da família tem N MAIOR que o z da
 *     barra do descanso — lido da FONTE do RestTimerOverlay, não chumbado:
 *     se alguém subir a barra acima dos modais, este guard cobra a revisão.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')
// Comentários citam z antigos (a documentação do porquê) — só o código conta.
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const MODAL_FILES = [
    'src/components/workout/Modals.tsx',
    'src/components/workout/ModalsSimpleMethods.tsx',
    'src/components/workout/ModalsComplexMethods.tsx',
]

function overlayZs(src: string): number[] {
    const out: number[] = []
    const re = /fixed inset-0 z-\[(\d+)\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) out.push(Number(m[1]))
    return out
}

describe('modais do treino ativo × barra do descanso', () => {
    const restSrc = stripComments(read('src/components/workout/RestTimerOverlay.tsx'))
    // A barra compacta (bottom bar) é o elemento que cobria os botões.
    const barZs = Array.from(restSrc.matchAll(/z-\[(\d+)\]/g)).map((m) => Number(m[1]))
    const barMax = Math.max(...barZs)

    it('autoteste: o detector enxerga a barra do descanso e os overlays', () => {
        expect(barZs.length).toBeGreaterThan(0)
        const total = MODAL_FILES.reduce((n, f) => n + overlayZs(stripComments(read(f))).length, 0)
        // 19 overlays hoje (6 Modals + 7 simples + 6 complexos) — se zerar, o
        // detector quebrou e o guard de baixo estaria verde sem olhar nada.
        expect(total).toBeGreaterThanOrEqual(15)
    })

    it('o <Modals /> é portalado para o document.body no ActiveWorkout', () => {
        const src = read('src/components/ActiveWorkout.tsx')
        // Sem o portal, todo z daqui de baixo é irrelevante: o contexto z-50
        // do ActiveWorkout perde para a barra (2100) na raiz.
        expect(src).toMatch(/createPortal\(\s*<Modals\s*\/>\s*,\s*document\.body\s*\)/)
    })

    it.each(MODAL_FILES)('%s — todo overlay fica ACIMA da barra do descanso', (file) => {
        const zs = overlayZs(stripComments(read(file)))
        expect(zs.length).toBeGreaterThan(0)
        for (const z of zs) {
            // Se isto falhou: ou um overlay novo nasceu abaixo da barra (vai
            // ficar coberto durante o descanso), ou a barra subiu acima dos
            // modais — os dois exigem decisão, não ajuste cego do número.
            expect(z, `${file} tem overlay z-[${z}] ≤ barra z-[${barMax}]`).toBeGreaterThan(barMax)
        }
    })
})
