/**
 * A decisão de resetar a `main` local — a única parte perigosa do `pr:merge`.
 *
 * Ela existe porque `gh pr merge --delete-branch` devolve para a `main` LOCAL,
 * que fica ATRÁS do merge recém-feito no servidor. Rodar um script de
 * verificação logo depois executa o código ANTIGO: em 25/08/2026 isso produziu
 * um "❌ o bug continua" que era falso e quase virou investigação.
 *
 * O reset é `--hard`, então a regra que o autoriza não pode morar solta dentro
 * de um script de shell: mora numa função pura, e é ela que este arquivo trava.
 */
import { describe, it, expect } from 'vitest'
import { decidirSync } from '../../scripts/pr-merge.mjs'

describe('decidirSync', () => {
  /**
   * O caso que motivou tudo: depois de um merge por SQUASH, os commits locais
   * têm hashes diferentes dos da origin. Comparar HISTÓRICO acusaria
   * divergência onde não há — o que importa é a ÁRVORE.
   */
  it('conteúdo idêntico à origin: sincroniza, mesmo com commits locais diferentes', () => {
    expect(decidirSync({ arvoreSuja: false, conteudoIgual: true }).acao).toBe('sincronizar')
  })

  it('trabalho não commitado NUNCA é descartado', () => {
    const r = decidirSync({ arvoreSuja: true, conteudoIgual: true })
    expect(r.acao).toBe('abortar')
    expect(r.motivo).toMatch(/não commitadas/)
  })

  /**
   * Conteúdo local que não está na origin pode ser trabalho de verdade — um
   * commit que não foi para o PR, por exemplo. Aqui o script para e devolve a
   * decisão para o humano em vez de apagar.
   */
  it('conteúdo que não está na origin aborta, não reseta', () => {
    const r = decidirSync({ arvoreSuja: false, conteudoIgual: false })
    expect(r.acao).toBe('abortar')
    expect(r.motivo).toMatch(/NÃO está na origin/)
  })

  it('árvore suja manda mesmo com conteúdo divergente — a mensagem é a do risco maior', () => {
    expect(decidirSync({ arvoreSuja: true, conteudoIgual: false }).motivo).toMatch(/não commitadas/)
  })
})

describe('guardas do script', () => {
  const fonte = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'scripts/pr-merge.mjs'),
    'utf8',
  )
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

  /**
   * Em 10/08/2026 um PR entrou com o CI VERMELHO porque o comando era
   * `for … sleep …; done; gh pr merge` — o laço terminou por FALHA e o merge
   * rodou em seguida. O merge tem que ser CONDICIONADO, nunca encadeado.
   */
  it('o merge só acontece com quality-check em "pass"', () => {
    expect(codigo).toMatch(/estado !== 'pass'/)
    const antesDoMerge = codigo.slice(0, codigo.indexOf("'merge'"))
    expect(antesDoMerge, 'a checagem precisa vir ANTES do merge').toMatch(/statusDoCheck\(pr\)/)
  })

  it('o reset passa pela função que decide, nunca direto', () => {
    const linhaReset = codigo.slice(codigo.indexOf("'reset'") - 400, codigo.indexOf("'reset'"))
    expect(linhaReset).toMatch(/decidirSync|acao === 'abortar'/)
  })
})
