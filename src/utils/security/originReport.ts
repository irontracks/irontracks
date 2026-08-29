/**
 * Persistência dos relatórios da guarda de origem (SEC-08).
 *
 * ⚠️ A JANELA DE OBSERVAÇÃO NÃO EXISTIA. Até 29/08/2026 o mismatch virava só
 * `console.error('[origin-guard]', …)` no middleware — ou seja, runtime log da
 * Vercel e nada mais. A retenção do plano é de ~1 dia: uma busca de 7 dias
 * responde que o intervalo excede a retenção, e a de 24 h volta vazia.
 *
 * O `CLAUDE.md` mandava esperar "uma janela limpa de relatórios" antes de ligar
 * `ORIGIN_GUARD_ENFORCE=true`. Essa janela ficou 15 dias correndo sem que
 * ninguém pudesse lê-la.
 *
 * É a MESMA lição que o CSP já tinha aprendido neste repo, e que está escrita
 * no CLAUDE.md: log e Sentry expiram e ficam ilegíveis de onde se investiga;
 * `audit_events` é consultável por SQL e não expira. O CSP recebeu esse
 * tratamento; a guarda de origem não. Consulta:
 *
 *   select metadata->>'kind' as tipo, metadata->>'originHost' as origem,
 *          metadata->>'path' as rota, count(*) as n, max(created_at) as ultimo
 *   from audit_events where action = 'origin_guard_mismatch'
 *   group by 1,2,3 order by 4 desc;
 *
 * Por que a escrita sai DAQUI e não de uma rota, como no CSP: lá quem reporta é
 * o NAVEGADOR, então tem de haver um endpoint público. Aqui quem detecta é o
 * nosso próprio servidor — uma rota interna só acrescentaria um salto de rede e
 * uma superfície pública a proteger.
 */

/** Nome da ação em `audit_events`. */
export const ACAO_ORIGIN_GUARD = 'origin_guard_mismatch'

/**
 * Teto de linhas por instância. Bem apertado, como no CSP: a pergunta é QUAIS
 * origens quebram, não quantas vezes. Um cliente exótico batendo em loop não
 * pode encher a tabela nem virar fatura.
 */
export const MAX_LINHAS_POR_INSTANCIA = 10

/**
 * Pares (tipo, origem, rota) já gravados por esta instância. A segunda
 * ocorrência do mesmo par não acrescenta nada.
 */
const vistos = new Set<string>()
let gravadas = 0

export interface RelatoDeOrigem {
    /** 'cross-origin' | 'missing-origin' */
    kind: string
    originHost: string
    host: string
    method: string
    path: string
    enforced: boolean
}

/** Chave de dedupe. Exportada para o teste medir a regra, não a implementação. */
export function chaveDoRelato(r: Pick<RelatoDeOrigem, 'kind' | 'originHost' | 'path'>): string {
    return `${r.kind}|${r.originHost}|${r.path}`
}

/**
 * Decide se ESTE relato deve ser gravado. Função pura sobre o estado da
 * instância — separada da escrita para poder ser exercitada sem rede.
 */
export function deveGravar(r: RelatoDeOrigem): boolean {
    if (gravadas >= MAX_LINHAS_POR_INSTANCIA) return false
    return !vistos.has(chaveDoRelato(r))
}

/** Marca como gravado. Chamado só quando a escrita foi de fato disparada. */
export function marcarGravado(r: RelatoDeOrigem): void {
    vistos.add(chaveDoRelato(r))
    gravadas += 1
}

/** Só para os testes: devolve a instância ao estado inicial. */
export function _resetParaTeste(): void {
    vistos.clear()
    gravadas = 0
}

/**
 * O corpo gravado. Sem query string e sem cabeçalho — o `path` já responde
 * "que rota", e o resto pode carregar dado do usuário numa tabela que ninguém
 * revisa.
 */
export function corpoDoEvento(r: RelatoDeOrigem) {
    return {
        action: ACAO_ORIGIN_GUARD,
        metadata: {
            kind: r.kind,
            originHost: r.originHost.slice(0, 120),
            host: r.host.slice(0, 120),
            method: r.method.slice(0, 10),
            path: r.path.slice(0, 200),
            enforced: r.enforced,
        },
    }
}

/**
 * Grava o relato, uma vez por par e por instância.
 *
 * **Nunca lança e nunca bloqueia.** Este código roda no middleware, em TODA
 * navegação: um throw aqui vira 500 no site inteiro de uma vez — e, como o app
 * nativo carrega o front deste servidor, levaria junto todos os aparelhos
 * instalados. Falta de credencial, rede fora, PostgREST recusando: tudo cai no
 * mesmo silêncio deliberado, e o `console.error` do chamador continua sendo a
 * pista imediata.
 */
export function registrarMismatch(r: RelatoDeOrigem): void {
    try {
        if (!deveGravar(r)) return

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY
        // `audit_events` é read-only para o cliente; escrever exige service-role.
        // Sem credencial não há o que fazer — e não é motivo para barulho.
        if (!url || !key) return

        marcarGravado(r)

        const envio = fetch(`${url}/rest/v1/audit_events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: key,
                Authorization: `Bearer ${key}`,
                Prefer: 'return=minimal',
            },
            body: JSON.stringify(corpoDoEvento(r)),
        }).catch(() => { /* ver o comentário do topo: silêncio deliberado */ })

        // Sem isto a instância pode ser congelada antes do envio sair — a mesma
        // classe da promessa órfã que deixou o Sentry mudo em rota server
        // (`lib/logger.ts`).
        void import('@vercel/functions')
            .then((m) => { try { m.waitUntil?.(envio) } catch { /* fora da Vercel */ } })
            .catch(() => { /* fora da Vercel */ })
    } catch {
        /* instrumentação nunca pode quebrar a navegação */
    }
}
