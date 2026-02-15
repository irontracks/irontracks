const formatDate = (ts) => {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const formatShortDate = (ts) => {
  try {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return ''
  }
}

const formatDuration = (s) => {
  const safe = Number(s) || 0
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

const escapeHtml = (v) => {
  try {
    return String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  } catch {
    return ''
  }
}

const normalizeExerciseKey = (v) => {
  try {
    return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')
  } catch {
    return ''
  }
}

const calculateTotalVolume = (logs) => {
  try {
    let volume = 0
    const safeLogs = logs && typeof logs === 'object' ? logs : {}
    Object.values(safeLogs).forEach((log) => {
      if (!log || typeof log !== 'object') return
      const row: any = log as any
      const w = Number(String(row.weight ?? '').replace(',', '.'))
      const r = Number(String(row.reps ?? '').replace(',', '.'))
      if (!Number.isFinite(w) || !Number.isFinite(r)) return
      if (w <= 0 || r <= 0) return
      volume += w * r
    })
    return volume
  } catch {
    return 0
  }
}

const getSetTag = (log) => {
  if (!log || typeof log !== 'object') return null
  const row: any = log as any
  const isWarmup = !!(row.is_warmup ?? row.isWarmup)
  if (isWarmup) return 'Aquecimento'
  const cfg = row.advanced_config ?? row.advancedConfig
  const rawType = cfg && (cfg.type || cfg.kind || cfg.mode)
  const t = String(rawType || '').toLowerCase()
  if (!t) return null
  if (t.includes('drop')) return 'Drop-set'
  if (t.includes('rest')) return 'Rest-pause'
  if (t.includes('cluster')) return 'Cluster'
  if (t.includes('bi')) return 'Bi-set'
  return 'Método'
}

export function buildReportData(session, previousSession, studentName = '', kcalOverride = null, options = null) {
  const opts = options && typeof options === 'object' ? options : {}
  const prevLogsByExercise = opts?.prevLogsByExercise && typeof opts.prevLogsByExercise === 'object' ? opts.prevLogsByExercise : null
  const prevBaseMsByExercise = opts?.prevBaseMsByExercise && typeof opts.prevBaseMsByExercise === 'object' ? opts.prevBaseMsByExercise : null
  const aiRaw = opts?.ai && typeof opts.ai === 'object' ? opts.ai : session?.ai && typeof session.ai === 'object' ? session.ai : null

  const sessionObj = session && typeof session === 'object' ? session : {}
  const prevObj = previousSession && typeof previousSession === 'object' ? previousSession : null

  const sessionLogs = sessionObj?.logs && typeof sessionObj.logs === 'object' ? sessionObj.logs : {}
  const currentVolume = calculateTotalVolume(sessionLogs)
  const prevVolume = prevObj ? calculateTotalVolume(prevObj?.logs && typeof prevObj.logs === 'object' ? prevObj.logs : {}) : 0
  const volumeDeltaPct = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : null

  const totalTimeSeconds = Number(sessionObj?.totalTime) || 0
  const realTotalTimeSeconds =
    (Number(sessionObj?.realTotalTime) || 0)
    || (Array.isArray(sessionObj?.exerciseDurations) ? sessionObj.exerciseDurations.reduce((a, b) => a + (Number(b) || 0), 0) : 0)

  const outdoorBikeRaw = sessionObj?.outdoorBike && typeof sessionObj.outdoorBike === 'object' ? sessionObj.outdoorBike : null
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
    const durationInMinutes = totalTimeSeconds / 60
    return Math.round((currentVolume * 0.02) + (durationInMinutes * 4))
  })()

  const prevLogsMap: any = {};
  const prevBaseMap: any = {};
  if (prevLogsByExercise) {
    Object.keys(prevLogsByExercise).forEach((k) => {
      const key = normalizeExerciseKey(k)
      if (!key) return
      const logs = prevLogsByExercise[k]
      if (!Array.isArray(logs)) return
      prevLogsMap[key] = logs
      if (prevBaseMsByExercise && prevBaseMsByExercise[k] != null) {
        prevBaseMap[key] = prevBaseMsByExercise[k]
      }
    })
  } else {
    const safePrevLogs = prevObj?.logs && typeof prevObj.logs === 'object' ? prevObj.logs : {}
    if (prevObj && Array.isArray(prevObj?.exercises)) {
      prevObj.exercises.forEach((ex, exIdx) => {
        if (!ex || typeof ex !== 'object') return
        const exName = String(ex?.name || '').trim()
        const key = normalizeExerciseKey(exName)
        if (!key) return
        const exLogs: any[] = [];
        Object.keys(safePrevLogs).forEach((k) => {
          const parts = String(k || '').split('-')
          const eIdx = parseInt(parts[0] || '0', 10)
          const sIdx = parseInt(parts[1] || '0', 10)
          if (!Number.isFinite(eIdx) || !Number.isFinite(sIdx)) return
          if (eIdx !== exIdx) return
          exLogs[sIdx] = safePrevLogs[k]
        })
        prevLogsMap[key] = exLogs
      })
    }
  }

  const exercisesArray = Array.isArray(sessionObj?.exercises) ? sessionObj.exercises : []
  const exercises = exercisesArray.map((ex, exIdx) => {
    const setsPlanned = parseInt(ex?.sets || 0, 10)
    const exKey = normalizeExerciseKey(ex?.name)
    const prevLogs = prevLogsMap[exKey] || []
    const baseMs = prevBaseMap[exKey]
    const baseLabel = baseMs ? `Base: ${formatShortDate(baseMs)}` : null

    const sets: any[] = [];
    for (let sIdx = 0; sIdx < setsPlanned; sIdx++) {
      const key = `${exIdx}-${sIdx}`
      const log = sessionLogs[key]
      if (!log || typeof log !== 'object') continue
      if (!log.weight && !log.reps) continue

      const prevLog = prevLogs[sIdx]

      const cw = Number(String(log.weight ?? '').replace(',', '.'))
      const cr = Number(String(log.reps ?? '').replace(',', '.'))
      const pw = prevLog && typeof prevLog === 'object' ? Number(String(prevLog.weight ?? '').replace(',', '.')) : NaN
      const pr = prevLog && typeof prevLog === 'object' ? Number(String(prevLog.reps ?? '').replace(',', '.')) : NaN

      const canWeight = Number.isFinite(cw) && cw > 0 && Number.isFinite(pw) && pw > 0
      const canReps = Number.isFinite(cr) && cr > 0 && Number.isFinite(pr) && pr > 0

      let progression = null
      if (prevLog && typeof prevLog === 'object') {
        if (canWeight) {
          const delta = cw - pw
          const fmt = (n) => (Number.isFinite(n) ? String(n).replace(/\.0+$/, '') : String(n))
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

      const note = (log && (log.note || log.observation)) || null
      const tag = getSetTag(log)
      sets.push({
        index: sIdx + 1,
        weight: log.weight ?? null,
        reps: log.reps ?? null,
        cadence: ex?.cadence ?? null,
        tag,
        note,
        progression,
      })
    }

    const showProgression = sets.some((s) => s?.progression && s.progression.type && s.progression.type !== 'none')

    return {
      name: String(ex?.name || '').trim(),
      method: ex?.method && ex.method !== 'Normal' ? String(ex.method) : null,
      rpe: ex?.rpe ?? null,
      cadence: ex?.cadence ?? null,
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
        if (!log || typeof log !== 'object') return
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
      logoUrl: `${origin}/icone.png`,
    },
    athlete: {
      id: sessionObj?.user_id || sessionObj?.userId || null,
      name: String(studentName || '').trim(),
      coachName: null,
      units: 'kg',
    },
    session: {
      workoutId: sessionObj?.id ?? null,
      workoutTitle: String(sessionObj?.workoutTitle || 'Treino'),
      startAt: sessionObj?.date ? new Date(sessionObj.date?.toDate ? sessionObj.date.toDate() : sessionObj.date).toISOString() : null,
      endAt: null,
      totalTimeSeconds,
      realTimeSeconds: realTotalTimeSeconds,
      status: 'completed',
      isTeamSession: false,
      notes: null,
    },
    summaryMetrics,
    outdoorBike,
    exercises,
    ai: aiRaw,
  }
}

export function buildReportHTML(session, previousSession, studentName = '', kcalOverride = null, options = null) {
  const reportData = buildReportData(session, previousSession, studentName, kcalOverride, options)
  const aiRaw = reportData?.ai && typeof reportData.ai === 'object' ? reportData.ai : null

  const volumeDeltaStr = reportData?.summaryMetrics?.volumeDeltaPctVsPrev != null
    ? Number(reportData.summaryMetrics.volumeDeltaPctVsPrev).toFixed(1)
    : '0.0'

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

    const prs = Array.isArray(aiRaw?.prs) ? aiRaw.prs.filter(Boolean) : []
    const prItems = prs.slice(0, 10).map((p) => {
      const ex = escapeHtml(p?.exercise || p?.name || '')
      const val = escapeHtml(p?.value || p?.text || '')
      if (!ex && !val) return ''
      return `<li><span style="font-weight:900; color:#f5f5f5">${ex || 'PR'}</span><span style="color:#a3a3a3"> — ${val}</span></li>`
    }).filter(Boolean)

    const progression = Array.isArray(aiRaw?.progression) ? aiRaw.progression.filter(Boolean) : []
    const progItems = progression.slice(0, 10).map((it) => {
      const ex = escapeHtml(it?.exercise || it?.name || '')
      const rec = escapeHtml(it?.recommendation || it?.action || it?.text || '')
      if (!ex && !rec) return ''
      return `<li><span style="font-weight:900; color:#f5f5f5">${ex || 'Ajuste'}</span><span style="color:#a3a3a3"> — ${rec}</span></li>`
    }).filter(Boolean)

    const bullets = (items) => {
      if (!items?.length) return ''
      return `<ul style="margin:10px 0 0; padding-left: 18px; display:grid; gap: 6px">${items.map((v) => `<li style="color:#e5e7eb">${escapeHtml(v)}</li>`).join('')}</ul>`
    }

    const summaryBlock = (() => {
      if (summaryItems.length) return bullets(summaryItems)
      if (summaryText) return `<div style="font-size:14px; color:#f5f5f5; font-weight:700">${escapeHtml(summaryText)}</div>`
      return ''
    })()

    const sections: any[] = [];
    if (rating != null) {
      const filled = '★'.repeat(rating)
      const empty = '☆'.repeat(Math.max(0, 5 - rating))
      sections.push(`
        <div class="card" style="border-color: rgba(245, 158, 11, .35); background: rgba(245, 158, 11, .06)">
          <div class="muted" style="margin-bottom:8px; color:#f59e0b">Avaliação da IA</div>
          <div style="font-size:20px; letter-spacing:6px; color:#fbbf24; font-weight:900">${escapeHtml(filled + empty)}</div>
          <div style="margin-top:6px; font-size:12px; color:#e5e7eb; font-weight:900">${escapeHtml(String(rating))}/5</div>
          ${ratingReason ? `<div style="margin-top:10px; font-size:12px; color:#a3a3a3">${escapeHtml(ratingReason)}</div>` : ''}
        </div>
      `)
    }
    if (summaryBlock) {
      sections.push(`
        <div class="card" style="border-color: rgba(245, 158, 11, .35); background: rgba(245, 158, 11, .06)">
          <div class="muted" style="margin-bottom:8px; color:#f59e0b">Insights da IA</div>
          ${summaryBlock}
          ${motivation ? `<div style="margin-top:10px; font-size:12px; color:#a3a3a3">${escapeHtml(motivation)}</div>` : ''}
        </div>
      `)
    }
    if (highlights.length) {
      sections.push(`
        <div class="card">
          <div class="muted" style="margin-bottom:8px">Pontos Fortes</div>
          ${bullets(highlights)}
        </div>
      `)
    }
    if (warnings.length) {
      sections.push(`
        <div class="card" style="border-color: rgba(239, 68, 68, .35); background: rgba(239, 68, 68, .06)">
          <div class="muted" style="margin-bottom:8px; color:#ef4444">Alertas</div>
          ${bullets(warnings)}
        </div>
      `)
    }
    if (prItems.length) {
      sections.push(`
        <div class="card">
          <div class="muted" style="margin-bottom:8px">PRs</div>
          <ul style="margin:10px 0 0; padding-left: 18px; display:grid; gap: 6px">${prItems.join('')}</ul>
        </div>
      `)
    }
    if (progItems.length) {
      sections.push(`
        <div class="card">
          <div class="muted" style="margin-bottom:8px">Progressão Sugerida</div>
          <ul style="margin:10px 0 0; padding-left: 18px; display:grid; gap: 6px">${progItems.join('')}</ul>
        </div>
      `)
    }

    if (!sections.length) return ''
    return `
      <div style="margin: 10px 0 26px; page-break-inside: avoid">
        <div class="muted" style="margin-bottom:10px">Análise Inteligente</div>
        <div class="grid-2">${sections.join('')}</div>
      </div>
    `
  }

  const buildBikeCards = () => {
    const bike = reportData?.outdoorBike && typeof reportData.outdoorBike === 'object' ? reportData.outdoorBike : null
    if (!bike) return ''
    const km = Number(bike?.distanceKm)
    const dur = Number(bike?.durationSeconds)
    const avg = Number(bike?.avgSpeedKmh)
    const max = Number(bike?.maxSpeedKmh)
    if ((!Number.isFinite(km) || km <= 0) && (!Number.isFinite(dur) || dur <= 0)) return ''
    const formatKmh = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? `${Number(v).toFixed(1)} km/h` : '-')
    return `
      <div style="margin: 12px 0 24px">
        <div class="muted" style="margin-bottom:8px">Bike Outdoor</div>
        <div class="stats" style="grid-template-columns:repeat(4,1fr); margin-bottom:0">
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Distância</div>
            <div style="font-size:20px; font-family: ui-monospace; font-weight:800">${Number.isFinite(km) && km > 0 ? `${km.toFixed(2)} km` : '-'}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Vel. Média</div>
            <div style="font-size:20px; font-family: ui-monospace; font-weight:800">${formatKmh(avg)}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Vel. Máx</div>
            <div style="font-size:20px; font-family: ui-monospace; font-weight:800">${formatKmh(max)}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Tempo Bike</div>
            <div style="font-size:20px; font-family: ui-monospace; font-weight:800">${formatDuration(dur || 0)}</div>
          </div>
        </div>
      </div>
    `
  }

  const exercisesHtml = (Array.isArray(reportData?.exercises) ? reportData.exercises : []).map((ex, exIdx) => {
    const sets = Array.isArray(ex?.sets) ? ex.sets : []
    if (!sets.length) return ''
    const showProgression = !!ex?.showProgression
    const baseText = ex?.baseLabel ? String(ex.baseLabel) : ''
    const method = ex?.method ? String(ex.method) : ''
    const rpe = ex?.rpe != null ? String(ex.rpe) : ''

    const rows = sets.map((set) => {
      const tag = set?.tag ? String(set.tag) : ''
      const tagHtml = tag ? `<span style="margin-left:4px; font-size:10px; color:#a3a3a3">(${escapeHtml(tag)})</span>` : ''
      const note = set?.note ? String(set.note) : ''
      const weight = set?.weight ?? '-'
      const reps = set?.reps ?? '-'
      const cadence = set?.cadence ?? '-'
      const prog = set?.progression && typeof set.progression === 'object' ? set.progression : null
      const progText = prog?.deltaText ? String(prog.deltaText) : '-'
      const direction = prog?.direction ? String(prog.direction) : ''
      const progClass =
        direction === 'up'
          ? 'color:#22c55e; font-weight:900; background: rgba(34,197,94,.12); border: 1px solid rgba(34,197,94,.22)'
          : direction === 'down'
            ? 'color:#ef4444; font-weight:900; background: rgba(239,68,68,.10); border: 1px solid rgba(239,68,68,.20)'
            : 'color:#e5e7eb; font-weight:900; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10)'

      let rowHtml = `
        <tr style="border-bottom:1px solid #262626">
          <td style="padding:12px; font-family: ui-monospace; color:#a3a3a3">#${escapeHtml(set?.index || '')}${tagHtml}</td>
          <td style="padding:12px; text-align:center; font-weight:800; font-size:16px; color:#f5f5f5">${escapeHtml(weight)}</td>
          <td style="padding:12px; text-align:center; font-family: ui-monospace; color:#e5e7eb">${escapeHtml(reps)}</td>
          <td style="padding:12px; text-align:center; font-family: ui-monospace; color:#e5e7eb">${escapeHtml(cadence)}</td>
          ${showProgression ? `<td style="padding:10px 12px; text-align:center; font-size:12px; text-transform:uppercase; border-radius:999px; ${progClass}">${escapeHtml(progText)}</td>` : ''}
        </tr>`

      if (note) {
        const colSpan = showProgression ? 5 : 4
        rowHtml += `
        <tr>
          <td colspan="${colSpan}" style="padding:8px 12px; font-size:12px; color:#d4d4d4; background: rgba(255,255,255,.04)">Obs: ${escapeHtml(note)}</td>
        </tr>`
      }
      return rowHtml
    }).join('')

    return `
      <div style="page-break-inside: avoid; margin-bottom:24px">
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; border-bottom:2px solid #262626; padding-bottom:8px">
          <h3 style="font-size:18px; font-weight:800; text-transform:uppercase; display:flex; align-items:center; gap:8px">
            <span style="background:#f59e0b; color:#0b0b0c; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border-radius:6px; font-size:12px">${exIdx + 1}</span>
            ${escapeHtml(ex?.name || '')}
          </h3>
          <div style="display:flex; gap:12px; font-size:12px; font-family: ui-monospace; color:#a3a3a3">
            ${baseText ? `<span>${escapeHtml(baseText)}</span>` : ''}
            ${method ? `<span style="color:#ef4444; font-weight:900; text-transform:uppercase">${escapeHtml(method)}</span>` : ''}
            ${rpe ? `<span>RPE: <span style="font-weight:900; color:#f5f5f5">${escapeHtml(rpe)}</span></span>` : ''}
          </div>
        </div>
        <table style="width:100%; font-size:14px; border-collapse:collapse">
          <thead>
            <tr style="color:#e5e7eb; border-bottom:1px solid #262626">
              <th style="padding:8px; text-align:left; width:64px; border-bottom:1px solid #262626">Série</th>
              <th style="padding:8px; text-align:center; width:96px; border-bottom:1px solid #262626">Carga</th>
              <th style="padding:8px; text-align:center; width:96px; border-bottom:1px solid #262626">Reps</th>
              <th style="padding:8px; text-align:center; width:80px; border-bottom:1px solid #262626">Cad</th>
              ${showProgression ? `<th style="padding:8px; text-align:center; width:128px; border-bottom:1px solid #262626">Evolução</th>` : ''}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }).filter(Boolean).join('')

  const logoUrl = String(reportData?.brand?.logoUrl || '')
  const safeLogoUrl = /^https?:\/\//i.test(logoUrl) ? escapeHtml(logoUrl) : ''
  const aiSectionHtml = buildAiSection()
  const workoutTitleSafe = escapeHtml(reportData?.session?.workoutTitle || 'Treino')
  const studentNameSafe = escapeHtml(reportData?.athlete?.name || '')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Relatório IronTracks</title>
      <style>
        * { box-sizing: border-box; }
        body {
          background: #0a0a0a;
          color: #fafafa;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          margin: 0;
          line-height: 1.35;
        }
        img { max-width: 100%; height: auto; }
        .container { max-width: 880px; margin: 0 auto; padding: 28px; }
        .header {
          border-bottom: 1px solid #262626;
          padding-bottom: 20px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .brand { font-size: 34px; font-weight: 900; font-style: italic; letter-spacing: -0.03em; line-height: 1; }
        .muted { color: #a3a3a3; font-weight: 800; text-transform: uppercase; letter-spacing: .18em; font-size: 11px; }
        .card {
          background: #171717;
          border: 1px solid #262626;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 1px 0 rgba(0,0,0,.35);
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .card-accent { background: rgba(245, 158, 11, .08); border-color: rgba(245, 158, 11, .35); }
        .card-accent .muted { color: #f59e0b; }
        .card-invert { background: #000; border-color: #262626; color: #fff; }
        .card-invert .muted { color: #a3a3a3; }
        .value {
          font-size: clamp(20px, 5.6vw, 28px);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-weight: 800;
          line-height: 1.05;
          overflow-wrap: anywhere;
        }
        .value-accent { color: #f59e0b; }
        .value-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
        .unit { font-size: 12px; font-weight: 900; color: #a3a3a3; text-transform: uppercase; letter-spacing: .08em; }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 14px;
          margin-bottom: 22px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        @media (max-width: 520px) {
          .container { padding: 16px; }
          .brand { font-size: 30px; }
          .header { padding-bottom: 16px; margin-bottom: 18px; }
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .grid-2 { grid-template-columns: 1fr; }
        }
        @media print {
          @page { size: auto; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .container { max-width: none; padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="display:flex; align-items:flex-end; gap:12px">
            <img src="${safeLogoUrl}" alt="IronTracks" style="width:40px; height:40px; border-radius:10px; object-fit:contain; border:1px solid rgba(245,158,11,.55); background:#000" />
            <div>
              <div class="brand">IRONTRACKS</div>
              <div class="muted">Relatório de Performance</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px; font-weight:900; color:#fafafa">${workoutTitleSafe}</div>
            <div style="color:#a3a3a3">${escapeHtml(formatDate(session?.date))}</div>
            ${studentNameSafe ? `<div style="color:#a3a3a3; font-size:12px; text-transform:uppercase; letter-spacing:.08em">Aluno: <span style="color:#fafafa; font-weight:900">${studentNameSafe}</span></div>` : ''}
          </div>
        </div>

        <div class="stats">
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Tempo Total</div>
            <div class="value">${formatDuration(reportData?.session?.totalTimeSeconds || 0)}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Tempo Real</div>
            <div class="value">${formatDuration(reportData?.session?.realTimeSeconds || 0)}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Séries</div>
            <div class="value-row">
              <span class="value">${Number(reportData?.summaryMetrics?.setsLoggedCount || 0).toLocaleString('pt-BR')}</span>
              <span class="unit">sets</span>
              <span style="font-size:12px; font-weight:900; color:#a3a3a3">${Number(reportData?.summaryMetrics?.exercisesLoggedCount || 0).toLocaleString('pt-BR')} ex</span>
            </div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Volume (Kg)</div>
            <div class="value-row">
              <span class="value">${Number(reportData?.summaryMetrics?.volumeTotal || 0).toLocaleString('pt-BR')}</span>
              <span class="unit">kg</span>
              ${reportData?.summaryMetrics?.volumeDeltaPctVsPrev != null ? `<span style="font-size:12px; font-weight:900; color:${Number(reportData.summaryMetrics.volumeDeltaPctVsPrev) >= 0 ? '#22c55e' : '#ef4444'}">${Number(reportData.summaryMetrics.volumeDeltaPctVsPrev) > 0 ? '+' : ''}${escapeHtml(volumeDeltaStr)}%</span>` : ''}
            </div>
          </div>
          <div class="card card-accent">
            <div class="muted" style="margin-bottom:4px">Calorias</div>
            <div class="value value-accent">~${Number(reportData?.summaryMetrics?.caloriesEstimate || 0) || 0}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Reps</div>
            <div class="value-row">
              <span class="value">${Number(reportData?.summaryMetrics?.repsTotal || 0).toLocaleString('pt-BR')}</span>
              <span class="unit">reps</span>
              ${Number(reportData?.summaryMetrics?.topWeight || 0) > 0 ? `<span style="font-size:12px; font-weight:900; color:#a3a3a3">Top: ${Number(reportData?.summaryMetrics?.topWeight || 0).toLocaleString('pt-BR')}kg</span>` : ''}
            </div>
          </div>
          <div class="card card-invert">
            <div class="muted" style="margin-bottom:4px">Status</div>
            <div style="font-size:16px; font-weight:800; text-transform:uppercase; font-style:italic">Concluído</div>
          </div>
        </div>

        ${buildBikeCards()}

        ${aiSectionHtml}

        ${exercisesHtml}

        <div style="margin-top:32px; padding-top:16px; border-top:1px solid #262626; text-align:center; font-size:12px; color:#a3a3a3; text-transform:uppercase; letter-spacing:.2em">IronTracks System</div>
      </div>
    </body>
  </html>`
}
