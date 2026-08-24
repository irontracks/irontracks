/**
 * Guard de CLASSE: quem conta "a semana do usuário" usa a fonte única.
 *
 * O bug de 24/08/2026 não foi um cálculo errado — foram TRÊS cálculos
 * diferentes, cada um numa rota, todos escritos à mão:
 *
 *   `weekly-recap`      → segunda, em UTC
 *   `muscle-map-week`   → segunda, em UTC
 *   `leaderboard`       → segunda, no fuso do servidor (e, no domingo, o
 *                         início caía em AMANHÃ: ranking zerado o dia inteiro)
 *
 * Resultado: a Fran fez 6 treinos (domingo a sexta) e o push disse 5, porque o
 * domingo dela pertencia à semana anterior. Hoje a semana é **domingo→sábado,
 * BRT**, e mora em `utils/cron/weekRangeBrt.ts`.
 *
 * Nenhum teste cobria a fronteira antes — foi por isso que a mudança inteira
 * passou sem quebrar nada. Este guard fecha essa porta.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { weekStartDayBrt } from '@/utils/cron/weekRangeBrt'

const SRC = join(process.cwd(), 'src')

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/**
 * Quem pode calcular a fronteira sozinho, e por quê. Só encolhe.
 */
const PODE_CALCULAR_SOZINHO: Record<string, string> = {
  'src/utils/cron/weekRangeBrt.ts': 'é a fonte única',
  'src/app/(app)/dashboard/schedule/ScheduleClient.tsx':
    'grade visual da agenda, no fuso do aparelho — já começa no domingo e não conta treino',
  'src/utils/vip/weekReset.ts':
    'reset de COTA VIP (segunda 03:00 BRT). É regra de cobrança, não a semana de treino — mudar aqui altera quando o crédito volta',
  'src/components/dashboard/WorkoutCalendarModal.tsx':
    'grade de mês do calendário: alinha as colunas da tabela, não define intervalo de contagem',
}

/** `x.getDay()` usado para ANDAR até o começo da semana. */
const CALCULA_INICIO_DE_SEMANA = /setDate\([^)]*getDay\(\)|getDate\(\)\s*-\s*[^;]*getDay\(\)|weekdayIndex\s*===\s*0\s*\?/

describe('guard: a semana do usuário tem fonte única', () => {
  it('ninguém novo calcula o início da semana à mão', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const rel = file.replace(SRC, 'src')
      if (PODE_CALCULAR_SOZINHO[rel]) continue
      const code = stripComments(readFileSync(file, 'utf8'))
      if (CALCULA_INICIO_DE_SEMANA.test(code)) offenders.push(rel)
    }
    expect(
      offenders,
      'use `weekStartDayBrt`/`currentWeekRangeBrt` (utils/cron/weekRangeBrt) — a semana é domingo→sábado, BRT'
    ).toEqual([])
  })

  it('a allowlist só tem entradas que existem — lista morta vira papel de parede', () => {
    for (const rel of Object.keys(PODE_CALCULAR_SOZINHO)) {
      expect(() => statSync(join(process.cwd(), rel)), `${rel} não existe mais`).not.toThrow()
    }
  })

  it('as rotas de contagem semanal consomem a fonte única', () => {
    const consumidores = [
      'app/api/cron/weekly-recap/route.ts',
      'app/api/social/leaderboard/route.ts',
      'app/api/muscle/weekly-summary/route.ts',
      'utils/ai/muscleMapWeekHelpers.ts',
    ]
    for (const rel of consumidores) {
      const code = readFileSync(join(SRC, rel), 'utf8')
      expect(code, `${rel} deve importar de weekRangeBrt`).toMatch(/from '@\/utils\/cron\/weekRangeBrt'/)
    }
  })

  it('a semana começa no DOMINGO — o dia que motivou a mudança', () => {
    // Domingo 16/08 às 10h BRT: o treino da Fran. Ele abre a semana dele.
    expect(weekStartDayBrt(new Date('2026-08-16T13:00:00Z'))).toBe('2026-08-16')
    // E a segunda seguinte continua na MESMA semana.
    expect(weekStartDayBrt(new Date('2026-08-17T11:05:00Z'))).toBe('2026-08-16')
  })
})
