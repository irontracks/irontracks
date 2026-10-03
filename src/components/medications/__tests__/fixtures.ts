import { vi } from 'vitest'
import type { Medication, MedicationIntake } from '@/types/medications'

/** Remédio com tudo preenchido — cada teste sobrescreve só o que importa. */
export const remedio = (extra: Partial<Medication> = {}): Medication => ({
  id: 'm1',
  user_id: 'u1',
  name: 'Losartana',
  dose: '50 mg',
  times: ['08:00'],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-01-01',
  end_date: null,
  notes: null,
  active: true,
  created_by: 'u1',
  updated_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...extra,
})

export const tomada = (extra: Partial<MedicationIntake> = {}): MedicationIntake => ({
  id: 'i1',
  medication_id: 'm1',
  user_id: 'u1',
  date: '2026-10-03',
  scheduled_time: '08:00',
  taken_at: '2026-10-03T11:03:00Z', // 08:03 em BRT
  recorded_by: 'u1',
  ...extra,
})

type Resposta = { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>
type Rotas = Record<string, Resposta | (() => Resposta)>

/**
 * `fetch` falso por "MÉTODO url". Devolve o mock para conferir as chamadas.
 * Rota sem resposta cadastrada falha o teste — nada de 200 implícito.
 */
export function instalarFetch(rotas: Rotas) {
  const mock = vi.fn(async (url: string, init?: { method?: string }) => {
    const chave = `${init?.method ?? 'GET'} ${url}`
    const r = rotas[chave]
    if (r === undefined) throw new Error(`fetch sem rota: ${chave}`)
    const { status = 200, body } = await (typeof r === 'function' ? r() : r)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export const listaDe = (over: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    ok: true,
    medications: [remedio()],
    intakes: [] as MedicationIntake[],
    today: '2026-10-03',
    hasCoach: false,
    ...over,
  },
})
