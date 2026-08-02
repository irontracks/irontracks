import { describe, it, expect } from 'vitest'
import { buildTemplateReply } from '../chatReply'
import { projectMeal } from '../chatProjection'

const consumed = { calories: 2020, protein: 150, carbs: 260, fat: 70 }
const goals = { calories: 2900, protein: 215, carbs: 350, fat: 70 }
const eggs = { calories: 388, protein: 33, carbs: 3, fat: 28 }

/**
 * O narrador é a resposta INTEIRA no caminho sem IA, e a rede de segurança quando o
 * Gemini não responde. Todo número que ele cita vem do projectMeal — nenhum é
 * inventado aqui.
 */
describe('buildTemplateReply', () => {
  it('narra a simulação com os números do projectMeal', () => {
    const reply = buildTemplateReply('5 ovos cozidos', projectMeal(consumed, goals, eggs))
    expect(reply).toContain('5 ovos cozidos')
    expect(reply).toContain('388 kcal')
    expect(reply).toContain('2408') // 2020 + 388
    expect(reply).toContain('2900')
    expect(reply).toContain('sobram 492')
  })

  it('avisa o macro que estoura (a gordura já estava na meta)', () => {
    const reply = buildTemplateReply('5 ovos cozidos', projectMeal(consumed, goals, eggs))
    expect(reply).toContain('Acima da meta:')
    expect(reply).toContain('gordura 98/70g')
    // ...e não acusa o que cabe.
    expect(reply).not.toContain('carboidrato 263')
  })

  it('quando estoura as calorias, diz o quanto passou (sem sinal negativo solto)', () => {
    const reply = buildTemplateReply('1 pizza', projectMeal(consumed, goals, { calories: 1500, protein: 60, carbs: 180, fat: 60 }))
    expect(reply).toContain('620 acima da meta')
    expect(reply).not.toContain('-620')
  })

  it('sem meta, não finge meta zero', () => {
    const reply = buildTemplateReply('5 ovos', projectMeal(consumed, null, eggs))
    expect(reply).toContain('2408 kcal')
    expect(reply).toContain('não definiu uma meta')
    expect(reply).not.toContain('sobram')
  })

  it('comenta a proteína quando ela fecha sem estourar', () => {
    const reply = buildTemplateReply('5 ovos', projectMeal(consumed, goals, eggs))
    expect(reply).toContain('Proteína fecha em 183/215g')
  })

  it('capitaliza o alimento pra abrir a frase e aguenta texto vazio', () => {
    expect(buildTemplateReply('200g de frango', projectMeal(consumed, goals, eggs))).toMatch(/^200g de frango/)
    expect(buildTemplateReply('', projectMeal(consumed, goals, eggs))).toMatch(/^Isso/)
  })

  it('nunca emite NaN/undefined na cara do usuário', () => {
    const reply = buildTemplateReply('x', projectMeal(null, null, null))
    expect(reply).not.toMatch(/NaN|undefined|null/)
  })
})

describe('peso assumido — torna visível o chute de 50g do parser', () => {
  /**
   * Quando o alimento não declara quanto pesa uma unidade, o parser usa 50g
   * (parser.ts:219). Acerta em ovo (~50g) e erra feio em "uma pizza grande", que
   * vira 50g/133 kcal — e o app responderia "cabe!" com toda a confiança. Mostrar
   * o peso não conserta a estimativa; torna o erro visível e corrigível.
   */
  it('mostra o peso total somado dos items', () => {
    const reply = buildTemplateReply('5 ovos cozidos', projectMeal(consumed, goals, eggs), [
      { label: '5 ovos cozidos', grams: 250 },
    ])
    expect(reply).toContain('5 ovos cozidos (250g) —')
  })

  it('o caso da pizza: o usuário lê "(50g)" e tem como estranhar', () => {
    const pizza = { calories: 133, protein: 6, carbs: 17, fat: 5 }
    const reply = buildTemplateReply('uma pizza grande', projectMeal(consumed, goals, pizza), [
      { label: 'uma pizza grande', grams: 50 },
    ])
    expect(reply).toContain('Uma pizza grande (50g)')
  })

  it('soma o peso de múltiplos alimentos', () => {
    const reply = buildTemplateReply('frango e arroz', projectMeal(consumed, goals, eggs), [
      { label: '200g de frango', grams: 200 },
      { label: '100g de arroz', grams: 100 },
    ])
    expect(reply).toContain('(300g)')
  })

  it('sem peso conhecido, não inventa "(0g)"', () => {
    expect(buildTemplateReply('x', projectMeal(consumed, goals, eggs), [{ label: 'x', grams: 0 }])).not.toContain('(0g)')
    expect(buildTemplateReply('x', projectMeal(consumed, goals, eggs))).not.toContain('g) —')
  })
})
