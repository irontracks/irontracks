import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CHECKIN_SCALES,
  averageCheckinValues,
  checkinsOfKind,
  readCheckinEnergy,
  readCheckinRpe,
  readCheckinSatisfaction,
  readCheckinSleepHours,
  readCheckinSoreness,
  toCheckinNumber,
} from '../metrics'

/**
 * Regressão de 03/08/2026 — o "Resumo semanal" VIP mostrava três números errados
 * ao mesmo tempo, todos por leitura de `workout_checkins`:
 *
 *  1. média contava campo AUSENTE como zero (`Number(null) === 0` passa no isFinite);
 *  2. energia (escala 1–5) rotulada como "/10";
 *  3. "Humor" lido da coluna `mood`, que nunca é gravada — sempre 0/10.
 *
 * Os casos abaixo usam os NÚMEROS REAIS da conta que reportou o bug: 11 check-ins
 * na semana, 6 deles com energia 5 e sono 6h, 5 do tipo 'post' (que não coletam
 * nenhum dos dois). A tela mostrava 2,7 de energia e 3,3h de sono.
 */

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('toCheckinNumber — ausente é null, nunca 0', () => {
  it('null/undefined/string vazia não viram zero', () => {
    expect(toCheckinNumber(null)).toBeNull()
    expect(toCheckinNumber(undefined)).toBeNull()
    expect(toCheckinNumber('')).toBeNull()
    expect(toCheckinNumber('   ')).toBeNull()
    expect(toCheckinNumber('abc')).toBeNull()
    expect(toCheckinNumber(NaN)).toBeNull()
    // `Number(false) === 0` — booleano também não é resposta de check-in.
    expect(toCheckinNumber(false)).toBeNull()
  })

  it('zero LEGÍTIMO continua sendo zero (dor 0 = "nenhuma dor")', () => {
    expect(toCheckinNumber(0)).toBe(0)
    expect(toCheckinNumber('0')).toBe(0)
  })

  it('aceita vírgula decimal (app pt-BR)', () => {
    expect(toCheckinNumber('7,5')).toBe(7.5)
  })
})

describe('averageCheckinValues — denominador só conta quem respondeu', () => {
  it('reproduz o caso real: 6 respostas de energia 5 em 11 check-ins → 5, não 2.7', () => {
    const values = [5, 5, 5, 5, 5, 5, null, null, null, null, null]
    expect(averageCheckinValues(values)).toBe(5)
    // 30 ÷ 11 = 2.7 era exatamente o número errado exibido na tela.
    expect(averageCheckinValues(values)).not.toBe(2.7)
  })

  it('reproduz o caso real do sono: 6 noites de 6h em 11 check-ins → 6h, não 3.3h', () => {
    const values = [6, 6, 6, 6, 6, 6, null, null, null, null, null]
    expect(averageCheckinValues(values)).toBe(6)
    expect(averageCheckinValues(values)).not.toBe(3.3)
  })

  it('sem nenhuma resposta devolve null (a UI omite a linha em vez de mostrar 0)', () => {
    expect(averageCheckinValues([null, undefined, ''])).toBeNull()
    expect(averageCheckinValues([])).toBeNull()
  })

  it('zeros legítimos entram na média', () => {
    expect(averageCheckinValues([0, 0, 6])).toBe(2)
  })

  it('arredonda para 1 casa por padrão', () => {
    expect(averageCheckinValues([1, 2])).toBe(1.5)
    expect(averageCheckinValues([1, 1, 2])).toBe(1.3)
  })
})

describe('readCheckinSatisfaction — o dado está em answers, não na coluna mood', () => {
  it('lê answers.satisfaction (o que o check-out realmente grava)', () => {
    expect(readCheckinSatisfaction({ kind: 'post', mood: null, answers: { satisfaction: 4 } })).toBe(4)
  })

  it('coluna mood segue valendo como fallback legado', () => {
    expect(readCheckinSatisfaction({ kind: 'post', mood: 3, answers: {} })).toBe(3)
  })

  it('answers.satisfaction ganha da coluna quando os dois existem', () => {
    expect(readCheckinSatisfaction({ mood: 1, answers: { satisfaction: 5 } })).toBe(5)
  })

  it('linha sem satisfação nenhuma devolve null (não 0)', () => {
    expect(readCheckinSatisfaction({ kind: 'post', mood: null, answers: { rpe: 8 } })).toBeNull()
    expect(readCheckinSatisfaction(null)).toBeNull()
  })

  it('satisfação 0 é resposta válida e não some', () => {
    expect(readCheckinSatisfaction({ answers: { satisfaction: 0 } })).toBe(0)
  })
})

describe('leitores por campo', () => {
  const pre = { kind: 'pre', energy: 5, soreness: 2, sleep_hours: 6.5, answers: { mood: 'great' } }
  const post = { kind: 'post', energy: null, soreness: 4, sleep_hours: null, answers: { rpe: 9, satisfaction: 4 } }

  it('energia e sono só existem no pré', () => {
    expect(readCheckinEnergy(pre)).toBe(5)
    expect(readCheckinSleepHours(pre)).toBe(6.5)
    expect(readCheckinEnergy(post)).toBeNull()
    expect(readCheckinSleepHours(post)).toBeNull()
  })

  it('dor vem dos dois tipos', () => {
    expect(readCheckinSoreness(pre)).toBe(2)
    expect(readCheckinSoreness(post)).toBe(4)
  })

  it('rpe vem de answers', () => {
    expect(readCheckinRpe(post)).toBe(9)
    expect(readCheckinRpe(pre)).toBeNull()
  })

  it("answers.mood é TEXTO ('great') e não contamina a energia numérica", () => {
    expect(readCheckinSatisfaction(pre)).toBeNull()
  })

  it('checkinsOfKind separa por tipo', () => {
    expect(checkinsOfKind([pre, post], 'pre')).toEqual([pre])
    expect(checkinsOfKind([pre, post], 'post')).toEqual([post])
    expect(checkinsOfKind(null as unknown as unknown[], 'pre')).toEqual([])
  })
})

describe('escalas — cada campo tem a sua, e não são todas 0–10', () => {
  it('energia é 1–5 (Ótimo/Normal/Cansado), não 0–10', () => {
    expect(CHECKIN_SCALES.energy).toBe(5)
    expect(CHECKIN_SCALES.satisfaction).toBe(5)
    expect(CHECKIN_SCALES.soreness).toBe(10)
    expect(CHECKIN_SCALES.rpe).toBe(10)
  })

  it('a escala da energia bate com o clamp de quem GRAVA o check-in', () => {
    const crud = stripComments(readFileSync('src/hooks/useWorkoutCrud.ts', 'utf8'))
    // O insert valida `energyN >= 1 && energyN <= 5`; se alguém ampliar a coleta
    // sem atualizar CHECKIN_SCALES, o rótulo "/5" volta a mentir.
    expect(crud).toMatch(/energyN\s*>=\s*1\s*&&\s*energyN\s*<=\s*5/)
    expect(crud).toMatch(/great:\s*5,\s*normal:\s*3,\s*tired:\s*1/)
  })

  it('a escala da satisfação bate com o clamp do check-out', () => {
    const post = stripComments(readFileSync('src/app/api/workouts/finish/postCheckinRow.ts', 'utf8'))
    expect(post).toMatch(/parseClampedInt\(pick\('satisfaction'\),\s*0,\s*5\)/)
    // E ela é gravada em `answers`, não na coluna `mood` — é a razão do fallback.
    expect(post).toMatch(/answers\.satisfaction\s*=\s*satisfaction/)
    expect(post).not.toMatch(/\bmood\b/)
  })
})

describe('source-guard: nenhuma superfície volta a ler a coluna morta ou a média ingênua', () => {
  const SURFACES = [
    'src/app/api/vip/weekly-summary/route.ts',
    'src/app/api/teacher/inbox/feed/route.ts',
    'src/app/api/admin/teachers/inbox/route.ts',
    'src/components/dashboard/CheckinsModal.tsx',
    'src/components/admin-panel/StudentCheckinsTab.tsx',
    'src/components/WorkoutReport.tsx',
  ]

  it.each(SURFACES)('%s não lê `.mood` fora do helper', (file) => {
    const code = stripComments(readFileSync(file, 'utf8'))
      // O `select(...)` do Supabase precisa continuar pedindo a coluna (fallback legado).
      .replace(/\.select\((['"`])[\s\S]*?\1\)/g, '')
    expect(code).not.toMatch(/[?.]\s*mood\b/)
    expect(code).not.toMatch(/\bmood:\s*(toNumber|Number|avg)/)
  })

  it('a rota do resumo semanal não reintroduz a média que conta null como zero', () => {
    const route = stripComments(readFileSync('src/app/api/vip/weekly-summary/route.ts', 'utf8'))
    // O padrão exato do bug: converter primeiro (null vira 0) e filtrar depois.
    expect(route).not.toMatch(/Number\(r\??\.?\[[^\]]+\]\)[\s\S]{0,40}isFinite/)
    expect(route).toMatch(/averageCheckinValues/)
  })

  it('o resumo semanal separa pré de pós antes de tirar média de energia e sono', () => {
    const route = stripComments(readFileSync('src/app/api/vip/weekly-summary/route.ts', 'utf8'))
    expect(route).toMatch(/checkinsOfKind\(checkinsList,\s*'pre'\)/)
    expect(route).toMatch(/preCheckins\.map\(readCheckinEnergy\)/)
    expect(route).toMatch(/preCheckins\.map\(readCheckinSleepHours\)/)
  })

  it('o resumo semanal rotula a energia pela escala real, não "/10" fixo', () => {
    const route = stripComments(readFileSync('src/app/api/vip/weekly-summary/route.ts', 'utf8'))
    expect(route).toMatch(/Energia média: \$\{energy\}\/\$\{CHECKIN_SCALES\.energy\}/)
    expect(route).not.toMatch(/Energia média: \$\{energy\}\/10/)
  })

  it('o resumo semanal seleciona `answers` (sem ele a satisfação some)', () => {
    const route = readFileSync('src/app/api/vip/weekly-summary/route.ts', 'utf8')
    const select = route.slice(route.indexOf("from('workout_checkins')"))
    expect(select.slice(0, 300)).toMatch(/\.select\('[^']*answers[^']*'\)/)
  })
})
