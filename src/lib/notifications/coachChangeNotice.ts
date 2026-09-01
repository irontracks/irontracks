/**
 * Avisar o ALUNO quando o coach mexe no treino ou na dieta dele.
 *
 * Pedido do dono (01/09/2026). O que existia: "treino NOVO do professor"
 * (`workout_assigned`), disparado em três pontos do painel. O que não existia:
 * qualquer aviso quando o coach EDITA um treino que o aluno já tem, prescreve
 * um plano alimentar ou escreve a orientação de uma refeição — ou seja, o
 * trabalho do coach chegava calado, e o aluno só descobria abrindo o app.
 *
 * ## A janela de agrupamento é o coração deste módulo
 *
 * Coach não ajusta uma coisa: ele abre o treino do aluno e mexe em cinco
 * exercícios em dois minutos. Um push por save transformaria isso em cinco
 * pushes — e notificação que metralha é notificação que o usuário desliga (e,
 * uma vez desligada, some junto com a que importava). Por isso o primeiro
 * aviso passa e os seguintes, dentro da janela, são engolidos.
 *
 * A janela olha o DESTINATÁRIO + o tipo, não o remetente: o que incomoda é
 * receber cinco avisos, e isso não muda se dois coaches editarem o mesmo
 * aluno. (`shouldThrottleBySenderType`, que o repo já tinha, agrupa por
 * remetente — serve para outro problema.)
 *
 * ## O que este módulo NÃO faz
 *
 * Não decide preferência nem horário de silêncio: quem faz isso é
 * `insertNotifications` (linha in-app + push, já filtrando pelo toggle do
 * aluno) e o `sender`. Repetir a regra aqui criaria uma segunda fonte de
 * verdade sobre quem pode ser notificado.
 */
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

/** Os dois tipos que este módulo emite. Ambos mapeados em NOTIFICATION_TYPE_TO_PREFERENCE. */
export type CoachChangeKind = 'workout_updated' | 'diet_updated'

/**
 * Minutos em que um segundo aviso do MESMO tipo é engolido.
 *
 * 30 min cobre a sessão de ajustes de um coach sem esconder a mudança do dia
 * seguinte. Não é para o aluno perder aviso: é para ele receber UM por rodada
 * de trabalho.
 */
export const JANELA_DE_AGRUPAMENTO_MIN = 30

type Origem = 'workout_edit' | 'diet_prescribe' | 'diet_note'

export interface CoachChangeInput {
    /** AUTH UID do aluno (o dono da conta que recebe o aviso). */
    studentUserId: string
    kind: CoachChangeKind
    /** Nome do treino ou do plano — entra na mensagem quando existe. */
    nome?: string | null
    /** De onde veio, só para telemetria/metadata. */
    origem?: Origem
}

export interface CoachChangeResult {
    ok: boolean
    /** `false` quando a janela de agrupamento engoliu o aviso. */
    notified: boolean
    motivo?: 'agrupado' | 'sem_destinatario' | 'erro'
}

/** Título e corpo do aviso. Puro — o texto é decisão de produto, não de I/O. */
export function textoDoAviso(kind: CoachChangeKind, nome?: string | null): { title: string; message: string } {
    const alvo = String(nome || '').trim()
    if (kind === 'workout_updated') {
        return {
            title: 'Seu professor ajustou seu treino 🏋️',
            message: alvo
                ? `"${alvo}" mudou. Dá uma olhada antes de treinar.`
                : 'Seu treino mudou. Dá uma olhada antes de treinar.',
        }
    }
    return {
        title: 'Seu professor atualizou sua dieta 🥗',
        message: alvo
            ? `"${alvo}" foi atualizado pelo seu professor.`
            : 'Seu plano alimentar foi atualizado pelo seu professor.',
    }
}

/** Para onde o toque leva. Treino abre a lista; dieta, a aba de nutrição. */
export function destinoDoAviso(kind: CoachChangeKind): string {
    return kind === 'workout_updated' ? '/dashboard' : '/dashboard/nutrition'
}

/**
 * Já houve aviso deste tipo para este aluno dentro da janela?
 *
 * Consulta a própria tabela de notificações — nada de estado em memória: a
 * rota roda em instâncias diferentes a cada request, e um contador local
 * agruparia só por acaso.
 */
async function dentroDaJanela(studentUserId: string, kind: CoachChangeKind): Promise<boolean> {
    try {
        const admin = createAdminClient()
        const desde = new Date(Date.now() - JANELA_DE_AGRUPAMENTO_MIN * 60 * 1000).toISOString()
        const { data, error } = await admin
            .from('notifications')
            .select('id')
            .eq('user_id', studentUserId)
            .eq('type', kind)
            .gte('created_at', desde)
            .limit(1)
        if (error) {
            // Falha de leitura NÃO pode silenciar o aviso: perder a notificação é
            // pior que mandar uma a mais. Mesmo princípio do "fail open" que o
            // filtro de preferências já usa.
            logError('coachChange.janela', error)
            return false
        }
        return Array.isArray(data) && data.length > 0
    } catch (e) {
        logError('coachChange.janela', e)
        return false
    }
}

/**
 * Grava a notificação e dispara o push — respeitando a janela de agrupamento.
 *
 * Best-effort por contrato: quem chama já gravou a mudança do coach, e o aviso
 * nunca pode derrubar esse fluxo. Por isso devolve resultado em vez de lançar.
 */
export async function notifyCoachChange(input: CoachChangeInput): Promise<CoachChangeResult> {
    const studentUserId = String(input?.studentUserId || '').trim()
    if (!studentUserId) return { ok: true, notified: false, motivo: 'sem_destinatario' }

    try {
        if (await dentroDaJanela(studentUserId, input.kind)) {
            return { ok: true, notified: false, motivo: 'agrupado' }
        }

        const { title, message } = textoDoAviso(input.kind, input.nome)
        const r = await insertNotifications([
            {
                user_id: studentUserId,
                title,
                message,
                type: input.kind,
                metadata: { link: destinoDoAviso(input.kind), origem: input.origem ?? null },
            },
        ])
        return { ok: r.ok, notified: r.ok && r.inserted > 0, motivo: r.ok ? undefined : 'erro' }
    } catch (e) {
        logError('coachChange.notify', e)
        return { ok: false, notified: false, motivo: 'erro' }
    }
}
