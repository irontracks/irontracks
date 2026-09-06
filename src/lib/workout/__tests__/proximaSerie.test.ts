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

/**
 * ⚠️ Os quatro achados do code review do #1076 — a primeira versão afirmava a
 * série ERRADA em 36px em três famílias de treino e discordava do card numa
 * quarta. Cada caso abaixo reproduz um deles com o formato REAL dos renderers.
 */
describe('code review #1076 — a tela não pode afirmar a série errada', () => {
  it('Bi-Set: depois do ÚLTIMO membro, a próxima é o PRIMEIRO na rodada seguinte', () => {
    // `groupMethodSet` só dispara o descanso ao concluir o último membro, com
    // `nextKey: null`, e a auto-alternância leva de volta ao primeiro.
    const biset = [
      { name: 'Supino', sets: 3, method: 'Bi-Set', setDetails: [{ weight: 80 }, { weight: 84 }, { weight: 84 }] },
      { name: 'Remada', sets: 3, method: 'Bi-Set', setDetails: [{ weight: 60 }, { weight: 60 }, { weight: 60 }] },
      { name: 'Rosca', sets: 3 },
    ]
    const p = descreverProximaSerie({ exercises: biset, exIdx: 1, setIdx: 0, kind: 'rest', nextKey: null })
    expect(p?.exerciseName).toBe('Supino')
    expect(p?.setLabel).toBe('2ª série')
    expect(p?.weight).toBe('84 kg')
  })

  it('Bi-Set: na ÚLTIMA rodada segue o fluxo padrão — o exercício depois do grupo', () => {
    const biset = [
      { name: 'Supino', sets: 3, method: 'Bi-Set' },
      { name: 'Remada', sets: 3, method: 'Bi-Set' },
      { name: 'Rosca', sets: 3 },
    ]
    const p = descreverProximaSerie({ exercises: biset, exIdx: 1, setIdx: 2, kind: 'rest', nextKey: null })
    expect(p?.exerciseName).toBe('Rosca')
    expect(p?.setLabel).toBe('1ª série')
  })

  it('o `nextKey` do renderer VENCE o cálculo por índice', () => {
    const p = descreverProximaSerie({ exercises: treino, exIdx: 0, setIdx: 0, kind: 'rest', nextKey: '1-0' })
    expect(p?.exerciseName).toBe('Crucifixo inclinado')
    expect(p?.setLabel).toBe('1ª série')
  })

  it('nextKey inválido é ignorado, não quebra', () => {
    const p = descreverProximaSerie({ exercises: treino, exIdx: 0, setIdx: 0, kind: 'rest', nextKey: 'lixo' })
    expect(p?.setLabel).toBe('2ª série')
  })

  it('cluster e rest_pause são descansos DENTRO da série: não há próxima', () => {
    // Anunciar "3ª série" com dois blocos da 2ª ainda pela frente é mentir para
    // quem está com a barra na mão.
    for (const kind of ['cluster', 'rest_pause']) {
      expect(descreverProximaSerie({ exercises: treino, exIdx: 0, setIdx: 0, kind }), kind).toBeNull()
    }
  })

  it('unilateral: lê L_weight/R_weight — lados iguais viram um número', () => {
    const p = descreverProximaSerie({
      exercises: treino,
      logs: { '0-1': { L_weight: '20', R_weight: '20', L_reps: '12', R_reps: '12' } },
      exIdx: 0,
      setIdx: 0,
    })
    expect(p?.weight).toBe('20 kg')
    expect(p?.reps).toBe('12')
  })

  it('unilateral: lados DIFERENTES aparecem os dois — a média seria um peso que não existe', () => {
    const p = descreverProximaSerie({
      exercises: treino,
      logs: { '0-1': { L_weight: '20', R_weight: '22' } },
      exIdx: 0,
      setIdx: 0,
    })
    expect(p?.weight).toBe('20 / 22 kg')
  })

  it('peso LIMPO pelo usuário (string vazia no log) não cai no plano — igual ao card', () => {
    // `normalSet` resolve `log.weight ?? plano`: '' é valor, não ausência. O
    // card fica em branco; a tela não pode dizer "84 kg" em negrito.
    const p = descreverProximaSerie({
      exercises: treino,
      logs: { '0-1': { weight: '', weightSource: 'user' } },
      exIdx: 0,
      setIdx: 0,
    })
    expect(p?.weight).toBe('')
  })

  it('peso AUSENTE do log (undefined) ainda cai no plano', () => {
    const p = descreverProximaSerie({
      exercises: treino,
      logs: { '0-1': { reps: '8' } },
      exIdx: 0,
      setIdx: 0,
    })
    expect(p?.weight).toBe('84 kg')
  })
})
