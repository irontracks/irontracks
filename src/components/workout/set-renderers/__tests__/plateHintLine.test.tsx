import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PlateHintLine } from '../PlateHintLine'
import type { PlateInventory } from '@/utils/plates/plateInventory'

/**
 * A dica "por lado" abaixo do campo de peso (pedido do dono, 04/08/2026).
 *
 * Os testes de `utils/plates/plateHint` provam a MATEMÁTICA. Estes provam que ela
 * chega à tela: o renderer normal precisa passar o valor DO CAMPO (não o do
 * autoload) e o inventário DO USUÁRIO (não o kit fixo) — cada um desses foi um
 * jeito real de a dica sair errada.
 */

const INV_DONO: PlateInventory = { counts: { '5': 7, '10': 8, '20': 30 }, barWeightKg: 20 }

describe('o que aparece na tela', () => {
  it('leg press 260 mostra as anilhas por lado', () => {
    render(<PlateHintLine exerciseName="Leg press 45º" weight="260" inventory={INV_DONO} />)
    expect(screen.getByText(/Por lado:/)).toBeTruthy()
    expect(screen.getByText(/6×20 \+ 1×10/)).toBeTruthy()
  })

  it('barra livre informa o peso da barra descontado', () => {
    render(<PlateHintLine exerciseName="Supino reto com barra" weight="100" inventory={INV_DONO} />)
    expect(screen.getByText(/barra 20kg/)).toBeTruthy()
  })

  it('máquina de anilha NÃO fala em barra — o número já é só a anilha', () => {
    const { container } = render(<PlateHintLine exerciseName="Leg press 45º" weight="260" inventory={INV_DONO} />)
    expect(container.textContent).not.toMatch(/barra/i)
  })

  it('avisa quando o inventário não fecha o peso exato', () => {
    const inv: PlateInventory = { counts: { '20': 10 }, barWeightKg: 0 }
    const { container } = render(<PlateHintLine exerciseName="Leg press 45º" weight="130" inventory={inv} />)
    expect(container.textContent).toMatch(/≈/)
  })
})

describe('silêncio é a resposta certa na maioria das séries', () => {
  it.each([
    ['Cadeira extensora', '80'],
    ['Puxada alta na polia', '60'],
    ['Supino com halteres', '30'],
    ['Supino no Smith', '100'],
  ])('%s não mostra dica', (name, w) => {
    const { container } = render(<PlateHintLine exerciseName={name} weight={w} inventory={INV_DONO} />)
    expect(container.textContent).toBe('')
  })

  it.each(['', '0', 'abc'])('peso "%s" não mostra dica', (w) => {
    const { container } = render(<PlateHintLine exerciseName="Leg press 45º" weight={w} inventory={INV_DONO} />)
    expect(container.textContent).toBe('')
  })
})

describe('fiação no renderer — o guard que o unitário não dá', () => {
  const normalSet = readFileSync(
    join(process.cwd(), 'src/components/workout/set-renderers/normalSet.tsx'),
    'utf8',
  )
  const code = normalSet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('o renderer normal renderiza a dica NOS DOIS ramos (unilateral e bilateral)', () => {
    /*
     * O `normalSet` tem duas árvores de JSX: `isUnilateral ? (...) : (...)`.
     * Na primeira tentativa a dica entrou só na do unilateral — leg press é
     * bilateral e ficou sem nada, com este guard VERDE porque ele só checava a
     * existência do componente no arquivo. Achado na tela do simulador.
     */
    const ocorrencias = (code.match(/<PlateHintLine/g) ?? []).length
    expect(ocorrencias).toBe(2)

    const ramoUnilateral = code.slice(code.indexOf('isUnilateral ? ('), code.indexOf(') : ('))
    const ramoBilateral = code.slice(code.indexOf(') : ('))
    expect(ramoUnilateral).toContain('<PlateHintLine')
    expect(ramoBilateral).toContain('<PlateHintLine')
  })

  it('passa o valor DO CAMPO, não a sugestão do autoload', () => {
    // `autoSuggestionWeight` alimenta a nota do autoload; a dica tem que seguir o
    // que o usuário digitou, senão ela mente assim que ele muda o peso.
    expect(code).toMatch(/<PlateHintLine[\s\S]*?weight=\{weightField\.value\}/)
    expect(code).not.toMatch(/<PlateHintLine[\s\S]*?weight=\{autoSuggestionWeight\}/)
  })

  it('passa o inventário do usuário, não o kit fixo', () => {
    expect(code).toMatch(/<PlateHintLine[\s\S]*?inventory=\{inventoryFromSettings\(settings\)\}/)
  })
})

describe('a família inteira — os 14 renderers, não só o normal', () => {
  /*
   * O CLAUDE.md abre a seção dos set-renderers dizendo que eles "divergem em
   * SILÊNCIO": cada um reimplementa peso/reps/concluir por conta própria, e o que
   * parece bug de um método quase sempre é a família fora de sincronia. A dica de
   * anilhas entrou primeiro só no `normalSet` — este guard existe para que os
   * outros 13 não fiquem para trás de novo, e para que um renderer NOVO não nasça
   * sem ela.
   */
  const DIR = join(process.cwd(), 'src/components/workout/set-renderers')

  /** Renderers que exibem carga. Cardio e prancha não têm peso — ficam fora. */
  const COM_PESO = [
    'normalSet', 'dropSetSet', 'restPauseSet', 'clusterSet', 'strippingSet',
    'groupMethodSet', 'fST7Set', 'heavyDutySet', 'forcedRepsSet',
    'negativeRepsSet', 'partialRepsSet', 'pontoZeroSet', 'sistema21Set', 'waveSet',
  ]

  it.each(COM_PESO)('%s mostra a dica de anilhas', (nome) => {
    const src = readFileSync(join(DIR, `${nome}.tsx`), 'utf8')
    expect(src).toContain('<PlateHintLine')
  })

  it.each(COM_PESO)('%s usa o inventário do usuário, não um kit fixo', (nome) => {
    const src = readFileSync(join(DIR, `${nome}.tsx`), 'utf8')
    expect(src).toContain('inventoryFromSettings(settings)')
  })

  it('a lista cobre TODO renderer com peso que existe no diretório', () => {
    /*
     * Sem isto, um renderer novo nasceria sem dica e sem ninguém notar — a lista
     * acima viraria papel de parede. `readdirSync` é a fonte da verdade.
     */
    const arquivos = readdirSync(DIR)
      .filter((f) => f.endsWith('.tsx') && !f.startsWith('_'))
      .map((f) => f.replace(/\.tsx$/, ''))
      // Peças compartilhadas, não renderers de método: elas não roteiam nenhum
      // método e não têm peso próprio para explicar. `AdvancedSetRow` é o molde
      // da linha; a dica de anilha continua sendo responsabilidade de cada
      // renderer, que a passa como filho.
      // `SetMethodPicker` entrou em 24/08/2026: é o seletor de método, usado
      // pelo card e pelo rodapé do normal — não roteia método nem tem peso.
      .filter((n) => !['AutoloadNote', 'FailureToggle', 'PlateHintLine', 'AdvancedSetRow', 'SetMethodPicker'].includes(n))

    // Cardio e plank não têm carga; qualquer outro renderer precisa estar na lista.
    const semPeso = ['cardioSet', 'plankSet']
    const esperados = arquivos.filter((n) => !semPeso.includes(n))
    expect([...esperados].sort()).toEqual([...COM_PESO].sort())
  })
})
