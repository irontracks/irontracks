import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard da telemetria de Live Activity.
 *
 * Incidente que originou este teste: o dono reportou que a Ilha Dinâmica e o
 * aviso da tela bloqueada sumiram. Investigando, o Sentry estava LIMPO — porque
 * a falha era engolida em duas camadas:
 *   1. Swift: `catch { print(...); call.resolve(["activityId": ""]) }` — falha
 *      vira sucesso com id vazio.
 *   2. JS: `return String(result?.activityId || '')` e o chamador descartava.
 * Resultado: a feature podia estar quebrada para todo mundo sem um único
 * registro em lugar nenhum.
 *
 * O invariante travado aqui: o JS NÃO pode descartar em silêncio nem o id vazio
 * nem uma exceção ao iniciar uma Live Activity.
 */
const src = readFileSync(
  join(process.cwd(), 'src/utils/native/irontracksNative.ts'),
  'utf8',
)

/** Corpo da função exportada, do `export const <nome>` até a próxima export. */
const bodyOf = (name: string): string => {
  const start = src.indexOf(`export const ${name}`)
  expect(start, `${name} não encontrada`).toBeGreaterThan(-1)
  const rest = src.slice(start + 1)
  const end = rest.indexOf('\nexport const ')
  return end === -1 ? rest : rest.slice(0, end)
}

describe('telemetria de falha da Live Activity', () => {
  it('existe um repórter dedicado (e não um console.log)', () => {
    expect(src).toContain('const reportLiveActivityFailure')
    expect(src).toContain("from '@sentry/nextjs'")
  })

  it.each(['startWorkoutLiveActivity', 'startRestLiveActivity'])(
    '%s reporta id vazio E exceção',
    (fn) => {
      const body = bodyOf(fn)
      // id vazio: o Swift resolve com "" quando o Activity.request() falha.
      expect(body).toContain("'empty_activity_id'")
      // exceção: o catch não pode ser mudo.
      expect(body).toContain("'threw'")
      expect(body).not.toMatch(/catch\s*\{\s*\}/)
    },
  )

  it('o catch mudo não voltou em nenhuma das duas', () => {
    for (const fn of ['startWorkoutLiveActivity', 'startRestLiveActivity']) {
      const body = bodyOf(fn)
      expect(body).toMatch(/catch\s*\(\s*e\s*\)/)
    }
  })

  it('o tipo do plugin expõe o activityId do descanso', () => {
    // Estava declarado como Promise<void>: o Swift devolvia o id e o TS o
    // apagava do contrato, tornando a falha impossível de detectar.
    expect(src).toMatch(/startRestLiveActivity:[\s\S]{0,220}activityId\?: string/)
  })

  it('a telemetria nunca derruba o treino', () => {
    const start = src.indexOf('const reportLiveActivityFailure')
    const body = src.slice(start, start + 900)
    expect(body).toMatch(/try\s*\{[\s\S]*\}\s*catch\s*\{/)
  })
})
