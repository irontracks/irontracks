'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { applyGeneratedMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import { getErrorMessage } from '@/utils/errorMessage'
import { useDialog } from '@/contexts/DialogContext'
import { createClient } from '@/utils/supabase/client'
import { useUserSettings } from '@/hooks/useUserSettings'
import { planDays, weekdayLabel, type DietPlanRow, type PlanDay, type PlanItem, type PlanMeal, type MacroTotals } from '@/lib/nutrition/dietPlanShape'
import { refeicaoParaLancamento, type AjustesDoLancamento } from '@/lib/nutrition/ajusteDoLancamento'
import { resolveFoodForEditor } from '@/lib/nutrition/resolveFoodForEditor'
import { useCustomFoods } from './useCustomFoods'
import { MACRO_SURFACES } from '@/lib/nutrition/macroColors'
import { normalizeFoodKey } from '@/lib/nutrition/learned-foods'
import { ajustarDia, type MacroAjustavel } from '@/lib/nutrition/ajusteAutomaticoDoDia'
import { MACHINE_ACCENT } from '@/lib/design/machineAccent'
import { CampoDeNotaDaRefeicao } from './CampoDeNotaDaRefeicao'
import HorariosDasRefeicoes from './HorariosDasRefeicoes'
import { NumericInput } from '@/components/ui/NumericInput'
import { planMealToLogItems } from '@/lib/nutrition/planMealItems'

/** O mínimo de uma entrada do diário que o reajuste automático precisa. */
export type EntradaDoDiaParaAjuste = { food_name: string; calories: number; protein: number; carbs: number; fat: number }

const ROTULO_MACRO: Record<MacroAjustavel, string> = { protein: 'proteína', carbs: 'carboidrato', fat: 'gordura' }

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
  entries,
}: {
  dateKey: string
  /** Só deixa lançar no dia atual (histórico/futuro só leem). */
  canApply?: boolean
  onApplied?: () => void
  /**
   * As refeições já lançadas HOJE, para o reajuste automático saber o que
   * sobrou/faltou. Vem do `NutritionMixer`, que já carrega isso pro resumo
   * do dia — buscar de novo aqui duplicaria a consulta.
   */
  entries?: EntradaDoDiaParaAjuste[]
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
  /**
   * Ajustes do LANÇAMENTO (22/09/2026, confirmado com o dono: só hoje, nunca
   * o plano) — remover item, mudar quantidade, adicionar item avulso. Chave
   * `mealIdx-itemIdx` para remoção/quantidade (paralela a `escolhidos`);
   * `adicionadosPorRefeicao` é por `mealIdx` porque o item novo não tem
   * índice no plano original.
   */
  const [itensRemovidos, setItensRemovidos] = useState<Set<string>>(new Set())
  const [quantidadesEditadas, setQuantidadesEditadas] = useState<Record<string, number>>({})
  const [adicionadosPorRefeicao, setAdicionadosPorRefeicao] = useState<Record<number, PlanItem[]>>({})
  const [textoNovoItem, setTextoNovoItem] = useState<Record<number, string>>({})
  const [adicionando, setAdicionando] = useState<number | null>(null)
  const [erroAdicionar, setErroAdicionar] = useState<{ idx: number; msg: string } | null>(null)
  const [salvandoNota, setSalvandoNota] = useState<number | null>(null)
  /** Falha da gravação, presa à refeição que falhou — no topo da lista ela
   *  nasceria longe (ou fora) do campo que o usuário acabou de usar. */
  const [erroNota, setErroNota] = useState<{ idx: number; msg: string } | null>(null)
  const { confirm } = useDialog()
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [horariosAbertos, setHorariosAbertos] = useState(false)

  // Só para ler o interruptor do reajuste automático — o resto da tela não
  // precisa do usuário logado, então isto não bloqueia nada enquanto carrega.
  const [userId, setUserId] = useState<string | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => { if (alive) setUserId(data?.user?.id) })
    return () => { alive = false }
  }, [])
  const { settings, save } = useUserSettings(userId)
  const { foods: customFoods } = useCustomFoods(userId)
  const autoAjusteLigado = Boolean(settings?.nutritionAutoAdjust)
  const [salvandoAjuste, setSalvandoAjuste] = useState(false)
  const alternarAutoAjuste = useCallback(async () => {
    if (salvandoAjuste) return
    setSalvandoAjuste(true)
    try { await save({ nutritionAutoAdjust: !autoAjusteLigado }) } finally { setSalvandoAjuste(false) }
  }, [salvandoAjuste, autoAjusteLigado, save])

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
    // Mesma regra para os ajustes de lançamento (adicionar/remover/redimensionar
    // item): são do dia visível, nunca do plano — ver `ajusteDoLancamento.ts`.
    setItensRemovidos(new Set())
    setQuantidadesEditadas({})
    setAdicionadosPorRefeicao({})
    setTextoNovoItem({})
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

  /** Remoção/reescala/adição marcadas nesta refeição, para ESTE lançamento. */
  const ajustesDaRefeicao = useCallback((mealIdx: number): AjustesDoLancamento => {
    const removidos = new Set<number>()
    for (const chave of itensRemovidos) {
      const [m, i] = chave.split('-').map((n) => Number(n))
      if (m === mealIdx && Number.isFinite(i)) removidos.add(i)
    }
    const quantidades = new Map<number, number>()
    for (const [chave, valor] of Object.entries(quantidadesEditadas)) {
      const [m, i] = chave.split('-').map((n) => Number(n))
      if (m === mealIdx && Number.isFinite(i)) quantidades.set(i, valor)
    }
    return { removidos, quantidades, adicionados: adicionadosPorRefeicao[mealIdx] ?? [] }
  }, [itensRemovidos, quantidadesEditadas, adicionadosPorRefeicao])

  const alternarRemocaoDoItem = useCallback((mealIdx: number, itemIdx: number) => {
    const chave = `${mealIdx}-${itemIdx}`
    setItensRemovidos((prev) => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })
  }, [])

  const mudarQuantidadeDoItem = useCallback((mealIdx: number, itemIdx: number, novoValor: number | null) => {
    const chave = `${mealIdx}-${itemIdx}`
    setQuantidadesEditadas((prev) => {
      if (novoValor === null || !(novoValor > 0)) {
        // Campo em branco durante a digitação não pode zerar o item — some do
        // mapa de ajustes e a refeição volta a mostrar a gramatura original.
        if (!(chave in prev)) return prev
        const next = { ...prev }
        delete next[chave]
        return next
      }
      return { ...prev, [chave]: novoValor }
    })
  }, [])

  const removerItemAdicionado = useCallback((mealIdx: number, itemIdx: number) => {
    setAdicionadosPorRefeicao((prev) => {
      const lista = prev[mealIdx] ?? []
      return { ...prev, [mealIdx]: lista.filter((_, i) => i !== itemIdx) }
    })
  }, [])

  const adicionarItem = useCallback(async (mealIdx: number) => {
    const texto = String(textoNovoItem[mealIdx] ?? '').trim()
    if (!texto) return
    setAdicionando(mealIdx); setErroAdicionar(null)
    try {
      const res = await resolveFoodForEditor(texto, customFoods)
      if (!res.ok) {
        setErroAdicionar({ idx: mealIdx, msg: res.error || 'Não reconheci esse alimento.' })
        return
      }
      const novos: PlanItem[] = res.items.map((it) => ({
        food: it.label, grams: num(it.grams), calories: num(it.calories),
        protein: num(it.protein), carbs: num(it.carbs), fat: num(it.fat),
      }))
      setAdicionadosPorRefeicao((prev) => ({ ...prev, [mealIdx]: [...(prev[mealIdx] ?? []), ...novos] }))
      setTextoNovoItem((prev) => ({ ...prev, [mealIdx]: '' }))
    } catch (e: unknown) {
      setErroAdicionar({ idx: mealIdx, msg: getErrorMessage(e) || 'Falha ao adicionar.' })
    } finally {
      setAdicionando(null)
    }
  }, [textoNovoItem, customFoods])

  const applyMeal = useCallback(async (mealOriginal: PlanMeal, idx: number) => {
    // Lança o que está NA TELA: se o usuário marcou a carne, tirou o pimentão
    // ou ajustou a gramatura, o diário recebe exatamente isso. Os totais saem
    // de `refeicaoParaLancamento`, o mesmo que o cabeçalho da refeição exibe —
    // card e diário não podem discordar em dois toques.
    const meal = refeicaoParaLancamento(mealOriginal, escolhasDaRefeicao(idx), ajustesDaRefeicao(idx))
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
      // Ajustes já foram lançados — limpa só os DESTA refeição, para não
      // arrastar "removido"/"quantidade editada" para o próximo dia (o plano
      // volta a mostrar o item original, que é o que a próxima leitura de
      // `entries` já reflete como lançado).
      setItensRemovidos((prev) => new Set([...prev].filter((c) => !c.startsWith(`${idx}-`))))
      setQuantidadesEditadas((prev) => Object.fromEntries(Object.entries(prev).filter(([c]) => !c.startsWith(`${idx}-`))))
      setAdicionadosPorRefeicao((prev) => { const next = { ...prev }; delete next[idx]; return next })
      onApplied?.()
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Falha ao lançar.')
    } finally {
      setApplyingIdx(null)
    }
  }, [applyingIdx, dateKey, onApplied, escolhasDaRefeicao, ajustesDaRefeicao])

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

  const day: PlanDay | undefined = days[dayIndex] ?? days[0]

  /**
   * O que já foi lançado HOJE, por nome de refeição normalizado — a fonte é
   * `entries` (o diário de verdade), nunca `appliedIdx` (que é só o "✓" desta
   * sessão da tela e reseta ao trocar de dia).
   */
  const lancamentosPorNome = useMemo(() => {
    const mapa = new Map<string, MacroTotals>()
    for (const e of entries ?? []) {
      const chave = normalizeFoodKey(String(e?.food_name ?? ''))
      if (!chave) continue
      const atual = mapa.get(chave) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
      mapa.set(chave, {
        calories: atual.calories + num(e.calories),
        protein: atual.protein + num(e.protein),
        carbs: atual.carbs + num(e.carbs),
        fat: atual.fat + num(e.fat),
      })
    }
    return mapa
  }, [entries])

  // Só ajusta o dia ATUAL (canApply = hoje): dia passado já aconteceu por
  // inteiro, dia futuro ainda não tem lançamento nenhum para comparar.
  const resultadoAjuste = useMemo(() => {
    if (!autoAjusteLigado || !canApply || !day) return null
    return ajustarDia(day.meals, lancamentosPorNome)
  }, [autoAjusteLigado, canApply, day, lancamentosPorNome])

  const mealsParaExibir = resultadoAjuste ? resultadoAjuste.refeicoes : (day?.meals ?? [])

  /** Nomes (normalizados) das refeições que o reajuste automático tocou —
   *  pedido do dono, 22/09/2026: sem isso, só o aviso do topo dizia o que
   *  mudou, e sumia da vista ao rolar a lista. */
  const refeicoesAjustadas = useMemo(() => {
    const nomes = new Set<string>()
    for (const a of resultadoAjuste?.ajustes ?? []) nomes.add(normalizeFoodKey(a.refeicao))
    return nomes
  }, [resultadoAjuste])

  if (loading || !row || !days.length) return null
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
          {/* Violeta = a cor da MÁQUINA no app inteiro: quando ligado, é o app
              quem decide reequilibrar as refeições sozinho. */}
          <button
            type="button"
            onClick={alternarAutoAjuste}
            disabled={salvandoAjuste}
            aria-pressed={autoAjusteLigado}
            title="Ao lançar uma refeição diferente do plano, reequilibra automaticamente as refeições do dia que ainda faltam"
            className={`tap-44 shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold transition disabled:opacity-40 ${
              autoAjusteLigado ? MACHINE_ACCENT.surfaceActive : 'text-neutral-400 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            🧠 Ajuste automático: {autoAjusteLigado ? 'Ligado' : 'Desligado'}
          </button>
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

      {/* Transparência: o app nunca reequilibra calado — quem vê a tela precisa
          saber que o jantar que está olhando não é exatamente o que o plano
          original tinha. */}
      {resultadoAjuste && resultadoAjuste.ajustes.length > 0 && (
        <div className={`mx-4 mb-3 rounded-xl border p-2.5 text-[11px] ${MACHINE_ACCENT.surface}`}>
          <span className={`font-bold ${MACHINE_ACCENT.text}`}>🧠 Reequilibrei seu dia: </span>
          {resultadoAjuste.ajustes.map((a, i) => (
            <span key={`${a.refeicao}-${a.macro}-${i}`}>
              {i > 0 && '; '}
              {a.deltaG > 0 ? 'mais' : 'menos'} {Math.abs(Math.round(a.deltaG))}g de {ROTULO_MACRO[a.macro]} {a.deltaG > 0 ? 'em' : 'na'} {a.refeicao}
            </span>
          ))}
          .
        </div>
      )}

      <div className="space-y-2 px-4 pb-4">
        {mealsParaExibir.map((meal, idx) => {
          const applied = appliedIdx.has(idx) || lancamentosPorNome.has(normalizeFoodKey(meal.name))
          const ajustada = refeicoesAjustadas.has(normalizeFoodKey(meal.name))
          const isOpen = openMeal === idx
          // O cabeçalho mostra o que vai ser lançado. Deixá-lo no total do plano
          // enquanto a carne trocada muda os macros faria a mesma tela dizer dois
          // números para o mesmo prato.
          const exibida = refeicaoParaLancamento(meal, escolhasDaRefeicao(idx), ajustesDaRefeicao(idx))
          const itensRemovidosDesta = ajustesDaRefeicao(idx).removidos
          const itensAdicionadosDesta = adicionadosPorRefeicao[idx] ?? []
          return (
            <div key={`${meal.name}-${idx}`} className={`rounded-xl bg-white/[0.02] overflow-hidden ${ajustada ? `border ${MACHINE_ACCENT.rule}` : 'border border-white/[0.06]'}`}>
              <button
                type="button"
                onClick={() => setOpenMeal(isOpen ? null : idx)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 p-3 text-left transition active:bg-white/[0.03]"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="block truncate text-sm font-semibold text-white">{meal.name}</span>
                    {/* A régua lateral já marca o card; o ícone é para quem só olha
                        de relance a lista fechada, sem abrir a refeição. */}
                    {ajustada && (
                      <span className={`shrink-0 text-xs ${MACHINE_ACCENT.icon}`} title="Ajustado automaticamente pelo Ajuste automático">🧠</span>
                    )}
                  </span>
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
                      const chaveAjuste = `${idx}-${j}`
                      const removido = itensRemovidosDesta.has(j)
                      const quantidadeEditadaBase = quantidadesEditadas[chaveAjuste]
                      return (
                      <div key={`${it.food}-${j}`} className={`px-2.5 py-2 ${removido ? 'opacity-50' : ''}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          {/* Riscado, não apagado: o piso de contraste do app vale para o estado
                              desativado também — quem escolheu a carne (ou tirou o item) ainda
                              precisa LER o que deixou de lado. */}
                          <span className={`truncate text-xs ${trocado || removido ? 'text-neutral-400 line-through' : 'text-white'}`}>{it.food}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {removido ? (
                              <span className="text-xs font-semibold tabular-nums text-neutral-400 line-through">{Math.round(num(it.grams))}g</span>
                            ) : (
                              <span className="flex items-center gap-0.5">
                                <NumericInput
                                  value={quantidadeEditadaBase ?? Math.round(num(it.grams))}
                                  onValueChange={(v) => mudarQuantidadeDoItem(idx, j, v)}
                                  decimal={false}
                                  disabled={trocado}
                                  aria-label={`Quantidade de ${it.food}, em gramas`}
                                  className="tap-44 h-6 w-12 rounded-md border border-white/[0.08] bg-transparent px-1 text-right text-xs font-semibold tabular-nums text-neutral-200 disabled:opacity-30"
                                />
                                <span className="text-[10px] text-neutral-400">g</span>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => alternarRemocaoDoItem(idx, j)}
                              title={removido ? `Manter ${it.food} no lançamento` : `Tirar ${it.food} deste lançamento`}
                              aria-label={removido ? `Manter ${it.food}` : `Tirar ${it.food}`}
                              className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] text-neutral-400 transition hover:bg-white/[0.08] hover:text-red-300"
                            >
                              {removido ? '↺' : '🗑'}
                            </button>
                            {!removido && (
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
                            )}
                          </span>
                        </div>
                        <div className={`mt-1 flex gap-3 text-[10px] tabular-nums text-neutral-400 ${trocado || removido ? 'line-through' : ''}`}>
                          <span>{Math.round(num(it.calories))} kcal</span>
                          <span className={trocado || removido ? '' : MACRO_SURFACES.protein.label}>P {Math.round(num(it.protein))}g</span>
                          <span className={trocado || removido ? '' : MACRO_SURFACES.carbs.label}>C {Math.round(num(it.carbs))}g</span>
                          <span className={trocado || removido ? '' : MACRO_SURFACES.fat.label}>G {Math.round(num(it.fat))}g</span>
                        </div>

                        {/* A segunda fonte de proteína, oferecida em vez de escondida
                            atrás de um toque: a decisão "hoje é frango ou carne?" se
                            toma olhando as duas. Escolher aqui vale para o LANÇAMENTO;
                            o plano só muda pelo ↻. Some quando o item foi TIRADO — não
                            faz sentido oferecer opção de algo que não vai ser lançado. */}
                        {opcao && !removido && (
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

                    {/* Itens avulsos adicionados só para ESTE lançamento — não
                        entram no plano, mesma regra da remoção/quantidade. */}
                    {itensAdicionadosDesta.map((it, j) => (
                      <div key={`novo-${it.food}-${j}`} className="px-2.5 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs text-white">{it.food}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="text-xs font-semibold tabular-nums text-neutral-200">{Math.round(num(it.grams))}g</span>
                            <button
                              type="button"
                              onClick={() => removerItemAdicionado(idx, j)}
                              title={`Tirar ${it.food}`}
                              aria-label={`Tirar ${it.food}`}
                              className="flex size-6 items-center justify-center rounded-md text-[11px] text-neutral-400 transition hover:bg-white/[0.08] hover:text-red-300"
                            >
                              🗑
                            </button>
                          </span>
                        </div>
                        <div className="mt-1 flex gap-3 text-[10px] tabular-nums text-neutral-400">
                          <span>{Math.round(num(it.calories))} kcal</span>
                          <span className={MACRO_SURFACES.protein.label}>P {Math.round(num(it.protein))}g</span>
                          <span className={MACRO_SURFACES.carbs.label}>C {Math.round(num(it.carbs))}g</span>
                          <span className={MACRO_SURFACES.fat.label}>G {Math.round(num(it.fat))}g</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Adicionar um alimento avulso a ESTE lançamento — mesma cadeia
                      de reconhecimento de texto do diário (parser → base → IA). */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="text"
                      aria-label={`Adicionar alimento a ${meal.name}`}
                      value={textoNovoItem[idx] ?? ''}
                      onChange={(e) => setTextoNovoItem((prev) => ({ ...prev, [idx]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void adicionarItem(idx) } }}
                      placeholder="Adicionar alimento (ex.: 100g batata doce)"
                      className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 text-xs text-white placeholder:text-neutral-400 focus:border-yellow-500/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void adicionarItem(idx)}
                      disabled={adicionando === idx || !String(textoNovoItem[idx] ?? '').trim()}
                      className="tap-44 h-8 shrink-0 rounded-lg bg-white/[0.06] px-2.5 text-[11px] font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-40"
                    >
                      {adicionando === idx ? '...' : '+ Add'}
                    </button>
                  </div>
                  {erroAdicionar?.idx === idx && (
                    <p className="mt-1 text-[10px] text-red-300">{erroAdicionar.msg}</p>
                  )}

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
