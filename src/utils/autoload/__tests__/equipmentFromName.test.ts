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
    // 'Rosca direta' saiu daqui de propósito: passou a ser barra implícita (é feita
    // na barra W/reta). Ver o bloco "barra implícita" no fim do arquivo.
    expect(inferEquipmentFromName('Elevação lateral')).toEqual([])
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
    expect(resolveIncrement(inferEquipmentFromName('Elevação lateral'))).toMatchObject({ increment: 2.5, equipmentClass: 'default' })
  })
})

/**
 * Regressão (reportada pelo dono: "não apareceu no meu iPhone"): a calculadora de
 * anilhas só aparece em exercício de classe `barbell`, mas a regra de barra exigia a
 * PALAVRA "barra" no nome. Os exercícios de barra em pt-BR não a têm — "Agachamento
 * livre", "Terra convencional", "Supino declinado", "Remada alta" — então o botão
 * praticamente nunca aparecia. Confirmado no catálogo real: 16 exercícios com
 * equipment=['barra'] não citam "barra" no display_name_pt.
 *
 * A inferência implícita só age quando NENHUM outro equipamento casou, senão
 * "Supino na máquina" viraria barra (o plateMath prioriza barbell sobre machine).
 */
describe('inferEquipmentFromName — barra implícita (nomes sem a palavra "barra")', () => {
  const BARBELL_NAMES = [
    'Agachamento livre', 'Agachamento frontal', 'Agachamento na caixa (box squat)',
    'Terra convencional', 'Terra romeno', 'Levantamento terra sumô',
    'Supino declinado', 'Supino fechado', 'Supino Reto',
    'Remada alta', 'Remada cavalinho', 'Remada Curvada',
    'Good morning', 'Levantamento olímpico (power clean)',
    'Rosca 21', 'Rosca inversa', 'Rosca direta',
    'Desenvolvimento militar',
  ]
  it.each(BARBELL_NAMES)('%s → barra', (name) => {
    expect(inferEquipmentFromName(name)).toContain('barra')
    expect(resolveIncrement(inferEquipmentFromName(name))).toMatchObject({ equipmentClass: 'barbell' })
  })

  /** O equipamento explícito no nome SEMPRE vence a inferência implícita. */
  const NOT_BARBELL: Array<[string, string]> = [
    ['Supino na máquina', 'maquina'],
    ['Supino reto com halteres', 'halteres'],
    ['Supino inclinado na máquina', 'maquina'],
    ['Remada baixa no cabo', 'cabo'],
    ['Agachamento com halteres (goblet)', 'halteres'],
    ['Agachamento Hack', 'maquina'],
    ['Agachamento com elástico', 'elastico'],
    ['Terra romeno com halteres', 'halteres'],
    ['Rosca martelo na corda (cabo)', 'cabo'],
    ['Rosca na barra fixa (chin-up)', 'peso_corporal'],
    ['Desenvolvimento com halteres', 'halteres'],
    ['Desenvolvimento na máquina', 'maquina'],
    ['Good morning com elástico', 'elastico'],
  ]
  it.each(NOT_BARBELL)('%s → %s (não vira barra)', (name, slug) => {
    const got = inferEquipmentFromName(name)
    expect(got).toContain(slug)
    expect(got).not.toContain('barra')
  })

  /**
   * Nomes ambíguos que o heurístico não classifica (seguem em `default`, como antes):
   * o que este guard trava é que a inferência implícita NÃO os arraste para barra.
   * Ensinar o heurístico a reconhecê-los como halter/máquina mudaria o incremento do
   * autoload (2,5 → 2 ou 5) e está fora do escopo desta correção.
   */
  it.each([
    'Remada serrote', 'Remada unilateral', 'Remada no TRX', 'Remada invertida',
    'Agachamento búlgaro', 'Rosca Scott', 'Rosca concentrada',
  ])('%s não é arrastado para barra', (name) => {
    expect(inferEquipmentFromName(name)).not.toContain('barra')
  })

  it('smith continua smith (é barbell, mas pelo caminho explícito)', () => {
    expect(inferEquipmentFromName('Agachamento smith')).toEqual(['smith'])
  })

  it('não infere barra em exercício que não é de barra nenhuma', () => {
    expect(inferEquipmentFromName('Elevação lateral')).toEqual([])
    expect(inferEquipmentFromName('Abdominal infra')).toEqual([])
  })
})
