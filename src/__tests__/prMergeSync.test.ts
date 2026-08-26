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
import { decidirSync, extrairEstado } from '../../scripts/pr-merge.mjs'

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

/**
 * O "vermelho aborta" não pode depender de existir um PR vermelho por perto
 * para alguém conferir à mão — por isso o parse do estado é uma função pura.
 * As fixtures usam o formato REAL do `gh pr checks`: uma linha por check, com
 * TAB entre as colunas (conferido com `od -c` na saída de um PR de verdade).
 */
describe('extrairEstado', () => {
  const linha = (estado: string) => `Vercel\tpass\t0\thttps://v\tDeployment has completed\nquality-check\t${estado}\t7m59s\thttps://q`

  it('lê o verde', () => {
    expect(extrairEstado(linha('pass'))).toBe('pass')
  })

  it.each(['fail', 'pending', 'skipping', 'cancelled'])('%s NÃO é pass — o merge aborta', (estado) => {
    expect(extrairEstado(linha(estado))).toBe(estado)
  })

  /** Sem a linha do check, o estado é DESCONHECIDO. Desconhecido não mergeia. */
  it('check ausente não vira sucesso', () => {
    expect(extrairEstado('Vercel\tpass\t0\thttps://v')).toBe('ausente')
    expect(extrairEstado('')).toBe('ausente')
    expect(extrairEstado(null as never)).toBe('ausente')
  })

  it('coluna vazia também não vira sucesso', () => {
    expect(extrairEstado('quality-check\t\t\t')).toBe('desconhecido')
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

  /**
   * Falha do `gh` (PR inexistente, rede fora, sem permissão) tem que sair como
   * MENSAGEM. Medido antes do conserto: `pr:merge 999999` cuspia 20 linhas de
   * stack trace do `execFileSync` e escondia o "Could not resolve to a
   * PullRequest", que era a única informação útil.
   */
  it('toda chamada ao gh passa pelo tratamento de erro', () => {
    // Fora do CORPO do helper: ele é o único que pode chamar o gh cru, e um
    // guard que acusa o próprio mecanismo é falso (erro nº 2 da lista do repo).
    const semHelper = codigo.replace(/function ghOuMorra[\s\S]*?\n\}\n/, '')
    const chamadasCruas = semHelper.match(/sh\('gh'/g) || []
    expect(chamadasCruas, "use ghOuMorra — `sh('gh', …)` cru vira stack trace").toHaveLength(0)
    expect(codigo).toMatch(/ghOuMorra\(\['pr', 'checks'/)
    expect(codigo).toMatch(/ghOuMorra\(\['pr', 'merge'/)
  })

  it('o reset passa pela função que decide, nunca direto', () => {
    const linhaReset = codigo.slice(codigo.indexOf("'reset'") - 400, codigo.indexOf("'reset'"))
    expect(linhaReset).toMatch(/decidirSync|acao === 'abortar'/)
  })
})
