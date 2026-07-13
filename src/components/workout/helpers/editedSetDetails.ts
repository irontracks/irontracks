import type { UnknownRecord } from '@/types/app'

const isObj = (v: unknown): v is UnknownRecord =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Config avançada (drop/cluster/…) de um setDetail, sob qualquer das duas chaves. */
export const advancedConfigOf = (sd: unknown): unknown =>
  isObj(sd) ? (sd.advanced_config ?? sd.advancedConfig ?? null) : null

/**
 * Reconstrói os setDetails ao editar um exercício mid-sessão, tratando dois bugs
 * da auditoria de métodos avançados:
 *
 *  - **Troca de método** (`methodChanged`): limpa o `advanced_config` de cada
 *    setDetail existente. Sem isso, trocar Cluster/Drop → Normal deixava a config
 *    antiga no plano e o card seguia renderizando o método antigo (fantasma).
 *
 *  - **Aumentar o nº de séries com o mesmo método**: a(s) série(s) nova(s) HERDAM
 *    o `advanced_config` da última série existente (reps zeradas) — consistente com
 *    o botão "+ série" do card. Antes recebiam `advanced_config: null` e viravam
 *    Normal (drop-set de 3→4 séries deixava a 4ª Normal).
 *
 * Não toca em logs executados (weight/reps já registrados) — só no plano.
 */
export function editedSetDetails(
  sdArr: unknown[],
  desiredSets: number,
  methodChanged: boolean,
): UnknownRecord[] {
  const lastCfg = sdArr.length > 0 ? advancedConfigOf(sdArr[sdArr.length - 1]) : null
  const inheritCfg: unknown = !methodChanged && Array.isArray(lastCfg)
    ? (lastCfg as unknown[]).map((s) => (isObj(s) ? { ...s, reps: '' } : s))
    : null

  const out: UnknownRecord[] = []
  for (let i = 0; i < desiredSets; i += 1) {
    const cur = isObj(sdArr[i]) ? (sdArr[i] as UnknownRecord) : null
    const setNumber = i + 1
    if (cur) {
      const nextSetNumber = Number(cur.set_number ?? cur.setNumber ?? setNumber) || setNumber
      const base = methodChanged ? { ...cur, advanced_config: null, advancedConfig: null } : cur
      out.push({ ...base, set_number: nextSetNumber })
    } else {
      out.push({
        set_number: setNumber,
        weight: null,
        reps: '',
        rpe: null,
        notes: null,
        is_warmup: false,
        advanced_config: inheritCfg,
      })
    }
  }
  return out
}
