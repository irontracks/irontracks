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
import { trackUserEvent } from '@/lib/telemetry/userActivity'
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
    const parsed = falaDaSerie(texto)

    rastrearTreino(EVENTOS_TREINO.vozDaSerie, {
      entendeu: parsed.entendeu,
      temPeso: parsed.pesoKg !== undefined,
      temReps: parsed.reps !== undefined,
      temRpe: parsed.rpe !== undefined,
      temSerieFalada: parsed.serie !== undefined,
    })

    /**
     * ⚠️ TEMPORÁRIO, E É O TEXTO QUE A PESSOA FALOU. Remover quando o parser
     * do RPE estiver calibrado.
     *
     * O evento de produto (`vozDaSerie`) não grava conteúdo, por decisão do
     * catálogo (`telemetriaTreino.ts`: "sem PII e sem o conteúdo") — e é por
     * isso que, com o RPE falhando em 3 de 3 tentativas do dono em produção,
     * não havia como saber O QUE o reconhecedor devolveu. Duas rodadas de
     * regex por palpite já falharam; "instrumente, não chute" é a regra deste
     * repo, e a Fase 0 do plano (que existia para medir isto ANTES) foi
     * pulada a pedido do dono.
     *
     * Reusa `voice_capture_sample` — o mesmo evento da ferramenta de
     * calibração (`/dashboard/voice-capture`), fora do catálogo de treino
     * justamente por ser instrumentação descartável. Só o transcript: nenhum
     * dado de treino, de série ou de identificação vai junto.
     */
    trackUserEvent('voice_capture_sample', {
      type: 'debug',
      screen: 'active_workout',
      path: `/_voz-serie/${Date.now()}`,
      metadata: { transcript: texto, origem: 'botao_do_exercicio', entendeuRpe: parsed.rpe !== undefined },
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
    /**
     * "falha" na fala marca o mesmo `log.failure` do botão 🔥 do card.
     *
     * Isto NÃO viola o guard `failureIsManualOnly` — pelo contrário, é
     * exatamente o que ele protege: a flag existe "para o usuário dizer 'esta
     * série AQUI estourou'", e falar "falha" É o usuário dizendo isso. O que o
     * guard proíbe é o APP deduzir a falha do método (Heavy Duty e Repetições
     * Forçadas vão à falha por definição e não gravam, senão a carga deles
     * congelaria para sempre no `topWeight`).
     *
     * Nunca grava `false`: ver a nota sobre negação em `falaDaSerie.ts`.
     */
    if (parsed.falha) patch.failure = true

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

  /**
   * Libera a trava de "só um por vez" quando a gravação PARA — por QUALQUER
   * motivo, não só ao terminar com sucesso.
   *
   * ⚠️ A versão anterior liberava só dentro de `onFinal`. `useSpeechToText`
   * chama `onFinal` no encerramento normal (resultado ou silêncio), mas um
   * ERRO do reconhecedor nativo (`rec.onerror` — "Recognition request was
   * canceled" é um dos mais comuns no iOS) chama só `setErro`/`setGravando(false)`,
   * NUNCA `onFinal`. A trava ficava presa apontando para um reconhecedor já
   * morto, e a PRÓXIMA tentativa (nesta série ou em outra) tentava parar uma
   * instância que já não existia — achado ao investigar um relato real do
   * dono em produção (19/09/2026).
   */
  const gravandoAntesRef = useRef(false)
  useEffect(() => {
    if (gravandoAntesRef.current && !stt.gravando) {
      coordenadorDeVozUnica.finalizar()
      if (stt.erro) {
        rastrearTreino(EVENTOS_TREINO.vozDaSerie, { entendeu: false, erroReconhecimento: true })
      }
    }
    gravandoAntesRef.current = stt.gravando
  }, [stt.gravando, stt.erro])

  return {
    gravando: stt.gravando,
    erro: stt.erro,
    permissaoNegada: stt.permissaoNegada,
    ultimoResultado,
    iniciar,
    parar: stt.parar,
  }
}
