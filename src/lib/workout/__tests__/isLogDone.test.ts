/**
 * Guards das séries-fantasma do prefill (auditoria da tela do treino ativo,
 * 06/09/2026).
 *
 * O caso real: uma sessão com **1 série feita** saiu no relatório como
 * "97% · 29/30 séries completas", e `reportMeta.totals.setsDone` foi gravado
 * como 29. A causa: sete lugares respondiam "a série foi feita?" com a mesma
 * heurística — log sem `done` conta como feito —, que o motor de carga tornou
 * falsa ao escrever `{ weight, weightSource: 'auto' }` em toda série renderizada.
 *
 * Três camadas aqui: a regra pura, a FIAÇÃO (o relatório de verdade, com o
 * formato real dos logs) e o guard de CLASSE que impede a heurística de
 * renascer num oitavo arquivo.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isEnginePrefillOnly, isLogDone } from '../isLogDone'
import { buildReportMetrics } from '@/utils/report/reportMetrics'
import { isSetCompleted } from '@/utils/report/setCompletion'
import { isWorkingSet, sessionVolumeKg } from '@/utils/report/setVolume'

const PREFILL = { weight: '84', weightSource: 'auto', advanced_config: null }

describe('isLogDone — a regra', () => {
  it('prefill do motor (peso auto, sem reps, sem done) NÃO é série feita', () => {
    expect(isLogDone(PREFILL)).toBe(false)
    expect(isEnginePrefillOnly(PREFILL)).toBe(true)
  })

  it('`done` explícito manda — boolean e a string do JSON', () => {
    expect(isLogDone({ ...PREFILL, done: true })).toBe(true)
    expect(isLogDone({ ...PREFILL, done: 'true' })).toBe(true)
    expect(isLogDone({ weight: '84', reps: '8', done: false })).toBe(false)
    expect(isLogDone({ weight: '84', reps: '8', done: 'false' })).toBe(false)
  })

  it('legado sem `done` e sem `weightSource` continua contando (249 logs de jan–ago/2026)', () => {
    expect(isLogDone({ weight: '80', reps: '10' })).toBe(true)
  })

  it('peso auto COM reps digitadas e sem done continua contando (31 logs reais de jul–ago)', () => {
    // O usuário fez a série e não tocou em Concluir. A regra é estreita de
    // propósito: só as TRÊS condições juntas excluem.
    expect(isLogDone({ ...PREFILL, reps: '9' })).toBe(true)
    expect(isLogDone({ ...PREFILL, L_reps: '12', R_reps: '12' })).toBe(true)
  })

  it('peso digitado pelo usuário sem reps e sem done segue a regra legada', () => {
    expect(isLogDone({ weight: '84', weightSource: 'user' })).toBe(true)
  })

  it('reps vazias ou zero contam como "sem reps"', () => {
    expect(isLogDone({ ...PREFILL, reps: '' })).toBe(false)
    expect(isLogDone({ ...PREFILL, reps: '0' })).toBe(false)
  })

  it('lixo não é série', () => {
    expect(isLogDone(null)).toBe(false)
    expect(isLogDone('x')).toBe(false)
    expect(isLogDone([])).toBe(false)
  })
})

describe('⚠️ fiação — o relatório com o formato REAL da sessão de teste', () => {
  // 1 série feita + 28 prefills, exatamente o que o banco tinha em f6839414.
  const logs: Record<string, unknown> = { '0-0': { ...PREFILL, reps: '9', done: true } }
  for (let ex = 0; ex < 10; ex++) {
    for (let s = 0; s < 3; s++) {
      if (ex === 0 && s === 0) continue
      logs[`${ex}-${s}`] = { ...PREFILL }
    }
  }
  const session = {
    exercises: Array.from({ length: 10 }, (_, i) => ({ name: `Ex ${i}`, sets: 3 })),
    logs,
  }

  it('setsDone gravado = 1, não 29', () => {
    const m = buildReportMetrics(session)
    expect(m.totals.setsDone).toBe(1)
  })

  it('isSetCompleted não deixa `weight > 0` do prefill passar por concluída', () => {
    expect(isSetCompleted(PREFILL)).toBe(false)
    expect(isSetCompleted({ ...PREFILL, done: true })).toBe(true)
    // O fallback numérico legado continua: série antiga só com peso conta.
    expect(isSetCompleted({ weight: '80' })).toBe(true)
  })

  it('isWorkingSet / sessionVolumeKg: o prefill não é série de trabalho', () => {
    expect(isWorkingSet(PREFILL)).toBe(false)
    expect(sessionVolumeKg(logs)).toBe(84 * 9)
  })
})

describe('guard de CLASSE — a heurística "sem done = feito" não volta', () => {
  const SRC = join(process.cwd(), 'src')
  const arquivos: string[] = []
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        if (nome === '__tests__' || nome === 'node_modules') continue
        varrer(caminho)
      } else if (/\.tsx?$/.test(nome)) {
        arquivos.push(caminho)
      }
    }
  }
  varrer(SRC)

  const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')

  it('nenhum arquivo além de isLogDone.ts decide `done` ausente por conta própria', () => {
    // A forma exata que existia nos sete lugares. Um oitavo com a mesma forma
    // reprova aqui; quem precisar da resposta importa `isLogDone`.
    const infratores = arquivos.filter((f) => {
      if (f.endsWith('/isLogDone.ts')) return false
      const code = semComentarios(readFileSync(f, 'utf8'))
      return /done\w*\s*==\s*null\s*\?\s*true/.test(code)
    })
    expect(infratores.map((f) => f.replace(SRC, 'src'))).toEqual([])
  })

  it('a varredura viu os arquivos (senão o guard fica cego)', () => {
    expect(arquivos.length).toBeGreaterThan(500)
  })
})
