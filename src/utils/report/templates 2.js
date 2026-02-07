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
        *{box-sizing:border-box}
        body{margin:0;background:#fff;color:#0b0b0c;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.35}
        .container{max-width:880px;margin:0 auto;padding:28px}
        .header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;border-bottom:3px solid #0b0b0c;padding-bottom:20px;margin-bottom:24px}
        .brand{font-weight:900;font-size:34px;letter-spacing:-1px;line-height:1}
        .brand .muted{color:#6b7280;font-style:italic}
        .subtitle{font-size:11px;text-transform:uppercase;color:#6b7280;font-weight:800;letter-spacing:.18em}
        .title{font-size:20px;font-weight:900;word-break:break-word}
        .date{font-size:12px;color:#6b7280}
        .card{background:#f7f7f8;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 1px 0 rgba(0,0,0,.06);break-inside:avoid;page-break-inside:avoid}
        .card-head{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
        .badge{background:#0b0b0c;color:#fff;border-radius:8px;min-width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;font-size:12px}
        .card-head h3{margin:0;display:flex;align-items:center;gap:10px;font-size:18px;line-height:1.15;word-break:break-word}
        .meta{font-size:12px;color:#4b5563}
        .notes{font-size:12px;color:#111827;margin:8px 0 0}
        table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #eef2f7;border-radius:12px;overflow:hidden}
        thead{display:table-header-group}
        th,td{border-bottom:1px solid #eef2f7;padding:10px 8px;text-align:left;font-size:12px}
        th{color:#6b7280;text-transform:uppercase;font-weight:800;font-size:10px;letter-spacing:.16em;background:#fafafa}
        tr{break-inside:avoid;page-break-inside:avoid}
        .footer{margin-top:26px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.18em}
        @media (max-width:520px){
          .container{padding:16px}
          .brand{font-size:30px}
          .header{padding-bottom:16px;margin-bottom:18px}
          .title{font-size:18px}
        }
        @media print{
          @page{size:auto;margin:12mm}
          body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .container{max-width:none;padding:0}
        }
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
