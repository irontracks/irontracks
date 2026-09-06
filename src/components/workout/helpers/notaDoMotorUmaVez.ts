/**
 * A explicação do motor de carga (🧠 "Última vez: 84kg × 9.5 @RPE10 — mantém
 * 84kg…") aparece UMA vez por exercício, na primeira série ainda pendente.
 *
 * Até 06/09/2026 ela era repetida em cada série — três ou quatro cópias do mesmo
 * texto, uma embaixo da outra, no card mais importante do app. É a regra escrita
 * em `docs/DESIGN_HIERARCHY.md` ("um fato aparece uma vez") sendo violada onde
 * mais custa. A sugestão é POR EXERCÍCIO (`useWorkoutAutoload` grava o mesmo
 * rationale em todas as séries), então a explicação pertence ao exercício; as
 * séries seguintes continuam com o campo violeta, que já diz "a máquina decidiu".
 *
 * "Primeira pendente", e não "série 0": quando a 1ª é concluída a nota some dela
 * (`isAutoWeight` exige `!done`) e precisa reaparecer na 2ª — o atleta ainda
 * tem o mesmo peso para montar.
 */
export function isPrimeiraSeriePendente(
  getLog: (key: string) => Record<string, unknown> | null | undefined,
  exIdx: number,
  setIdx: number,
): boolean {
  if (!Number.isInteger(setIdx) || setIdx < 0) return false
  for (let i = 0; i < setIdx; i++) {
    const log = getLog(`${exIdx}-${i}`)
    if (!(log && log.done === true)) return false
  }
  return true
}
