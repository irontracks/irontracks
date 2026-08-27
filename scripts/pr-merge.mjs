#!/usr/bin/env node
/**
 * Mergeia um PR com as duas guardas que este repo já aprendeu a ter — e deixa a
 * `main` LOCAL alinhada com a origin.
 *
 * Duas armadilhas, as duas com histórico aqui:
 *
 * 1. **Merge encadeado em vez de CONDICIONADO.** Em 10/08/2026 um PR entrou com
 *    o CI VERMELHO porque o comando era `for … sleep …; done; gh pr merge` — o
 *    laço terminou (por falha, não por sucesso) e o merge rodou em seguida, sem
 *    ninguém olhar o status.
 * 2. **`gh pr merge --delete-branch` devolve para a `main` LOCAL**, que fica
 *    ATRÁS do merge que acabou de acontecer no servidor. Rodar um script de
 *    verificação logo depois executa o código ANTIGO, e o resultado parece
 *    regressão: em 25/08/2026 isso produziu um "❌ o bug continua" que era falso
 *    e quase virou investigação.
 * 3. **Em WORKTREE, a limpeza local do `gh` falha e o script mentia.** O
 *    `--delete-branch` precisa sair da branch mergeada, tenta ir para `main` e
 *    esbarra em `fatal: 'main' is already used by worktree at …`. O `gh` sai
 *    com código ≠ 0 DEPOIS de o merge já ter acontecido no servidor, e o
 *    script anunciava "ABORTADO: o merge falhou" — falso, e o tipo de mensagem
 *    que faz alguém retentar um merge já feito. Medido em 27/08/2026 no PR
 *    #957. Agora a falha do `gh` é confrontada com o ESTADO REAL do PR.
 *
 * Uso:
 *   npm run pr:merge 927
 *   npm run pr:merge 927 -- --dry-run
 */
import { execFileSync } from 'node:child_process'

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim()

/**
 * O reset da `main` local é seguro?
 *
 * Função PURA para poder ser testada — é ela que decide se um `git reset --hard`
 * acontece, e essa decisão não pode morar solta dentro de um script de shell.
 *
 * `conteudoIgual` é a chave: depois de um merge por SQUASH os commits locais têm
 * hashes diferentes dos da origin, então comparar histórico acusaria divergência
 * onde não há. O que importa é a ÁRVORE — se o conteúdo é idêntico, os commits
 * locais são duplicatas do que já está no servidor e podem ser descartados.
 */
export function decidirSync({ arvoreSuja, conteudoIgual }) {
  if (arvoreSuja) return { acao: 'abortar', motivo: 'há mudanças não commitadas na árvore de trabalho' }
  if (!conteudoIgual) return { acao: 'abortar', motivo: 'a main local tem conteúdo que NÃO está na origin' }
  return { acao: 'sincronizar', motivo: '' }
}

/**
 * O `gh pr merge` saiu com erro — o merge aconteceu mesmo assim?
 *
 * Função PURA, separada para ser testada: a pergunta que ela responde é a
 * diferença entre "não mergeou" e "mergeou e a limpeza local falhou", e tratar
 * a segunda como a primeira é mentir sobre o estado do repositório.
 *
 * O estado vem do próprio GitHub (`gh pr view --json state`), não do código de
 * saída do comando. Estado desconhecido é tratado como falha — na dúvida, o
 * script não afirma que mergeou.
 */
export function decidirPosFalhaDeMerge({ estadoPr }) {
  if (estadoPr === 'MERGED') {
    return {
      acao: 'seguir',
      aviso: 'o merge foi concluído no servidor; o que falhou foi a limpeza local da branch',
    }
  }
  return { acao: 'abortar', aviso: '' }
}

/**
 * Falha de ferramenta não pode sair como stack trace do Node.
 *
 * Medido: `pr:merge 999999` cuspia 20 linhas de `execFileSync` e escondia a
 * única informação útil ("Could not resolve to a PullRequest"). Quem lê isso no
 * fim de uma tarefa não sabe se o problema é o PR, a rede ou o script.
 */
function ghOuMorra(args, oQueTentava) {
  try {
    return sh('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    const detalhe = String(e?.stderr || e?.stdout || e?.message || '').trim().split('\n')[0]
    process.stderr.write(`ABORTADO: ${oQueTentava}.\n  ${detalhe || 'o gh falhou sem dizer o motivo'}\n`)
    process.exit(1)
  }
}

/**
 * Chama o `gh` SEM morrer na falha — para o único caso em que o código de saída
 * não conta a história toda: `pr merge --delete-branch` sai com erro quando a
 * limpeza local falha, com o merge já feito no servidor.
 *
 * Cumpre o mesmo invariante do `ghOuMorra` (falha nunca vira stack trace do
 * Node); a diferença é que aqui quem decide o que a falha significa é o
 * chamador, confrontando-a com o estado real do PR.
 */
function ghOuDiagnostique(args) {
  try {
    return { ok: true, detalhe: sh('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (e) {
    const detalhe = String(e?.stderr || e?.stdout || e?.message || '').trim().split('\n')[0]
    return { ok: false, detalhe: detalhe || 'o gh falhou sem dizer o motivo' }
  }
}

/**
 * Lê o estado do `quality-check` na saída do `gh pr checks`.
 *
 * Separada da chamada para poder ser TESTADA: é ela que autoriza o merge, e
 * "vermelho aborta" não pode depender de existir um PR vermelho por perto para
 * alguém conferir à mão. O formato é uma linha por check, com TAB entre as
 * colunas: `nome \t estado \t duração \t url \t descrição` (conferido com
 * `od -c` na saída real).
 *
 * Estado desconhecido (linha ausente, coluna vazia) NUNCA é tratado como
 * sucesso — na dúvida, não mergeia.
 */
export function extrairEstado(saidaDoGh) {
  const linhas = String(saidaDoGh ?? '').split('\n')
  const alvo = linhas.find((l) => l.includes('quality-check'))
  if (!alvo) return 'ausente'
  return (alvo.split('\t')[1] || '').trim() || 'desconhecido'
}

function statusDoCheck(pr) {
  return extrairEstado(ghOuMorra(['pr', 'checks', String(pr)], `não consegui ler os checks do PR #${pr}`))
}

function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const pr = args.find((a) => /^\d+$/.test(a))
  if (!pr) {
    process.stderr.write('uso: npm run pr:merge <número do PR> [-- --dry-run]\n')
    process.exit(1)
  }

  // ── Guarda 1: o merge é CONDICIONADO ao verde, nunca encadeado ────────────
  const estado = statusDoCheck(pr)
  if (estado !== 'pass') {
    process.stderr.write(`ABORTADO: quality-check do PR #${pr} está "${estado}" — não é "pass".\n`)
    process.exit(1)
  }
  process.stdout.write(`quality-check verde no PR #${pr}.\n`)

  if (dryRun) {
    process.stdout.write('--dry-run: pararia aqui, sem mergear.\n')
    return
  }

  // O `--delete-branch` sai da branch mergeada e, em worktree, esbarra na `main`
  // ocupada por outro. O `gh` devolve erro DEPOIS de mergear no servidor: por
  // isso a falha é confrontada com o estado real do PR, nunca tratada de saída
  // como "não mergeou".
  const merge = ghOuDiagnostique(['pr', 'merge', String(pr), '--squash', '--delete-branch'])
  if (merge.ok) {
    process.stdout.write(`PR #${pr} mergeado (squash).\n`)
  } else {
    const estadoPr = ghOuMorra(['pr', 'view', String(pr), '--json', 'state', '-q', '.state'],
      `não deu para saber se o PR #${pr} mergeou`)
    const { acao, aviso } = decidirPosFalhaDeMerge({ estadoPr })
    if (acao === 'abortar') {
      process.stderr.write(`ABORTADO: o merge do PR #${pr} falhou (estado: ${estadoPr}).\n  ${merge.detalhe}\n`)
      process.exit(1)
    }
    process.stdout.write(`PR #${pr} mergeado (squash) — ${aviso}.\n  ${merge.detalhe}\n`)
  }

  // ── Guarda 2: a main local não pode ficar para trás ───────────────────────
  sh('git', ['fetch', '--quiet', 'origin'])
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== 'main') {
    // Num worktree, a `main` pertence a OUTRO checkout e o `git checkout main`
    // é `fatal: already used by worktree`. Sincronizar dali seria mexer numa
    // árvore que não é esta — o script diz onde parou e sai limpo.
    try {
      sh('git', ['checkout', '--quiet', 'main'])
    } catch (e) {
      const detalhe = String(e?.stderr || e?.message || '').trim().split('\n')[0]
      process.stdout.write(
        `\n⚠️  main local NÃO sincronizada por este script: ${detalhe}\n` +
        '   Você está num worktree; a `main` é de outro checkout e não será tocada.\n' +
        '   Antes de VERIFICAR qualquer coisa contra a main, rode lá: git pull --ff-only\n',
      )
      process.exit(0)
    }
  }

  const arvoreSuja = sh('git', ['status', '--porcelain']).length > 0
  let conteudoIgual = true
  try {
    execFileSync('git', ['diff', '--quiet', 'origin/main'], { stdio: 'ignore' })
  } catch {
    conteudoIgual = false
  }

  const { acao, motivo } = decidirSync({ arvoreSuja, conteudoIgual })
  if (acao === 'abortar') {
    process.stdout.write(
      `\n⚠️  main local NÃO sincronizada: ${motivo}.\n` +
      '   Resolva à mão — nada é descartado por este script.\n' +
      `   Estado: local=${sh('git', ['rev-parse', '--short', 'HEAD'])} origin=${sh('git', ['rev-parse', '--short', 'origin/main'])}\n`,
    )
    process.exit(0)
  }

  sh('git', ['reset', '--hard', '--quiet', 'origin/main'])
  process.stdout.write(`main local sincronizada em ${sh('git', ['rev-parse', '--short', 'HEAD'])}.\n`)
}

// Só executa quando chamado direto — o teste importa `decidirSync`.
if (process.argv[1] && process.argv[1].endsWith('pr-merge.mjs')) main()
