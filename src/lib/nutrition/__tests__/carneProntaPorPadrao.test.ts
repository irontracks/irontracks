/**
 * Carne vermelha é PRONTA por padrão; "cru" na linha usa o valor cru.
 *
 * Sintoma (semana de 28/09 a 04/10/2026, conta do dono): o usuário pesa a carne
 * pronta, mas a base curada guardava patinho e filé mignon CRUS — "200g carne
 * moida de patinho" saía com 266 kcal / 54 g P, contra ≈438 / 72 do patinho
 * grelhado (TACO). Frango, arroz e feijão já eram prontos: a base era
 * incoerente, e a refeição saía ~170 kcal subestimada a cada jantar.
 *
 * As frases abaixo são as REAIS do diário daquela semana.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeMeal } from '../parser'
import { foodDatabase } from '../food-database'
import { buildEstimatePrompt } from '../aiEstimate'

const primeiro = (texto: string) => {
  const a = analyzeMeal(texto)
  expect(a.unknownLines, `"${texto}" precisa casar a base local`).toEqual([])
  return a.items[0]!
}

describe('o padrão é o alimento PRONTO', () => {
  it.each([
    // frase real · kcal · proteína (valores da TACO/USDA grelhados × peso)
    ['200g carne moida de patinho', 439, 72],
    ['200g patinho moído', 439, 72],
    ['200g carne moida magra', 439, 72],
    ['180g picadinho miolo da alcatra', 434, 57],
    ['180g Picadinho de miolo de alcatra', 434, 57],
    ['180g filé mignon', 356, 55],
  ])('%s → %i kcal · %i g P', (texto, kcal, p) => {
    const it = primeiro(texto)
    expect(it.calories).toBe(kcal)
    expect(it.protein).toBe(p)
    expect(it.grams).toBeGreaterThan(0)
  })
})

describe('"cru" na linha usa o valor cru da mesma chave', () => {
  it.each([
    ['200g patinho cru', 267, 43],
    ['180g file mignon cru', 250, 39],
    ['180g alcatra crua', 293, 39], // = o lançamento de 30/09, agora só quando dito
  ])('%s → %i kcal · %i g P', (texto, kcal, p) => {
    const it = primeiro(texto)
    expect(it.calories).toBe(kcal)
    expect(it.protein).toBe(p)
  })

  it('chave SEM valor cru não muda com a palavra "cru" (frango segue como sempre)', () => {
    expect(primeiro('200g frango cru').calories).toBe(primeiro('200g frango').calories)
  })

  it('nada fora do escopo mudou: peito de frango e carne picada', () => {
    expect(primeiro('180g peito de frango').calories).toBe(297)
    expect(primeiro('300g carne picada com molho').calories).toBe(636)
  })
})

describe('classe: toda chave de patinho/alcatra/filé mignon declara o par cru', () => {
  const CLASSE = /patinho|alcatra|mignon|carne moida magra/
  const chaves = Object.keys(foodDatabase).filter((k) => CLASSE.test(k))

  it('a varredura acha as chaves (não está vazia)', () => {
    expect(chaves.length).toBeGreaterThanOrEqual(9)
  })

  it.each(Object.keys(foodDatabase).filter((k) => CLASSE.test(k)))('%s: pronto > cru (cozinhar concentra)', (k) => {
    const item = foodDatabase[k]!
    expect(item.cru, `${k} precisa declarar \`cru\``).toBeDefined()
    expect(item.kcal).toBeGreaterThan(item.cru!.kcal)
    expect(item.p).toBeGreaterThan(item.cru!.p)
  })
})

describe('a fonte do valor fica anotada no código', () => {
  const src = readFileSync(join(__dirname, '..', 'food-database.ts'), 'utf8')
  it.each(['FDC 170641', 'FDC 171767', 'patinho, sem gordura', 'miolo de alcatra, sem gordura'])('cita %s', (fonte) => {
    expect(src).toContain(fonte)
  })
})

describe('a IA também assume o alimento pronto', () => {
  it('o prompt diz que o peso é do alimento PRONTO, salvo "cru"', () => {
    const prompt = buildEstimatePrompt('180g picadinho miolo da alcatra')!
    expect(prompt).toMatch(/peso de carne[^\n]*PRONTO/)
    expect(prompt).toContain('salvo se o usuário disser "cru"')
  })
})
