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

const formatDate = (v) => {
  try {
    if (!v) return ''
    const d = v?.toDate ? v.toDate() : new Date(v)
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

const formatDateTime = (v) => {
  try {
    if (!v) return ''
    const d = v?.toDate ? v.toDate() : new Date(v)
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const safeNumber = (n, fallback = 0) => {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

const toLocaleInt = (n) => {
  const v = Math.max(0, Math.round(safeNumber(n, 0)))
  return v.toLocaleString('pt-BR')
}

const toPeriodLabel = (type) => (type === 'week' ? 'Relatório semanal' : type === 'month' ? 'Relatório mensal' : 'Relatório do período')

const toPeriodSubtitle = (type) => (type === 'week' ? 'Últimos 7 dias' : type === 'month' ? 'Últimos 30 dias' : 'Período selecionado')

const inferRange = (stats) => {
  try {
    const list = Array.isArray(stats?.sessionSummaries) ? stats.sessionSummaries : []
    const ms = list
      .map((s) => {
        const d = s?.date
        const t = d?.toDate ? d.toDate() : new Date(d)
        const value = t instanceof Date ? t.getTime() : NaN
        return Number.isFinite(value) ? value : null
      })
      .filter((x) => x != null)
    const days = safeNumber(stats?.days, 0)
    const now = Date.now()
    if (!ms.length) {
      const start = days > 0 ? new Date(now - days * 24 * 60 * 60 * 1000) : new Date(now)
      return { start, end: new Date(now) }
    }
    const min = Math.min(...ms)
    const max = Math.max(...ms)
    return { start: new Date(min), end: new Date(max) }
  } catch {
    const now = Date.now()
    return { start: new Date(now), end: new Date(now) }
  }
}

export function buildPeriodReportHtml(input) {
  const data = input && typeof input === 'object' ? input : {}
  const type = String(data.type || '').trim()
  const stats = data.stats && typeof data.stats === 'object' ? data.stats : {}
  const ai = data.ai && typeof data.ai === 'object' ? data.ai : null
  const baseUrl = String(data.baseUrl || '').trim()
  const userName = String(data.userName || '').trim()
  const generatedAt = data.generatedAt ? data.generatedAt : new Date()

  const title = toPeriodLabel(type)
  const subtitle = toPeriodSubtitle(type)
  const range = inferRange(stats)
  const rangeLabel = `${formatDate(range.start)} – ${formatDate(range.end)}`
  const generatedLabel = formatDateTime(generatedAt)
  const logoSrc = baseUrl ? `${baseUrl.replace(/\/$/, '')}/icone.png` : ''

  const metricCards = [
    { label: 'Treinos', value: toLocaleInt(stats?.count) },
    { label: 'Tempo total (min)', value: toLocaleInt(stats?.totalMinutes) },
    { label: 'Média por treino (min)', value: toLocaleInt(stats?.avgMinutes) },
    { label: 'Volume total (kg)', value: toLocaleInt(stats?.totalVolumeKg) },
    { label: 'Volume médio/treino (kg)', value: toLocaleInt(stats?.avgVolumeKg) },
    { label: 'Sets totais', value: toLocaleInt(stats?.totalSets) },
    { label: 'Reps totais', value: toLocaleInt(stats?.totalReps) },
    { label: 'Dias treinados', value: toLocaleInt(stats?.uniqueDaysCount) },
  ]

  const listByVol = (Array.isArray(stats?.topExercisesByVolume) ? stats.topExercisesByVolume : []).slice(0, 8)
  const listByFreq = (Array.isArray(stats?.topExercisesByFrequency) ? stats.topExercisesByFrequency : []).slice(0, 8)
  const sessions = (Array.isArray(stats?.sessionSummaries) ? stats.sessionSummaries : []).slice(0, 60)

  const aiList = (key) => {
    const arr = ai && Array.isArray(ai?.[key]) ? ai[key] : []
    return arr.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 10)
  }

  const aiSummary = aiList('summary')
  const aiHighlights = aiList('highlights')
  const aiFocus = aiList('focus')
  const aiNextSteps = aiList('nextSteps')
  const aiWarnings = aiList('warnings')

  const section = (label, content) => {
    if (!content) return ''
    return `<div class="section"><div class="section-title">${escapeHtml(label)}</div>${content}</div>`
  }

  const listSection = (label, items, tone = 'neutral') => {
    const list = Array.isArray(items) ? items : []
    if (!list.length) return ''
    const cls = tone === 'warn' ? 'list warn' : tone === 'accent' ? 'list accent' : 'list'
    return section(
      label,
      `<ul class="${cls}">${list.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
    )
  }

  const topExercisesTable = (label, rows) => {
    const list = Array.isArray(rows) ? rows : []
    if (!list.length) return ''
    const body = list
      .map((r) => {
        const name = escapeHtml(r?.name || 'Exercício')
        const sets = toLocaleInt(r?.sets)
        const sessionsCount = toLocaleInt(r?.sessionsCount)
        const vol = toLocaleInt(r?.volumeKg)
        return `<tr><td class="name">${name}</td><td>${sets}</td><td>${sessionsCount}</td><td class="mono">${vol}</td></tr>`
      })
      .join('')
    return section(
      label,
      `<table class="table"><thead><tr><th>Exercício</th><th>Sets</th><th>Sessões</th><th>Volume (kg)</th></tr></thead><tbody>${body}</tbody></table>`
    )
  }

  const sessionsTable = () => {
    if (!sessions.length) return ''
    const body = sessions
      .slice()
      .sort((a, b) => {
        const ta = new Date(a?.date || 0).getTime()
        const tb = new Date(b?.date || 0).getTime()
        return tb - ta
      })
      .map((s) => {
        const date = escapeHtml(formatDate(s?.date) || '')
        const minutes = toLocaleInt(s?.minutes)
        const vol = toLocaleInt(s?.volumeKg)
        return `<tr><td class="mono">${date}</td><td class="mono">${minutes}</td><td class="mono">${vol}</td></tr>`
      })
      .join('')
    return section(
      'Sessões do período',
      `<table class="table"><thead><tr><th>Data</th><th>Duração (min)</th><th>Volume (kg)</th></tr></thead><tbody>${body}</tbody></table>`
    )
  }

  const cards = metricCards
    .map((m) => `<div class="card"><div class="card-label">${escapeHtml(m.label)}</div><div class="card-value mono">${escapeHtml(m.value)}</div></div>`)
    .join('')

  const insights =
    listSection('Resumo (IA)', aiSummary, 'accent') +
    listSection('Destaques', aiHighlights) +
    listSection('Foco', aiFocus) +
    listSection('Próximos passos', aiNextSteps) +
    listSection('Atenções', aiWarnings, 'warn')

  const owner = userName ? ` • ${escapeHtml(userName)}` : ''

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} • IRONTRACKS</title>
    <style>
      *{box-sizing:border-box}
      body{margin:0;background:#ffffff;color:#0b0b0c;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.35}
      .page{max-width:980px;margin:0 auto;padding:28px}
      .header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;border-bottom:3px solid #0b0b0c;padding-bottom:18px;margin-bottom:18px}
      .brand{display:flex;align-items:center;gap:12px}
      .brand-logo{width:34px;height:34px;border-radius:9px;object-fit:cover;border:1px solid #e5e7eb;background:#fff}
      .brand-name{font-weight:900;font-size:28px;letter-spacing:-1px;line-height:1}
      .brand-name .muted{color:#6b7280;font-style:italic}
      .pill{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.16em;color:#0b0b0c;background:#facc15;border:1px solid rgba(0,0,0,.15);padding:6px 10px;border-radius:999px}
      .meta{font-size:12px;color:#6b7280;font-weight:700}
      .title{font-size:20px;font-weight:900;margin:0}
      .range{font-size:12px;color:#111827;font-weight:800}
      .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}
      .card{background:#f7f7f8;border:1px solid #e5e7eb;border-radius:14px;padding:12px;break-inside:avoid;page-break-inside:avoid}
      .card-label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#6b7280;font-weight:900}
      .card-value{font-size:18px;font-weight:900;color:#0b0b0c;margin-top:6px}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace}
      .section{margin-top:16px;break-inside:avoid;page-break-inside:avoid}
      .section-title{font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#6b7280;font-weight:900;margin-bottom:8px}
      .table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #eef2f7;border-radius:12px;overflow:hidden}
      thead{display:table-header-group}
      th,td{border-bottom:1px solid #eef2f7;padding:10px 8px;text-align:left;font-size:12px;vertical-align:top}
      th{color:#6b7280;text-transform:uppercase;font-weight:900;font-size:10px;letter-spacing:.16em;background:#fafafa}
      td.name{font-weight:800;color:#111827}
      tr{break-inside:avoid;page-break-inside:avoid}
      .list{margin:0;padding-left:16px;color:#111827}
      .list li{margin:6px 0;font-size:12px}
      .list.accent li{color:#0b0b0c}
      .list.warn li{color:#a16207}
      .two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .footer{margin-top:18px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.18em}
      @media (max-width:920px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.two-col{grid-template-columns:1fr}}
      @media print{
        @page{size:A4;margin:12mm}
        body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .page{max-width:none;padding:0}
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div>
          <div class="brand">
            ${logoSrc ? `<img class="brand-logo" src="${escapeHtml(logoSrc)}" alt="IRONTRACKS" />` : ''}
            <div>
              <div class="brand-name">IRON<span class="muted">TRACKS</span></div>
              <div class="meta">${escapeHtml(subtitle)} • ${escapeHtml(rangeLabel)}${owner}</div>
            </div>
          </div>
          <div style="margin-top:10px">
            <span class="pill">${escapeHtml(title)}</span>
          </div>
        </div>
        <div style="text-align:right">
          <div class="title">${escapeHtml(title)}</div>
          <div class="range">${escapeHtml(rangeLabel)}</div>
          <div class="meta">Gerado em: ${escapeHtml(generatedLabel)}</div>
        </div>
      </div>

      <div class="grid">${cards}</div>

      ${topExercisesTable('Top exercícios (por volume)', listByVol)}
      ${topExercisesTable('Top exercícios (por frequência)', listByFreq)}
      ${sessionsTable()}

      ${insights ? section('Insights', `<div class="two-col">${insights}</div>`) : ''}

      <div class="footer">IRONTRACKS • ${escapeHtml(generatedLabel)}</div>
    </div>
  </body>
</html>`
}
