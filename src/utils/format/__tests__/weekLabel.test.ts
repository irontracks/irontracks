/**
 * Rótulo da semana + frase de insights pendentes do Mapa Muscular.
 *
 * Os dois casos vieram de uma pergunta do dono (19/08/2026) diante do card:
 * o cabeçalho dizia "16/08–22/08" para a semana que começa em 17/08 (segunda,
 * conferido no banco), e a caixa da IA dizia "Sem insights suficientes para
 * essa semana" com 4 treinos registrados.
 *
 * O relógio é FIXADO em todos os casos que dependem de "hoje": teste que muda
 * de resultado conforme o dia não é flaky — é teste que às vezes não testa
 * nada (regra do repo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatIsoDayShort, formatWeekRangeLabel, insightsPendingMessage } from '../weekLabel'

// `useFakeTimers` explícito: sem ele o `setSystemTime` depende de detalhe do
// runner, e um teste sobre "hoje" que não fixa o relógio passa sozinho no dia
// certo — foi assim que o caso do MyDietPlan escondeu bug de produto.
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('rótulo da semana — dia-calendário não vira timestamp', () => {
  it('a semana que começa na segunda 17/08 aparece como 17/08–23/08', () => {
    expect(formatWeekRangeLabel('2026-08-17', '2026-08-23')).toBe('17/08–23/08')
  })

  it('não depende do fuso do aparelho', () => {
    // A implementação antiga fazia `new Date(iso + 'T00:00:00.000Z')` e
    // formatava no fuso local: em São Paulo (UTC−3) isso recua um dia. Aqui a
    // string é cortada, então mudar o TZ do processo não muda o resultado.
    const tz = process.env.TZ
    try {
      process.env.TZ = 'America/Sao_Paulo'
      expect(formatWeekRangeLabel('2026-08-17', '2026-08-23')).toBe('17/08–23/08')
      process.env.TZ = 'Pacific/Kiritimati' // UTC+14, erra para o outro lado
      expect(formatWeekRangeLabel('2026-08-17', '2026-08-23')).toBe('17/08–23/08')
    } finally {
      process.env.TZ = tz
    }
  })

  it('vira do mês e do ano continuam corretos', () => {
    expect(formatWeekRangeLabel('2026-12-28', '2027-01-03')).toBe('28/12–03/01')
  })

  it('entrada vazia ou inválida degrada sem quebrar', () => {
    expect(formatWeekRangeLabel('', '2026-08-23')).toBe('Semana')
    expect(formatIsoDayShort('qualquer coisa')).toBe('qualquer coisa')
  })
})

describe('insights pendentes — a frase diz a causa certa', () => {
  const FIM = '2026-08-23' // domingo que fecha a semana

  it('semana em curso: promete o domingo, não acusa falta de dados', () => {
    vi.setSystemTime(new Date('2026-08-19T15:00:00Z')) // quarta, 12h BRT
    const msg = insightsPendingMessage(FIM)
    expect(msg).toMatch(/domingo/i)
    expect(msg, 'a análise não existe porque a hora dela não chegou — não porque faltam treinos')
      .not.toMatch(/suficiente/i)
  })

  it('o último dia da semana ainda conta como "em curso"', () => {
    // Domingo 10h BRT: o cron só roda às 19h. Prometer o domingo é correto.
    vi.setSystemTime(new Date('2026-08-23T13:00:00Z'))
    expect(insightsPendingMessage(FIM)).toMatch(/domingo/i)
  })

  it('vira o dia pelo calendário BRT, não pelo UTC', () => {
    // 23/08 23:00 UTC já é 24/08 em UTC, mas em São Paulo ainda é domingo 20h.
    vi.setSystemTime(new Date('2026-08-23T23:00:00Z'))
    expect(insightsPendingMessage(FIM)).toMatch(/domingo/i)
  })

  it('semana fechada sem análise: diz que não foi gerada', () => {
    vi.setSystemTime(new Date('2026-08-25T15:00:00Z')) // terça seguinte
    const msg = insightsPendingMessage(FIM)
    expect(msg).toMatch(/não gerada/i)
    expect(msg).not.toMatch(/domingo/i)
  })

  it('sem data de fim confiável, não promete domingo nenhum', () => {
    vi.setSystemTime(new Date('2026-08-19T15:00:00Z'))
    expect(insightsPendingMessage('')).toMatch(/ainda não gerada/i)
    expect(insightsPendingMessage('')).not.toMatch(/domingo/i)
  })
})

describe('fiação: o card do Mapa Muscular consome os helpers', () => {
  const CARD = readFileSync(join(process.cwd(), 'src/components/dashboard/MuscleMapCard.tsx'), 'utf8')

  it('o rótulo da semana sai do helper, não de um Date reinterpretado', () => {
    expect(CARD).toMatch(/formatWeekRangeLabel\(/)
    // O padrão que causava o erro: dia-calendário virando instante UTC.
    expect(CARD, 'dia-calendário reinterpretado como timestamp volta a errar o fuso')
      .not.toMatch(/T00:00:00\.000Z/)
  })

  it('a frase de insights vazios vem do helper e não acusa falta de dados', () => {
    expect(CARD).toMatch(/insightsPendingMessage\(/)
    expect(CARD, 'a análise não existe porque a hora dela não chegou')
      .not.toContain('Sem insights suficientes')
  })
})
