'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logWarnRemote } from '@/lib/logger'
import { dosesDoDia, type DoseDoDia } from '@/lib/medications/agenda'
import type { MedicationInput, MedicationPatch } from '@/schemas/medications'
import type { Medication, MedicationIntake } from '@/types/medications'
import { brtDateKey } from '@/utils/cron/dateBrt'

/**
 * Medicamentos do aluno: lista, doses de hoje e o "Tomei".
 *
 * "Tomei" e "Desfazer" são OTIMISTAS — o toque tem de responder na hora, a
 * pessoa está com o remédio na mão — e REVERTEM se a gravação falhar. Sem a
 * reversão a tela diria "Tomado às 08:03" para uma dose que o servidor não tem,
 * e o professor leria a adesão errada.
 *
 * ⚠️ `fetch` só rejeita em falha de REDE: 403, 409 e 500 resolvem normalmente.
 * Por isso nada aqui trata resposta resolvida como sucesso — vale `res.ok` E o
 * `ok` do JSON (contrato em docs/plans/medicamentos.md).
 */

type Resultado<T> = { ok: true; dados: T } | { ok: false; status: number; codigo: string | null }

type CorpoDaLista = {
  medications?: Medication[]
  intakes?: MedicationIntake[]
  today?: string
  hasCoach?: boolean
}

const MENSAGENS: Record<string, string> = {
  limite_atingido: 'Você chegou ao limite de 30 medicamentos. Exclua um para adicionar outro.',
  dia_virou: 'O dia virou. Atualizamos a lista.',
}

const MENSAGEM_PADRAO = 'Não foi possível salvar agora. Tente de novo.'

const mensagemDoErro = (codigo: string | null): string =>
  (codigo && MENSAGENS[codigo]) || MENSAGEM_PADRAO

/** Uma chamada à API que NUNCA lança: rede caída e resposta ruim viram `ok: false`. */
async function chamar<T extends { ok?: boolean; error?: string }>(
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Resultado<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let json: T | null = null
    try {
      json = (await res.json()) as T
    } catch {
      json = null
    }
    if (!res.ok || !json || json.ok !== true) {
      return { ok: false, status: res.status, codigo: json?.error ?? null }
    }
    return { ok: true, dados: json }
  } catch {
    return { ok: false, status: 0, codigo: null }
  }
}

const chaveDaTomada = (medicationId: string, time: string) => `${medicationId}|${time}`

export type UseMedications = {
  medications: Medication[]
  /** Tomadas de HOJE (dia BRT). */
  intakes: MedicationIntake[]
  /** `YYYY-MM-DD` do dia BRT que o servidor considera "hoje". */
  today: string
  hasCoach: boolean
  loading: boolean
  error: string | null
  doses: DoseDoDia[]
  create: (input: MedicationInput) => Promise<boolean>
  update: (id: string, patch: MedicationPatch) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  markTaken: (medicationId: string, time: string) => Promise<boolean>
  undoTaken: (medicationId: string, time: string) => Promise<boolean>
  reload: () => Promise<void>
}

export function useMedications(): UseMedications {
  const [medications, setMedications] = useState<Medication[]>([])
  const [intakes, setIntakes] = useState<MedicationIntake[]>([])
  const [today, setToday] = useState<string>(() => brtDateKey())
  const [hasCoach, setHasCoach] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // `intakes` lido de dentro dos handlers sem recriá-los a cada tecla.
  const intakesRef = useRef<MedicationIntake[]>([])
  const todayRef = useRef(today)
  const vivoRef = useRef(true)
  useEffect(() => {
    intakesRef.current = intakes
    todayRef.current = today
  })
  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
    }
  }, [])

  const aplicarLista = useCallback((r: Resultado<CorpoDaLista & { ok?: boolean; error?: string }>) => {
    if (!vivoRef.current) return
    if (!r.ok) {
      logWarnRemote('medications.load', 'falha ao carregar medicamentos', { status: r.status, codigo: r.codigo })
      setError('Não foi possível carregar seus medicamentos.')
      setLoading(false)
      return
    }
    setMedications(Array.isArray(r.dados.medications) ? r.dados.medications : [])
    setIntakes(Array.isArray(r.dados.intakes) ? r.dados.intakes : [])
    if (typeof r.dados.today === 'string' && r.dados.today) setToday(r.dados.today)
    setHasCoach(r.dados.hasCoach === true)
    setError(null)
    setLoading(false)
  }, [])

  const reload = useCallback(async () => {
    aplicarLista(await chamar<CorpoDaLista & { ok?: boolean; error?: string }>('/api/medications', 'GET'))
  }, [aplicarLista])

  // Carga inicial: o setState acontece no `.then`, nunca no corpo do efeito.
  useEffect(() => {
    void chamar<CorpoDaLista & { ok?: boolean; error?: string }>('/api/medications', 'GET').then(aplicarLista)
  }, [aplicarLista])

  const falhou = useCallback((contexto: string, r: { status: number; codigo: string | null }) => {
    logWarnRemote(contexto, 'requisição recusada', { status: r.status, codigo: r.codigo })
    if (vivoRef.current) setError(mensagemDoErro(r.codigo))
  }, [])

  const create = useCallback(
    async (input: MedicationInput): Promise<boolean> => {
      const r = await chamar<{ ok?: boolean; error?: string; medication?: Medication }>(
        '/api/medications',
        'POST',
        input,
      )
      if (!r.ok || !r.dados.medication) {
        falhou('medications.create', r.ok ? { status: 200, codigo: null } : r)
        return false
      }
      const criado = r.dados.medication
      if (vivoRef.current) {
        setMedications((atual) => [...atual.filter((m) => m.id !== criado.id), criado])
        setError(null)
      }
      return true
    },
    [falhou],
  )

  const update = useCallback(
    async (id: string, patch: MedicationPatch): Promise<boolean> => {
      const r = await chamar<{ ok?: boolean; error?: string; medication?: Medication }>(
        '/api/medications',
        'PATCH',
        { id, ...patch },
      )
      if (!r.ok || !r.dados.medication) {
        falhou('medications.update', r.ok ? { status: 200, codigo: null } : r)
        return false
      }
      const novo = r.dados.medication
      if (vivoRef.current) {
        setMedications((atual) => atual.map((m) => (m.id === novo.id ? novo : m)))
        setError(null)
      }
      return true
    },
    [falhou],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const r = await chamar<{ ok?: boolean; error?: string }>('/api/medications', 'DELETE', { id })
      if (!r.ok) {
        falhou('medications.delete', r)
        return false
      }
      if (vivoRef.current) {
        setMedications((atual) => atual.filter((m) => m.id !== id))
        // As tomadas caem em cascata no banco; a tela acompanha.
        setIntakes((atual) => atual.filter((t) => t.medication_id !== id))
        setError(null)
      }
      return true
    },
    [falhou],
  )

  const markTaken = useCallback(
    async (medicationId: string, time: string): Promise<boolean> => {
      const dateKey = todayRef.current
      const chave = chaveDaTomada(medicationId, time)
      if (intakesRef.current.some((t) => chaveDaTomada(t.medication_id, t.scheduled_time) === chave)) {
        return true
      }

      const provisoria: MedicationIntake = {
        id: `otimista:${chave}`,
        medication_id: medicationId,
        user_id: '',
        date: dateKey,
        scheduled_time: time,
        taken_at: new Date().toISOString(),
        recorded_by: null,
      }
      setIntakes((atual) => [...atual, provisoria])

      const r = await chamar<{ ok?: boolean; error?: string; intake?: MedicationIntake }>(
        '/api/medications/intakes',
        'POST',
        { medicationId, time, dateKey },
      )

      if (!r.ok) {
        if (vivoRef.current) {
          // Reverte SÓ a marca provisória — não a de uma resposta que já chegou.
          setIntakes((atual) => atual.filter((t) => t.id !== provisoria.id))
        }
        falhou('medications.take', r)
        if (r.status === 409 && r.codigo === 'dia_virou') await reload()
        return false
      }

      const gravada = r.dados.intake
      if (vivoRef.current && gravada) {
        setIntakes((atual) => atual.map((t) => (t.id === provisoria.id ? gravada : t)))
      }
      if (vivoRef.current) setError(null)
      return true
    },
    [falhou, reload],
  )

  const undoTaken = useCallback(
    async (medicationId: string, time: string): Promise<boolean> => {
      const dateKey = todayRef.current
      const chave = chaveDaTomada(medicationId, time)
      const removida = intakesRef.current.find(
        (t) => chaveDaTomada(t.medication_id, t.scheduled_time) === chave,
      )
      if (!removida) return true

      setIntakes((atual) => atual.filter((t) => t.id !== removida.id))

      const r = await chamar<{ ok?: boolean; error?: string }>('/api/medications/intakes', 'DELETE', {
        medicationId,
        time,
        dateKey,
      })

      if (!r.ok) {
        if (vivoRef.current) {
          setIntakes((atual) => (atual.some((t) => t.id === removida.id) ? atual : [...atual, removida]))
        }
        falhou('medications.undo', r)
        if (r.status === 409 && r.codigo === 'dia_virou') await reload()
        return false
      }
      if (vivoRef.current) setError(null)
      return true
    },
    [falhou, reload],
  )

  const doses = useMemo(() => dosesDoDia(medications, intakes, today), [medications, intakes, today])

  return {
    medications,
    intakes,
    today,
    hasCoach,
    loading,
    error,
    doses,
    create,
    update,
    remove,
    markTaken,
    undoTaken,
    reload,
  }
}
