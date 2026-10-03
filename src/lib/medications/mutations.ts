/**
 * mutations — o núcleo de leitura/escrita de medicamentos, compartilhado pela rota
 * do ALUNO e (num bloco futuro) pela do PROFESSOR.
 *
 * Todas as funções recebem o client da SESSÃO (RLS decide linha a linha) e o
 * `userId` DONO dos dados. O núcleo nunca confia só na RLS: toda leitura/escrita de
 * uma linha existente leva `.eq('user_id', userId)` — o professor tem policy para
 * escrever em qualquer aluno vinculado, e sem o filtro um `id` de outro aluno
 * (do mesmo professor) passaria por esta função apontando para a pessoa errada.
 *
 * ⚠️ O supabase-js NÃO lança em erro de escrita — devolve `{ error }`. Por isso
 * TODA chamada abaixo destrutura e confere o `error`, e o núcleo devolve um
 * resultado discriminado em vez de lançar: quem chama decide o status HTTP. Um
 * `insert` sem checagem faria a rota responder 200 com a linha nunca gravada.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medication, MedicationIntake } from '@/types/medications'
import {
  MAX_MEDICAMENTOS_POR_USUARIO,
  type MedicationInput,
  type MedicationPatch,
} from '@/schemas/medications'

export type CodigoDeFalha = 'limite_atingido' | 'nao_encontrado' | 'datas_invalidas' | 'database_error'

export type ResultadoMed<T> =
  | { ok: true; data: T }
  | { ok: false; code: CodigoDeFalha; error?: unknown }

const falhaDoBanco = (error: unknown): { ok: false; code: 'database_error'; error: unknown } => ({
  ok: false,
  code: 'database_error',
  error,
})

export async function listMedicationsCore(
  client: SupabaseClient,
  userId: string,
): Promise<ResultadoMed<Medication[]>> {
  const { data, error } = await client
    .from('medications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) return falhaDoBanco(error)
  return { ok: true, data: (data ?? []) as Medication[] }
}

export async function createMedicationCore(
  client: SupabaseClient,
  userId: string,
  input: MedicationInput,
  actorId: string,
): Promise<ResultadoMed<Medication>> {
  // Teto por usuário (ativos + pausados). Duas criações simultâneas podem passar
  // juntas pelo teto — aceitável: é limite de ruído, não de segurança.
  const { count, error: countError } = await client
    .from('medications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (countError) return falhaDoBanco(countError)
  if ((count ?? 0) >= MAX_MEDICAMENTOS_POR_USUARIO) return { ok: false, code: 'limite_atingido' }

  const { data, error } = await client
    .from('medications')
    .insert({
      user_id: userId,
      name: input.name,
      dose: input.dose,
      times: input.times,
      weekdays: input.weekdays,
      start_date: input.startDate,
      end_date: input.endDate,
      notes: input.notes,
      active: input.active,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*')
    .single()
  if (error) return falhaDoBanco(error)
  if (!data) return falhaDoBanco(new Error('medications insert sem linha de retorno'))
  return { ok: true, data: data as Medication }
}

export async function updateMedicationCore(
  client: SupabaseClient,
  userId: string,
  id: string,
  patch: MedicationPatch,
  actorId: string,
): Promise<ResultadoMed<Medication>> {
  const { data: atual, error: readError } = await client
    .from('medications')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (readError) return falhaDoBanco(readError)
  if (!atual) return { ok: false, code: 'nao_encontrado' }
  const linha = atual as Medication

  // O Zod só confere início × fim quando os DOIS vieram no patch. Mudar só um dos
  // dois contra o que está gravado é conferido aqui — o CHECK do banco recusaria
  // com um erro cru, e o usuário veria "erro de banco" em vez do motivo.
  const inicio = patch.startDate ?? linha.start_date
  const fim = patch.endDate !== undefined ? patch.endDate : linha.end_date
  if (fim && fim < inicio) return { ok: false, code: 'datas_invalidas' }

  // Só o que veio muda: `undefined` é "não mexi", `null` é "apague".
  const colunas: Record<string, unknown> = { updated_by: actorId }
  if (patch.name !== undefined) colunas.name = patch.name
  if (patch.dose !== undefined) colunas.dose = patch.dose
  if (patch.times !== undefined) colunas.times = patch.times
  if (patch.weekdays !== undefined) colunas.weekdays = patch.weekdays
  if (patch.startDate !== undefined) colunas.start_date = patch.startDate
  if (patch.endDate !== undefined) colunas.end_date = patch.endDate
  if (patch.notes !== undefined) colunas.notes = patch.notes
  if (patch.active !== undefined) colunas.active = patch.active

  const { data, error } = await client
    .from('medications')
    .update(colunas)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()
  if (error) return falhaDoBanco(error)
  // Linha sumiu entre a leitura e a escrita (ou a RLS barrou): não é sucesso.
  if (!data) return { ok: false, code: 'nao_encontrado' }
  return { ok: true, data: data as Medication }
}

export async function deleteMedicationCore(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<ResultadoMed<null>> {
  const { data, error } = await client
    .from('medications')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
  if (error) return falhaDoBanco(error)
  // Zero linhas = id inexistente OU de outra pessoa; os dois são "não encontrado".
  if (!Array.isArray(data) || data.length === 0) return { ok: false, code: 'nao_encontrado' }
  return { ok: true, data: null }
}

/** Tomadas no intervalo de dias BRT, INCLUSIVO nas duas pontas (`YYYY-MM-DD`). */
export async function listIntakesCore(
  client: SupabaseClient,
  userId: string,
  fromKey: string,
  toKey: string,
): Promise<ResultadoMed<MedicationIntake[]>> {
  const { data, error } = await client
    .from('medication_intakes')
    .select('*')
    .eq('user_id', userId)
    .gte('date', fromKey)
    .lte('date', toKey)
    .order('date', { ascending: true })
    .order('scheduled_time', { ascending: true })
  if (error) return falhaDoBanco(error)
  return { ok: true, data: (data ?? []) as MedicationIntake[] }
}
