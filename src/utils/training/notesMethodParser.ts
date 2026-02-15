import { parseTrainingNumber } from '../trainingNumber'

const safeString = (v) => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

const normalize = (v) => {
  const s = safeString(v)
  if (!s) return ''
  try {
    return s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
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

const hashString = (input) => {
  const str = safeString(input)
  let h = 5381
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}

const range = (count) => Array.from({ length: Math.max(0, count) }).map((_, i) => i)

const parseTargetIndices = ({ head, setsCount, defaultTarget }) => {
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

const splitDirectives = (notes) => {
  const raw = safeString(notes)
  if (!raw) return []
  return raw
    .split(/\n|;/)
    .map((p) => safeString(p))
    .filter(Boolean)
}

const parseSteps = (pattern) => {
  const raw = normalize(pattern)
  if (!raw) return []
  return raw
    .split('>')
    .map((p) => safeString(p))
    .map((p) => normalize(p))
    .filter(Boolean)
}

const parseFirstNumber = (text) => {
  const s = normalize(text)
  if (!s) return null
  const m = s.match(/(-?\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const n = parseTrainingNumber(m[1])
  return Number.isFinite(n) ? n : null
}

const isTimeToken = (p) => {
  const s = normalize(p)
  if (!s) return false
  if (s.includes('seg') || s.includes('sec')) return true
  if (/\b\d+(?:[.,]\d+)?\s*s\b/.test(s)) return true
  if (/\b\d+(?:[.,]\d+)?s\b/.test(s)) return true
  return false
}

const parseCluster = (pattern) => {
  const steps = parseSteps(pattern)
  if (!steps.length) return null
  const blocks: any[] = [];
  const rests: any[] = [];
  steps.forEach((p) => {
    const n = parseFirstNumber(p)
    if (n == null || n <= 0) return
    if (p.includes('rep') || (!isTimeToken(p) && !p.includes('%'))) blocks.push(n)
    else if (isTimeToken(p)) rests.push(n)
  })
  if (blocks.length < 2) return null
  const total = blocks.reduce((acc, v) => acc + (Number(v) || 0), 0)
  const intra = rests.length ? Number(rests[0]) : 15
  const clusterSize = Number(blocks[0]) || null
  return {
    plannedReps: safeString(pattern),
    config: {
      total_reps: Number.isFinite(total) && total > 0 ? Math.round(total) : null,
      cluster_size: Number.isFinite(Number(clusterSize)) && Number(clusterSize) > 0 ? Math.round(Number(clusterSize)) : null,
      intra_rest_sec: Number.isFinite(Number(intra)) && Number(intra) > 0 ? Math.round(Number(intra)) : 15,
    },
  }
}

const parseRestPauseLike = ({ pattern, label }) => {
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

const parseDropSet = (pattern) => {
  const steps = parseSteps(pattern)
  if (!steps.length) return null
  const stages: any[] = [];
  steps.forEach((p) => {
    if (p.includes('falha') || p.includes('failure')) {
      stages.push({ weight: null, reps: 'Falha' })
      return
    }
    if (p.includes('%')) return
    const repsN = parseFirstNumber(p)
    if (repsN != null && repsN > 0) {
      stages.push({ weight: null, reps: String(Math.round(repsN)) })
    }
  })
  if (stages.length < 2) return null
  return { config: stages }
}

const detectMethod = (headRaw) => {
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

export function parseExerciseNotesToSetOverrides({ notes, setsCount }) {
  const directives = splitDirectives(notes)
  const nSets = Math.max(0, Math.floor(Number(setsCount) || 0))
  const overrides = Array.from({ length: nSets }).map(() => null)
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
          kind: detected.kind,
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
