import { isRecord } from '@/utils/guards'

/**
 * "É cardio?" — fonte única.
 *
 * Antes havia DUAS heurísticas divergentes: `pacing.ts` (regex no nome, pra
 * duração) e `cardioKcal.ts` (set fechado dos 7 tipos do editor, pra calorias).
 * Um exercício sem o campo `type` podia contar como cardio numa e não na outra —
 * duração e calorias discordavam. Aqui a regra é única.
 *
 * O sinal confiável é `type`/`method === 'cardio'` (o editor sempre grava isso ao
 * escolher um tipo de cardio). O casamento por nome é só fallback pra dados
 * legados/sem type, e é SUPERSET das duas heurísticas antigas — cobre os 7 tipos
 * do editor (Escada, Esteira, Bicicleta, Bike Outdoor, Corrida, Caminhada,
 * Elíptico) e os termos que o pacing já reconhecia — então nada que era cardio
 * antes deixa de ser.
 */
const norm = (v: unknown): string =>
  String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const CARDIO_NAME_RE = /cardio|corrida|caminh|esteira|escada|elipt|bike|bici|cicl|run/

export function isCardioExercise(ex: unknown): boolean {
  const e = isRecord(ex) ? ex : {}
  if (norm(e.type) === 'cardio' || norm(e.method) === 'cardio') return true
  return CARDIO_NAME_RE.test(norm(e.name))
}
