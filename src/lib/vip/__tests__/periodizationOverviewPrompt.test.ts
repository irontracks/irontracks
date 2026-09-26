import { describe, it, expect, vi } from 'vitest'
import { computeWeeks, VipPeriodizationQuestionnaire, VipPeriodizationWeeks } from '@/utils/vip/periodization'

/**
 * O resumo da IA contradizia o plano que o próprio app monta (visto no
 * simulador em 26/09/2026, programa de 8 semanas): o motor determinístico
 * (`computeWeeks`) faz deload nas semanas 4 e 6 e teste na 8, mas o prompt só
 * dizia "8 semanas" e pedia a seção "Deload e testes" sem informar QUAIS
 * semanas eram — a IA inventou ("deload na semana 8", "teste na semana 7").
 *
 * Este teste captura o prompt real (Gemini mockado) e verifica que as semanas
 * de deload/teste que chegam a ele são EXATAMENTE as de `computeWeeks` — sem
 * duplicar a tabela aqui, para não haver duas fontes divergindo de novo.
 */

const generateContent = vi.fn()

vi.mock('@/utils/ai/gemini', () => ({
  getGeminiModel: () => ({ generateContent }),
}))

vi.mock('@/utils/env', () => ({
  env: { gemini: { apiKey: 'test-key', modelId: 'gemini-3.1-flash-lite' } },
}))

const { generateOverview } = await import('../periodizationCreate')

const baseQuestionnaire = (weeks: VipPeriodizationWeeks): VipPeriodizationQuestionnaire => ({
  model: 'linear',
  weeks,
  goal: 'hypertrophy',
  level: 'intermediate',
  daysPerWeek: 4,
  timeMinutes: 60,
  equipment: ['gym'],
  limitations: '',
})

async function capturePrompt(weeks: VipPeriodizationWeeks): Promise<string> {
  generateContent.mockClear()
  generateContent.mockResolvedValue({ response: { text: async () => 'resumo qualquer' } })
  const q = baseQuestionnaire(weeks)
  const planWeeks = computeWeeks(weeks, q.model)
  await generateOverview(q, 'upper_lower', planWeeks)
  expect(generateContent).toHaveBeenCalledTimes(1)
  const parts = generateContent.mock.calls[0][0] as Array<{ text: string }>
  return String(parts?.[0]?.text || '')
}

describe.each([4, 6, 8] as VipPeriodizationWeeks[])('prompt do resumo — programa de %i semanas', (weeks) => {
  it('cita exatamente as semanas de deload de computeWeeks', async () => {
    const prompt = await capturePrompt(weeks)
    const planWeeks = computeWeeks(weeks, 'linear')
    const deloadWeeks = planWeeks.filter((w) => w.isDeload).map((w) => w.weekNumber)

    if (deloadWeeks.length) {
      for (const n of deloadWeeks) {
        expect(prompt, `semana ${n} de deload não apareceu no prompt`).toMatch(new RegExp(`deload:[^\\n]*\\b${n}\\b`, 'i'))
      }
    } else {
      expect(prompt).toMatch(/não tem semana de deload/i)
    }
  })

  it('cita exatamente a semana de teste de computeWeeks', async () => {
    const prompt = await capturePrompt(weeks)
    const planWeeks = computeWeeks(weeks, 'linear')
    const testWeeks = planWeeks.filter((w) => w.isTest).map((w) => w.weekNumber)

    expect(testWeeks.length, 'computeWeeks sempre tem uma semana de teste — a última').toBeGreaterThan(0)
    for (const n of testWeeks) {
      expect(prompt, `semana ${n} de teste não apareceu no prompt`).toMatch(new RegExp(`teste de carga m[aá]xima:[^\\n]*\\b${n}\\b`, 'i'))
    }
  })

  it('não cita nenhuma semana de deload/teste que computeWeeks não marcou', async () => {
    const prompt = await capturePrompt(weeks)
    const planWeeks = computeWeeks(weeks, 'linear')
    const deloadLine = prompt.split('\n').find((l) => /^- Semanas? de deload:/i.test(l)) || ''
    const testLine = prompt.split('\n').find((l) => /^- Semanas? de teste de carga máxima:/i.test(l)) || ''
    const numerosCitados = (line: string) => Array.from(line.matchAll(/\d+/g)).map((m) => Number(m[0]))

    const deloadWeeksEsperado = planWeeks.filter((w) => w.isDeload).map((w) => w.weekNumber)
    const testWeeksEsperado = planWeeks.filter((w) => w.isTest).map((w) => w.weekNumber)

    expect(numerosCitados(deloadLine).sort()).toEqual(deloadWeeksEsperado.sort())
    expect(numerosCitados(testLine).sort()).toEqual(testWeeksEsperado.sort())
  })
})

describe('prompt do resumo — instrução geral', () => {
  it('pede texto sem markdown', async () => {
    const prompt = await capturePrompt(8)
    expect(prompt).toMatch(/não use markdown/i)
  })

  it('diz explicitamente para não inventar outra semana', async () => {
    const prompt = await capturePrompt(8)
    expect(prompt).toMatch(/nunca (cite|invente) outra semana/i)
  })
})
