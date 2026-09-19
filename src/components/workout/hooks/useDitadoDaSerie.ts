'use client'

/**
 * @module useDitadoDaSerie
 *
 * A fronteira ÚNICA de escrita da voz no log da série. Fia
 * `useSpeechToText` (ditado, já em produção) + `falaDaSerie` (parser) +
 * `resolverSerieAlvoDaVoz` (qual série recebe) + `updateLog` (a mesma escrita
 * que qualquer editor de peso já usa).
 *
 * ⚠️ **`weightSource: 'user'` é obrigatório em toda escrita de peso.** Sem a
 * marca, o efeito do `useAutoloadWeight` re-sincroniza o campo com a sugestão
 * do motor e APAGA o que a voz preencheu — foi exatamente o bug "não deixa
 * trocar o peso" de 22/08/2026, e o guard de classe
 * `pesoEditavelComAutoload.test.tsx` varre os 14 renderers cobrando isso. Este
 * hook nasce sob a mesma regra.
 *
 * A voz NUNCA conclui a série (`done` nunca entra no patch) — decisão do
 * dono, registrada em `docs/plans/voz-na-serie.md`. Ela só preenche o que
 * entendeu; concluir continua sendo o toque humano no botão Concluir.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpeechToText } from '@/hooks/useSpeechToText'
import { falaDaSerie } from '@/lib/workout/falaDaSerie'
import { resolverSerieAlvoDaVoz } from '@/lib/workout/serieAlvoDaVoz'
import { rastrearTreino, EVENTOS_TREINO } from '@/lib/workout/telemetriaTreino'
import { isUnilateralByName } from '@/utils/exerciseTracking'
import { coordenadorDeVozUnica } from '@/lib/workout/vozAtivaSingleton'

/**
 * Mesma checagem que `normalSet.tsx` faz (`explicitUnilateral ?? isUnilateralByName`).
 * Pela FONTE (o exercício), não pelo log — a primeira série de um exercício
 * unilateral chega aqui com `prev = {}`, e inferir por `'L_weight' in prev`
 * escreveria `weight` (bilateral) num exercício unilateral vazio.
 */
const exercicioEhUnilateral = (ex: unknown): boolean => {
  if (!ex || typeof ex !== 'object') return false
  const e = ex as Record<string, unknown>
  const explicito = e.isUnilateral ?? e.is_unilateral
  if (explicito != null) return Boolean(explicito)
  return isUnilateralByName(typeof e.name === 'string' ? e.name : null)
}

export interface UseDitadoDaSerieOptions {
  exercises: unknown
  logs: unknown
  exIdx: number
  /**
   * `updateLog` já faz merge com o log anterior (`{ ...prev, ...patch }`,
   * ver `useActiveWorkoutController.ts`) — este hook nunca precisa LER o log,
   * só escrever o que a voz entendeu.
   */
  updateLog: (key: string, patch: unknown) => void
}

export interface ResultadoDoDitado {
  /** Série (1-based) que recebeu o preenchimento, ou null se nada coube. */
  serie: number | null
  entendeu: boolean
}

export interface DitadoDaSerie {
  gravando: boolean
  erro: string
  permissaoNegada: boolean
  /** Última tentativa — para a UI mostrar "entendi: 100 kg, 12 reps" ou "não entendi". */
  ultimoResultado: ResultadoDoDitado | null
  iniciar: () => void
  parar: () => void
}

/** Quanto tempo o resultado ("Preenchi a 2ª série" / "Não entendi") fica visível. */
const JANELA_DO_RESULTADO_MS = 4000

export function useDitadoDaSerie({ exercises, logs, exIdx, updateLog }: UseDitadoDaSerieOptions): DitadoDaSerie {
  const [ultimoResultado, setUltimoResultado] = useState<ResultadoDoDitado | null>(null)
  const limparTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (limparTimerRef.current) clearTimeout(limparTimerRef.current) }
  }, [])

  // O resultado expira sozinho — é confirmação passageira, não estado
  // persistente. Chamado de dentro de `onFinal` (um handler assíncrono do
  // reconhecedor), nunca do corpo de um efeito: `setState` síncrono dentro de
  // efeito é o padrão que o `react-hooks/set-state-in-effect` proíbe.
  const definirResultado = useCallback((r: ResultadoDoDitado) => {
    setUltimoResultado(r)
    if (limparTimerRef.current) clearTimeout(limparTimerRef.current)
    limparTimerRef.current = setTimeout(() => setUltimoResultado(null), JANELA_DO_RESULTADO_MS)
  }, [])

  const onFinal = useCallback((texto: string) => {
    // O ditado terminou — por parada manual ou silêncio — então libera a
    // trava de "só um por vez". Sempre incondicional aqui: onFinal só roda
    // quando ESTE reconhecedor de fato encerrou.
    coordenadorDeVozUnica.finalizar()

    const parsed = falaDaSerie(texto)

    rastrearTreino(EVENTOS_TREINO.vozDaSerie, {
      entendeu: parsed.entendeu,
      temPeso: parsed.pesoKg !== undefined,
      temReps: parsed.reps !== undefined,
      temRpe: parsed.rpe !== undefined,
      temSerieFalada: parsed.serie !== undefined,
    })

    if (!parsed.entendeu) {
      definirResultado({ serie: null, entendeu: false })
      return
    }

    const setIdx = resolverSerieAlvoDaVoz(exercises, logs, exIdx, parsed.serie ?? null)
    if (setIdx === null) {
      definirResultado({ serie: null, entendeu: false })
      return
    }

    const key = `${exIdx}-${setIdx}`
    const patch: Record<string, unknown> = {}
    const exArr = Array.isArray(exercises) ? exercises : []
    // Unilateral: dizer "cem quilos, doze reps" não tem como significar só
    // metade do exercício — vale para os DOIS lados, e o usuário sempre pode
    // corrigir um lado depois digitando por cima. Decidido pela FONTE (o
    // exercício), não pelo log — ver `exercicioEhUnilateral` acima.
    const unilateral = exercicioEhUnilateral(exArr[exIdx])

    if (parsed.pesoKg !== undefined) {
      const pesoTexto = String(parsed.pesoKg).replace('.', ',')
      if (unilateral) { patch.L_weight = pesoTexto; patch.R_weight = pesoTexto }
      else patch.weight = pesoTexto
      patch.weightSource = 'user'
    }
    if (parsed.reps !== undefined) {
      const repsTexto = String(parsed.reps)
      if (unilateral) { patch.L_reps = repsTexto; patch.R_reps = repsTexto }
      else patch.reps = repsTexto
    }
    if (parsed.rpe !== undefined) {
      const rpeTexto = String(parsed.rpe)
      if (unilateral) { patch.L_rpe = rpeTexto; patch.R_rpe = rpeTexto }
      else patch.rpe = rpeTexto
    }

    updateLog(key, patch)
    definirResultado({ serie: setIdx + 1, entendeu: true })
  }, [exercises, logs, exIdx, updateLog, definirResultado])

  const stt = useSpeechToText({ onFinal })

  // Registra ESTA instância como a que está ouvindo agora — se outro card já
  // estava gravando, a chamada anterior é parada primeiro (ver
  // `vozAtivaSingleton.ts`).
  const iniciar = useCallback(() => {
    coordenadorDeVozUnica.iniciar(stt.parar)
    stt.iniciar()
  }, [stt])

  return {
    gravando: stt.gravando,
    erro: stt.erro,
    permissaoNegada: stt.permissaoNegada,
    ultimoResultado,
    iniciar,
    parar: stt.parar,
  }
}
