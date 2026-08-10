import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Card principal da aba NUTRIÇÃO (anel de calorias) e o respiro entre o overlay
 * e a barra de abas. Auditoria de design, ago/2026.
 *
 * Guards de fonte, não de render: o `NutritionMixer` monta meia aba (contextos,
 * fetch, offline) e exercitá-lo aqui provaria menos do que custa. O que cada
 * caso trava está no comentário — a leitura na tela é conferência visual.
 */
const MIXER = join(__dirname, '..', 'NutritionMixer.tsx')
const OVERLAY = join(__dirname, '..', 'NutritionOverlay.tsx')

const executavel = (arquivo: string): string =>
  readFileSync(arquivo, 'utf8')
    .replace(/\/\*[^]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

describe('respiro entre o overlay e a barra de abas', () => {
  /**
   * O overlay começa EXATAMENTE onde a barra termina (`top: … + 64px`) e a barra
   * projeta `shadow-2xl shadow-black/60` para baixo. Com `pt-4`, sobravam ~5pt de
   * ar visível e o navegador de data parecia grudado no menu — reportado pelo
   * dono olhando o app.
   */
  it('o conteúdo do overlay não encosta no menu', () => {
    const src = executavel(OVERLAY)
    const wrapper = src.match(/<div className="mx-auto w-full max-w-md[^"]*"/)
    expect(wrapper, 'o wrapper do conteúdo sumiu — o overlay foi reescrito').not.toBeNull()
    const pt = wrapper![0].match(/\bpt-(\d+)/)
    expect(pt, 'sem padding-top o conteúdo cola na barra').not.toBeNull()
    expect(parseFloat(pt![1]) * 4, 'a sombra da barra come ~25px; 16px não bastam')
      .toBeGreaterThanOrEqual(24)
  })
})

describe('hierarquia do card de calorias', () => {
  /**
   * O badge "85%" repetia em selo dourado o que o anel ao lado já desenha, e
   * ficava com MAIS destaque que o número acionável. Mesma redundância que saiu
   * das barras de macro.
   */
  it('o percentual não é repetido como selo ao lado do anel', () => {
    const src = executavel(MIXER)
    const hero = src.slice(src.indexOf('<CalorieRing'), src.indexOf('<CalorieRing') + 1800)
    expect(hero).not.toMatch(/\$\{caloriePct\}%/)
    expect(hero, 'o anel continua recebendo o percentual').toMatch(/pct=\{caloriePct\}/)
  })

  /**
   * No meio do dia a pergunta é "quanto ainda cabe", não "quanto já comi" — este
   * é o número que ganha peso; o consumido segue no centro do anel e a meta vira
   * contexto em cinza.
   */
  it('o restante é o elemento dominante do resumo', () => {
    const src = executavel(MIXER)
    const hero = src.slice(src.indexOf('<CalorieRing'), src.indexOf('<CalorieRing') + 1800)
    expect(hero).toMatch(/text-2xl font-black[^>]*>\s*\{Math\.round\(remaining\)\}/)
    expect(hero).toMatch(/kcal restantes/)
    expect(hero, 'a meta é contexto, não protagonista').toMatch(/text-xs text-neutral-500[^>]*>\s*de \{Math\.round\(safeGoals\.calories\)\} kcal/)
  })

  it('meta exatamente batida não vira "0 kcal restantes"', () => {
    const src = executavel(MIXER)
    const hero = src.slice(src.indexOf('<CalorieRing'), src.indexOf('<CalorieRing') + 1800)
    expect(hero).toMatch(/Meta batida/)
  })

  /** `emerald` não existe na paleta do app; o verde de status é `green-500`. */
  it('o verde é o da paleta, não emerald', () => {
    const src = executavel(MIXER)
    const hero = src.slice(src.indexOf('<CalorieRing'), src.indexOf('<CalorieRing') + 1800)
    expect(hero).not.toMatch(/emerald/)
  })

  /**
   * As notas de descanso/treino moravam na coluna de ~200px do resumo: doze
   * palavras num badge de 10px quebravam em duas linhas e empurravam o resto.
   */
  it('as notas do dia ficam fora da coluna estreita do resumo', () => {
    const src = executavel(MIXER)
    const fimDoFlex = src.indexOf('{isToday && safeNumber(restDayReduction) > 0 &&')
    const inicioDoResumo = src.indexOf('<CalorieRing')
    expect(fimDoFlex).toBeGreaterThan(inicioDoResumo)
    // A nota vem DEPOIS do fechamento da linha do anel + resumo.
    const entre = src.slice(inicioDoResumo, fimDoFlex)
    expect((entre.match(/<\/div>/g) || []).length, 'a nota continua dentro do resumo')
      .toBeGreaterThanOrEqual(4)
  })
})
