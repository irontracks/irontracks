/**
 * Deload utilizável — segunda rodada da auditoria (2026-07-29).
 *
 * A primeira rodada consertou a APLICAÇÃO (o autoload apagava a redução, séries
 * concluídas eram reescritas). Mas a ferramenta seguia inalcançável: em 543 sessões
 * concluídas, zero deloads. Os motivos não eram bugs, eram de desenho:
 *
 *  - o app calculava estagnação/regressão e só usava isso num placeholder cinza,
 *    que fica escondido atrás do valor do autoload — ou seja, nunca aparecia;
 *  - a análise "afirmava" cenário mesmo com 1 sessão de histórico, porque o mínimo
 *    de 4 treinos só trocava a palavra da frase, sem bloquear nada;
 *  - o deload reduzia o peso que estava na caixa, que já podia vir cortado pelo
 *    motor — os cortes se multiplicavam (0,88 × 0,90 × 0,78 ≈ 38%).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyzeDeloadHistory, getDeloadReason } from '../helpers/deloadHelpers'
import type { ReportHistoryItem } from '../types'

const hookSrc = readFileSync(resolve(process.cwd(), 'src/components/workout/hooks/useWorkoutDeload.ts'), 'utf8')
const cardSrc = readFileSync(resolve(process.cwd(), 'src/components/workout/ExerciseCard.tsx'), 'utf8')

const item = (ts: number, avgWeight: number, totalVolume: number): ReportHistoryItem => ({
  ts,
  avgWeight,
  avgReps: 10,
  totalVolume,
  topWeight: avgWeight,
  setsCount: 3,
})

describe('análise declara quando NÃO tem base (defeito do gatilho)', () => {
  it('com 1 sessão, hasEnoughHistory é false', () => {
    const a = analyzeDeloadHistory([item(1, 100, 3000)])
    expect(a.hasEnoughHistory).toBe(false)
    expect(a.itemsCount).toBe(1)
  })

  it('com 3 sessões ainda é false (mínimo é 4)', () => {
    const a = analyzeDeloadHistory([item(1, 100, 3000), item(2, 100, 3000), item(3, 100, 3000)])
    expect(a.hasEnoughHistory).toBe(false)
  })

  it('com 4+ sessões e deltas calculáveis, passa a ser true', () => {
    const a = analyzeDeloadHistory([
      item(1, 100, 3000),
      item(2, 100, 3000),
      item(3, 100, 3000),
      item(4, 100, 3000),
    ])
    expect(a.hasEnoughHistory).toBe(true)
    expect(a.itemsCount).toBe(4)
  })

  it('estagnação real é detectada com base suficiente', () => {
    const a = analyzeDeloadHistory([
      item(1, 100, 3000),
      item(2, 100, 3000),
      item(3, 100, 3010),
      item(4, 100, 3005),
      item(5, 100, 3000),
      item(6, 100, 3010),
    ])
    expect(a.hasEnoughHistory).toBe(true)
    expect(a.status).toBe('stagnation')
  })

  it('regressão real é detectada', () => {
    const a = analyzeDeloadHistory([
      item(1, 100, 4000),
      item(2, 100, 4000),
      item(3, 100, 4000),
      item(4, 80, 3000),
      item(5, 80, 3000),
      item(6, 78, 2900),
    ])
    expect(a.status).toBe('overtraining')
  })
})

describe('a frase não finge análise sem base', () => {
  it('sem base, não usa a construção "devido à <cenário>"', () => {
    const a = analyzeDeloadHistory([item(1, 100, 3000)])
    const reason = getDeloadReason(a, 0.12, a.itemsCount)
    expect(reason).not.toContain('devido à')
  })

  it('com base, volta a afirmar o cenário', () => {
    const a = analyzeDeloadHistory([
      item(1, 100, 3000),
      item(2, 100, 3000),
      item(3, 100, 3005),
      item(4, 100, 3000),
    ])
    const reason = getDeloadReason(a, 0.15, a.itemsCount)
    expect(reason).toContain('devido à')
    expect(reason).toContain('4 treinos')
  })
})

describe('alertas proativos existem e são conservadores', () => {
  it('o hook expõe deloadAlerts', () => {
    expect(hookSrc).toContain('const deloadAlerts = useMemo')
    expect(hookSrc).toMatch(/deloadAlerts,/)
  })

  it('só alerta com histórico suficiente', () => {
    expect(hookSrc).toMatch(/if \(!analysis\.hasEnoughHistory\) return/)
  })

  it('não alerta em progressão normal (só estagnação/regressão)', () => {
    expect(hookSrc).toMatch(/analysis\.status !== 'stagnation' && analysis\.status !== 'overtraining'/)
  })

  it('o card mostra o aviso e ele abre o modal de deload', () => {
    expect(cardSrc).toContain('deloadAlert')
    // janela larga de propósito: o bloco cresceu ao ganhar a ajuda e a explicação
    // do benefício. O que importa é o `openDeloadModal` estar DENTRO do aviso.
    expect(cardSrc).toMatch(/deloadAlert \? \([\s\S]{0,2000}openDeloadModal/)
  })

  it('o botão ganha rótulo quando há aviso (era ícone sem texto)', () => {
    expect(cardSrc).toMatch(/deloadAlert \?[\s\S]{0,200}Deload<\/span>/)
  })
})

// A regra de referência de corte migrou para `buildDeloadPatches` e é exercitada
// de verdade em deloadApply.test.ts (incluindo o caso real do Crucifixo, em que
// usar o template como referência fazia o deload AUMENTAR a carga).
