import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard (higiene da auditoria de nutrição): trackMeal é o funil ÚNICO de escrita de
 * refeição (todas as Server Actions e a rota /api/nutrition/log-entry passam por ele).
 * Ele precisa clampar o TOPO dos macros com os mesmos tetos da rota (6000/400/800/300)
 * — daily_nutrition_logs não tem CHECK de range, então sem o clamp uma action grava
 * macros absurdos (ex.: 1e12) e infla o agregado do dia.
 */
describe('trackMeal — clamp superior de macros', () => {
  const src = readFileSync('src/lib/nutrition/engine.ts', 'utf8')

  it('clampa calorias/proteína/carbo/gordura aos tetos sanitários', () => {
    expect(src).toMatch(/calories\s*=\s*Math\.min\(\s*6000\s*,\s*calories\s*\)/)
    expect(src).toMatch(/protein\s*=\s*Math\.min\(\s*400\s*,\s*protein\s*\)/)
    expect(src).toMatch(/carbs\s*=\s*Math\.min\(\s*800\s*,\s*carbs\s*\)/)
    expect(src).toMatch(/fat\s*=\s*Math\.min\(\s*300\s*,\s*fat\s*\)/)
  })
})
