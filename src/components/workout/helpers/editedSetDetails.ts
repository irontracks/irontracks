import type { UnknownRecord } from '@/types/app'

const isObj = (v: unknown): v is UnknownRecord =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Config avançada (drop/cluster/…) de um setDetail, sob qualquer das duas chaves. */
export const advancedConfigOf = (sd: unknown): unknown =>
  isObj(sd) ? (sd.advanced_config ?? sd.advancedConfig ?? null) : null

/**
 * Chaves de dados EXECUTADOS de método num log de série. Ao trocar o método do
 * exercício, precisam sair — senão o método antigo persiste no render/relatório
 * mesmo depois de já ter feito uma série (ex.: log.fst7 renderiza FST-7 após a
 * troca pra Normal). `per_set_method` (override por série) também sai, pra a troca
 * do método do exercício ser um reset limpo.
 */
export const METHOD_LOG_BLOB_KEYS = [
  'drop_set', 'stripping', 'cluster', 'fst7', 'heavy_duty', 'ponto_zero',
  'forced_reps', 'negative_reps', 'partial_reps', 'sistema21', 'wave', 'rest_pause',
  'per_set_method',
] as const

/** Remove os blobs de método de um log, preservando weight/reps/done/set_type. */
export const stripMethodBlobs = (log: unknown): unknown => {
  if (!isObj(log)) return log
  let changed = false
  const out: UnknownRecord = { ...log }
  for (const k of METHOD_LOG_BLOB_KEYS) {
    if (k in out) { delete out[k]; changed = true }
  }
  return changed ? out : log
}

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
