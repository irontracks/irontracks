import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * A armadilha do `planDays` vale aqui (ver CLAUDE.md, seção Nutrição):
 * `itensOriginais` é estado de TELA — a base fixa para reescalar quantidade
 * sem acumular arredondamento (`mealItemQuantity.ts`) — e NÃO pode vazar para
 * `nutrition_meal_entries.items`. `onSaveEdit` (`NutritionMixer.tsx`) precisa
 * continuar montando o payload CAMPO A CAMPO — `{ food_name, items }` —,
 * nunca por spread do draft inteiro (`{ ...draft, items }` incluiria
 * `itensOriginais` na chamada e, dali, no `jsonb` gravado no banco).
 *
 * Guard de FIAÇÃO, não de forma solta: isola o CORPO de `onSaveEdit` (chaves
 * balanceadas a partir do `{` que abre o arrow function) antes de casar a
 * chamada — sem isso, um `editMealAction` de outro lugar do arquivo poderia
 * dar falso-verde.
 */
describe('edição de refeição não vaza itensOriginais para o payload', () => {
  const src = readFileSync('src/components/dashboard/nutrition/NutritionMixer.tsx', 'utf8')

  const isolarBlocoBalanceado = (texto: string, indiceDeAbertura: number): string => {
    let i = texto.indexOf('{', indiceDeAbertura)
    if (i === -1) return ''
    const comeco = i
    let profundidade = 0
    for (; i < texto.length; i++) {
      if (texto[i] === '{') profundidade++
      else if (texto[i] === '}') {
        profundidade--
        if (profundidade === 0) return texto.slice(comeco, i + 1)
      }
    }
    return ''
  }

  const inicioDoHandler = src.indexOf('onSaveEdit={async () => {')
  const bloco = inicioDoHandler === -1 ? '' : isolarBlocoBalanceado(src, inicioDoHandler)

  // Se isto falhar, os casos abaixo não provam NADA — o `onSaveEdit` mudou de
  // forma (renomeado, virou função nomeada, etc.) e o guard precisa ser
  // atualizado antes de confiar nele de novo.
  it('encontrou e isolou o corpo de onSaveEdit', () => {
    expect(bloco).not.toBe('')
    expect(bloco).toContain('editingEntryId')
  })

  it('o caminho ONLINE (editMealAction) recebe exatamente { food_name, items }', () => {
    expect(bloco).toMatch(/editMealAction\(\s*id\s*,\s*\{\s*food_name:\s*draft\.food_name,\s*items\s*\}\s*\)/)
  })

  it('o caminho OFFLINE (queueNutritionEdit) recebe o mesmo payload restrito', () => {
    expect(bloco).toMatch(
      /queueNutritionEdit\(\s*\{\s*entryId:\s*id,\s*draft:\s*\{\s*food_name:\s*draft\.food_name,\s*items\s*\}\s*\}\s*\)/,
    )
  })

  it('nenhuma das duas chamadas espalha o draft inteiro (`...draft`)', () => {
    expect(bloco).not.toMatch(/editMealAction\(\s*id\s*,\s*\{\s*\.\.\.draft/)
    expect(bloco).not.toMatch(/draft:\s*\{\s*\.\.\.draft/)
  })
})
