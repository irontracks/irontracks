/**
 * Guard da conferência de carga fora do padrão.
 *
 * A distância entre 12 kg e 120 kg é um toque — foi a classe do bug do campo
 * numérico (15/08/2026), em que digitar INSERIA no cursor em vez de substituir.
 * Aquele caminho foi fechado; o dedo errado não. E o histórico é a base que o
 * motor de carga automática lê depois, então um peso fantasma vira sugestão
 * real na sessão seguinte.
 */
import { describe, it, expect } from 'vitest'
import { detectWeightOutlier, outlierLabel, buildWeightReference, OUTLIER_FACTOR } from '../weightOutlier'

describe('detectWeightOutlier', () => {
  it('progressão normal NUNCA vira alarme', () => {
    // O motor de autoload trava em +10% por sessão. Se estes acusassem, o aviso
    // apareceria em treino normal e o usuário aprenderia a ignorá-lo — inclusive
    // na vez em que ele estiver certo.
    expect(detectWeightOutlier(42.5, 40)).toBeNull()
    expect(detectWeightOutlier(44, 40)).toBeNull()
    expect(detectWeightOutlier(36, 40)).toBeNull() // deload de 10%
    expect(detectWeightOutlier(30, 40)).toBeNull() // deload agressivo de 25%
    expect(detectWeightOutlier(80, 40)).toBeNull() // dobrou: ainda não acusa
  })

  it('o erro de digitação típico é pego', () => {
    // dígito a mais
    expect(detectWeightOutlier(200, 20)?.direcao).toBe('acima')
    // inserção no cursor: 2 vira 12, 20 vira 120 (o bug real de 15/08)
    expect(detectWeightOutlier(120, 20)?.direcao).toBe('acima')
    // dígito a menos
    expect(detectWeightOutlier(12, 120)?.direcao).toBe('abaixo')
  })

  it('a fronteira está no fator 4, nos dois sentidos', () => {
    // Literais, não a constante — assertar contra OUTLIER_FACTOR moveria a
    // expectativa junto com o valor.
    expect(detectWeightOutlier(39.9, 10)).toBeNull()
    expect(detectWeightOutlier(40, 10)?.direcao).toBe('acima')
    expect(detectWeightOutlier(10.1, 40)).toBeNull()
    expect(detectWeightOutlier(10, 40)?.direcao).toBe('abaixo')
    expect(OUTLIER_FACTOR).toBe(4)
  })

  it('sem histórico não existe "fora do padrão" — exercício novo não é acusado', () => {
    expect(detectWeightOutlier(100, null)).toBeNull()
    expect(detectWeightOutlier(100, 0)).toBeNull()
    expect(detectWeightOutlier(100, undefined)).toBeNull()
    expect(detectWeightOutlier(100, NaN)).toBeNull()
  })

  it('peso ausente ou zero (peso corporal) não é acusado', () => {
    expect(detectWeightOutlier(0, 40)).toBeNull()
    expect(detectWeightOutlier(null, 40)).toBeNull()
    expect(detectWeightOutlier(undefined, 40)).toBeNull()
  })

  it('a frase diz o número de agora E o de sempre', () => {
    const o = detectWeightOutlier(120, 20)!
    expect(outlierLabel(o)).toBe('⚠️ conferir: 120 kg (costuma ser 20 kg)')
  })
})

describe('buildWeightReference', () => {
  const hist = (items: Array<{ topWeight?: number; avgWeight?: number }>) => ({
    version: 1,
    exercises: { 'supino reto': { name: 'Supino Reto', items: items.map((i, n) => ({ ts: n + 1, ...i })) } },
  })

  it('usa a MEDIANA — um erro já gravado no histórico não contamina a referência', () => {
    // Este é o ponto do módulo: se a referência fosse o ÚLTIMO valor, um 200
    // digitado errado na sessão passada faria o 200 de hoje parecer normal, e o
    // detector ficaria cego exatamente depois do primeiro erro.
    const r = buildWeightReference(hist([
      { topWeight: 40 }, { topWeight: 42 }, { topWeight: 40 }, { topWeight: 200 },
    ]))
    expect(r['supino reto']).toBe(41)
    expect(detectWeightOutlier(200, r['supino reto'])?.direcao).toBe('acima')
  })

  it('a MÉDIA seria contaminada pelo mesmo dado — a mediana não é detalhe', () => {
    const items = [40, 42, 40, 200]
    const media = items.reduce((a, b) => a + b, 0) / items.length // 80,5
    const ref = buildWeightReference(hist(items.map(w => ({ topWeight: w }))))['supino reto']
    expect(ref).toBeLessThan(media)
    // com a média, 200 ÷ 80,5 = 2,48 < 4 → o erro passaria despercebido
    expect(detectWeightOutlier(200, media)).toBeNull()
    expect(detectWeightOutlier(200, ref)).not.toBeNull()
  })

  it('uma sessão só não vira referência', () => {
    expect(buildWeightReference(hist([{ topWeight: 40 }]))['supino reto']).toBeUndefined()
  })

  it('cai para avgWeight quando não há topWeight', () => {
    expect(buildWeightReference(hist([{ avgWeight: 30 }, { avgWeight: 34 }]))['supino reto']).toBe(32)
  })

  it('histórico inválido devolve mapa vazio sem estourar', () => {
    expect(buildWeightReference(null)).toEqual({})
    expect(buildWeightReference('lixo')).toEqual({})
    expect(buildWeightReference({ exercises: 'nada' })).toEqual({})
  })
})
