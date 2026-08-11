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
    /**
     * A cor saiu da asserção em 11/08/2026, e o motivo importa: este caso
     * travava `text-neutral-500` para garantir que a meta fosse SECUNDÁRIA — mas
     * neutral-500 mede 4.18:1 sobre #0a0a0a e reprova no WCAG AA. Ou seja, a
     * hierarquia estava sendo comprada com contraste ilegível.
     *
     * Hierarquia se faz com TAMANHO e PESO; cor é reforço, não a única alavanca.
     * O que o teste exige continua sendo o mesmo: o restante domina
     * (`text-2xl font-black`) e a meta é contexto (`text-xs`, sem negrito).
     */
    expect(hero, 'a meta é contexto, não protagonista').toMatch(/text-xs text-neutral-400[^>]*>\s*de \{Math\.round\(safeGoals\.calories\)\} kcal/)
    expect(hero, 'contexto não pode ganhar peso de protagonista').not.toMatch(/text-xs font-black[^>]*>\s*de \{Math\.round\(safeGoals\.calories\)\}/)
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

/**
 * "+0 kcal acima" — reportado pelo dono em 11/08/2026, com print da conta dele:
 * 2848 kcal consumidos, meta 2676. São 172 acima, e a tela dizia ZERO.
 *
 * Causa: `remaining` nascia clampado —
 *   `const remaining = Math.max(0, meta - consumido)`
 * O clamp existe para o ramo "restantes" (não faz sentido "−172 restantes"),
 * mas o ramo "acima" lia a MESMA variável. Com a meta estourada o clamp já
 * tinha apagado a informação: `Math.abs(0)` = 0.
 *
 * O sinal de que eram duas contas divergentes estava à vista: `calorieOver`
 * decide pelo `calorieRatio` (consumido/meta), enquanto o número saía do
 * `remaining` clampado. Rótulo de um lado, valor do outro.
 */
describe('estouro de meta mostra QUANTO estourou', () => {
  const src = executavel(MIXER)

  it('o excedente não pode sair do valor clampado em zero', () => {
    // `Math.max(0, ...)` no mesmo valor que alimenta o ramo "acima" é o bug.
    expect(src).not.toMatch(/\+\{Math\.round\(Math\.abs\(remaining\)\)\}/)
  })

  it('existe uma grandeza própria para o excedente', () => {
    expect(src).toMatch(/const excedenteCalorico/)
    expect(src).toMatch(/\+\{Math\.round\(excedenteCalorico\)\}/)
  })

  it('o saldo cru é a fonte dos dois ramos — uma conta, não duas', () => {
    // Rótulo e número tinham origens diferentes; é isso que os realinha.
    expect(src).toMatch(/const saldoCalorico = safeGoals\.calories - safeNumber\(totals\?\.calories\)/)
    expect(src).toMatch(/const remaining = Math\.max\(0, saldoCalorico\)/)
    expect(src).toMatch(/const excedenteCalorico = Math\.max\(0, -saldoCalorico\)/)
  })
})
