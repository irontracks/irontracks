/**
 * Guards da FONTE ÚNICA dos ingredientes de kcal.
 *
 * O bug que originou o módulo (12/08/2026, medido na sessão real do dono):
 * o relatório mostrava 744 kcal e a aba Nutrição 698 kcal para o MESMO treino.
 * 744/698 = 1,066 — o multiplicador de RPE do modelo MET. Cada tela montava os
 * argumentos por conta própria e só o relatório passava o RPE.
 *
 * Estes testes travam as duas metades:
 *   1. a ordem de precedência (check-in > perfil > default), num lugar só;
 *   2. a FIAÇÃO — as superfícies chegam ao mesmo número na mesma sessão.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { sessionKcalInputs, isSessionKcalInputs } from '../sessionKcalInputs'
import { estimateSessionKcal, estimateSessionKcalBreakdown } from '../sessionKcal'

/**
 * Sessão espelhando a de 12/08/2026: peso no pré-check-in, RPE no pós-treino.
 * Os números vêm do banco de produção — com um `rpe` de mentira o teste passaria
 * verde com o bug reposto.
 */
const session = {
  totalTime: 3600,
  executionTotalSeconds: 900,
  restTotalSeconds: 1500,
  exercises: [{ name: 'Agachamento livre' }, { name: 'Leg press' }],
  logs: {
    '0-0': { done: true, weight: '100', reps: '10' },
    '0-1': { done: true, weight: '100', reps: '10' },
    '1-0': { done: true, weight: '200', reps: '12' },
    '1-1': { done: true, weight: '200', reps: '12' },
  },
  preCheckin: { weight: 94.4 },
  postCheckin: { rpe: 10 },
}

const profile = { bodyWeightKg: 94.4, biologicalSex: 'male' }

describe('sessionKcalInputs — precedência dos ingredientes', () => {
  it('peso do check-in vence o do perfil (é a medição DAQUELE dia)', () => {
    const i = sessionKcalInputs({ ...session, preCheckin: { weight: 88 } }, { bodyWeightKg: 94.4 })
    expect(i.bodyWeightKg).toBe(88)
  })

  it('check-in lido da tabela vence o embutido na sessão', () => {
    const i = sessionKcalInputs(session, profile, { preCheckin: { answers: { body_weight_kg: 91 } } })
    expect(i.bodyWeightKg).toBe(91)
  })

  it('cai no perfil quando a sessão não tem check-in de peso', () => {
    const i = sessionKcalInputs({ ...session, preCheckin: undefined }, profile)
    expect(i.bodyWeightKg).toBe(94.4)
  })

  it('devolve null (não um chute) quando não há peso em lugar nenhum', () => {
    const i = sessionKcalInputs({ ...session, preCheckin: undefined }, null)
    expect(i.bodyWeightKg).toBeNull()
  })

  it('descarta peso fora da faixa plausível de um adulto', () => {
    expect(sessionKcalInputs({ preCheckin: { weight: 4 } }, { bodyWeightKg: 80 }).bodyWeightKg).toBe(80)
    expect(sessionKcalInputs({ preCheckin: { weight: 900 } }, { bodyWeightKg: 80 }).bodyWeightKg).toBe(80)
  })

  it('lê o RPE do pós-treino EMBUTIDO na sessão — é o que a nutrição tem em mãos', () => {
    expect(sessionKcalInputs(session, profile).rpe).toBe(10)
  })

  it('aceita o RPE tanto em answers.rpe quanto na raiz do check-in', () => {
    expect(sessionKcalInputs({ postCheckin: { answers: { rpe: 7 } } }).rpe).toBe(7)
    expect(sessionKcalInputs({ postCheckin: { rpe: 7 } }).rpe).toBe(7)
  })

  it('descarta RPE fora de 1–10', () => {
    expect(sessionKcalInputs({ postCheckin: { rpe: 0 } }).rpe).toBeNull()
    expect(sessionKcalInputs({ postCheckin: { rpe: 42 } }).rpe).toBeNull()
  })

  it('sexo: perfil manda, sessão é o fallback', () => {
    expect(sessionKcalInputs({ biologicalSex: 'female' }, { biologicalSex: 'male' }).biologicalSex).toBe('male')
    expect(sessionKcalInputs({ biologicalSex: 'female' }, null).biologicalSex).toBe('female')
    expect(sessionKcalInputs({ biologicalSex: 'outro' }, null).biologicalSex).toBeNull()
  })

  it('marca o resultado — o PDF reconhece ingredientes prontos em runtime', () => {
    expect(isSessionKcalInputs(sessionKcalInputs(session, profile))).toBe(true)
    expect(isSessionKcalInputs({ bodyWeightKg: 90, biologicalSex: 'male', rpe: 8 })).toBe(false)
  })
})

describe('fiação — as superfícies não podem divergir na MESMA sessão', () => {
  // Relatório: já leu os check-ins da tabela. Nutrição/reportMetrics: só a sessão.
  const doRelatorio = sessionKcalInputs(session, profile, { preCheckin: null, postCheckin: null })
  const daNutricao = sessionKcalInputs(session, profile)
  const doReportMetrics = sessionKcalInputs(session, profile)

  it('os ingredientes resolvidos são idênticos', () => {
    expect(daNutricao).toEqual(doRelatorio)
    expect(doReportMetrics).toEqual(doRelatorio)
  })

  it('o kcal exibido é o mesmo nas três — era 744 × 698 antes', () => {
    const relatorio = estimateSessionKcal(session, doRelatorio)
    const nutricao = estimateSessionKcal(session, daNutricao)
    const metrics = estimateSessionKcalBreakdown(session, doReportMetrics).total
    expect(relatorio).toBeGreaterThan(0)
    expect(nutricao).toBe(relatorio)
    expect(metrics).toBe(relatorio)
  })

  it('o RPE realmente muda a conta — senão o teste acima passaria por acaso', () => {
    const semRpe = estimateSessionKcal(session, sessionKcalInputs({ ...session, postCheckin: undefined }, profile))
    expect(estimateSessionKcal(session, daNutricao)).toBeGreaterThan(semRpe)
  })

  it('o peso realmente muda a conta — idem para o ramo do check-in', () => {
    const leve = estimateSessionKcal(session, sessionKcalInputs({ ...session, preCheckin: { weight: 60 } }, profile))
    expect(estimateSessionKcal(session, daNutricao)).toBeGreaterThan(leve)
  })
})

// ── Source-guard: ninguém remonta os ingredientes por conta própria ──────────
const SRC = 'src'
const MODULO = join('utils', 'calories', 'sessionKcalInputs.ts')

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Remove comentários e strings: guard não pode acusar a própria documentação. */
const codeOnly = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')

describe('source-guard — objeto literal de ingredientes só dentro do módulo', () => {
  const DEFINIDOR = join('utils', 'calories', 'sessionKcal.ts')
  const arquivos = walk(SRC).filter(
    (f) => !f.endsWith(MODULO) && !f.endsWith(DEFINIDOR) && !f.includes('__tests__'),
  )

  /**
   * O 2º argumento começa em `{`? Anda caractere a caractere contando
   * parênteses/chaves: uma regex com `[^;]*?` atravessa a chamada inteira em
   * arquivo sem ponto-e-vírgula e acusa o `{` de outra linha (aconteceu ao
   * escrever este guard).
   */
  const chamadasComLiteral = (code: string): number => {
    let achados = 0
    const re = /estimateSessionKcal(?:Breakdown)?\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(code))) {
      let depth = 1
      for (let i = m.index + m[0].length; i < code.length && depth > 0; i++) {
        const c = code[i]
        if (c === '(' || c === '[' || c === '{') depth++
        else if (c === ')' || c === ']' || c === '}') depth--
        else if (c === ',' && depth === 1) {
          const resto = code.slice(i + 1).replace(/^\s+/, '')
          if (resto.startsWith('{')) achados++
          break
        }
      }
    }
    return achados
  }

  it('nenhuma chamada de estimateSessionKcal* recebe objeto literal', () => {
    const infratores = arquivos.filter((f) => chamadasComLiteral(codeOnly(readFileSync(f, 'utf8'))) > 0)
    expect(infratores, 'use sessionKcalInputs(session, profile) — ver o cabeçalho do módulo').toEqual([])
  })

  it('o guard acima enxerga um literal de verdade (prova por mutação)', () => {
    expect(chamadasComLiteral('estimateSessionKcal(s, { bodyWeightKg: 90 })')).toBe(1)
    expect(chamadasComLiteral('estimateSessionKcalBreakdown(s, {})')).toBe(1)
    expect(chamadasComLiteral('estimateSessionKcal(s, sessionKcalInputs(s, p))\nfoo(a, { b: 1 })')).toBe(0)
  })

  it('todo chamador importa a fonte única', () => {
    const semImport: string[] = []
    for (const f of arquivos) {
      const code = codeOnly(readFileSync(f, 'utf8'))
      if (!/estimateSessionKcal(?:Breakdown)?\s*\(/.test(code)) continue
      if (!/sessionKcalInputs/.test(code)) semImport.push(f)
    }
    expect(semImport, 'quem estima kcal precisa resolver os ingredientes pelo leitor único').toEqual([])
  })

  it('o próprio sessionKcal.ts não volta a resolver peso/RPE por conta própria', () => {
    const code = codeOnly(readFileSync(join(SRC, 'utils', 'calories', 'sessionKcal.ts'), 'utf8'))
    expect(code).not.toMatch(/preCheckin/)
    expect(code).not.toMatch(/body_weight_kg/)
  })
})
