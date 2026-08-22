import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildLiveActivityAps, LIVE_ACTIVITY_RELEVANCE } from '@/lib/push/apnsLiveActivity'

/**
 * ORDEM DAS DUAS LIVE ACTIVITIES NA TELA BLOQUEADA (21/08/2026).
 *
 * Treino e descanso coexistem. Com relevância IGUAL (o default é 0 para todas),
 * o iOS empilha por ordem de início e o card do DESCANSO — o único que conta
 * para trás e tem botão — ficava EMBAIXO do card do treino. Quem decide é o
 * `relevanceScore`: maior fica em cima e leva a Ilha Dinâmica.
 *
 * A pegadinha que este arquivo existe para travar: a relevância mora no
 * CONTEÚDO da activity, não nos atributos. Qualquer update que esqueça o campo
 * volta ao default e derruba o card no meio do descanso — e são SETE pontos de
 * `ActivityContent` no plugin mais o update remoto por APNs.
 *
 * Se um destes falhar, NÃO relaxe a asserção.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const pluginSrc = read('ios/App/App/IronTracksNativePlugin.swift')
const attrsSrc = read('ios/App/App/RestTimerAttributes.swift')

/**
 * Reduz o Swift ao código EXECUTÁVEL: sem isso o guard casa com o comentário
 * que explica a regra e passa verde com a chamada nua (armadilha conhecida do
 * repo — "guard acusando o próprio comentário").
 */
function stripSwiftComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

/** Fatia cada chamada `ActivityContent(...)` pelo parêntese balanceado. */
function activityContentCalls(src: string): string[] {
  const code = stripSwiftComments(src)
  const calls: string[] = []
  const needle = 'ActivityContent('
  let from = 0
  for (;;) {
    const at = code.indexOf(needle, from)
    if (at === -1) break
    let depth = 0
    let end = at + needle.length - 1
    for (let i = at + needle.length - 1; i < code.length; i++) {
      const ch = code[i]
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    calls.push(code.slice(at, end + 1))
    from = end + 1
  }
  return calls
}

describe('Swift — toda ActivityContent carrega relevanceScore', () => {
  const calls = activityContentCalls(pluginSrc)

  it('o plugin ainda monta ActivityContent (o guard não ficou olhando o vazio)', () => {
    expect(calls.length).toBeGreaterThanOrEqual(7)
  })

  it('nenhuma chamada fica sem relevanceScore (update sem ele derruba o card)', () => {
    const semRelevancia = calls.filter((c) => !/relevanceScore\s*:/.test(c))
    expect(semRelevancia, `ActivityContent sem relevanceScore:\n${semRelevancia.join('\n---\n')}`).toEqual([])
  })

  it('o descanso usa a relevância de descanso; o treino, a de treino', () => {
    const rest = calls.filter((c) => /LiveActivityRelevance\.rest/.test(c))
    const workout = calls.filter((c) => /LiveActivityRelevance\.workout/.test(c))
    // Cada família tem pelo menos um start e um update.
    expect(rest.length).toBeGreaterThanOrEqual(3)
    expect(workout.length).toBeGreaterThanOrEqual(4)
    expect(rest.length + workout.length).toBe(calls.length)
  })

  it('a relevância do descanso é MAIOR que a do treino', () => {
    const num = (nome: string) => {
      const m = new RegExp(`static let ${nome}\\s*:\\s*Double\\s*=\\s*([0-9.]+)`).exec(stripSwiftComments(attrsSrc))
      expect(m, `LiveActivityRelevance.${nome} não encontrado`).toBeTruthy()
      return Number(m![1])
    }
    expect(num('rest')).toBeGreaterThan(num('workout'))
  })
})

describe('Push APNs — o update remoto não pode zerar a ordem', () => {
  it('o payload leva relevance-score', () => {
    const aps = buildLiveActivityAps(
      {
        kind: 'rest',
        event: 'update',
        contentState: { endDate: '2026-08-21T10:00:00.000Z', targetSeconds: 60, isFinished: false },
      },
      1_700_000_000,
    )
    expect(aps['relevance-score']).toBe(LIVE_ACTIVITY_RELEVANCE.rest)
  })

  it('descanso por push chega com relevância MAIOR que a do treino', () => {
    const restAps = buildLiveActivityAps(
      { kind: 'rest', event: 'update', contentState: { endDate: '2026-08-21T10:00:00.000Z', targetSeconds: 0, isFinished: true } },
      1,
    )
    const workoutAps = buildLiveActivityAps(
      {
        kind: 'workout',
        event: 'update',
        contentState: {
          currentExerciseName: 'Supino',
          currentSetIndex: 1,
          totalSetsForExercise: 4,
          totalSetsCompleted: 1,
          totalVolumeKg: 100,
        },
      },
      1,
    )
    expect(Number(restAps['relevance-score'])).toBeGreaterThan(Number(workoutAps['relevance-score']))
  })

  it('o valor do TS bate com o do Swift (fonte dupla, decisão única)', () => {
    const code = stripSwiftComments(attrsSrc)
    const swiftRest = Number(/static let rest\s*:\s*Double\s*=\s*([0-9.]+)/.exec(code)![1])
    const swiftWorkout = Number(/static let workout\s*:\s*Double\s*=\s*([0-9.]+)/.exec(code)![1])
    expect(LIVE_ACTIVITY_RELEVANCE.rest).toBe(swiftRest)
    expect(LIVE_ACTIVITY_RELEVANCE.workout).toBe(swiftWorkout)
  })
})
