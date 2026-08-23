/**
 * Streak conta dias BRT, não dias UTC.
 *
 * Achado na auditoria das áreas de cálculo (23/08/2026). As duas rotas de
 * streak bucketavam com `toISOString().slice(0,10)` — dia UTC. Como a Vercel
 * roda em UTC, treino às 22h no Brasil cai no dia seguinte.
 *
 * Medido em produção antes de corrigir: 36 das 633 sessões (5,7%) caem em dia
 * diferente entre BRT e UTC, e quatro usuários tiveram dias colapsados ou
 * inventados na contagem.
 *
 * O caso decisivo é o do "treino da noite": duas sessões em dias BRT
 * consecutivos que, em UTC, viram o MESMO dia — a sequência de 2 vira 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildStreakDays, calcStreak, streakFromDates } from '../streak'

// 21h BRT = 00h UTC do dia seguinte. É a janela onde tudo acontece.
const noite = (diaBrt: string) => `${diaBrt}T23:30:00.000-03:00`
const tarde = (diaBrt: string) => `${diaBrt}T18:00:00.000-03:00`

afterEach(() => vi.useRealTimers())

describe('buildStreakDays — o dia é BRT', () => {
    it('treino às 23h30 de segunda conta na SEGUNDA, não na terça', () => {
        const days = buildStreakDays([noite('2026-08-17')])
        expect([...days]).toEqual(['2026-08-17'])
    })

    it('dois dias BRT consecutivos não colapsam num só (o dano medido)', () => {
        // Em UTC, 17/08 23h30 e 18/08 18h caem ambos em 18/08.
        const days = buildStreakDays([noite('2026-08-17'), tarde('2026-08-18')])
        expect(days.size).toBe(2)
    })

    it('descarta data ilegível sem derrubar o resto', () => {
        expect(buildStreakDays([null, undefined, 'nao-e-data', tarde('2026-08-18')]).size).toBe(1)
    })
})

describe('calcStreak', () => {
    const hoje = new Date('2026-08-20T15:00:00.000-03:00')

    it('conta a sequência que chega até hoje', () => {
        const days = new Set(['2026-08-20', '2026-08-19', '2026-08-18'])
        expect(calcStreak(days, hoje)).toBe(3)
    })

    it('sem treino hoje, ainda vale se treinou ontem — quem treina à noite não perde o streak durante o dia', () => {
        const days = new Set(['2026-08-19', '2026-08-18'])
        expect(calcStreak(days, hoje)).toBe(2)
    })

    it('parou há dois dias: a sequência ACABOU', () => {
        // O /social/profile contava a partir do dia mais recente do histórico,
        // fosse ele de ontem ou de seis meses atrás.
        const days = new Set(['2026-08-18', '2026-08-17', '2026-08-16'])
        expect(calcStreak(days, hoje)).toBe(0)
    })

    it('histórico antigo e longo não vira streak atual', () => {
        const days = new Set(['2026-03-01', '2026-02-28', '2026-02-27', '2026-02-26'])
        expect(calcStreak(days, hoje)).toBe(0)
    })

    it('buraco no meio corta a contagem', () => {
        const days = new Set(['2026-08-20', '2026-08-19', '2026-08-17'])
        expect(calcStreak(days, hoje)).toBe(2)
    })

    it('sem nenhum treino, zero', () => {
        expect(calcStreak(new Set(), hoje)).toBe(0)
    })
})

describe('ponta a ponta — o caso que o UTC quebrava', () => {
    it('treinou segunda 23h30 e terça 18h → streak 2', () => {
        const terca15h = new Date('2026-08-18T21:00:00.000-03:00')
        expect(streakFromDates([noite('2026-08-17'), tarde('2026-08-18')], terca15h)).toBe(2)
    })

    it('vale em qualquer dia da semana — teste de "hoje" varre a semana', () => {
        // Regra do repo: resultado que varia com o calendário se prova nos 7 dias.
        for (let i = 0; i < 7; i++) {
            const base = new Date('2026-08-17T20:00:00.000-03:00')
            base.setDate(base.getDate() + i)
            const d0 = base.toISOString().slice(0, 10)
            const ontem = new Date(base.getTime() - 86400000)
            const days = buildStreakDays([
                `${d0}T23:30:00.000-03:00`,
                `${ontem.toISOString().slice(0, 10)}T23:30:00.000-03:00`,
            ])
            expect(calcStreak(days, base), `dia ${i}`).toBe(2)
        }
    })
})

describe('guard de classe: nenhuma rota volta a bucketar dia em UTC', () => {
    it('as rotas de streak usam a fonte única', () => {
        const rotas = ['social/leaderboard/route.ts', 'social/profile/[userId]/route.ts']
        for (const rel of rotas) {
            const code = readFileSync(join(process.cwd(), 'src/app/api', rel), 'utf8')
            expect(code, `${rel} deve usar lib/social/streak`).toMatch(/from '@\/lib\/social\/streak'/)
            // O padrão exato do bug. Fora de comentário — o parser corta antes.
            const exec = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
            expect(exec, `${rel} não pode bucketar dia em UTC`).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/)
        }
    })

    it('a fonte única não reimplementa o dia — delega ao helper BRT do repo', () => {
        const code = readFileSync(join(process.cwd(), 'src/lib/social/streak.ts'), 'utf8')
        expect(code).toMatch(/from '@\/utils\/cron\/dateBrt'/)
    })
})
