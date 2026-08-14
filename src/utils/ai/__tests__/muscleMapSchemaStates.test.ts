/**
 * Guard do bug de 10–13/08/2026: o structured output do Gemini compila o
 * responseSchema numa máquina de estados, e `maxItems` grande em ARRAY
 * ANINHADO multiplica estados — 60×12 no DAILY_MUSCLE_MAP estourou o limite
 * de serving e a rota respondia 400 INVALID_ARGUMENT ("too many states") para
 * TODO VIP do mapa muscular semanal (11 eventos em 4 dias nos runtime logs).
 *
 * Medido contra a API real em 14/08/2026: COM maxItems → 400; SEM → 200.
 *
 * A correção segue a doutrina do repo (CLAUDE.md, saída de IA): o schema na
 * chamada derruba JSON inválido; LIMITE é papel do normalizador — aqui, o
 * teto pós-parse via DAILY_MUSCLE_MAP_LIMITS nas duas rotas irmãs.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DAILY_MUSCLE_MAP_LIMITS, DAILY_MUSCLE_MAP_RESPONSE_SCHEMA } from '@/utils/ai/routeContracts'

const ROOT = path.resolve(__dirname, '../../../..')

describe('schema do mapa muscular não estoura a máquina de estados (14/08/2026)', () => {
  it('o responseSchema não carrega maxItems — o teto é do pós-parse', () => {
    expect(
      JSON.stringify(DAILY_MUSCLE_MAP_RESPONSE_SCHEMA),
      'maxItems voltou ao schema: 60×12 aninhados = 400 too-many-states no Gemini (medido)'
    ).not.toContain('maxItems')
  })

  it('os limites continuam existindo — saíram do schema, não do produto', () => {
    expect(DAILY_MUSCLE_MAP_LIMITS.exercises).toBeGreaterThan(0)
    expect(DAILY_MUSCLE_MAP_LIMITS.musclesPerExercise).toBeGreaterThan(0)
  })

  it('as DUAS rotas irmãs aplicam o teto pós-parse (fiação, não só as pontas)', () => {
    for (const rota of ['src/app/api/ai/muscle-map-day/route.ts', 'src/app/api/ai/muscle-map-week/route.ts']) {
      const src = fs.readFileSync(path.join(ROOT, rota), 'utf8')
      expect(src, `${rota} não importa DAILY_MUSCLE_MAP_LIMITS`).toContain('DAILY_MUSCLE_MAP_LIMITS')
      expect(src, `${rota} não fatia exercises pelo teto`).toMatch(
        /\.slice\(0,\s*DAILY_MUSCLE_MAP_LIMITS\.exercises\)/
      )
      expect(src, `${rota} não fatia muscles pelo teto`).toMatch(
        /\.slice\(0,\s*DAILY_MUSCLE_MAP_LIMITS\.musclesPerExercise\)/
      )
    }
  })
})
