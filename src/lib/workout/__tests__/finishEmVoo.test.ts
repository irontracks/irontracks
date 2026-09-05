import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    marcarFinishEmVoo,
    limparFinishEmVoo,
    finishEmVoo,
    JANELA_FINISH_EM_VOO_MS,
} from '../finishEmVoo'

/**
 * O relatório de fim de treino parava de abrir, INTERMITENTEMENTE, e o app caía
 * no dashboard sem erro nenhum — levando junto a celebração de finalização.
 *
 * A corrida está descrita no cabeçalho de `finishEmVoo.ts`. O que estes casos
 * travam é o INVARIANTE que faltava, não o formato de hoje: durante o finish
 * deste aparelho, o eco do DELETE não decide navegação.
 *
 * ⚠️ Por que não há teste de render aqui: reproduzir a corrida de verdade exige
 * montar `ActiveWorkout` inteiro (Supabase, providers de treino, Realtime,
 * framer-motion) e ainda encenar a chegada do evento dentro de uma janela de
 * 280 ms. O que se mediria seria o harness. O comportamento foi conferido no
 * simulador, no aparelho, contra produção; aqui ficam a REGRA (função pura) e a
 * FIAÇÃO (source-guard das três pontas), que é o que apodrece sozinho.
 */
const SRC = join(__dirname, '..', '..', '..')
const leia = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

describe('o sinal de finish em voo', () => {
    beforeEach(() => { limparFinishEmVoo() })
    afterEach(() => { vi.useRealTimers(); limparFinishEmVoo() })

    it('nasce desligado — sem finish, o eco do DELETE segue mandando', () => {
        expect(finishEmVoo()).toBe(false)
    })

    it('vale enquanto o finish está em voo', () => {
        marcarFinishEmVoo(1_000)
        expect(finishEmVoo(1_000)).toBe(true)
        expect(finishEmVoo(1_000 + JANELA_FINISH_EM_VOO_MS - 1)).toBe(true)
    })

    /**
     * Marca presa para sempre calaria o aviso legítimo de "treino finalizado em
     * outro dispositivo" — o teto existe para o caso em que a navegação falha e
     * ninguém chega a limpar.
     */
    it('expira sozinho', () => {
        marcarFinishEmVoo(1_000)
        expect(finishEmVoo(1_000 + JANELA_FINISH_EM_VOO_MS)).toBe(false)
    })

    it('a janela cobre POST lento + animação de saída + commit da rota', () => {
        expect(JANELA_FINISH_EM_VOO_MS).toBeGreaterThanOrEqual(10_000)
    })

    it('limpar encerra na hora', () => {
        marcarFinishEmVoo(1_000)
        limparFinishEmVoo()
        expect(finishEmVoo(1_001)).toBe(false)
    })
})

describe('a fiação das três pontas', () => {
    const finish = leia('components/workout/hooks/useWorkoutFinish.ts')
    const sync = leia('hooks/useSessionSync.ts')
    const crud = leia('hooks/useWorkoutCrud.ts')

    /**
     * ⚠️ ANTES do POST, e este é o ponto do módulo inteiro. É a rota que apaga
     * `active_workout_sessions`, então marcar depois dela chegaria tarde: o eco
     * já estaria a caminho. Marcar depois compila, passa em todo teste de
     * unidade e reintroduz o bug inteiro.
     */
    it('a marca é gravada ANTES do POST que apaga a sessão ativa', () => {
        const iMarca = finish.indexOf('marcarFinishEmVoo()')
        const iPost = finish.indexOf("fetch('/api/workouts/finish'")
        expect(iMarca, 'a marca sumiu do fluxo de finish').toBeGreaterThan(0)
        expect(iPost, 'o POST do finish sumiu').toBeGreaterThan(0)
        expect(iMarca, 'marcar depois do POST perde a corrida — o eco já saiu').toBeLessThan(iPost)
    })

    /**
     * O caso que reproduz o defeito: era esta linha que levava o app pro
     * dashboard no meio da animação de saída.
     */
    it('o eco do próprio finish não navega para o dashboard', () => {
        const i = sync.indexOf("setView((prev: string) => (prev === 'active' ? 'dashboard' : prev))")
        expect(i, 'a navegação do handler de DELETE sumiu').toBeGreaterThan(0)
        const guarda = sync.slice(Math.max(0, i - 400), i)
        expect(
            guarda,
            'o setView do DELETE precisa estar atrás de `if (!meuProprioFinish)` — sem isso o ' +
            'ActiveWorkout desmonta no meio dos 280ms e o setView(report) é cancelado',
        ).toMatch(/if \(!meuProprioFinish\)/)
    })

    it('o eco do próprio finish também não acusa "finalizado em outro dispositivo"', () => {
        expect(sync).toMatch(/wasForeign\s*=\s*!!activeSessionRef\.current\s*&&\s*!meuProprioFinish/)
    })

    it('a marca é encerrada quando a navegação commita', () => {
        const iView = crud.indexOf("setView('report')")
        expect(iView, "o setView('report') sumiu do finish").toBeGreaterThan(0)
        expect(crud.slice(iView, iView + 400)).toMatch(/limparFinishEmVoo\(\)/)
    })
})

describe('a animação de saída não engole a navegação', () => {
    const active = leia('components/ActiveWorkout.tsx')

    /**
     * O cleanup só cancelava o timer. Qualquer desmontagem dentro dos 280 ms
     * descartava a transição em silêncio — é a CLASSE do defeito, e ela
     * sobrevive à correção da causa específica.
     */
    it('a desmontagem executa o callback obrigatório em vez de descartá-lo', () => {
        const i = active.indexOf('exitCbObrigatorioRef')
        expect(i, 'a ref do callback obrigatório sumiu').toBeGreaterThan(0)
        const cleanup = active.slice(active.indexOf('React.useEffect(() => () => {'))
        const bloco = cleanup.slice(0, 600)
        expect(bloco).toMatch(/clearTimeout\(exitTimerRef\.current\)/)
        expect(bloco, 'o cleanup voltou a só cancelar o timer').toMatch(/cb\(\)/)
    })

    it('o finish é marcado como obrigatório; o voltar não', () => {
        const onFinish = active.match(/onFinish: originalOnFinish[\s\S]{0,400}?\n\s{6}\/\//)?.[0] ?? ''
        expect(onFinish, 'o wrapper de onFinish sumiu').toContain('triggerExit(')
        expect(onFinish, 'o finish precisa ser obrigatório — é a navegação que se perdia').toMatch(/\}, true\)/)
        // `_exitOnBack` fora de propósito: um "voltar" atrasado navegaria por
        // cima do destino que o usuário já alcançou por outro caminho.
        const onBack = active.match(/_exitOnBack: \(\) => triggerExit\([^)]*\)/)?.[0] ?? ''
        expect(onBack, 'o atalho de voltar sumiu').toBeTruthy()
        expect(onBack).not.toMatch(/,\s*true/)
    })
})
