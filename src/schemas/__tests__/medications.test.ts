import { describe, it, expect } from 'vitest'
import {
  MAX_HORARIOS_POR_MEDICAMENTO,
  MAX_MEDICAMENTOS_POR_USUARIO,
  MedicationInputSchema,
  MedicationPatchSchema,
} from '../medications'

const base = {
  name: 'Losartana',
  times: ['08:00'],
  startDate: '2026-10-03',
}

describe('limites exportados', () => {
  it('8 horários por remédio e 30 remédios por usuário', () => {
    expect(MAX_HORARIOS_POR_MEDICAMENTO).toBe(8)
    expect(MAX_MEDICAMENTOS_POR_USUARIO).toBe(30)
  })
})

describe('MedicationInputSchema', () => {
  it('aplica os defaults: todos os dias, ativo, sem fim, dose e notas null', () => {
    const r = MedicationInputSchema.parse(base)
    expect(r).toEqual({
      name: 'Losartana',
      dose: null,
      times: ['08:00'],
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startDate: '2026-10-03',
      endDate: null,
      notes: null,
      active: true,
    })
  })

  it('sem startDate, vale hoje em BRT', () => {
    const r = MedicationInputSchema.parse({ name: 'X', times: ['08:00'] })
    expect(r.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('normaliza, deduplica e ordena os horários; descarta os inválidos', () => {
    const r = MedicationInputSchema.parse({
      ...base,
      times: ['20:00', '8:00', '08:00', '25:99', 'abc', '', 7, '12:30'],
    })
    expect(r.times).toEqual(['08:00', '12:30', '20:00'])
  })

  it('reprova quando nenhum horário sobra válido', () => {
    expect(MedicationInputSchema.safeParse({ ...base, times: ['xx', '99:99'] }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, times: [] }).success).toBe(false)
  })

  it('aceita 8 horários e reprova 9', () => {
    const h = (n: number) => Array.from({ length: n }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`)
    expect(MedicationInputSchema.safeParse({ ...base, times: h(8) }).success).toBe(true)
    expect(MedicationInputSchema.safeParse({ ...base, times: h(9) }).success).toBe(false)
  })

  it('o teto de 8 conta horários distintos, não entradas repetidas', () => {
    const r = MedicationInputSchema.safeParse({ ...base, times: Array(10).fill('08:00') })
    expect(r.success).toBe(true)
  })

  it('nome: trim, 1 a 80', () => {
    expect(MedicationInputSchema.parse({ ...base, name: '  Losartana  ' }).name).toBe('Losartana')
    expect(MedicationInputSchema.safeParse({ ...base, name: '   ' }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, name: 'a'.repeat(81) }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, name: 'a'.repeat(80) }).success).toBe(true)
  })

  it('dose vazia ou só espaços vira null; dose preenchida é aparada; teto 60', () => {
    expect(MedicationInputSchema.parse({ ...base, dose: '' }).dose).toBeNull()
    expect(MedicationInputSchema.parse({ ...base, dose: '   ' }).dose).toBeNull()
    expect(MedicationInputSchema.parse({ ...base, dose: null }).dose).toBeNull()
    expect(MedicationInputSchema.parse({ ...base, dose: ' 50 mg ' }).dose).toBe('50 mg')
    expect(MedicationInputSchema.safeParse({ ...base, dose: 'a'.repeat(61) }).success).toBe(false)
  })

  it('notas: vazio vira null, teto 300', () => {
    expect(MedicationInputSchema.parse({ ...base, notes: '' }).notes).toBeNull()
    expect(MedicationInputSchema.safeParse({ ...base, notes: 'a'.repeat(301) }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, notes: 'a'.repeat(300) }).success).toBe(true)
  })

  it('dias da semana: deduplica, ordena, valida 0–6 e exige ao menos um', () => {
    expect(MedicationInputSchema.parse({ ...base, weekdays: [5, 1, 1, 3] }).weekdays).toEqual([1, 3, 5])
    expect(MedicationInputSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, weekdays: [7] }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, weekdays: [-1] }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, weekdays: [1.5] }).success).toBe(false)
  })

  it('datas: formato e existência no calendário', () => {
    expect(MedicationInputSchema.safeParse({ ...base, startDate: '03/10/2026' }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, startDate: '2026-02-31' }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, endDate: '2026-13-01' }).success).toBe(false)
  })

  it('endDate anterior a startDate reprova; igual ou posterior passa; null passa', () => {
    expect(MedicationInputSchema.safeParse({ ...base, endDate: '2026-10-02' }).success).toBe(false)
    expect(MedicationInputSchema.safeParse({ ...base, endDate: '2026-10-03' }).success).toBe(true)
    expect(MedicationInputSchema.safeParse({ ...base, endDate: '2026-12-01' }).success).toBe(true)
    expect(MedicationInputSchema.parse({ ...base, endDate: null }).endDate).toBeNull()
  })
})

describe('MedicationPatchSchema', () => {
  it('objeto vazio é válido e NÃO inventa nenhum campo (nada de default que apague)', () => {
    expect(MedicationPatchSchema.parse({})).toEqual({})
  })

  it('só o que veio muda', () => {
    expect(MedicationPatchSchema.parse({ active: false })).toEqual({ active: false })
  })

  it('dose vazia vira null (apagar), ausente continua ausente', () => {
    expect(MedicationPatchSchema.parse({ dose: '' })).toEqual({ dose: null })
    expect('dose' in MedicationPatchSchema.parse({ name: 'X' })).toBe(false)
  })

  it('aplica a mesma normalização de horários e dias', () => {
    const r = MedicationPatchSchema.parse({ times: ['9:00', '08:00', 'x'], weekdays: [3, 1, 3] })
    expect(r.times).toEqual(['08:00', '09:00'])
    expect(r.weekdays).toEqual([1, 3])
  })

  it('não aceita lista de horários que fica vazia', () => {
    expect(MedicationPatchSchema.safeParse({ times: ['zz'] }).success).toBe(false)
  })

  it('end < start reprova quando os dois vêm', () => {
    expect(MedicationPatchSchema.safeParse({ startDate: '2026-10-05', endDate: '2026-10-04' }).success).toBe(false)
    expect(MedicationPatchSchema.safeParse({ startDate: '2026-10-05', endDate: '2026-10-05' }).success).toBe(true)
  })

  it('endDate null é permitido (remove o fim)', () => {
    expect(MedicationPatchSchema.parse({ endDate: null })).toEqual({ endDate: null })
  })
})
