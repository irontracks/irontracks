"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
    Bell, Check, X, Users, MessageSquare, Trophy, Dumbbell,
    Trash2, Sparkles, Activity, Heart, Star,
    UserPlus, Calendar, Utensils, Swords, Flame, Target,
    Camera, Megaphone, Droplet, BarChart3, Award, Clock, CreditCard
} from 'lucide-react';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { useDialog } from '@/contexts/DialogContext';
import { createClient } from '@/utils/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { logError, logWarnRemote } from '@/lib/logger'
import { getErrorMessage } from '@/utils/errorMessage'
import type { AppNotification } from '@/types/social'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { useFocusTrap } from '@/hooks/useFocusTrap'

type NotificationItem = AppNotification & { data?: Record<string, unknown> };

interface NotificationCenterProps {
    onStartSession?: (workout: unknown) => void;
    user?: { id: string | number } | null;
    initialOpen?: boolean;
    embedded?: boolean;
    open?: boolean; // When embedded, used to trigger markRead and control visibility awareness
    /**
     * Fecha a Central. Em modo `embedded` quem controla a visibilidade é o pai,
     * então navegar sem avisá-lo deixaria o modal aberto POR CIMA do destino —
     * o usuário chegaria onde pediu e não veria.
     */
    onNavigate?: () => void;
}

// ─── Notification type config ─────────────────────────────────────────────────
// Keys MUST match the `type` values emitted by the server. Aliases map legacy
// names to the canonical entry so one server type rename doesn't break the UI.
//
// ⚠️ A COR RESPONDE "ISTO EXIGE ALGO DE MIM?", NÃO "QUE EVENTO É ESTE?"
//
// Até 13/08/2026 eram 23 tipos em 7 famílias de cor sem critério: `emerald`
// cobria Meta/Online/Marco/Refeição e `green` cobria Treino/Aceito/Aceito, sem
// nenhuma regra que explicasse a diferença. Cores distinguíveis (Δ=69) numa
// distinção que não codificava nada — pior que cores iguais, porque prometem um
// sistema e não entregam. E ninguém memoriza 7 códigos numa lista aberta uma vez
// por dia.
//
// O TIPO do evento já está escrito no rótulo do card (PR, Streak, Meta, Treino).
// Repetir isso em matiz é redundância que gasta os pigmentos de alarme e de ação.
// O que a cor deve carregar é a FUNÇÃO — o que a notificação pede de você:
//
//   ACAO      dourado  → alguém espera uma resposta sua (aceitar, recusar)
//   CONQUISTA verde    → algo bom se concretizou
//   AVISO     vermelho → comunicado que não pode passar batido (ÚNICO vermelho)
//   LEMBRETE  âmbar    → o app cutucando na hora certa
//   SOCIAL    neutro   → movimento da rede; informativo, não acionável
//
// Ao adicionar um tipo novo, a pergunta é "o que isto exige do usuário?" — não
// "que cor combina?". Guard em `__tests__/notificacaoPorFuncao.test.ts`.
type Funcao = 'acao' | 'conquista' | 'aviso' | 'lembrete' | 'social'

const ESTILO_POR_FUNCAO: Record<Funcao, { bg: string; border: string; dot: string }> = {
    acao:      { bg: 'from-yellow-500/20 to-amber-600/10',  border: 'border-yellow-500/30',  dot: 'bg-yellow-400' },
    conquista: { bg: 'from-green-500/20 to-emerald-600/10', border: 'border-green-500/30',   dot: 'bg-green-400' },
    aviso:     { bg: 'from-red-500/20 to-red-600/10',       border: 'border-red-500/30',     dot: 'bg-red-400' },
    lembrete:  { bg: 'from-amber-500/15 to-amber-600/5',    border: 'border-amber-500/25',   dot: 'bg-amber-400' },
    social:    { bg: 'from-white/[0.06] to-white/[0.02]',   border: 'border-white/10',       dot: 'bg-neutral-400' },
}

type TypeConfig = {
    icon: React.ReactNode;
    bg: string;
    border: string;
    dot: string;
    label: string;
};

/** Monta a config do tipo a partir da FUNÇÃO — cor nunca é escolhida à mão. */
const tipo = (icon: React.ReactNode, label: string, funcao: Funcao): TypeConfig => ({
    icon, label, ...ESTILO_POR_FUNCAO[funcao],
})

const TYPE_CONFIG: Record<string, TypeConfig> = {
    // Convite de treino em dupla: é AÇÃO — expira e espera resposta (aceitar/recusar).
    invite: tipo(<Users size={15} />, 'Convite', 'acao'),
    team_invite: tipo(<Users size={15} />, 'Convite', 'acao'),
    friend_pr: tipo(<Trophy size={15} />, 'PR', 'conquista'),
    friend_streak: tipo(<Flame size={15} />, 'Streak', 'social'),
    friend_goal: tipo(<Target size={15} />, 'Meta', 'conquista'),
    workout_finish: tipo(<Dumbbell size={15} />, 'Treino', 'conquista'),
    workout_start: tipo(<Activity size={15} />, 'Iniciou', 'social'),
    friend_online: tipo(<Activity size={15} />, 'Online', 'social'),
    follow_request: tipo(<UserPlus size={15} />, 'Seguir', 'acao'),
    follow_accepted: tipo(<UserPlus size={15} />, 'Aceito', 'conquista'),
    message: tipo(<MessageSquare size={15} />, 'Mensagem', 'acao'),
    broadcast: tipo(<Megaphone size={15} />, 'Aviso', 'aviso'),
    appointment: tipo(<Calendar size={15} />, 'Agenda', 'lembrete'),
    appointment_created: tipo(<Calendar size={15} />, 'Agenda', 'lembrete'),
    milestone: tipo(<Star size={15} />, 'Marco', 'conquista'),
    story_posted: tipo(<Camera size={15} />, 'Story', 'social'),
    story_like: tipo(<Heart size={15} />, 'Curtiu', 'social'),
    like: tipo(<Heart size={15} />, 'Curtiu', 'social'),
    story_reaction: tipo(<Heart size={15} />, 'Reação', 'social'),
    challenge_created: tipo(<Swords size={15} />, 'Desafio', 'acao'),
    challenge_accepted: tipo(<Swords size={15} />, 'Aceito', 'conquista'),
    challenge_declined: tipo(<Swords size={15} />, 'Recusado', 'social'),
    meal_reminder: tipo(<Utensils size={15} />, 'Refeição', 'lembrete'),
    workout_reminder: tipo(<Activity size={15} />, 'Lembrete', 'lembrete'),

    // ── Os 14 tipos que o servidor emite e esta tabela não conhecia ──────────
    // Medido no banco em 27/08/2026 (180 dias): 620 de 5.212 notificações, ou
    // 11,9%, caíam no `default` — sino cinza, rótulo "Info", função social.
    // O comentário no topo diz "Keys MUST match the `type` values emitted by
    // the server" e ninguém tinha conferido contra o servidor.
    //
    // Os dois piores casos mostram o custo: `billing_issue` — falha de
    // PAGAMENTO — chegava como social neutro, a função reservada para "movimento
    // da rede, informativo, não acionável"; e os dois tipos de admin, que são
    // gente esperando aprovação, chegavam com a mesma cara de um story curtido.
    friends_trained_today: tipo(<Users size={15} />, 'Amigos', 'social'),
    friend_comeback: tipo(<Activity size={15} />, 'Voltou', 'social'),
    friend_achievement: tipo(<Award size={15} />, 'Conquista', 'conquista'),
    friend_weekly_goal: tipo(<Target size={15} />, 'Meta', 'conquista'),
    morning_briefing: tipo(<Sparkles size={15} />, 'Resumo', 'lembrete'),
    weekly_recap: tipo(<BarChart3 size={15} />, 'Semana', 'lembrete'),
    muscle_weekly_insights: tipo(<BarChart3 size={15} />, 'Músculos', 'lembrete'),
    water_reminder: tipo(<Droplet size={15} />, 'Água', 'lembrete'),
    pr_close: tipo(<Target size={15} />, 'Perto do PR', 'lembrete'),
    // `streak_at_risk` e `inactivity` cutucam, não alarmam: AVISO é o ÚNICO
    // vermelho do app e existe para o que não pode passar batido. Gastar o
    // pigmento de alarme num streak em risco deixa a cobrança de fatura sem
    // como gritar.
    streak_at_risk: tipo(<Flame size={15} />, 'Streak', 'lembrete'),
    inactivity: tipo(<Clock size={15} />, 'Sumiu', 'lembrete'),
    // Alguém está esperando uma resposta sua — é a definição de AÇÃO.
    admin_access_request: tipo(<UserPlus size={15} />, 'Acesso', 'acao'),
    admin_new_signup: tipo(<UserPlus size={15} />, 'Cadastro', 'acao'),
    // Dinheiro: o caso para o qual o vermelho existe.
    billing_issue: tipo(<CreditCard size={15} />, 'Cobrança', 'aviso'),

    // ── O trabalho do COACH chegando ao aluno ────────────────────────────────
    // LEMBRETE, não ação: ninguém espera RESPOSTA do aluno — o que se pede é
    // que ele abra antes de treinar/comer. Ação é para quem tem alguém do outro
    // lado aguardando (convite, pedido de acesso, mensagem), e gastar o dourado
    // aqui esvaziaria justamente esses. Critério em `notificacaoPorFuncao`.
    //
    // ⚠️ `workout_assigned` JÁ era emitido pelo servidor e não estava nesta
    // tabela: caía no `default` — sino cinza, rótulo "Info". Mesmo defeito dos
    // 14 tipos corrigidos em 27/08/2026, num tipo que nasceu depois.
    workout_assigned: tipo(<Dumbbell size={15} />, 'Treino novo', 'lembrete'),
    workout_updated: tipo(<Dumbbell size={15} />, 'Treino', 'lembrete'),
    diet_updated: tipo(<Utensils size={15} />, 'Dieta', 'lembrete'),
    // A IA respondeu sobre a foto/vídeo anexado à série — a resposta mora no histórico.
    set_media_analyzed: tipo(<Camera size={15} />, 'Foto/vídeo', 'lembrete'),

    default: tipo(<Bell size={15} />, 'Info', 'social'),
};

// Legacy aliases — map old server type names to the current config entry.
const TYPE_ALIASES: Record<string, string> = {
    workout_finished: 'workout_finish',
    workout_started: 'workout_start',
    pr: 'friend_pr',
};

/**
 * Tipo desconhecido já foi reportado nesta sessão?
 *
 * O componente re-renderiza a cada realtime e a cada abertura da lista; sem
 * dedupe, um único tipo novo viraria centenas de eventos. Módulo-nível de
 * propósito: a marca precisa sobreviver ao ciclo de vida do componente.
 */
const tiposDesconhecidosReportados = new Set<string>();

/**
 * Cair no `default` era SILENCIOSO — e foi por isso que 14 tipos ficaram meses
 * como "Info" cinza sem ninguém notar. Só o banco sabia, e ninguém perguntou.
 *
 * A lista fixa conserta o passado; este aviso é a defesa contra o futuro, que é
 * o que de fato importa: tipo novo emitido pelo servidor aparece no Sentry em
 * vez de virar sino genérico para sempre. "Toda saída silenciosa em caminho
 * crítico é bomba-relógio" — a regra do repo, aplicada.
 */
function getTypeConfig(type: string) {
    const canonical = TYPE_ALIASES[type] ?? type;
    const cfg = TYPE_CONFIG[canonical];
    if (cfg) return cfg;
    if (canonical && !tiposDesconhecidosReportados.has(canonical)) {
        tiposDesconhecidosReportados.add(canonical);
        logWarnRemote('notifications.tipo-desconhecido', 'tipo sem entrada em TYPE_CONFIG', { type: canonical });
    }
    return TYPE_CONFIG.default;
}

/**
 * Para onde cada notificação leva.
 *
 * A Central era um beco sem saída: 24 tipos, e o card não tinha `onClick`
 * nenhum. Pior que não levar a lugar nenhum, ele PROMETIA — `hover:scale` e
 * `hover:shadow` são o vocabulário de card interativo. O usuário toca no aviso
 * de que um amigo bateu PR e a tela não muda.
 *
 * O destino NÃO é decidido aqui: o app já tem o roteador de notificações
 * (`irontracks:push:navigate`, no shell do dashboard), que é quem sabe abrir
 * uma conversa, um painel de admin ou uma rota interna. Tocar no card emite o
 * MESMO evento que o toque no push emite. Escrever "tipo → destino" num segundo
 * lugar é a duplicação que este repo já pagou caro várias vezes.
 *
 * Só entra tipo cujo destino é INEQUÍVOCO. Ficam de fora, e sem prometer
 * clique:
 *
 * - `meal_reminder` / `water_reminder` — a Nutrição é um overlay, não uma rota;
 *   `/dashboard/nutrition` não é alcançável dentro do app nativo e cairia no
 *   dashboard, que não é o destino que o card sugere.
 * - `muscle_weekly_insights`, `billing_issue`, `broadcast` — sem tela própria
 *   ou, no caso de cobrança, com o gate de iOS por cima.
 * - `invite` — tem os próprios botões de aceitar/recusar no card.
 *
 * Levar para o lugar errado é pior que não levar: o usuário perde o contexto e
 * ainda tem que achar o caminho de volta.
 */
const COMUNIDADE = '/dashboard/community'
const DESTINO_POR_TIPO: Record<string, string> = {
    // Movimento de quem ele segue — tudo isso vive no feed.
    friend_pr: COMUNIDADE,
    friend_streak: COMUNIDADE,
    friend_goal: COMUNIDADE,
    friend_weekly_goal: COMUNIDADE,
    friend_achievement: COMUNIDADE,
    friend_comeback: COMUNIDADE,
    friends_trained_today: COMUNIDADE,
    friend_online: COMUNIDADE,
    workout_start: COMUNIDADE,
    workout_finish: COMUNIDADE,
    milestone: COMUNIDADE,
    story_posted: COMUNIDADE,
    story_like: COMUNIDADE,
    story_reaction: COMUNIDADE,
    like: COMUNIDADE,
    follow_request: COMUNIDADE,
    follow_accepted: COMUNIDADE,
    challenge_created: COMUNIDADE,
    challenge_accepted: COMUNIDADE,
    challenge_declined: COMUNIDADE,

    message: '/dashboard/chat',
    appointment: '/dashboard/schedule',
    appointment_created: '/dashboard/schedule',

    // Cutucões sobre o próprio treino: o destino é a lista de treinos, de onde
    // se começa um.
    workout_reminder: '/dashboard',
    // O coach mexeu: treino leva à lista (de onde se inicia), dieta à nutrição.
    workout_assigned: '/dashboard',
    workout_updated: '/dashboard',
    diet_updated: '/dashboard/nutrition',
    set_media_analyzed: '/dashboard',
    streak_at_risk: '/dashboard',
    inactivity: '/dashboard',
    pr_close: '/dashboard',
    morning_briefing: '/dashboard',
}

/** Tipos que o roteador resolve pelo TYPE, sem precisar de link. */
const ROTEADOS_PELO_TIPO = new Set(['admin_access_request', 'admin_new_signup'])

/**
 * O link do destino, ou string vazia quando não há para onde ir.
 *
 * `weekly_recap` é o único que monta parâmetro: a tela do resumo semanal quer
 * saber QUAL semana, e o metadata guarda `week_start`. Sem ele o link não é
 * emitido — abrir a semana errada é pior que não abrir.
 */
type ItemComDestino = { type: string; metadata?: Record<string, unknown> | null; sender_id?: string | null }

export function destinoDa(item: ItemComDestino): string {
    const canonical = TYPE_ALIASES[item.type] ?? item.type
    if (canonical === 'weekly_recap') {
        const meta = (item.metadata ?? {}) as Record<string, unknown>
        const semana = String(meta.week_start ?? '').trim()
        return semana ? `/dashboard/report/weekly?week=${encodeURIComponent(semana)}` : ''
    }
    return DESTINO_POR_TIPO[canonical] ?? ''
}

/** O card leva a algum lugar? */
export function temDestino(item: ItemComDestino): boolean {
    const canonical = TYPE_ALIASES[item.type] ?? item.type
    return ROTEADOS_PELO_TIPO.has(canonical) || Boolean(destinoDa(item))
}

// ─── Micro components ─────────────────────────────────────────────────────────

function NotifDot({ color }: { color: string }) {
    return (
        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${color} shadow-lg ring-2 ring-black`} />
    );
}

/**
 * O corpo do card: um `<button>` quando leva a algum lugar, uma `<div>` quando
 * não leva.
 *
 * Ele não pode ENVOLVER o card inteiro, porque o botão de remover mora ali
 * dentro e botão dentro de botão é HTML inválido — o navegador desaninha e o
 * clique passa a cair no lugar errado. Envolvendo só o texto, o remover fica
 * fora e continua alcançável por teclado como um controle próprio.
 *
 * O nome acessível é o TÍTULO da notificação: um leitor de tela anunciaria
 * "botão" e mais nada, e a lista inteira soaria igual.
 *
 * Exportado para ser TESTADO de verdade. Montar a Central inteira exigiria
 * Supabase e dois contextos — e um source-guard aqui é FALSO: com o corpo
 * trocado por uma `<div>` fixa, o `<button>` continua escrito no arquivo (em
 * código morto) e a busca por ele passa verde com o card inerte. Medido por
 * mutação: a versão de forma deste guard não pegou o defeito.
 */
export function ConteudoDoCard({
    clicavel, onOpen, titulo, children,
}: { clicavel: boolean; onOpen: () => void; titulo: string; children: React.ReactNode }) {
    if (!clicavel) return <div className="flex gap-3">{children}</div>;
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={titulo ? `Abrir: ${titulo}` : 'Abrir notificação'}
            className="flex gap-3 w-full text-left cursor-pointer"
        >
            {children}
        </button>
    );
}

function IconBubble({ children, bg, border }: { children: React.ReactNode; bg: string; border: string }) {
    return (
        <div className={`flex-shrink-0 w-9 h-9 rounded-2xl bg-gradient-to-br ${bg} border ${border} flex items-center justify-center text-white/90`}>
            {children}
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────

const NotificationCenter = ({ onStartSession, user, initialOpen, embedded, open: externalOpen, onNavigate }: NotificationCenterProps) => {
    const { alert, confirm } = useDialog();
    const [isOpen, setIsOpen] = useState(() => !!initialOpen);
    const panelRef = useFocusTrap(isOpen, () => setIsOpen(false));
    // In embedded mode, use the externally-controlled `open` prop (showNotifCenter from parent)
    const effectiveOpen = embedded ? !!externalOpen : isOpen;
    const { incomingInvites, acceptInvite, rejectInvite } = useTeamWorkout();
    const [systemNotifications, setSystemNotifications] = useState<NotificationItem[]>([]);
    const [clearing, setClearing] = useState(false);
    const safeUserId = user?.id ? String(user.id) : '';
    const supabase = useMemo(() => { try { return createClient(); } catch { return null; } }, []);

    // ─── Fetch + Realtime ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!supabase || !safeUserId) return;
        let isMounted = true;
        let channel: RealtimeChannel | null = null;

        const fetchNotifications = async () => {
            try {
                const { data, error } = await supabase
                    .from('notifications')
                    .select('id, user_id, type, title, message, metadata, read, is_read, created_at')
                    .eq('user_id', safeUserId)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (error) logError('component:NotificationCenter.fetchNotifications', error);
                if (isMounted) setSystemNotifications((data as NotificationItem[]) || []);
            } catch (e) { logError('component:NotificationCenter.fetchNotifications', e); if (isMounted) setSystemNotifications([]); }
        };

        fetchNotifications();

        channel = supabase
            .channel(`notif-list:${safeUserId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${safeUserId}` },
                (payload) => {
                    setSystemNotifications((prev) => {
                        const safePrev = Array.isArray(prev) ? prev : [];
                        const next = payload?.new && typeof payload.new === 'object' ? (payload.new as NotificationItem) : null;
                        if (!next) return safePrev;
                        // Avoid duplicates (e.g. rapid reconnect)
                        if (safePrev.some(n => n?.id === (next as NotificationItem).id)) return safePrev;
                        return [next, ...safePrev];
                    });
                })
            .subscribe((status) => {
                // Re-fetch on channel reconnect so no notifications are missed
                if (status === 'SUBSCRIBED' && isMounted) fetchNotifications();
            });

        return () => { isMounted = false; if (channel) supabase.removeChannel(channel); };
    }, [supabase, safeUserId]);

    // ─── Mark all read on open (with delay to show unread dots first) ─────────
    useEffect(() => {
        if (!effectiveOpen || !safeUserId || !supabase) return;
        let cancelled = false;
        // Delay mark-read so the user sees the unread indicators before they disappear
        const timer = setTimeout(async () => {
            if (cancelled) return;
            try {
                // Update ALL unread notifications — covers legacy rows where
                // one column may be true while the other is still false/null
                await supabase
                    .from('notifications')
                    .update({ read: true, is_read: true })
                    .eq('user_id', safeUserId)
                    .or('read.eq.false,is_read.eq.false,is_read.is.null');
                if (cancelled) return;
                setSystemNotifications(prev =>
                    (Array.isArray(prev) ? prev : []).map(n => ({ ...n, read: true, is_read: true }))
                );
                // Clear iOS app icon badge — best-effort, don't await
                fetch('/api/push/clear-badge', { method: 'POST', credentials: 'include' }).catch(() => { });
            } catch (e) { logError('component:NotificationCenter.markRead', e); return; }
        }, 800);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [effectiveOpen, supabase, safeUserId]);

    // ─── Actions ─────────────────────────────────────────────────────────────
    /**
     * Tocar no card leva ao destino — pelo MESMO evento que o toque no push
     * dispara, então "tipo de notificação → tela" continua morando num lugar só.
     *
     * O modal fecha ANTES de emitir: o roteador troca a `view` por baixo, e um
     * modal ainda aberto cobriria o destino inteiro.
     */
    const abrirDestino = (item: ItemComDestino) => {
        if (!temDestino(item)) return;
        const canonical = TYPE_ALIASES[item.type] ?? item.type;
        onNavigate?.();
        setIsOpen(false);
        window.dispatchEvent(
            new CustomEvent('irontracks:push:navigate', {
                detail: {
                    type: canonical,
                    link: destinoDa(item),
                    senderId: String(item.sender_id ?? '').trim() || undefined,
                },
            }),
        );
    };

    const handleDelete = async (id: string | null, e?: React.MouseEvent) => {
        try { e?.stopPropagation?.(); } catch { }
        if (!id || !supabase) return;
        setSystemNotifications(prev => (Array.isArray(prev) ? prev.filter(n => n?.id !== id) : []));
        try { await supabase.from('notifications').delete().eq('id', id); } catch (e) { logError('component:NotificationCenter.deleteNotification', e); return; }
    };

    /**
     * Apagar TODAS as notificações — `delete()` no banco, sem volta.
     *
     * A pergunta era `confirm("Limpar todas as notificações?")`, um argumento
     * só: caíam os defaults, e o botão de confirmar saía DOURADO — a cor da
     * ação primária do app — sob o título genérico "Confirmação". Um `DELETE`
     * irreversível se apresentando como pergunta neutra, ao lado de um diálogo
     * de descartar treino que é vermelho e diz "Isso não pode ser desfeito".
     *
     * Não é hipótese: em 27/08/2026 eu mesmo apaguei as notificações da conta
     * de teste tocando ali sem perceber o que confirmava.
     *
     * A contagem entra na mensagem porque é o que dimensiona a perda — "3" e
     * "47" são decisões diferentes.
     */
    const handleClearAll = async () => {
        if (clearing) return;
        const quantas = systemNotifications.length;
        const confirmed = await confirm(
            quantas === 1
                ? 'A notificação é apagada de vez. Isso não pode ser desfeito.'
                : `As ${quantas} notificações são apagadas de vez. Isso não pode ser desfeito.`,
            'Apagar todas as notificações?',
            { confirmText: 'Apagar tudo', cancelText: 'Manter', destructive: true },
        );
        if (!confirmed) return;
        setClearing(true);
        try {
            if (!supabase) return;
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) return;
            await supabase.from('notifications').delete().eq('user_id', currentUser.id);
            setSystemNotifications([]);
        } catch (e) { logError('component:NotificationCenter.clearAll', e); } finally {
            setClearing(false);
        }
    };

    const handleAccept = async (item: { data?: unknown;[key: string]: unknown }) => {
        setIsOpen(false);
        try {
            const invite = item?.data ?? item?.metadata ?? null;
            if (!invite) return;
            const inv = invite as Record<string, unknown>;
            if (typeof acceptInvite === 'function') await acceptInvite(invite as Parameters<typeof acceptInvite>[0]);
            if (inv.workout && typeof onStartSession === 'function') onStartSession(inv.workout);
        } catch (e) { await alert("Erro ao aceitar: " + getErrorMessage(e)); }
    };

    const handleReject = async (item: { id?: unknown;[key: string]: unknown }) => {
        try { if (typeof rejectInvite === 'function') await rejectInvite(item?.id as string); } catch (e) { logError('component:NotificationCenter.rejectInvite', e); return; }
    };

    // ─── Data assembly ────────────────────────────────────────────────────────
    // Relógio em estado, avançado a cada 60s. Chamar `Date.now()` no render é
    // impuro (`react-hooks/purity`) — e, de quebra, o rótulo "5m atrás" ficava
    // congelado até o componente re-renderizar por outro motivo.
    const [agoraMs, setAgoraMs] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setAgoraMs(Date.now()), 60_000);
        return () => clearInterval(t);
    }, []);

    const formatTime = (isoString?: string) => {
        if (!isoString) return 'Agora';

        const diff = (agoraMs - new Date(isoString).getTime()) / 1000;
        if (diff < 60) return 'Agora';
        if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
        return new Date(isoString).toLocaleDateString();
    };

    const safeIncomingInvites = Array.isArray(incomingInvites) ? incomingInvites.filter(Boolean) : [];
    // Preserve server-emitted types verbatim — the TYPE_CONFIG map (plus
    // TYPE_ALIASES for legacy renames) picks the right icon and color.
    const safeSystem = Array.isArray(systemNotifications) ? systemNotifications.map(n => ({
        ...n, type: String(n?.type ?? 'default'),
    })) : [];

    const allNotifications = [
        ...safeIncomingInvites.map((inv, idx) => {
            const safeFrom = inv?.from && typeof inv.from === 'object' ? (inv.from as Record<string, unknown>) : null;
            const fromName = String(safeFrom?.displayName ?? safeFrom?.display_name ?? inv?.from_display_name ?? inv?.fromName ?? '').trim() || 'Alguém';
            const safeWorkout = inv?.workout && typeof inv.workout === 'object' ? (inv.workout as Record<string, unknown>) : null;
            const workoutTitle = String(safeWorkout?.title ?? safeWorkout?.name ?? 'Treino');
            const ts = (() => { const raw = inv?.created_at ?? inv?.createdAt ?? null; if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0; if (typeof raw === 'string') { const ms = Date.parse(raw); return Number.isFinite(ms) ? ms : 0; } return 0; })();
            return { id: inv?.id ?? inv?.invite_id ?? `invite_${idx}`, type: 'invite', title: `Convite de ${fromName}`, message: `Chamou você para treinar: ${workoutTitle}`, timeAgo: 'Agora', data: inv, timestamp: ts, read: false };
        }),
        ...safeSystem.map(n => ({
            id: n.id, type: n.type || 'default', title: n.title,
            message: String(n.message || (n as unknown as Record<string, unknown>).body || ''),
            // `metadata` e `sender_id` precisam vir para a LISTA, não só dentro
            // de `data`: é deles que sai o destino do toque. Sem `metadata` o
            // `weekly_recap` não acha o `week_start`, `destinoDa` devolve vazio
            // e o card deixa de ser clicável — em silêncio, porque a lista
            // continua idêntica na tela. Pego na conferência visual, com os
            // testes todos verdes.
            metadata: n.metadata ?? null,
            sender_id: n.sender_id ?? null,
            timeAgo: formatTime(n.created_at), data: n,
            timestamp: (() => { try { const ms = new Date(n?.created_at || 0).getTime(); return Number.isFinite(ms) ? ms : 0; } catch { return 0; } })(),
            read: !!(n?.read === true || n?.is_read === true),
        }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    // Use is_read as canonical field; fall back to read for legacy rows
    const unreadCount = allNotifications.filter(n => {
        const item = n as typeof n & { is_read?: boolean };
        if (typeof item?.is_read === 'boolean') return !item.is_read;
        return !n?.read;
    }).length;
    const hasItems = allNotifications.length > 0;

    // ─── Render list ──────────────────────────────────────────────────────────
    const renderList = () => (
        <div className="overflow-y-auto max-h-[420px] custom-scrollbar">
            {!hasItems ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
                    <div className="w-16 h-16 rounded-3xl bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center mb-1">
                        <Sparkles size={28} className="text-neutral-400" />
                    </div>
                    <p className="text-sm font-bold text-neutral-400">Tudo em dia!</p>
                    <p className="text-xs text-neutral-400 text-center">Nenhuma notificação por enquanto.</p>
                </div>
            ) : (
                <div className="p-3 flex flex-col gap-2">
                    {allNotifications.map(item => {
                        const cfg = getTypeConfig(item.type);
                        // Card sem destino não pode usar o vocabulário de card
                        // interativo: `hover:scale` e `hover:shadow` prometem um
                        // toque que não acontece. Promessa quebrada é pior que
                        // ausência de affordance — o usuário toca, nada muda, e
                        // ele conclui que o app travou.
                        const clicavel = temDestino(item);
                        return (
                            <div
                                key={String(item.id ?? "")}
                                className={`group relative rounded-2xl border bg-gradient-to-br ${cfg.bg} ${cfg.border} p-3.5 transition-all duration-200${clicavel ? ' hover:scale-[1.01] hover:shadow-lg' : ''}`}
                            >
                                {/* Unread dot */}
                                {!item.read && (
                                    <div className="absolute top-3 right-3">
                                        <NotifDot color={cfg.dot} />
                                    </div>
                                )}

                                <ConteudoDoCard clicavel={clicavel} onOpen={() => abrirDestino(item)} titulo={String(item.title ?? '')}>
                                    <IconBubble bg={cfg.bg} border={cfg.border}>
                                        {cfg.icon}
                                    </IconBubble>

                                    <div className="flex-1 min-w-0 pr-14">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="text-sm font-black text-white leading-tight truncate">{item.title}</p>
                                            {!item.read && (
                                                <span className={`flex-shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${cfg.border} text-white/70`}>
                                                    {cfg.label}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-neutral-400 leading-snug line-clamp-2">{String(item.message ?? "")}</p>
                                        <p className="text-[10px] text-neutral-400 font-medium mt-1.5">{item.timeAgo}</p>
                                    </div>
                                </ConteudoDoCard>

                                {/* Invite actions */}
                                {item.type === 'invite' && item.data && (
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            onClick={() => handleAccept(item)}
                                            className="flex-1 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-xs t-action py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-900/30"
                                        >
                                            <Check size={12} /> Aceitar
                                        </button>
                                        <button
                                            onClick={() => handleReject(item)}
                                            className="flex-1 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 text-xs t-action py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all border border-neutral-700"
                                        >
                                            <X size={12} /> Recusar
                                        </button>
                                    </div>
                                )}

                                {/* Delete button */}
                                {item.type !== 'invite' && (
                                    <button
                                        onClick={(e) => handleDelete(String(item.id ?? ""), e)}
                                        className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center opacity-60 group-hover:opacity-100 text-neutral-400 hover:text-red-400 transition-all rounded-lg hover:bg-red-500/10"
                                        aria-label="Remover notificação"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // ─── Embedded mode ────────────────────────────────────────────────────────
    if (embedded) {
        return (
            <div className="w-full">
                {systemNotifications.length > 0 && (
                    <div className="flex justify-end mb-2 px-1">
                        <button onClick={handleClearAll} disabled={clearing} className="tap-44 text-[10px] text-neutral-400 hover:text-red-400 uppercase font-bold tracking-widest transition-colors flex items-center gap-1 disabled:opacity-60">
                            <Trash2 size={10} /> Limpar tudo
                        </button>
                    </div>
                )}
                {renderList()}
            </div>
        );
    }

    // ─── Standalone / dropdown mode ───────────────────────────────────────────
    return (
        <div className="relative z-50">
            {/* Bell trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative tap-44 w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 ${isOpen
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 shadow-lg shadow-yellow-900/20'
                    : 'bg-neutral-800/80 text-neutral-400 border border-neutral-700/50 hover:text-white hover:bg-neutral-700/80'
                    }`}
            >
                <Bell size={18} className={isOpen ? 'fill-yellow-400' : ''} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center text-[10px] font-black text-white border-2 border-black shadow-lg shadow-red-900/50 animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" {...backdropProps(() => setIsOpen(false), 'Fechar notificações')} />

                    {/* Panel */}
                    <div ref={panelRef} {...dialogProps('Notificações')} className="absolute right-0 top-13 w-[340px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Glass panel */}
                        <div className="rounded-3xl overflow-hidden" style={{ background: 'rgba(10,10,10,0.99)', border: '1px solid rgba(234,179,8,0.2)', boxShadow: '0 0 40px rgba(234,179,8,0.08), 0 30px 80px rgba(0,0,0,0.65)', backdropFilter: 'blur(24px)' }}>

                            {/* Header */}
                            <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 flex items-center justify-center">
                                        <Bell size={14} className="text-yellow-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-white leading-none">Notificações</h3>
                                        {unreadCount > 0 && (
                                            <p className="text-[10px] text-yellow-500 font-bold mt-0.5">{unreadCount} não lida{unreadCount > 1 ? 's' : ''}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {hasItems && (
                                        <button
                                            onClick={handleClearAll}
                                            disabled={clearing}
                                            className="tap-44 flex items-center gap-1 text-[10px] text-neutral-400 hover:text-red-400 font-bold uppercase tracking-wider transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 disabled:opacity-60"
                                        >
                                            <Trash2 size={10} /> Limpar
                                        </button>
                                    )}
                                    <button aria-label="Fechar"
                                        onClick={() => setIsOpen(false)}
                                        className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-all active:scale-90"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            </div>

                            {/* List */}
                            {renderList()}

                            {/* Footer */}
                            {hasItems && (
                                <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
                                    <span className="text-[10px] text-neutral-400 font-medium">{allNotifications.length} notificaç{allNotifications.length > 1 ? 'ões' : 'ão'}</span>
                                    <div className="flex gap-1">
                                        {['default', 'invite', 'pr', 'workout_finished'].map((t) => (
                                            <div key={t} className={`w-1.5 h-1.5 rounded-full ${getTypeConfig(t).dot} opacity-40`} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationCenter;
