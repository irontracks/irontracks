#!/usr/bin/env node
/**
 * Fecha o treino ativo do SIMULADOR ao fim de cada tarefa.
 *
 * Por que isto existe
 * ───────────────────
 * `active_workout_sessions` guarda a sessão em andamento **no servidor**, para
 * o treino continuar de outro aparelho. Consequência que já custou dois CIs
 * vermelhos: um app esquecido aberto no simulador com a conta de teste segue
 * reescrevendo essa linha por horas, e cada escrita volta por realtime para
 * TODOS os clientes logados — inclusive o navegador do Playwright no CI. Em
 * 16/08/2026 o `fill('42')` do E2E era desfeito pelo peso que estava na minha
 * tela (84), e o teste morria em `Test timeout`. Em 22/08 o sintoma mudou de
 * lugar (o botão INICIAR TREINO "is not stable") e o diagnóstico começou
 * errado duas vezes antes de a consulta ao banco fechar o caso.
 *
 * Fechar o app resolve METADE: para a escrita contínua, mas a linha continua
 * lá e o próximo run herda estado que ele não criou. Por isso este script faz
 * as duas coisas.
 *
 * O que faz
 * ─────────
 *   1. Encerra `com.irontracks.app` em todo simulador ligado.
 *   2. Apaga a sessão ativa da conta de TESTE no banco.
 *
 * Fronteiras (a conta oficial NUNCA é tocada)
 * ───────────────────────────────────────────
 * O `user_id` é literal e conferido contra o da conta do dono antes de
 * qualquer requisição. `djmkapple` tem 129 sessões reais; um DELETE errado ali
 * não teria desfazer.
 *
 * Duas portas para mexer no banco, e a segunda existe por um furo medido:
 *
 * 1. **Simulador LIGADO** — houve uso nesta sessão; encerra o app e limpa.
 * 2. **Sessão de teste PARADA há mais de `MIN_ORFA` minutos**, mesmo sem
 *    simulador ligado. Sem esta porta, desligar o simulador DEPOIS de abrir um
 *    treino deixava a linha órfã para sempre: o hook rodava, via zero
 *    simuladores e saía. Foi o que derrubou o E2E do PR #975 em 27/08/2026 —
 *    sessão parada há 33 min, num PR que só mexia em `.md`. E o custo cai em
 *    quem não tem nada a ver: o próximo PR.
 *
 * A porta 2 é segura porque olha só a conta de TESTE e exige tempo parado.
 * Ninguém treina de verdade ali — e o dono já documentou que sessão de treino
 * real, com pausa longa, acontece na conta OFICIAL, que este script recusa.
 *
 * Sai com 0 SEMPRE: roda como hook `Stop`, e hook que falha vira ruído no fim
 * de toda resposta. Silencioso quando não havia nada para fechar.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUNDLE_ID = 'com.irontracks.app'

/** djmkbrasil — a conta de TESTE (ver "Teste no simulador iOS" no CLAUDE.md). */
const CONTA_TESTE = '6cb619ba-1484-41f2-b60c-b67aaea06307'
/** djmkapple — a conta do dono. Aparece aqui só para ser RECUSADA. */
const CONTA_OFICIAL = 'd04bfcef-54ea-4360-9e3d-e174a9ace503'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Simuladores ligados. Lista vazia quando não há Xcode/simulador — não é erro. */
function simuladoresLigados() {
  try {
    const raw = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return Object.values(JSON.parse(raw).devices || {}).flat()
  } catch {
    return []
  }
}

/**
 * Lê `.env.local` sem imprimir valor nenhum. O arquivo tem credencial real de
 * produção: o que sai daqui é booleano ("achei" / "não achei"), nunca o dado.
 */
/**
 * Onde procurar o `.env.local`, em ordem.
 *
 * ⚠️ WORKTREE NÃO TEM `.env.local` — ele está no `.gitignore`, então não é
 * copiado. O script lia só o arquivo ao lado dele, não achava, e retornava sem
 * dizer nada: **o `sim:close` nunca limpou o banco rodando de um worktree**, que
 * é justamente de onde este repo trabalha. Descoberto em 27/08/2026, depois de
 * uma órfã de 33 min derrubar o E2E de um PR que só mexia em `.md`.
 *
 * O `--git-common-dir` aponta para o `.git` do checkout PRINCIPAL mesmo quando
 * chamado de dentro de um worktree; o pai dele é a raiz onde o `.env.local`
 * mora de verdade.
 */
function caminhosDoEnv() {
  const caminhos = [join(RAIZ, '.env.local')]
  try {
    const gitComum = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8', cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (gitComum) caminhos.push(join(dirname(gitComum), '.env.local'))
  } catch { /* fora de repo git: fica só o primeiro caminho */ }
  return [...new Set(caminhos)]
}

function lerEnv(chaves) {
  const out = {}
  for (const caminho of caminhosDoEnv()) {
    try {
      for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha)
        if (!m || !chaves.includes(m[1])) continue
        out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
      if (chaves.every((k) => out[k])) break
    } catch { /* este caminho não tem o arquivo — tenta o próximo */ }
  }
  return out
}

/**
 * Apaga a sessão ativa da conta de TESTE.
 *
 * `paradaHaMinutos` restringe ao que está parado há pelo menos N minutos — é o
 * que torna seguro limpar sem simulador ligado. Sem o parâmetro, apaga a sessão
 * da conta de teste seja qual for a idade (o caso do simulador ligado, em que o
 * uso acabou de acontecer).
 */
async function apagarSessaoDeTeste({ paradaHaMinutos } = {}) {
  if (CONTA_TESTE === CONTA_OFICIAL) return null // guard: alguém trocou o literal
  const env = lerEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    // Sem isto a falha era MUDA: o hook saía com 0, ninguém percebia, e a órfã
    // ficava no banco até derrubar o E2E do próximo PR. "Toda saída silenciosa
    // em caminho crítico é bomba-relógio."
    process.stdout.write(
      '[sim] não achei as credenciais do Supabase — a sessão de teste NÃO foi limpa.\n' +
      `      Procurei em: ${caminhosDoEnv().join(', ')}\n`,
    )
    return null
  }

  let alvo = `${url}/rest/v1/active_workout_sessions?user_id=eq.${CONTA_TESTE}`
  if (Number.isFinite(paradaHaMinutos) && paradaHaMinutos > 0) {
    const corte = new Date(Date.now() - paradaHaMinutos * 60_000).toISOString()
    alvo += `&updated_at=lt.${corte}`
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(alvo, {
      method: 'DELETE',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        // Sem isto o PostgREST devolve 204 e não dá para dizer se havia sessão.
        Prefer: 'return=representation',
      },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const linhas = await res.json().catch(() => [])
    return Array.isArray(linhas) ? linhas.length : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** Sessão de teste parada por mais que isto é resíduo, não treino. */
const MIN_ORFA = 30

const ligados = simuladoresLigados()
if (ligados.length === 0) {
  // Porta 2: sem simulador ligado, ainda vale limpar órfã ANTIGA da conta de
  // teste — é o caso de ter desligado o simulador depois de abrir um treino.
  const apagadasSemSim = await apagarSessaoDeTeste({ paradaHaMinutos: MIN_ORFA })
  if (apagadasSemSim) {
    process.stdout.write(`[sim] ${apagadasSemSim} sessão(ões) órfã(s) da conta de teste apagada(s).\n`)
  }
  process.exit(0)
}

for (const d of ligados) {
  try {
    execFileSync('xcrun', ['simctl', 'terminate', d.udid, BUNDLE_ID], { stdio: 'ignore' })
  } catch { /* o app já não estava rodando */ }
}

const apagadas = await apagarSessaoDeTeste()
if (apagadas) {
  process.stdout.write(`[sim] treino ativo fechado e ${apagadas} sessão(ões) da conta de teste apagada(s).\n`)
}
process.exit(0)
