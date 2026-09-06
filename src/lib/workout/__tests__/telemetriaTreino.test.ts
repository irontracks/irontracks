import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Telemetria do treino ativo (06/09/2026).
 *
 * Três coisas travadas aqui:
 *  1. o envelope — todo evento sai com `type: 'workout'` e `screen:
 *     'active_workout'`, que é o filtro que o painel usa;
 *  2. a fiação — cada evento do catálogo tem ao menos UM ponto de emissão no
 *     arquivo que o motivou (catálogo sem emissor é instrumentação de papel);
 *  3. a classe — ninguém fora do módulo digita `trackUserEvent('workout_…')`
 *     à mão; nome solto é como `metadata.ms` vs `dwellMs` nasceu.
 */
const track = vi.fn()
// `falhar` simula a rede/fila quebrando DENTRO do trackUserEvent. É função
// plana, não `vi.fn().mockImplementation(throw)`: o Vitest 4 re-lança o erro
// gravado num spy ao fim do caso mesmo com ele capturado pelo código (medido).
let falhar = false
vi.mock('@/lib/telemetry/userActivity', () => ({
  trackUserEvent: (...a: unknown[]) => { if (falhar) throw new Error('rede caiu'); return track(...a) },
}))

const SRC = join(process.cwd(), 'src')
const ler = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

/** Onde cada evento PRECISA ser emitido — a fiação que o card/handler motivou. */
const PONTOS: Array<[chave: string, arquivo: string]> = [
  ['serieConcluida', 'components/workout/useActiveWorkoutController.ts'],
  ['notaAbrir', 'components/workout/useActiveWorkoutController.ts'],
  ['exercicioAdiar', 'components/workout/useActiveWorkoutController.ts'],
  ['trocaAplicar', 'components/workout/hooks/useWorkoutExerciseCrud.ts'],
  ['descansoIniciar', 'components/workout/RestTimerOverlay.tsx'],
  ['metodoDaSerie', 'components/workout/set-renderers/SetMethodPicker.tsx'],
  ['trocaAbrir', 'components/workout/AIExerciseSwap.tsx'],
  ['midiaAnexar', 'components/workout/SetMediaAttach.tsx'],
]

const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function* arquivosTs(dir: string): Generator<string> {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) { if (nome !== 'node_modules') yield* arquivosTs(p); continue }
    if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) yield p
  }
}

beforeEach(() => { track.mockReset(); falhar = false })

describe('rastrearTreino — envelope', () => {
  it('sai com type workout, screen active_workout e o metadata', async () => {
    const { rastrearTreino, EVENTOS_TREINO } = await import('../telemetriaTreino')
    rastrearTreino(EVENTOS_TREINO.serieConcluida, { hasReps: false })
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('workout_set_done', {
      type: 'workout',
      screen: 'active_workout',
      metadata: { hasReps: false },
    })
  })

  it('nunca lança — está dentro do handler de concluir série', async () => {
    falhar = true
    const { rastrearTreino, EVENTOS_TREINO } = await import('../telemetriaTreino')
    let lancou = false
    try { rastrearTreino(EVENTOS_TREINO.descansoIniciar) } catch { lancou = true }
    expect(lancou).toBe(false)
  })

  it('todo nome do catálogo tem o prefixo workout_ e é único', async () => {
    const { EVENTOS_TREINO } = await import('../telemetriaTreino')
    const nomes = Object.values(EVENTOS_TREINO)
    for (const n of nomes) expect(n).toMatch(/^workout_[a-z_]+$/)
    expect(new Set(nomes).size).toBe(nomes.length)
  })
})

describe('fiação — cada evento é emitido de onde nasceu', () => {
  it.each(PONTOS)('%s é emitido em %s', async (chave, arquivo) => {
    const { EVENTOS_TREINO } = await import('../telemetriaTreino')
    expect(chave in EVENTOS_TREINO, `chave ${chave} saiu do catálogo`).toBe(true)
    const src = semComentarios(ler(arquivo))
    const re = new RegExp(`rastrearTreino\\(\\s*EVENTOS_TREINO\\.${chave}\\b`)
    expect(src, `${arquivo} deixou de emitir EVENTOS_TREINO.${chave}`).toMatch(re)
  })

  it('o catálogo não tem evento órfão (sem emissor)', async () => {
    const { EVENTOS_TREINO } = await import('../telemetriaTreino')
    const cobertos = new Set(PONTOS.map(([k]) => k))
    const orfaos = Object.keys(EVENTOS_TREINO).filter((k) => !cobertos.has(k))
    expect(orfaos, 'evento novo entra em PONTOS com o arquivo que o emite').toEqual([])
  })
})

describe('classe — nome de evento de treino só sai do catálogo', () => {
  // Escopo: o CLIENTE do treino ativo (components + hooks). As server actions
  // de CRUD (`actions/workout-crud-actions.ts`) emitem `workout_create/update`
  // desde antes e são outro assunto — não é a tela, é a gravação.
  it('ninguém digita trackUserEvent("workout_…") fora do módulo', () => {
    const ofensores: string[] = []
    for (const p of [...arquivosTs(join(SRC, 'components')), ...arquivosTs(join(SRC, 'hooks'))]) {
      if (p.endsWith('lib/workout/telemetriaTreino.ts')) continue
      const src = semComentarios(readFileSync(p, 'utf8'))
      if (/trackUserEvent\(\s*['"`]workout_/.test(src)) ofensores.push(p.replace(SRC + '/', ''))
    }
    expect(ofensores).toEqual([])
  })
})
