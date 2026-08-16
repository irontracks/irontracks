'use client'

/**
 * Histórico de nutrição — a lista dos dias com lançamento.
 *
 * Existia o caminho dia a dia (o `DateNavigator`, uma seta por vez) e não
 * existia a VISÃO: para achar o que comeu há três semanas, era preciso tocar
 * 21 vezes na seta. É o irmão do Histórico de treino.
 *
 * Toque numa linha abre aquele dia na própria aba de nutrição — a lista é um
 * atalho de navegação, não uma segunda tela de dados.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Clapperboard, UtensilsCrossed } from 'lucide-react'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/client'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackHandler } from '@/hooks/useBackHandler'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { MACRO_COLORS } from '@/lib/nutrition/macroColors'
import {
  aggregateEntriesByDay,
  periodLabel,
  periodRangeText,
  summarizeHistory,
  windowStartDate,
  type NutritionHistoryDay,
} from '@/lib/nutrition/history'
import { periodToContent } from '@/components/stories/nutritionStory'

const NutritionStoryComposer = dynamic(() => import('@/components/NutritionStoryComposer'), { ssr: false, loading: () => null })

const JANELAS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
] as const

/** "sex., 14 de ago." — só a PRIMEIRA letra sobe. */
function primeiraMaiuscula(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function rotuloData(date: string, hoje: string): string {
  if (date === hoje) return 'Hoje'
  const d = new Date(`${date}T12:00:00`)
  const h = new Date(`${hoje}T12:00:00`)
  if (Math.round((h.getTime() - d.getTime()) / 86_400_000) === 1) return 'Ontem'
  try {
    return primeiraMaiuscula(d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }))
  } catch {
    return date
  }
}

type Props = {
  open: boolean
  userId?: string
  /** Dia de hoje (YYYY-MM-DD, BRT) — o mesmo que a aba usa. */
  todayDate: string
  /** Meta ATUAL, para o story do período. O banco não guarda meta datada. */
  goals?: { calories?: number } | null
  onPickDate: (date: string) => void
  onClose: () => void
}

export default function NutritionHistoryModal({ open, userId, todayDate, goals, onPickDate, onClose }: Props) {
  const [janela, setJanela] = useState<number>(30)
  // Um estado só, CARIMBADO com a consulta que o produziu: trocar de janela
  // invalida o resultado no próprio render, sem um `setDias(null)` dentro do
  // efeito (que dispara renda em cascata e o ESLint reprova).
  const chave = `${String(userId || '')}|${todayDate}|${janela}`
  const [resultado, setResultado] = useState<{ chave: string; dias: NutritionHistoryDay[]; erro: boolean } | null>(null)
  const atual = resultado && resultado.chave === chave ? resultado : null
  const dias = atual?.dias ?? null
  const erro = atual?.erro ?? false
  const focusTrapRef = useFocusTrap(open, onClose)
  useBackHandler(open, onClose)

  useEffect(() => {
    const uid = String(userId || '').trim()
    if (!open || !uid) return
    let cancelado = false

    void (async () => {
      try {
        const supabase = createClient()
        // Sem `items`: o jsonb da refeição inteira não tem nada a fazer numa
        // lista que só desenha totais (ver o cabeçalho de lib/nutrition/history).
        const { data, error } = await supabase
          .from('nutrition_meal_entries')
          .select('date, calories, protein, carbs, fat')
          .eq('user_id', uid)
          .gte('date', windowStartDate(todayDate, janela))
          .lte('date', todayDate)
        if (cancelado) return
        // O supabase-js entrega a falha no RETORNO, não como exceção: sem este
        // ramo, erro de leitura viraria "nenhum dia registrado" — a lista diria
        // que ele nunca comeu.
        if (error) { setResultado({ chave, dias: [], erro: true }); return }
        setResultado({ chave, dias: aggregateEntriesByDay(data as never), erro: false })
      } catch {
        if (!cancelado) setResultado({ chave, dias: [], erro: true })
      }
    })()

    return () => { cancelado = true }
  }, [open, userId, todayDate, janela, chave])

  const resumo = useMemo(() => summarizeHistory(dias, janela), [dias, janela])

  const [storyAberto, setStoryAberto] = useState(false)
  const rotulo = periodLabel(janela)

  const abrirDia = useCallback((date: string) => {
    onPickDate(date)
    onClose()
  }, [onPickDate, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1600] flex items-end justify-center sm:items-center" {...dialogProps('Histórico de nutrição')}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" {...backdropProps(onClose)} />

      <div
        ref={focusTrapRef}
        className="relative z-10 flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-neutral-800 bg-neutral-900 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 p-4">
          <div className="min-w-0">
            <div className="t-meta text-[10px]">Nutrição</div>
            <div className="text-lg font-black text-white">Histórico</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Voltar"
            className="tap-44 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        <div className="flex gap-2 border-b border-neutral-800 px-4 py-3">
          {JANELAS.map((j) => (
            <button
              key={j.days}
              type="button"
              onClick={() => setJanela(j.days)}
              aria-pressed={janela === j.days}
              className={`tap-44 h-9 flex-1 rounded-xl px-3 text-xs t-action uppercase tracking-wider transition ${
                janela === j.days
                  ? 'border border-yellow-500/25 bg-yellow-500/10 text-yellow-400'
                  : 'border border-neutral-800/60 bg-neutral-950 text-neutral-300 hover:bg-neutral-800/80'
              }`}
            >
              {j.label}
            </button>
          ))}
        </div>

        {/* Resumo. A média é dos dias REGISTRADOS e a cobertura vem junto —
            sem ela, "1.900 kcal/dia" de quem lançou 8 dias em 30 lê como se
            fosse a média do mês. */}
        <div className="flex items-center gap-4 border-b border-neutral-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="t-meta text-[10px]">Média por dia registrado</div>
            <div className="text-2xl font-black tabular-nums text-white">
              {resumo.avgCalories}
              <span className="ml-1 text-xs font-bold text-neutral-400">kcal</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold tabular-nums" style={{ color: MACRO_COLORS.protein }}>
              {resumo.avgProtein} g
            </div>
            <div className="text-[11px] text-neutral-400">proteína</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {dias === null ? (
            <p className="px-1 py-6 text-center text-sm text-neutral-400">Carregando…</p>
          ) : erro ? (
            <p className="px-1 py-6 text-center text-sm text-neutral-400">
              Não consegui carregar o histórico agora. Tente de novo em instantes.
            </p>
          ) : dias.length === 0 ? (
            <div className="px-1 py-8 text-center">
              <UtensilsCrossed className="mx-auto mb-2 h-6 w-6 text-neutral-600" aria-hidden="true" />
              <p className="text-sm text-neutral-300">Nenhum dia registrado nesta janela.</p>
              <p className="mt-1 text-xs text-neutral-400">Lance uma refeição e ela aparece aqui.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {dias.map((d) => (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => abrirDia(d.date)}
                    // A linha inteira é UM controle: sem o rótulo, o leitor de
                    // tela anuncia seis fragmentos soltos (data, P, C, G,
                    // refeições, número) e nenhum deles diz o que o toque faz.
                    aria-label={`Abrir ${rotuloData(d.date, todayDate)} — ${Math.round(d.calories)} kcal, ${d.meals} refeição${d.meals === 1 ? '' : 'ões'}`}
                    className="flex w-full items-center gap-3 rounded-xl border border-neutral-800/60 bg-neutral-950 px-3 py-3 text-left transition active:scale-[0.99] hover:bg-neutral-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-neutral-100">
                        {rotuloData(d.date, todayDate)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-neutral-400">
                        <span style={{ color: MACRO_COLORS.protein }}>P {Math.round(d.protein)}g</span>
                        <span style={{ color: MACRO_COLORS.carbs }}>C {Math.round(d.carbs)}g</span>
                        <span style={{ color: MACRO_COLORS.fat }}>G {Math.round(d.fat)}g</span>
                        <span>· {d.meals} refeiç{d.meals === 1 ? 'ão' : 'ões'}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-black tabular-nums text-white">{Math.round(d.calories)}</div>
                      <div className="text-[11px] text-neutral-400">kcal</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-800 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-neutral-400">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {resumo.loggedDays} de {resumo.windowDays} dias com lançamento
            </span>
          </div>
          {/* Sem dia registrado não há o que postar — e um story de "0 kcal em
              média" seria uma afirmação falsa sobre a semana da pessoa. */}
          <button
            type="button"
            onClick={() => setStoryAberto(true)}
            disabled={resumo.loggedDays === 0}
            className="tap-44 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 text-xs t-action uppercase tracking-wider text-yellow-400 disabled:opacity-40"
          >
            <Clapperboard className="h-4 w-4" aria-hidden="true" />
            Compartilhar {rotulo.toLowerCase()}
          </button>
        </div>

        {storyAberto && (
          <NutritionStoryComposer
            open={storyAberto}
            mode="period"
            content={periodToContent(resumo, goals, {
              periodLabel: rotulo,
              rangeText: periodRangeText(todayDate, janela),
            })}
            onClose={() => setStoryAberto(false)}
          />
        )}
      </div>
    </div>
  )
}
