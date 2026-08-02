import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Refeição DUPLICADA quando o recálculo do dia falha.
 *
 * O trackMeal faz 3 round-trips independentes, sem transação:
 *   1. INSERT da entry
 *   2. SELECT de todas as entries do dia (pra somar)
 *   3. UPSERT do total em daily_nutrition_logs
 *
 * O passo 3 já era não-fatal, com o motivo certo escrito no código ("entry was
 * saved, daily log update failed — don't throw"). Mas o passo 2 LANÇAVA, na mesma
 * situação: a entry já commitou.
 *
 * Resultado: timeout do pooler no passo 2 → o usuário via "Falha ao processar" com
 * a refeição JÁ salva → reenviava → como o caminho online não carimba clientId
 * (logMealAction/applyGeneratedMealAction/logBarcodeAction chamam trackMeal sem
 * ele), o segundo insert virava linha NOVA. Refeição em dobro e total inflado.
 *
 * Errar o agregado é barato — ele se autocorrige na próxima mutação do dia.
 * Duplicar refeição, não.
 */
const engine = readFileSync(join(process.cwd(), 'src/lib/nutrition/engine.ts'), 'utf8')
const mixer = readFileSync(
  join(process.cwd(), 'src/components/dashboard/nutrition/NutritionMixer.tsx'),
  'utf8',
)

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const code = stripComments(engine)

describe('trackMeal — falha no recálculo não pode custar uma refeição duplicada', () => {
  it('o SELECT do recálculo NÃO lança (a entry já está gravada)', () => {
    expect(code).not.toContain("throw new Error(sumError.message")
    expect(code).not.toContain('nutrition_sum_entries_failed')
  })

  it('devolve a entry gravada em vez de erro', () => {
    const branch = code.slice(code.indexOf('if (sumError)'), code.indexOf('const entriesList'))
    expect(branch).toContain('return {')
    expect(branch).toContain('entry_id: insertedEntry?.id')
  })

  it('não grava total zerado no daily_nutrition_logs (sai antes do upsert)', () => {
    const sumIdx = code.indexOf('if (sumError)')
    const branchEnd = code.indexOf('const entriesList')
    expect(code.slice(sumIdx, branchEnd)).not.toContain('.upsert(')
  })

  it('o passo 3 continua não-fatal (era o precedente certo)', () => {
    expect(code).toContain('if (upsertError)')
    const branch = code.slice(code.indexOf('if (upsertError)'), code.indexOf('if (upsertError)') + 260)
    expect(branch).not.toContain('throw')
  })
})

describe('a UI aguenta o total zerado que esse caminho devolve', () => {
  it('o Mixer só aplica setTotals quando algum total é > 0', () => {
    // É isto que faz o anel manter o valor atual em vez de piscar zero quando o
    // recálculo falhou. Se este guard cair, o retorno zerado vira bug visível.
    expect(mixer.replace(/\s+/g, ' ')).toContain(
      'if (nt.calories || nt.protein || nt.carbs || nt.fat) setTotals(nt)',
    )
  })
})
