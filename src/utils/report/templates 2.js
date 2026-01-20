export function workoutPlanHtml(workout, user) {
  const title = workout?.title || 'Treino'
  const exs = Array.isArray(workout?.exercises) ? workout.exercises : []
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const owner = user?.displayName || user?.email || ''

  const rows = exs.map((ex, idx) => {
    const sets = Number(ex?.sets || 0)
    const reps = ex?.reps || '-'
    const method = ex?.method || 'Normal'
    const cadence = ex?.cadence || '-'
    const rpe = ex?.rpe || '-'
    const notes = ex?.notes || ''
    return `
      <div class="card">
        <div class="card-head">
          <div class="badge">${idx + 1}</div>
          <h3>${ex?.name || ''}</h3>
          <div class="meta">Método: <b>${method}</b> • Reps: <b>${reps}</b> • Cad: <b>${cadence}</b> • RPE: <b>${rpe}</b></div>
        </div>
        ${notes ? `<p class="notes">${notes}</p>` : ''}
        <table>
          <thead>
            <tr><th>Série</th><th>Reps</th><th>Descanso</th></tr>
          </thead>
          <tbody>
            ${Array.from({ length: sets }).map((_, sIdx) => `<tr><td>#${sIdx + 1}</td><td>${reps}</td><td>${ex?.restTime ? `${parseInt(ex.restTime)}s` : '-'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `
  }).join('')

  return `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title} • Ficha de Treino</title>
      <style>
        *{box-sizing:border-box} body{margin:0;background:#fff;color:#000;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
        .container{max-width:840px;margin:0 auto;padding:32px}
        .header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #000;padding-bottom:16px;margin-bottom:24px}
        .brand{font-weight:900;font-size:32px;letter-spacing:-1px}
        .brand .muted{color:#555;font-style:italic}
        .subtitle{font-size:12px;text-transform:uppercase;color:#666;font-weight:700;letter-spacing:2px}
        .title{font-size:20px;font-weight:800}
        .date{font-size:12px;color:#666}
        .card{background:#f7f7f7;border:1px solid #ddd;border-radius:12px;padding:16px;margin-bottom:16px}
        .card-head{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
        .badge{background:#000;color:#fff;border-radius:6px;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;margin-right:8px}
        .card-head h3{margin:0;display:flex;align-items:center;gap:8px;font-size:18px}
        .meta{font-size:12px;color:#555}
        .notes{font-size:12px;color:#333;margin:8px 0}
        table{width:100%;border-collapse:collapse;background:#fff}
        th,td{border-bottom:1px solid #eee;padding:8px 6px;text-align:left;font-size:12px}
        th{color:#666;text-transform:uppercase;font-weight:700;font-size:11px}
        .footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:2px}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <div class="brand">IRON<span class="muted">TRACKS</span></div>
            <div class="subtitle">Ficha de Treino</div>
          </div>
          <div style="text-align:right">
            <div class="title">${title}</div>
            <div class="date">${dateStr}${owner ? ` • ${owner}` : ''}</div>
          </div>
        </div>
        ${rows || '<p style="color:#666">Este treino não possui exercícios.</p>'}
        <div class="footer">IronTracks System • ${dateStr}</div>
      </div>
    </body>
  </html>`
}

