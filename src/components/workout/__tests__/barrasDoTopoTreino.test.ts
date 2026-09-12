/**
 * Faixa de aviso no topo do treino ativo vai NO FLUXO, nunca `fixed`.
 *
 * Esta regra custou TRÊS rodadas de correção no mesmo dia (12/09/2026), e o
 * valor dela está justamente nisso: cada tentativa geométrica só trocava a
 * vítima da sobreposição.
 *
 * 1. O banner de consentimento do professor era `fixed` no topo ABSOLUTO da
 *    viewport e caía sobre o `WorkoutHeader`. Com fundo de 12% de opacidade os
 *    dois textos se sobrepunham e os botões Aceitar/Recusar ficavam empilhados
 *    sobre os do header. Num convite REAL o toque errou o alvo e RECUSOU.
 * 2. Passou a se posicionar pela altura do HEADER — e caiu sobre a TIRA de
 *    navegação, que é IRMÃ do header e igualmente fixa no topo.
 * 3. Passou a se posicionar pelo `top` do contêiner que rola — e caiu sobre o
 *    primeiro card da lista ("Carga automática").
 *
 * ⚠️ A conclusão não é "faltou medir melhor": **faixa `fixed` SEMPRE flutua
 * sobre alguma coisa.** No fluxo ela EMPURRA, nada fica escondido, e não há
 * geometria a acertar. Armadilha ELIMINADA em vez de documentada — que é o que
 * o `CLAUDE.md` pede quando dá para eliminar.
 *
 * (O rodapé é outro caso e continua com `--it-rest-bar-h`: lá a barra do
 * descanso PRECISA flutuar sobre a lista, e quem cede é o rodapé.)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()
const ler = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')

/** Comentário não é código: sem isto o guard acusa a própria explicação (jeito nº 2). */
const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const ATIVO = 'src/components/ActiveWorkout.tsx'
const SHELL = 'src/app/(app)/dashboard/IronTracksAppClientImpl.tsx'
const CONSENTIMENTO = 'src/components/teacher/StudentControlConsent.tsx'

describe('o consentimento do professor mora no FLUXO do treino', () => {
    const ativo = semComentarios(ler(ATIVO))

    it('é renderizado dentro do ActiveWorkout, depois da tira', () => {
        const rail = ativo.indexOf('<WorkoutExerciseRail')
        const banner = ativo.indexOf('<StudentControlConsent')
        const conteudo = ativo.indexOf('overflow-y-auto')
        expect(rail, 'a tira sumiu do ActiveWorkout').toBeGreaterThan(0)
        expect(banner, 'o consentimento não está no fluxo do treino').toBeGreaterThan(0)
        expect(
            banner > rail && banner < conteudo,
            'o consentimento precisa ficar ENTRE a tira e o conteúdo rolável: antes da ' +
            'tira ele empurra a navegação, depois do conteúdo ele rola para fora da vista.',
        ).toBe(true)
    })

    it('o próprio componente não se fixa na tela', () => {
        const src = semComentarios(ler(CONSENTIMENTO))
        expect(
            src,
            'o banner de consentimento não pode ser `fixed`: no fluxo ele empurra, ' +
            'fixado ele cobre — e cada correção geométrica só troca a vítima.',
        ).not.toMatch(/className="[^"]*\bfixed\b/)
    })
})

describe('o shell não fixa faixas no topo do treino', () => {
    /**
     * Faixas fixas no topo declaradas como aceitáveis, com o motivo.
     * Nasce VAZIA. Cada entrada é a decisão consciente de que aquele elemento
     * pode cobrir o header, a tira e o primeiro card da lista.
     */
    const PODE_FLUTUAR_NO_TOPO: Array<{ trecho: string; porque: string }> = []

    it('nenhum `fixed` ancorado por `top` no shell', () => {
        const src = semComentarios(ler(SHELL))
        const fixadosNoTopo = [...src.matchAll(/className="[^"]*\bfixed\b[^"]*"[^>]*style=\{\{\s*top:\s*([^}]+)\}\}/g)]
            .map((m) => m[1].trim())

        const naoDeclarados = fixadosNoTopo.filter(
            (top) => !PODE_FLUTUAR_NO_TOPO.some((e) => top.includes(e.trecho)),
        )

        expect(
            naoDeclarados,
            'Faixa fixa ancorada no topo: ela vai cobrir o header, a tira OU o primeiro ' +
            'card da lista — as três vítimas já aconteceram, em rodadas sucessivas. ' +
            'Renderize no FLUXO (dentro do ActiveWorkout, depois da tira) ou declare em ' +
            'PODE_FLUTUAR_NO_TOPO dizendo o que ela pode cobrir.',
        ).toEqual([])
    })

    it('o consentimento chega ao treino por prop, não por render paralelo', () => {
        const shell = semComentarios(ler(SHELL))
        expect(shell).toContain('controlConsent={')
        // E o shell não pode voltar a montar o banner por conta própria.
        expect(
            shell,
            'o shell voltou a renderizar o consentimento fora do fluxo do treino',
        ).not.toContain('<StudentControlConsent')
    })

    it('o extrator enxerga um fixo no topo (auto-teste — guard que não pega é guard falso)', () => {
        const sabotado = `<div className="fixed inset-x-0 z-[60]" style={{ top: 'max(env(safe-area-inset-top, 0px), 56px)' }}>`
        const achados = [...sabotado.matchAll(/className="[^"]*\bfixed\b[^"]*"[^>]*style=\{\{\s*top:\s*([^}]+)\}\}/g)]
        expect(achados).toHaveLength(1)
    })
})
