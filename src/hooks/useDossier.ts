'use client'
import { useCallback, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { WorkoutSummary } from '@/components/historyListTypes'
import { buildPeriodStats } from '@/utils/report/periodStats'
import { aggregateEntriesByDay, summarizeHistory, type NutritionHistoryEntryRow } from '@/lib/nutrition/history'
import { montarDossier, periodoDoDossier, type DossierInput, type DossierTipo, type Registro } from '@/lib/dossier/buildDossier'
import { buildDossierHtml } from '@/utils/report/buildDossierHtml'
import { exportHtmlAsPdf } from '@/utils/report/exportHtmlAsPdf'
import { logError } from '@/lib/logger'

export interface UseDossierParams {
  userId: string | null | undefined
  displayName: string
  historyItems: WorkoutSummary[]
  hydrateSessions?: () => Promise<WorkoutSummary[]>
  alert: (msg: string) => Promise<unknown> | unknown
}

export type DossierState =
  | { status: 'idle' }
  | { status: 'loading'; tipo: DossierTipo }
  | { status: 'ready'; tipo: DossierTipo; input: DossierInput; html: string }
  | { status: 'error'; tipo: DossierTipo; error: string }

const ULTIMOS = 12

/**
 * Dossiê semanal/mensal: treino (mesma conta do relatório de período), dieta
 * (mesma conta do histórico de refeições), exame, avaliação física e por foto
 * — cada fonte "no período ou o último" (`montarDossier`). Leitura direta
 * pelas RLS (dono ou professor do aluno). Falha de UMA fonte não derruba o
 * dossiê: a seção sai como "sem registro" e o erro vai ao logger.
 */
export function useDossier({ userId, displayName, historyItems, hydrateSessions, alert }: UseDossierParams) {
  const [state, setState] = useState<DossierState>({ status: 'idle' })
  const [exporting, setExporting] = useState(false)

  const abrir = useCallback(async (tipo: DossierTipo) => {
    const uid = String(userId || '').trim()
    if (!uid) { await alert('Não foi possível identificar o usuário.'); return }
    setState({ status: 'loading', tipo })
    try {
      const periodo = periodoDoDossier(tipo)
      const supabase = createClient()
      const lista = hydrateSessions ? await hydrateSessions().catch(() => undefined) : undefined
      const treino = buildPeriodStats(Array.isArray(historyItems) ? historyItems : [], periodo.dias, lista)

      const safe = async <T,>(q: PromiseLike<{ data: T | null; error: unknown }>, tag: string): Promise<T | null> => {
        try {
          const { data, error } = await q
          if (error) { logError(`dossier:${tag}`, error); return null }
          return data
        } catch (e) { logError(`dossier:${tag}`, e); return null }
      }

      const [refeicoes, marcas, meta, exames, avaliacoes, fotos] = await Promise.all([
        safe<NutritionHistoryEntryRow[]>(supabase.from('nutrition_meal_entries').select('date, calories, protein, carbs, fat').eq('user_id', uid).gte('date', periodo.inicio).lte('date', periodo.fim), 'refeicoes'),
        safe<Array<{ date: string }>>(supabase.from('nutrition_day_flags').select('date').eq('user_id', uid).gte('date', periodo.inicio).lte('date', periodo.fim), 'marcas'),
        safe<{ calories: unknown } | null>(supabase.from('nutrition_goals').select('calories').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1).maybeSingle(), 'meta'),
        safe<Registro[]>(supabase.from('lab_exams').select('id, exam_date, lab_name, status, protocol, extracted_markers').eq('user_id', uid).eq('status', 'done').order('exam_date', { ascending: false }).limit(ULTIMOS), 'exames'),
        safe<Registro[]>(supabase.from('assessments').select('id, assessment_date, date, weight, height, bmi, body_fat_percentage, body_fat_percentage_skinfold, bia_body_fat_percentage, lean_mass, bia_lean_mass, fat_mass, bia_water_percentage, bia_visceral_fat, bia_metabolic_age, arm_circ, chest_circ, waist_circ, hip_circ, thigh_circ, calf_circ, observations').eq('user_id', uid).order('assessment_date', { ascending: false, nullsFirst: false }).limit(ULTIMOS), 'avaliacoes'),
        safe<Registro[]>(supabase.from('body_photo_assessments').select('id, assessment_date, status, composition_score, symmetry_score, posture_score, proportion_score, body_fat_estimate_low, body_fat_estimate_high, analysis').eq('user_id', uid).eq('status', 'done').order('assessment_date', { ascending: false }).limit(ULTIMOS), 'fotos'),
      ])

      const dias = aggregateEntriesByDay(refeicoes ?? [])
      const excluidos = new Set((marcas ?? []).map((m) => String(m.date)))
      const nutricao = dias.length ? summarizeHistory(dias, periodo.dias, excluidos) : null
      const metaKcal = Number(meta?.calories)
      const input = montarDossier({
        periodo,
        aluno: displayName,
        geradoEm: new Date().toISOString(),
        treino,
        nutricao,
        nutricaoDias: dias,
        metaKcal: Number.isFinite(metaKcal) && metaKcal > 0 ? metaKcal : null,
      }, { exames: exames ?? [], avaliacoes: avaliacoes ?? [], fotos: fotos ?? [] })
      setState({ status: 'ready', tipo, input, html: buildDossierHtml(input) })
    } catch (e) {
      logError('dossier:abrir', e)
      setState({ status: 'error', tipo, error: 'Não foi possível montar o dossiê. Tente de novo.' })
    }
  }, [userId, displayName, historyItems, hydrateSessions, alert])

  const fechar = useCallback(() => setState({ status: 'idle' }), [])

  const exportar = useCallback(async () => {
    if (state.status !== 'ready') return
    setExporting(true)
    try {
      const titulo = state.tipo === 'week' ? 'Dossiê semanal' : 'Dossiê mensal'
      await exportHtmlAsPdf({
        html: state.html,
        title: `${titulo} — IronTracks`,
        baseFileName: `IronTracks_Dossie_${state.tipo === 'week' ? 'semanal' : 'mensal'}_${state.input.periodo.fim}`,
        alert: (m: string) => { void alert(m) },
      })
    } finally { setExporting(false) }
  }, [state, alert])

  return { state, abrir, fechar, exportar, exporting }
}
