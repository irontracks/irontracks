import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * "Limpar antigos" arquivava treinos em massa sem perguntar nada.
 *
 * `onClick={cleanupOld}` disparava a rota direto. Ela arquiva TODOS os
 * templates `VIP •` do usuário que não pertencem ao programa ativo — teto de
 * 2.000 numa chamada. Um toque, e a lista de treinos muda sem o usuário saber
 * o que saiu nem quantos.
 *
 * Arquivar é reversível (`archived_at`, e os treinos reaparecem em ARQUIVADOS),
 * e é por isso que a confirmação NÃO é `destructive`: o vermelho é o pigmento
 * de alarme do app, e gastá-lo no que tem volta deixa sem cor o que não tem.
 * O que a confirmação precisa dar é o ESCOPO e a REVERSIBILIDADE — os dois
 * fatos que mudam a decisão.
 */

const SRC = readFileSync(join('src', 'components', 'vip', 'VipPeriodizationPanel.tsx'), 'utf8')

/**
 * O CORPO de `cleanupOld`, fatiado pela declaração e terminado no fecho do
 * `useCallback`. Fatiar pelo nome solto pegaria a linha do `onClick` e mediria
 * a região errada — o erro de guard que este repo já registrou.
 */
const corpoDoCleanup = (() => {
    const inicio = SRC.indexOf('const cleanupOld = useCallback(')
    if (inicio === -1) return ''
    const fim = SRC.indexOf('\n  }, [', inicio)
    return fim === -1 ? '' : SRC.slice(inicio, fim)
})()

describe('arquivar em massa pergunta antes', () => {
    it('o guard encontrou o handler', () => {
        expect(corpoDoCleanup).not.toBe('')
        expect(corpoDoCleanup).toContain('cleanupPeriodization')
    })

    it('confirma ANTES de escrever qualquer coisa', () => {
        const pergunta = corpoDoCleanup.indexOf('await confirm(')
        const escreve = corpoDoCleanup.indexOf('cleanupPeriodization')
        expect(pergunta, 'nenhuma confirmação no caminho').toBeGreaterThan(-1)
        expect(pergunta).toBeLessThan(escreve)
    })

    it('recusar interrompe — não basta perguntar', () => {
        // Sem o `return`, a confirmação vira enfeite: o usuário diz "Manter" e
        // os treinos são arquivados do mesmo jeito.
        expect(corpoDoCleanup).toMatch(/if \(!ok\) return/)
    })

    it('a mensagem diz o que sai, o que fica e que dá para voltar', () => {
        expect(corpoDoCleanup).toMatch(/periodizações anteriores/)
        expect(corpoDoCleanup).toMatch(/plano atual ficam/)
        expect(corpoDoCleanup, 'reversibilidade é o fato que muda a decisão').toMatch(/desarquivar/)
    })

    /**
     * Polaridade: o `confirm` resolve `false` ao fechar por fora, então a AÇÃO
     * precisa ser o `confirmText`. Invertido, um toque fora do diálogo
     * arquivaria a lista inteira — a mesma regra do descartar-treino.
     */
    it('a ação é o botão de confirmar, não o de cancelar', () => {
        expect(corpoDoCleanup).toMatch(/confirmText: 'Arquivar'/)
        expect(corpoDoCleanup).toMatch(/cancelText: 'Manter'/)
    })

    it('não gasta o vermelho no que é reversível', () => {
        expect(corpoDoCleanup).not.toMatch(/destructive: true/)
    })
})

describe('o diálogo tem provider na árvore', () => {
    /**
     * `useDialog` LANÇA fora de um `DialogProvider` — usá-lo aqui derrubaria a
     * aba VIP inteira se o pai não tivesse o contexto. O único pai é o VipHub,
     * que já usa `useDialog` (é o que prova o provider). Se alguém tirar de lá
     * ou montar o painel em outro lugar, este caso avisa antes da tela quebrar.
     */
    it('o único pai do painel usa dialog', () => {
        const hub = readFileSync(join('src', 'components', 'VipHub.tsx'), 'utf8')
        expect(hub).toContain('VipPeriodizationPanel')
        expect(hub, 'sem provider na árvore, useDialog no painel quebra a aba VIP').toMatch(/useDialog\(\)/)
    })
})
