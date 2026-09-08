import { describe, it, expect } from 'vitest'
import {
  createDeloadCycle,
  parseDeloadCycle,
  getDeloadCycleStatus,
  isDeloadCycleActive,
  getDeloadCycleDaysRemaining,
  cycleCoversDate,
} from '@/utils/deload/cycle'

/**
 * Caso real que originou a feature: o dono ativou a descarga na SEGUNDA
 * 07/09/2026 dizendo que ia "até sexta" — 5 dias. Até então o app não tinha
 * onde guardar esse "até sexta".
 *
 * Horários em UTC nos testes: São Paulo é UTC-3, então 12:00Z é 09:00 local e
 * cai no mesmo dia; 02:00Z é 23:00 do dia ANTERIOR em São Paulo, e é aí que a
 * contagem por UTC erraria.
 */
const seg = new Date('2026-09-07T12:00:00Z')

describe('ciclo de deload', () => {
  it('cria a semana de segunda a sexta a partir da duração', () => {
    const c = createDeloadCycle(5, seg)
    expect(c).toEqual({
      startDate: '2026-09-07',
      endDate: '2026-09-11',
      durationDays: 5,
      startedAt: '2026-09-07T12:00:00.000Z',
    })
  })

  it('duração 1 = só hoje', () => {
    expect(createDeloadCycle(1, seg)?.endDate).toBe('2026-09-07')
  })

  it('duração inválida não cria ciclo', () => {
    for (const v of [0, -3, NaN, Infinity, 'cinco' as unknown as number, null as unknown as number]) {
      expect(createDeloadCycle(v, seg)).toBeNull()
    }
  })

  describe('status ao longo da janela', () => {
    const c = createDeloadCycle(5, seg)!

    it('primeiro e meio da janela = ativo', () => {
      expect(getDeloadCycleStatus(c, new Date('2026-09-07T12:00:00Z'))).toBe('active')
      expect(getDeloadCycleStatus(c, new Date('2026-09-09T12:00:00Z'))).toBe('active')
    })

    it('último dia = ends_today (é o gatilho do aviso)', () => {
      expect(getDeloadCycleStatus(c, new Date('2026-09-11T12:00:00Z'))).toBe('ends_today')
    })

    it('depois da janela = inativo, sem precisar encerrar na mão', () => {
      expect(getDeloadCycleStatus(c, new Date('2026-09-12T12:00:00Z'))).toBe('inactive')
      expect(isDeloadCycleActive(c, new Date('2026-09-14T12:00:00Z'))).toBe(false)
    })

    it('antes de começar = inativo', () => {
      expect(getDeloadCycleStatus(c, new Date('2026-09-06T12:00:00Z'))).toBe('inactive')
    })
  })

  it('dias restantes contam hoje e zeram fora da janela', () => {
    const c = createDeloadCycle(5, seg)!
    expect(getDeloadCycleDaysRemaining(c, new Date('2026-09-07T12:00:00Z'))).toBe(5)
    expect(getDeloadCycleDaysRemaining(c, new Date('2026-09-10T12:00:00Z'))).toBe(2)
    expect(getDeloadCycleDaysRemaining(c, new Date('2026-09-11T12:00:00Z'))).toBe(1)
    expect(getDeloadCycleDaysRemaining(c, new Date('2026-09-12T12:00:00Z'))).toBe(0)
  })

  // GUARD DE FUSO — o erro que `utils/cron/dateBrt` já documenta para os crons:
  // 23h em São Paulo já é o dia seguinte em UTC. Quem treina de noite não pode
  // ver a descarga "acabar" mais cedo.
  describe('guard: a virada do dia é a de São Paulo, não a de UTC', () => {
    it('23h de sexta em SP ainda é o último dia da descarga', () => {
      const c = createDeloadCycle(5, seg)!
      // 2026-09-12T02:00Z = 2026-09-11 23:00 em São Paulo (ainda sexta).
      expect(getDeloadCycleStatus(c, new Date('2026-09-12T02:00:00Z'))).toBe('ends_today')
      expect(getDeloadCycleDaysRemaining(c, new Date('2026-09-12T02:00:00Z'))).toBe(1)
    })

    it('ativar às 23h cria o ciclo começando no dia de SP', () => {
      // 2026-09-08T02:00Z = 2026-09-07 23:00 em São Paulo.
      expect(createDeloadCycle(5, new Date('2026-09-08T02:00:00Z'))?.startDate).toBe('2026-09-07')
    })
  })

  describe('parse defensivo do que vem das settings', () => {
    it('rejeita lixo', () => {
      for (const v of [null, undefined, 42, 'x', [], {}, { startDate: 'ontem', endDate: 'hoje' }]) {
        expect(parseDeloadCycle(v)).toBeNull()
      }
    })

    it('rejeita janela invertida', () => {
      expect(parseDeloadCycle({ startDate: '2026-09-11', endDate: '2026-09-07' })).toBeNull()
    })

    it('aceita ciclo sem durationDays, assumindo 1', () => {
      expect(parseDeloadCycle({ startDate: '2026-09-07', endDate: '2026-09-07' })?.durationDays).toBe(1)
    })

    it('ciclo inválido nunca deixa o app preso em descarga', () => {
      expect(isDeloadCycleActive({ startDate: 'xx' }, seg)).toBe(false)
      expect(getDeloadCycleDaysRemaining(null, seg)).toBe(0)
    })
  })

  // Um treino DENTRO da janela é de descarga mesmo sem patch nas séries — o
  // usuário pode ter baixado a carga na mão. Sem isto, essa sessão viraria
  // régua de comparação para as outras da mesma semana.
  it('cobre sessões da janela mesmo sem patch nas séries', () => {
    const c = createDeloadCycle(5, seg)!
    expect(cycleCoversDate(c, '2026-09-09T14:00:00Z')).toBe(true)
    expect(cycleCoversDate(c, '2026-09-12T14:00:00Z')).toBe(false)
    expect(cycleCoversDate(null, '2026-09-09T14:00:00Z')).toBe(false)
  })
})
