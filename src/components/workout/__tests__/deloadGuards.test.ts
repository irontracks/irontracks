/**
 * Guards da ferramenta de DELOAD — auditoria de 2026-07-29.
 *
 * A auditoria achou uma feature cujo cálculo funcionava e cuja APLICAÇÃO não:
 * em 543 sessões concluídas, zero tinham deload aplicado, então nada disso nunca
 * apareceu em produção.
 *
 * Os cinco defeitos travados aqui:
 *  1. o peso reduzido era gravado sem `weightSource`, então a série continuava
 *     'auto' e o re-sync do autoload reescrevia a sugestão antiga por cima — a
 *     redução desaparecia no render seguinte, sem erro e sem log. A mesma classe
 *     já tinha sido corrigida em useWorkoutMethodSavers.ts:93 para os 13 savers
 *     de método avançado; o deload era o escritor que ficou fora;
 *  2. o loop reescrevia TODAS as séries, inclusive as já concluídas, falsificando
 *     retroativamente o peso levantado (e com ele volume, relatório e PDF);
 *  3. o campo de peso livre do modal não tinha teto: digitar acima do peso base
 *     fazia o "deload" AUMENTAR a carga em todas as séries;
 *  4. o campo `deload` do log era gravado e nunca lido, então uma sessão de deload
 *     entrava no histórico como treino normal e o motor a lia como regressão real;
 *  5. histórico e auditoria em localStorage com chave global, vazando entre contas
 *     no mesmo aparelho.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadDeloadHistory, saveDeloadHistory, appendDeloadAudit } from '../helpers/deloadHelpers'
import { pickUsableHistory } from '../hooks/useWorkoutAutoload'

const deloadSrc = readFileSync(resolve(process.cwd(), 'src/components/workout/hooks/useWorkoutDeload.ts'), 'utf8')

/**
 * O comportamento da aplicação (weightSource, skip de concluída, referência de
 * corte, piso, clamp do campo livre) é coberto de VERDADE em deloadApply.test.ts,
 * que importa e executa `buildDeloadPatches`/`clampDeloadWeight`.
 *
 * O que resta aqui é a FIAÇÃO: garantir que o hook usa esse núcleo testado em vez
 * de reimplementar a lógica inline — que foi exatamente como os bugs entraram.
 */
describe('deload — o hook usa o núcleo testado (fiação)', () => {
  it('delega o cálculo das séries a buildDeloadPatches', () => {
    expect(deloadSrc).toContain('buildDeloadPatches({')
    // e grava TODOS os patches devolvidos
    expect(deloadSrc).toMatch(/for \(const \{ key, patch \} of plan\.patches\) updateLog\(key, patch\)/)
  })

  it('delega o clamp do campo de peso a clampDeloadWeight', () => {
    expect(deloadSrc).toContain('clampDeloadWeight(')
  })

  it('não reimplementa a lógica inline (senão o núcleo testado é contornado)', () => {
    expect(deloadSrc).not.toMatch(/weightSource: 'user',[\s\S]{0,200}deload: \{/)
    expect(deloadSrc).not.toContain('const alreadyDone')
  })

  it('avisa o usuário quando pulou séries concluídas', () => {
    expect(deloadSrc).toMatch(/skippedDone > 0/)
    expect(deloadSrc).toMatch(/já concluída/)
  })
})

describe('deload — falha de aplicação é investigável', () => {
  it("o catch do apply reporta ao Sentry (logError), não só alerta o usuário", () => {
    expect(deloadSrc).toMatch(/logError\('deload:apply'/)
  })
})

describe('sessão de deload não conta como regressão para o motor (defeito 4)', () => {
  const SESSAO_DELOAD = {
    ts: 3000,
    deloadApplied: true,
    setWeights: [60, 60, 60],
    setReps: [12, 12, 12],
    setRpes: [6, 6, 6],
    setFailures: null,
  }
  const SESSAO_NORMAL = {
    ts: 2000,
    setWeights: [100, 100],
    setReps: [8, 8],
    setRpes: [9, 9],
    setFailures: null,
  }

  it('marca o item de histórico quando houve deload no exercício', () => {
    expect(deloadSrc).toMatch(/isObject\(log\.deload\)\) hadDeload = true/)
    expect(deloadSrc).toMatch(/deloadApplied: hadDeload \? true : undefined/)
  })

  it('o motor pula a sessão de deload e usa o último treino normal', () => {
    const history = pickUsableHistory([SESSAO_DELOAD, SESSAO_NORMAL])
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ weight: 100, reps: 8 })
  })

  it('mas usa o deload se for o ÚNICO histórico (melhor que não sugerir nada)', () => {
    const history = pickUsableHistory([SESSAO_DELOAD])
    expect(history).toHaveLength(3)
    expect(history[0]).toMatchObject({ weight: 60, reps: 12 })
  })

  it('sem marcação, segue usando a sessão mais recente', () => {
    const recente = { ...SESSAO_DELOAD, deloadApplied: undefined }
    const history = pickUsableHistory([recente, SESSAO_NORMAL])
    expect(history[0]).toMatchObject({ weight: 60, reps: 12 })
  })
})

describe('persistência do deload é escopada por usuário (defeito 5)', () => {
  beforeEach(() => window.localStorage.clear())

  it('não mistura o histórico de duas contas no mesmo aparelho', () => {
    const hA = { version: 1, exercises: { supino: { name: 'Supino', items: [{ ts: 1, avgWeight: 100, avgReps: 8, totalVolume: 800, topWeight: 100, setsCount: 1 }] } } }
    saveDeloadHistory(hA, 'user-A')
    expect(Object.keys(loadDeloadHistory('user-A').exercises)).toContain('supino')
    // a outra conta não vê nada
    expect(Object.keys(loadDeloadHistory('user-B').exercises)).toHaveLength(0)
  })

  it('não mistura a trilha de auditoria entre contas', () => {
    appendDeloadAudit({ ts: 1, name: 'Supino' }, 'user-A')
    const rawA = window.localStorage.getItem('irontracks.deload.audit.v1.user-A')
    const rawB = window.localStorage.getItem('irontracks.deload.audit.v1.user-B')
    expect(rawA).toContain('Supino')
    expect(rawB).toBeNull()
  })

  it('sem userId cai na chave legada (não perde dado de quem já tinha)', () => {
    appendDeloadAudit({ ts: 1, name: 'Legado' })
    expect(window.localStorage.getItem('irontracks.deload.audit.v1')).toContain('Legado')
  })
})
