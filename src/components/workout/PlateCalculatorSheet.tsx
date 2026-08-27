'use client'
/**
 * PlateCalculatorSheet — calculadora de anilhas do treino ativo.
 *
 * Duas telas num sheet só:
 *  - **calc**: alvo → montagem por lado (modo principal) e montagem → total (conferência).
 *  - **inv**: cadastro do inventário real de anilhas + peso da barra.
 *
 * Por que UMA entrada por exercício (e não uma por série): a calculadora seria replicada
 * nos 14 renderers de série, que já divergem entre si — é exatamente a família onde
 * bug nasce de reimplementação. Aqui ela vive fora dos renderers e ESCREVE na série
 * escolhida, que o chamador informa explicitamente (`setLabel`/`onApply`).
 *
 * Aplicar grava `weightSource: 'user'` no log (responsabilidade do chamador): o usuário
 * assumiu aquela carga e o motor de autoload nunca mais a reescreve.
 */
import React, { useMemo, useState } from 'react'
import { X, Plus, Minus, Settings2, ArrowLeft, Check, AlertTriangle } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { NumericInput } from '@/components/ui/NumericInput'
import {
  DEFAULT_PLATE_VALUES,
  COMMON_BAR_WEIGHTS,
  decompose,
  loadableTotals,
  minStepKg,
  pairsAvailable,
  type PlateInventory,
} from '@/utils/plates/plateInventory'

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(n).replace('.', ',')

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Nome do exercício, só para o cabeçalho. */
  exerciseName: string
  /** Rótulo da série que receberá o peso — ex.: "Série 3". Mostrado antes de aplicar. */
  setLabel: string
  /** Peso já digitado naquela série (semente do campo). */
  initialWeight: number | null
  inventory: PlateInventory
  /** Escreve o peso na série. Só chamado no toque explícito em "Aplicar". */
  onApply: (weightKg: number) => void
  /** Persiste o inventário em user_settings.preferences. */
  onSaveInventory: (counts: Record<string, number>, barWeightKg: number) => void
}

export default function PlateCalculatorSheet({
  isOpen, onClose, exerciseName, setLabel, initialWeight, inventory, onApply, onSaveInventory,
}: Props) {
  const focusTrapRef = useFocusTrap(isOpen, onClose)
  const [screen, setScreen] = useState<'calc' | 'inv'>('calc')
  const [target, setTarget] = useState<string>(initialWeight != null && initialWeight > 0 ? String(initialWeight) : '')
  /** Montagem manual (modo conferência): anilha → quantos pares o usuário pôs. */
  const [manual, setManual] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<'target' | 'manual'>('target')

  const targetNum = Number(String(target).replace(',', '.'))
  const result = useMemo(
    () => decompose(Number.isFinite(targetNum) ? targetNum : 0, inventory),
    [targetNum, inventory],
  )
  const totals = useMemo(() => loadableTotals(inventory, 24), [inventory])
  const step = useMemo(() => minStepKg(inventory), [inventory])
  const pairs = useMemo(() => pairsAvailable(inventory), [inventory])

  const manualTotal = useMemo(() => {
    const perSide = Object.entries(manual).reduce((acc, [p, n]) => acc + Number(p) * Number(n || 0), 0)
    return Math.round((inventory.barWeightKg + perSide * 2) * 100) / 100
  }, [manual, inventory.barWeightKg])

  if (!isOpen) return null

  /**
   * Peso que o botão aplicaria. No modo alvo, campo VAZIO não vale 0: `decompose(0)`
   * devolve a barra nua (20 kg), e o botão passaria a oferecer "Aplicar 20 kg" para
   * quem não digitou nada — escrevendo uma carga que o usuário nunca pediu.
   */
  const hasTarget = target.trim() !== '' && Number.isFinite(targetNum) && targetNum > 0
  const appliedWeight = mode === 'manual' ? manualTotal : (hasTarget ? result.total : 0)

  return (
    /* Sem fechar-ao-tocar-fora (padrão dos demais modais do treino): durante a série o
       polegar encosta no backdrop com facilidade, e perder a montagem calculada irrita.
       Escape e o X fecham — o useFocusTrap cuida do teclado. */
    <div className="fixed inset-0 z-[1600] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plate-calc-title"
        className="w-full max-w-md rounded-t-3xl overflow-hidden max-h-[88vh] flex flex-col"
        style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {screen === 'inv' ? (
              <button
                type="button"
                onClick={() => setScreen('calc')}
                className="tap-44 h-8 w-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white flex-shrink-0"
                aria-label="Voltar para a calculadora"
              >
                <ArrowLeft size={16} />
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 id="plate-calc-title" className="text-white font-semibold text-base leading-tight truncate">
                {screen === 'inv' ? 'Minhas anilhas' : 'Calculadora de anilhas'}
              </h2>
              <p className="text-neutral-400 text-xs truncate">{exerciseName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-44 h-8 w-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white flex-shrink-0"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto">
          {screen === 'calc' ? (
            <>
              {/* Alternador de modo */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {([['target', 'Quanto montar'], ['manual', 'Conferir barra']] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`tap-44 h-9 rounded-xl text-xs font-medium border transition-colors ${mode === m
                      ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-400'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === 'target' ? (
                <>
                  <label htmlFor="plate-target" className="block text-neutral-400 text-xs mb-1.5">
                    Peso desejado (kg)
                  </label>
                  {/* NumericInput (não `type="number"`): no WebView com locale != pt-BR o
                      input nativo REJEITA a vírgula, e "82,5" fica impossível de digitar. */}
                  <NumericInput
                    id="plate-target"
                    aria-label="Peso desejado em quilos"
                    value={target}
                    onValueChange={(v) => setTarget(v == null ? '' : String(v))}
                    placeholder="Ex.: 80"
                    className="w-full h-12 rounded-xl bg-neutral-900 border border-neutral-800 px-4 text-white text-lg font-semibold focus:border-yellow-500/60 focus:outline-none"
                  />

                  {target.trim() !== '' && Number.isFinite(targetNum) ? (
                    <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                      {result.exact ? (
                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium mb-3">
                          <Check size={14} /> Monta exato
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-amber-400 text-xs font-medium mb-3">
                          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                          <span>
                            {fmt(targetNum)} kg não monta com as suas anilhas.
                            {result.below != null || result.above != null ? ' Escolha o mais próximo:' : ''}
                          </span>
                        </div>
                      )}

                      {!result.exact && (result.below != null || result.above != null) ? (
                        <div className="flex gap-2 mb-3">
                          {result.below != null ? (
                            <button
                              type="button"
                              onClick={() => setTarget(String(result.below))}
                              className="flex-1 tap-44 h-10 rounded-lg bg-neutral-900 border border-neutral-700 text-white text-sm font-semibold"
                            >
                              ↓ {fmt(result.below)} kg
                            </button>
                          ) : null}
                          {result.above != null ? (
                            <button
                              type="button"
                              onClick={() => setTarget(String(result.above))}
                              className="flex-1 tap-44 h-10 rounded-lg bg-neutral-900 border border-neutral-700 text-white text-sm font-semibold"
                            >
                              ↑ {fmt(result.above)} kg
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {result.below != null || result.exact ? (
                        <>
                          <p className="text-neutral-400 text-[11px] uppercase tracking-wide mb-2">
                            Por lado — barra de {fmt(result.barWeightKg)} kg
                          </p>
                          {result.perSide.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {result.perSide.map((p, i) => (
                                <span
                                  key={`${p}-${i}`}
                                  className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-yellow-500/15 border border-yellow-500/40 text-yellow-400 text-sm font-bold"
                                >
                                  {fmt(p)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-neutral-400 text-sm">Só a barra.</p>
                          )}
                          <p className="text-neutral-400 text-xs mt-3">
                            Total montado: <span className="text-white font-semibold">{fmt(result.total)} kg</span>
                          </p>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                /* ── Modo conferência: toca nas anilhas que estão na barra ───── */
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <p className="text-neutral-400 text-[11px] uppercase tracking-wide mb-3">
                    Pares por lado
                  </p>
                  <div className="space-y-2">
                    {pairs.filter((p) => p.pairs > 0).map(({ plate, pairs: max }) => {
                      const n = Number(manual[String(plate)] ?? 0)
                      return (
                        <div key={plate} className="flex items-center justify-between gap-3">
                          <span className="text-white text-sm font-medium w-16">{fmt(plate)} kg</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Menos uma anilha de ${fmt(plate)} kg`}
                              onClick={() => setManual((m) => ({ ...m, [String(plate)]: Math.max(0, n - 1) }))}
                              className="tap-44 h-8 w-8 rounded-lg bg-neutral-800 text-neutral-300 inline-flex items-center justify-center disabled:opacity-30"
                              disabled={n <= 0}
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-6 text-center text-white text-sm font-semibold tabular-nums">{n}</span>
                            <button
                              type="button"
                              aria-label={`Mais uma anilha de ${fmt(plate)} kg`}
                              onClick={() => setManual((m) => ({ ...m, [String(plate)]: Math.min(max, n + 1) }))}
                              className="tap-44 h-8 w-8 rounded-lg bg-neutral-800 text-neutral-300 inline-flex items-center justify-center disabled:opacity-30"
                              disabled={n >= max}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-neutral-400 text-xs mt-4">
                    Total na barra: <span className="text-white font-semibold text-base">{fmt(manualTotal)} kg</span>
                  </p>
                </div>
              )}

              {/* Prova de que o cadastro serviu pra algo */}
              <div className="mt-4">
                <p className="text-neutral-400 text-[11px] uppercase tracking-wide mb-1.5">Você monta</p>
                <p className="text-neutral-400 text-xs leading-relaxed">
                  {totals.length ? totals.map(fmt).join(' · ') : 'Nenhuma carga — cadastre suas anilhas.'}
                  {totals.length >= 24 ? ' …' : ''}
                </p>
                {step != null ? (
                  <p className="text-neutral-400 text-[11px] mt-1">Menor salto: {fmt(step)} kg</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setScreen('inv')}
                className="mt-3 inline-flex items-center gap-1.5 text-neutral-400 hover:text-yellow-400 text-xs"
              >
                <Settings2 size={13} /> Ajustar minhas anilhas
              </button>

              {/* Aplicar — sempre diz EM QUAL série vai escrever */}
              <button
                type="button"
                disabled={!(appliedWeight > 0)}
                onClick={() => { onApply(appliedWeight); onClose() }}
                className="mt-4 w-full h-12 rounded-xl bg-yellow-500 text-black font-bold text-sm disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.99] transition-transform"
              >
                Aplicar {fmt(appliedWeight)} kg → {setLabel}
              </button>
            </>
          ) : (
            /* ── Tela de inventário ───────────────────────────────────────── */
            <>
              <p className="text-neutral-400 text-xs mb-4">
                Quantas anilhas você tem de cada valor. Conte as unidades — o app calcula os pares.
              </p>
              <div className="space-y-2">
                {DEFAULT_PLATE_VALUES.map((plate) => {
                  const key = String(plate)
                  const units = Number(inventory.counts[key] ?? 0)
                  const p = Math.floor(units / 2)
                  const odd = units % 2 === 1
                  const set = (next: number) =>
                    onSaveInventory({ ...inventory.counts, [key]: Math.max(0, next) }, inventory.barWeightKg)
                  return (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-white text-sm font-medium w-20">{fmt(plate)} kg</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Menos uma anilha de ${fmt(plate)} kg`}
                          onClick={() => set(units - 1)}
                          disabled={units <= 0}
                          className="tap-44 h-8 w-8 rounded-lg bg-neutral-800 text-neutral-300 inline-flex items-center justify-center disabled:opacity-30"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-7 text-center text-white text-sm font-semibold tabular-nums">{units}</span>
                        <button
                          type="button"
                          aria-label={`Mais uma anilha de ${fmt(plate)} kg`}
                          onClick={() => set(units + 1)}
                          className="tap-44 h-8 w-8 rounded-lg bg-neutral-800 text-neutral-300 inline-flex items-center justify-center"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="text-[11px] w-24 text-right flex-shrink-0">
                        {p > 0 ? <span className="text-neutral-400">{p} {p === 1 ? 'par' : 'pares'}</span> : null}
                        {odd ? <span className="text-amber-500/70">{p > 0 ? ' (1 sobrando)' : '1 sobrando'}</span> : null}
                      </span>
                    </div>
                  )
                })}
              </div>

              <p className="text-neutral-400 text-[11px] uppercase tracking-wide mt-6 mb-2">Barra</p>
              <div className="flex flex-wrap gap-2">
                {COMMON_BAR_WEIGHTS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => onSaveInventory(inventory.counts, b)}
                    className={`tap-44 h-10 px-4 rounded-xl text-sm font-semibold border transition-colors ${inventory.barWeightKg === b
                      ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-400'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                      }`}
                  >
                    {fmt(b)} kg
                  </button>
                ))}
                <NumericInput
                  aria-label="Outro peso de barra em quilos"
                  value={COMMON_BAR_WEIGHTS.includes(inventory.barWeightKg as 20) ? '' : inventory.barWeightKg}
                  onValueChange={(v) => onSaveInventory(inventory.counts, v != null && v >= 0 ? v : 0)}
                  placeholder="Outra"
                  className="h-10 w-24 rounded-xl bg-neutral-900 border border-neutral-800 px-3 text-white text-sm focus:border-yellow-500/60 focus:outline-none"
                />
              </div>

              <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                <p className="text-neutral-400 text-[11px] uppercase tracking-wide mb-1.5">Você monta</p>
                <p className="text-neutral-300 text-xs leading-relaxed">
                  {totals.length ? totals.map(fmt).join(' · ') : 'Nenhuma carga com esse inventário.'}
                  {totals.length >= 24 ? ' …' : ''}
                </p>
                {step != null ? (
                  <p className="text-neutral-400 text-[11px] mt-1.5">Menor salto: {fmt(step)} kg</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setScreen('calc')}
                className="mt-4 w-full h-11 rounded-xl bg-neutral-800 text-white font-semibold text-sm"
              >
                Pronto
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
