/**
 * Guard: overlay de tela cheia do treino ativo DEVOLVE a faixa do rodapé que
 * pertence à barra do descanso.
 *
 * Relato do dono (17/08/2026), no modal do Rest-Pause: "o timer do rest-p com
 * o botão start ficaram debaixo do modal". O botão "15s" de cada mini INICIA o
 * descanso — a barra nasce no rodapé, atrás de um `fixed inset-0`, e o usuário
 * fica sem ver o cronômetro e sem alcançar o START.
 *
 * É o outro lado do PR #833: lá a barra cobria o "Salvar" dos modais e a saída
 * foi portal + z acima da barra. Subir o z resolveu um sentido e criou o
 * outro. **Sobreposição no rodapé não se resolve com z-index** — quem estiver
 * por cima esconde o outro, qualquer que seja o z. A convivência é geométrica:
 * o overlay encolhe `--it-rest-bar-h` no rodapé e cada um fica com a sua faixa.
 *
 * O guard VARRE o diretório do treino ativo atrás de overlays `fixed inset-0`
 * com z acima do da barra (lido da FONTE do RestTimerOverlay). Modal novo que
 * nasça sem devolver a faixa reprova aqui, e não no aparelho do usuário — é a
 * lição do guard do #833, que enumerava os três arquivos que o autor já
 * conhecia e por isso deixou o `WorkoutFooter` de fora.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = 'src/components/workout'

const stripComments = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/**
 * Overlays que NÃO devolvem a faixa, com o motivo. Só encolhe.
 */
const NAO_DEVOLVE: Record<string, string> = {
    // O overlay grande do PRÓPRIO descanso: ele É o cronômetro em tela cheia.
    // Encolher para dar espaço à própria barra não faria sentido.
    'RestTimerOverlay.tsx': 'é o próprio descanso',
}

function arquivosTsx(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.tsx'))
        .map((d) => path.join(dir, d.name))
}

/** z da barra compacta do descanso — lido da fonte, nunca chumbado. */
function zDaBarraDoDescanso(): number {
    const src = stripComments(readFileSync(path.join(DIR, 'RestTimerOverlay.tsx'), 'utf8'))
    const zs = Array.from(src.matchAll(/z-\[(\d+)\]/g)).map((m) => Number(m[1]))
    return Math.max(...zs)
}

type Overlay = { arquivo: string; z: number; devolve: boolean }

/**
 * Um overlay por ocorrência de `fixed inset-0 z-[N]`. O `style` pode vir ANTES
 * ou DEPOIS do className no JSX, então a janela olha os dois lados — fatiar só
 * para a frente deixaria passar metade dos casos.
 */
function overlaysDe(arquivo: string): Overlay[] {
    const src = stripComments(readFileSync(arquivo, 'utf8'))
    const out: Overlay[] = []
    const re = /fixed inset-0 z-\[(\d+)\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
        const janela = src.slice(Math.max(0, m.index - 260), m.index + 260)
        out.push({
            arquivo: path.basename(arquivo),
            z: Number(m[1]),
            devolve: /REST_BAR_INSET|--it-rest-bar-h/.test(janela),
        })
    }
    return out
}

describe('overlay de tela cheia × barra do descanso', () => {
    const zBarra = zDaBarraDoDescanso()
    const todos = arquivosTsx(DIR).flatMap(overlaysDe)
    // Só os que ficam ACIMA da barra escondem a barra. Abaixo dela o problema
    // é o inverso (o #833) e já tem guard próprio.
    const acimaDaBarra = todos.filter((o) => o.z > zBarra)

    it('autoteste: o detector enxerga a barra e os overlays', () => {
        expect(zBarra).toBeGreaterThan(0)
        // 20 overlays acima da barra hoje. Se zerar, o detector quebrou e todos
        // os casos abaixo passariam sem olhar nada.
        expect(acimaDaBarra.length).toBeGreaterThanOrEqual(15)
    })

    it('todos devolvem a faixa do rodapé para a barra do descanso', () => {
        const faltando = acimaDaBarra
            .filter((o) => !o.devolve && !NAO_DEVOLVE[o.arquivo])
            .map((o) => `${o.arquivo} (z-${o.z})`)
        expect(
            faltando,
            'overlay que cobre o rodapé esconde o cronômetro e o START do descanso — ' +
            'use REST_BAR_INSET (bottom: var(--it-rest-bar-h, 0px))',
        ).toEqual([])
    })

    it('a faixa devolvida é a MEDIDA pela barra, não um número chutado', () => {
        const helper = readFileSync(path.join(DIR, 'helpers/restBarInset.ts'), 'utf8')
        expect(helper).toMatch(/var\(--it-rest-bar-h,\s*0px\)/)
        // Fallback 0px: sem descanso na tela, nenhum modal muda de lugar.
        expect(helper).toMatch(/0px/)
    })

    it('a exceção declarada continua sendo só o overlay do próprio descanso', () => {
        expect(Object.keys(NAO_DEVOLVE)).toEqual(['RestTimerOverlay.tsx'])
    })
})
