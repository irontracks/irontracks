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
 * Só mexe no banco quando há simulador LIGADO — sem isso não houve uso do
 * simulador nesta sessão, e apagar às cegas passaria a alcançar o iPhone do
 * dono se ele estivesse logado na conta de teste.
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
function lerEnv(chaves) {
  const out = {}
  try {
    for (const linha of readFileSync(join(RAIZ, '.env.local'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha)
      if (!m || !chaves.includes(m[1])) continue
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* sem .env.local: só o app é encerrado */ }
  return out
}

async function apagarSessaoDeTeste() {
  if (CONTA_TESTE === CONTA_OFICIAL) return null // guard: alguém trocou o literal
  const env = lerEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const alvo = `${url}/rest/v1/active_workout_sessions?user_id=eq.${CONTA_TESTE}`
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

const ligados = simuladoresLigados()
if (ligados.length === 0) process.exit(0)

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
