'use client'
/**
 * NutritionWorkoutCorrelation — os últimos 30 dias como grade de calendário.
 *
 * Auditoria de design, ago/2026. O que estava errado e por quê:
 *
 * 1. DOIS ESTADOS OPOSTOS NA MESMA COR. "treinou e não registrou comida"
 *    (`#f59e0b`) e "registrou comida e não treinou" (`#fbbf24`) eram dois
 *    âmbares separados por um degrau de brilho — indistinguíveis espalhados pela
 *    grade, e são fatos CONTRÁRIOS. É a mesma regressão que o `MacroBar` já
 *    tinha corrigido na mesma tela (proteína e carbo dividiam esses dois tons).
 *    Estado se distingue por MATIZ: verde = ambos, gold = só treino, azul = só
 *    nutrição — o azul é o mesmo já adotado para carboidrato nos macros.
 *
 * 2. O DETALHE DO DIA NÃO EXISTIA NO CELULAR. A informação por dia morava num
 *    `title=""` — tooltip de mouse. No app nativo, tocar num quadrado não fazia
 *    nada: 30 alvos mudos na plataforma principal. Cada dia virou `<button>` e o
 *    detalhe aparece numa linha fixa abaixo da grade (fixa de propósito: se ela
 *    aparecesse só ao tocar, a grade pularia a cada toque).
 *
 * 3. A GRADE NÃO DIZIA QUE DIA É HOJE, nem para que lado corre o tempo. Hoje tem
 *    anel gold e `aria-current`; o intervalo está escrito abaixo da grade.
 *
 * 4. VAZIO ≡ SEM REGISTRO. As células de preenchimento (dias fora da janela, só
 *    para alinhar a primeira e a última semana) e os dias sem registro tinham
 *    aparências quase iguais sobre um card já translúcido. Agora o preenchimento
 *    não desenha NADA e o "sem registro" tem trilho visível.
 *
 * 5. CONTRASTE. Rótulos dos dias em `text-white/20` compõem ~1,6:1 sobre o card
 *    — e são a chave de leitura da grade inteira. A legenda em `text-white/40`
 *    dava ~3:1. O mínimo do WCAG AA é 4,5:1; `neutral-400` entrega ~7:1.
 *
 * 6. "SINCRONIA 68%" não dizia sincronia de quê (a conta é: dos dias treinados,
 *    quantos tiveram comida registrada). Virou `17/25` com rótulo explícito —
 *    dois inteiros explicam sozinhos o que o percentual escondia.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Loader2, Zap } from 'lucide-react'
import type { CorrelationDay, CorrelationStats } from '@/lib/nutrition/correlationDays'
import { brtDateKey } from '@/utils/cron/dateBrt'

/**
 * Cores de ESTADO — distintas por matiz, não por brilho. Trocar qualquer uma por
 * um vizinho de tom recria o defeito que originou este componente.
 */
export const CORRELATION_COLORS = {
  both: '#22c55e',      // verde — treinou e registrou
  workout: '#eab308',   // gold da identidade — só treino
  nutrition: '#3b82f6', // azul — só nutrição (mesmo dos carboidratos)
} as const

/** Dia dentro da janela, sem nenhum registro: trilho visível, não buraco. */
const EMPTY_DAY_BG = 'rgba(255,255,255,0.08)'

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const getDayColor = (d: CorrelationDay): string => {
  if (d.had_workout && d.had_nutrition) return CORRELATION_COLORS.both
  if (d.had_workout) return CORRELATION_COLORS.workout
  if (d.had_nutrition) return CORRELATION_COLORS.nutrition
  return EMPTY_DAY_BG
}

const getDayState = (d: CorrelationDay): string => {
  if (d.had_workout && d.had_nutrition) return 'Treino e nutrição'
  if (d.had_workout) return 'Só treino'
  if (d.had_nutrition) return 'Só nutrição'
  return 'Sem registro'
}

/** '2026-08-10' → '10/08'. Não passa por `new Date`: é dia-calendário, não instante. */
const shortDate = (key: string): string => {
  const [, m, d] = key.split('-')
  return m && d ? `${d}/${m}` : key
}

const detailOf = (d: CorrelationDay): string => {
  const kcal = Math.round(d.nutrition_calories)
  const comida = d.had_nutrition && kcal > 0 ? ` · ${kcal} kcal` : ''
  return `${shortDate(d.date)} — ${getDayState(d)}${comida}`
}

export default function NutritionWorkoutCorrelation() {
  const [days, setDays] = useState<CorrelationDay[]>([])
  const [stats, setStats] = useState<CorrelationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selecionado, setSelecionado] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch('/api/nutrition/correlation')
      .then(r => r.json())
      .then(json => {
        if (cancelado || !json?.ok) return
        setDays(Array.isArray(json.days) ? json.days : [])
        setStats(json.stats ?? null)
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  // Semanas de 7, com preenchimento nas pontas só para alinhar as colunas com o
  // dia da semana. `date: ''` marca o preenchimento — ele não desenha nada.
  const weeks = useMemo(() => {
    const vazio = (): CorrelationDay =>
      ({ date: '', weekday: 0, had_workout: false, had_nutrition: false, nutrition_calories: 0 })
    const linhas: CorrelationDay[][] = []
    let atual: CorrelationDay[] = []
    if (days.length > 0) {
      for (let i = 0; i < days[0].weekday; i++) atual.push(vazio())
    }
    for (const d of days) {
      atual.push(d)
      if (atual.length === 7) { linhas.push(atual); atual = [] }
    }
    if (atual.length > 0) {
      while (atual.length < 7) atual.push(vazio())
      linhas.push(atual)
    }
    return linhas
  }, [days])

  const hoje = brtDateKey()
  const diaSelecionado = useMemo(
    () => days.find((d) => d.date === selecionado) ?? null,
    [days, selecionado],
  )

  if (loading) return (
    <div className="rounded-2xl p-4 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <Loader2 size={20} className="animate-spin text-yellow-500" />
    </div>
  )

  if (!stats) return null

  const primeiro = days[0]?.date ?? ''

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2">
        <TrendingUp size={14} className="text-yellow-500" aria-hidden="true" />
        <p className="text-sm font-black text-white">Treino × Nutrição — últimos 30 dias</p>
      </div>

      <div>
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {DAY_LABELS.map((l, i) => (
            <div key={i} className="text-[10px] font-bold text-neutral-400">{l}</div>
          ))}
        </div>

        <div className="space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((d, di) => {
                if (!d.date) return <div key={`${wi}-${di}`} className="aspect-square" aria-hidden="true" />
                const ehHoje = d.date === hoje
                const ativo = d.date === selecionado
                return (
                  <button
                    key={`${wi}-${di}`}
                    type="button"
                    onClick={() => setSelecionado((atual) => (atual === d.date ? null : d.date))}
                    aria-label={detailOf(d)}
                    aria-pressed={ativo}
                    aria-current={ehHoje ? 'date' : undefined}
                    className="aspect-square rounded-md transition-transform active:scale-90 touch-manipulation"
                    style={{
                      background: getDayColor(d),
                      // `box-shadow` em vez de `ring`: o anel precisa ficar por
                      // dentro da célula — o gap da grade é de 4px e um anel por
                      // fora encostaria no vizinho.
                      boxShadow: ehHoje
                        ? `inset 0 0 0 2px ${CORRELATION_COLORS.workout}, inset 0 0 0 4px rgba(0,0,0,0.65)`
                        : ativo
                          ? 'inset 0 0 0 2px rgba(255,255,255,0.85)'
                          : undefined,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Para que lado corre o tempo — a grade sozinha não diz. */}
        <p className="mt-2 text-[10px] text-neutral-500 tabular-nums">
          {primeiro ? `${shortDate(primeiro)} → hoje` : null}
        </p>
      </div>

      {/* Linha de detalhe: altura reservada mesmo vazia, senão a grade pula a
          cada toque. Sem seleção, ela ensina que os dias são tocáveis. */}
      <p className="min-h-[1.25rem] text-xs text-neutral-300 tabular-nums">
        {diaSelecionado
          ? detailOf(diaSelecionado)
          : <span className="text-neutral-500">Toque num dia para ver o registro.</span>}
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-neutral-400">
        {[
          ['Ambos', CORRELATION_COLORS.both],
          ['Só treino', CORRELATION_COLORS.workout],
          ['Só nutrição', CORRELATION_COLORS.nutrition],
          ['Sem registro', EMPTY_DAY_BG],
        ].map(([rotulo, cor]) => (
          <span key={rotulo} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: cor }} />
            {rotulo}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Dias de treino', value: String(stats.workoutDays) },
          { label: 'Dias com dieta', value: String(stats.nutritionDays) },
          // Dois inteiros no lugar do percentual: "68% de sincronia" não dizia
          // sincronia de quê. `17/25` diz — dos treinos, quantos tiveram comida.
          { label: 'Treinos com dieta', value: `${stats.bothDays}/${stats.workoutDays}` },
        ].map(s => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2.5 text-center"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <span className="text-lg font-black text-white tabular-nums">{s.value}</span>
            <span className="text-[10px] leading-tight text-neutral-400 font-bold">{s.label}</span>
          </div>
        ))}
      </div>

      {stats.workoutWithoutNutrition > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-400/90">
          {/* Ícone lucide, não emoji: o ⚡ renderizava com a fonte do sistema e
              destoava dos ícones do app — mesmo motivo da troca do ⚙ no botão
              METAS. */}
          <Zap size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Em {stats.workoutWithoutNutrition} {stats.workoutWithoutNutrition === 1 ? 'dia' : 'dias'} você
            treinou sem registrar a nutrição — registrar ajuda a otimizar os resultados.
          </span>
        </p>
      )}
    </div>
  )
}
