import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-guard da PORTA de conclusão da série (`canDone`).
 *
 * Sintoma real (jul/2026): no Bi-Set o botão "Concluir" ficava travado e não
 * dizia por quê — o método exigia reps preenchidas, coisa que a série normal
 * não exige. O usuário só via um botão morto.
 *
 * A causa é estrutural: são 14 renderers irmãos e cada um decide sozinho o que
 * exigir. Quem criar o 15º vai copiar um vizinho — e basta copiar o errado.
 * Por isso os guards abaixo varrem a FAMÍLIA inteira, não o caso do Bi-Set.
 *
 * Estes invariantes já eram respeitados quando o guard foi escrito; ele existe
 * para que continuem sendo.
 */
const DIR = 'src/components/workout/set-renderers'

const rendererFiles = readdirSync(join(process.cwd(), DIR))
  .filter((f) => f.endsWith('Set.tsx'))
  .sort()

const sourceOf = (file: string) => readFileSync(join(process.cwd(), DIR, file), 'utf8')

/** Linha da atribuição de `canDone` (a condição pode quebrar em várias linhas). */
function canDoneExpression(src: string): string | null {
  const match = src.match(/const\s+canDone\s*=\s*([\s\S]*?);/)
  return match ? match[1] : null
}

describe('porta de conclusão da série (canDone)', () => {
  it('existe um conjunto de renderers pra checar (o glob não pode silenciar)', () => {
    expect(rendererFiles.length).toBeGreaterThanOrEqual(14)
  })

  /**
   * O Bi-Set / Super-Set / Tri-Set é o método do bug original. O enunciado dele
   * é "exercícios emendados sem descanso" — reps não fazem parte do contrato,
   * então exigi-las trava o botão sem motivo.
   */
  it('o método de GRUPO (Bi-Set) não exige reps para concluir', () => {
    const expression = canDoneExpression(sourceOf('groupMethodSet.tsx'))
    expect(expression).not.toBeNull()
    expect(expression).not.toMatch(/\breps\b/)
  })

  /**
   * Um botão desabilitado sem explicação é o sintoma que o dono reportou.
   * Todo renderer que pode travar o "Concluir" precisa dizer o que falta.
   */
  it.each(rendererFiles)('%s explica o que falta quando não dá pra concluir', (file) => {
    const src = sourceOf(file)
    if (!/\bcanDone\b/.test(src)) return // série normal não tem porta

    // Ancorado no bloco condicional que só existe enquanto a porta está fechada
    // (`!canDone && <hint>`). Uma menção solta a "preencher" em outro ponto do
    // arquivo não vale: foi assim que a primeira versão deste guard passou com
    // a dica de fato removida.
    // Quem delega ao molde compartilhado passa a dica pela prop `hint` — o
    // molde a renderiza condicionada a `!done && hint`. O invariante é o mesmo
    // (existe texto explicando o que falta); muda só onde ele é escrito.
    const viaProp = src.match(/hint=\{[^}]*!canDone[^}]*\?\s*'([^']{4,})'/)
    if (viaProp) {
      expect(viaProp[1]).toMatch(/[A-Za-zÀ-ÿ]{4,}/)
      return
    }
    const hint = src.match(/!canDone\s*&&\s*([\s\S]{0,200})/)
    expect(hint, `${file} não renderiza nada condicionado a !canDone`).not.toBeNull()
    expect(hint?.[1]).toMatch(/[A-Za-zÀ-ÿ]{4,}/)
  })

  /**
   * A série normal é a referência da família: ela conclui sem exigir campo
   * nenhum. Se um dia ganhar uma porta, a divergência volta pelo outro lado.
   */
  it('a série normal não introduz porta de conclusão', () => {
    expect(sourceOf('normalSet.tsx')).not.toMatch(/const\s+canDone\s*=/)
  })
})
