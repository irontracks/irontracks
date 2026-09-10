import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { deloadReductionPct, isRealDeload } from '@/utils/report/sessionDeload'

/**
 * A MARCA de deload não prova descarga — a REDUÇÃO prova.
 *
 * A mesma pergunta ("esta série foi descarregada?") era respondida em duas
 * pontas, e as duas erravam igual, bastando o objeto `deload` existir:
 *
 *  1. `detectSessionDeload` — corrigido em #1097;
 *  2. `useWorkoutDeload`, no `hadDeload` do `reportHistory` — esta, que é a que
 *     faz `pickUsableHistory` DESCARTAR a sessão do motor de carga.
 *
 * Medido na sessão de 07/09/2026 do dono: pullover 35 → 35 kg e tríceps corda
 * 37,5 → 37,5, treinados em carga CHEIA, anunciavam 30 % e 25 % de descarga e
 * sumiam do histórico do motor.
 */
describe('deloadReductionPct — os pesos decidem', () => {
  it('sem redução real = 0, mesmo com percentual anunciado', () => {
    expect(deloadReductionPct({ originalWeight: 35, suggestedWeight: 35, reductionPct: 0.3 })).toBe(0)
    expect(isRealDeload({ originalWeight: 37.5, suggestedWeight: 37.5, reductionPct: 0.25 })).toBe(false)
  })

  it('peso subiu não é descarga', () => {
    expect(isRealDeload({ originalWeight: 80, suggestedWeight: 90, reductionPct: 0.2 })).toBe(false)
  })

  it('redução real vale, e é a dos pesos', () => {
    expect(deloadReductionPct({ originalWeight: 84, suggestedWeight: 60.5, reductionPct: 0.9 })).toBeCloseTo(1 - 60.5 / 84, 4)
    expect(isRealDeload({ originalWeight: 84, suggestedWeight: 60.5 })).toBe(true)
  })

  it('fallback pelo percentual quando faltam os pesos (logs antigos)', () => {
    expect(deloadReductionPct({ reductionPct: 0.2 })).toBeCloseTo(0.2, 4)
    expect(deloadReductionPct({ originalWeight: 100, reductionPct: 0.2 })).toBeCloseTo(0.2, 4)
  })

  it('lixo nunca vira descarga', () => {
    for (const v of [null, undefined, 0, '', 'x', [], {}, { reductionPct: 0 }, { reductionPct: 5 }]) {
      expect(isRealDeload(v)).toBe(false)
    }
  })
})

/**
 * GUARD DE CLASSE. O comportamento acima protege as duas pontas conhecidas; este
 * varre o repo atrás de uma TERCEIRA que volte a decidir pela mera existência do
 * objeto — foi assim que a segunda passou meses despercebida.
 *
 * Guard de forma não substitui teste de comportamento (lição do #1093 neste
 * repo), por isso ele vem ACOMPANHADO dos casos acima, não no lugar deles.
 */
const listarArquivos = (dir: string, out: string[] = []): string[] => {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '__tests__' || nome.startsWith('.')) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) listarArquivos(caminho, out)
    else if (/\.tsx?$/.test(nome)) out.push(caminho)
  }
  return out
}

describe('guard: ninguém decide deload pela existência da marca', () => {
  // `sessionDeload.ts` usa `isRec(log.deload)` como FILTRO e calcula a redução
  // logo em seguida com a fonte única — é o dono da regra, não uma cópia dela.
  const PERMITIDOS = ['src/utils/report/sessionDeload.ts']

  /**
   * Comentários saem antes da análise. A primeira versão deste guard acusou o
   * PRÓPRIO comentário que descreve o bug, e um `Boolean(context?.deload)` do
   * gerador de treino, que é flag de entrada e não marca de log. Guard que grita
   * em uso legítimo é guard que alguém desliga.
   */
  const semComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('nenhum arquivo novo decide deload pela existência da marca', () => {
    const raiz = join(process.cwd(), 'src')
    const suspeitos: string[] = []
    // A forma do defeito: a marca do LOG usada como CONDIÇÃO booleana. Extrair
    // um campo dela (`isObject(log.deload) ? log.deload.originalWeight : null`,
    // em deloadHelpers) é legítimo e não entra aqui.
    const DECISAO = /(?:if\s*\(|&&\s*|\|\|\s*|=\s*)(?:isObject|isRec|Boolean)\s*\(\s*[\w?.]*\blog\.deload\s*\)\s*(?:\)|&&|\|\||;|$)/m
    for (const arquivo of listarArquivos(raiz)) {
      const rel = arquivo.slice(process.cwd().length + 1)
      if (PERMITIDOS.includes(rel)) continue
      if (DECISAO.test(semComentarios(readFileSync(arquivo, 'utf8')))) suspeitos.push(rel)
    }
    expect(
      suspeitos,
      `Decida por redução REAL (isRealDeload), não pela existência da marca. ` +
        `Uma série marcada mas treinada em carga cheia seria descartada do motor de carga. ` +
        `Arquivos: ${suspeitos.join(', ')}`,
    ).toEqual([])
  })
})
