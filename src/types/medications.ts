/**
 * Tipos da funcionalidade de medicamentos (lembrete push + "Tomei").
 *
 * Espelham as linhas do banco (`medications` e `medication_intakes`). A lógica de
 * agenda NÃO lê estes tipos direto: ela recebe o subconjunto que precisa
 * (`MedicamentoAgendavel` em `lib/medications/agenda.ts`), para ser testável sem
 * montar uma linha inteira.
 */

/** Linha de `public.medications`. */
export type Medication = {
  id: string
  user_id: string
  name: string
  /** Texto livre ("50 mg", "1 comprimido"). Null = não informada. */
  dose: string | null
  /** `HH:MM` em BRT, 1–8 itens, ordenados. */
  times: string[]
  /** 0 = domingo … 6 = sábado. */
  weekdays: number[]
  /** `YYYY-MM-DD` (dia BRT), inclusivo. */
  start_date: string
  /** `YYYY-MM-DD` (dia BRT), inclusivo. Null = sem fim. */
  end_date: string | null
  notes: string | null
  /** false = pausado: não gera lembrete nem aparece em "Hoje". */
  active: boolean
  /** Quem criou/editou — o aluno ou o professor vinculado. Null se a conta saiu. */
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/** Linha de `public.medication_intakes` — UMA dose tomada num dia e horário. */
export type MedicationIntake = {
  id: string
  medication_id: string
  user_id: string
  /** `YYYY-MM-DD` (dia BRT) da dose, não do instante em que foi marcada. */
  date: string
  /** `HH:MM` da dose que foi tomada (um dos `times` do remédio). */
  scheduled_time: string
  taken_at: string
  /** Quem registrou. Hoje só o aluno marca "Tomei". */
  recorded_by: string | null
}
