import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { espelhoAposEdicaoDireta, isUserWeightEdit, planLinkedWeightSync, type LogLike } from '../linkedWeights'

/**
 * Sincronizar pesos (🔗) — guard do COMPORTAMENTO, não de uma cópia dele.
 *
 * O teste anterior (`useActiveWorkoutController.logic.test.ts`) reimplementava a
 * lógica dentro do próprio arquivo e testava a cópia: passava verde com o código
 * real quebrado. E testava uma escrita de uma vez, nunca TECLA POR TECLA — que é
 * exatamente onde o defeito do print vivia (L=23, R=2).
 *
 * Aqui a sessão é simulada com o MESMO roteamento do `updateLog` do controlador
 * (vinculado → plano; senão merge com `espelhoAposEdicaoDireta`), e a carga
 * automática roda com a MESMA regra do `useAutoloadWeight`/`normalSet` entre uma
 * tecla e outra, até estabilizar.
 */

function criarSessao(setsCount: number, inicial: Record<number, LogLike> = {}) {
  const logs: Record<number, LogLike> = { ...inicial }
  const estado = { vinculado: true, setsCount }
  const getLog = (i: number): LogLike => logs[i] ?? {}
  const updateLog = (sIdx: number, patch: LogLike) => {
    const plano = estado.vinculado
      ? planLinkedWeightSync({ patch, sIdx, setsCount: estado.setsCount, getLog })
      : null
    if (plano) {
      for (const { setIdx, next } of plano) logs[setIdx] = next
      return
    }
    const prev = getLog(sIdx)
    logs[sIdx] = { ...prev, ...patch, ...espelhoAposEdicaoDireta(prev, patch) }
  }
  return { logs, estado, getLog, updateLog }
}
type Sessao = ReturnType<typeof criarSessao>

/** Mesma regra do efeito de `useAutoloadWeight` (bilateral). */
function motorBilateral(s: Sessao, setIdx: number, sugestao: number) {
  const log = s.getLog(setIdx)
  if (log.done) return
  if (log.weightSource === 'user') return
  const atual = String(log.weight ?? '').trim()
  const proximo = String(sugestao)
  if (atual === proximo) return
  if (atual !== '' && log.weightSource !== 'auto') return
  s.updateLog(setIdx, { weight: proximo, weightSource: 'auto' })
}

/** Mesma regra do efeito unilateral do `normalSet`. */
function motorUnilateral(s: Sessao, setIdx: number, sugestao: number) {
  const log = s.getLog(setIdx)
  if (log.done) return
  if (log.weightSource === 'user') return
  const proximo = String(sugestao)
  const l = String(log.L_weight ?? '').trim()
  const r = String(log.R_weight ?? '').trim()
  const lVelho = l !== proximo && (l === '' || log.weightSource === 'auto')
  const rVelho = r !== proximo && (r === '' || log.weightSource === 'auto')
  if (!lVelho && !rVelho) return
  const patch: LogLike = { weightSource: 'auto' }
  if (lVelho) patch.L_weight = proximo
  if (rVelho) patch.R_weight = proximo
  s.updateLog(setIdx, patch)
}

/** Roda os efeitos do motor de todas as séries até ninguém mais escrever. */
function estabilizar(s: Sessao, motor: (s: Sessao, i: number, sug: number) => void, sugestao: number) {
  for (let volta = 0; volta < 30; volta++) {
    const antes = JSON.stringify(s.logs)
    for (let i = 0; i < s.estado.setsCount; i++) motor(s, i, sugestao)
    if (JSON.stringify(s.logs) === antes) return
  }
  throw new Error('motor e sincronização não estabilizam — vai-e-volta infinito')
}

/** Digita como o dedo digita: um `updateLog` por tecla (é o que o input faz). */
function digitar(
  s: Sessao,
  sIdx: number,
  campo: 'weight' | 'L_weight' | 'R_weight',
  texto: string,
  entreTeclas?: () => void,
) {
  for (let i = 1; i <= texto.length; i++) {
    s.updateLog(sIdx, { [campo]: texto.slice(0, i), weightSource: 'user' })
    entreTeclas?.()
  }
}

describe('unilateral — o outro lado acompanha a digitação inteira (o print de 24/09)', () => {
  it('digitar "23" no L deixa L=23 e R=23 em TODAS as séries, não R=2', () => {
    const s = criarSessao(3)
    digitar(s, 0, 'L_weight', '23')
    for (let i = 0; i < 3; i++) {
      expect(s.logs[i].L_weight, `série ${i + 1}, lado L`).toBe('23')
      expect(s.logs[i].R_weight, `série ${i + 1}, lado R`).toBe('23')
    }
  })

  it('também começando pelo R: o L acompanha até o fim', () => {
    const s = criarSessao(2)
    digitar(s, 1, 'R_weight', '17,5')
    for (let i = 0; i < 2; i++) {
      expect(s.logs[i].L_weight).toBe('17,5')
      expect(s.logs[i].R_weight).toBe('17,5')
    }
  })

  it('digitar no outro lado o torna INDEPENDENTE — cargas diferentes em L e R continuam possíveis', () => {
    const s = criarSessao(3)
    digitar(s, 0, 'L_weight', '23')
    digitar(s, 0, 'R_weight', '20')
    // R assumido: agora editar o L não arrasta mais o R.
    digitar(s, 0, 'L_weight', '25')
    for (let i = 0; i < 3; i++) {
      expect(s.logs[i].L_weight, `série ${i + 1}, L`).toBe('25')
      expect(s.logs[i].R_weight, `série ${i + 1}, R`).toBe('20')
    }
  })

  it('carga diferente já registrada (sem ser espelho) não é atropelada', () => {
    const s = criarSessao(2, {
      0: { L_weight: '18', R_weight: '18', weightSource: 'user' },
      1: { L_weight: '18', R_weight: '18', weightSource: 'user' },
    })
    digitar(s, 0, 'R_weight', '20')
    expect(s.logs[0].L_weight).toBe('18')
    expect(s.logs[1].L_weight).toBe('18')
    expect(s.logs[1].R_weight).toBe('20')
  })

  it('lado digitado com a sincronização DESLIGADA não volta a ser espelho ao religar', () => {
    const s = criarSessao(1)
    digitar(s, 0, 'L_weight', '23') // R espelha
    s.estado.vinculado = false
    digitar(s, 0, 'R_weight', '20') // R assumido à mão
    s.estado.vinculado = true
    digitar(s, 0, 'L_weight', '25')
    expect(s.logs[0].L_weight).toBe('25')
    expect(s.logs[0].R_weight, 'o R foi escolha do usuário').toBe('20')
  })

  it('voz grava os dois lados de uma vez: os dois vão para todas as séries', () => {
    const s = criarSessao(3)
    s.updateLog(1, { L_weight: '30', R_weight: '30', reps: '10', weightSource: 'user' })
    for (let i = 0; i < 3; i++) {
      expect(s.logs[i].L_weight).toBe('30')
      expect(s.logs[i].R_weight).toBe('30')
    }
    expect(s.logs[1].reps, 'o resto do patch fica só na série editada').toBe('10')
    expect(s.logs[0].reps).toBeUndefined()
  })
})

describe('carga automática × sincronização — ninguém atropela o usuário', () => {
  it('bilateral: digitar 25 com o motor rodando entre as teclas termina com 25 em todas', () => {
    const s = criarSessao(3)
    estabilizar(s, motorBilateral, 20)
    digitar(s, 0, 'weight', '25', () => estabilizar(s, motorBilateral, 20))
    for (let i = 0; i < 3; i++) expect(s.logs[i].weight, `série ${i + 1}`).toBe('25')
  })

  it('unilateral: sugestão do motor nos dois lados segue a digitação do usuário', () => {
    const s = criarSessao(3)
    estabilizar(s, motorUnilateral, 20)
    digitar(s, 0, 'L_weight', '22', () => estabilizar(s, motorUnilateral, 20))
    for (let i = 0; i < 3; i++) {
      expect(s.logs[i].L_weight, `série ${i + 1}, L`).toBe('22')
      expect(s.logs[i].R_weight, `série ${i + 1}, R`).toBe('22')
    }
  })

  it('quem recebe a réplica passa a ser do usuário — o motor não a "corrige" de volta', () => {
    const s = criarSessao(3)
    estabilizar(s, motorBilateral, 20)
    digitar(s, 0, 'weight', '25')
    for (let i = 0; i < 3; i++) expect(s.logs[i].weightSource).toBe('user')
  })

  it('o motor re-sincronizando uma série NÃO espalha a sugestão sobre o peso digitado', () => {
    // O histórico chega do cache e depois da rede: o motor reescreve as séries
    // ainda dele. Série 1 foi digitada com o 🔗 desligado; religado, a
    // re-sincronização da série 2 não pode arrastar a 1.
    const s = criarSessao(2)
    estabilizar(s, motorBilateral, 20)
    s.estado.vinculado = false
    digitar(s, 0, 'weight', '25')
    s.estado.vinculado = true
    estabilizar(s, motorBilateral, 22)
    expect(s.logs[0].weight, 'o peso digitado sobreviveu').toBe('25')
    expect(s.logs[1].weight).toBe('22')
  })

  it('série acrescentada depois: o motor preenche ela sem arrastar as outras', () => {
    const s = criarSessao(3)
    digitar(s, 0, 'weight', '25')
    s.estado.setsCount = 4
    estabilizar(s, motorBilateral, 20)
    for (let i = 0; i < 3; i++) expect(s.logs[i].weight, `série ${i + 1}`).toBe('25')
    expect(s.logs[3].weight).toBe('20')
  })

  it('escrita do motor não é sincronização', () => {
    expect(isUserWeightEdit({ weight: '20', weightSource: 'auto' })).toBe(false)
    expect(planLinkedWeightSync({ patch: { weight: '20', weightSource: 'auto' }, sIdx: 0, setsCount: 3, getLog: () => ({}) })).toBeNull()
  })
})

describe('concluir não é editar — e o que foi concluído não é reescrito', () => {
  it('concluir uma série SEM peso não apaga o peso das outras', () => {
    const s = criarSessao(3)
    digitar(s, 0, 'weight', '20')
    s.updateLog(2, { done: true, weight: '', reps: '10' })
    expect(s.logs[0].weight).toBe('20')
    expect(s.logs[1].weight).toBe('20')
  })

  it('concluir um lado não re-sincroniza as outras séries', () => {
    const s = criarSessao(2)
    digitar(s, 0, 'L_weight', '20')
    digitar(s, 1, 'L_weight', '24') // série 2 muda; série 1 acompanha
    s.updateLog(0, { L_done: true, L_weight: '20', L_reps: '10' }) // patch de conclusão
    expect(s.logs[1].L_weight, 'conclusão da série 1 não é edição').toBe('24')
  })

  it('série já concluída guarda o peso levantado; as pendentes recebem o novo', () => {
    const s = criarSessao(3)
    digitar(s, 0, 'weight', '20')
    s.updateLog(0, { done: true, reps: '10' })
    digitar(s, 1, 'weight', '22')
    expect(s.logs[0].weight, 'a série feita não é falsificada').toBe('20')
    expect(s.logs[1].weight).toBe('22')
    expect(s.logs[2].weight).toBe('22')
  })

  it('lado já concluído numa série pendente também fica como foi registrado', () => {
    const s = criarSessao(2, { 1: { L_weight: '20', R_weight: '20', L_done: true, weightSource: 'user' } })
    digitar(s, 0, 'L_weight', '24')
    expect(s.logs[1].L_weight, 'o L da série 2 já foi feito').toBe('20')
  })

  it('corrigir o peso da própria série concluída continua possível', () => {
    const s = criarSessao(2, { 0: { weight: '20', done: true, weightSource: 'user' } })
    digitar(s, 0, 'weight', '21')
    expect(s.logs[0].weight).toBe('21')
    expect(s.logs[1].weight).toBe('21')
  })
})

describe('fiação — o controlador usa ESTA decisão, não uma cópia', () => {
  const codigo = readFileSync('src/components/workout/useActiveWorkoutController.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, '')

  it('o updateLog planeja a réplica por planLinkedWeightSync', () => {
    expect(codigo).toMatch(/planLinkedWeightSync\(\{/)
    expect(codigo).toMatch(/if \(plano\)/)
  })

  it('o caminho sem sincronização também desfaz o espelho do lado editado', () => {
    expect(codigo).toMatch(/\.\.\.espelhoAposEdicaoDireta\(prev, patchObj\)/)
  })

  it('a regra antiga ("outro lado só se vazio", avaliada por tecla) não voltou', () => {
    expect(codigo).not.toMatch(/otherVal == null/)
    expect(codigo).not.toMatch(/typedWeight !== undefined/)
  })
})
