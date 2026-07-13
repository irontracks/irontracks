import { parseTrainingNumber } from '../trainingNumber'
import { safeString } from '@/utils/guards'
import { stripDiacritics } from '@/utils/normalizeExerciseName'

const normalize = (v: unknown): string => {
  const s = safeString(v)
  if (!s) return ''
  try {
    return stripDiacritics(s)
      .toLowerCase()
      .replace(/[()]/g, ' ')
      .replace(/[–—]/g, '-')
      .replace(/[›»→]/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return s.toLowerCase().replace(/\s+/g, ' ').trim()
  }
}

const hashString = (input: unknown): string => {
  const str = safeString(input)
  let h = 5381
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}

const range = (count: number): number[] => Array.from({ length: Math.max(0, count) }).map((_, i) => i)

interface ParseTargetIndicesInput {
  head: string
  setsCount: number
  defaultTarget: string
}

const parseTargetIndices = ({ head, setsCount, defaultTarget }: ParseTargetIndicesInput): number[] => {
  const s = normalize(head)
  const nSets = Math.max(0, Math.floor(Number(setsCount) || 0))
  if (!nSets) return []

  if (s.includes('em todas') || s.includes('todas as series') || s.includes('todas series')) return range(nSets)

  const lastN = (() => {
    const m = s.match(/\bna?s?\s+(\d+)\s+ultim/)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 ? Math.min(nSets, Math.floor(n)) : null
  })()
  if (lastN) return range(lastN).map((i) => nSets - lastN + i).filter((i) => i >= 0 && i < nSets)

  if (s.includes('na ultima') || s.includes('na ultima serie') || s.includes('na ultima.')) return [nSets - 1]
  if (s.includes('na primeira') || s.includes('na 1a') || s.includes('na 1ª')) return [0]

  const nth = (() => {
    const m = s.match(/\bna\s+(\d+)(?:a|ª)?\b/)
    if (!m) return null
    const n = Number(m[1])
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.floor(n) - 1
  })()
  if (nth != null) return nth >= 0 && nth < nSets ? [nth] : []

  if (defaultTarget === 'all') return range(nSets)
  return [nSets - 1]
}

const splitDirectives = (notes: unknown): string[] => {
  const raw = safeString(notes)
  if (!raw) return []
  return raw
    .split(/\n|;/)
    .map((p) => safeString(p))
    .filter(Boolean)
}

const parseSteps = (pattern: unknown): string[] => {
  const raw = normalize(pattern)
  if (!raw) return []
  // "→"/"»"/"›" já viraram ">" no normalize. Se não houver ">", usa vírgula como
  // separador de etapas (descrições naturais: "até a falha, reduz 20%, continua").
  const sep = raw.includes('>') ? '>' : ','
  return raw
    .split(sep)
    .map((p) => safeString(p))
    .map((p) => normalize(p))
    .filter(Boolean)
}

const parseFirstNumber = (text: unknown): number | null => {
  const s = normalize(text)
  if (!s) return null
  const m = s.match(/(-?\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const n = parseTrainingNumber(m[1])
  return Number.isFinite(n) ? n : null
}

const isTimeToken = (p: unknown): boolean => {
  const s = normalize(p)
  if (!s) return false
  if (s.includes('seg') || s.includes('sec')) return true
  if (/\b\d+(?:[.,]\d+)?\s*s\b/.test(s)) return true
  if (/\b\d+(?:[.,]\d+)?s\b/.test(s)) return true
  return false
}

const parseCluster = (pattern: unknown) => {
  const steps = parseSteps(pattern)
  if (!steps.length) return null
  const blocks: unknown[] = [];
  const rests: unknown[] = [];
  steps.forEach((p) => {
    const n = parseFirstNumber(p)
    if (n == null || n <= 0) return
    if (p.includes('rep') || (!isTimeToken(p) && !p.includes('%'))) blocks.push(n)
    else if (isTimeToken(p)) rests.push(n)
  })
  if (blocks.length < 2) return null
  const total = blocks.reduce((acc, v) => (acc as number) + (Number(v) || 0), 0)
  const intra = rests.length ? Number(rests[0]) : 15
  const clusterSize = Number(blocks[0]) || null
  return {
    plannedReps: safeString(pattern),
    config: {
      total_reps: Number.isFinite(total) && (total as number) > 0 ? Math.round(total as number) : null,
      cluster_size: Number.isFinite(Number(clusterSize)) && Number(clusterSize) > 0 ? Math.round(Number(clusterSize)) : null,
      intra_rest_sec: Number.isFinite(Number(intra)) && Number(intra) > 0 ? Math.round(Number(intra)) : 15,
    },
  }
}

const parseRestPauseLike = ({ pattern, label }: { pattern: unknown; label: string }) => {
  const steps = parseSteps(pattern)
  if (!steps.length) return null
  const blocksCount = steps.filter((p) => p.includes('falha') || p.includes('failure') || (parseFirstNumber(p) != null && !p.includes('%'))).length
  if (blocksCount < 2) return null

  const restSec = (() => {
    for (const p of steps) {
      if (!isTimeToken(p)) continue
      const n = parseFirstNumber(p)
      if (n != null && n > 0) return Math.round(n)
    }
    return label === 'SST' ? 10 : 15
  })()

  return {
    config: {
      mini_sets: Math.max(1, blocksCount - 1),
      rest_time_sec: Math.max(1, restSec),
    },
  }
}

const parseDropSet = (pattern: unknown) => {
  const steps = parseSteps(pattern)
  if (!steps.length) return null
  const stages: unknown[] = [];
  let sawStage = false
  for (const p of steps) {
    const isFailure = p.includes('falha') || p.includes('failure')
    const repsN = p.includes('%') ? null : parseFirstNumber(p)
    // "continua/segue/mais uma/de novo/repete" DEPOIS de já ter um estágio = mais
    // um estágio até a falha (a essência do drop: reduz a carga e continua).
    const isContinue = /\b(continu|segue|seguir|mais|novamente|de novo|nova|repet)/.test(p)
    if (isFailure) { stages.push({ weight: null, reps: 'Falha' }); sawStage = true; continue }
    if (repsN != null && repsN > 0) { stages.push({ weight: null, reps: String(Math.round(repsN)) }); sawStage = true; continue }
    if (isContinue && sawStage) { stages.push({ weight: null, reps: 'Falha' }); continue }
    // "reduz ~20%" sozinho é uma TRANSIÇÃO (dropar a carga), não um estágio → ignora.
  }
  if (stages.length < 2) return null
  return { config: stages }
}

const detectMethod = (headRaw: unknown) => {
  const head = normalize(headRaw)
  if (!head) return null
  if (head.includes('cluster')) return { kind: 'cluster', label: 'Cluster', defaultTarget: 'all' }
  if (head.includes('sst')) return { kind: 'sst', label: 'SST', defaultTarget: 'last' }
  if (head.includes('rest-p') || head.includes('rest p') || head.includes('restpause') || head.includes('rest pause')) {
    return { kind: 'rest_pause', label: 'Rest-P', defaultTarget: 'last' }
  }
  if (head.includes('drop-set') || head.includes('dropset') || head.includes('drop set') || head === 'drop' || head.startsWith('drop ')) {
    return { kind: 'drop_set', label: 'Drop', defaultTarget: 'last' }
  }
  return null
}

interface SetOverridesInput {
  notes: unknown
  setsCount: number
}

type SetOverride =
  | { kind: 'cluster'; label: string; plannedReps: string; advanced_config: Record<string, unknown> }
  | { kind: 'rest_pause' | 'sst' | 'drop_set'; label: string; plannedReps: string; advanced_config: unknown }

export function parseExerciseNotesToSetOverrides({ notes, setsCount }: SetOverridesInput) {
  const directives = splitDirectives(notes)
  const nSets = Math.max(0, Math.floor(Number(setsCount) || 0))
  const overrides: Array<SetOverride | null> = Array.from({ length: nSets }).map(() => null)
  if (!directives.length || !nSets) return { overrides, hash: hashString(notes) }

  directives.forEach((raw) => {
    const idx = raw.indexOf(':')
    if (idx < 0) return
    const head = raw.slice(0, idx)
    const pattern = raw.slice(idx + 1)
    const detected = detectMethod(head)
    if (!detected) return
    const targets = parseTargetIndices({ head, setsCount: nSets, defaultTarget: detected.defaultTarget })
    if (!targets.length) return

    if (detected.kind === 'cluster') {
      const parsed = parseCluster(pattern)
      if (!parsed) return
      targets.forEach((setIdx) => {
        overrides[setIdx] = {
          kind: 'cluster',
          label: detected.label,
          plannedReps: parsed.plannedReps,
          advanced_config: parsed.config,
        }
      })
      return
    }

    if (detected.kind === 'rest_pause' || detected.kind === 'sst') {
      const parsed = parseRestPauseLike({ pattern, label: detected.kind === 'sst' ? 'SST' : 'Rest-P' })
      if (!parsed) return
      targets.forEach((setIdx) => {
        overrides[setIdx] = {
          kind: detected.kind as 'rest_pause' | 'sst' | 'drop_set',
          label: detected.kind === 'sst' ? 'SST' : 'Rest-P',
          plannedReps: safeString(pattern),
          advanced_config: parsed.config,
        }
      })
      return
    }

    if (detected.kind === 'drop_set') {
      const parsed = parseDropSet(pattern)
      if (!parsed) return
      targets.forEach((setIdx) => {
        overrides[setIdx] = {
          kind: 'drop_set',
          label: 'Drop',
          plannedReps: safeString(pattern),
          advanced_config: parsed.config,
        }
      })
    }
  })

  return { overrides, hash: hashString(notes) }
}

type SetDetailLike = Record<string, unknown>

interface ApplyNotesOptions {
  /** Chave de leitura/escrita do config na série. Default: `advanced_config`
   *  (mapWorkoutRow). A periodização VIP usa `advancedConfig` (camelCase). */
  configKey?: string
  /** Constrói um setDetail default quando a série-alvo não existe no array
   *  (plano salvo só com a contagem, sem rows em `sets`). Default = shape do
   *  mapWorkoutRow. A periodização passa o próprio (isWarmup/advancedConfig). */
  makeDefault?: (index: number, config: unknown) => SetDetailLike
}

/**
 * Aplica, de forma NÃO-DESTRUTIVA, os overrides de método por série derivados das
 * notas do exercício sobre o array `setDetails`. Regras:
 *  - Só preenche o config numa série onde ele ainda está ausente (null/undefined).
 *    Config vindo do banco/editor NUNCA é sobrescrito.
 *  - Se a série-alvo não existe no `setDetails` (ex.: plano de IA salvo só com a
 *    contagem, sem rows em `sets`), cria um setDetail default carregando o config.
 *  - Sem override aplicável → retorna o MESMO array (referência estável).
 *
 * Isto é o que "liga" `parseExerciseNotesToSetOverrides` na hidratação: uma nota
 * "DROP-SET na última série: até a falha → reduz 20% → continua" passa a marcar a
 * última série como drop automaticamente, sem o usuário editar nada.
 */
export function applyNotesMethodToSetDetails(
  setDetails: SetDetailLike[],
  notes: unknown,
  setsCount: number,
  options: ApplyNotesOptions = {},
): SetDetailLike[] {
  const configKey = options.configKey ?? 'advanced_config'
  const makeDefault =
    options.makeDefault ??
    ((index: number, config: unknown): SetDetailLike => ({
      set_number: index + 1,
      reps: null,
      rpe: null,
      weight: null,
      is_warmup: false,
      set_type: 'working',
      [configKey]: config,
    }))

  const base = Array.isArray(setDetails) ? setDetails : []
  const effectiveCount = Math.max(0, Math.floor(Number(setsCount) || 0)) || base.length
  if (!effectiveCount) return base

  const { overrides } = parseExerciseNotesToSetOverrides({ notes, setsCount: effectiveCount })
  if (!overrides.some(Boolean)) return base

  const targetLen = Math.max(base.length, effectiveCount)
  const out: SetDetailLike[] = []
  let changed = false
  for (let i = 0; i < targetLen; i += 1) {
    const existing = base[i]
    const ov = overrides[i] || null
    if (existing) {
      const cfg = existing[configKey]
      if (ov && (cfg === null || cfg === undefined)) {
        out.push({ ...existing, [configKey]: ov.advanced_config })
        changed = true
      } else {
        out.push(existing)
      }
    } else {
      out.push(makeDefault(i, ov ? ov.advanced_config : null))
      changed = true
    }
  }
  return changed ? out : base
}
