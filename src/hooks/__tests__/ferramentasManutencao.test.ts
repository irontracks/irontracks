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
import { formatWeekdayWorkoutTitle } from '@/utils/workoutTitle'
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

describe('título padronizado sai no padrão VIGENTE do app', () => {
  // O formato antigo ("A - UPPER B - PEITO + BRAÇOS (SEGUNDA)") duplicava o dia
  // e trocava a cara dos treinos de quem já usa "SEG · Nome" — que é o padrão
  // que o ORGANIZAR mantém e o selo HOJE lê.
  it('quem já está no padrão não muda', () => {
    expect(formatWeekdayWorkoutTitle('SEG · Upper B - Peito + Braços', 0, { startDay: 'monday' }))
      .toBe('SEG · Upper B - Peito + Braços')
  })

  it('o dia acompanha a posição na lista, sem repetir', () => {
    const casos = [
      ['TER · Lower A - Quadríceps', 1, 'TER · Lower A - Quadríceps'],
      ['QUA · Upper A - Costas', 2, 'QUA · Upper A - Costas'],
      ['QUI · Lower B - Posterior', 3, 'QUI · Lower B - Posterior'],
      ['SEX · Pump - Ombros', 4, 'SEX · Pump - Ombros'],
    ] as const
    for (const [entrada, idx, esperado] of casos) {
      expect(formatWeekdayWorkoutTitle(entrada, idx, { startDay: 'monday' })).toBe(esperado)
    }
  })

  it('converte o formato ANTIGO (letra + dia no fim) para o novo', () => {
    expect(formatWeekdayWorkoutTitle('A - empurrar a (segunda)', 0, { startDay: 'monday' }))
      .toBe('SEG · empurrar a')
  })

  it('preserva a caixa que o usuário escreveu', () => {
    // Reusar o `rest` do extractLeadingLetter devolvia "SEG · força": ele
    // minúscula o título todo para casar a letra.
    expect(formatWeekdayWorkoutTitle('Treino A - Força', 0, { startDay: 'monday' }))
      .toBe('SEG · Força')
    expect(formatWeekdayWorkoutTitle('B - Peito + Tríceps', 1, { startDay: 'monday' }))
      .toBe('TER · Peito + Tríceps')
  })

  it('não força caixa alta — a assinatura do app é o peso, não a caixa', () => {
    expect(formatWeekdayWorkoutTitle('Peito e tríceps', 0, { startDay: 'monday' }))
      .toBe('SEG · Peito e tríceps')
  })

  it('respeita o dia de início escolhido nas configurações', () => {
    expect(formatWeekdayWorkoutTitle('Peito', 0, { startDay: 'wednesday' })).toBe('QUA · Peito')
    expect(formatWeekdayWorkoutTitle('Costas', 5, { startDay: 'wednesday' })).toBe('SEG · Costas')
  })

  it('título vazio não vira prefixo solto', () => {
    expect(formatWeekdayWorkoutTitle('', 0, { startDay: 'monday' })).toBe('SEG · Treino')
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

describe('desfazer — as ações em massa têm volta', () => {
  const corpo = executavel(HOOK)

  it('tira snapshot ANTES de escrever', () => {
    // Se o snapshot fosse tirado depois, ele guardaria o estado JÁ alterado —
    // um desfazer que não desfaz nada.
    // Fatiar a partir do PRIMEIRO `await updateWorkout` do arquivo pegaria o da
    // função `restaurar`, que vem antes — o slice sairia vazio e o caso passaria
    // por acidente. Procura o updateWorkout que vem DEPOIS do snapshot.
    const ini = corpo.indexOf('const desfazer')
    const fim = corpo.indexOf('await updateWorkout', ini)
    expect(ini).toBeGreaterThan(-1)
    expect(fim).toBeGreaterThan(ini)
    expect(corpo.slice(ini, fim)).toMatch(/desfazer\.push\(snapshotDe\(w\)\)/)
  })

  it('as duas ações oferecem desfazer ao concluir', () => {
    const chamadas = corpo.match(/ofereceDesfazer\(/g) ?? []
    expect(chamadas.length).toBeGreaterThanOrEqual(2)
  })

  it('restaura pelo mesmo caminho do save, sem lógica inversa', () => {
    const fn = corpo.slice(corpo.indexOf('const restaurar'), corpo.indexOf('interface UseWorkoutNormalizeOptions'))
    expect(fn).toMatch(/updateWorkout\(snap\.id/)
    expect(fn).toMatch(/title: snap\.title/)
    expect(fn).toMatch(/exercises: snap\.exercises/)
  })

  it('fechar o diálogo por fora MANTÉM o resultado (desfazer é explícito)', () => {
    // `confirm` resolve false ao fechar por fora — então desfazer precisa ser o
    // confirmText, nunca o caminho do false.
    const fn = corpo.slice(corpo.indexOf('const ofereceDesfazer'), corpo.indexOf('const handleApplyTitleRule'))
    expect(fn).toMatch(/confirmText: 'Desfazer'/)
    expect(fn).toMatch(/cancelText: 'Manter'/)
    expect(fn).toMatch(/if \(!querDesfazer\) return/)
  })
})

describe('a cor do alerta não contradiz o texto', () => {
  const DIALOG = readFileSync(join(raiz, 'src/components/GlobalDialog.tsx'), 'utf8')

  it('erro sai em vermelho, não com o check verde de sucesso', () => {
    expect(executavel(HOOK)).toMatch(/'Erro ao padronizar títulos: ' \+ message, 'Atenção', 'error'/)
    expect(executavel(HOOK)).toMatch(/'Erro ao normalizar exercícios: ' \+ message, 'Atenção', 'error'/)
    expect(DIALOG).toMatch(/dialog\.tone === 'error'/)
  })

  it('"não encontrei nada" é informação, não sucesso', () => {
    expect(executavel(HOOK)).toMatch(/'Nenhum exercício para normalizar foi encontrado\.', 'Atenção', 'info'/)
    expect(DIALOG).toMatch(/dialog\.tone === 'info'/)
  })

  it('o padrão do app segue sendo o verde (nada muda sem pedir)', () => {
    const CTX = readFileSync(join(raiz, 'src/contexts/DialogContext.tsx'), 'utf8')
    expect(CTX).toMatch(/tone: 'success' \| 'info' \| 'error' = 'success'/)
  })
})
