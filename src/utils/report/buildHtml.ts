import { escapeHtml } from '@/utils/escapeHtml'
import {
  isRecord,
  formatDate,
  formatShortDate,
  formatDuration,
  normalizeExerciseKey,
  calculateTotalVolume,
} from '@/utils/report/formatters'
import { estimateCaloriesMet, MET_LIGHT, DEFAULT_BODY_WEIGHT_KG } from '@/utils/calories/metEstimate'


const getSetTag = (log: unknown): string | null => {
  if (!isRecord(log)) return null
  const isWarmup = !!(log.is_warmup ?? log.isWarmup)
  if (isWarmup) return 'Aquecimento'
  const cfg = log.advanced_config ?? log.advancedConfig
  const cfgObj = isRecord(cfg) ? cfg : null
  const rawType = cfgObj ? (cfgObj.type ?? cfgObj.kind ?? cfgObj.mode) : null
  const t = String(rawType || '').toLowerCase()
  if (!t) return null
  if (t.includes('drop')) return 'Drop-set'
  if (t.includes('rest')) return 'Rest-pause'
  if (t.includes('cluster')) return 'Cluster'
  if (t.includes('bi')) return 'Bi-set'
  return 'Método'
}

export function buildReportData(
  session: unknown,
  previousSession: unknown,
  studentName = '',
  kcalOverride: number | null = null,
  options: unknown = null,
) {
  const opts: Record<string, unknown> = isRecord(options) ? options : {}
  const prevLogsByExercise = isRecord(opts?.prevLogsByExercise) ? (opts.prevLogsByExercise as Record<string, unknown>) : null
  const prevBaseMsByExercise = isRecord(opts?.prevBaseMsByExercise) ? (opts.prevBaseMsByExercise as Record<string, unknown>) : null
  const aiFromOptions = isRecord(opts?.ai) ? opts.ai : null
  const aiFromSession = isRecord(session) && isRecord((session as Record<string, unknown>).ai) ? (session as Record<string, unknown>).ai : null
  const aiRaw = aiFromOptions || aiFromSession

  const sessionObj = isRecord(session) ? session : {}
  const prevObj = isRecord(previousSession) ? previousSession : null

  const sessionLogs: Record<string, unknown> = isRecord(sessionObj?.logs) ? (sessionObj.logs as Record<string, unknown>) : {}
  const currentVolume = calculateTotalVolume(sessionLogs)
  const prevVolume = prevObj ? calculateTotalVolume(isRecord(prevObj?.logs) ? prevObj.logs : {}) : 0
  const volumeDeltaPct = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : null

  const totalTimeSeconds = Number(sessionObj?.totalTime) || 0
  const realTotalTimeSeconds =
    (Number(sessionObj?.realTotalTime) || 0)
    || (Array.isArray(sessionObj?.exerciseDurations) ? sessionObj.exerciseDurations.reduce((a, b) => a + (Number(b) || 0), 0) : 0)

  const outdoorBikeRaw = isRecord(sessionObj?.outdoorBike) ? (sessionObj.outdoorBike as Record<string, unknown>) : null
  const outdoorBike = outdoorBikeRaw ? {
    distanceKm: (() => {
      const dist = Number(outdoorBikeRaw?.distanceMeters)
      if (!Number.isFinite(dist) || dist <= 0) return null
      return dist / 1000
    })(),
    durationSeconds: (() => {
      const dur = Number(outdoorBikeRaw?.durationSeconds)
      if (!Number.isFinite(dur) || dur <= 0) return null
      return dur
    })(),
    avgSpeedKmh: (() => {
      const v = Number(outdoorBikeRaw?.avgSpeedKmh)
      if (!Number.isFinite(v) || v <= 0) return null
      return v
    })(),
    maxSpeedKmh: (() => {
      const v = Number(outdoorBikeRaw?.maxSpeedKmh)
      if (!Number.isFinite(v) || v <= 0) return null
      return v
    })(),
    caloriesKcal: (() => {
      const v = Number(outdoorBikeRaw?.caloriesKcal)
      if (!Number.isFinite(v) || v <= 0) return null
      return Math.round(v)
    })(),
  } : null

  const caloriesEstimate = (() => {
    const ov = Number(kcalOverride)
    if (Number.isFinite(ov) && ov > 0) return Math.round(ov)
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)
    // Full MET V9 model with all available session data
    const exerciseNames = Array.isArray(sessionObj?.exercises)
      ? (sessionObj.exercises as unknown[]).map((ex) => {
        const e = isRecord(ex) ? ex : null
        return String(e?.name || '').trim()
      }).filter(Boolean) as string[]
      : null

    // Cadence / rep tempo from exercise config
    const cadenceNames = Array.isArray(sessionObj?.exercises)
      ? (sessionObj.exercises as unknown[]).map((ex) => {
        const e = isRecord(ex) ? ex : null
        return String(e?.cadence || e?.tempo || '').trim()
      }).filter(Boolean) as string[]
      : null

    // Body weight priority: 1. opts.bodyWeightKg (user profile), 2. preCheckin answers, 3. null (uses 78kg default)
    const profileBw = Number(isRecord(opts.bodyWeightKg) ? null : opts.bodyWeightKg)
    const profileBwValid = Number.isFinite(profileBw) && profileBw >= 20 && profileBw <= 300
    const pcRaw = isRecord(sessionObj?.preCheckin) ? (sessionObj.preCheckin as Record<string, unknown>) : null
    const bwCandidates = [
      profileBwValid ? profileBw : null,
      pcRaw?.weight,
      pcRaw?.body_weight_kg,
      isRecord(pcRaw?.answers) ? (pcRaw.answers as Record<string, unknown>).body_weight_kg : null
    ]
    const bodyWeightKg = bwCandidates.reduce<number | null>((acc, c) => {
      if (acc !== null) return acc
      const n = Number(c)
      return Number.isFinite(n) && n >= 20 && n <= 300 ? n : null
    }, null)

    // Biological sex: opts.biologicalSex first (user profile), then session
    const sexFromOpts = String(opts.biologicalSex ?? '').toLowerCase()
    const sexFromSession = String(sessionObj?.biologicalSex ?? '').toLowerCase()
    const sexRaw = sexFromOpts || sexFromSession
    const bioSex = sexRaw === 'male' || sexRaw === 'female' ? sexRaw : null

    // RPE from opts (post-checkin) if available
    const rpeFromOpts = Number(opts.rpe)
    const rpeValue = Number.isFinite(rpeFromOpts) && rpeFromOpts >= 1 && rpeFromOpts <= 10 ? rpeFromOpts : null

    const execSec = Number(sessionObj?.executionTotalSeconds ?? sessionObj?.execution_total_seconds ?? 0) || 0
    const restSec = Number(sessionObj?.restTotalSeconds ?? sessionObj?.rest_total_seconds ?? 0) || 0
    const kcal = estimateCaloriesMet(
      sessionLogs, totalTimeSeconds / 60, bodyWeightKg, exerciseNames,
      rpeValue, execSec > 0 ? execSec / 60 : null, restSec > 0 ? restSec / 60 : null,
      bioSex, null, null, cadenceNames && cadenceNames.length > 0 ? cadenceNames : null,
    )
    return kcal > 0 ? kcal : 0
  })()

  const prevLogsMap: Record<string, Array<Record<string, unknown> | null>> = {}
  const prevBaseMap: Record<string, unknown> = {}
  if (prevLogsByExercise) {
    Object.keys(prevLogsByExercise).forEach((k) => {
      const key = normalizeExerciseKey(k)
      if (!key) return
      const logs = prevLogsByExercise[k]
      if (!Array.isArray(logs)) return
      prevLogsMap[key] = logs.map((x) => (isRecord(x) ? x : null))
      if (prevBaseMsByExercise && prevBaseMsByExercise[k] != null) {
        prevBaseMap[key] = prevBaseMsByExercise[k]
      }
    })
  } else {
    const safePrevLogs: Record<string, unknown> = isRecord(prevObj?.logs) ? (prevObj.logs as Record<string, unknown>) : {}
    const prevExercises: unknown[] = prevObj && Array.isArray(prevObj?.exercises) ? (prevObj.exercises as unknown[]) : []
    if (prevExercises.length) {
      prevExercises.forEach((ex, exIdx) => {
        const exObj = isRecord(ex) ? ex : {}
        const exName = String(exObj?.name || '').trim()
        const key = normalizeExerciseKey(exName)
        if (!key) return
        const exLogs: Array<Record<string, unknown> | null> = []
        Object.keys(safePrevLogs).forEach((k) => {
          const parts = String(k || '').split('-')
          const eIdx = parseInt(parts[0] || '0', 10)
          const sIdx = parseInt(parts[1] || '0', 10)
          if (!Number.isFinite(eIdx) || !Number.isFinite(sIdx)) return
          if (eIdx !== exIdx) return
          const v = safePrevLogs[k]
          exLogs[sIdx] = isRecord(v) ? v : null
        })
        prevLogsMap[key] = exLogs
      })
    }
  }

  const exercisesArray: unknown[] = Array.isArray(sessionObj?.exercises) ? (sessionObj.exercises as unknown[]) : []
  const exercises = exercisesArray.map((ex, exIdx) => {
    const exObj = isRecord(ex) ? ex : {}
    const setsPlanned = parseInt(String(exObj?.sets || 0), 10)
    const exKey = normalizeExerciseKey(exObj?.name)
    const prevLogs = prevLogsMap[exKey] || []
    const baseMs = prevBaseMap[exKey]
    const baseLabel = baseMs ? `Base: ${formatShortDate(baseMs)}` : null

    type Progression = { type: 'weight' | 'reps' | 'volume'; deltaText: string; direction: 'up' | 'down' | 'flat' }
    type SetRow = { index: number; weight: unknown; reps: unknown; cadence: unknown; tag: string | null; note: string | null; progression: Progression | null }
    const sets: SetRow[] = []
    for (let sIdx = 0; sIdx < setsPlanned; sIdx++) {
      const key = `${exIdx}-${sIdx}`
      const log = sessionLogs[key]
      if (!isRecord(log)) continue
      if (!log.weight && !log.reps) continue

      const prevLog = prevLogs[sIdx]

      const cw = Number(String(log.weight ?? '').replace(',', '.'))
      const cr = Number(String(log.reps ?? '').replace(',', '.'))
      const pw = isRecord(prevLog) ? Number(String(prevLog.weight ?? '').replace(',', '.')) : NaN
      const pr = isRecord(prevLog) ? Number(String(prevLog.reps ?? '').replace(',', '.')) : NaN

      const canWeight = Number.isFinite(cw) && cw > 0 && Number.isFinite(pw) && pw > 0
      const canReps = Number.isFinite(cr) && cr > 0 && Number.isFinite(pr) && pr > 0

      let progression: Progression | null = null
      if (isRecord(prevLog)) {
        if (canWeight) {
          const delta = cw - pw
          const fmt = (n: unknown) => (Number.isFinite(Number(n)) ? String(n).replace(/\.0+$/, '') : String(n))
          const deltaText = delta > 0 ? `+${fmt(delta)}kg` : delta < 0 ? `${fmt(delta)}kg` : '='
          const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
          progression = { type: 'weight', deltaText, direction }
        } else if (canReps) {
          const delta = cr - pr
          const deltaText = delta > 0 ? `+${delta} reps` : delta < 0 ? `${delta} reps` : '='
          const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
          progression = { type: 'reps', deltaText, direction }
        } else if (
          Number.isFinite(cw) && cw > 0
          && Number.isFinite(cr) && cr > 0
          && Number.isFinite(pw) && pw > 0
          && Number.isFinite(pr) && pr > 0
        ) {
          const curVol = cw * cr
          const prevVol = pw * pr
          const delta = curVol - prevVol
          const deltaText = delta > 0 ? `+${Math.round(delta)}kg` : delta < 0 ? `${Math.round(delta)}kg` : '='
          const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
          progression = { type: 'volume', deltaText, direction }
        }
      }

      const noteRaw = log.notes ?? log.note ?? log.observation ?? null
      const note = noteRaw != null ? String(noteRaw).trim() || null : null
      const tag = getSetTag(log)
      sets.push({
        index: sIdx + 1,
        weight: log.weight ?? null,
        reps: log.reps ?? null,
        cadence: exObj?.cadence ?? null,
        tag,
        note,
        progression,
      })
    }

    const showProgression = sets.some((s) => !!s?.progression)

    return {
      name: String(exObj?.name || '').trim(),
      method: exObj?.method && exObj.method !== 'Normal' ? String(exObj.method) : null,
      rpe: exObj?.rpe ?? null,
      cadence: exObj?.cadence ?? null,
      baseLabel,
      showProgression,
      sets,
    }
  })

  const summaryMetrics = (() => {
    try {
      let setsLoggedCount = 0
      let repsTotal = 0
      let topWeight = 0
      let exercisesWithLogs = new Set()

      Object.keys(sessionLogs).forEach((k) => {
        const log = sessionLogs[k]
        if (!isRecord(log)) return
        const w = Number(String(log.weight ?? '').replace(',', '.'))
        const r = Number(String(log.reps ?? '').replace(',', '.'))
        if ((!Number.isFinite(w) || w <= 0) && (!Number.isFinite(r) || r <= 0)) return
        setsLoggedCount += 1
        if (Number.isFinite(r) && r > 0) repsTotal += r
        if (Number.isFinite(w) && w > topWeight) topWeight = w
        const parts = String(k || '').split('-')
        const eIdx = parseInt(parts[0] || '0', 10)
        if (Number.isFinite(eIdx) && eIdx >= 0) exercisesWithLogs.add(eIdx)
      })

      return {
        exercisesCount: exercisesArray.length,
        exercisesLoggedCount: exercisesWithLogs.size,
        setsLoggedCount,
        repsTotal,
        volumeTotal: currentVolume,
        volumeDeltaPctVsPrev: volumeDeltaPct,
        topWeight: topWeight > 0 ? topWeight : null,
        caloriesEstimate: caloriesEstimate > 0 ? caloriesEstimate : null,
      }
    } catch {
      return {
        exercisesCount: exercisesArray.length,
        exercisesLoggedCount: 0,
        setsLoggedCount: 0,
        repsTotal: 0,
        volumeTotal: currentVolume,
        volumeDeltaPctVsPrev: volumeDeltaPct,
        topWeight: null,
        caloriesEstimate: caloriesEstimate > 0 ? caloriesEstimate : null,
      }
    }
  })()

  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : ''

  const logoDataUrl = typeof opts?.logoDataUrl === 'string' && opts.logoDataUrl ? opts.logoDataUrl : null

  return {
    meta: {
      reportVersion: 'workout-report-v1',
      generatedAt: new Date().toISOString(),
      locale: 'pt-BR',
      source: 'workout_session',
    },
    brand: {
      appName: 'IronTracks',
      accentColor: '#f59e0b',
      logoUrl: logoDataUrl || `${origin}/icone.png`,
    },
    athlete: {
      id: sessionObj?.user_id || sessionObj?.userId || null,
      name: String(studentName || '').trim(),
      coachName: null as string | null,
      units: 'kg',
    },
    session: {
      workoutId: sessionObj?.id ?? null,
      workoutTitle: String(sessionObj?.workoutTitle || 'Treino'),
      startAt: (() => {
        const raw = sessionObj?.date
        if (!raw) return null
        const obj = isRecord(raw) ? raw : null
        const toDate = obj && typeof obj.toDate === 'function' ? (obj.toDate as () => unknown) : null
        const d = toDate
          ? toDate()
          : new Date(typeof raw === 'number' || typeof raw === 'string' || raw instanceof Date ? raw : String(raw))
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
        return d.toISOString()
      })(),
      endAt: null as string | null,
      totalTimeSeconds,
      realTimeSeconds: realTotalTimeSeconds,
      executionTotalSeconds: Number(sessionObj?.executionTotalSeconds ?? sessionObj?.execution_total_seconds ?? 0) || 0,
      restTotalSeconds: Number(sessionObj?.restTotalSeconds ?? sessionObj?.rest_total_seconds ?? 0) || 0,
      status: 'completed',
      isTeamSession: false,
      notes: null as string | null,
    },
    summaryMetrics,
    outdoorBike,
    exercises,
    ai: aiRaw,
  }
}

export function buildReportHTML(
  session: unknown,
  previousSession: unknown,
  studentName = '',
  kcalOverride: number | null = null,
  options: unknown = null,
) {
  const reportData = buildReportData(session, previousSession, studentName, kcalOverride, options)
  const aiRaw = isRecord((reportData as Record<string, unknown>)?.ai) ? ((reportData as Record<string, unknown>).ai as Record<string, unknown>) : null

  const volumeDeltaStr = reportData?.summaryMetrics?.volumeDeltaPctVsPrev != null
    ? Number(reportData.summaryMetrics.volumeDeltaPctVsPrev).toFixed(1)
    : '0.0'

  // ─── AI Section ──────────────────────────────────────────────────────────────
  const buildAiSection = () => {
    if (!aiRaw) return ''
    const ratingRaw = aiRaw?.rating ?? aiRaw?.stars ?? aiRaw?.score
    const ratingNum = Number(ratingRaw)
    const rating = Number.isFinite(ratingNum) ? Math.max(0, Math.min(5, Math.round(ratingNum))) : null
    const ratingReason = String(aiRaw?.rating_reason || aiRaw?.ratingReason || aiRaw?.reason || '').trim()
    const summaryItems = Array.isArray(aiRaw?.summary) ? aiRaw.summary.filter(Boolean).map((v) => String(v)) : []
    const summaryText = !summaryItems.length ? String(aiRaw?.summary || '').trim() : ''
    const motivation = String(aiRaw?.motivation || '').trim()
    const highlights = Array.isArray(aiRaw?.highlights) ? aiRaw.highlights.filter(Boolean).map((v) => String(v)) : []
    const warnings = Array.isArray(aiRaw?.warnings) ? aiRaw.warnings.filter(Boolean).map((v) => String(v)) : []
    const progression = Array.isArray(aiRaw?.progression) ? aiRaw.progression.filter(Boolean) : []

    const bullets = (items: string[], accent = false) => {
      if (!items?.length) return ''
      return `<ul class="bullet-list">${items.map(v => `<li style="color:${accent ? '#fcd34d' : '#d4d4d4'}">${escapeHtml(v)}</li>`).join('')}</ul>`
    }

    const summaryBlock = (() => {
      if (summaryItems.length) return bullets(summaryItems)
      if (summaryText) return `<p style="color:#e5e7eb;font-size:13px;line-height:1.6;margin:8px 0 0">${escapeHtml(summaryText)}</p>`
      return ''
    })()

    const progItems = progression.slice(0, 10).map((it) => {
      const ex = escapeHtml(it?.exercise || it?.name || '')
      const rec = escapeHtml(it?.recommendation || it?.action || it?.text || '')
      if (!ex && !rec) return ''
      return `<li><strong style="color:#fafafa">${ex || 'Ajuste'}</strong> — <span style="color:#a3a3a3">${rec}</span></li>`
    }).filter(Boolean)

    let html = `
      <!-- AI Section -->
      <div class="section-block">
        <div class="section-title">
          <span class="section-dot"></span>Análise Inteligente
        </div>
        <div class="ai-grid">`

    if (rating != null) {
      const stars = '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating))
      html += `
          <div class="ai-card ai-card-gold">
            <div class="ai-card-label">Avaliação da IA</div>
            <div style="font-size:22px;letter-spacing:8px;color:#fbbf24;margin:6px 0">${escapeHtml(stars)}</div>
            <div style="font-size:12px;color:#fde68a;font-weight:900">${escapeHtml(String(rating))}/5</div>
            ${ratingReason ? `<p style="margin:10px 0 0;font-size:12px;color:#d4d4d4;line-height:1.5">${escapeHtml(ratingReason)}</p>` : ''}
          </div>`
    }

    if (summaryBlock) {
      html += `
          <div class="ai-card ai-card-gold">
            <div class="ai-card-label">Insights</div>
            ${summaryBlock}
            ${motivation ? `<p style="margin:10px 0 0;font-size:12px;color:#9ca3af;font-style:italic">${escapeHtml(motivation)}</p>` : ''}
          </div>`
    }

    if (highlights.length) {
      html += `
          <div class="ai-card">
            <div class="ai-card-label ai-label-green">✓ Pontos Fortes</div>
            ${bullets(highlights)}
          </div>`
    }

    if (warnings.length) {
      html += `
          <div class="ai-card ai-card-red">
            <div class="ai-card-label ai-label-red">⚠ Alertas</div>
            ${bullets(warnings)}
          </div>`
    }

    if (progItems.length) {
      html += `
          <div class="ai-card" style="grid-column: 1 / -1">
            <div class="ai-card-label">Progressão Sugerida</div>
            <ul class="bullet-list" style="columns:2;gap:12px">${progItems.join('')}</ul>
          </div>`
    }

    html += `</div></div>`
    return html
  }

  // ─── Bike Cards ───────────────────────────────────────────────────────────────
  const buildBikeCards = () => {
    const bike = reportData?.outdoorBike && typeof reportData.outdoorBike === 'object' ? reportData.outdoorBike : null
    if (!bike) return ''
    const km = Number(bike?.distanceKm)
    const dur = Number(bike?.durationSeconds)
    const avg = Number(bike?.avgSpeedKmh)
    const max = Number(bike?.maxSpeedKmh)
    if ((!Number.isFinite(km) || km <= 0) && (!Number.isFinite(dur) || dur <= 0)) return ''
    const fmtKmh = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? `${Number(v).toFixed(1)} km/h` : '—')
    return `
      <div class="section-block">
        <div class="section-title"><span class="section-dot"></span>Bike Outdoor</div>
        <div class="stats-grid stats-4">
          <div class="stat-card"><div class="stat-label">Distância</div><div class="stat-value">${Number.isFinite(km) && km > 0 ? `${km.toFixed(2)} km` : '—'}</div></div>
          <div class="stat-card"><div class="stat-label">Vel. Média</div><div class="stat-value">${fmtKmh(avg)}</div></div>
          <div class="stat-card"><div class="stat-label">Vel. Máx</div><div class="stat-value">${fmtKmh(max)}</div></div>
          <div class="stat-card"><div class="stat-label">Tempo Bike</div><div class="stat-value">${formatDuration(dur || 0)}</div></div>
        </div>
      </div>`
  }

  // ─── Detail by exercise ───────────────────────────────────────────────────────
  const detailByExerciseHtml = (() => {
    const sessionObj = isRecord(session) ? (session as Record<string, unknown>) : {}
    const reportMeta = isRecord(sessionObj.reportMeta) ? (sessionObj.reportMeta as Record<string, unknown>) : null
    const list = reportMeta && Array.isArray(reportMeta.exercises) ? (reportMeta.exercises as unknown[]) : []
    if (!list.length) return ''
    const rows = list.map((raw, idx) => {
      const ex = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
      if (!ex) return ''
      const order = Number(ex.order || idx + 1)
      const name = escapeHtml(String(ex.name || '').trim() || '—')
      const execMin = Number(ex.executionMinutes || 0)
      const restMin = Number(ex.restMinutes || 0)
      const restPlan = Number(ex.restTimePlannedSec || 0)
      const zebra = idx % 2 === 0 ? '' : 'background:rgba(255,255,255,0.025)'
      return `
        <tr style="${zebra}">
          <td class="td-mono td-muted" style="width:40px">${Number.isFinite(order) ? order : idx + 1}</td>
          <td class="td-name">${name}</td>
          <td class="td-mono td-center">${Number.isFinite(execMin) && execMin > 0 ? `${execMin.toFixed(1)} min` : '—'}</td>
          <td class="td-mono td-center">${Number.isFinite(restMin) && restMin > 0 ? `${restMin.toFixed(1)} min` : '—'}</td>
          <td class="td-mono td-center td-muted">${Number.isFinite(restPlan) && restPlan > 0 ? `${Math.round(restPlan)}s` : '—'}</td>
        </tr>`
    }).filter(Boolean).join('')
    if (!rows) return ''
    return `
      <div class="section-block">
        <div class="section-title"><span class="section-dot"></span>Detalhe por Exercício</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr class="thead-row">
                <th class="th" style="width:40px">#</th>
                <th class="th">Exercício</th>
                <th class="th th-center">Execução</th>
                <th class="th th-center">Descanso Real</th>
                <th class="th th-center">Descanso Plan.</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`
  })()

  // ─── Exercises ────────────────────────────────────────────────────────────────
  const exercisesHtml = (Array.isArray(reportData?.exercises) ? reportData.exercises : []).map((ex, exIdx) => {
    const sets = Array.isArray(ex?.sets) ? ex.sets : []
    if (!sets.length) return ''
    const showProgression = !!ex?.showProgression
    const baseText = ex?.baseLabel ? String(ex.baseLabel) : ''
    const method = ex?.method ? String(ex.method) : ''
    const rpe = ex?.rpe != null ? String(ex.rpe) : ''

    const rows = sets.map((set, rowIdx) => {
      const tag = set?.tag ? String(set.tag) : ''
      const tagHtml = tag ? `<span class="set-tag">${escapeHtml(tag)}</span>` : ''
      const note = set?.note ? String(set.note) : ''
      const weight = set?.weight ?? '—'
      const reps = set?.reps ?? '—'
      const prog = set?.progression && typeof set.progression === 'object' ? set.progression : null
      const progText = prog?.deltaText ? String(prog.deltaText) : '—'
      const dir = prog?.direction ? String(prog.direction) : ''
      const progStyle = dir === 'up'
        ? 'color:#4ade80;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3)'
        : dir === 'down'
          ? 'color:#f87171;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25)'
          : 'color:#737373;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)'
      const zebra = rowIdx % 2 === 0 ? '' : 'background:rgba(255,255,255,0.025)'

      let rowHtml = `
        <tr style="${zebra}">
          <td class="td-mono td-muted">#${escapeHtml(String(set?.index || ''))}${tagHtml}</td>
          <td class="td-weight">${escapeHtml(String(weight))}</td>
          <td class="td-mono td-center">${escapeHtml(String(reps))}</td>
          ${showProgression ? `<td style="padding:10px 12px;text-align:center;font-size:11px;font-weight:900;border-radius:6px;${progStyle}">${escapeHtml(progText)}</td>` : ''}
        </tr>`

      if (note) {
        const colSpan = showProgression ? 4 : 3
        rowHtml += `<tr><td colspan="${colSpan}" class="td-note">Obs: ${escapeHtml(note)}</td></tr>`
      }
      return rowHtml
    }).join('')

    return `
      <div class="exercise-block">
        <div class="exercise-header">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="exercise-num">${exIdx + 1}</span>
            <span class="exercise-name">${escapeHtml(ex?.name || '')}</span>
          </div>
          <div class="exercise-meta">
            ${baseText ? `<span class="meta-pill">${escapeHtml(baseText)}</span>` : ''}
            ${method ? `<span class="meta-pill meta-pill-red">${escapeHtml(method)}</span>` : ''}
            ${rpe ? `<span class="meta-pill">RPE <strong style="color:#fafafa">${escapeHtml(rpe)}</strong></span>` : ''}
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr class="thead-row">
                <th class="th" style="width:60px">Série</th>
                <th class="th">Carga</th>
                <th class="th th-center">Reps</th>
                ${showProgression ? `<th class="th th-center" style="width:110px">Evolução</th>` : ''}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`
  }).filter(Boolean).join('')

  // ─── Assemble ─────────────────────────────────────────────────────────────────
  const logoUrl = String(reportData?.brand?.logoUrl || '')
  const safeLogoUrl = /^https?:\/\//i.test(logoUrl) ? escapeHtml(logoUrl) : ''
  const workoutTitleSafe = escapeHtml(reportData?.session?.workoutTitle || 'Treino')
  const studentNameSafe = escapeHtml(reportData?.athlete?.name || '')
  const dateSafe = escapeHtml(formatDate(isRecord(session) ? (session as Record<string, unknown>).date : null))
  const timeSafe = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const volDelta = reportData?.summaryMetrics?.volumeDeltaPctVsPrev
  const volDeltaColor = volDelta != null && Number(volDelta) >= 0 ? '#4ade80' : '#f87171'
  const volDeltaLabel = volDelta != null ? `${Number(volDelta) > 0 ? '+' : ''}${escapeHtml(volumeDeltaStr)}%` : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${workoutTitleSafe} · IronTracks</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body {
      background: #0d0d0d !important;
      color: #f5f5f5;
      font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    img { max-width: 100%; display: block; }

    /* ── Layout ─────────────────────────────────── */
    .page { max-width: 900px; margin: 0 auto; }

    /* ── Header Banner ──────────────────────────── */
    .header-banner {
      background: linear-gradient(135deg, #111111 0%, #1a1508 60%, #0d0d0d 100%) !important;
      border-bottom: 3px solid #f59e0b;
      padding: 28px 36px 22px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .header-brand-row { display: flex; align-items: center; gap: 14px; }
    .header-logo { width: 44px; height: 44px; border-radius: 12px; border: 1.5px solid rgba(245,158,11,0.55); background: #000; object-fit: contain; }
    .header-wordmark { font-size: 32px; font-weight: 900; font-style: italic; letter-spacing: -0.04em; line-height: 1; }
    .header-wordmark span { color: #f59e0b; }
    .header-sub { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.22em; color: #a3a3a3; margin-top: 3px; }
    .header-right { text-align: right; }
    .header-workout { font-size: 22px; font-weight: 900; color: #ffffff; line-height: 1.15; max-width: 340px; }
    .header-date { font-size: 12px; color: #a3a3a3; margin-top: 4px; }
    .header-athlete { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-top: 2px; }
    .header-athlete strong { color: #d4d4d4; }

    /* ── Gold accent stripe under header ─────────── */
    .accent-stripe {
      background: linear-gradient(90deg, #f59e0b, #d97706, rgba(245,158,11,0)) !important;
      height: 3px;
      margin-bottom: 28px;
      -webkit-print-color-adjust: exact !important;
    }

    /* ── Container ── */
    .container { padding: 0 36px 36px; }

    /* ── Section ──────────────────────────────────── */
    .section-block { margin-bottom: 32px; }
    .section-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      color: #a3a3a3;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #f59e0b !important;
      -webkit-print-color-adjust: exact !important;
      flex-shrink: 0;
    }

    /* ── Stats Grid ───────────────────────────────── */
    .stats-grid {
      display: grid;
      gap: 12px;
      margin-bottom: 0;
    }
    .stats-main { grid-template-columns: repeat(4, 1fr); }
    .stats-sub  { grid-template-columns: repeat(4, 1fr); }
    .stats-4    { grid-template-columns: repeat(4, 1fr); }
    .stat-card {
      background: #161616 !important;
      border: 1px solid #2a2a2a;
      border-radius: 14px;
      padding: 16px;
      page-break-inside: avoid;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .stat-card-accent {
      background: linear-gradient(135deg, rgba(245,158,11,0.12), rgba(180,83,9,0.08)) !important;
      border-color: rgba(245,158,11,0.4) !important;
    }
    .stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: #6b7280; margin-bottom: 6px; }
    .stat-value { font-size: 26px; font-weight: 900; color: #ffffff; line-height: 1.05; font-variant-numeric: tabular-nums; }
    .stat-value-gold { color: #f59e0b !important; }
    .stat-unit  { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
    .stat-sub   { font-size: 11px; font-weight: 700; color: #6b7280; margin-top: 3px; }

    /* ── AI Cards ─────────────────────────────────── */
    .ai-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .ai-card {
      background: #161616 !important;
      border: 1px solid #2a2a2a;
      border-radius: 14px;
      padding: 16px;
      page-break-inside: avoid;
      -webkit-print-color-adjust: exact !important;
    }
    .ai-card-gold {
      background: linear-gradient(135deg, rgba(245,158,11,0.1), rgba(120,53,15,0.08)) !important;
      border-color: rgba(245,158,11,0.35) !important;
    }
    .ai-card-red {
      background: rgba(239,68,68,0.07) !important;
      border-color: rgba(239,68,68,0.3) !important;
    }
    .ai-card-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #6b7280; margin-bottom: 10px; }
    .ai-label-green { color: #4ade80 !important; }
    .ai-label-red   { color: #f87171 !important; }
    .bullet-list { padding-left: 0; list-style: none; display: grid; gap: 6px; margin-top: 4px; }
    .bullet-list li { font-size: 13px; color: #d4d4d4; line-height: 1.5; padding-left: 14px; position: relative; }
    .bullet-list li::before { content: '–'; position: absolute; left: 0; color: #f59e0b; }

    /* ── Tables ───────────────────────────────────── */
    .table-wrap { border-radius: 14px; overflow: hidden; border: 1px solid #262626; }
    table { width: 100%; border-collapse: collapse; }
    .thead-row { background: #0b0b0b !important; -webkit-print-color-adjust: exact !important; }
    .th { padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: #6b7280; border-bottom: 1px solid #262626; }
    .th-center { text-align: center; }
    .td-mono  { padding: 11px 12px; font-family: ui-monospace, monospace; }
    .td-muted { color: #6b7280; }
    .td-name  { padding: 11px 12px; font-weight: 700; color: #f5f5f5; }
    .td-weight { padding: 11px 12px; font-size: 17px; font-weight: 900; color: #ffffff; }
    .td-center { text-align: center; }
    .td-note  { padding: 8px 12px; font-size: 12px; color: #a3a3a3; background: rgba(255,255,255,0.03) !important; font-style: italic; -webkit-print-color-adjust: exact !important; }

    /* ── Exercise Block ────────────────────────────── */
    .exercise-block { page-break-inside: avoid; margin-bottom: 24px; }
    .exercise-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 16px;
      background: #141414 !important;
      border: 1px solid #2a2a2a;
      border-bottom: none;
      border-radius: 14px 14px 0 0;
      -webkit-print-color-adjust: exact !important;
    }
    .exercise-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px; height: 26px;
      background: #f59e0b !important;
      color: #000 !important;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 900;
      flex-shrink: 0;
      -webkit-print-color-adjust: exact !important;
    }
    .exercise-name { font-size: 16px; font-weight: 900; text-transform: uppercase; color: #ffffff; letter-spacing: -0.01em; }
    .exercise-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .meta-pill { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,0.07) !important; color: #9ca3af; border: 1px solid rgba(255,255,255,0.1); -webkit-print-color-adjust: exact !important; }
    .meta-pill-red { background: rgba(239,68,68,0.12) !important; color: #f87171 !important; border-color: rgba(239,68,68,0.25) !important; }
    .set-tag { margin-left: 5px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #9ca3af; background: rgba(255,255,255,0.06) !important; padding: 1px 5px; border-radius: 4px; -webkit-print-color-adjust: exact !important; }

    /* ── Footer ────────────────────────────────────── */
    .report-footer {
      margin-top: 36px;
      padding: 20px 36px;
      border-top: 1px solid #262626;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #4a4a4a;
    }
    .footer-brand { color: #f59e0b !important; font-weight: 900; }

    /* ── Print ─────────────────────────────────────── */
    @media print {
      @page { size: A4; margin: 0; }
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { background: #0d0d0d !important; }
      .page { max-width: none; }
      .exercise-block { page-break-inside: avoid; }
      .section-block { page-break-inside: avoid; }
    }
    @media (max-width: 600px) {
      .header-banner { padding: 20px; flex-direction: column; }
      .header-right { text-align: left; }
      .stats-main, .stats-sub, .ai-grid { grid-template-columns: repeat(2, 1fr); }
    }
    /* ── Print button (visible on screen, hidden when printing) ── */
    .print-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 999;
      background: #f59e0b; color: #000;
      border: none; border-radius: 14px;
      padding: 14px 22px;
      font-size: 14px; font-weight: 900; cursor: pointer;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
      display: flex; align-items: center; gap: 8px;
    }
    .print-fab:active { opacity: 0.8; }
    @media print {
      .print-fab { display: none !important; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── Header ─────────────────────────────────── -->
  <div class="header-banner">
    <div>
      <div class="header-brand-row">
        ${safeLogoUrl ? `<img src="${safeLogoUrl}" alt="IT" class="header-logo" />` : ''}
        <div>
          <div class="header-wordmark">IRON<span>TRACKS</span></div>
          <div class="header-sub">Relatório de Performance</div>
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="header-workout">${workoutTitleSafe}</div>
      <div class="header-date">${dateSafe} &nbsp;·&nbsp; ${timeSafe}</div>
      ${studentNameSafe ? `<div class="header-athlete">Atleta: <strong>${studentNameSafe}</strong></div>` : ''}
    </div>
  </div>
  <div class="accent-stripe"></div>

  <div class="container">

    <!-- ── Summary Metrics ───────────────────────── -->
    <div class="section-block">
      <div class="section-title"><span class="section-dot"></span>Resumo da Sessão</div>
      <div class="stats-grid stats-main" style="margin-bottom:12px">
        <div class="stat-card">
          <div class="stat-label">Tempo Total</div>
          <div class="stat-value">${formatDuration(reportData?.session?.totalTimeSeconds || 0)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Tempo Real</div>
          <div class="stat-value">${formatDuration(reportData?.session?.realTimeSeconds || 0)}</div>
        </div>
        ${Number(reportData?.session?.executionTotalSeconds || 0) > 0 ? `
        <div class="stat-card">
          <div class="stat-label">Execução</div>
          <div class="stat-value">${formatDuration(Number(reportData?.session?.executionTotalSeconds || 0))}</div>
        </div>` : `<div class="stat-card">
          <div class="stat-label">Exercícios</div>
          <div class="stat-value">${Number(reportData?.summaryMetrics?.exercisesLoggedCount || 0)}</div>
        </div>`}
        ${Number(reportData?.session?.restTotalSeconds || 0) > 0 ? `
        <div class="stat-card">
          <div class="stat-label">Descanso</div>
          <div class="stat-value">${formatDuration(Number(reportData?.session?.restTotalSeconds || 0))}</div>
        </div>` : `<div class="stat-card">
          <div class="stat-label">Séries</div>
          <div class="stat-value">${Number(reportData?.summaryMetrics?.setsLoggedCount || 0)}</div>
          <div class="stat-sub">${Number(reportData?.summaryMetrics?.exercisesLoggedCount || 0)} exercícios</div>
        </div>`}
      </div>
      <div class="stats-grid stats-sub">
        <div class="stat-card">
          <div class="stat-label">Séries</div>
          <div class="stat-value">${Number(reportData?.summaryMetrics?.setsLoggedCount || 0)}</div>
          <div class="stat-sub">${Number(reportData?.summaryMetrics?.exercisesLoggedCount || 0)} ex</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Volume</div>
          <div class="stat-value">${Number(reportData?.summaryMetrics?.volumeTotal || 0).toLocaleString('pt-BR')} <span class="stat-unit">kg</span></div>
          ${volDeltaLabel ? `<div class="stat-sub" style="color:${volDeltaColor}">${escapeHtml(volDeltaLabel)}</div>` : ''}
        </div>
        <div class="stat-card stat-card-accent">
          <div class="stat-label" style="color:rgba(245,158,11,0.7)">Calorias</div>
          <div class="stat-value stat-value-gold">~${Number(reportData?.summaryMetrics?.caloriesEstimate || 0) || 0}</div>
          <div class="stat-sub" style="color:rgba(245,158,11,0.4)">kcal estimada</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Repetições</div>
          <div class="stat-value">${Number(reportData?.summaryMetrics?.repsTotal || 0).toLocaleString('pt-BR')}</div>
          ${Number(reportData?.summaryMetrics?.topWeight || 0) > 0 ? `<div class="stat-sub">Top: ${Number(reportData?.summaryMetrics?.topWeight || 0).toLocaleString('pt-BR')} kg</div>` : ''}
        </div>
      </div>
    </div>

    ${buildBikeCards()}
    ${buildAiSection()}
    ${detailByExerciseHtml}

    <!-- ── Exercises ──────────────────────────────── -->
    ${exercisesHtml ? `
    <div class="section-block">
      <div class="section-title"><span class="section-dot"></span>Séries Executadas</div>
      ${exercisesHtml}
    </div>` : ''}

  </div><!-- /container -->

  <!-- ── Footer ─────────────────────────────────── -->
  <div class="report-footer">
    <span class="footer-brand">IronTracks</span>
    <span>Performance Report &nbsp;·&nbsp; ${dateSafe}</span>
    <span>irontracks.app</span>
  </div>

</div><!-- /page -->

<button class="print-fab" onclick="window.print()">
  📄 Salvar como PDF
</button>

</body>
</html>`
}
