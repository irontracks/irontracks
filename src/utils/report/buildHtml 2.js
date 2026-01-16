export function buildReportHTML(session, previousSession, studentName = '') {
  const formatDate = (ts) => {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  const formatDuration = (s) => {
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }
  const calculateTotalVolume = (logs) => {
    let volume = 0
    Object.values(logs || {}).forEach(log => {
      if (log && log.weight && log.reps) volume += (parseFloat(log.weight) * parseFloat(log.reps))
    })
    return volume
  }
  const currentVolume = calculateTotalVolume(session?.logs || {})
  const prevVolume = previousSession ? calculateTotalVolume(previousSession.logs || {}) : 0
  const volumeDelta = prevVolume > 0 ? (((currentVolume - prevVolume) / prevVolume) * 100).toFixed(1) : '0.0'
  const durationInMinutes = ((session && session.totalTime) || 0) / 60
  const realTotalTime = (session && session.realTotalTime)
    || (Array.isArray(session?.exerciseDurations) ? session.exerciseDurations.reduce((a,b)=>a+(b||0),0) : 0)
  const calories = Math.round((currentVolume * 0.02) + (durationInMinutes * 4))

  const prevLogsMap = {}
  if (previousSession && Array.isArray(previousSession.exercises) && previousSession.logs) {
    previousSession.exercises.forEach((ex, exIdx) => {
      const exLogs = []
      Object.keys(previousSession.logs || {}).forEach(key => {
        const parts = String(key || '').split('-')
        const eIdx = parseInt(parts[0] || '0', 10)
        if (eIdx === exIdx) exLogs.push(previousSession.logs[key])
      })
      if (ex && ex.name) prevLogsMap[ex.name] = exLogs
    })
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
    const prevLogs = prevLogsMap[ex?.name] || []
    if (!sets || !Array.isArray(prevLogs) || prevLogs.length === 0) return false
    for (let sIdx = 0; sIdx < sets; sIdx++) {
      const prevLog = prevLogs[sIdx]
      if (prevLog && prevLog.weight) return true
    }
    return false
  }

  const rowsHtml = (ex, exIdx, showProgression) => {
    const sets = parseInt(ex?.sets || 0, 10)
    const prevLogs = prevLogsMap[ex?.name] || []
    let rows = ''
    for (let sIdx = 0; sIdx < sets; sIdx++) {
      const key = `${exIdx}-${sIdx}`
      const log = session && session.logs ? session.logs[key] : null
      const prevLog = prevLogs[sIdx]
      if (!log || (!log.weight && !log.reps)) continue
      let progressionText = '-'
      let progressionClass = ''
      if (prevLog && prevLog.weight) {
        const delta = parseFloat(log.weight) - parseFloat(prevLog.weight)
        if (delta > 0) { progressionText = `+${delta}kg`; progressionClass = 'color: #065f46; font-weight: 700; background: #ecfdf5' }
        else if (delta < 0) { progressionText = `${delta}kg`; progressionClass = 'color: #dc2626; font-weight: 700' }
        else progressionText = '='
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
    return `
    <div style="page-break-inside: avoid; margin-bottom:24px">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; border-bottom:2px solid #e5e7eb; padding-bottom:8px">
        <h3 style="font-size:18px; font-weight:800; text-transform:uppercase; display:flex; align-items:center; gap:8px">
          <span style="background:#000; color:#fff; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border-radius:4px; font-size:12px">${exIdx + 1}</span>
          ${ex?.name || ''}
        </h3>
        <div style="display:flex; gap:12px; font-size:12px; font-family: ui-monospace; color:#6b7280">
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
        body { background:#fff; color:#000; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin:0; }
        .container { max-width:860px; margin:0 auto; padding:24px; }
        .header { border-bottom:4px solid #000; padding-bottom:24px; margin-bottom:32px; display:flex; justify-content:space-between; align-items:flex-end }
        .brand { font-size:36px; font-weight:900; font-style:italic; letter-spacing:-0.02em }
        .muted { color:#6b7280; font-weight:700; text-transform:uppercase; letter-spacing:.2em }
        .card { background:#f5f5f5; border:1px solid #e5e7eb; border-radius:12px; padding:16px }
        .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:32px }
        @media print {
          @page { size:auto; margin:0mm; }
          body { -webkit-print-color-adjust:exact; margin:0; }
          .no-print { display:none !important; }
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
            <div style="font-size:28px; font-family: ui-monospace; font-weight:800">${formatDuration(session.totalTime || 0)}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Tempo Real</div>
            <div style="font-size:28px; font-family: ui-monospace; font-weight:800">${formatDuration(realTotalTime || 0)}</div>
          </div>
          <div class="card">
            <div class="muted" style="margin-bottom:4px">Volume (Kg)</div>
            <div style="display:flex; gap:8px; align-items:baseline">
              <div style="font-size:28px; font-family: ui-monospace; font-weight:800">${currentVolume.toLocaleString()}kg</div>
              ${previousSession ? `<span style="font-size:12px; font-weight:700; color:${parseFloat(volumeDelta) >= 0 ? '#16a34a' : '#dc2626'}">${parseFloat(volumeDelta) > 0 ? '+' : ''}${volumeDelta}%</span>` : ''}
            </div>
          </div>
          <div class="card" style="background:#fff4e5; border-color:#fed7aa">
            <div class="muted" style="color:#ea580c; margin-bottom:4px">Calorias</div>
            <div style="font-size:28px; font-family: ui-monospace; font-weight:800; color:#ea580c">~${calories}</div>
          </div>
          <div style="background:#000; color:#fff; border-radius:12px; padding:16px">
            <div class="muted" style="color:#9ca3af; margin-bottom:4px">Status</div>
            <div style="font-size:16px; font-weight:800; text-transform:uppercase; font-style:italic">Concluído</div>
          </div>
        </div>

        ${exercisesHtml}

        <div style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; text-align:center; font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:.2em">IronTracks System</div>
      </div>
    </body>
  </html>`
}
