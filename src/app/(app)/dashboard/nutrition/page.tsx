import Link from 'next/link'

import NutritionMixer from '@/components/dashboard/nutrition/NutritionMixer'
import NutritionConsoleShell from '@/components/dashboard/nutrition/NutritionConsoleShell'
import { createClient } from '@/utils/supabase/server'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { getErrorMessage } from '@/utils/errorMessage'
import { buildUserSnapshot } from '@/lib/user/snapshot'
import { DEFAULT_GOALS, resolveDisplayGoals } from '@/lib/nutrition/displayGoals'
import { computeRestDayAdjustment } from '@/lib/nutrition/restDay'
import { selecionarSessoesDoDia, somarKcalDasSessoes } from '@/lib/nutrition/kcalDeTreinoDoDia'
import { estimateSessionKcal } from '@/utils/calories/sessionKcal'
import { sessionKcalInputs } from '@/utils/calories/sessionKcalInputs'

export const dynamic = 'force-dynamic'

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isSchemaMissingError(e: unknown) {
  const message = getErrorMessage(e)
  const m = message.toLowerCase()
  return m.includes('could not find the table') || m.includes('schema cache')
}

export default async function NutritionPage() {
  const supabase = await createClient()
  let authUserId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    authUserId = data?.user?.id ?? null
  } catch {
    authUserId = null
  }

  if (!authUserId) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6 md:p-10 pt-safe">
        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-xl bg-neutral-800 p-6 border border-neutral-700">
            <h1 className="text-2xl font-black text-white">Acesso restrito</h1>
            <p className="text-neutral-400 mt-2">Faça login para acessar o Nutrition Mixer.</p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-yellow-500 px-4 py-3 font-black text-black hover:bg-yellow-400"
            >
              Voltar para o início
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const dateKey = (() => {
    try {
      const tz = 'America/Sao_Paulo'
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    } catch {
      return new Date().toISOString().slice(0, 10)
    }
  })()

  let initialTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  let schemaMissing = false
  try {
    const { data: row, error } = await supabase
      .from('daily_nutrition_logs')
      .select('calories,protein,carbs,fat')
      .eq('user_id', authUserId)
      .eq('date', dateKey)
      .maybeSingle()
    if (error) throw error
    initialTotals = {
      calories: safeNumber(row?.calories),
      protein: safeNumber(row?.protein),
      carbs: safeNumber(row?.carbs),
      fat: safeNumber(row?.fat),
    }
  } catch (e) {
    schemaMissing = schemaMissing || isSchemaMissingError(e)
    initialTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  }

  // Perfil e meta vêm resolvidos do leitor único (`lib/user/snapshot`), que já
  // aplica a ordem "meta salva > TDEE do perfil" — a MESMA sequência que estava
  // copiada aqui, no NutritionOverlay e no contexto de IA. A política de exibição
  // (o fallback DEFAULT_GOALS e o aviso de schema) continua sendo desta página.
  const snapshot = await buildUserSnapshot(supabase, authUserId, ['profile', 'nutrition'])
  schemaMissing = schemaMissing || isSchemaMissingError(snapshot.nutrition?.savedGoalsError)

  // Política de exibição (piso + rótulo da origem) compartilhada com o overlay.
  // `goals` é reatribuído adiante quando o modo dia de descanso reduz a meta.
  const display = resolveDisplayGoals(snapshot.nutrition)
  let goals = display.goals
  const goalsSource = display.source

  // Dados do perfil para o seletor de fase recalcular a meta no client sem
  // round-trip. Null quando o perfil está incompleto — aí o seletor se explica em
  // vez de mostrar números inventados.
  const profileStats = snapshot.profile?.stats ?? null
  const currentPhase = snapshot.profile?.nutritionPhase ?? 'MAINTAIN'

  // Calorias de treino de hoje — pela MESMA conta do overlay (modelo MET sobre
  // `workouts.notes`). Até 31/08/2026 esta página lia `workout_session_logs`,
  // que tem UMA linha em toda a produção (a última de 02/04/2026) e nenhum
  // escritor no código: o card "Treino hoje" simplesmente nunca aparecia aqui,
  // e o `catch {}` vazio garantia que ninguém percebesse.
  let workoutCaloriesToday = 0
  try {
    const { data: sessoesDeHoje } = await selecionarSessoesDoDia(supabase, authUserId, dateKey)
    workoutCaloriesToday = somarKcalDasSessoes(sessoesDeHoje, snapshot.profile ?? null)
  } catch { /* sem sessão hoje → o card não aparece, que é o certo */ }

  // ── Modo dia de descanso ──────────────────────────────────────────────────
  // Guiado pela RESPOSTA à pergunta matinal "vai treinar hoje?": se o usuário
  // respondeu "vou descansar", desconta o gasto médio de ~1 treino da meta
  // (proteína intacta; corte em carbo/gordura). Rede de segurança: se ele
  // REALMENTE treinou hoje, a meta volta ao normal — não faz sentido manter
  // déficit num dia treinado. Toggle: preferences.restDayAdjustEnabled (default on).
  let restDayReduction = 0
  try {
    const restEnabled = snapshot.nutrition?.restDayAdjustEnabled !== false
    if (restEnabled) {
      const { data: intent } = await supabase
        .from('rest_day_intents')
        .select('will_train')
        .eq('user_id', authUserId)
        .eq('date_key', dateKey)
        .maybeSingle()
      const willTrain = (intent as { will_train?: boolean } | null)?.will_train
      if (intent && willTrain === false) {
        // Os treinos ficam salvos em `workouts` (notes = JSON da sessão);
        // workout_session_logs não é populada em produção.
        const { data: recentWorkouts } = await supabase
          .from('workouts')
          .select('date, notes')
          .eq('user_id', authUserId)
          .eq('is_template', false)
          .order('date', { ascending: false })
          .limit(30)
        const rows = Array.isArray(recentWorkouts) ? recentWorkouts : []

        // Rede de segurança: treinou hoje (BRT)? Não reduz — segue meta cheia.
        const toBrtKey = (v: unknown) => {
          try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(String(v)))
          } catch { return '' }
        }
        const trainedToday = rows.some((w) => toBrtKey((w as { date?: string }).date) === dateKey)

        if (!trainedToday) {
          const kcalProfile = snapshot.profile ?? null
          const kcals: number[] = []
          for (const w of rows) {
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
      }
    }
  } catch { /* tabela ausente / sem dados — sem ajuste */ }

  // Check VIP Access for Macros
  let canViewMacros = false
  try {
    const access = await checkVipFeatureAccess(supabase, authUserId, 'nutrition_macros')
    canViewMacros = !!access.allowed
  } catch {
    canViewMacros = false
  }

  try {
    const { error } = await supabase.from('nutrition_meal_entries').select('id').limit(1)
    if (error) throw error
  } catch (e) {
    schemaMissing = schemaMissing || isSchemaMissingError(e)
  }

  return (
    <NutritionConsoleShell title="Nutrition Console" subtitle={`Hoje · ${dateKey}`}>
      <NutritionMixer dateKey={dateKey} initialTotals={initialTotals} goals={goals} schemaMissing={schemaMissing} canViewMacros={canViewMacros} workoutCaloriesToday={workoutCaloriesToday} goalsSource={goalsSource} restDayReduction={restDayReduction} profileStats={profileStats} currentPhase={currentPhase} phaseIsExplicit={snapshot.profile?.nutritionPhaseExplicit != null} />
    </NutritionConsoleShell>
  )
}
