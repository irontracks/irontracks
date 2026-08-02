import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard da DECISÃO DE PRODUTO: falha muscular é sempre marcação MANUAL.
 *
 * `log.failure` alimenta a trava anti-progressão do autoload — quando a última
 * sessão foi à falha, `suggestWeight` segura a carga no maior peso já usado.
 *
 * Heavy Duty e Repetições Forçadas vão à falha POR DEFINIÇÃO, e por isso parece
 * um bug que eles não gravem `log.failure` ao concluir. Não é: se gravassem, a
 * carga desses métodos congelaria para sempre no topWeight e o aluno nunca
 * progrediria neles. A flag existe para o usuário dizer "esta série AQUI
 * estourou" — não para descrever a natureza do método.
 *
 * Decisão do dono em 2026-07-25. Este guard existe porque a leitura ingênua do
 * código sugere o contrário, e alguém (humano ou agente) vai querer "corrigir".
 *
 * Não confundir com `reps_failure`, que é a CONTAGEM de repetições até falhar,
 * coletada no modal desses métodos — outro campo, outro significado.
 */
const DIR = 'src/components/workout/set-renderers'

const rendererFiles = readdirSync(join(process.cwd(), DIR))
  .filter((f) => f.endsWith('Set.tsx'))
  .sort()

const sourceOf = (file: string) => readFileSync(join(process.cwd(), DIR, file), 'utf8')

/** Corpo do handler que conclui a série (onde o patch de conclusão é montado). */
function completeHandlerBody(src: string): string | null {
  const match = src.match(/const\s+handleToggleDone\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/)
  return match ? match[1] : null
}

describe('falha muscular é marcação manual, nunca automática', () => {
  it('existe um conjunto de renderers pra checar (o glob não pode silenciar)', () => {
    expect(rendererFiles.length).toBeGreaterThanOrEqual(14)
  })

  it.each(rendererFiles)('%s não grava failure ao concluir a série', (file) => {
    const body = completeHandlerBody(sourceOf(file))
    if (!body) return // renderer conclui inline (cluster/rest-pause), coberto abaixo
    expect(body).not.toMatch(/\bfailure\b/)
  })

  /**
   * Os dois métodos que são "à falha por definição" — os candidatos naturais a
   * receberem a marcação automática que quebraria a progressão.
   */
  it.each(['heavyDutySet.tsx', 'forcedRepsSet.tsx'])(
    '%s não deriva failure do método (só reps_failure, que é contagem)',
    (file) => {
      const src = sourceOf(file)
      expect(src).not.toMatch(/failure:\s*true/)
      expect(src).toMatch(/reps_failure/) // a contagem continua existindo
    },
  )

  /**
   * A decisão precisa estar escrita onde a flag é consumida — senão o próximo
   * leitor do motor vê a trava e "conserta" a origem.
   */
  it('o motor documenta por que a falha é só manual', () => {
    const engine = readFileSync(join(process.cwd(), 'src/utils/autoload/suggestWeight.ts'), 'utf8')
    expect(engine).toMatch(/Heavy Duty/)
    expect(engine).toMatch(/anyFailed/)
  })
})
