import type { SupabaseClient } from '@supabase/supabase-js'

import {
  computeGoalsFromPrefs,
  extractProfileStats,
  normalizeNutritionPhase,
  resolveNutritionPhase,
  type NutritionPhase,
  type NutritionTargets,
} from '@/lib/nutrition/phase'
import type { UserStats } from '@/lib/nutrition/goals'
import { getErrorMessage } from '@/utils/errorMessage'

/**
 * userSnapshot — o LEITOR único dos dados do usuário.
 *
 * Não é um depósito: não existe tabela `user_snapshot`, nada é sincronizado e nada
 * é gravado aqui. Ele lê as fontes que já existem (`user_settings.preferences`,
 * `nutrition_goals`) e devolve os fatos já resolvidos, tipados, uma vez por chamada.
 *
 * POR QUE existe: as mesmas chaves de perfil (`bodyWeightKg`, `heightCm`, `age`,
 * `biologicalSex`, `trainingFrequencyPerWeek`) eram extraídas em DOIS lugares
 * independentes — `extractProfileStats` (lib/nutrition/phase.ts) e `profileSection`
 * (utils/ai/userContext.ts). Duas leituras separadas das mesmas chaves é a receita
 * conhecida desta base para divergir em silêncio: quem renomeasse/adicionasse um
 * campo do perfil arrumaria um lado e deixaria o outro para trás, sem erro nenhum
 * (foi assim com `mapFitnessGoal` entre a página e o overlay de nutrição, e com a
 * família dos 14 renderers de série).
 *
 * REGRAS que mantêm isto barato — quebrá-las transforma o leitor no problema que
 * ele veio resolver:
 *  1. **Modular por setor.** Só o setor pedido é lido; ninguém paga query por dado
 *     que não usa (mesma disciplina do `buildUserContextBlock`).
 *  2. **Derivado, nunca persistido.** O que é derivado não fica velho.
 *  3. **Nada de `workouts.notes`.** A sessão inteira mora nessa coluna; um leitor
 *     "que traz tudo" repetiria em escala maior o engorda-payload que o
 *     `slimHistoryRow` teve de desfazer. Guard em `__tests__/userSnapshot.test.ts`.
 *  4. **Resiliente por setor, e sem engolir o sinal.** Uma leitura que falha degrada
 *     naquele setor — nunca derruba os vizinhos nem lança para o chamador — mas o
 *     motivo volta junto (ex.: `savedGoalsError`), porque quem exibe precisa poder
 *     avisar. Falha silenciosa em caminho crítico é bomba-relógio nesta base.
 */

export type SnapshotSector = 'profile' | 'nutrition'

/** Antropometria e intenção DECLARADAS no perfil (≠ avaliação física medida). */
export interface ProfileFacts {
  bodyWeightKg: number | null
  heightCm: number | null
  age: number | null
  /** `null` também quando o usuário marcou "não informado". */
  biologicalSex: 'male' | 'female' | null
  /** Objetivo de TREINO (enum de `preferences.fitnessGoal`). */
  fitnessGoal: string | null
  fitnessLevel: string | null
  trainingExperienceYears: number | null
  trainingFrequencyPerWeek: number | null
  /**
   * A fase da dieta ESCOLHIDA pelo usuário — `null` quando ele nunca escolheu.
   * Separada de `nutritionPhase` de propósito: quem quer dizer "o usuário pediu
   * cutting" precisa da escolha explícita, não do fallback pelo objetivo de treino.
   */
  nutritionPhaseExplicit: NutritionPhase | null
  /** A fase que VALE hoje (escolha explícita, com o objetivo de treino como fallback). */
  nutritionPhase: NutritionPhase
  /** Entradas do motor de TDEE. `null` quando falta peso/altura/idade/sexo. */
  stats: UserStats | null
}

export interface NutritionFacts {
  /** Meta do dia. `null` quando não há meta salva nem perfil completo para derivar. */
  targets: NutritionTargets | null
  /**
   * De onde veio a meta. `derived` = calculada do TDEE do perfil, que é exatamente
   * o número que o app EXIBE para quem nunca salvou meta — quem consome precisa
   * saber disso para não apresentar um valor calculado como escolha do usuário.
   */
  targetsSource: 'saved' | 'derived' | null
  /**
   * Mensagem do erro que impediu LER a meta salva (`null` quando a leitura foi bem).
   * O snapshot degrada para a meta derivada, mas não engole o sinal: a página de
   * nutrição distingue "tabela ausente do schema" (avisa na tela) de falha
   * transitória, e essa decisão é de quem exibe — não daqui.
   */
  savedGoalsError: string | null
  /**
   * Ajuste de dia de descanso ligado (`preferences.restDayAdjustEnabled`, default
   * ON). Mora no setor `nutrition` porque é uma escolha do usuário sobre COMO a
   * meta dele é calculada — não é uma feature flag de produto nem dado de perfil.
   */
  restDayAdjustEnabled: boolean
}

export interface UserSnapshot {
  profile: ProfileFacts | null
  nutrition: NutritionFacts | null
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const sex = (v: unknown): 'male' | 'female' | null =>
  v === 'male' || v === 'female' ? v : null

const str = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s ? s : null
}

/** Lê `user_settings.preferences` — onde mora o perfil que o usuário preenche no app. */
async function readPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.preferences && typeof data.preferences === 'object'
      ? (data.preferences as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function buildProfile(prefs: Record<string, unknown> | null): ProfileFacts | null {
  if (!prefs) return null
  return {
    bodyWeightKg: num(prefs.bodyWeightKg),
    heightCm: num(prefs.heightCm),
    age: num(prefs.age),
    biologicalSex: sex(prefs.biologicalSex),
    fitnessGoal: str(prefs.fitnessGoal),
    fitnessLevel: str(prefs.fitnessLevel),
    trainingExperienceYears: num(prefs.trainingExperienceYears),
    trainingFrequencyPerWeek: num(prefs.trainingFrequencyPerWeek),
    nutritionPhaseExplicit: normalizeNutritionPhase(prefs.nutritionPhase),
    nutritionPhase: resolveNutritionPhase(prefs),
    stats: extractProfileStats(prefs),
  }
}

type SavedGoalsRead = { row: Record<string, unknown> | null; error: string | null }

/** Lê a meta salva. Nunca lança: devolve a linha ou o motivo de não ter lido. */
async function readSavedGoals(supabase: SupabaseClient, userId: string): Promise<SavedGoalsRead> {
  try {
    const { data, error } = await supabase
      .from('nutrition_goals')
      .select('calories, protein, carbs, fat')
      // `order` + `limit(1)` antes do `maybeSingle`: com duas linhas para o mesmo
      // usuário o `maybeSingle` LANÇA (PGRST116) e a meta sumiria em silêncio.
      .order('updated_at', { ascending: false })
      .limit(1)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return { row: (data as Record<string, unknown> | null) ?? null, error: null }
  } catch (e) {
    return { row: null, error: getErrorMessage(e) }
  }
}

/**
 * Meta salva primeiro, TDEE do perfil como fallback — a MESMA ordem da página de
 * nutrição e do overlay. Essa sequência estava copiada em três lugares; é ela, não
 * a conta (que já era única em `computeGoalsFromPrefs`), que estava duplicada.
 *
 * Falha ao ler a meta salva NÃO zera o setor: cai no derivado (o mesmo que a página
 * já fazia) e devolve o erro em `savedGoalsError` para quem exibe decidir.
 */
function buildNutrition(
  saved: SavedGoalsRead,
  prefs: Record<string, unknown> | null,
): NutritionFacts {
  const calories = num(saved.row?.calories)
  if (saved.row && calories != null) {
    return {
      targets: {
        calories,
        protein: num(saved.row.protein) ?? 0,
        carbs: num(saved.row.carbs) ?? 0,
        fat: num(saved.row.fat) ?? 0,
      },
      targetsSource: 'saved',
      savedGoalsError: saved.error,
      restDayAdjustEnabled: prefs?.restDayAdjustEnabled !== false,
    }
  }

  const derived = computeGoalsFromPrefs(prefs)
  return {
    targets: derived,
    targetsSource: derived ? 'derived' : null,
    savedGoalsError: saved.error,
    restDayAdjustEnabled: prefs?.restDayAdjustEnabled !== false,
  }
}

/**
 * Monta o snapshot dos setores pedidos. `preferences` alimenta os dois setores e é
 * lido UMA vez por chamada — pedir `profile` + `nutrition` custa uma query a mais
 * que pedir só um deles, não duas.
 *
 * As duas leituras vão em PARALELO: a meta salva não depende do perfil (o perfil só
 * entra no fallback derivado). Em série, isto viraria dois round-trips encadeados
 * dentro de telas que hoje disparam tudo de uma vez — o leitor único não pode custar
 * latência a quem adotá-lo.
 */
export async function buildUserSnapshot(
  supabase: SupabaseClient,
  userId: string,
  sectors: SnapshotSector[],
): Promise<UserSnapshot> {
  const uid = String(userId || '').trim()
  const empty: UserSnapshot = { profile: null, nutrition: null }
  if (!uid || !sectors?.length) return empty

  const wantsProfile = sectors.includes('profile')
  const wantsNutrition = sectors.includes('nutrition')

  const [prefs, saved] = await Promise.all([
    readPreferences(supabase, uid),
    wantsNutrition ? readSavedGoals(supabase, uid) : Promise.resolve(null),
  ])

  return {
    profile: wantsProfile ? buildProfile(prefs) : null,
    nutrition: saved ? buildNutrition(saved, prefs) : null,
  }
}
