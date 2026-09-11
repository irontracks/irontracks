/**
 * O que a voz do cardio fala, e quando.
 *
 * O invariante que o dono levantou ao pedir a feature: **o tempo é o do
 * exercício inteiro, somando os blocos.** Um cardio de 5 + 10 + 15 min narrado
 * por bloco diria "cinco minutos" duas vezes e nunca chegaria a trinta — o
 * caso `a série 5·10·15…` abaixo é a prova disso, e é ele que precisa ficar
 * vermelho se alguém trocar o total pelo relógio do bloco.
 */
import { describe, it, expect } from 'vitest'
import {
  fraseDoBloco,
  fraseDoMarco,
  marcoDeVozMinutos,
  numeroFalado,
  segundosJaFeitos,
  INTERVALOS_DE_VOZ_MIN,
} from '../vozDoCardio'

describe('segundosJaFeitos', () => {
  it('soma só os blocos CONCLUÍDOS', () => {
    const blocos = [
      { done: true, durationSeconds: 300 },
      { done: true, durationSeconds: 600 },
      { done: false, durationSeconds: 900 },
    ]
    expect(segundosJaFeitos(blocos)).toBe(900)
  })

  it('bloco que o motor só preencheu (sem done) não conta como tempo feito', () => {
    expect(segundosJaFeitos([{ durationSeconds: 600 }])).toBe(0)
  })

  it('aguenta lixo sem quebrar o cardio', () => {
    expect(segundosJaFeitos([null, 'x', { done: true, durationSeconds: 'abc' }, undefined])).toBe(0)
    expect(segundosJaFeitos(undefined as unknown as unknown[])).toBe(0)
  })
})

describe('marcoDeVozMinutos', () => {
  it('desligada (intervalo 0) nunca anuncia', () => {
    expect(marcoDeVozMinutos(3600, 0, 0)).toBeNull()
  })

  it('antes do primeiro marco, silêncio', () => {
    expect(marcoDeVozMinutos(4 * 60, 5, 0)).toBeNull()
  })

  it('no marco, anuncia', () => {
    expect(marcoDeVozMinutos(5 * 60, 5, 0)).toBe(5)
  })

  it('não repete o marco já anunciado a cada tique', () => {
    expect(marcoDeVozMinutos(5 * 60 + 30, 5, 5)).toBeNull()
  })

  it('app congelado: pula direto para o marco ATUAL, sem enfileirar os antigos', () => {
    // Estava em 3 min, voltou com 12. Sai "10 minutos" — não "5" e depois "10".
    expect(marcoDeVozMinutos(12 * 60, 5, 0)).toBe(10)
  })

  it('a série 5·10·15… atravessa os blocos — é o pedido do dono', () => {
    // Cardio de 5 + 10 + 15 min, voz a cada 5. O total é a régua: nenhum marco
    // se repete quando um bloco termina e outro começa.
    const anunciados: number[] = []
    let ultimo = 0
    for (let s = 1; s <= 30 * 60; s += 1) {
      const marco = marcoDeVozMinutos(s, 5, ultimo)
      if (marco != null) {
        anunciados.push(marco)
        ultimo = marco
      }
    }
    expect(anunciados).toEqual([5, 10, 15, 20, 25, 30])
  })

  it('a cada 10 min, a mesma série fica mais rala', () => {
    const anunciados: number[] = []
    let ultimo = 0
    for (let s = 1; s <= 30 * 60; s += 1) {
      const marco = marcoDeVozMinutos(s, 10, ultimo)
      if (marco != null) { anunciados.push(marco); ultimo = marco }
    }
    expect(anunciados).toEqual([10, 20, 30])
  })

  it('o catálogo de intervalos tem o desligado e os que o dono pediu', () => {
    expect(INTERVALOS_DE_VOZ_MIN).toContain(0)
    expect(INTERVALOS_DE_VOZ_MIN).toContain(5)
    expect(INTERVALOS_DE_VOZ_MIN).toContain(10)
  })
})

describe('as frases', () => {
  it('singular e plural', () => {
    expect(fraseDoMarco(1)).toBe('1 minuto')
    expect(fraseDoMarco(15)).toBe('15 minutos')
  })

  it('marco inválido não vira frase', () => {
    expect(fraseDoMarco(0)).toBe('')
    expect(fraseDoMarco(NaN)).toBe('')
  })

  it('decimal é falado com VÍRGULA — com ponto a voz lê "quatro ponto cinco"', () => {
    expect(numeroFalado(4.5)).toBe('4,5')
    expect(numeroFalado('4.5')).toBe('4,5')
    expect(numeroFalado('4,5')).toBe('4,5')
  })

  it('inteiro não ganha casa decimal', () => {
    expect(numeroFalado(5)).toBe('5')
    expect(numeroFalado('5.0')).toBe('5')
  })

  it('anúncio de bloco na esteira diz a velocidade em km/h', () => {
    expect(fraseDoBloco({ numero: 2, duracaoSegundos: 600, velocidade: '5', unidadeEhKmH: true }))
      .toBe('Bloco 2. 10 minutos a 5 quilômetros por hora.')
  })

  it('fora da esteira, a mesma frase fala de intensidade', () => {
    expect(fraseDoBloco({ numero: 3, duracaoSegundos: 900, velocidade: '12', unidadeEhKmH: false }))
      .toBe('Bloco 3. 15 minutos na intensidade 12.')
  })

  it('sem velocidade declarada, anuncia só o tempo', () => {
    expect(fraseDoBloco({ numero: 1, duracaoSegundos: 300 })).toBe('Bloco 1. 5 minutos.')
  })

  it('bloco sem número não vira frase', () => {
    expect(fraseDoBloco({ numero: 0, duracaoSegundos: 300 })).toBe('')
  })
})
