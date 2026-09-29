import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * `autoload:sem-sugestao` existe para o caso em que HÁ histórico e o motor não
 * consegue usá-lo (Crucifixo invertido, 29/07). Exercício sem sessão nenhuma
 * também sai sem sugestão — e isso é o comportamento certo, o motor pede um
 * Reconhecimento. Contados juntos, viraram 1.682 avisos em 2 meses e o sinal
 * útil sumiu (Sentry JAVASCRIPT-NEXTJS-17).
 */
const SRC = readFileSync(join(__dirname, '..', 'useWorkoutAutoload.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('aviso de "sem sugestão" só com histórico, uma vez por exercício', () => {
  const i = SRC.indexOf("logWarnRemote('autoload:sem-sugestao'")
  const condicao = SRC.slice(SRC.lastIndexOf('if (', i), i)

  it('o aviso existe', () => { expect(i).toBeGreaterThan(0) })
  it('exige histórico no exercício', () => { expect(condicao).toMatch(/ordered\.length\s*>\s*0/) })
  it('não repete o mesmo exercício na sessão', () => { expect(condicao).toMatch(/semSugestaoReportado\.has\(/) })
})
