import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { GroupMethodSet } from '../groupMethodSet'
import { ClusterSet } from '../clusterSet'
import { RestPauseSet } from '../restPauseSet'

/**
 * O USUÁRIO SEMPRE PODE TROCAR O PESO — mesmo com a carga automática ligada.
 *
 * INCIDENTE (22/08/2026, relatado pelo dono num Bi-Set de panturrilha): digitar
 * outro peso não pegava. O campo voltava para a sugestão do motor no mesmo
 * instante, e a nota "🧠 mantém 220kg" seguia embaixo.
 *
 * CAUSA — a marca, não o motor. `useAutoloadWeight` só respeita o que o usuário
 * digitou quando o log carrega `weightSource: 'user'`; enquanto a fonte for
 * 'auto', ele RE-SINCRONIZA o campo com a sugestão (comportamento correto e
 * necessário: o histórico chega do cache primeiro e da rede depois). O
 * `normalSet` marcava 'user' ao digitar e os savers de modal marcam na fronteira
 * — mas os três renderers com campo de peso INLINE (grupo/Bi-Set, cluster,
 * rest-pause) chamavam `updateLog` sem a marca. Resultado: peso do usuário
 * sobrescrito pelo próprio efeito, a cada tecla.
 *
 * O teste exercita o CICLO REAL (digita → grava no log → re-renderiza → o efeito
 * do autoload roda), porque só assim o valor volta. Conferir apenas o patch do
 * `updateLog` passaria verde com o bug vivo.
 */
vi.mock('@/components/ui/HelpHint', () => ({ HelpHint: () => null }))

const SUG = 220

let logByKey: Record<string, Record<string, unknown>> = {}
let rerender: () => void = () => { }

const ctx = {
  get exercises() { return exercises },
  getLog: (k: string) => logByKey[k] ?? {},
  updateLog: (k: string, patch: Record<string, unknown>) => {
    logByKey[k] = { ...(logByKey[k] ?? {}), ...patch }
    rerender()
  },
  setGroupMethodModal: vi.fn(),
  setClusterModal: vi.fn(),
  setRestPauseModal: vi.fn(),
  clusterRefs: { current: {} },
  restPauseDraftsRef: { current: {} },
  openNotesKeys: new Set<string>(),
  toggleNotes: vi.fn(),
  startTimer: vi.fn(),
  getPlanConfig: () => null,
  getPlannedSet: () => null,
  deloadSuggestions: {} as Record<string, unknown>,
  reportHistory: null,
  settings: null as Record<string, unknown> | null,
  autoLoadEnabled: true,
  autoLoadSuggestions: { '0-0': { weight: SUG, rationale: `mantém ${SUG}kg` } } as Record<string, unknown>,
}
vi.mock('../../WorkoutContext', () => ({ useWorkoutContext: () => ctx }))

let exercises: unknown[] = []

/**
 * Wrapper que re-renderiza a cada updateLog — é o que o app faz de verdade.
 *
 * A `key` muda junto de propósito: os renderers são `React.memo` e aqui o
 * contexto é um objeto ESTÁVEL lido por `getLog()`, então o React não teria como
 * saber que o log mudou e o memo seguraria o re-render (no app quem dispara é o
 * WorkoutLogsProvider). Remontar também deixa o teste mais severo: o efeito do
 * autoload roda de novo do zero e, sem a marca 'user', reescreve a sugestão por
 * cima do que o usuário digitou — que é o bug.
 */
function Harness({ children }: { children: React.ReactNode }) {
  const [tick, setTick] = React.useState(0)
  rerender = () => setTick((t) => t + 1)
  return <React.Fragment key={tick}>{children}</React.Fragment>
}

const exercicio = (method: string) => ({ name: 'Panturrilha sentado', method, restTime: 120, sets: 4 })

beforeEach(() => {
  logByKey = {}
  exercises = []
  ctx.settings = null
})

/**
 * Estado de partida: o motor JÁ preencheu a caixa (é assim que o usuário
 * encontra a tela). Sem `weightSource: 'auto'` aqui o efeito não teria motivo
 * para reescrever e o teste passaria verde com o bug presente.
 */
const comSugestaoAplicada = (key = '0-0') => {
  logByKey[key] = { weight: String(SUG), weightSource: 'auto', reps: '10' }
}

const digitarPeso = (valor: string) => {
  const input = screen.getByLabelText(/peso em kg/i)
  fireEvent.change(input, { target: { value: valor } })
}

describe('trocar o peso com carga automática ligada', () => {
  it('Bi-Set (grupo): o peso digitado permanece', () => {
    exercises = [exercicio('Bi-Set'), exercicio('Bi-Set')]
    comSugestaoAplicada()
    render(<Harness><GroupMethodSet ex={exercicio('Bi-Set') as never} exIdx={0} setIdx={0} /></Harness>)

    digitarPeso('185')

    expect(logByKey['0-0'].weight).toBe('185')
    expect(logByKey['0-0'].weightSource, 'sem a marca "user" o motor reescreve na próxima passada').toBe('user')
    expect((screen.getByLabelText(/peso em kg/i) as HTMLInputElement).value).toBe('185')
  })

  it('Cluster: o peso digitado permanece', () => {
    exercises = [exercicio('Cluster')]
    comSugestaoAplicada()
    render(<Harness><ClusterSet ex={exercicio('Cluster') as never} exIdx={0} setIdx={0} /></Harness>)

    digitarPeso('185')

    expect(logByKey['0-0'].weight).toBe('185')
    expect(logByKey['0-0'].weightSource).toBe('user')
    expect((screen.getByLabelText(/peso em kg/i) as HTMLInputElement).value).toBe('185')
  })

  it('Rest-Pause: o peso digitado permanece', () => {
    exercises = [exercicio('Rest-Pause')]
    comSugestaoAplicada()
    render(<Harness><RestPauseSet ex={exercicio('Rest-Pause') as never} exIdx={0} setIdx={0} /></Harness>)

    digitarPeso('185')

    expect(logByKey['0-0'].weight).toBe('185')
    expect(logByKey['0-0'].weightSource).toBe('user')
  })

  it('com a carga automática DESLIGADA nada muda de comportamento', () => {
    ctx.autoLoadEnabled = false
    try {
      exercises = [exercicio('Bi-Set'), exercicio('Bi-Set')]
      logByKey['0-0'] = { weight: '220', reps: '10' }
      render(<Harness><GroupMethodSet ex={exercicio('Bi-Set') as never} exIdx={0} setIdx={0} /></Harness>)
      digitarPeso('185')
      expect(logByKey['0-0'].weight).toBe('185')
    } finally {
      ctx.autoLoadEnabled = true
    }
  })
})

/**
 * VARREDURA DA CLASSE — pedido do dono junto com a correção: "vê se tem outros
 * bloqueados". Foram três (grupo, cluster, rest-pause); este guard existe para
 * que o quarto reprove aqui em vez de aparecer no meio de um treino.
 *
 * Regra: dentro dos renderers, escrever `weight` no log exige dizer a FONTE.
 * `setUserWeight(...)` já marca por construção. Duas dispensas legítimas:
 * patch com `done` (a série concluída congela — o efeito do autoload sai antes)
 * e escrita com `weightSource` explícito.
 */
describe('varredura — nenhum renderer escreve peso sem dizer a fonte', () => {
  const dir = path.join(process.cwd(), 'src/components/workout/set-renderers')

  /** Código executável: sem comentários, para o guard não casar com a doc que o explica. */
  const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')

  /** Fatia cada `updateLog(...)` pelo parêntese balanceado. */
  function chamadasUpdateLog(src: string): string[] {
    const code = semComentarios(src)
    const out: string[] = []
    const needle = 'updateLog('
    let from = 0
    for (;;) {
      const at = code.indexOf(needle, from)
      if (at === -1) break
      let depth = 0
      let end = at + needle.length - 1
      for (let i = at + needle.length - 1; i < code.length; i++) {
        if (code[i] === '(') depth++
        else if (code[i] === ')') { depth--; if (depth === 0) { end = i; break } }
      }
      out.push(code.slice(at, end + 1))
      from = end + 1
    }
    return out
  }

  it('todo updateLog com weight declara weightSource (ou é conclusão de série)', () => {
    const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))
    const infratores: string[] = []
    for (const f of arquivos) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      for (const chamada of chamadasUpdateLog(src)) {
        // `L_weight`/`R_weight` (unilateral) casam por conta própria abaixo.
        if (!/[^_]weight\s*:/.test(chamada) && !/\bL_weight\s*:|\bR_weight\s*:/.test(chamada)) continue
        if (/weightSource/.test(chamada)) continue
        if (/\bdone\s*:/.test(chamada)) continue
        infratores.push(`${f}: ${chamada.replace(/\s+/g, ' ').slice(0, 120)}`)
      }
    }
    expect(infratores, 'peso gravado sem fonte — o motor de carga automática vai reescrever por cima').toEqual([])
  })

  it('o guard enxerga os renderers (não está varrendo diretório vazio)', () => {
    const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))
    expect(arquivos.length).toBeGreaterThanOrEqual(14)
  })
})
