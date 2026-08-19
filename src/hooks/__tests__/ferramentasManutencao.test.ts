/**
 * Ferramentas de manutenção do menu FERRAMENTAS — o que elas NÃO podem voltar a fazer.
 *
 * Auditoria de 19/08/2026, tudo reproduzido no iPhone:
 *  · "Normalizar exercícios" renomeou 3 treinos ARQUIVADOS sem avisar;
 *  · perguntou "em 6 treinos?" sem dizer uma única troca, e o nome do exercício
 *    é a CHAVE do histórico — depois de aplicar, o exercício apareceu como
 *    "Sem histórico neste exercício" e o motor de carga perdeu a sugestão;
 *  · "Padronizar títulos" produzia "A - SEG · UPPER B … (SEGUNDA)": o dia duas
 *    vezes, porque o formatador tirava o sufixo e ignorava o prefixo;
 *  · "Padronizar nomes IA" não usava IA nenhuma.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatProgramWorkoutTitle } from '@/utils/workoutTitle'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'

const raiz = process.cwd()
const HOOK = readFileSync(join(raiz, 'src/hooks/useWorkoutNormalize.ts'), 'utf8')
const PAINEL = readFileSync(join(raiz, 'src/components/dashboard/WorkoutToolsPanel.tsx'), 'utf8')
const EXPORT_HOOK = readFileSync(join(raiz, 'src/hooks/useWorkoutExport.ts'), 'utf8')

/** Só o código executável — comentário que descreve o defeito não é o defeito. */
const executavel = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

describe('manutenção não alcança treino arquivado', () => {
  it('as duas ações filtram por apenasAtivos', () => {
    const corpo = executavel(HOOK)
    const chamadas = corpo.match(/apenasAtivos\(/g) ?? []
    // uma em handleApplyTitleRule, outra em handleNormalizeExercises
    expect(chamadas.length).toBeGreaterThanOrEqual(2)
  })

  it('o filtro entende as duas grafias do campo', () => {
    // `mapWorkoutRow` emite `archived_at` E `archivedAt`; olhar só uma deixava
    // o arquivado passar como ativo.
    expect(HOOK).toMatch(/archived_at/)
    expect(HOOK).toMatch(/archivedAt/)
  })
})

describe('confirmação mostra o que vai mudar', () => {
  const corpo = executavel(HOOK)

  it('a normalização lista os "de → para" antes de aplicar', () => {
    expect(corpo).toMatch(/renames\.push\(/)
    expect(corpo).toMatch(/preview\(renames\)/)
  })

  it('a normalização avisa que o histórico é ligado ao nome', () => {
    expect(HOOK).toMatch(/histórico de carga é ligado ao NOME/i)
  })

  it('a padronização de títulos lista os renomes antes de aplicar', () => {
    expect(corpo).toMatch(/preview\(mudancas\)/)
    expect(HOOK).toMatch(/Não dá para desfazer/i)
  })

  it('não pergunta mais só "em N treinos?"', () => {
    expect(corpo).not.toMatch(/Normalizar exercícios em \$\{candidates\.length\} treinos\?/)
  })
})

describe('título padronizado não repete o dia da semana', () => {
  it('prefixo "SEG ·" some em vez de conviver com "(SEGUNDA)"', () => {
    expect(formatProgramWorkoutTitle('SEG · Upper B - Peito + Braços', 0, { startDay: 'monday' }))
      .toBe('A - UPPER B - PEITO + BRAÇOS (SEGUNDA)')
  })

  it('vale para a semana inteira, não só a segunda', () => {
    const titulos = [
      ['TER · Lower A - Quadríceps', 1, 'B - LOWER A - QUADRÍCEPS (TERÇA)'],
      ['QUA · Upper A - Costas', 2, 'C - UPPER A - COSTAS (QUARTA)'],
      ['QUI · Lower B - Posterior', 3, 'D - LOWER B - POSTERIOR (QUINTA)'],
      ['SEX · Pump - Ombros', 4, 'E - PUMP - OMBROS (SEXTA)'],
    ] as const
    for (const [entrada, idx, esperado] of titulos) {
      expect(formatProgramWorkoutTitle(entrada, idx, { startDay: 'monday' })).toBe(esperado)
    }
  })

  it('o sufixo antigo continua sendo removido', () => {
    expect(formatProgramWorkoutTitle('A - empurrar a (segunda)', 0, { startDay: 'monday' }))
      .toBe('A - EMPURRAR A (SEGUNDA)')
  })

  it('título sem dia nenhum não perde palavra', () => {
    expect(formatProgramWorkoutTitle('Peito e tríceps', 0, { startDay: 'monday' }))
      .toBe('A - PEITO E TRÍCEPS (SEGUNDA)')
  })
})

describe('aliases que renomeavam para pior', () => {
  it('Scott continua com maiúscula — é nome próprio', () => {
    const r = resolveCanonicalExerciseName('Rosca Scott')
    expect(r.canonical).toBe('Rosca Scott')
    expect(r.changed, 'nome já correto não deve ser "corrigido"').toBe(false)
  })

  it('mesa flexora NÃO vira cadeira flexora — são aparelhos diferentes', () => {
    const r = resolveCanonicalExerciseName('Mesa flexora')
    expect(r.canonical).toBe('Mesa flexora')
    expect(r.changed).toBe(false)
  })

  it('cadeira flexora segue sendo cadeira flexora', () => {
    expect(resolveCanonicalExerciseName('Cadeira Flexora').canonical).toBe('Cadeira flexora')
  })

  it('as normalizações legítimas continuam valendo', () => {
    expect(resolveCanonicalExerciseName('Panturrilha sentado').canonical)
      .toBe('Elevação de panturrilha sentada')
  })
})

describe('menu enxuto — o que saiu não volta por distração', () => {
  // `executavel` em todos: os comentários que EXPLICAM a remoção citam os nomes
  // removidos, e um guard que casa com a própria documentação acusa o texto que
  // o defende (armadilha nº 2 do repo).
  it('"Padronizar nomes IA" não existe mais', () => {
    expect(executavel(PAINEL)).not.toMatch(/Padronizar nomes IA/)
    expect(executavel(HOOK)).not.toMatch(/handleNormalizeAiWorkoutTitles/)
  })

  it('"Criar automaticamente" não existe mais (o CTA da tela faz isso)', () => {
    expect(executavel(PAINEL)).not.toMatch(/Criar automaticamente/)
    expect(executavel(PAINEL)).not.toMatch(/onCreateWorkout/)
  })

  it('sobraram os quatro itens úteis', () => {
    for (const item of ['Importar JSON', 'Exportar JSON', 'Normalizar exercícios', 'Padronizar títulos']) {
      expect(PAINEL, `${item} sumiu do menu`).toContain(item)
    }
  })

  it('o "importar por código" morto saiu junto', () => {
    expect(executavel(EXPORT_HOOK)).not.toMatch(/handleImportWorkout/)
    expect(executavel(EXPORT_HOOK)).not.toMatch(/temporariamente indisponível/i)
  })
})

describe('prévia agrupa repetição', () => {
  it('mesma troca em vários treinos vira uma linha com "×N"', () => {
    // Visto no aparelho: "Panturrilha sentado → Elevação…" aparecia duas vezes
    // seguidas, gastando o espaço da troca seguinte.
    expect(HOOK).toMatch(/\(×\$\{n\}\)/)
    expect(HOOK).toMatch(/contagem\.set\(/)
  })
})
