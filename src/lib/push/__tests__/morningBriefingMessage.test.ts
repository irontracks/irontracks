import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
    buildBriefingMessage,
    statsDeDatas,
    diaDaSemanaBrt,
    BRIEFING_GENERICO,
} from '@/lib/push/morningBriefingMessage'

/**
 * Briefing das 7h com dado real — ago/2026.
 *
 * O cron mandava a mesma string para todos ("Vai treinar hoje?"), enquanto o
 * app já sabia o nome do treino do dia e a sequência do usuário.
 */

// Segunda-feira, 10/08/2026, 09:00 UTC (06:00 BRT).
const SEGUNDA = new Date('2026-08-10T09:00:00.000Z')
const TITULOS = ['A - empurrar a (segunda)', 'B - puxar a (terça)', 'C - perna (quarta)']

describe('o treino de hoje é nomeado', () => {
    it('anuncia o treino que casa com o dia da semana', () => {
        const { title } = buildBriefingMessage({
            workoutTitles: TITULOS, daysSinceLastWorkout: 2, currentStreak: 0, now: SEGUNDA,
        })
        expect(title).toBe('Hoje: A - empurrar a (segunda)')
    })

    it('com sequência viva, a mensagem cita os dias', () => {
        const { message } = buildBriefingMessage({
            workoutTitles: TITULOS, daysSinceLastWorkout: 1, currentStreak: 5, now: SEGUNDA,
        })
        expect(message).toContain('5 dias seguidos')
    })

    it('sem treino do dia, oferece o próximo em vez de perguntar', () => {
        const { message } = buildBriefingMessage({
            workoutTitles: ['Treino sem dia no nome'], daysSinceLastWorkout: 2, currentStreak: 0, now: SEGUNDA,
        })
        expect(message).toContain('Próximo treino: Treino sem dia no nome')
        expect(message, 'a pergunta genérica é o que o usuário desliga')
            .not.toContain('Vai treinar hoje?')
    })

    it('sem treino nenhum, cai no genérico', () => {
        expect(buildBriefingMessage({
            workoutTitles: [], daysSinceLastWorkout: null, currentStreak: 0, now: SEGUNDA,
        })).toEqual(BRIEFING_GENERICO)
    })
})

describe('quem sumiu não recebe "hoje é dia de perna"', () => {
    it('ausência de 7+ dias tem prioridade sobre o treino do dia', () => {
        const { title, message } = buildBriefingMessage({
            workoutTitles: TITULOS, daysSinceLastWorkout: 12, currentStreak: 0, now: SEGUNDA,
        })
        expect(title).toBe('Faz um tempo 👋')
        expect(message).toContain('há 12 dias')
    })

    it('6 dias ainda é tratado como usuário ativo', () => {
        const { title } = buildBriefingMessage({
            workoutTitles: TITULOS, daysSinceLastWorkout: 6, currentStreak: 0, now: SEGUNDA,
        })
        expect(title).toBe('Hoje: A - empurrar a (segunda)')
    })
})

describe('fuso — a armadilha do servidor em UTC', () => {
    it('às 22h BRT de segunda, o dia ainda é segunda (o UTC já virou)', () => {
        // 2026-08-11T01:00Z = segunda 22:00 BRT. Sem o ajuste, `getDay()` em
        // UTC devolveria terça e o briefing anunciaria o treino errado.
        const noiteDeSegunda = new Date('2026-08-11T01:00:00.000Z')
        expect(diaDaSemanaBrt(noiteDeSegunda).getUTCDay(), 'segunda = 1').toBe(1)
        const { title } = buildBriefingMessage({
            workoutTitles: TITULOS, daysSinceLastWorkout: 1, currentStreak: 0, now: noiteDeSegunda,
        })
        expect(title).toBe('Hoje: A - empurrar a (segunda)')
    })
})

describe('sequência a partir das datas já carregadas', () => {
    it('conta dias consecutivos terminando ontem', () => {
        const r = statsDeDatas(['2026-08-07', '2026-08-08', '2026-08-09'], '2026-08-10')
        expect(r.currentStreak).toBe(3)
        expect(r.daysSinceLastWorkout).toBe(1)
    })

    it('sequência antiga não conta como viva', () => {
        // Treinou 3 dias seguidos, mas parou há 4 dias.
        const r = statsDeDatas(['2026-08-01', '2026-08-02', '2026-08-03'], '2026-08-10')
        expect(r.currentStreak, 'quem parou há 4 dias não tem sequência viva').toBe(0)
        expect(r.daysSinceLastWorkout).toBe(7)
    })

    it('dia repetido (dois treinos no mesmo dia) não infla a sequência', () => {
        const r = statsDeDatas(['2026-08-09', '2026-08-09', '2026-08-08'], '2026-08-10')
        expect(r.currentStreak).toBe(2)
    })

    it('sem datas, devolve zero e nulo', () => {
        expect(statsDeDatas([], '2026-08-10')).toEqual({ currentStreak: 0, daysSinceLastWorkout: null })
    })
})

describe('fiação no cron', () => {
    const route = readFileSync(
        join(__dirname, '..', '..', '..', 'app', 'api', 'cron', 'morning-briefing', 'route.ts'),
        'utf8',
    )

    it('a mensagem fixa saiu do cron', () => {
        expect(route, 'a string genérica não pode voltar hardcoded no envio')
            .not.toContain("message: 'Vai treinar hoje?")
    })

    it('o cron usa o construtor por usuário', () => {
        expect(route).toContain('buildBriefingMessage(')
        expect(route).toContain('statsDeDatas(')
    })

    it('a única query nova é a dos templates', () => {
        // Se alguém acrescentar um SELECT por usuário aqui, o cron passa a
        // fazer N queries — com 20.000 candidatos isso derruba o horário.
        const dentroDoMap = route.slice(route.indexOf('userIds.map((uid) => {'))
        expect(dentroDoMap, 'nada de I/O dentro do map por usuário').not.toMatch(/await\s/)
    })
})
