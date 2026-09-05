/**
 * Guards de `descreverProximaSerie` — o que a tela de fim de descanso mostra.
 *
 * O caso que importa é a PRECEDÊNCIA do peso: o log vence o plano, porque o log
 * é o que o campo daquela série mostra neste instante (inclusive a sugestão que
 * o motor de carga acabou de escrever). Divergir disso faria a tela de descanso
 * prometer um número e o card entregar outro.
 */
import { describe, it, expect } from 'vitest'
import { descreverProximaSerie } from '../proximaSerie'

const ex = (name: string, sets: number, setDetails?: Array<Record<string, unknown>>) => ({
  name,
  sets,
  ...(setDetails ? { setDetails } : {}),
})

const treino = [
  ex('Chest press máquina', 4, [
    { set_number: 1, weight: 80, reps: '6-10', rpe: 8 },
    { set_number: 2, weight: 84, reps: '6-10', rpe: 8 },
    { set_number: 3, weight: 84, reps: '6-10', rpe: 9 },
    { set_number: 4, weight: 84, reps: '6-10', rpe: 9 },
  ]),
  ex('Crucifixo inclinado', 3, [
    { set_number: 1, weight: 22, reps: '12', rpe: 7 },
  ]),
]

describe('qual é a próxima série', () => {
  it('próxima série do MESMO exercício', () => {
    const p = descreverProximaSerie({ exercises: treino, exIdx: 0, setIdx: 0 })
    expect(p?.exerciseName).toBe('Chest press máquina')
    expect(p?.setLabel).toBe('2ª série')
    expect(p?.label).toBe('2ª série de Chest press máquina')
  })

  it('acabou o exercício → primeira série do seguinte', () => {
    const p = descreverProximaSerie({ exercises: treino, exIdx: 0, setIdx: 3 })
    expect(p?.exerciseName).toBe('Crucifixo inclinado')
    expect(p?.setLabel).toBe('1ª série')
  })

  it('última série do último exercício devolve null', () => {
    // Anunciar um "próximo" que não existe é pior que ficar em silêncio.
    expect(descreverProximaSerie({ exercises: treino, exIdx: 1, setIdx: 2 })).toBeNull()
  })

  it('índice inválido não inventa nada', () => {
    expect(descreverProximaSerie({ exercises: treino, exIdx: -1, setIdx: 0 })).toBeNull()
    expect(descreverProximaSerie({ exercises: treino, exIdx: 0, setIdx: -1 })).toBeNull()
    expect(descreverProximaSerie({ exercises: [], exIdx: 0, setIdx: 0 })).toBeNull()
    expect(descreverProximaSerie({ exercises: null, exIdx: 0, setIdx: 0 })).toBeNull()
  })

  it('conta as séries pelo MAIOR entre o cabeçalho e os detalhes', () => {
    // Exercício com `sets: 2` e 4 detalhes: quem manda é o maior, senão a 3ª
    // série existiria no card e sumiria daqui.
    const curto = [ex('Rosca', 2, [{}, {}, {}, {}]), ex('Tríceps', 3)]
    expect(descreverProximaSerie({ exercises: curto, exIdx: 0, setIdx: 2 })?.setLabel).toBe('4ª série')
  })
})

describe('⚠️ carga, reps e RPE — o dado que faltava na tela', () => {
  it('sem log, usa o que está PLANEJADO', () => {
    const p = descreverProximaSerie({ exercises: treino, exIdx: 0, setIdx: 0 })
    expect(p?.weight).toBe('84 kg')
    expect(p?.reps).toBe('6-10')
    expect(p?.rpe).toBe('8')
  })

  it('o LOG vence o plano — é o que o campo da série mostra agora', () => {
    // 88 no log (o motor sugeriu, ou o usuário digitou) contra 84 no plano.
    const p = descreverProximaSerie({
      exercises: treino,
      logs: { '0-1': { weight: '88', reps: '8', rpe: '9' } },
      exIdx: 0,
      setIdx: 0,
    })
    expect(p?.weight).toBe('88 kg')
    expect(p?.reps).toBe('8')
    expect(p?.rpe).toBe('9')
  })

  it('log de OUTRA série não contamina', () => {
    const p = descreverProximaSerie({
      exercises: treino,
      logs: { '0-0': { weight: '200' } },
      exIdx: 0,
      setIdx: 0,
    })
    expect(p?.weight).toBe('84 kg')
  })

  it('vírgula decimal do pt-BR e meio quilo', () => {
    const p = descreverProximaSerie({
      exercises: treino,
      logs: { '0-1': { weight: '84,5' } },
      exIdx: 0,
      setIdx: 0,
    })
    expect(p?.weight).toBe('84,5 kg')
  })

  it('peso ausente, zero ou lixo devolve string VAZIA — nunca "0 kg"', () => {
    // A tela esconde o bloco quando não há dado. Inventar 0 afirmaria uma
    // medição que ninguém fez.
    for (const w of [undefined, null, '', 0, '0', 'abc', -5]) {
      const p = descreverProximaSerie({
        exercises: [ex('X', 2, [{}, { weight: w }])],
        exIdx: 0,
        setIdx: 0,
      })
      expect(p?.weight, String(w)).toBe('')
    }
  })

  it('série sem detalhe nenhum devolve os campos vazios, não quebra', () => {
    const p = descreverProximaSerie({ exercises: [ex('Prancha', 3)], exIdx: 0, setIdx: 0 })
    expect(p?.setLabel).toBe('2ª série')
    expect(p?.weight).toBe('')
    expect(p?.reps).toBe('')
    expect(p?.rpe).toBe('')
  })

  it('aceita `set_details` (snake_case) como o banco devolve', () => {
    const p = descreverProximaSerie({
      exercises: [{ name: 'Remada', sets: 2, set_details: [{}, { weight: 60, reps: '10' }] }],
      exIdx: 0,
      setIdx: 0,
    })
    expect(p?.weight).toBe('60 kg')
    expect(p?.reps).toBe('10')
  })
})
