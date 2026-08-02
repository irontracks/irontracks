/**
 * Diff do sync da sessão ativa (perf, ago/2026).
 *
 * O upsert debounced de 900ms reenviava o `state` INTEIRO (o `workout` com
 * todas as definições de exercício domina o payload — dezenas de KB) a cada
 * série logada. Em 4G na academia, era o tráfego dominante do app.
 *
 * Este módulo decide, comparando com o último estado sincronizado POR ESTE
 * device, o que mandar:
 * - 'skip'  — nada mudou;
 * - 'patch' — SÓ os logs mudaram → manda apenas as chaves alteradas/removidas
 *             (RPC patch_active_session_logs faz o merge no servidor);
 * - 'full'  — qualquer outra coisa mudou (estrutura, timer, check-in...) →
 *             upsert do estado inteiro, comportamento antigo.
 *
 * REGRA DE OURO (anti-perda de treino): na dúvida, 'full'. O patch é uma
 * otimização de banda; o snapshot cheio continua existindo no heartbeat de 30s
 * e em toda mudança estrutural — qualquer drift do patch se auto-corrige em
 * ≤30s. Guard: sessionSyncDiff.test.ts.
 */

type UnknownRecord = Record<string, unknown>

const isRecord = (v: unknown): v is UnknownRecord =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

export type SessionSyncPlan =
    | { mode: 'skip' }
    | { mode: 'full' }
    | { mode: 'patch'; set: UnknownRecord; del: string[] }

const stableStringify = (v: unknown): string => {
    try {
        return JSON.stringify(v) ?? ''
    } catch {
        return ''
    }
}

/** Campos voláteis de metadado que NÃO devem forçar sync (o próprio sync os grava). */
const META_KEYS = new Set(['_savedAt', '_deviceId'])

function withoutMetaAndLogs(state: UnknownRecord): UnknownRecord {
    const out: UnknownRecord = {}
    for (const [k, v] of Object.entries(state)) {
        if (k === 'logs' || META_KEYS.has(k)) continue
        out[k] = v
    }
    return out
}

export function diffSessionForSync(prev: unknown, next: unknown): SessionSyncPlan {
    if (!isRecord(next)) return { mode: 'skip' }
    // Sem base sincronizada → primeiro envio deste device: sempre cheio.
    if (!isRecord(prev)) return { mode: 'full' }

    // Qualquer mudança FORA de logs (estrutura do treino, timer, check-in,
    // título, ordem...) → estado cheio. É o caminho conservador.
    if (stableStringify(withoutMetaAndLogs(prev)) !== stableStringify(withoutMetaAndLogs(next))) {
        return { mode: 'full' }
    }

    const prevLogs = isRecord(prev.logs) ? prev.logs : {}
    const nextLogs = isRecord(next.logs) ? next.logs : {}

    const set: UnknownRecord = {}
    const del: string[] = []

    for (const [k, v] of Object.entries(nextLogs)) {
        if (!(k in prevLogs) || stableStringify(prevLogs[k]) !== stableStringify(v)) set[k] = v
    }
    for (const k of Object.keys(prevLogs)) {
        if (!(k in nextLogs)) del.push(k)
    }

    if (Object.keys(set).length === 0 && del.length === 0) return { mode: 'skip' }
    return { mode: 'patch', set, del }
}
