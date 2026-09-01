/**
 * Os dois bugs do modal de treino relatados em 24/08/2026, e o dado real que os
 * explicou.
 *
 * O exercício do print é o **"Crucifixo na máquina (peck deck)"**, e a nota
 * dele (conferida no banco) termina com:
 *
 *   "…DROP-SET **na última série**: até a falha → reduz 20-30% → continua sem
 *   descanso."
 *
 * Ou seja: o drop da série 3 **não é um dado da série**. É derivado da NOTA por
 * `shouldInjectDropSetForSet`, que injeta os estágios em `getPlannedSet` na
 * última série. Daí os dois sintomas, com a mesma raiz:
 *
 *  1. **"O botão de trocar para normal sumiu."** O seletor vivia dentro do
 *     `normalSet`; como a série era desenhada pelo `DropSetSet`, ele não
 *     existia — e não havia dado nenhum na série para desfazer.
 *  2. **"Escolhi apagar a 3 e ele apagou a que não era drop."** Apagou a 3
 *     certinho — só que a série 2 virou a ÚLTIMA e herdou o drop da nota. O
 *     drop continuava na tela, uma linha acima.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveSetMethodLabel,
  podeTrocarMetodoRapido,
  precisaCongelarMetodo,
  metodoParaCongelar,
  METODO_NORMAL_EXPLICITO,
  explicitSetMethod,
} from '../resolveSetMethod'

/** Como `getPlannedSet` devolve o drop injetado pela nota. */
const dropInjetadoPelaNota = [{ weight: null, reps: null }, { weight: null, reps: null }]

describe('resolveSetMethodLabel — o rótulo que o seletor mostra', () => {
  it('série sem nada é Normal', () => {
    expect(resolveSetMethodLabel({ log: {} })).toBe('')
  })

  it('drop VINDO DA NOTA é reconhecido — sem isto o app rotularia "Normal" numa série DROP', () => {
    expect(resolveSetMethodLabel({ log: {}, plannedConfig: dropInjetadoPelaNota })).toBe('Drop-Set')
  })

  it('a escolha explícita do usuário vence a nota', () => {
    expect(
      resolveSetMethodLabel({ log: { per_set_method: 'Normal' }, plannedConfig: dropInjetadoPelaNota })
    ).toBe('Normal')
  })

  it('reconhece os métodos por dado salvo na série', () => {
    expect(resolveSetMethodLabel({ log: { drop_set: { stages: [1] } } })).toBe('Drop-Set')
    expect(resolveSetMethodLabel({ log: { sistema21: {} } })).toBe('Sistema 21')
    expect(resolveSetMethodLabel({ log: { wave: {} } })).toBe('Onda')
    expect(resolveSetMethodLabel({ log: {}, isClusterConfig: true })).toBe('Cluster')
    expect(resolveSetMethodLabel({ log: {}, isRestPauseConfig: true })).toBe('Rest-Pause')
  })

  it('reconhece pelo método do EXERCÍCIO', () => {
    expect(resolveSetMethodLabel({ exerciseMethod: 'Drop-set', log: {} })).toBe('Drop-Set')
    expect(resolveSetMethodLabel({ exerciseMethod: 'Cardio', log: {} })).toBe('Cardio')
    expect(resolveSetMethodLabel({ exerciseMethod: 'Bi-Set', log: {} })).toBe('Bi-Set')
  })

  it('SST vindo da nota, na série alvo', () => {
    expect(resolveSetMethodLabel({ log: {}, sstFromNotes: true })).toBe('SST')
  })
})

describe('podeTrocarMetodoRapido', () => {
  it('oferece a troca nos métodos de série', () => {
    expect(podeTrocarMetodoRapido('Drop-Set', false)).toBe(true)
    expect(podeTrocarMetodoRapido('', false)).toBe(true)
  })

  it('não oferece em cardio e prancha — não têm peso/reps', () => {
    expect(podeTrocarMetodoRapido('Cardio', false)).toBe(false)
    expect(podeTrocarMetodoRapido('', true)).toBe(false)
  })

  it('GRUPO continua podendo trocar — o `groupMethodSet` já oferecia', () => {
    // Tirar seria remover função que existia; o que mudou é o LUGAR do seletor.
    expect(podeTrocarMetodoRapido('Bi-Set', false)).toBe(true)
  })
})

describe('congelar o método antes de remover uma série', () => {
  it('a série NORMAL de hoje precisa ser congelada — é ela que viraria drop', () => {
    // O caso do bug: série 2 é normal agora, e vira a última quando a 3 sai.
    const serie2 = { log: {} }
    expect(precisaCongelarMetodo(serie2)).toBe(true)
    expect(metodoParaCongelar(serie2)).toBe(METODO_NORMAL_EXPLICITO)
  })

  it('grava `Normal` EXPLÍCITO, nunca string vazia', () => {
    // `''` cai de volta na inferência: era o defeito do seletor antigo, que
    // gravava `per_set_method: ''` ao escolher "Normal" e não desfazia nada.
    expect(metodoParaCongelar({ log: {} })).toBe('Normal')
    expect(metodoParaCongelar({ log: {} })).not.toBe('')
  })

  it('quem já tem marcação explícita não é tocado', () => {
    expect(precisaCongelarMetodo({ log: { per_set_method: 'Cluster' } })).toBe(false)
  })

  it('congela o método que a série MOSTRAVA, não um padrão', () => {
    expect(metodoParaCongelar({ log: {}, plannedConfig: dropInjetadoPelaNota })).toBe('Drop-Set')
    expect(metodoParaCongelar({ log: { sistema21: {} } })).toBe('Sistema 21')
  })

  it('o congelamento sobrevive à mudança de posição — é o ponto da correção', () => {
    // Antes: série 2 sem marcação + nota "na última" → após remover a 3 ela
    // passa a ser a última e `plannedConfig` traz o drop injetado.
    const depoisDeVirarUltima = { log: { per_set_method: metodoParaCongelar({ log: {} }) }, plannedConfig: dropInjetadoPelaNota }
    expect(resolveSetMethodLabel(depoisDeVirarUltima)).toBe('Normal')
  })

  it('sem o congelamento, a série 2 viraria drop — o bug, reposto', () => {
    const semCongelar = { log: {}, plannedConfig: dropInjetadoPelaNota }
    expect(resolveSetMethodLabel(semCongelar)).toBe('Drop-Set')
  })
})

/**
 * Método salvo NO PLANO (`sets.per_set_method`, 01/09/2026).
 *
 * A escrita e a leitura são pontas diferentes: o "Salvar no plano" pode gravar
 * certo no banco e a série continuar desenhando Normal na sessão seguinte — foi
 * o risco desta entrega, porque quem roteia os 14 renderers lia SÓ o log.
 */
describe('método salvo no plano', () => {
    it('vale quando a sessão não tem escolha própria', () => {
        expect(resolveSetMethodLabel({ plannedMethod: 'Drop-Set' })).toBe('Drop-Set')
    })

    it('o log VENCE o plano — a escolha de hoje é mais recente que a permanente', () => {
        expect(resolveSetMethodLabel({
            log: { per_set_method: 'Normal' },
            plannedMethod: 'Drop-Set',
        })).toBe('Normal')
    })

    it('vence a inferência por config e por método do exercício', () => {
        expect(resolveSetMethodLabel({
            exerciseMethod: 'Drop-set',
            plannedMethod: 'Normal',
        })).toBe('Normal')
        expect(resolveSetMethodLabel({
            plannedConfig: [{ weight: 40 }],
            plannedMethod: 'Normal',
        })).toBe('Normal')
    })

    it('plano vazio não atrapalha a inferência de sempre', () => {
        expect(resolveSetMethodLabel({ exerciseMethod: 'FST-7', plannedMethod: '   ' })).toBe('FST-7')
    })
})

describe('congelar método antes de remover série', () => {
    it('série com método salvo no plano NÃO precisa congelar — a marca anda com ela', () => {
        expect(precisaCongelarMetodo({ plannedMethod: 'Normal' })).toBe(false)
    })
})

describe('explicitSetMethod', () => {
    it('log primeiro, plano depois', () => {
        expect(explicitSetMethod({ per_set_method: 'Cluster' }, { per_set_method: 'Drop-Set' })).toBe('Cluster')
        expect(explicitSetMethod({}, { per_set_method: 'Drop-Set' })).toBe('Drop-Set')
        expect(explicitSetMethod({}, { perSetMethod: 'Onda' })).toBe('Onda')
        expect(explicitSetMethod(null, null)).toBe('')
    })
})
