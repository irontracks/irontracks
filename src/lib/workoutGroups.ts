/**
 * workoutGroups.ts
 *
 * Detecta grupos de exercícios encadeados (Bi-Set, Super-Set, Tri-Set, etc.)
 * a partir de exercícios CONSECUTIVOS que compartilham o mesmo método de grupo.
 * Sem mudança de schema — a relação é inferida puramente pela ordem + método.
 *
 * Usado para (1) ligar visualmente os cards no ExerciseList e (2) alternar
 * automaticamente entre os exercícios do grupo conforme as séries são concluídas.
 */

export const GROUP_METHODS = [
  'Bi-Set',
  'Super-Set',
  'Tri-Set',
  'Giant-Set',
  'Pré-exaustão',
  'Pós-exaustão',
] as const;

const GROUP_METHOD_SET = new Set<string>(GROUP_METHODS);

export interface ExerciseGroupInfo {
  /** Índices (no array original) dos exercícios que compõem este grupo. */
  members: number[];
  /** Posição deste exercício dentro de `members` (0 = primeiro). */
  position: number;
  /** Método do grupo (ex.: "Bi-Set"). */
  method: string;
  /** Quantidade de exercícios no grupo. */
  size: number;
}

function methodOf(ex: unknown): string {
  if (!ex || typeof ex !== 'object') return '';
  const m = (ex as Record<string, unknown>).method;
  return typeof m === 'string' ? m.trim() : '';
}

/**
 * Constrói um mapa `exIdx -> ExerciseGroupInfo` apenas para exercícios que
 * fazem parte de um grupo (runs consecutivos de mesmo método, tamanho >= 2).
 * Exercícios solo — inclusive um método de grupo isolado — ficam de fora.
 */
export function buildExerciseGroups(exercises: unknown[]): Map<number, ExerciseGroupInfo> {
  const map = new Map<number, ExerciseGroupInfo>();
  const arr = Array.isArray(exercises) ? exercises : [];

  let i = 0;
  while (i < arr.length) {
    const method = methodOf(arr[i]);
    if (!GROUP_METHOD_SET.has(method)) {
      i += 1;
      continue;
    }
    // Coleta o run consecutivo com o mesmo método
    let j = i;
    while (j < arr.length && methodOf(arr[j]) === method) j += 1;
    const members: number[] = [];
    for (let k = i; k < j; k += 1) members.push(k);

    if (members.length >= 2) {
      members.forEach((exIdx, position) => {
        map.set(exIdx, { members, position, method, size: members.length });
      });
    }
    i = j;
  }

  return map;
}
