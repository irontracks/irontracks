'use client'

import React, { memo, useCallback, useMemo, useState } from 'react'
import { CheckCircle2, ChevronRight, Dumbbell, Loader2, Moon, Play, X } from 'lucide-react'
import type { DashboardWorkout } from '@/types/dashboard'
import { isWorkoutToday, pickQuickStartWorkoutIndex } from '@/utils/workout/workoutDay'
import { estimateWorkoutMinutes } from '@/utils/workout/estimateDuration'
import { triggerHaptic } from '@/utils/native/irontracksNative'
import { setRestDayIntent } from '@/lib/nutrition/restDayIntent'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { useDayChangeTick } from '@/hooks/useDayChangeTick'

type QuickStartCardProps = {
    workouts: DashboardWorkout[]
    onStartSession: (w: DashboardWorkout) => void | boolean | Promise<void | boolean>
    /** Com treino em andamento o card some — quem já está treinando não precisa começar. */
    hasActiveSession?: boolean
    /** Toque no corpo do card: abre a visualização rápida (a lista de exercícios). */
    onQuickView?: (w: DashboardWorkout) => void
    /** Já concluiu uma sessão hoje? O atalho some — a tela fica limpa depois do treino. */
    trainedToday?: boolean
    /** Respondeu "vou descansar" hoje. O convite para treinar some — ele já decidiu. */
    restingToday?: boolean
    /** Necessário para DESFAZER o descanso — ver o bloco `restingToday`. */
    userId?: string
}

/**
 * "Treinar agora" — um toque, no topo.
 *
 * O caminho até levantar peso tinha cinco passos: abrir, rolar até a lista,
 * tocar Iniciar, confirmar num modal, preencher o check-in. Strong e Hevy
 * fazem em um. O modal já caiu (sprint 1) e os painéis de dados desceram
 * (sprint 2); este card fecha a conta: a ação primária do app passa a ser a
 * primeira coisa visível, com o treino certo já escolhido.
 *
 * A escolha do treino é de `pickQuickStartWorkoutIndex`: o de HOJE pelo dia no
 * título e, para quem NÃO agenda por dia, o primeiro da ordem. Quem agenda
 * ("SEG · Upper B") não vê nada no dia sem treino — o card voltava a acender no
 * sábado oferecendo o treino de segunda.
 *
 * O card tem DUAS ações e elas são botões IRMÃOS, nunca aninhados: o corpo abre
 * a visualização rápida (ver o que vem pela frente antes de começar) e a barra
 * dourada inicia. Botão dentro de botão é HTML inválido e o toque no interno
 * dispararia os dois.
 *
 * Depois da sessão concluída o card some (`trainedToday`): o convite para
 * começar de novo é ruído para quem acabou de terminar, e a lista de treinos
 * continua logo abaixo para quem treina duas vezes no mesmo dia.
 */
/**
 * Corpo do card: botão quando há para onde ir, div quando não há. Vive fora do
 * card só para o JSX do conteúdo não ser escrito duas vezes — duplicado, um
 * ramo receberia ajuste de layout e o outro não.
 */
function Corpo({ onClick, ariaLabel, children }: { onClick?: () => void; ariaLabel?: string; children: React.ReactNode }) {
    if (!onClick) return <div className="block w-full text-left">{children}</div>
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            className="block w-full text-left rounded-lg active:opacity-80 transition-opacity"
        >
            {children}
        </button>
    )
}

/**
 * Chave da dispensa do card "Treino concluído hoje". Guarda o DIA (BRT), não um
 * booleano: assim a dispensa vale só para hoje e o card volta amanhã sozinho,
 * sem precisar de limpeza agendada.
 */
const CHAVE_DISPENSA = 'it.trainedCard.dismissed'

function QuickStartCardInner({ workouts, onStartSession, hasActiveSession, onQuickView, trainedToday, restingToday, userId }: QuickStartCardProps) {
    // Vira a meia-noite ⇒ o treino de hoje muda. Sem isto, o app aberto desde
    // ontem seguiria mostrando (ou escondendo) o card pela resposta de ontem.
    const viradaDoDia = useDayChangeTick()
    const [iniciando, setIniciando] = useState(false)
    const [concluidoDispensado, setConcluidoDispensado] = useState(() => {
        // No servidor não há storage — e este ramo só é alcançado depois que
        // `trainedToday` resolve no cliente, então não há HTML do servidor com
        // este card para divergir na hidratação.
        if (typeof window === 'undefined') return false
        try {
            return window.localStorage.getItem(CHAVE_DISPENSA) === brtDateKey()
        } catch {
            return false
        }
    })

    const dispensarConcluido = useCallback(() => {
        triggerHaptic('light').catch(() => { })
        setConcluidoDispensado(true)
        try {
            window.localStorage.setItem(CHAVE_DISPENSA, brtDateKey())
        } catch {
            // Storage bloqueado: some nesta sessão e volta no próximo boot.
            // Perder a dispensa é melhor que não deixar dispensar.
        }
    }, [])

    const alvo = useMemo(() => {
        const lista = (Array.isArray(workouts) ? workouts : []).filter((w) => !w?.archived_at)
        if (!lista.length) return null
        const idx = pickQuickStartWorkoutIndex(lista.map((w) => w?.title))
        return idx >= 0 ? lista[idx] : null
        // `viradaDoDia` não é lido aqui de propósito: ele existe só para
        // reavaliar a escolha quando o dia muda com o app aberto.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workouts, viradaDoDia])

    const iniciar = useCallback(async () => {
        if (!alvo || iniciando) return
        setIniciando(true)
        triggerHaptic('medium').catch(() => { })
        try {
            await onStartSession(alvo)
        } finally {
            // Se a navegação falhar, o botão volta — travado seria pior que repetido.
            setTimeout(() => setIniciando(false), 1200)
        }
    }, [alvo, iniciando, onStartSession])

    const abrirDetalhe = useCallback(() => {
        if (!alvo || !onQuickView) return
        triggerHaptic('light').catch(() => { })
        onQuickView(alvo)
    }, [alvo, onQuickView])

    // Com treino em andamento o topo cala: a resposta está acontecendo na tela.
    if (hasActiveSession) return null

    // ── Plano B: já treinou hoje ──────────────────────────────────────────────
    // Antes isto era `return null` junto com os outros casos, e o espaço nobre
    // ficava órfão — quem ocupava era o estado VAZIO da barra de stories, por
    // gravidade. Ou seja: a aba TREINOS abria convidando a publicar foto.
    // O card abaixo mantém o topo falando de treino e, de quebra, responde a
    // pergunta que o sumiço do botão cria ("cadê o iniciar?").
    if (trainedToday) {
        if (!alvo || concluidoDispensado) return null
        return (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-emerald-300">Treino concluído hoje</p>
                    <p className="text-[11px] leading-snug text-neutral-400">
                        Sua sessão já está no histórico.
                    </p>
                </div>
                {/* Dispensar. Este card informa uma vez e, dali até a virada do
                    dia, é só ocupação do espaço mais nobre da tela. Some até
                    amanhã — não para sempre: a informação continua verdadeira
                    todo dia em que houver treino, e sumir de vez faria o topo
                    voltar a ficar órfão. */}
                <button
                    type="button"
                    onClick={dispensarConcluido}
                    aria-label="Dispensar aviso de treino concluído"
                    // 44pt de alvo (h-11 w-11) com margem negativa para não
                    // inflar o card — seria incoerente sair de uma auditoria de
                    // acessibilidade criando um alvo de 36. `neutral-400` pelo
                    // mesmo motivo: 500 passa o mínimo de ícone (3:1), mas é a
                    // faixa que acabamos de tirar dos textos.
                    className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-transform hover:text-neutral-200 active:scale-90"
                >
                    <X size={16} />
                </button>
            </div>
        )
    }

    // ── Ele já disse que hoje não ──────────────────────────────────────────────
    // "Vou descansar" é uma decisão, não um silêncio: manter TREINAR AGORA aceso
    // logo acima da pergunta que acabou de sumir é o app discordando do usuário.
    // Fica uma linha discreta — sem dourado, que é a cor de quem convida à ação —
    // só para o espaço nobre não ficar órfão e a resposta ter recibo. Volta
    // sozinha amanhã: a intenção é gravada por dia.
    if (restingToday) {
        return (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3">
                <Moon className="h-5 w-5 shrink-0 text-sky-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-sky-300">Dia de descanso</p>
                    <p className="text-[11px] leading-snug text-neutral-400">
                        Sua meta de calorias de hoje já está ajustada.
                    </p>
                </div>
                {/* SAÍDA. Sem ela, um toque errado em "Vou descansar" prendia a
                    pessoa até a virada do dia: sem o atalho de treinar e com a
                    meta de calorias rebaixada (medido: −442 kcal). A capacidade
                    já existia — `setRestDayIntent` faz upsert e dispara o evento
                    que este card escuta, então a tela se corrige sozinha.
                    Discreto de propósito: desfazer é exceção, não convite. */}
                {userId ? (
                    <button
                        type="button"
                        onClick={() => { void setRestDayIntent(String(userId), true) }}
                        className="tap-44 shrink-0 rounded-xl border border-sky-500/30 px-3 py-1.5 text-[11px] font-bold text-sky-200 transition active:scale-95 hover:bg-sky-500/10"
                    >
                        Mudei de ideia
                    </button>
                ) : null}
            </div>
        )
    }

    // Sem treino para hoje o topo cala e a lista sobe. Quem agenda por dia tem
    // dia de folga, e folga não é lugar de CTA.
    if (!alvo) return null

    const titulo = String(alvo?.title || 'Treino').trim()
    const ehHoje = isWorkoutToday(titulo)
    // Periodizado sem hidratar tem só a CONTAGEM de exercícios — daí o fallback.
    const listaEx = Array.isArray(alvo?.exercises) ? alvo.exercises : []
    const minutos = estimateWorkoutMinutes(listaEx)
    const exercicios = listaEx.length || Number(alvo?.exercises_count) || 0

    return (
        <div
            className="mb-3 rounded-2xl p-[1px]"
            style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.35) 0%, rgba(234,179,8,0.06) 60%, rgba(234,179,8,0.22) 100%)' }}
        >
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, rgba(18,18,18,0.99) 0%, rgba(10,10,10,0.99) 100%)' }}>
                {/* Corpo clicável: ver o treino antes de começar. Sem `onQuickView`
                    fica uma div — um botão que não faz nada é pior que texto. */}
                <Corpo
                    onClick={onQuickView ? abrirDetalhe : undefined}
                    ariaLabel={onQuickView ? `Ver treino ${titulo}` : undefined}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <Dumbbell className="h-4 w-4 text-yellow-500" aria-hidden="true" />
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-600">
                            {ehHoje ? 'Treino de hoje' : 'Próximo treino'}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 text-white font-black text-lg leading-tight truncate">{titulo}</div>
                        {onQuickView ? (
                            <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
                        ) : null}
                    </div>

                    {/* Meta discreta: ajuda a decidir sem competir com o título. */}
                    <div className="mt-0.5 text-xs text-neutral-400">
                        {exercicios > 0 ? `${exercicios} exercício${exercicios === 1 ? '' : 's'}` : null}
                        {exercicios > 0 && minutos > 0 ? ' · ' : null}
                        {minutos > 0 ? `~${minutos} min` : null}
                    </div>
                </Corpo>

                <button
                    type="button"
                    onClick={iniciar}
                    disabled={iniciando}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 py-3.5 text-black font-black text-sm uppercase tracking-wider active:scale-[0.98] transition-transform hover:bg-yellow-400 disabled:opacity-70"
                >
                    {iniciando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-black" />}
                    {iniciando ? 'Abrindo…' : 'Treinar agora'}
                </button>
            </div>
        </div>
    )
}

export const QuickStartCard = memo(QuickStartCardInner)
