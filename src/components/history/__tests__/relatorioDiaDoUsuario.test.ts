import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/**
 * "Dias treinados" e "consistência" contavam o dia em UTC.
 *
 * O relatório de período — o arquivo que a pessoa manda ao professor — usava
 * `new Date(t).toISOString().slice(0, 10)` para agrupar sessões por dia. A
 * Vercel roda em UTC, então **todo treino depois das 21h BRT contava no dia
 * seguinte**: dois treinos na mesma noite viravam dois dias distintos, e a
 * consistência saía inflada.
 *
 * É a MESMA classe já corrigida duas vezes neste repo — no streak (medido:
 * 36 de 633 sessões em dia divergente, 4 usuários com contagem errada) e no
 * heatmap de nutrição. A fonte única `brtDateKey` existe desde então.
 */

// A conta mora em `periodStats.ts` desde 02/09/2026 (o hook delega; o dossiê reusa).
const hook = readFileSync('src/utils/report/periodStats.ts', 'utf8')
const executavel = hook.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

describe('o dia do relatório é o dia do usuário', () => {
    it('a chave de dia vem de brtDateKey, não do UTC', () => {
        expect(executavel).toMatch(/brtDateKey\(/)
        expect(executavel).toMatch(/from '@\/utils\/cron\/dateBrt'/)
    })

    it('nenhum agrupamento por dia usa toISOString', () => {
        // O que importa é o bloco que alimenta `uniqueDays` — é dele que saem
        // "dias treinados" e a consistência.
        const i = executavel.indexOf('uniqueDays.add')
        const bloco = executavel.slice(Math.max(0, i - 400), i + 60)
        expect(bloco).not.toMatch(/toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/)
        expect(bloco).toMatch(/brtDateKey/)
    })

    it('dia vazio não entra na contagem', () => {
        // `brtDateKey` devolve '' para data inválida; sem a guarda, o vazio
        // vira um "dia treinado" fantasma.
        const i = executavel.indexOf('uniqueDays.add')
        expect(executavel.slice(Math.max(0, i - 120), i)).toMatch(/if \(dayKey\)/)
    })
})

describe('a saída do relatório é alcançável', () => {
    const report = readFileSync('src/components/WorkoutReport.tsx', 'utf8')

    it('o botão Fechar tem alvo de toque', () => {
        // Era o ÚNICO botão da barra sem `tap-44`: só texto de 14px, ~20px de
        // altura — e é a única saída da tela cheia.
        const i = report.indexOf('onClick={onClose}')
        const bloco = report.slice(i, report.indexOf('>', report.indexOf('className=', i)))
        expect(bloco).toMatch(/tap-44/)
    })
})

describe('os eyebrows do resumo têm um tratamento só', () => {
    const cards = readFileSync('src/components/workout-report/ReportSummaryCards.tsx', 'utf8')

    it('nenhum rótulo usa cor de acento com alpha', () => {
        // `orange-500/70` mede 3,91:1 — abaixo do AA — e a cor não codificava
        // nada: os quatro rótulos são o mesmo nível hierárquico.
        const rotulos = [...cards.matchAll(/uppercase tracking-widest (text-[\w-]+(?:\/\d+)?)"/g)].map((m) => m[1])
        expect(rotulos.length).toBeGreaterThanOrEqual(4)
        expect(new Set(rotulos), `tratamentos diferentes no mesmo nível: ${[...new Set(rotulos)].join(', ')}`).toEqual(new Set(['text-neutral-400']))
    })
})
