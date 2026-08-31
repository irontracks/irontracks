'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import NutritionMixer from './NutritionMixer'
import { SkeletonList } from '@/components/ui/Skeleton'
import { estimateSessionKcal } from '@/utils/calories/sessionKcal'
import { selecionarSessoesDoDia, somarKcalDasSessoes } from '@/lib/nutrition/kcalDeTreinoDoDia'
import { sessionKcalInputs } from '@/utils/calories/sessionKcalInputs'
import { getNutritionOverlayCache, setNutritionOverlayCache } from '@/lib/offline/nutritionCache'
import { computeRestDayAdjustment } from '@/lib/nutrition/restDay'
import { DEFAULT_GOALS, resolveDisplayGoals } from '@/lib/nutrition/displayGoals'
import { buildUserSnapshot } from '@/lib/user/snapshot'
import type { NutritionPhase } from '@/lib/nutrition/phase'
import type { UserStats } from '@/lib/nutrition/goals'

type Totals = { calories: number; protein: number; carbs: number; fat: number }

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Perfil e meta vêm do LEITOR ÚNICO (@/lib/user/snapshot); o piso de exibição e o
// rótulo da origem, de @/lib/nutrition/displayGoals. Este arquivo já teve TRÊS vezes
// a sua própria cópia divergente: o cálculo de metas (Harris-Benedict + proteína por
// %, contra o Mifflin-St Jeor do resto do app), depois os mapeamentos de
// objetivo/sexo/atividade, depois a fiação "meta salva > TDEE". Não recriar nada
// disso aqui — inclusive a constante DEFAULT_GOALS, que é da política de exibição.

interface NutritionOverlayProps {
  onClose: () => void
  canViewMacros?: boolean
  /** Entrou pelo item "Histórico de refeições" do menu: já abre nele. */
  openHistoryOnMount?: boolean
  /** Avisa que o pedido de abrir o histórico já foi atendido. */
  onHistoryOpened?: () => void
}

export default function NutritionOverlay({ onClose: _onClose, canViewMacros, openHistoryOnMount, onHistoryOpened }: NutritionOverlayProps) {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<{
    dateKey: string
    totals: Totals
    goals: Totals
    goalsSource: 'saved' | 'profile' | 'default'
    workoutCalories: number
    restDayReduction: number
    /**
     * Perfil para o seletor de fase recalcular a meta.
     * null = perfil incompleto (sabemos) · undefined = não carregamos (cache offline).
     * A distinção evita o Mixer sugerir "complete o perfil" para quem já completou.
     */
    profileStats: UserStats | null | undefined
    currentPhase: NutritionPhase
    phaseIsExplicit: boolean
  } | null>(null)

  const dateKey = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
    } catch {
      return new Date().toISOString().slice(0, 10)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    // uid offline-safe: getUser() valida no servidor (falha sem rede); cai pra
    // getSession() que lê a sessão local. Pro cache offline precisamos do id.
    const getUid = async (): Promise<string> => {
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user?.id) return String(data.user.id)
      } catch { /* offline → tenta a sessão local */ }
      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session?.user?.id) return String(data.session.user.id)
      } catch { /* sem sessão legível */ }
      return ''
    }

    const serveFromCache = async (uid: string): Promise<boolean> => {
      const c = await getNutritionOverlayCache(uid, dateKey)
      if (c && !cancelled) {
        setData({
          dateKey,
          totals: c.totals,
          goals: c.goals,
          goalsSource: (c.goalsSource as 'saved' | 'profile' | 'default') || 'default',
          workoutCalories: safeNumber(c.workoutCalories),
          restDayReduction: 0,
          // O cache não guarda o perfil — sem ele o seletor de fase fica oculto neste
          // caminho degradado (offline). Trocar de fase exige rede de qualquer forma.
          // `undefined` (não `null`) para o Mixer não acusar perfil incompleto.
          profileStats: undefined,
          currentPhase: 'MAINTAIN',
          phaseIsExplicit: false,
        })
        return true
      }
      return false
    }

    const load = async () => {
      const uid = await getUid()
      if (!uid || cancelled) return

      // Offline: serve do cache na hora, sem travar nas leituras de rede.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (await serveFromCache(uid)) return
      }

      try {
        // O snapshot entra COMO UMA DAS PROMESSAS: ele substitui as leituras de
        // `nutrition_goals` e `user_settings` sem serializar nada — internamente as
        // duas também saem juntas. Trocá-lo por um await antes deste bloco custaria
        // um round-trip a mais nesta tela.
        const [totalsRes, snapshot, sessionsRes, intentRes, recentRes] = await Promise.all([
          supabase.from('daily_nutrition_logs').select('calories,protein,carbs,fat').eq('user_id', uid).eq('date', dateKey).maybeSingle(),
          buildUserSnapshot(supabase, uid, ['profile', 'nutrition']),
          selecionarSessoesDoDia(supabase, uid, dateKey),
          supabase.from('rest_day_intents').select('will_train').eq('user_id', uid).eq('date_key', dateKey).maybeSingle(),
          supabase.from('workouts').select('notes').eq('user_id', uid).eq('is_template', false).order('date', { ascending: false }).limit(30),
        ])

        if (cancelled) return

        const totals: Totals = {
          calories: safeNumber(totalsRes.data?.calories),
          protein: safeNumber(totalsRes.data?.protein),
          carbs: safeNumber(totalsRes.data?.carbs),
          fat: safeNumber(totalsRes.data?.fat),
        }

        const display = resolveDisplayGoals(snapshot.nutrition)
        let goals: Totals = display.goals
        const goalsSource = display.source

        // Calorias de treino de hoje pela fonte única (`kcalDeTreinoDoDia`),
        // que a página `/dashboard/nutrition` também consome — modelo MET sobre
        // o JSON da sessão, com os ingredientes do leitor único. O RPE do
        // pós-treino está DENTRO desse JSON, então esta tela chega ao mesmo
        // número do relatório sem ir ao banco atrás do check-in (era a
        // divergência de 744 × 698 kcal).
        const kcalProfile = snapshot.profile ?? null
        const workoutCalories = somarKcalDasSessoes(sessionsRes.data, kcalProfile)

        // Modo dia de descanso: se respondeu "vou descansar" hoje e não treinou,
        // desconta ~1 treino da meta (proteína intacta). Rede de segurança: se
        // treinou hoje (sessão concluída), segue a meta cheia.
        let restDayReduction = 0
        try {
          const restEnabled = snapshot.nutrition?.restDayAdjustEnabled !== false
          const willTrain = (intentRes.data as { will_train?: boolean } | null)?.will_train
          const trainedToday = Array.isArray(sessionsRes.data) && sessionsRes.data.length > 0
          if (restEnabled && intentRes.data && willTrain === false && !trainedToday) {
            const kcals: number[] = []
            for (const w of Array.isArray(recentRes.data) ? recentRes.data : []) {
              if (kcals.length >= 10) break
              let session: unknown = (w as { notes?: unknown }).notes
              if (typeof session === 'string') { try { session = JSON.parse(session) } catch { session = null } }
              if (!session || typeof session !== 'object') continue
              const k = estimateSessionKcal(session, sessionKcalInputs(session, kcalProfile))
              if (k > 0) kcals.push(k)
            }
            const avgWorkoutKcal = kcals.length ? kcals.reduce((a, b) => a + b, 0) / kcals.length : 0
            const adjusted = computeRestDayAdjustment(goals, avgWorkoutKcal)
            if (adjusted.reduction > 0) {
              goals = { calories: adjusted.calories, protein: adjusted.protein, carbs: adjusted.carbs, fat: adjusted.fat }
              restDayReduction = adjusted.reduction
            }
          }
        } catch { /* sem ajuste */ }

        if (!cancelled) {
          setData({
            dateKey,
            totals,
            goals,
            goalsSource,
            workoutCalories,
            restDayReduction,
            profileStats: snapshot.profile?.stats ?? null,
            currentPhase: snapshot.profile?.nutritionPhase ?? 'MAINTAIN',
            phaseIsExplicit: snapshot.profile?.nutritionPhaseExplicit != null,
          })
          void setNutritionOverlayCache(uid, dateKey, { totals, goals, goalsSource, workoutCalories })
        }
      } catch {
        // Falha (rede/transitória): tenta o cache antes de cair pro estado vazio.
        if (await serveFromCache(uid)) return
        if (!cancelled) setData({ dateKey, totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, goals: DEFAULT_GOALS, goalsSource: 'default', workoutCalories: 0, restDayReduction: 0, profileStats: undefined, currentPhase: 'MAINTAIN', phaseIsExplicit: false })
      }
    }

    load()
    return () => { cancelled = true }
  }, [supabase, dateKey])

  return (
    <div
      // `bg-depth-2` (#151514), o MESMO chão do shell do dashboard. A Nutrição
      // não vive dentro do shell — ela é um overlay `fixed` por cima dele —, e
      // por isso era a única das cinco abas com fundo preto: trocar de aba
      // acendia e apagava a tela. Salto medido antes: 1,083, o mesmo que o #802
      // encurtou entre o shell e as telas cheias e que passou despercebido aqui.
      className="fixed inset-x-0 bottom-0 z-[25] bg-depth-2 overflow-y-auto overscroll-none"
      style={{ top: 'calc(4rem + env(safe-area-inset-top) + 64px)' }}
    >
      {/* `pt-7` (28px), não `pt-4`. O overlay começa EXATAMENTE onde a barra de
          abas termina (`top: … + 64px`), e a barra projeta `shadow-2xl
          shadow-black/60` por cima do conteúdo: os 16px anteriores viravam ~5pt
          de ar visível, e o navegador de data parecia grudado no menu.
          Reportado pelo dono olhando o app. */}
      <div className="mx-auto w-full max-w-md px-4 pb-28 pt-7">
        {data ? (
          <NutritionMixer
            dateKey={data.dateKey}
            initialTotals={data.totals}
            goals={data.goals}
            canViewMacros={canViewMacros}
            workoutCaloriesToday={data.workoutCalories}
            goalsSource={data.goalsSource}
            restDayReduction={data.restDayReduction}
            profileStats={data.profileStats}
            currentPhase={data.currentPhase}
            phaseIsExplicit={data.phaseIsExplicit}
            openHistoryOnMount={openHistoryOnMount}
            onHistoryOpened={onHistoryOpened}
          />
        ) : (
          <div className="space-y-4">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-40 bg-neutral-800 rounded" />
              <div className="h-4 w-64 bg-neutral-800/60 rounded" />
            </div>
            <div className="grid grid-cols-3 gap-3 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-neutral-800/40 border border-neutral-800/50" />)}
            </div>
            <SkeletonList count={4} />
          </div>
        )}
      </div>
    </div>
  )
}
