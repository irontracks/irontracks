export function buildReportHTML(session, previousSession, studentName = '', kcalOverride = null, options = null) {
  const opts = options && typeof options === 'object' ? options : {}
  const prevLogsByExercise = opts?.prevLogsByExercise && typeof opts.prevLogsByExercise === 'object' ? opts.prevLogsByExercise : null
  const prevBaseMsByExercise =
    opts?.prevBaseMsByExercise && typeof opts.prevBaseMsByExercise === 'object' ? opts.prevBaseMsByExercise : null

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
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }
  const calculateTotalVolume = (logs) => {
    try {
      let volume = 0
      const safeLogs = logs && typeof logs === 'object' ? logs : {}
      Object.values(safeLogs).forEach((log) => {
        if (!log || typeof log !== 'object') return
        const w = Number(String(log.weight ?? '').replace(',', '.'))
        const r = Number(String(log.reps ?? '').replace(',', '.'))
        if (!Number.isFinite(w) || !Number.isFinite(r)) return
        if (w <= 0 || r <= 0) return
        volume += w * r
      })
      return volume
    } catch {
      return 0
    }
  }
  const currentVolume = calculateTotalVolume(session?.logs || {})
  const prevVolume = previousSession ? calculateTotalVolume(previousSession.logs || {}) : 0
  const volumeDelta = prevVolume > 0 ? (((currentVolume - prevVolume) / prevVolume) * 100).toFixed(1) : '0.0'
  const durationInMinutes = ((session && session.totalTime) || 0) / 60
  const realTotalTime = (session && session.realTotalTime)
    || (Array.isArray(session?.exerciseDurations) ? session.exerciseDurations.reduce((a,b)=>a+(b||0),0) : 0)
  const outdoorBike = session?.outdoorBike && typeof session.outdoorBike === 'object' ? session.outdoorBike : null
  const calories = (() => {
    const ov = Number(kcalOverride)
    if (Number.isFinite(ov) && ov > 0) return Math.round(ov)
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)
    return Math.round((currentVolume * 0.02) + (durationInMinutes * 4))
  })()

  const bikeCards = (() => {
    if (!outdoorBike) return ''
    const dist = Number(outdoorBike?.distanceMeters)
    const dur = Number(outdoorBike?.durationSeconds)
    if ((!Number.isFinite(dist) || dist <= 0) && (!Number.isFinite(dur) || dur <= 0)) return ''
    const km = Number.isFinite(dist) && dist > 0 ? (dist / 1000) : 0
    const avg = Number(outdoorBike?.avgSpeedKmh)
    const max = Number(outdoorBike?.maxSpeedKmh)
    const formatKmh = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? `${Number(v).toFixed(1)} km/h` : '-')
    return `
      <div style="margin: 12px 0 24px">
        <div class="muted" style="margin-bottom:8px">Bike Outdoor</div>
        <div class="stats" style="grid-template-columns:repeat(4,1fr); margin-bottom:0">
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Distância</div>
            <div style="font-size:20px; font-family: ui-monospace; font-weight:800">${km > 0 ? `${km.toFixed(2)} km` : '-'}</div>
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
  })()

  const normalizeExerciseKey = (v) => {
    try {
      return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')
    } catch {
      return ''
    }
  }

  const prevLogsMap = {}
  const prevBaseMap = {}
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
    const safePrevLogs = previousSession?.logs && typeof previousSession.logs === 'object' ? previousSession.logs : {}
    if (previousSession && Array.isArray(previousSession?.exercises)) {
      previousSession.exercises.forEach((ex, exIdx) => {
        if (!ex || typeof ex !== 'object') return
        const exName = String(ex?.name || '').trim()
        const key = normalizeExerciseKey(exName)
        if (!key) return
        const exLogs = []
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

  const getSetTag = (log) => {
    if (!log || typeof log !== 'object') return ''
    const isWarmup = !!(log.is_warmup ?? log.isWarmup)
    if (isWarmup) return 'Aquecimento'
    const cfg = log.advanced_config ?? log.advancedConfig
    const rawType = cfg && (cfg.type || cfg.kind || cfg.mode)
    const t = String(rawType || '').toLowerCase()
    if (!t) return ''
    if (t.includes('drop')) return 'Drop-set'
    if (t.includes('rest')) return 'Rest-pause'
    if (t.includes('cluster')) return 'Cluster'
    if (t.includes('bi')) return 'Bi-set'
    return 'Método'
  }

  const hasProgressionForExercise = (ex, exIdx) => {
    const sets = parseInt(ex?.sets || 0, 10)
    const key = normalizeExerciseKey(ex?.name)
    const prevLogs = prevLogsMap[key] || []
    if (!sets || !Array.isArray(prevLogs) || prevLogs.length === 0) return false
    for (let sIdx = 0; sIdx < sets; sIdx++) {
      const prevLog = prevLogs[sIdx]
      if (!prevLog || typeof prevLog !== 'object') continue
      const w = Number(String(prevLog.weight ?? '').replace(',', '.'))
      const r = Number(String(prevLog.reps ?? '').replace(',', '.'))
      if ((Number.isFinite(w) && w > 0) || (Number.isFinite(r) && r > 0)) return true
    }
    return false
  }

  const rowsHtml = (ex, exIdx, showProgression) => {
    const sets = parseInt(ex?.sets || 0, 10)
    const exKey = normalizeExerciseKey(ex?.name)
    const prevLogs = prevLogsMap[exKey] || []
    let rows = ''
    for (let sIdx = 0; sIdx < sets; sIdx++) {
      const key = `${exIdx}-${sIdx}`
      const safeSessionLogs = session?.logs && typeof session.logs === 'object' ? session.logs : {}
      const log = safeSessionLogs[key]
      const prevLog = prevLogs[sIdx]
      if (!log || typeof log !== 'object') continue
      if (!log.weight && !log.reps) continue
      let progressionText = '-'
      let progressionClass = ''
      if (showProgression && prevLog && typeof prevLog === 'object') {
        const cw = Number(String(log.weight ?? '').replace(',', '.'))
        const pw = Number(String(prevLog.weight ?? '').replace(',', '.'))
        const cr = Number(String(log.reps ?? '').replace(',', '.'))
        const pr = Number(String(prevLog.reps ?? '').replace(',', '.'))
        const canWeight = Number.isFinite(cw) && cw > 0 && Number.isFinite(pw) && pw > 0
        const canReps = Number.isFinite(cr) && cr > 0 && Number.isFinite(pr) && pr > 0
        if (canWeight) {
          const delta = cw - pw
          const fmt = (n) => (Number.isFinite(n) ? String(n).replace(/\.0+$/, '') : String(n))
          if (delta > 0) { progressionText = `+${fmt(delta)}kg`; progressionClass = 'color: #065f46; font-weight: 700; background: #ecfdf5' }
          else if (delta < 0) { progressionText = `${fmt(delta)}kg`; progressionClass = 'color: #dc2626; font-weight: 700' }
          else progressionText = '='
        } else if (canReps) {
          const delta = cr - pr
          if (delta > 0) { progressionText = `+${delta} reps`; progressionClass = 'color: #065f46; font-weight: 700; background: #ecfdf5' }
          else if (delta < 0) { progressionText = `${delta} reps`; progressionClass = 'color: #dc2626; font-weight: 700' }
          else progressionText = '='
        } else if (Number.isFinite(cw) && cw > 0 && Number.isFinite(cr) && cr > 0 && Number.isFinite(pw) && pw > 0 && Number.isFinite(pr) && pr > 0) {
          const curVol = cw * cr
          const prevVol = pw * pr
          const delta = curVol - prevVol
          if (delta > 0) { progressionText = `+${Math.round(delta)}kg`; progressionClass = 'color: #065f46; font-weight: 700; background: #ecfdf5' }
          else if (delta < 0) { progressionText = `${Math.round(delta)}kg`; progressionClass = 'color: #dc2626; font-weight: 700' }
          else progressionText = '='
        }
      }
      const tag = getSetTag(log)
      const tagHtml = tag ? `<span style="margin-left:4px; font-size:10px; color:#374151">(${tag})</span>` : ''
      const note = (log && (log.note || log.observation)) || ''
      rows += `
        <tr style="border-bottom:1px solid #000">
          <td style="padding:12px; font-family: ui-monospace; color:#6b7280">#${sIdx + 1}${tagHtml}</td>
          <td style="padding:12px; text-align:center; font-weight:700; font-size:16px">${log.weight || '-'}</td>
          <td style="padding:12px; text-align:center; font-family: ui-monospace">${log.reps || '-'}</td>
          <td style="padding:12px; text-align:center; font-family: ui-monospace">${ex && ex.cadence ? ex.cadence : '-'}</td>
          ${showProgression ? `<td style="padding:12px; text-align:center; font-size:12px; text-transform:uppercase; ${progressionClass}">${progressionText}</td>` : ''}
        </tr>`

      if (note) {
        const colSpan = showProgression ? 5 : 4
        rows += `
        <tr>
          <td colspan="${colSpan}" style="padding:6px 12px; font-size:12px; color:#4b5563; background:#f9fafb">Obs: ${note}</td>
        </tr>`
      }
    }
    return rows
  }

  const exercisesArray = Array.isArray(session?.exercises) ? session.exercises : []

  const exercisesHtml = exercisesArray.map((ex, exIdx) => {
    const showProgression = hasProgressionForExercise(ex, exIdx)
    const exKey = normalizeExerciseKey(ex?.name)
    const baseMs = prevBaseMap[exKey]
    const baseText = baseMs ? `Base: ${formatShortDate(baseMs)}` : ''
    return `
    <div style="page-break-inside: avoid; margin-bottom:24px">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; border-bottom:2px solid #e5e7eb; padding-bottom:8px">
        <h3 style="font-size:18px; font-weight:800; text-transform:uppercase; display:flex; align-items:center; gap:8px">
          <span style="background:#000; color:#fff; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border-radius:4px; font-size:12px">${exIdx + 1}</span>
          ${ex?.name || ''}
        </h3>
        <div style="display:flex; gap:12px; font-size:12px; font-family: ui-monospace; color:#6b7280">
          ${baseText ? `<span>${baseText}</span>` : ''}
          ${ex && ex.method && ex.method !== 'Normal' ? `<span style="color:#dc2626; font-weight:700; text-transform:uppercase">${ex.method}</span>` : ''}
          ${ex && ex.rpe ? `<span>RPE: <span style="font-weight:700; color:#000">${ex.rpe}</span></span>` : ''}
        </div>
      </div>
      <table style="width:100%; font-size:14px; border-collapse:collapse">
        <thead>
          <tr style="color:#111827; border-bottom:1px solid #000">
            <th style="padding:8px; text-align:left; width:64px; border-bottom:1px solid #000">Série</th>
            <th style="padding:8px; text-align:center; width:96px; border-bottom:1px solid #000">Carga</th>
            <th style="padding:8px; text-align:center; width:96px; border-bottom:1px solid #000">Reps</th>
            <th style="padding:8px; text-align:center; width:80px; border-bottom:1px solid #000">Cad</th>
            ${showProgression ? `<th style="padding:8px; text-align:center; width:128px; border-bottom:1px solid #000">Evolução</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml(ex, exIdx, showProgression)}
        </tbody>
      </table>
    </div>
  `}).join('')

  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : ''
  const logoUrl = `${origin}/icone.png`

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Relatório IronTracks</title>
      <style>
        * { box-sizing: border-box; }
        body {
          background: #fff;
          color: #0b0b0c;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          margin: 0;
          line-height: 1.35;
        }
        img { max-width: 100%; height: auto; }
        .container { max-width: 880px; margin: 0 auto; padding: 28px; }
        .header {
          border-bottom: 3px solid #0b0b0c;
          padding-bottom: 20px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .brand { font-size: 34px; font-weight: 900; font-style: italic; letter-spacing: -0.03em; line-height: 1; }
        .muted { color: #6b7280; font-weight: 800; text-transform: uppercase; letter-spacing: .18em; font-size: 11px; }
        .card {
          background: #f7f7f8;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 1px 0 rgba(0,0,0,.06);
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .card-accent { background: #fff7ed; border-color: #fed7aa; }
        .card-accent .muted { color: #ea580c; }
        .card-invert { background: #0b0b0c; border-color: #0b0b0c; color: #fff; }
        .card-invert .muted { color: #9ca3af; }
        .value {
          font-size: clamp(20px, 5.6vw, 28px);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-weight: 800;
          line-height: 1.05;
          overflow-wrap: anywhere;
        }
        .value-accent { color: #ea580c; }
        .value-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
        .unit { font-size: 12px; font-weight: 900; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 14px;
          margin-bottom: 22px;
        }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        @media (max-width: 520px) {
          .container { padding: 16px; }
          .brand { font-size: 30px; }
          .header { padding-bottom: 16px; margin-bottom: 18px; }
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
            <img src="${logoUrl}" alt="IronTracks" style="width:40px; height:40px; border-radius:8px; object-fit:contain; border:1px solid #000; background:#000" />
            <div>
              <div class="brand">IRONTRACKS</div>
              <div class="muted">Relatório de Performance</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px; font-weight:800">${session.workoutTitle || 'Treino'}</div>
            <div style="color:#6b7280">${formatDate(session.date)}</div>
            ${studentName ? `<div style="color:#6b7280; font-size:12px; text-transform:uppercase; letter-spacing:.08em">Aluno: <span style="color:#111; font-weight:700">${studentName}</span></div>` : ''}
          </div>
        </div>

        <div class="stats">
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Tempo Total</div>
            <div class="value">${formatDuration(session.totalTime || 0)}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Tempo Real</div>
            <div class="value">${formatDuration(realTotalTime || 0)}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Volume (Kg)</div>
            <div class="value-row">
              <span class="value">${currentVolume.toLocaleString('pt-BR')}</span>
              <span class="unit">kg</span>
              ${previousSession ? `<span style="font-size:12px; font-weight:800; color:${parseFloat(volumeDelta) >= 0 ? '#16a34a' : '#dc2626'}">${parseFloat(volumeDelta) > 0 ? '+' : ''}${volumeDelta}%</span>` : ''}
            </div>
          </div>
          <div class="card card-accent">
            <div class="muted" style="margin-bottom:4px">Calorias</div>
            <div class="value value-accent">~${calories}</div>
          </div>
          <div class="card card-invert">
            <div class="muted" style="margin-bottom:4px">Status</div>
            <div style="font-size:16px; font-weight:800; text-transform:uppercase; font-style:italic">Concluído</div>
          </div>
        </div>

        ${bikeCards}

        ${exercisesHtml}

        <div style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; text-align:center; font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:.2em">IronTracks System</div>
      </div>
    </body>
  </html>`
}
