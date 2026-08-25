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
import { ArrowLeft, CalendarDays, ChevronDown, Clapperboard, ExternalLink, EyeOff, FileDown, FileText, Flame, Pencil, UtensilsCrossed } from 'lucide-react'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/client'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackHandler } from '@/hooks/useBackHandler'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { MACRO_COLORS, MACRO_SURFACES } from '@/lib/nutrition/macroColors'
import { HistorySummaryShell, SummaryAction } from '@/components/history/HistorySummaryShell'
import { HistoryWeekDivider, weekDividerLabel, weekStartOfDay } from '@/components/history/HistoryWeekDivider'
import {
  aggregateEntriesByDay,
  periodLabel,
  periodRangeText,
  summarizeHistory,
  type NutritionHistoryDay,
} from '@/lib/nutrition/history'
import {
  JANELAS_FIXAS,
  periodoDaJanela,
  resolverPeriodoPersonalizado,
  rotuloPeriodo,
  sufixoArquivo,
  type NutritionPeriod,
} from '@/lib/nutrition/historyPeriod'
import { diasSugeridos } from '@/lib/nutrition/incompleteDay'
import { useNutritionDayFlags } from '@/hooks/useNutritionDayFlags'
import { useNutritionDayMeals, COLUNAS_REFEICAO } from '@/hooks/useNutritionDayMeals'
import { groupMealsByDay, MAX_DIAS_DETALHE_REFEICOES, normalizeMealRows, resumoItens, rotuloItem, type NutritionMeal, type NutritionMealRow } from '@/lib/nutrition/dayMeals'
import { buildNutritionPeriodHtml } from '@/utils/report/buildNutritionPeriodHtml'
import { exportHtmlAsPdf } from '@/utils/report/exportHtmlAsPdf'
import { periodToContent } from '@/components/stories/nutritionStory'

const NutritionStoryComposer = dynamic(() => import('@/components/NutritionStoryComposer'), { ssr: false, loading: () => null })

/**
 * As pílulas de janela, no molde do histórico de treino: rótulo CURTO na tela
 * (quatro cabem em 375pt) e o nome inteiro para o leitor de tela.
 */
const OPCOES_JANELA = [
  ...JANELAS_FIXAS.map((days) => ({ key: String(days), label: `${days}d`, ariaLabel: `${days} dias` })),
  { key: 'custom', label: 'Período', ariaLabel: 'Período personalizado' },
]

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
  /** `mealId` = a refeição tocada; ausente = o dia inteiro (botão do rodapé). */
  onPickDate: (date: string, mealId?: string) => void
  onClose: () => void
}

export default function NutritionHistoryModal({ open, userId, todayDate, goals, onPickDate, onClose }: Props) {
  // `number` = uma das janelas de um toque; `'custom'` = o intervalo digitado.
  const [modo, setModo] = useState<number | 'custom'>(30)
  const [inicioCustom, setInicioCustom] = useState('')
  const [fimCustom, setFimCustom] = useState('')

  // O período é DERIVADO do modo — não há um segundo estado guardando datas
  // já resolvidas que pudesse discordar dos campos na tela.
  //
  // ⚠️ `useMemo` NÃO é otimização aqui, é correção: `periodo` entra nas
  // dependências do efeito de busca, e um objeto novo a cada render faria o
  // efeito rodar sempre — `setResultado` re-renderiza, o objeto muda de
  // identidade, o efeito dispara de novo. Fetch em laço infinito contra o
  // Supabase. Enquanto era o número `janela`, a identidade era estável de
  // graça e o problema não existia.
  const { periodo, erroPeriodo } = useMemo(() => {
    if (modo !== 'custom') {
      return { periodo: periodoDaJanela(todayDate, modo) as NutritionPeriod | null, erroPeriodo: '' }
    }
    const r = resolverPeriodoPersonalizado(inicioCustom, fimCustom, todayDate)
    return r.ok
      ? { periodo: r.periodo as NutritionPeriod | null, erroPeriodo: '' }
      : { periodo: null, erroPeriodo: r.erro }
  }, [modo, inicioCustom, fimCustom, todayDate])

  // Um estado só, CARIMBADO com a consulta que o produziu: trocar de janela
  // invalida o resultado no próprio render, sem um `setDias(null)` dentro do
  // efeito (que dispara renda em cascata e o ESLint reprova).
  const chave = `${String(userId || '')}|${periodo?.inicio ?? ''}|${periodo?.fim ?? ''}`
  const [resultado, setResultado] = useState<{ chave: string; dias: NutritionHistoryDay[]; erro: boolean } | null>(null)
  const atual = resultado && resultado.chave === chave ? resultado : null
  const dias = atual?.dias ?? null
  const erro = atual?.erro ?? false
  const focusTrapRef = useFocusTrap(open, onClose)
  useBackHandler(open, onClose)

  useEffect(() => {
    const uid = String(userId || '').trim()
    // Sem período resolvido (intervalo pela metade ou inválido) não há consulta
    // a fazer — e disparar uma com data vazia devolveria a conta inteira.
    if (!open || !uid || !periodo) return
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
          .gte('date', periodo.inicio)
          .lte('date', periodo.fim)
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
  }, [open, userId, periodo, chave])

  const diasJanela = periodo?.dias ?? 0
  const { marcados, erro: erroMarcas, alternar } = useNutritionDayFlags(userId, periodo?.inicio ?? null, periodo?.fim ?? null)

  // A MESMA função calcula a média com e sem os dias marcados — duas contas
  // para o mesmo número é como nasce divergência entre a tela e o exportado.
  const resumo = useMemo(() => summarizeHistory(dias, diasJanela, marcados), [dias, diasJanela, marcados])

  // Candidatos que o app aponta. Sugerir é tudo o que ele faz: quem decide o
  // que conta como registro completo é o dono do dado.
  const sugeridos = useMemo(() => new Set(diasSugeridos(dias, marcados)), [dias, marcados])

  // Abrir o card mostra as refeições DAQUELE dia, sem sair do histórico
  // (pedido do dono, 25/08/2026). Antes o toque fechava o modal e trocava a
  // data da aba — que abre no topo, com os lançamentos no fim da página: o
  // gesto de "abrir o dia" nunca chegava a mostrar o dia.
  const { alternar: alternarDia, estadoDe, estaAberto } = useNutritionDayMeals(userId)

  const [storyAberto, setStoryAberto] = useState(false)
  const [pdf, setPdf] = useState<{ carregando: boolean; erro: string }>({ carregando: false, erro: '' })
  const rotulo = periodLabel(diasJanela)

  /**
   * Salva o período em PDF (pedido do dono: levar ao nutricionista).
   *
   * No iPhone o helper abre o share sheet do iOS, então "baixar" e
   * "compartilhar o arquivo" são o MESMO gesto — por isso existe um botão só,
   * e o destino (Arquivos, WhatsApp, e-mail) é escolhido lá.
   *
   * ⚠️ Passa por `exportHtmlAsPdf` e nada mais: `window.print()` NÃO EXISTE no
   * WKWebView, e quem o chama direto entrega um botão inerte no aparelho, em
   * silêncio. Foi o que aconteceu com o "Baixar PDF" do relatório de período
   * do histórico de treino, morto por um mês.
   */
  const salvarPdf = useCallback(async () => {
    if (!periodo || !dias || pdf.carregando) return
    setPdf({ carregando: true, erro: '' })
    try {
      /**
       * O detalhe de refeições do PERÍODO inteiro — o que o nutricionista quer
       * ler, e o que o relatório não tinha. Coletado só na hora de exportar:
       * puxar isso junto da lista multiplicaria por 5 um payload que o usuário
       * quase sempre só quer resumido.
       *
       * Acima de `MAX_DIAS_DETALHE_REFEICOES` o detalhe fica de fora e o
       * relatório DIZ por quê. Omitir em silêncio faria o profissional ler
       * ausência de refeição como ausência de registro.
       */
      let refeicoesPorDia: ReadonlyMap<string, NutritionMeal[]> | null = null
      let detalheOmitido: string | null = null
      if (periodo.dias > MAX_DIAS_DETALHE_REFEICOES) {
        detalheOmitido = `Detalhe por refeição disponível em períodos de até ${MAX_DIAS_DETALHE_REFEICOES} dias — este tem ${periodo.dias}. Os totais diários acima cobrem o período inteiro.`
      } else {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('nutrition_meal_entries')
          .select(COLUNAS_REFEICAO)
          .eq('user_id', String(userId || ''))
          .gte('date', periodo.inicio)
          .lte('date', periodo.fim)
        // Falha de leitura não pode virar "não comeu nada": o relatório sai
        // sem a seção e com o motivo escrito.
        if (error) detalheOmitido = 'Não consegui carregar o detalhe por refeição desta vez. Os totais diários acima estão completos.'
        else refeicoesPorDia = groupMealsByDay(normalizeMealRows((data ?? []) as NutritionMealRow[]))
      }

      const html = buildNutritionPeriodHtml({
        periodo,
        dias,
        resumo,
        metaKcal: goals?.calories ?? null,
        emitidoEm: todayDate,
        excluidos: marcados,
        refeicoesPorDia,
        detalheOmitido,
      })
      const res = await exportHtmlAsPdf({
        html,
        title: `Nutrição — ${rotuloPeriodo(periodo)}`,
        baseFileName: `IronTracks_Nutricao_${sufixoArquivo(periodo)}`,
      })
      if (res.ok || res.via === 'cancelled') { setPdf({ carregando: false, erro: '' }); return }
      setPdf({ carregando: false, erro: res.error || 'Não consegui gerar o arquivo.' })
    } catch (e) {
      setPdf({ carregando: false, erro: e instanceof Error ? e.message : 'Não consegui gerar o arquivo.' })
    }
  }, [periodo, dias, resumo, goals, todayDate, marcados, pdf.carregando, userId])

  const abrirDia = useCallback((date: string, mealId?: string) => {
    onPickDate(date, mealId)
    onClose()
  }, [onPickDate, onClose])

  if (!open) return null

  // Portal: este modal nasce dentro do `NutritionOverlay`, que é
  // `fixed … z-[25] overflow-y-auto`. Sem sair de lá, o `fixed` daqui passa a
  // se ancorar naquele contêiner rolável — o modal ROLA junto com a página e o
  // topo (com o botão Voltar) sai da tela. Relatado pelo dono com a lista
  // rolada: sobrava só o rodapé (20/08/2026).
  return (
    <FullscreenPortal>
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

        {/* O card de resumo ROLA com a lista, como no histórico de treino: numa
            folha de 88vh, prender resumo + filtros no topo custava metade da
            área útil para o que a tela existe para mostrar. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <HistorySummaryShell
            eyebrow="Resumo"
            title={periodo ? rotuloPeriodo(periodo) : 'Período personalizado'}
            /* A cobertura sai do rodapé e vem qualificar o título: "1.900
               kcal/dia" de quem lançou 8 dias em 30 não é a média do mês, e o
               número só significa alguma coisa ao lado do denominador. */
            subtitle={
              <>
                {resumo.loggedDays} de {resumo.windowDays} dias com lançamento
                {resumo.excludedDays > 0 && ` · ${resumo.excludedDays} fora da média`}
              </>
            }
            ranges={{
              options: OPCOES_JANELA,
              value: modo === 'custom' ? 'custom' : String(modo),
              onChange: (k) => setModo(k === 'custom' ? 'custom' : Number(k)),
            }}
            metrics={[
              {
                key: 'kcal',
                label: 'Média/dia',
                featured: true,
                icon: <Flame size={28} className="text-yellow-500" />,
                value: <>{resumo.avgCalories}<span className="ml-1 text-xs font-bold text-neutral-400">kcal</span></>,
              },
              {
                key: 'protein',
                label: 'Proteína',
                icon: <PontoMacro macro="protein" />,
                valueColor: MACRO_COLORS.protein,
                value: <>{resumo.avgProtein}<span className="ml-0.5 text-xs font-bold opacity-70">g</span></>,
              },
              {
                key: 'carbs',
                label: 'Carbo',
                icon: <PontoMacro macro="carbs" />,
                valueColor: MACRO_COLORS.carbs,
                value: <>{resumo.avgCarbs}<span className="ml-0.5 text-xs font-bold opacity-70">g</span></>,
              },
              {
                key: 'fat',
                label: 'Gordura',
                icon: <PontoMacro macro="fat" />,
                valueColor: MACRO_COLORS.fat,
                value: <>{resumo.avgFat}<span className="ml-0.5 text-xs font-bold opacity-70">g</span></>,
              },
            ]}
            actions={{
              label: 'Relatórios',
              icon: <FileText size={14} className="shrink-0 text-neutral-400" aria-hidden="true" />,
              children: (
                <>
                  {/* Sem dia registrado não há o que exportar nem o que postar —
                      um relatório de "0 kcal em média" seria afirmação falsa
                      sobre o período, ainda por cima entregue ao nutricionista. */}
                  <SummaryAction
                    variant="gold"
                    onClick={() => { void salvarPdf() }}
                    disabled={resumo.loggedDays === 0 || pdf.carregando}
                  >
                    <FileDown size={12} aria-hidden="true" />
                    {pdf.carregando ? 'Gerando…' : 'Salvar PDF'}
                  </SummaryAction>
                  <SummaryAction
                    onClick={() => setStoryAberto(true)}
                    disabled={resumo.loggedDays === 0}
                    aria-label={`Compartilhar ${rotulo.toLowerCase()} como story`}
                    className="w-9 px-0"
                  >
                    <Clapperboard size={14} aria-hidden="true" />
                  </SummaryAction>
                </>
              ),
            }}
          >
            {modo === 'custom' && (
              <div className="mt-3 flex items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className="t-meta-inherit block text-[10px] text-neutral-400">De</span>
                  <input
                    type="date"
                    value={inicioCustom}
                    max={todayDate}
                    aria-label="Data inicial do período"
                    onChange={(e) => setInicioCustom(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100"
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="t-meta-inherit block text-[10px] text-neutral-400">Até</span>
                  <input
                    type="date"
                    value={fimCustom}
                    max={todayDate}
                    aria-label="Data final do período"
                    onChange={(e) => setFimCustom(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100"
                  />
                </label>
              </div>
            )}

            {/* A recusa precisa DIZER o que está errado — um intervalo invertido
                que devolvesse lista vazia leria como "você não comeu nada".
                Mas SÓ depois que as duas datas existem: com os campos em branco
                não há erro nenhum, e pintar "Escolha as duas datas" de vermelho
                ao abrir gasta a cor do ALARME numa instrução. */}
            {erroPeriodo && inicioCustom && fimCustom && (
              <p className="mt-2 text-xs font-bold text-red-400" role="alert">{erroPeriodo}</p>
            )}
          </HistorySummaryShell>

          {/* O corte do detalhe é dito ANTES de exportar: descobrir no PDF que
              faltam as refeições custa um arquivo inteiro. Em linha PRÓPRIA —
              dentro da linha de ações ele espremia o "Salvar PDF" em duas
              linhas (visto no aparelho). */}
          {periodo && periodo.dias > MAX_DIAS_DETALHE_REFEICOES && (
            <p className="-mt-2 px-1 text-[11px] text-neutral-400">
              O PDF sai sem o detalhe por refeição acima de {MAX_DIAS_DETALHE_REFEICOES} dias — os totais diários vão completos.
            </p>
          )}

          {(pdf.erro || erroMarcas) && (
            <p className="text-xs font-bold text-red-400" role="alert">{pdf.erro || erroMarcas}</p>
          )}

          {!periodo ? (
            <p className="px-1 py-8 text-center text-sm text-neutral-400">
              Escolha as duas datas para ver o período.
            </p>
          ) : dias === null ? (
            <p className="px-1 py-6 text-center text-sm text-neutral-400">Carregando…</p>
          ) : erro ? (
            <p className="px-1 py-6 text-center text-sm text-neutral-400">
              Não consegui carregar o histórico agora. Tente de novo em instantes.
            </p>
          ) : dias.length === 0 ? (
            <div
              className="rounded-2xl px-6 py-8 text-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <UtensilsCrossed className="mx-auto mb-2 h-6 w-6 text-neutral-600" aria-hidden="true" />
              <p className="text-sm font-black text-white">Nenhum dia registrado nesta janela.</p>
              <p className="mt-1 text-xs text-neutral-400">Lance uma refeição e ela aparece aqui.</p>
            </div>
          ) : (
            <ul className="space-y-3 pb-2">
              {dias.map((d, i) => {
                const foraDaMedia = marcados.has(d.date)
                const sugerido = sugeridos.has(d.date)
                const aberto = estaAberto(d.date)
                const detalhe = estadoDe(d.date)
                const semana = weekStartOfDay(d.date)
                const semanaAnterior = i > 0 ? weekStartOfDay(dias[i - 1].date) : '__NENHUMA__'
                const abreSemana = !!semana && semana !== semanaAnterior
                return (
                <li key={d.date}>
                  {abreSemana && semana && <HistoryWeekDivider label={weekDividerLabel(semana)} />}
                  <div className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => alternarDia(d.date)}
                      // A linha inteira é UM controle: sem o rótulo, o leitor de
                      // tela anuncia seis fragmentos soltos (data, P, C, G,
                      // refeições, número) e nenhum deles diz o que o toque faz.
                      aria-label={`${aberto ? 'Fechar' : 'Ver'} as refeições de ${rotuloData(d.date, todayDate)} — ${Math.round(d.calories)} kcal, ${d.meals} refeiç${d.meals === 1 ? 'ão' : 'ões'}${foraDaMedia ? ', fora da média' : ''}`}
                      aria-expanded={aberto}
                      aria-controls={`refeicoes-${d.date}`}
                      className="group relative min-w-0 flex-1 overflow-hidden rounded-2xl text-left transition-all duration-300 hover:shadow-lg hover:shadow-black/30 active:scale-[0.99]"
                    >
                      {/* Barra de accent — o mesmo código de estado do card de
                          sessão. O dia fora da média fica CINZA aqui, não
                          apagado por opacidade: 45% de opacity levava o texto
                          para baixo do contraste mínimo, e um dado que a pessoa
                          marcou continua sendo dado dela. */}
                      <div className={`absolute bottom-0 left-0 top-0 w-[3px] rounded-l-2xl transition-colors duration-300 ${foraDaMedia ? 'bg-neutral-700' : 'bg-yellow-500/30 group-hover:bg-yellow-500/60'}`} />
                      <div
                        className="flex items-center gap-3 rounded-2xl p-4 pl-5"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <CalendarDays size={13} className={`shrink-0 ${foraDaMedia ? 'text-neutral-600' : 'text-yellow-500/60'}`} aria-hidden="true" />
                            <h3 className={`truncate font-black tracking-tight ${foraDaMedia ? 'text-neutral-300' : 'text-white'}`}>
                              {rotuloData(d.date, todayDate)}
                            </h3>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <BadgeMacro macro="protein" letra="P" gramas={d.protein} mudo={foraDaMedia} />
                            <BadgeMacro macro="carbs" letra="C" gramas={d.carbs} mudo={foraDaMedia} />
                            <BadgeMacro macro="fat" letra="G" gramas={d.fat} mudo={foraDaMedia} />
                            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700/50 bg-neutral-800/80 px-2 py-0.5 text-[10px] font-bold text-neutral-300">
                              <UtensilsCrossed size={10} className="text-yellow-500/60" aria-hidden="true" />
                              {d.meals} refeiç{d.meals === 1 ? 'ão' : 'ões'}
                            </span>
                            {foraDaMedia && (
                              <span className="inline-flex items-center rounded-full border border-neutral-700/50 bg-neutral-800/80 px-2 py-0.5 text-[10px] font-bold text-neutral-300">
                                fora da média
                              </span>
                            )}
                            {/* Só um convite, em cinza: o dia AINDA conta, e
                                pintar a sugestão de dourado ou vermelho
                                afirmaria algo que o app não sabe. */}
                            {!foraDaMedia && sugerido && (
                              <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-neutral-400">
                                parece incompleto
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <div className="text-right">
                            <div className={`text-lg font-black tabular-nums ${foraDaMedia ? 'text-neutral-300' : 'text-white'}`}>{Math.round(d.calories)}</div>
                            <div className="text-[11px] text-neutral-400">kcal</div>
                          </div>
                          {/* A seta é a promessa de que há mais embaixo. Sem
                              ela o card parece um destino, e o toque surpreende. */}
                          <ChevronDown
                            size={16}
                            aria-hidden="true"
                            className={`shrink-0 text-neutral-400 transition-transform duration-300 ${aberto ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </div>
                    </button>
                    {/* Controle SEPARADO do "abrir o dia": são duas ações
                        diferentes, e o leitor de tela precisa alcançar as duas.
                        Ícone e nome dizem o efeito na MÉDIA, não "marcar" — é o
                        efeito que o usuário está procurando. */}
                    <button
                      type="button"
                      onClick={() => { void alternar(d.date, !foraDaMedia) }}
                      aria-pressed={foraDaMedia}
                      aria-label={foraDaMedia
                        ? `Voltar ${rotuloData(d.date, todayDate)} para a média`
                        : `Tirar ${rotuloData(d.date, todayDate)} da média (registro incompleto)`}
                      className={`tap-44 flex w-11 shrink-0 items-center justify-center rounded-2xl border transition active:scale-95 ${
                        foraDaMedia
                          ? 'border-neutral-700 bg-neutral-800 text-neutral-200'
                          : sugerido
                            ? 'border-neutral-700/80 bg-neutral-900 text-neutral-300'
                            : 'border-neutral-800/60 bg-neutral-950 text-neutral-400'
                      }`}
                    >
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  {aberto && (
                    <div id={`refeicoes-${d.date}`} className="mt-2 mr-[52px] rounded-2xl border border-neutral-800/60 bg-neutral-950/60 p-3">
                      {detalhe.status === 'carregando' ? (
                        <p className="py-2 text-center text-xs text-neutral-400">Carregando as refeições…</p>
                      ) : detalhe.status === 'erro' ? (
                        <p className="py-2 text-center text-xs font-bold text-red-400" role="alert">{detalhe.mensagem}</p>
                      ) : detalhe.status === 'ok' && detalhe.refeicoes.length === 0 ? (
                        /* O card só existe porque houve lançamento — zero aqui é
                           divergência (refeição apagada em outro aparelho), não
                           "dia vazio". Dizer isso evita caça a fantasma. */
                        <p className="py-2 text-center text-xs text-neutral-400">
                          Não encontrei as refeições deste dia. Ele pode ter sido editado em outro aparelho.
                        </p>
                      ) : detalhe.status === 'ok' ? (
                        <ul className="space-y-2">
                          {detalhe.refeicoes.map((m) => (
                            <LinhaRefeicao
                              key={m.id}
                              refeicao={m}
                              onEditar={() => abrirDia(d.date, m.id)}
                              rotuloDia={rotuloData(d.date, todayDate)}
                            />
                          ))}
                        </ul>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => abrirDia(d.date)}
                        className="tap-44 mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-700/50 bg-neutral-800/80 px-3 text-[11px] t-action uppercase tracking-wider text-neutral-300 transition active:scale-95"
                      >
                        <ExternalLink size={12} aria-hidden="true" />
                        Abrir o dia para editar
                      </button>
                    </div>
                  )}
                </li>
                )
              })}
            </ul>
          )}
        </div>

        {storyAberto && (
          <NutritionStoryComposer
            open={storyAberto}
            mode="period"
            content={periodToContent(resumo, goals, {
              periodLabel: rotulo,
              // O intervalo sai do PERÍODO, não de `todayDate`: num período
              // personalizado que termina em julho, contar para trás a partir
              // de hoje escreveria no story um intervalo que não é o exibido.
              rangeText: periodRangeText(periodo?.fim ?? todayDate, diasJanela),
            })}
            onClose={() => setStoryAberto(false)}
          />
        )}
      </div>
    </div>
  </FullscreenPortal>
  )
}

/** O ponto de cor do macro no bloco de métrica — o papel do ícone lucide do card de treino. */
function PontoMacro({ macro }: { macro: 'protein' | 'carbs' | 'fat' }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: MACRO_COLORS[macro] }}
    />
  )
}

/**
 * Badge de macro na linha do dia, no molde dos badges do card de sessão.
 *
 * `mudo` é o dia que o usuário tirou da média: os macros recuam para a
 * superfície neutra. Visto no aparelho — em cor cheia, o dia excluído
 * competia de igual para igual com os que contam, e a lista deixava de ter
 * primeiro plano. O dado continua legível: some a ÊNFASE, não o número.
 */
function BadgeMacro({ macro, letra, gramas, mudo }: { macro: 'protein' | 'carbs' | 'fat'; letra: string; gramas: number; mudo?: boolean }) {
  const tema = mudo
    ? { surface: 'bg-neutral-800/80 border-neutral-700/50', label: 'text-neutral-300' }
    : MACRO_SURFACES[macro]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${tema.surface} ${tema.label}`}>
      {letra} {Math.round(gramas)}g
    </span>
  )
}

/**
 * Uma refeição dentro do card do dia.
 *
 * Hierarquia: a HORA e o NOME identificam ("07:34 · Café da manhã"), as kcal
 * são o número, e os macros ficam abaixo em corpo menor. Os alimentos entram
 * numa linha só (`resumoItens`) — a lista completa é papel do PDF; aqui, seis
 * linhas por refeição transformariam o card num segundo histórico.
 */
function LinhaRefeicao({ refeicao, onEditar, rotuloDia }: { refeicao: NutritionMeal; onEditar: () => void; rotuloDia: string }) {
  // "5 ovos cozidos" no título E "5 ovos cozidos" embaixo: quando a refeição
  // tem um item só, o parser costuma repetir o nome inteiro. Um fato aparece
  // uma vez (docs/DESIGN_HIERARCHY.md) — visto no aparelho, 25/08/2026.
  const bruto = resumoItens(refeicao)
  const resumo = mesmoTexto(bruto, refeicao.nome) ? '' : bruto
  // Com o prato separado, cada alimento ganha a PRÓPRIA linha, com quantidade
  // e macros — pedido do dono: "250g arroz branco / 250g de filé de tilápia
  // grelhada e suas kcal de macros". Com um item só, a linha extra apenas
  // repetiria a refeição, e aí vale o resumo de antes.
  const detalhado = refeicao.itens.length > 1
  return (
    <li>
    <button
      type="button"
      onClick={onEditar}
      // A refeição é o alvo de quem quer CORRIGIR algo — abrir o dia e caçar a
      // linha de novo é o passo que o histórico existe para poupar.
      aria-label={`Editar ${refeicao.nome} de ${rotuloDia} — ${Math.round(refeicao.calories)} kcal`}
      className="flex w-full items-start gap-3 rounded-xl bg-white/[0.02] px-3 py-2 text-left transition active:scale-[0.99] hover:bg-white/[0.04]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {refeicao.hora && <span className="shrink-0 text-[11px] font-bold tabular-nums text-yellow-500/70">{refeicao.hora}</span>}
          <span className="truncate text-sm font-bold text-neutral-100">{refeicao.nome}</span>
        </div>
        {detalhado ? (
          <ul className="mt-1 space-y-1">
            {refeicao.itens.map((it, i) => (
              <li key={`${it.label}-${i}`} className="flex items-baseline gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-neutral-300">{rotuloItem(it)}</span>
                <span className="shrink-0 tabular-nums text-neutral-400">
                  {Math.round(it.calories)} kcal
                </span>
                <span className="shrink-0 tabular-nums text-neutral-400">
                  <span style={{ color: MACRO_COLORS.protein }}>{Math.round(it.protein)}</span>
                  {'/'}
                  <span style={{ color: MACRO_COLORS.carbs }}>{Math.round(it.carbs)}</span>
                  {'/'}
                  <span style={{ color: MACRO_COLORS.fat }}>{Math.round(it.fat)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : resumo ? (
          <p className="mt-0.5 truncate text-[11px] text-neutral-400">{resumo}</p>
        ) : null}
        <p className="mt-1 text-[11px] tabular-nums text-neutral-400">
          <span style={{ color: MACRO_COLORS.protein }}>P {Math.round(refeicao.protein)}g</span>
          {' · '}
          <span style={{ color: MACRO_COLORS.carbs }}>C {Math.round(refeicao.carbs)}g</span>
          {' · '}
          <span style={{ color: MACRO_COLORS.fat }}>G {Math.round(refeicao.fat)}g</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="text-right">
          <div className="text-sm font-black tabular-nums text-white">{Math.round(refeicao.calories)}</div>
          <div className="text-[10px] text-neutral-400">kcal</div>
        </div>
        <Pencil size={12} className="shrink-0 text-neutral-500" aria-hidden="true" />
      </div>
    </button>
    </li>
  )
}

/** Mesmo texto a menos de caixa, acento e espaço — para não repetir o rótulo. */
function mesmoTexto(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return !!a && norm(a) === norm(b)
}
