import { describe, it, expect } from 'vitest'
import { inferEquipmentFromName } from '../equipmentFromName'
import { resolveIncrement } from '../plateMath'

// Nomes reais do exercise_library (consultados no banco).
describe('inferEquipmentFromName — nomes reais do catálogo', () => {
  const cases: Array<[string, string]> = [
    ['Chest press (máquina)', 'maquina'],
    ['Crucifixo na máquina (peck deck)', 'maquina'],
    ['Peck deck', 'maquina'],
    ['Crossover no cabo', 'cabo'],
    ['Crucifixo no cabo alto', 'cabo'],
    ['Supino reto com halteres', 'halteres'],
    ['Supino com pegada neutra (halteres)', 'halteres'],
    ['Supino com barra no chão', 'barra'],
    ['Supino Reto (Máquina/Smith)', 'maquina'], // máquina vence smith na ordem — ambos válidos
    ['Supino com elástico', 'elastico'],
    ['Flexão de braços', 'peso_corporal'],
    ['Flexão declinada', 'peso_corporal'],
  ]
  it.each(cases)('%s → contém %s', (name, expectedSlug) => {
    expect(inferEquipmentFromName(name)).toContain(expectedSlug)
  })
})

describe('inferEquipmentFromName — casos de borda', () => {
  it('barra fixa é peso corporal, não barra', () => {
    const slugs = inferEquipmentFromName('Barra fixa pronada')
    expect(slugs).toContain('peso_corporal')
    expect(slugs).not.toContain('barra')
  })

  it('smith é detectado', () => {
    expect(inferEquipmentFromName('Agachamento no Smith')).toContain('smith')
  })

  it('nome sem equipamento → vazio (cai no default seguro do plateMath)', () => {
    expect(inferEquipmentFromName('Rosca direta')).toEqual([])
    expect(inferEquipmentFromName('')).toEqual([])
    expect(inferEquipmentFromName(null)).toEqual([])
  })

  it('integra com plateMath: nome de máquina → passo 5', () => {
    expect(resolveIncrement(inferEquipmentFromName('Leg press 45'))).toMatchObject({ increment: 5 })
  })

  it('integra com plateMath: halteres → passo 2', () => {
    expect(resolveIncrement(inferEquipmentFromName('Rosca alternada com halteres'))).toMatchObject({ increment: 2 })
  })

  it('integra com plateMath: sem match → default 2,5', () => {
    expect(resolveIncrement(inferEquipmentFromName('Rosca direta'))).toMatchObject({ increment: 2.5, equipmentClass: 'default' })
  })
})
