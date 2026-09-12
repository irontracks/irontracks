/**
 * O START ▶ do professor — o botão que faltava no fim do descanso.
 *
 * PEDIDO (12/09/2026): "no treino normal do aluno, quando termina o descanso e
 * não está no automático, precisa clicar no start para iniciar a contagem de
 * tempo daquela série — eu preciso ter esse controle aqui".
 *
 * Duas metades, e nenhuma prova a outra: a DECISÃO (o que o patch escreve) e a
 * FIAÇÃO (o modal usar a decisão, e a barra continuar na tela depois que o
 * descanso vence). O módulo passa verde sozinho com o botão desconectado — é o
 * jeito nº 3 da lista de guards falsos.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
    iniciarSerieRemota,
    segundosAlemDoPlanejado,
    descansoNaTela,
} from '@/lib/workout/descansoRemoto'

const AGORA = 1_760_000_000_000

const sessaoBase = (over: Record<string, unknown> = {}) => ({
    timerContext: { kind: 'rest', key: '0-1', nextKey: '0-2', restStartedAtMs: AGORA - 92_000 },
    logs: { '0-1': { done: true, weight: '80', reps: '10' } },
    ui: { algoQueJaExistia: true },
    ...over,
})

describe('o patch que o START escreve', () => {
    it('encerra o descanso no aparelho do aluno', () => {
        const patch = iniciarSerieRemota(sessaoBase(), AGORA)
        expect(patch.timerTargetTime).toBeNull()
        expect(patch.timerContext).toBeNull()
    })

    it('grava quanto o descanso REALMENTE durou na série que acabou', () => {
        // 92 s medidos, não os 90 s planejados: é o dado que alimenta a duração
        // da sessão e a estimativa de calorias.
        const patch = iniciarSerieRemota(sessaoBase(), AGORA)
        expect((patch.logs['0-1'] as Record<string, unknown>).restSeconds).toBe(92)
    })

    it('não apaga o que já estava anotado na série concluída', () => {
        const patch = iniciarSerieRemota(sessaoBase(), AGORA)
        const log = patch.logs['0-1'] as Record<string, unknown>
        expect(log.weight).toBe('80')
        expect(log.reps).toBe('10')
        expect(log.done).toBe(true)
    })

    it('carimba o começo da PRÓXIMA série e marca a execução em curso', () => {
        const patch = iniciarSerieRemota(sessaoBase(), AGORA)
        expect((patch.logs['0-2'] as Record<string, unknown>).startedAtMs).toBe(AGORA)
        expect(patch.ui.activeExecution).toEqual({ key: '0-2', startedAtMs: AGORA })
    })

    it('preserva o resto do `ui` — o patch não é uma substituição', () => {
        const patch = iniciarSerieRemota(sessaoBase(), AGORA)
        expect(patch.ui.algoQueJaExistia).toBe(true)
    })

    it('série já concluída NÃO é recarimbada', () => {
        // O professor pode tocar START depois de já ter concluído a próxima:
        // reabrir a execução dela faria o app do aluno contar tempo de uma
        // série que acabou.
        const patch = iniciarSerieRemota(
            sessaoBase({ logs: { '0-2': { done: true, weight: '80' } } }),
            AGORA,
        )
        expect((patch.logs['0-2'] as Record<string, unknown>).startedAtMs).toBeUndefined()
        expect(patch.ui.activeExecution).toBeUndefined()
    })

    it('sem `nextKey` o START só encerra o descanso', () => {
        // Vários métodos avançados abrem o descanso com `nextKey: null`.
        // Inventar uma próxima série aqui criaria log de série que ninguém fará.
        const patch = iniciarSerieRemota(
            sessaoBase({
                timerContext: { kind: 'rest', key: '0-1', nextKey: null, restStartedAtMs: AGORA - 30_000 },
            }),
            AGORA,
        )
        expect(patch.timerTargetTime).toBeNull()
        expect(patch.ui.activeExecution).toBeUndefined()
        expect(Object.keys(patch.logs)).toEqual(['0-1'])
    })

    it('sem `restStartedAtMs` cai no carimbo de conclusão da série', () => {
        const patch = iniciarSerieRemota(
            sessaoBase({
                timerContext: { kind: 'rest', key: '0-1', nextKey: '0-2' },
                logs: { '0-1': { done: true, completedAtMs: AGORA - 45_000 } },
            }),
            AGORA,
        )
        expect((patch.logs['0-1'] as Record<string, unknown>).restSeconds).toBe(45)
    })

    it('sem nenhuma base de tempo NÃO inventa um descanso', () => {
        const patch = iniciarSerieRemota(
            sessaoBase({ timerContext: { kind: 'rest', key: '0-1', nextKey: '0-2' }, logs: { '0-1': { done: true } } }),
            AGORA,
        )
        expect((patch.logs['0-1'] as Record<string, unknown>).restSeconds).toBeUndefined()
    })

    it('relógio inválido encerra o descanso e não carimba nada', () => {
        const patch = iniciarSerieRemota(sessaoBase(), 0)
        expect(patch.timerTargetTime).toBeNull()
        expect((patch.logs['0-1'] as Record<string, unknown>).restSeconds).toBeUndefined()
        expect(patch.ui.activeExecution).toBeUndefined()
    })

    it('sessão sem logs nem ui não quebra', () => {
        const patch = iniciarSerieRemota({ timerContext: { key: '0-0', nextKey: '0-1', restStartedAtMs: AGORA - 1000 } }, AGORA)
        expect((patch.logs['0-1'] as Record<string, unknown>).startedAtMs).toBe(AGORA)
    })
})

describe('a barra do professor sobrevive ao fim do descanso', () => {
    it('o alvo vencido continua sendo "descanso na tela"', () => {
        // Com o auto-start desligado a tela do aluno FICA aberta em tempo extra
        // esperando o START. Se a barra do professor decidisse por "ainda está
        // correndo", ela sumiria justamente no instante de agir.
        expect(descansoNaTela(AGORA - 10_000)).toBe(true)
        expect(descansoNaTela(null)).toBe(false)
        expect(descansoNaTela(0)).toBe(false)
    })

    it('o tempo extra conta a partir do alvo, e nunca é negativo', () => {
        expect(segundosAlemDoPlanejado(AGORA - 12_000, AGORA)).toBe(12)
        expect(segundosAlemDoPlanejado(AGORA + 30_000, AGORA)).toBe(0)
        expect(segundosAlemDoPlanejado(null, AGORA)).toBe(0)
    })
})

describe('fiação: o modal do professor usa a decisão', () => {
    const src = readFileSync(
        path.join(process.cwd(), 'src/components/teacher/TeacherControlModal.tsx'),
        'utf8',
    )
    const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

    it('existe um controle com NOME para iniciar a série', () => {
        // Ancorado no rótulo acessível, que é o que FICA — não na classe do
        // botão nem no texto decorativo.
        expect(semComentarios).toMatch(/aria-label="Iniciar a série do aluno"/)
        expect(semComentarios, 'o nome é o mesmo que o aluno vê').toMatch(/START ▶/)
    })

    it('o botão chama a fonte única, não um patch montado à mão', () => {
        expect(semComentarios).toMatch(/iniciarSerieRemota\(prev, agoraMs\)/)
    })

    it('o patch vai IMEDIATO — o aluno está parado esperando', () => {
        const i = semComentarios.indexOf('const iniciarSerie = useCallback')
        expect(i, 'o handler do START sumiu').toBeGreaterThan(0)
        const corpo = semComentarios.slice(i, i + 600)
        expect(corpo).toMatch(/imediato: true/)
    })

    it('⚠️ o relógio é lido no HANDLER, nunca dentro do updater', () => {
        const i = semComentarios.indexOf('const iniciarSerie = useCallback')
        const corpo = semComentarios.slice(i, i + 600)
        const updater = corpo.indexOf('patchState(')
        expect(updater).toBeGreaterThan(0)
        expect(corpo.slice(0, updater), 'o `Date.now()` precisa vir ANTES do updater').toContain('Date.now()')
        expect(
            corpo.slice(updater),
            'relógio dentro do updater: com flush imediato ele roda duas vezes e os dois ' +
            'aparelhos ficam com carimbos diferentes.',
        ).not.toContain('Date.now()')
    })

    it('a barra fica na tela enquanto o ALVO existir, não enquanto ele corre', () => {
        const i = semComentarios.indexOf('function BarraDeDescansoRemoto')
        const fim = semComentarios.indexOf('interface TeacherControlModalProps')
        const barra = semComentarios.slice(i, fim)
        expect(i, 'a barra sumiu').toBeGreaterThan(0)
        expect(barra, 'a saída antecipada da barra precisa ser pelo alvo existir').toMatch(
            /if \(!naTela\) return null/,
        )
        expect(barra).toMatch(/const naTela = descansoNaTela\(timerTargetTime\)/)
    })

    it('a barra oferece o START junto do tempo — um lugar só', () => {
        const i = semComentarios.indexOf('function BarraDeDescansoRemoto')
        const fim = semComentarios.indexOf('interface TeacherControlModalProps')
        const barra = semComentarios.slice(i, fim)
        expect(barra).toMatch(/onClick=\{onIniciar\}/)
    })
})
