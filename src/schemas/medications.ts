import { z } from 'zod'
import { normalizarHorario } from '@/lib/nutrition/mealTimes'
import { brtDateKey } from '@/utils/cron/dateBrt'

/** Horários por remédio. Mais que isso deixa de ser lembrete e vira ruído. */
export const MAX_HORARIOS_POR_MEDICAMENTO = 8
/** Remédios por usuário (ativos + pausados). Mesmo teto no núcleo e no Zod. */
export const MAX_MEDICAMENTOS_POR_USUARIO = 30

const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6] as const

/**
 * `YYYY-MM-DD` que EXISTE no calendário. Só o formato não basta: "2026-02-31"
 * passa na regex e o Postgres recusaria na escrita com um erro cru para o usuário.
 * A conferência vai por ida e volta em UTC — nunca por fuso local.
 */
const dataValida = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const campoData = z.string().refine(dataValida, 'Data inválida (use AAAA-MM-DD).')

const campoNome = z.string().trim().min(1, 'Informe o nome.').max(80)

/**
 * Dose vazia vira null: o formulário manda `''` quando o campo fica em branco, e
 * gravar string vazia faria o push dizer "Losartana · " com a ponta solta.
 * `undefined` continua `undefined` — no PATCH, "não mandei" não pode virar "apague".
 */
const campoDose = z
  .string()
  .trim()
  .max(60)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null))

const campoNotas = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null))

/**
 * Horários: cada item passa por `normalizarHorario` ("8:00" → "08:00"), os
 * inválidos são DESCARTADOS, repetidos colapsam e o resultado sai ordenado.
 * Ordenar string `HH:MM` é ordenar por hora, porque o formato tem largura fixa.
 *
 * ⚠️ O teto de 8 vale DEPOIS de normalizar e deduplicar — "8:00" e "08:00" são o
 * mesmo horário e não podem gastar duas vagas. O teto cru (32) só barra payload
 * abusivo antes do trabalho.
 */
const campoHorarios = z
  .array(z.unknown())
  .max(MAX_HORARIOS_POR_MEDICAMENTO * 4)
  .transform((itens) => {
    const normalizados = itens.map((t) => normalizarHorario(t)).filter(Boolean)
    return Array.from(new Set(normalizados)).sort()
  })
  .pipe(
    z
      .array(z.string())
      .min(1, 'Informe ao menos um horário válido (HH:MM).')
      .max(MAX_HORARIOS_POR_MEDICAMENTO),
  )

/** 0 = domingo … 6 = sábado, sem repetição, ordenados. */
const diasDaSemana = z
  .array(z.number().int().min(0).max(6))
  .max(14)
  .transform((dias) => Array.from(new Set(dias)).sort((a, b) => a - b))
  .pipe(z.array(z.number().int()).min(1, 'Escolha ao menos um dia.').max(7))

const campoDiasComDefault = z
  .array(z.number().int().min(0).max(6))
  .max(14)
  .default([...TODOS_OS_DIAS])
  .transform((dias) => Array.from(new Set(dias)).sort((a, b) => a - b))
  .pipe(z.array(z.number().int()).min(1, 'Escolha ao menos um dia.').max(7))

/** Fim antes do início é remédio que nunca vale — recusar na entrada. */
const FIM_DEPOIS_DO_INICIO = {
  message: 'A data final não pode ser anterior à inicial.',
  path: ['endDate'],
}

export const MedicationInputSchema = z
  .object({
    name: campoNome,
    dose: campoDose.transform((v) => v ?? null),
    times: campoHorarios,
    weekdays: campoDiasComDefault,
    // Sem início informado, vale hoje (BRT) — o mesmo default da coluna no banco.
    startDate: campoData.default(() => brtDateKey()),
    endDate: campoData.nullable().optional().transform((v) => v ?? null),
    notes: campoNotas.transform((v) => v ?? null),
    active: z.boolean().default(true),
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, FIM_DEPOIS_DO_INICIO)

/**
 * Edição parcial: só o que veio muda. Sem defaults — um default aqui apagaria, em
 * silêncio, o que o usuário não tocou (ex.: `weekdays` voltando a "todos os dias").
 */
export const MedicationPatchSchema = z
  .object({
    name: campoNome.optional(),
    dose: campoDose,
    times: campoHorarios.optional(),
    weekdays: diasDaSemana.optional(),
    startDate: campoData.optional(),
    endDate: campoData.nullable().optional(),
    notes: campoNotas,
    active: z.boolean().optional(),
  })
  .refine(
    // Só dá para conferir quando os DOIS vieram; o núcleo confere contra a linha
    // gravada quando vem só um.
    (v) => v.startDate === undefined || !v.endDate || v.endDate >= v.startDate,
    FIM_DEPOIS_DO_INICIO,
  )

export type MedicationInput = z.infer<typeof MedicationInputSchema>
export type MedicationPatch = z.infer<typeof MedicationPatchSchema>
