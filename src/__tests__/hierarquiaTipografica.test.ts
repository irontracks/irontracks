import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Ratchet da hierarquia tipográfica — auditoria de design, ago/2026.
 *
 * Medido: 1.504 usos de `font-black` e 1.101 de `font-bold`, contra 282 de
 * todos os pesos intermediários somados. A pirâmide está invertida — o peso
 * mais forte virou o padrão, e **quando tudo pesa 900, nada pesa**. É o motivo
 * de a tela parecer flat mesmo com paleta e espaçamento bem resolvidos.
 *
 * O caso mais agudo é `font-black` em texto de 9–11px: em Inter, peso 900
 * nesse corpo fecha os contraforms (os vazios do a, e, o) e a palavra vira
 * mancha. Havia até `text-[6px] font-black`, que é ilegível por definição.
 *
 * Consertar 800 pontos numa tacada seria irresponsável — cada um é uma decisão
 * de layout. Então: o eixo óptico da Inter (layout.tsx + globals.css) alivia
 * todos de uma vez, a escala semântica (`.t-title` / `.t-action` / `.t-meta`)
 * dá o caminho certo para o código novo, e ESTE ratchet garante que o número
 * só desce.
 *
 * Igual ao ratchet de `user_settings`: a lista só encolhe. Componente novo com
 * peso 900 em texto miúdo reprova aqui, antes do merge.
 */

const SRC = join(__dirname, '..')

/**
 * Teto atual. Só pode DIMINUIR — nunca suba este número para fazer o CI passar.
 *
 * 723 → 677 (12/08/2026): os 46 rótulos do mesmo formato que tinham COR
 * intencional (34 em dourado, o resto em verde/vermelho/neutro) e por isso
 * haviam ficado de fora. A trava era o `t-meta` embutir `color`: adotá-lo
 * apagaria a cor. `t-meta-inherit` tem a mesma forma e não opina sobre cor —
 * tipografia e cor são decisões separadas.
 *
 * 800 → 723 (ago/2026): os 74 rótulos que usavam exatamente
 * `text-xs font-black uppercase tracking-widest text-neutral-400` viraram
 * `.t-meta text-xs`. A cor é a MESMA que o utilitário já define, então a troca
 * não mexe em paleta — só desfaz o peso 900 e o tracking largo em texto de
 * 12px, que era o problema. Os ~51 rótulos do mesmo formato com outra cor
 * (amarelo, neutral-500) ficaram de fora de propósito: `.t-meta` embute
 * `color`, e aplicá-lo ali apagaria a cor intencional.
 */
// 677 → 617 em 24/08/2026: o seletor de método por série virou um widget só
// (`SetMethodPicker`) em vez de duas listas de botões `font-black` copiadas no
// `normalSet` e no `groupMethodSet`. Ratchet só desce — o ganho fica travado.
const TETO_PESO_900_EM_TEXTO_MIUDO = 615

function arquivosTsx(dir: string, out: string[] = []): string[] {
    for (const entrada of readdirSync(dir)) {
        const caminho = join(dir, entrada)
        if (statSync(caminho).isDirectory()) {
            if (entrada === '__tests__' || entrada === 'node_modules') continue
            arquivosTsx(caminho, out)
        } else if (entrada.endsWith('.tsx')) {
            out.push(caminho)
        }
    }
    return out
}

function contarPeso900EmTextoMiudo(): number {
    let total = 0
    for (const arquivo of arquivosTsx(SRC)) {
        for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
            if (!linha.includes('font-black')) continue
            const px = linha.match(/text-\[(\d+)px\]/)
            const miudo = (px && Number(px[1]) <= 11) || linha.includes('text-xs')
            if (miudo) total += 1
        }
    }
    return total
}

describe('ratchet — peso 900 em texto miúdo', () => {
    it(`não passa de ${TETO_PESO_900_EM_TEXTO_MIUDO} ocorrências`, () => {
        const atual = contarPeso900EmTextoMiudo()
        expect(
            atual,
            `subiu para ${atual}. Use .t-meta (rótulo), .t-action (botão) ou .t-title (nome) — ver globals.css`,
        ).toBeLessThanOrEqual(TETO_PESO_900_EM_TEXTO_MIUDO)
    })

    it('o teto acompanha a realidade (se caiu muito, aperte o número)', () => {
        // Sem isto, o teto vira papel de parede: o débito some e ninguém percebe.
        const atual = contarPeso900EmTextoMiudo()
        expect(
            atual,
            `caiu para ${atual} — baixe TETO_PESO_900_EM_TEXTO_MIUDO e trave o ganho`,
        ).toBeGreaterThan(TETO_PESO_900_EM_TEXTO_MIUDO - 60)
    })
})

describe('o sistema existe e está ligado', () => {
    const globals = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8')
    const layout = readFileSync(join(SRC, 'app', 'layout.tsx'), 'utf8')

    it('a escala semântica está definida', () => {
        for (const util of ['@utility t-title', '@utility t-action', '@utility t-meta']) {
            expect(globals).toContain(util)
        }
    })

    it('os três níveis são de fato diferentes', () => {
        const pesos = [...globals.matchAll(/@utility t-\w+ \{[^}]*font-weight:\s*(\d+)/g)].map((m) => m[1])
        expect(new Set(pesos).size, 'níveis com o mesmo peso não são hierarquia').toBe(3)
    })

    it('o eixo óptico da Inter é carregado E usado', () => {
        // Um sem o outro não faz nada: pedir o eixo sem `font-optical-sizing`
        // baixa bytes à toa; usar sem pedir o eixo não tem efeito nenhum.
        expect(layout).toContain("axes: ['opsz']")
        expect(globals).toContain('font-optical-sizing: auto')
    })
})
