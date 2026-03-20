/**
 * GET /api/nutrition/export-pdf?date=2026-03-19
 *
 * Returns a complete, beautifully styled HTML document designed for
 * browser print-to-PDF with the IronTracks brand.
 *
 * The client opens this in a popup and calls window.print() immediately.
 * No external PDF libraries needed — the browser engine handles everything.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

function safeNum(v: unknown, digits = 0) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n))
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function fmtDate(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split('-')
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    return `${d} de ${months[parseInt(m) - 1]} de ${y}`
  } catch { return dateStr }
}

function macroBar(value: number, goal: number, color: string) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0
  return `
    <div class="bar-wrap">
      <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>`
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('Unauthorized', { status: 401 })

    const url = new URL(req.url)
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new NextResponse('Invalid date', { status: 400 })
    }

    const admin = createAdminClient()

    // Fetch meals for the day
    const { data: meals } = await admin
      .from('nutrition_meal_entries')
      .select('id, created_at, food_name, calories, protein, carbs, fat')
      .eq('user_id', user.id)
      .eq('date', date)
      .order('created_at', { ascending: true })

    // Fetch daily totals
    const { data: dailyLog } = await admin
      .from('daily_nutrition_logs')
      .select('calories, protein, carbs, fat')
      .eq('user_id', user.id)
      .eq('date', date)
      .maybeSingle()

    // Fetch nutrition goals
    const { data: goalsRow } = await admin
      .from('nutrition_goals')
      .select('calories, protein, carbs, fat')
      .eq('user_id', user.id)
      .maybeSingle()

    // Fetch user display name
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, full_name')
      .eq('id', user.id)
      .maybeSingle()

    const userName = String(profile?.display_name || profile?.full_name || user.email || '').split('@')[0]
    const safeEntries = Array.isArray(meals) ? meals : []
    const totCal = safeNum(dailyLog?.calories || safeEntries.reduce((s, m) => s + Number(m.calories || 0), 0))
    const totPro = safeNum(dailyLog?.protein || safeEntries.reduce((s, m) => s + Number(m.protein || 0), 0), 1)
    const totCarb = safeNum(dailyLog?.carbs || safeEntries.reduce((s, m) => s + Number(m.carbs || 0), 0), 1)
    const totFat = safeNum(dailyLog?.fat || safeEntries.reduce((s, m) => s + Number(m.fat || 0), 0), 1)

    const goalCal = Number(goalsRow?.calories || 0)
    const goalPro = Number(goalsRow?.protein || 0)
    const goalCarb = Number(goalsRow?.carbs || 0)
    const goalFat = Number(goalsRow?.fat || 0)
    const calPct = goalCal > 0 ? Math.min(100, Math.round((Number(totCal) / goalCal) * 100)) : null

    const mealRows = safeEntries.map((m, i) => `
      <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="td-time">${fmtTime(m.created_at)}</td>
        <td class="td-name">${String(m.food_name || '').replace(/</g, '&lt;')}</td>
        <td class="td-num">${safeNum(m.calories)}</td>
        <td class="td-num blue">${safeNum(m.protein, 1)}g</td>
        <td class="td-num orange">${safeNum(m.carbs, 1)}g</td>
        <td class="td-num yellow">${safeNum(m.fat, 1)}g</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>IronTracks — Diário Nutricional — ${fmtDate(date)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; background:#fff; color:#111; font-size:13px; }

  /* ── Print setup ── */
  @page { size:A4; margin:18mm 16mm; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none !important; }
  }

  /* ── Header ── */
  .header { display:flex; align-items:center; justify-content:space-between; padding-bottom:18px; border-bottom:2.5px solid #facc15; margin-bottom:24px; }
  .logo-wrap { display:flex; align-items:center; gap:12px; }
  .logo-icon { width:44px; height:44px; background:linear-gradient(135deg,#facc15,#f59e0b); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; color:#000; }
  .logo-text { font-size:22px; font-weight:800; color:#111; letter-spacing:-0.5px; }
  .logo-sub { font-size:10px; font-weight:500; color:#6b7280; letter-spacing:0.08em; text-transform:uppercase; margin-top:1px; }
  .header-right { text-align:right; }
  .header-date { font-size:15px; font-weight:600; color:#111; }
  .header-user { font-size:11px; color:#6b7280; margin-top:2px; }

  /* ── Section titles ── */
  .section-title { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.16em; color:#6b7280; margin-bottom:12px; }

  /* ── Summary cards ── */
  .summary-grid { display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr; gap:12px; margin-bottom:28px; }
  .card { border-radius:12px; padding:14px 16px; background:#f9fafb; border:1.5px solid #e5e7eb; }
  .card.accent { background:#fffbeb; border-color:#fde68a; }
  .card-label { font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:0.14em; color:#9ca3af; margin-bottom:6px; }
  .card-value { font-size:28px; font-weight:800; color:#111; line-height:1; }
  .card-unit { font-size:11px; font-weight:500; color:#6b7280; margin-top:2px; }
  .card-goal { font-size:10px; color:#9ca3af; margin-top:6px; }
  .card-pct { display:inline-block; font-size:10px; font-weight:600; padding:2px 7px; border-radius:20px; }
  .pct-ok { background:#d1fae5; color:#065f46; }
  .pct-over { background:#fee2e2; color:#991b1b; }

  /* ── Macro bars ── */
  .bar-section { margin-bottom:28px; }
  .bar-row { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
  .bar-label { font-size:11px; font-weight:500; color:#374151; width:80px; flex-shrink:0; }
  .bar-wrap { flex:1; height:8px; background:#f3f4f6; border-radius:4px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:4px; }
  .bar-nums { font-size:11px; color:#6b7280; width:90px; text-align:right; flex-shrink:0; }

  /* ── Meals table ── */
  .table-wrap { margin-bottom:28px; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:0.12em; color:#6b7280; padding:8px 10px; text-align:left; border-bottom:1.5px solid #e5e7eb; background:#f9fafb; }
  th.th-num { text-align:right; }
  td { padding:9px 10px; vertical-align:middle; }
  .td-time { color:#9ca3af; font-size:11px; width:52px; }
  .td-name { font-weight:500; color:#111; }
  .td-num { text-align:right; font-weight:500; font-variant-numeric:tabular-nums; }
  .blue { color:#2563eb; }
  .orange { color:#d97706; }
  .yellow { color:#ca8a04; }
  .row-even { background:#fff; }
  .row-odd { background:#f9fafb; }
  tr { border-bottom:1px solid #f3f4f6; }
  tfoot td { font-size:12px; font-weight:700; color:#111; padding:10px 10px; border-top:2px solid #e5e7eb; background:#fffbeb; }

  /* ── Empty state ── */
  .empty { text-align:center; padding:32px; color:#9ca3af; font-size:13px; }

  /* ── Footer ── */
  .footer { border-top:1.5px solid #e5e7eb; padding-top:14px; display:flex; justify-content:space-between; align-items:center; color:#9ca3af; font-size:10px; }
  .footer-logo { font-weight:700; color:#111; }

  /* ── Print button (web only) ── */
  .print-btn { display:flex; gap:10px; margin-bottom:24px; }
  .btn { padding:10px 20px; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; border:none; }
  .btn-primary { background:#facc15; color:#000; }
  .btn-secondary { background:#f3f4f6; color:#374151; }
</style>
</head>
<body>
<div style="max-width:780px;margin:0 auto;padding:24px">

  <!-- Print button (hidden on print) -->
  <div class="no-print print-btn">
    <button class="btn btn-primary" onclick="window.print()">⬇️ Salvar / Imprimir PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">✕ Fechar</button>
  </div>

  <!-- Header -->
  <div class="header">
    <div class="logo-wrap">
      <div class="logo-icon">⚡</div>
      <div>
        <div class="logo-text">IronTracks</div>
        <div class="logo-sub">Diário Nutricional</div>
      </div>
    </div>
    <div class="header-right">
      <div class="header-date">${fmtDate(date)}</div>
      ${userName ? `<div class="header-user">Atleta: ${String(userName).replace(/</g, '&lt;')}</div>` : ''}
    </div>
  </div>

  <!-- Summary cards -->
  <div class="section-title">Resumo do Dia</div>
  <div class="summary-grid">
    <div class="card accent">
      <div class="card-label">Calorias</div>
      <div class="card-value">${totCal}</div>
      <div class="card-unit">kcal consumidas</div>
      ${goalCal > 0 ? `
        <div class="card-goal">Meta: ${safeNum(goalCal)} kcal &nbsp;
          <span class="card-pct ${calPct !== null && calPct > 100 ? 'pct-over' : 'pct-ok'}">${calPct ?? 0}%</span>
        </div>` : ''}
    </div>
    <div class="card">
      <div class="card-label">Proteína</div>
      <div class="card-value" style="color:#2563eb">${totPro}</div>
      <div class="card-unit">gramas</div>
      ${goalPro > 0 ? `<div class="card-goal">Meta: ${safeNum(goalPro)}g</div>` : ''}
    </div>
    <div class="card">
      <div class="card-label">Carboidratos</div>
      <div class="card-value" style="color:#d97706">${totCarb}</div>
      <div class="card-unit">gramas</div>
      ${goalCarb > 0 ? `<div class="card-goal">Meta: ${safeNum(goalCarb)}g</div>` : ''}
    </div>
    <div class="card">
      <div class="card-label">Gordura</div>
      <div class="card-value" style="color:#ca8a04">${totFat}</div>
      <div class="card-unit">gramas</div>
      ${goalFat > 0 ? `<div class="card-goal">Meta: ${safeNum(goalFat)}g</div>` : ''}
    </div>
  </div>

  <!-- Macro progress bars -->
  ${goalCal > 0 || goalPro > 0 || goalCarb > 0 || goalFat > 0 ? `
  <div class="bar-section">
    <div class="section-title">Progresso vs Metas</div>
    ${goalCal > 0 ? `<div class="bar-row"><div class="bar-label">Calorias</div>${macroBar(Number(totCal), goalCal, '#facc15')}<div class="bar-nums">${totCal} / ${safeNum(goalCal)} kcal</div></div>` : ''}
    ${goalPro > 0 ? `<div class="bar-row"><div class="bar-label">Proteína</div>${macroBar(Number(totPro), goalPro, '#3b82f6')}<div class="bar-nums">${totPro} / ${safeNum(goalPro)}g</div></div>` : ''}
    ${goalCarb > 0 ? `<div class="bar-row"><div class="bar-label">Carboidratos</div>${macroBar(Number(totCarb), goalCarb, '#f59e0b')}<div class="bar-nums">${totCarb} / ${safeNum(goalCarb)}g</div></div>` : ''}
    ${goalFat > 0 ? `<div class="bar-row"><div class="bar-label">Gordura</div>${macroBar(Number(totFat), goalFat, '#eab308')}<div class="bar-nums">${totFat} / ${safeNum(goalFat)}g</div></div>` : ''}
  </div>` : ''}

  <!-- Meals table -->
  <div class="table-wrap">
    <div class="section-title">Refeições Registradas (${safeEntries.length})</div>
    ${safeEntries.length === 0 ? '<div class="empty">Nenhuma refeição registrada neste dia.</div>' : `
    <table>
      <thead>
        <tr>
          <th>Hora</th>
          <th>Alimento / Refeição</th>
          <th class="th-num">Calorias</th>
          <th class="th-num">Proteína</th>
          <th class="th-num">Carbo</th>
          <th class="th-num">Gordura</th>
        </tr>
      </thead>
      <tbody>${mealRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2">TOTAL DO DIA</td>
          <td class="td-num">${totCal} kcal</td>
          <td class="td-num blue">${totPro}g</td>
          <td class="td-num orange">${totCarb}g</td>
          <td class="td-num yellow">${totFat}g</td>
        </tr>
      </tfoot>
    </table>`}
  </div>

  <!-- Footer -->
  <div class="footer">
    <div><span class="footer-logo">IronTracks</span> — Diário gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</div>
    <div>Dados confidenciais do atleta</div>
  </div>

</div>
<script>
  // Auto-trigger print on load if ?autoprint=1
  if (new URLSearchParams(location.search).get('autoprint') === '1') {
    window.addEventListener('load', () => setTimeout(() => window.print(), 400))
  }
</script>
</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return new NextResponse(getErrorMessage(e) || 'Server error', { status: 500 })
  }
}
