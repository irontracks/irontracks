/**
 * Método avançado escolhido no editor tem de nascer COM as etapas.
 *
 * Queixa do dono (30/07): "os exercícios avançados tipo rest-pause, drop e etc.
 * devem estar preenchidos já com os mini sets. Toda vez que eu vou fazer eu
 * preciso preencher".
 *
 * Causa: o editor tinha DOIS controles independentes —
 *   • o dropdown de método do exercício (topo), que gravava `advanced_config: null`;
 *   • um segundo seletor escondido dentro de cada linha "Série N", que era o único
 *     que criava a configuração.
 * Como quase ninguém acha o segundo, o método virava só um RÓTULO: o app sabia que
 * a série era drop-set/rest-pause e ela chegava sem etapa nenhuma no treino.
 */
import { describe, it, expect } from 'vitest'
import { defaultAdvancedConfigForMethod, methodHasStages } from '../helpers/editorMethod'

describe('defaultAdvancedConfigForMethod', () => {
  it('drop-set nasce com uma queda configurada', () => {
    expect(defaultAdvancedConfigForMethod('Drop-set')).toEqual([{ weight: null, reps: '' }])
  })

  it('rest-pause nasce com mini-sets e descanso definidos', () => {
    expect(defaultAdvancedConfigForMethod('Rest-Pause')).toMatchObject({ mini_sets: 2, rest_time_sec: 20 })
  })

  it('cluster nasce configurado (antes nem existia caminho de criação na UI)', () => {
    expect(defaultAdvancedConfigForMethod('Cluster')).toMatchObject({
      total_reps: 12,
      cluster_size: 3,
      intra_rest_sec: 15,
    })
  })

  it('métodos sem etapas continuam sem config', () => {
    expect(defaultAdvancedConfigForMethod('Normal')).toBeNull()
    expect(defaultAdvancedConfigForMethod('Bi-Set')).toBeNull()
    expect(defaultAdvancedConfigForMethod('Cardio')).toBeNull()
    expect(defaultAdvancedConfigForMethod('')).toBeNull()
  })

  it('aceita as grafias que chegam de treinos importados/gerados', () => {
    // canonicalEditorMethod já normaliza; o default tem de seguir a mesma regra
    expect(defaultAdvancedConfigForMethod('drop-set')).not.toBeNull()
    expect(defaultAdvancedConfigForMethod('Drop-Set')).not.toBeNull()
    expect(defaultAdvancedConfigForMethod('dropset')).not.toBeNull()
    expect(defaultAdvancedConfigForMethod('drop set')).not.toBeNull()
  })

  it('devolve um objeto NOVO a cada chamada', () => {
    // o mesmo default vai para várias séries; compartilhar a referência faria
    // editar uma série alterar as outras
    const a = defaultAdvancedConfigForMethod('Rest-Pause')
    const b = defaultAdvancedConfigForMethod('Rest-Pause')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)

    const d1 = defaultAdvancedConfigForMethod('Drop-set') as unknown[]
    const d2 = defaultAdvancedConfigForMethod('Drop-set') as unknown[]
    expect(d1).not.toBe(d2)
    expect(d1[0]).not.toBe(d2[0])
  })
})

describe('methodHasStages', () => {
  it('separa os métodos que têm etapas dos que não têm', () => {
    expect(methodHasStages('Drop-set')).toBe(true)
    expect(methodHasStages('Rest-Pause')).toBe(true)
    expect(methodHasStages('Cluster')).toBe(true)
    expect(methodHasStages('Normal')).toBe(false)
    expect(methodHasStages('Bi-Set')).toBe(false)
  })
})
