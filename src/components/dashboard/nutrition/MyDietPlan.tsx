'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { applyGeneratedMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import { getErrorMessage } from '@/utils/errorMessage'
import { useDialog } from '@/contexts/DialogContext'
import { planDays, weekdayLabel, type DietPlanRow, type PlanDay, type PlanItem, type PlanMeal } from '@/lib/nutrition/dietPlanShape'
import { refeicaoComEscolhas } from '@/lib/nutrition/escolhaDaProteina'
import { MACRO_SURFACES } from '@/lib/nutrition/macroColors'
import { CampoDeNotaDaRefeicao } from './CampoDeNotaDaRefeicao'
import HorariosDasRefeicoes from './HorariosDasRefeicoes'
import { planMealToLogItems } from '@/lib/nutrition/planMealItems'

/**
 * A dieta que o PRÓPRIO usuário salvou — o lugar onde ela vira algo pra seguir, e
 * não só um cardápio que apareceu uma vez.
 *
 * Difere do `PrescribedDietPlan` (plano do professor, read-only) em duas coisas:
 * aqui dá pra TROCAR alimento e pra REMOVER o plano. A separação de origem é feita
 * no servidor por `created_by`; este componente só lê a rota do plano próprio.
 *
 * Plano de dia e de semana usam o MESMO render: `planDays()` devolve sempre uma
 * lista de dias, e o plano de um dia é a lista de um elemento. Sem isso seriam duas
 * telas que divergem com o tempo.
 */

const SHORT_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function MyDietPlan({
  dateKey,
  canApply,
  onApplied,
}: {
  dateKey: string
  /** Só deixa lançar no dia atual (histórico/futuro só leem). */
  canApply?: boolean
  onApplied?: () => void
}) {
  const [row, setRow] = useState<DietPlanRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [dayIndex, setDayIndex] = useState(0)
  const [openMeal, setOpenMeal] = useState<number | null>(null)
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set())
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null)
  const [swappingKey, setSwappingKey] = useState<string | null>(null)
  /**
   * A segunda opção de proteína de cada item, vinda do servidor (mesma leitura de
   * candidatos do ↻, sem gravar nada). Chave `mealIdx-itemIdx` DENTRO do dia — o
   * mapa é recarregado a cada troca de dia, então o índice do dia não entra nela.
   */
  const [alternativas, setAlternativas] = useState<Record<string, PlanItem>>({})
  /** Quais dessas opções o usuário marcou para ESTE lançamento. Efêmero: o plano
   *  não muda, e a marca morre ao trocar de dia ou de data. */
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [rejected, setRejected] = useState<Record<string, string[]>>({})
  const [salvandoNota, setSalvandoNota] = useState<number | null>(null)
  /** Falha da gravação, presa à refeição que falhou — no topo da lista ela
   *  nasceria longe (ou fora) do campo que o usuário acabou de usar. */
  const [erroNota, setErroNota] = useState<{ idx: number; msg: string } | null>(null)
  const { confirm } = useDialog()
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [horariosAbertos, setHorariosAbertos] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/nutrition/diet-plan', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch((): null => null)
      return json?.ok ? ((json.plan ?? null) as DietPlanRow | null) : null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const plan = await load()
      if (!alive) return
      setRow(plan)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [load])

  const days = useMemo(() => planDays(row), [row])
  const isWeek = days.length > 1

  /*
   * Abre no dia de HOJE quando é plano de semana — é o que o usuário quer ver ao
   * abrir o app, não a segunda-feira toda vez. UMA VEZ por plano carregado.
   *
   * A dependência `days` muda de identidade a cada atualização de `row`, e trocar
   * um alimento atualiza `row`: sem a trava, o usuário ia para quarta, trocava o
   * pão — e a tela o chutava de volta para hoje, com a troca aplicada num dia que
   * ele não estava mais vendo. Posicionamento automático é para a ABERTURA; depois
   * dela, quem manda no dia é o usuário.
   */
  const positionedRef = useRef(false)
  useEffect(() => {
    if (!isWeek) {
      setDayIndex(0)
      positionedRef.current = false
      return
    }
    if (positionedRef.current) return
    const today = new Date().getDay()
    const idx = days.findIndex((d) => d.weekday === today)
    setDayIndex(idx >= 0 ? idx : 0)
    positionedRef.current = true
  }, [isWeek, days])

  // Data diferente = abertura nova: volta a valer o posicionamento automático.
  useEffect(() => {
    positionedRef.current = false
  }, [dateKey])

  // "Lançado" é por dia: sem zerar, o ✓ vaza pro dia seguinte (o componente não
  // remonta quando a data muda). Mesmo cuidado do card do plano prescrito.
  useEffect(() => {
    setAppliedIdx(new Set())
    setOpenMeal(null)
    // A escolha da proteína é do lançamento de UM dia. Sem zerar, marcar carne na
    // terça faria a quarta lançar carne sem a opção nem estar na tela.
    setEscolhidos(new Set())
  }, [dateKey, dayIndex])

  /*
   * Busca as opções do dia visível. Uma consulta por dia, não por item: o servidor
   * lê o repertório uma vez e responde o dia inteiro — item a item seriam seis
   * chamadas para abrir um card.
   *
   * `row` na dependência de propósito: trocar um alimento pelo ↻ muda o prato, e a
   * opção oferecida embaixo dele precisa mudar junto, senão o card sugere alternativa
   * para uma comida que não está mais ali.
   */
  useEffect(() => {
    if (!row) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/nutrition/diet-plan/alternatives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ dayIndex }),
        })
        const json = await res.json().catch((): null => null)
        if (!alive || !json?.ok) return
        const mapa: Record<string, PlanItem> = {}
        for (const a of Array.isArray(json.alternatives) ? json.alternatives : []) {
          const alt = a?.alternative
          if (!alt?.food) continue
          mapa[`${a.mealIndex}-${a.itemIndex}`] = {
            food: String(alt.food),
            grams: num(alt.grams),
            calories: num(alt.calories),
            protein: num(alt.protein),
            carbs: num(alt.carbs),
            fat: num(alt.fat),
          }
        }
        setAlternativas(mapa)
      } catch {
        // Silencioso de propósito: a opção é um EXTRA. Um aviso de erro aqui
        // assustaria o usuário sobre um plano que está inteiro na tela e funciona.
        if (alive) setAlternativas({})
      }
    })()
    return () => { alive = false }
  }, [row, dayIndex])

  /** Os substitutos marcados nesta refeição, por índice do item. */
  const escolhasDaRefeicao = useCallback((mealIdx: number): Map<number, PlanItem> => {
    const mapa = new Map<number, PlanItem>()
    for (const chave of escolhidos) {
      const [m, i] = chave.split('-').map((n) => Number(n))
      if (m !== mealIdx) continue
      const alt = alternativas[chave]
      if (alt && Number.isFinite(i)) mapa.set(i as number, alt)
    }
    return mapa
  }, [escolhidos, alternativas])

  const applyMeal = useCallback(async (mealOriginal: PlanMeal, idx: number) => {
    // Lança o que está NA TELA: se o usuário marcou a carne, o diário recebe a
    // carne. Os totais saem do `refeicaoComEscolhas`, o mesmo que o cabeçalho da
    // refeição exibe — card e diário não podem discordar em dois toques.
    const meal = refeicaoComEscolhas(mealOriginal, escolhasDaRefeicao(idx))
    if (applyingIdx !== null) return
    setApplyingIdx(idx); setError(null)
    try {
      const res = await applyGeneratedMealAction(
        { name: meal.name, calories: meal.totals.calories, protein: meal.totals.protein, carbs: meal.totals.carbs, fat: meal.totals.fat },
        dateKey,
        // Os alimentos da refeição, cada um com as próprias gramas — sem eles o
        // diário grava um item único chamado "Jantar" que ninguém consegue editar.
        planMealToLogItems(meal),
      )
      if (!res?.ok) { setError(String(res?.error || 'Falha ao lançar.')); return }
      setAppliedIdx((prev) => new Set(prev).add(idx))
      onApplied?.()
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao lançar.')
    } finally {
      setApplyingIdx(null)
    }
  }, [applyingIdx, dateKey, onApplied, escolhasDaRefeicao])

  const swapItem = useCallback(async (mealIdx: number, itemIdx: number) => {
    if (swappingKey) return
    const key = `${dayIndex}-${mealIdx}-${itemIdx}`
    setSwappingKey(key); setError(null)
    try {
      const res = await fetch('/api/nutrition/diet-plan/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dayIndex, mealIndex: mealIdx, itemIndex: itemIdx, reject: rejected[key] ?? [] }),
      })
      const json = await res.json().catch((): null => null)
      if (!res.ok || !json?.ok) {
        setError(
          String(json?.error || '') === 'no_alternative'
            ? 'Não achei outro alimento parecido no seu repertório pra trocar.'
            : 'Não consegui trocar agora. Tente novamente.',
        )
        return
      }
      // A resposta traz o plano inteiro já gravado — usa ela em vez de remontar no
      // cliente, senão o que está na tela e o que está no banco podem divergir.
      setRow((json.plan ?? null) as DietPlanRow | null)
      const food = String(json.swapped?.food || '')
      if (food) setRejected((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), food] }))
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao trocar o alimento.')
    } finally {
      setSwappingKey(null)
    }
  }, [swappingKey, dayIndex, rejected])

  /** Grava a observação. O componente já resolveu "mudou?" e aparou o texto. */
  const salvarNota = useCallback(async (mealIdx: number, texto: string): Promise<boolean> => {
    setSalvandoNota(mealIdx); setErroNota(null)
    try {
      const res = await fetch('/api/nutrition/diet-plan/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dayIndex, mealIndex: mealIdx, note: texto }),
      })
      const json = await res.json().catch((): null => null)
      if (!res.ok || !json?.ok) {
        setErroNota({ idx: mealIdx, msg: 'Não consegui salvar. Tente de novo.' })
        return false
      }
      // Usa o plano que voltou gravado, como faz a troca de alimento: remontar
      // no cliente deixaria tela e banco livres para divergir.
      setRow((json.plan ?? null) as DietPlanRow | null)
      return true
    } catch (e: unknown) {
      setErroNota({ idx: mealIdx, msg: getErrorMessage(e) || 'Falha ao salvar.' })
      return false
    } finally {
      setSalvandoNota(null)
    }
  }, [dayIndex])

  const removePlan = useCallback(async () => {
    if (removing) return
    // A polaridade importa: o `confirm` resolve `false` ao fechar por fora,
    // então REMOVER é o confirmText e manter é o caminho do `false`.
    // Antes disso era um toque só, sem pergunta — e apagar UMA refeição pedia
    // confirmação enquanto jogar fora o plano inteiro não pedia nada.
    const ok = await confirm(
      'O plano inteiro sai, com todos os dias e refeições. Isso não pode ser desfeito.',
      'Remover este plano alimentar?',
      { confirmText: 'Remover plano', cancelText: 'Manter', destructive: true },
    )
    if (!ok) return
    setRemoving(true); setError(null)
    try {
      const res = await fetch('/api/nutrition/diet-plan', { method: 'DELETE', credentials: 'include' })
      const json = await res.json().catch((): null => null)
      if (!res.ok || !json?.ok) { setError('Não consegui remover o plano.'); return }
      setRow(null)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao remover.')
    } finally {
      setRemoving(false)
    }
  }, [removing, confirm])

  if (loading || !row || !days.length) return null

  const day: PlanDay | undefined = days[dayIndex] ?? days[0]
  if (!day) return null

  const rawTitle = String(row.plan_name || '').trim()
  const planTitle = rawTitle.toLowerCase() === 'minha dieta' ? '' : rawTitle

  return (
    <div className="rounded-2xl bg-neutral-900/80 border border-white/[0.06] overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Minha dieta</div>
          {/* O nome só aparece quando diz algo além do rótulo: o default do servidor
              é "Minha dieta", e repetir vira "MINHA DIETA / Minha dieta" na tela. */}
          {planTitle && <div className="truncate text-sm font-bold text-white">{planTitle}</div>}
          <div className="mt-0.5 text-[10px] text-neutral-400">
            {isWeek ? `Plano da semana · ${days.length} dias` : 'Plano de um dia'}
            {' · '}
            {Math.round(day.totals.calories)} kcal · {Math.round(day.totals.protein)}g P
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Horários é ação secundária: o dourado do app pertence a lançar a
              refeição, não a configurar quando ela acontece. */}
          <button
            type="button"
            onClick={() => setHorariosAbertos(true)}
            className="tap-44 shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-neutral-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            Horários
          </button>
          <button
            type="button"
            onClick={removePlan}
            disabled={removing}
            className="tap-44 shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-neutral-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
          >
            {removing ? '...' : 'Remover'}
          </button>
        </div>
      </div>

      <HorariosDasRefeicoes
        open={horariosAbertos}
        days={days}
        onClose={() => setHorariosAbertos(false)}
        onSaved={() => { void load().then((p) => { if (p) setRow(p) }) }}
      />

      {/* Navegação por dia — só faz sentido no plano da semana. */}
      {isWeek && (
        <div className="flex gap-1 overflow-x-auto px-4 pb-3">
          {days.map((d, i) => {
            const isToday = d.weekday === new Date().getDay()
            const active = i === dayIndex
            return (
              <button
                key={`${d.weekday}-${i}`}
                type="button"
                /* `positionedRef` aqui, e não só no efeito: o posicionamento
                   automático roda quando `days` chega, e o botão já está na
                   tela nesse instante. Quem tocasse num dia antes de o efeito
                   rodar era jogado de volta para HOJE, em silêncio — o swap
                   seguia com o índice errado. Escolha do usuário encerra o
                   posicionamento automático, que é o que o comentário do efeito
                   sempre disse. */
                onClick={() => { positionedRef.current = true; setDayIndex(i) }}
                aria-pressed={active}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                  active ? 'bg-yellow-500/20 text-yellow-300' : 'text-neutral-400 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                {d.weekday !== undefined ? SHORT_WEEKDAYS[d.weekday] : `D${i + 1}`}
                {isToday && <span className="ml-1 text-[9px] text-emerald-400">•</span>}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <div className="mx-4 mb-3 rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-[11px] text-red-300">{error}</div>
      )}

      <div className="space-y-2 px-4 pb-4">
        {day.meals.map((meal, idx) => {
          const applied = appliedIdx.has(idx)
          const isOpen = openMeal === idx
          // O cabeçalho mostra o que vai ser lançado. Deixá-lo no total do plano
          // enquanto a carne trocada muda os macros faria a mesma tela dizer dois
          // números para o mesmo prato.
          const exibida = refeicaoComEscolhas(meal, escolhasDaRefeicao(idx))
          return (
            <div key={`${meal.name}-${idx}`} className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenMeal(isOpen ? null : idx)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 p-3 text-left transition active:bg-white/[0.03]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{meal.name}</span>
                  {meal.time ? <span className="text-[10px] text-neutral-400">{meal.time}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {applied && <span className="text-[10px] font-bold text-emerald-400">✓</span>}
                  <span className="text-[10px] tabular-nums text-yellow-300/90">
                    {Math.round(exibida.totals.calories)} kcal · {Math.round(exibida.totals.protein)}g P
                  </span>
                  <svg className={`size-3.5 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3">
                  <div className="overflow-hidden rounded-lg bg-black/20 divide-y divide-white/[0.04]">
                    {meal.items.map((it, j) => {
                      const chaveOpcao = `${idx}-${j}`
                      const opcao = alternativas[chaveOpcao]
                      const trocado = escolhidos.has(chaveOpcao)
                      return (
                      <div key={`${it.food}-${j}`} className="px-2.5 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          {/* Riscado, não apagado: o piso de contraste do app vale para o estado
                              desativado também — quem escolheu a carne ainda precisa LER o que
                              deixou de lado. */}
                          <span className={`truncate text-xs ${trocado ? 'text-neutral-400 line-through' : 'text-white'}`}>{it.food}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="text-xs font-semibold tabular-nums text-neutral-200">{Math.round(num(it.grams))}g</span>
                            <button
                              type="button"
                              onClick={() => swapItem(idx, j)}
                              disabled={swappingKey !== null}
                              title={`Trocar ${it.food} por outro parecido`}
                              aria-label={`Trocar ${it.food}`}
                              className="flex size-6 items-center justify-center rounded-md text-[11px] text-neutral-400 transition hover:bg-white/[0.08] hover:text-yellow-300 disabled:opacity-30"
                            >
                              {swappingKey === `${dayIndex}-${idx}-${j}` ? '…' : '↻'}
                            </button>
                          </span>
                        </div>
                        <div className={`mt-1 flex gap-3 text-[10px] tabular-nums text-neutral-400 ${trocado ? 'line-through' : ''}`}>
                          <span>{Math.round(num(it.calories))} kcal</span>
                          <span className={trocado ? '' : MACRO_SURFACES.protein.label}>P {Math.round(num(it.protein))}g</span>
                          <span className={trocado ? '' : MACRO_SURFACES.carbs.label}>C {Math.round(num(it.carbs))}g</span>
                          <span className={trocado ? '' : MACRO_SURFACES.fat.label}>G {Math.round(num(it.fat))}g</span>
                        </div>

                        {/* A segunda fonte de proteína, oferecida em vez de escondida
                            atrás de um toque: a decisão "hoje é frango ou carne?" se
                            toma olhando as duas. Escolher aqui vale para o LANÇAMENTO;
                            o plano só muda pelo ↻. */}
                        {opcao && (
                          <button
                            type="button"
                            onClick={() => setEscolhidos((prev) => {
                              const next = new Set(prev)
                              if (next.has(chaveOpcao)) next.delete(chaveOpcao)
                              else next.add(chaveOpcao)
                              return next
                            })}
                            aria-pressed={trocado}
                            aria-label={`Trocar por ${Math.round(num(opcao.grams))}g de ${opcao.food} neste lançamento`}
                            className={`mt-1.5 w-full rounded-lg border px-2 py-1.5 text-left transition ${
                              trocado
                                ? 'border-emerald-500/40 bg-emerald-500/10'
                                : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'
                            }`}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={`truncate text-[11px] ${trocado ? 'font-semibold text-emerald-200' : 'text-neutral-300'}`}>
                                {trocado ? '✓ ' : 'Opção: '}{opcao.food}
                              </span>
                              <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${trocado ? 'text-emerald-200' : 'text-neutral-300'}`}>
                                {Math.round(num(opcao.grams))}g
                              </span>
                            </span>
                            <span className="mt-0.5 flex gap-3 text-[10px] tabular-nums text-neutral-400">
                              <span>{Math.round(num(opcao.calories))} kcal</span>
                              <span className={MACRO_SURFACES.protein.label}>P {Math.round(num(opcao.protein))}g</span>
                              <span className={MACRO_SURFACES.carbs.label}>C {Math.round(num(opcao.carbs))}g</span>
                              <span className={MACRO_SURFACES.fat.label}>G {Math.round(num(opcao.fat))}g</span>
                            </span>
                          </button>
                        )}
                      </div>
                      )
                    })}
                  </div>

                  <CampoDeNotaDaRefeicao
                    nota={meal.note ?? ''}
                    nomeDaRefeicao={meal.name}
                    rotulo="Observação"
                    placeholder="Ex.: bater no liquidificador"
                    salvando={salvandoNota === idx}
                    erro={erroNota?.idx === idx ? erroNota.msg : null}
                    onSalvar={(texto) => salvarNota(idx, texto)}
                  />

                  {canApply && (
                    <button
                      type="button"
                      onClick={() => applyMeal(meal, idx)}
                      disabled={applied || applyingIdx !== null}
                      className={`mt-3 tap-44 h-8 w-full rounded-lg text-xs font-bold transition active:scale-[0.98] ${
                        applied
                          ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                          : 'border border-white/[0.08] bg-white/[0.06] text-white hover:bg-white/[0.1] disabled:opacity-50'
                      }`}
                    >
                      {applied ? '✓ Lançado' : applyingIdx === idx ? 'Lançando...' : '✚ Lançar refeição'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isWeek && (
        <p className="px-4 pb-4 text-[10px] text-neutral-400">
          {weekdayLabel(day.weekday)} · trocar um alimento aqui altera só este dia.
        </p>
      )}
    </div>
  )
}
