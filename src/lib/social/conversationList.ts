/**
 * "Conversas" mostrava CONTATOS — uma lista de nomes, sem prévia, sem horário e
 * sem não-lidas. Quem tinha três conversas não sabia qual tinha mensagem nova.
 *
 * Este módulo transforma (canais + mensagens) na lista que a tela desenha. É
 * puro: a decisão de "o que aparece e em que ordem" fica exercitável sem
 * Supabase, e o componente só desenha.
 *
 * ⚠️ Nada aqui exigiu schema novo: `direct_channels.last_message_at` e
 * `direct_messages.is_read/sender_id/content` já existiam. O que faltava era
 * alguém LER.
 */

export interface CanalDireto {
    id: string
    user1_id: string
    user2_id: string
    last_message_at: string | null
}

export interface MensagemDireta {
    channel_id: string
    sender_id: string
    content: string | null
    is_read: boolean | null
    created_at: string
}

export interface ResumoDeConversa {
    channelId: string
    /** O outro lado da conversa. É a chave para casar com a lista de contatos. */
    outroUsuarioId: string
    /** Texto da última mensagem, já com "Você: " quando fui eu quem falou. */
    previa: string
    /** ISO da última mensagem — a tela formata. */
    quandoIso: string | null
    /** Mensagens que EU ainda não li. */
    naoLidas: number
}

/** O outro participante do canal, do meu ponto de vista. */
export function outroLadoDoCanal(canal: CanalDireto, meuId: string): string {
    return String(canal.user1_id) === meuId ? String(canal.user2_id) : String(canal.user1_id)
}

/**
 * Monta o resumo de cada conversa.
 *
 * `mensagens` não precisa vir ordenada nem completa: a função pega a mais
 * recente por canal e conta as não lidas do que recebeu. Canal sem nenhuma
 * mensagem na amostra ainda aparece (com a prévia vazia), porque a tela precisa
 * dele para ordenar por `last_message_at` — sumir seria pior que não ter prévia.
 */
export function buildConversationList(
    canais: readonly CanalDireto[],
    mensagens: readonly MensagemDireta[],
    meuId: string,
): ResumoDeConversa[] {
    const ultimaPorCanal = new Map<string, MensagemDireta>()
    const naoLidasPorCanal = new Map<string, number>()

    for (const m of mensagens) {
        const canal = String(m?.channel_id || '')
        if (!canal) continue

        const atual = ultimaPorCanal.get(canal)
        if (!atual || new Date(m.created_at).getTime() > new Date(atual.created_at).getTime()) {
            ultimaPorCanal.set(canal, m)
        }

        // Não lida é o que EU recebi e não abri. Mensagem MINHA que o outro não
        // leu é problema dele, não badge meu — contar isso encheria a tela de
        // vermelho para quem só mandou mensagem e ninguém respondeu.
        if (m.is_read === false && String(m.sender_id) !== meuId) {
            naoLidasPorCanal.set(canal, (naoLidasPorCanal.get(canal) ?? 0) + 1)
        }
    }

    const resumos: ResumoDeConversa[] = []
    for (const canal of canais) {
        const id = String(canal?.id || '')
        if (!id) continue
        const ultima = ultimaPorCanal.get(id)
        const souEuQueFalei = ultima ? String(ultima.sender_id) === meuId : false
        const texto = String(ultima?.content ?? '').replace(/\s+/g, ' ').trim()
        resumos.push({
            channelId: id,
            outroUsuarioId: outroLadoDoCanal(canal, meuId),
            previa: texto ? (souEuQueFalei ? `Você: ${texto}` : texto) : '',
            quandoIso: ultima?.created_at ?? canal.last_message_at ?? null,
            naoLidas: naoLidasPorCanal.get(id) ?? 0,
        })
    }

    // Mais recente primeiro. Conversa sem carimbo vai para o fim em vez de
    // embaralhar as que têm — sem o fallback, `NaN` na comparação deixa a
    // ordenação a cargo do acaso.
    return resumos.sort((a, b) => {
        const ta = a.quandoIso ? new Date(a.quandoIso).getTime() : 0
        const tb = b.quandoIso ? new Date(b.quandoIso).getTime() : 0
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
    })
}

const FUSO = 'America/Sao_Paulo'

/** O dia-calendário em BRT, para comparar "hoje" sem cair no dia UTC. */
const diaBrt = (d: Date): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/**
 * Horário da conversa, no formato que lista de mensagens usa: hora no mesmo
 * dia, "ontem", dia da semana na última semana, data depois disso.
 *
 * ⚠️ Tudo em BRT explícito. Sem `timeZone`, um servidor em UTC mostra a
 * mensagem das 22h de ontem como sendo de hoje — o mesmo defeito que já pegou o
 * heatmap de nutrição e o streak neste repo.
 */
export function formatarQuandoDaConversa(iso: string | null, agora: Date = new Date()): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ''

    if (diaBrt(d) === diaBrt(agora)) {
        return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(d)
    }

    const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    if (diaBrt(d) === diaBrt(ontem)) return 'ontem'

    const dias = (agora.getTime() - d.getTime()) / (24 * 60 * 60 * 1000)
    if (dias >= 0 && dias < 7) {
        return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'short' }).format(d).replace('.', '')
    }
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(d)
}

/** Badge de não lidas: acima de 99 vira "99+" para não esticar a linha. */
export function rotuloNaoLidas(n: number): string {
    if (n <= 0) return ''
    return n > 99 ? '99+' : String(n)
}
