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

function statusDoCheck(pr) {
  const linhas = sh('gh', ['pr', 'checks', String(pr)], { stdio: ['ignore', 'pipe', 'pipe'] }).split('\n')
  const alvo = linhas.find((l) => l.includes('quality-check'))
  if (!alvo) return 'ausente'
  return (alvo.split(/\s+/)[1] || 'desconhecido').trim()
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

  sh('gh', ['pr', 'merge', String(pr), '--squash', '--delete-branch'], { stdio: ['ignore', 'pipe', 'pipe'] })
  process.stdout.write(`PR #${pr} mergeado (squash).\n`)

  // ── Guarda 2: a main local não pode ficar para trás ───────────────────────
  sh('git', ['fetch', '--quiet', 'origin'])
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== 'main') sh('git', ['checkout', '--quiet', 'main'])

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
