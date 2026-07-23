/**
 * useAutoloadWeight — aplica a carga automática ao campo de peso-base de QUALQUER
 * renderer de série (normal e métodos avançados: Drop-Set, Rest-Pause, Cluster…).
 *
 * Cada método avançado tem seu próprio renderer, mas todos têm um `log.weight` base
 * (que semeia o modal do método). Este hook centraliza: preenche esse peso com a
 * sugestão do motor (série ainda vazia, não concluída, não tocada), e devolve o
 * estado visual pra marcar o campo como "sugestão 🧠".
 *
 * Detecção de override sem marcador por-renderer: `isAutoWeight` exige que o valor
 * atual AINDA seja igual à sugestão — assim que o usuário edita, o valor deixa de
 * bater e o destaque some sozinho (não precisa instrumentar o onChange de cada renderer).
 */
import { useEffect } from 'react'
import { useWorkoutContext } from '../WorkoutContext'
import type { WorkoutExercise } from '../types'

const AUTO_INPUT_CLASS = 'border-violet-500/60 ring-violet-500 text-violet-100 bg-violet-500/5'

export function useAutoloadWeight(ex: WorkoutExercise, exIdx: number, setIdx: number): {
  isAutoWeight: boolean
  rationale: string
  autoInputClass: string
  /** Peso sugerido pelo motor (null quando não há). Métodos com etapas (drop) usam
   *  isto para semear a 1ª etapa — o `log.weight` sozinho não chega nas etapas. */
  suggestedWeight: number | null
} {
  const { autoLoadEnabled, autoLoadSuggestions, getLog, updateLog, getPlanConfig } = useWorkoutContext()

  const key = `${exIdx}-${setIdx}`
  const log = getLog(key)
  // Só computa cfg quando ligado (o prefill precisa dele); desligado, zero trabalho —
  // e não depende de getPlanConfig existir no contexto (robusto p/ mocks de teste).
  const cfg = autoLoadEnabled && typeof getPlanConfig === 'function' ? getPlanConfig(ex, setIdx) : null
  const suggestion = autoLoadEnabled ? autoLoadSuggestions?.[key] : null
  const sugWeight = suggestion?.weight ?? null
  const done = !!log.done

  // Preenche a caixa de peso com a sugestão — só série de trabalho vazia, não concluída,
  // não tocada (weightSource nulo). Depois disso nunca reescreve.
  useEffect(() => {
    if (!autoLoadEnabled || done) return
    if (sugWeight == null) return
    if (log.weightSource === 'user') return // o usuário assumiu — nunca reescreve
    const current = String(log.weight ?? '').trim()
    const next = String(sugWeight)
    if (current === next) return // já sincronizado
    // Valor preexistente que NÃO é nosso (sessão restaurada, peso do template) → respeita.
    if (current !== '' && log.weightSource !== 'auto') return
    // Preenche quando vazio E re-sincroniza quando a sugestão muda (histórico vem do
    // cache primeiro e da rede depois). Sem isto o número congela desatualizado e
    // passa a contradizer a explicação mostrada ao lado.
    updateLog(key, { weight: next, weightSource: 'auto', advanced_config: cfg ?? log.advanced_config ?? null })
  }, [autoLoadEnabled, done, sugWeight, log.weight, log.weightSource, log.advanced_config, key, cfg, updateLog])

  const isAutoWeight = Boolean(
    autoLoadEnabled &&
    !done &&
    log.weightSource === 'auto' &&
    sugWeight != null &&
    String(log.weight ?? '') === String(sugWeight),
  )

  return {
    isAutoWeight,
    rationale: suggestion?.rationale ?? '',
    autoInputClass: isAutoWeight ? AUTO_INPUT_CLASS : '',
    suggestedWeight: sugWeight,
  }
}
