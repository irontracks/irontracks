import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { brtDateKey } from '@/utils/cron/dateBrt'

/**
 * A cota DIÁRIA vira à meia-noite de Brasília, não à de Londres.
 *
 * Até 28/08/2026 os quatro pontos de contagem em `utils/vip/limits.ts` usavam
 * `new Date().toISOString().split('T')[0]` — o dia UTC. Na prática a cota
 * virava às 21h BRT: quem usasse a IA às 21h30 consumia a cota do dia seguinte,
 * e quem estourasse às 20h50 esperava dez minutos para ter cota nova. Medido em
 * produção: 12 de 186 usos (6,5%) caíam nessa janela — e é Gemini pago.
 *
 * O efeito pior era silencioso: o REEMBOLSO usava a mesma conta. Consumo às
 * 20h59 gravava o dia X; o reembolso às 21h01 procurava X+1, não achava a linha
 * e a cota não voltava para quem não recebeu resposta.
 *
 * O reset SEMANAL já era BRT (`weekReset.ts`, segunda 03:00) — era o dia que
 * estava fora de linha, no mesmo arquivo.
 */

const LIMITS = readFileSync(join(process.cwd(), 'src/utils/vip/limits.ts'), 'utf8')
const semComentarios = LIMITS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

describe('o dia da cota é BRT', () => {
    it('nenhuma contagem usa o dia UTC', () => {
        expect(
            semComentarios,
            'volte a usar `brtDateKey()` — o dia UTC faz a cota virar às 21h de Brasília',
        ).not.toMatch(/toISOString\(\)\.split\('T'\)\[0\]/)
    })

    it('consumo e reembolso usam a MESMA conta de dia', () => {
        // Se divergirem, o reembolso procura uma linha que não existe e a cota
        // não volta — sem erro nenhum na tela.
        const chamadas = semComentarios.match(/const today = [^\n]+/g) ?? []
        expect(chamadas.length, 'os pontos de contagem sumiram').toBeGreaterThanOrEqual(4)
        for (const c of chamadas) expect(c).toContain('brtDateKey()')
    })
})

describe('brtDateKey — a fronteira que importa', () => {
    it('21h de Brasília ainda é HOJE, mesmo já sendo amanhã em UTC', () => {
        // 2026-08-29T00:30:00Z = 28/08 21:30 em São Paulo.
        expect(brtDateKey(new Date('2026-08-29T00:30:00Z'))).toBe('2026-08-28')
    })

    it('a virada acontece à meia-noite BRT', () => {
        // 03:00Z = 00:00 BRT do dia 29.
        expect(brtDateKey(new Date('2026-08-29T02:59:00Z'))).toBe('2026-08-28')
        expect(brtDateKey(new Date('2026-08-29T03:00:00Z'))).toBe('2026-08-29')
    })
})
