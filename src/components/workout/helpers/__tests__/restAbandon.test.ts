/**
 * Guard do teto do descanso.
 *
 * O contador de "além do planejado" não tinha limite: no teste de 10 passos
 * (15/08/2026) a barra exibia "+286:32 além do planejado", em verde, ocupando o
 * rodapé e empurrando o WorkoutFooter para cima.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldAbandonRest, REST_ABANDON_EXTRA_SECONDS } from '../restAutoAdvance'

describe('shouldAbandonRest', () => {
  it('descanso normal não é encerrado — nem estourado por alguns minutos', () => {
    expect(shouldAbandonRest({ extraSeconds: 0, isExerciseTimer: false })).toBe(false)
    expect(shouldAbandonRest({ extraSeconds: 45, isExerciseTimer: false })).toBe(false)
    // 5 min a mais é gente conversando na academia, não gente que sumiu.
    expect(shouldAbandonRest({ extraSeconds: 5 * 60, isExerciseTimer: false })).toBe(false)
  })

  it('passa de 15 min além do planejado: encerra', () => {
    expect(shouldAbandonRest({ extraSeconds: 15 * 60, isExerciseTimer: false })).toBe(true)
    expect(shouldAbandonRest({ extraSeconds: 286 * 60, isExerciseTimer: false })).toBe(true)
  })

  it('a fronteira está no minuto 15 exato', () => {
    // Literais, não a constante: assertar contra REST_ABANDON_EXTRA_SECONDS
    // moveria a expectativa junto com o valor (guard tautológico).
    expect(shouldAbandonRest({ extraSeconds: 15 * 60 - 1, isExerciseTimer: false })).toBe(false)
    expect(shouldAbandonRest({ extraSeconds: 15 * 60, isExerciseTimer: false })).toBe(true)
    expect(REST_ABANDON_EXTRA_SECONDS).toBe(900)
  })

  it('CARDIO e PRANCHA nunca são encerrados por tempo — é exercício, não descanso', () => {
    // Uma corrida de 40 min é uso legítimo do cronômetro. Encerrá-la apagaria a
    // medição de um exercício em andamento: dano real, não incômodo.
    expect(shouldAbandonRest({ extraSeconds: 40 * 60, isExerciseTimer: true })).toBe(false)
    expect(shouldAbandonRest({ extraSeconds: 286 * 60, isExerciseTimer: true })).toBe(false)
  })

  it('valor inválido não encerra nada', () => {
    expect(shouldAbandonRest({ extraSeconds: NaN, isExerciseTimer: false })).toBe(false)
    expect(shouldAbandonRest({ extraSeconds: Infinity, isExerciseTimer: false })).toBe(false)
  })
})

describe('fiação do teto no RestTimerOverlay', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'RestTimerOverlay.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  /** Só o corpo do efeito de abandono — do `useEffect` que chama a decisão até
   *  o fim da sua lista de dependências. */
  const blocoDoAbandono = (fonte: string) => {
    const ini = fonte.search(/shouldAbandonRest\s*\(\s*\{/)
    expect(ini, 'a chamada de shouldAbandonRest sumiu do overlay').toBeGreaterThan(-1)
    const fim = fonte.indexOf('[timeLeft, isExerciseTimer]', ini)
    expect(fim, 'as dependências do efeito de abandono mudaram').toBeGreaterThan(ini)
    return fonte.slice(ini, fim)
  }

  it('o overlay CHAMA a decisão — import órfão não encerra descanso nenhum', () => {
    expect(src).toMatch(/shouldAbandonRest\s*\(\s*\{/)
  })

  it('encerra pelo onFinish, que NÃO avança para a próxima série', () => {
    // `onStart` avançaria a série sozinho. Quem sumiu por 15 min não quer que o
    // app decida por ele qual série começou.
    // Fatia a partir da CHAMADA, não do import: `indexOf('shouldAbandonRest')`
    // casa primeiro com a linha de import e arrastaria o arquivo inteiro para
    // dentro do bloco — o guard passaria a medir o handleStart, que legitimamente
    // usa onStartRef.
    const bloco = blocoDoAbandono(src)
    expect(bloco).toMatch(/onFinishRef\.current/)
    expect(bloco).not.toMatch(/onStartRef\.current/)
  })

  it('encerra UMA vez só (o efeito roda a cada segundo do ticker)', () => {
    expect(blocoDoAbandono(src)).toMatch(/abandonedRef\.current/)
  })

  it('deixa rastro pesquisável quando desiste', () => {
    // Saída silenciosa em caminho crítico é bomba-relógio: sem o log, um teto
    // disparando cedo demais em produção seria invisível.
    expect(src).toMatch(/logWarnRemote\('workout\.rest\.abandoned'/)
  })
})
