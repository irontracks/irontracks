import { describe, it, expect } from 'vitest'
import { extrairMetodo, temMetodo, notaAoTrocar, juntarNota, MAX_NOTA_CHARS } from '../exerciseNote'

/**
 * O invariante que importa: trocar o exercício NÃO pode apagar a configuração
 * de série avançada que mora dentro do `notes`.
 *
 * O `ExerciseCard` parseia `"SST na última: Falha > 10s > Falha"` para
 * `{restSec, miniCount, targetSetIdx}` e usa isso em 4 pontos do render. São 62
 * das 384 notas de produção (16%) com marcação de método. Se a nota da IA
 * entrar por cima, o Rest-Pause do usuário some sem aviso.
 */
describe('preserva o método ao trocar de exercício', () => {
    it('mantém a configuração de SST, que o card parseia', () => {
        const antiga = 'Leg press com pés altos na plataforma. SST na última: Falha > 10s > Falha > 10s > Falha'
        const preservado = notaAoTrocar(antiga)
        expect(preservado).toContain('SST na última')
        expect(preservado).toContain('10s')
        // E o que era do APARELHO antigo não sobrevive.
        expect(preservado).not.toMatch(/plataforma|pés altos/i)
    })

    it.each([
        ['drop-set na última série', /drop/i],
        ['Rest-pause: 3 blocos de 5', /rest.?pause/i],
        ['Bi-set com a cadeira extensora', /bi.?set/i],
        ['Cluster de 3x3 com 15s', /cluster/i],
    ])('reconhece %s', (nota, esperado) => {
        expect(temMetodo(nota)).toBe(true)
        expect(extrairMetodo(nota)).toMatch(esperado)
    })

    it('nota puramente descritiva não deixa resíduo — é o caso dos 84%', () => {
        const antiga = 'Alinhe o joelho ao eixo da máquina e mantenha quadril e costas apoiados.'
        expect(temMetodo(antiga)).toBe(false)
        // Vazio é melhor que mentiroso: a técnica do aparelho antigo some inteira.
        expect(notaAoTrocar(antiga)).toBe('')
    })

    it('nota vazia ou ausente não quebra', () => {
        for (const v of [null, undefined, '', '   ']) {
            expect(notaAoTrocar(v)).toBe('')
            expect(temMetodo(v)).toBe(false)
        }
    })

    /**
     * `matchAll` com /g e `.test` com /g se comportam diferente: o segundo
     * guarda `lastIndex` entre chamadas e alterna resultado para a MESMA
     * entrada. Este caso trava a escolha.
     */
    it('é estável ao ser chamado repetidas vezes com a mesma nota', () => {
        const nota = 'Drop-set na última série'
        const r = [extrairMetodo(nota), extrairMetodo(nota), extrairMetodo(nota)]
        expect(new Set(r).size).toBe(1)
        expect(r[0]).toBeTruthy()
    })
})

describe('junta método e técnica', () => {
    it('põe o método na frente — o card corta em duas linhas quando fechado', () => {
        const r = juntarNota('SST na última: Falha > 10s > Falha', 'Controle a volta do peso.')
        expect(r.indexOf('SST')).toBeLessThan(r.indexOf('Controle'))
    })

    it('respeita o teto de caracteres', () => {
        const r = juntarNota('SST na última', 'x'.repeat(500))
        expect(r.length).toBeLessThanOrEqual(MAX_NOTA_CHARS)
    })

    it('sem método, devolve só a técnica; sem técnica, só o método', () => {
        expect(juntarNota('', 'Só a técnica.')).toBe('Só a técnica.')
        expect(juntarNota('Drop-set', '')).toBe('Drop-set')
    })
})
