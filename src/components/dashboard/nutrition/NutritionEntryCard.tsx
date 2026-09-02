'use client'

import { memo, useState } from 'react'
import { X } from 'lucide-react'
import { macroCaloriePercents } from '@/lib/nutrition/macroSplit'
import { MACRO_COLORS, MACRO_SEGMENT_GAP_PX, MACRO_SURFACES } from '@/lib/nutrition/macroColors'
import { plainFieldProps, properNameFieldProps } from '@/utils/ui/textFieldProps'
import { horaBrt, rotuloItem } from '@/lib/nutrition/dayMeals'
import { NumericInput } from '@/components/ui/NumericInput'
import { quantidadeEditavel, reescalarItem } from '@/lib/nutrition/mealItemQuantity'

type MealItemView = { label: string; grams: number; calories: number; protein: number; carbs: number; fat: number }

type MealEntry = {
  id: string
  created_at: string
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  items?: MealItemView[] | null
}

// O editor agora gerencia a LISTA DE ALIMENTOS; macros/calorias = soma dos itens.
type EditDraft = {
  food_name: string
  items: MealItemView[]
  /**
   * Os itens como estavam ao ABRIR o editor, antes de qualquer reescala de
   * quantidade. `reescalarItem` sempre parte daqui — nunca do item já
   * reescalado —, senão 250 → 150 → 250 não volta ao original (arredondamento
   * acumula a cada passo). Opcional por compatibilidade: sem isto, cai no
   * fallback de reescalar a partir do próprio `items` (round-trip não é
   * garantido nesse caso, mas nada quebra).
   */
  itensOriginais?: MealItemView[]
}

type AddFoodResult =
  | { ok: true; items: MealItemView[] }
  | { ok: false; error?: string; needsAi?: boolean }

type NutritionEntryCardProps = {
  item: MealEntry
  isExpanded: boolean
  onToggleExpand: (id: string) => void
  // Edit
  editingId: string
  editDraft: EditDraft
  editBusy: boolean
  onStartEdit: (item: MealEntry) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onEditDraftChange: (updater: (draft: EditDraft) => EditDraft) => void
  /** Resolve um texto de alimento → item(s) (parser/base + IA). */
  onAddFood?: (text: string) => Promise<AddFoodResult>
  // Delete
  confirmDeleteId: string
  entryBusyId: string
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  onDelete: (id: string) => void
  // Story
  onStory?: (item: MealEntry) => void
}

/**
 * A hora da refeição é BRT, como no resto da aba.
 *
 * Era `toLocaleTimeString` SEM `timeZone`, ou seja, o fuso do DISPOSITIVO —
 * enquanto o histórico de refeições e o relatório do período já usam
 * `America/Sao_Paulo` explícito (`horaBrt`). A mesma refeição saía com horas
 * diferentes em duas superfícies da mesma aba, e no SSR (que roda em UTC) o
 * café da manhã aparecia às 11h.
 *
 * Não reimplementa: usa a fonte única que já existe.
 */
const formatClock = horaBrt

function NutritionEntryCard({
  item,
  isExpanded,
  onToggleExpand,
  editingId,
  editDraft,
  editBusy,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
  onAddFood,
  confirmDeleteId,
  entryBusyId,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onStory,
}: NutritionEntryCardProps) {
  // % de CALORIAS (Atwater 4/4/9), não % de gramas. Ver macroSplit.ts — a divisão
  // por grama fazia um almoço P70/C69/G42 mostrar "23% gordura" quando 40% das
  // calorias dele são gordura.
  const { protein: proteinPct, carbs: carbsPct, fat: fatPct } = macroCaloriePercents(item)

  // Estado local do "adicionar alimento" no editor.
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const draftItems = Array.isArray(editDraft?.items) ? editDraft.items : []
  // Base para reescalar quantidade — ver comentário do campo no tipo EditDraft.
  // Sem `itensOriginais` (compatibilidade), cai nos próprios `items` atuais.
  const itensOriginaisArr = Array.isArray(editDraft?.itensOriginais) ? editDraft.itensOriginais : draftItems
  const draftTotals = draftItems.reduce(
    (a, it) => ({
      calories: a.calories + (Number(it?.calories) || 0),
      protein: a.protein + (Number(it?.protein) || 0),
      carbs: a.carbs + (Number(it?.carbs) || 0),
      fat: a.fat + (Number(it?.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )

  const handleAddFood = async () => {
    const text = addText.trim()
    if (!text || adding || !onAddFood) return
    setAdding(true); setAddError('')
    try {
      const res = await onAddFood(text)
      if (res.ok) {
        onEditDraftChange((d) => {
          const baseItems = Array.isArray(d.items) ? d.items : []
          // Item RECÉM-adicionado: sua própria base é ele mesmo (não há
          // "quantidade anterior" — ele nasce como está agora).
          const baseOriginais = Array.isArray(d.itensOriginais) ? d.itensOriginais : baseItems
          return {
            ...d,
            items: [...baseItems, ...res.items],
            itensOriginais: [...baseOriginais, ...res.items],
          }
        })
        setAddText('')
      } else {
        setAddError(res.error || 'Não reconheci esse alimento.')
      }
    } catch {
      setAddError('Falha ao adicionar.')
    } finally {
      setAdding(false)
    }
  }

  /**
   * Quantidade de um item editada — reescala SEMPRE a partir do original.
   *
   * A leitura de `itensOriginais` acontece DENTRO do updater (a partir de `d`,
   * o estado mais fresco), não do `itensOriginaisArr` capturado no render: o
   * `onEditDraftChange` de NutritionMixer é um `setState` funcional, e usar um
   * valor de fora do closure aqui seria o mesmo risco de sempre com estado
   * assíncrono — só que, como o array de originais nunca muda depois de aberto
   * o editor, a leitura de dentro do updater é a forma mais direta de garantir
   * isso, sem depender de quando o React decide re-renderizar.
   */
  const handleQuantityChange = (i: number, novoValor: number | null) => {
    if (novoValor === null || !(novoValor > 0)) return
    onEditDraftChange((d) => {
      const itensOriginais = Array.isArray(d.itensOriginais) ? d.itensOriginais : (Array.isArray(d.items) ? d.items : [])
      const original = itensOriginais[i]
      if (!original) return d
      const reescalado = reescalarItem(original, novoValor)
      return {
        ...d,
        items: (Array.isArray(d.items) ? d.items : []).map((it, idx) => (idx === i ? reescalado : it)),
      }
    })
  }

  return (
    <div className="rounded-2xl bg-neutral-950/70 border border-neutral-800 ring-1 ring-neutral-800/70 overflow-hidden transition-all duration-300">
      {/* Clickable header */}
      <button
        type="button"
        aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
        onClick={() => onToggleExpand(isExpanded ? '' : item.id)}
        className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{item.food_name}</div>
          <div className="mt-1 text-xs text-neutral-400">
            {formatClock(item.created_at)} · P {Math.round(item.protein)}g · C {Math.round(item.carbs)}g · G {Math.round(item.fat)}g
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-sm font-semibold text-neutral-200 whitespace-nowrap">{Math.round(item.calories)} kcal</div>
          <svg
            className={`w-4 h-4 text-neutral-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-neutral-800/60 animate-in fade-in slide-in-from-top-1 duration-200">
          {editingId === item.id ? (
            /* ── Editor de ALIMENTOS (adicionar/remover; macros = soma) ── */
            <div className="mt-3 space-y-3" role="none" onClick={(e) => e.stopPropagation()}>
              <input {...properNameFieldProps}
                type="text"
                aria-label="Nome da refeição"
                value={editDraft.food_name}
                onChange={(e) => onEditDraftChange((d) => ({ ...d, food_name: e.target.value }))}
                className="w-full h-11 rounded-xl bg-neutral-800/60 border border-neutral-700/50 px-3 text-sm text-white placeholder:text-neutral-400 outline-none focus:border-yellow-500/40"
                placeholder="Nome da refeição"
              />

              {/* Lista de alimentos */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 font-semibold mb-1.5">Alimentos</div>
                {draftItems.length === 0 ? (
                  <div className="text-xs text-neutral-400 py-1.5">Nenhum alimento — adicione abaixo.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {draftItems.map((food, i) => {
                      const original = itensOriginaisArr[i] ?? food
                      // A EDITABILIDADE é propriedade do item ORIGINAL (densidade
                      // não muda ao reescalar); o VALOR mostrado no campo é o
                      // ATUAL (food), que já reflete uma reescala anterior.
                      const editavel = quantidadeEditavel(original)
                      const valorAtual = editavel ? (quantidadeEditavel(food)?.valor ?? editavel.valor) : null
                      return (
                      <li key={`${food.label}-${i}`} className="flex items-center gap-2 rounded-lg bg-neutral-800/40 border border-neutral-700/40 px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-neutral-100 truncate">{rotuloItem(food) || food.label}</div>
                          <div className="text-[10px] text-neutral-400">{Math.round(food.calories)} kcal · P{Math.round(food.protein)} C{Math.round(food.carbs)} G{Math.round(food.fat)}</div>
                        </div>
                        {editavel && valorAtual !== null ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <NumericInput
                              aria-label={`Quantidade de ${food.label}`}
                              decimal
                              value={valorAtual}
                              onValueChange={(novo) => handleQuantityChange(i, novo)}
                              className="w-14 h-11 rounded-lg bg-neutral-900 border border-neutral-700/50 px-1.5 text-xs text-white text-center outline-none focus:border-yellow-500/40"
                            />
                            <span className="text-[10px] text-neutral-400 w-4 shrink-0">{editavel.unidade.trim() || 'g'}</span>
                          </div>
                        ) : (
                          // Item de memo/legado: sem `grams`, não há base pra
                          // reescalar — inventar 100g seria afirmar uma medição
                          // que ninguém fez. Remove e relança em vez de editar.
                          <span className="text-[10px] text-neutral-400 italic shrink-0 max-w-[112px] text-right leading-tight">
                            quantidade não registrada
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`Remover ${food.label}`}
                          onClick={() => onEditDraftChange((d) => {
                            const baseItems = Array.isArray(d.items) ? d.items : []
                            const baseOriginais = Array.isArray(d.itensOriginais) ? d.itensOriginais : baseItems
                            return {
                              ...d,
                              items: baseItems.filter((_, idx) => idx !== i),
                              itensOriginais: baseOriginais.filter((_, idx) => idx !== i),
                            }
                          })}
                          /* `before:-inset-2` leva a área de toque a ~44px sem
                             engordar a linha da lista — mesmo recurso do botão
                             METAS. O alvo visível continua discreto; o dedo, não. */
                          className="relative shrink-0 tap-44 w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-700/50 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 flex items-center justify-center transition before:absolute before:-inset-2 before:content-['']"
                        >
                          <X size={13} strokeWidth={2.5} aria-hidden="true" />
                        </button>
                      </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Adicionar alimento */}
              <div className="flex items-center gap-1.5">
                <input {...plainFieldProps}
                  type="text"
                  aria-label="Adicionar alimento"
                  value={addText}
                  disabled={adding}
                  onChange={(e) => { setAddText(e.target.value); if (addError) setAddError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddFood() } }}
                  className="flex-1 h-11 rounded-xl bg-neutral-800/60 border border-neutral-700/50 px-3 text-sm text-white placeholder:text-neutral-400 outline-none focus:border-yellow-500/40 disabled:opacity-60"
                  placeholder="Adicionar alimento (ex.: 200g arroz)"
                />
                <button
                  type="button"
                  onClick={() => void handleAddFood()}
                  disabled={adding || !addText.trim()}
                  className="h-11 px-3 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-xs font-bold text-yellow-200 hover:bg-yellow-500/30 disabled:opacity-50 transition whitespace-nowrap"
                >
                  {adding ? '...' : '+ Add'}
                </button>
              </div>
              {addError && <div className="text-[11px] text-red-300">{addError}</div>}

              {/* Totais (somente leitura — soma dos itens) */}
              <div className="rounded-xl bg-neutral-800/40 border border-neutral-700/40 px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Total</span>
                <span className="text-xs text-neutral-200 font-semibold">
                  {Math.round(draftTotals.calories)} kcal
                  <span className="ml-2 text-neutral-400 font-normal">P{Math.round(draftTotals.protein)} C{Math.round(draftTotals.carbs)} G{Math.round(draftTotals.fat)}</span>
                </span>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => { setAddText(''); setAddError(''); onCancelEdit() }}
                  className="h-11 px-4 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:bg-neutral-900 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={editBusy || draftItems.length === 0}
                  onClick={onSaveEdit}
                  className="h-11 px-4 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-xs font-semibold text-yellow-200 hover:bg-yellow-500/30 disabled:opacity-60 transition"
                >
                  {editBusy ? '...' : 'Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Proporção da refeição. As cores saem da fonte única
                  (`lib/nutrition/macroColors`): aqui a gordura era `#ef4444`, a
                  cor de ERRO do app — 23g de gordura pintavam um bloco inteiro
                  de vermelho —, e o carboidrato era amarelo, enquanto o card
                  Macronutrientes logo acima o desenha em azul. Mesma tela,
                  mesmas categorias, duas codificações. */}
              <div
                className="mt-3 h-2.5 rounded-full overflow-hidden flex bg-neutral-800"
                /* O fio do fundo entre segmentos: sem ele, uma refeição sem
                   carboidrato encosta âmbar em laranja (18,7° de matiz) e os
                   dois viram uma mancha só. Ver MACRO_SEGMENT_GAP_PX. */
                style={{ gap: `${MACRO_SEGMENT_GAP_PX}px` }}
              >
                {proteinPct > 0 && <div className="h-full" style={{ width: `${proteinPct}%`, backgroundColor: MACRO_COLORS.protein }} />}
                {carbsPct > 0 && <div className="h-full" style={{ width: `${carbsPct}%`, backgroundColor: MACRO_COLORS.carbs }} />}
                {fatPct > 0 && <div className="h-full" style={{ width: `${fatPct}%`, backgroundColor: MACRO_COLORS.fat }} />}
              </div>

              {/* Macro details — o percentual é de CALORIAS, e isso precisa estar
                  escrito: "45%" sozinho é lido como percentual de gramas, que dá
                  outro número (ver macroSplit.ts). */}
              <div className="mt-3 grid grid-cols-3 gap-3">
                {([
                  { key: 'protein' as const, label: 'Proteína', valor: item.protein, pct: proteinPct },
                  { key: 'carbs' as const, label: 'Carboidrato', valor: item.carbs, pct: carbsPct },
                  { key: 'fat' as const, label: 'Gordura', valor: item.fat, pct: fatPct },
                ]).map((m) => (
                  <div key={m.key} className={`rounded-xl border p-3 ${MACRO_SURFACES[m.key].surface}`}>
                    <div className={`text-[10px] uppercase tracking-wider font-bold ${MACRO_SURFACES[m.key].label}`}>{m.label}</div>
                    <div className="mt-1 text-base font-bold text-white tabular-nums">{Math.round(m.valor)}g</div>
                    <div className="text-[10px] text-neutral-400 tabular-nums">{m.pct}% das kcal</div>
                  </div>
                ))}
              </div>

              {/* Alimentos da refeição (breakdown por item) */}
              {Array.isArray(item.items) && item.items.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 font-semibold mb-1.5">Alimentos</div>
                  <ul className="space-y-1">
                    {item.items.map((food, i) => (
                      <li key={`${food.label}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-neutral-200">{food.label}</span>
                        <span className="shrink-0 whitespace-nowrap text-neutral-400">
                          <span className="font-semibold text-neutral-100">{Math.round(food.calories)}</span> kcal
                          <span className="ml-2 text-[10px] text-neutral-400">P{Math.round(food.protein)} C{Math.round(food.carbs)} G{Math.round(food.fat)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ações. O rodapé repetia "Total: 655 kcal · 17:00" — os DOIS
                  números já estão no cabeçalho da mesma caixa, a poucos pixels
                  daqui. Terceira aparição do mesmo dado no mesmo card. */}
              <div className="mt-3 flex items-center justify-end gap-2">
                {confirmDeleteId === item.id ? (
                  <>
                    {/* "Sim"/"Não" não dizem a que respondem quando o usuário
                        volta ao card meio segundo depois. Confirmação destrutiva
                        nomeia a AÇÃO. */}
                    {/* "Remover este lançamento?" não cabe ao lado de dois botões
                        de 44px na largura de um iPhone: virava "Remover este
                        lançament…" na tela. A ação já está nomeada no botão
                        vermelho ao lado — aqui basta a pergunta. */}
                    <span className="mr-auto min-w-0 truncate text-xs text-neutral-300">Tem certeza?</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCancelDelete() }}
                      className="h-11 px-4 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:bg-neutral-900 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={entryBusyId === item.id}
                      onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
                      className="h-11 px-4 rounded-xl bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-200 hover:bg-red-500/30 disabled:opacity-60 transition"
                    >
                      {entryBusyId === item.id ? '...' : 'Remover'}
                    </button>
                  </>
                ) : (
                  <>
                    {onStory && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onStory(item) }}
                        aria-label="Compartilhar refeição (Story)"
                        className="h-11 px-4 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/20 transition"
                      >
                        Story
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onStartEdit(item) }}
                      className="h-11 px-4 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/20 transition"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={entryBusyId === item.id}
                      onClick={(e) => { e.stopPropagation(); onConfirmDelete(item.id) }}
                      className="h-11 px-4 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:border-red-500/20 disabled:opacity-60 transition"
                    >
                      {entryBusyId === item.id ? '...' : 'Remover'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(NutritionEntryCard)
export type { MealEntry, EditDraft }
