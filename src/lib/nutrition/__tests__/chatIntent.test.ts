import { describe, it, expect } from 'vitest'
import { detectIntent, cleanFoodText } from '../chatIntent'

/**
 * O atalho existe pra responder o caso de uso #1 com ZERO Gemini e resposta sempre
 * idêntica. `unknown` não é erro — é "manda pro modelo".
 */
describe('detectIntent — reconhece a simulação sem IA', () => {
  it('a pergunta literal do dono', () => {
    const i = detectIntent('se eu comer 5 ovos cozidos agora, pra quanto que vai minha calorias e meus macros?')
    expect(i.kind).toBe('simulate')
    expect(i.kind === 'simulate' && i.foodText).toBe('5 ovos cozidos')
  })

  it.each([
    ['se eu comer 5 ovos', '5 ovos'],
    ['E se eu comer 200g de frango?', '200g de frango'],
    ['se eu tomar 1 whey', '1 whey'],
    ['se eu beber 1 coca lata', '1 coca lata'],
    ['se eu jantar 2 ovos e arroz', '2 ovos e arroz'],
    ['quanto fica se eu comer 100g de arroz', '100g de arroz'],
    ['comendo 3 bananas', '3 bananas'],
    ['simular 150g de frango', '150g de frango'],
  ])('%s → %s', (question, expected) => {
    const i = detectIntent(question)
    expect(i.kind).toBe('simulate')
    expect(i.kind === 'simulate' && i.foodText).toBe(expected)
  })

  it('múltiplos alimentos passam inteiros pro parser (que já splita por "e"/vírgula/+)', () => {
    const i = detectIntent('se eu comer 5 ovos e 2 bananas agora')
    expect(i.kind === 'simulate' && i.foodText).toBe('5 ovos e 2 bananas')
  })
})

describe('detectIntent — o que NÃO é simulação vai pro modelo', () => {
  it.each([
    'quanto de proteína eu comi essa semana?',
    'o que eu como pra fechar a meta?',
    'quanto falta de proteína hoje?',
    'oi',
    '',
    '   ',
  ])('%s → unknown', (question) => {
    expect(detectIntent(question).kind).toBe('unknown')
  })

  it('"se eu comer" sem alimento não é simulação', () => {
    expect(detectIntent('se eu comer agora').kind).toBe('unknown')
    expect(detectIntent('se eu comer?').kind).toBe('unknown')
  })

  it('quantidade sem alimento não é simulação (precisa de comida, não só número)', () => {
    expect(detectIntent('se eu comer 5').kind).toBe('unknown')
  })
})

describe('cleanFoodText — o que faz o atalho não cair no Gemini à toa', () => {
  it('tira advérbios que o parser trataria como alimento desconhecido', () => {
    expect(cleanFoodText('5 ovos cozidos agora')).toBe('5 ovos cozidos')
    expect(cleanFoodText('2 bananas hoje')).toBe('2 bananas')
    expect(cleanFoodText('1 whey mais tarde')).toBe('1 whey')
  })

  it('corta a cauda de pergunta que veio junto', () => {
    expect(cleanFoodText('5 ovos, pra quanto vai minhas calorias?')).toBe('5 ovos')
    expect(cleanFoodText('200g de frango quanto fica')).toBe('200g de frango')
    expect(cleanFoodText('1 pizza cabe na minha meta?')).toBe('1 pizza')
    expect(cleanFoodText('5 ovos e os macros?')).toBe('5 ovos')
  })

  it('normaliza pontuação, conector solto e espaço', () => {
    expect(cleanFoodText('  5   ovos  ?? ')).toBe('5 ovos')
    expect(cleanFoodText('5 ovos e')).toBe('5 ovos')
    expect(cleanFoodText('5 ovos com')).toBe('5 ovos')
  })

  it('preserva o alimento composto (não corta no "de")', () => {
    expect(cleanFoodText('200g de peito de frango grelhado')).toBe('200g de peito de frango grelhado')
  })

  it('entrada suja não quebra', () => {
    expect(cleanFoodText('')).toBe('')
    expect(cleanFoodText(null as unknown as string)).toBe('')
  })
})
