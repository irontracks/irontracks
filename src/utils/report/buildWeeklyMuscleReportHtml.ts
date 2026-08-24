/**
 * @module buildWeeklyMuscleReportHtml
 *
 * HTML do "Resumo da semana 💪" (tela `WeeklyMuscleSummary`), para o usuário
 * levar ao professor ou guardar. Irmão do `buildPeriodReportHtml`: mesma folha
 * de estilo clara, mesma estrutura de cabeçalho/rodapé.
 *
 * Os músculos chegam JÁ resolvidos pela tela (séries + faixa recomendada), e é
 * de propósito: o arquivo não pode discordar do que o usuário acabou de ver —
 * mesma decisão do `opts.kcalInputs` no PDF de sessão.
 *
 * Entregar é trabalho do caminho ÚNICO (`exportHtmlAsPdf`); aqui só se monta o
 * documento.
 */
import { escapeHtml } from '@/utils/escapeHtml'

export type WeeklyMuscleRow = {
  id?: string
  label?: string
  /** Séries equivalentes da semana. */
  sets?: number
  /** Piso recomendado (o "/ N séries" que a tela mostra). */
  meta?: number
  /** Teto recomendado — é o limite que a IA cita nos alertas. */
  metaMax?: number
}

export type WeeklyMuscleReportInput = {
  /** Segunda-feira da semana, `YYYY-MM-DD`. */
  weekStartDate?: string
  workoutsCount?: number
  muscles?: WeeklyMuscleRow[]
  insights?: {
    summary?: string[]
    imbalanceAlerts?: { muscles?: string[]; evidence?: string; suggestion?: string }[]
    recommendations?: { title?: string; actions?: string[] }[]
  } | null
  baseUrl?: string
  /**
   * `/icone.png` já em base64. O PDF nativo do iOS não espera a rede: com `src`
   * remoto a marca sai como retângulo vazio no arquivo. Vem pronto do chamador
   * (`fetchLogoDataUrl`), como o relatório de sessão já fazia.
   */
  logoDataUrl?: string | null
  userName?: string
  generatedAt?: Date
}

const num = (v: unknown, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** "15.3" vira "15,3" e "28.0" vira "28" — é assim que a tela escreve. */
const fmtSets = (v: unknown) => num(v).toFixed(1).replace(/\.0$/, '').replace('.', ',')

const fmtDay = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`

/**
 * A semana é uma data-calendário (`YYYY-MM-DD`), não um instante: lida em UTC
 * de ponta a ponta. Ler com `new Date('2026-08-17')` no fuso local devolveria
 * 16/08 no Brasil — o mesmo defeito de bucketing que o streak tinha.
 */
const weekRangeLabel = (weekStart: unknown) => {
  const raw = String(weekStart || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const start = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return ''
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  return `${fmtDay(start)} – ${fmtDay(end)}`
}

const fmtDateTime = (v: unknown) => {
  try {
    const d = v instanceof Date ? v : new Date(v as string | number)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

type Situation = { label: string; cls: string }

/** Abaixo / Na meta / Acima — a mesma leitura que a IA faz nos alertas. */
export const muscleSituation = (sets: number, min: number, max: number): Situation => {
  if (!(min > 0) && !(max > 0)) return { label: '—', cls: '' }
  if (min > 0 && sets < min) return { label: 'Abaixo', cls: 'low' }
  if (max > 0 && sets > max) return { label: 'Acima', cls: 'high' }
  return { label: 'Na meta', cls: 'ok' }
}

const cleanList = (v: unknown, limit: number) =>
  (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, limit)

export function buildWeeklyMuscleReportHtml(input: WeeklyMuscleReportInput) {
  const data = input && typeof input === 'object' ? input : {}
  const rawBaseUrl = String(data.baseUrl || '').trim()
  const baseUrl = /^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl : ''
  const logoDataUrl = String(data.logoDataUrl || '').trim()
  const logoSrc = logoDataUrl.startsWith('data:')
    ? logoDataUrl
    : baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/icone.png`
      : ''
  const userName = String(data.userName || '').trim()
  const rangeLabel = weekRangeLabel(data.weekStartDate)
  const generatedLabel = fmtDateTime(data.generatedAt ?? new Date())

  const workouts = Math.max(0, Math.round(num(data.workoutsCount)))
  const muscles = (Array.isArray(data.muscles) ? data.muscles : [])
    .map((m) => ({
      label: String(m?.label || m?.id || '').trim() || 'Músculo',
      sets: num(m?.sets),
      min: num(m?.meta),
      max: num(m?.metaMax),
    }))
    .sort((a, b) => b.sets - a.sets)

  const topLabel = muscles[0]?.label || ''
  const totalSets = muscles.reduce((acc, m) => acc + m.sets, 0)
  const insights = data.insights && typeof data.insights === 'object' ? data.insights : null

  const summary = cleanList(insights?.summary, 12)
  const alerts = (Array.isArray(insights?.imbalanceAlerts) ? insights.imbalanceAlerts : [])
    .slice(0, 8)
    .map((a) => ({
      muscles: cleanList(a?.muscles, 6).join(' · '),
      evidence: String(a?.evidence || '').trim(),
      suggestion: String(a?.suggestion || '').trim(),
    }))
    .filter((a) => a.muscles || a.evidence || a.suggestion)
  const recommendations = (Array.isArray(insights?.recommendations) ? insights.recommendations : [])
    .slice(0, 8)
    .map((r) => ({ title: String(r?.title || '').trim(), actions: cleanList(r?.actions, 8) }))
    .filter((r) => r.title || r.actions.length)

  const section = (label: string, content: string) =>
    content ? `<div class="section"><div class="section-title">${escapeHtml(label)}</div>${content}</div>` : ''

  const musclesTable = () => {
    if (!muscles.length) return ''
    const body = muscles
      .map((m) => {
        const s = muscleSituation(m.sets, m.min, m.max)
        const meta = m.min > 0 && m.max > 0 ? `${m.min} – ${m.max}` : m.min > 0 ? `${m.min}+` : '—'
        return `<tr><td class="name">${escapeHtml(m.label)}</td><td class="mono">${escapeHtml(fmtSets(m.sets))}</td><td class="mono">${escapeHtml(
          meta
        )}</td><td><span class="tag ${s.cls}">${escapeHtml(s.label)}</span></td></tr>`
      })
      .join('')
    return section(
      'Volume por músculo',
      `<table class="table"><thead><tr><th>Músculo</th><th>Séries</th><th>Meta (séries)</th><th>Situação</th></tr></thead><tbody>${body}</tbody></table>`
    )
  }

  const summaryBlock = () =>
    summary.length
      ? section('Análise da IA', `<div class="ai">${summary.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>`)
      : ''

  const alertsBlock = () =>
    alerts.length
      ? section(
          'Pontos de atenção',
          alerts
            .map(
              (a) => `<div class="alert">${a.muscles ? `<div class="alert-head">${escapeHtml(a.muscles)}</div>` : ''}${
                a.evidence ? `<p>${escapeHtml(a.evidence)}</p>` : ''
              }${a.suggestion ? `<p class="muted">→ ${escapeHtml(a.suggestion)}</p>` : ''}</div>`
            )
            .join('')
        )
      : ''

  const recommendationsBlock = () =>
    recommendations.length
      ? section(
          'Recomendações',
          recommendations
            .map(
              (r) => `<div class="rec">${r.title ? `<div class="rec-head">${escapeHtml(r.title)}</div>` : ''}${
                r.actions.length ? `<ul class="list">${r.actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''
              }</div>`
            )
            .join('')
        )
      : ''

  const cards = [
    { label: 'Treinos na semana', value: String(workouts) },
    { label: 'Séries totais', value: fmtSets(totalSets) },
    { label: 'Músculos treinados', value: String(muscles.length) },
    { label: 'Foco da semana', value: topLabel || '—' },
  ]
    .map((c) => `<div class="card"><div class="card-label">${escapeHtml(c.label)}</div><div class="card-value">${escapeHtml(c.value)}</div></div>`)
    .join('')

  const owner = userName ? ` • ${escapeHtml(userName)}` : ''

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Resumo da semana • IRONTRACKS</title>
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
      .tag{display:inline-block;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;border:1px solid #e5e7eb;border-radius:999px;padding:1px 6px}
      .tag.ok{color:#15803d;border-color:#bbf7d0;background:#f0fdf4}
      .tag.low{color:#a16207;border-color:#fde68a;background:#fefce8}
      .tag.high{color:#b91c1c;border-color:#fecaca;background:#fef2f2}
      .ai{border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:12px}
      .ai p{margin:0 0 8px;font-size:12px;color:#111827}
      .ai p:last-child{margin-bottom:0}
      .alert{border:1px solid #fecaca;background:#fef2f2;border-radius:12px;padding:10px;margin-bottom:8px;break-inside:avoid;page-break-inside:avoid}
      .alert-head{font-size:12px;font-weight:900;color:#b91c1c;margin-bottom:4px}
      .alert p{margin:0 0 4px;font-size:12px;color:#111827}
      .alert p.muted{color:#6b7280}
      .rec{border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin-bottom:8px;break-inside:avoid;page-break-inside:avoid}
      .rec-head{font-size:12px;font-weight:900;color:#0b0b0c;margin-bottom:4px}
      .list{margin:0;padding-left:16px;color:#111827}
      .list li{margin:4px 0;font-size:12px}
      .footer{margin-top:18px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.18em}
      @media (max-width:920px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
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
              <div class="meta">Resumo da semana${rangeLabel ? ` • ${escapeHtml(rangeLabel)}` : ''}${owner}</div>
            </div>
          </div>
          <div style="margin-top:10px"><span class="pill">Resumo da semana</span></div>
        </div>
        <div style="text-align:right">
          <div class="title">Resumo da semana</div>
          ${rangeLabel ? `<div class="range">${escapeHtml(rangeLabel)}</div>` : ''}
          <div class="meta">Gerado em: ${escapeHtml(generatedLabel)}</div>
        </div>
      </div>

      <div class="grid">${cards}</div>

      ${musclesTable()}
      ${summaryBlock()}
      ${alertsBlock()}
      ${recommendationsBlock()}

      <div class="footer">IRONTRACKS • ${escapeHtml(generatedLabel)}</div>
    </div>
  </body>
</html>`
}
