import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { RelatorioCharts } from './RelatorioCharts'

interface PageProps {
  params: Promise<{ userId: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  // Página privada e com gate de auth (ver RelatorioPage). Metadata propositalmente
  // GENÉRICA: link preview/unfurl (WhatsApp, redes) é buscado por bot anônimo, que
  // ignora o gate de auth e o `noindex`. Antes vazava o nome real no título/OG.
  return {
    title: 'Relatório · IronTracks',
    description: 'Relatório de performance — acesso restrito.',
    robots: { index: false, follow: false },
  }
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  return MONTHS[parseInt(mo) - 1] + '/' + y.slice(2)
}

function fmtDate(d: string) {
  const [, m, day] = d.split('T')[0].split('-')
  return day + '/' + m
}

function num(n: number | null | undefined, dec = 1) {
  if (n == null) return '—'
  return dec === 0 ? Math.round(n).toLocaleString('pt-BR') : n.toFixed(dec).replace('.', ',')
}

function parseLabValue(text: string, pattern: RegExp, decimal = false): number {
  const m = text.match(pattern)?.[1]
  if (!m) return 0
  return decimal ? parseFloat(m.replace(',', '.')) : parseInt(m)
}

// ─── Styles (inline string injected via <style>) ────────────────────────────
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
.rp{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#fff;background:#09090b;min-height:100vh;padding:1.5rem 1rem 3rem}
.inner{max-width:780px;margin:0 auto}
.hero{background:#0d0f11;border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:2rem 1.75rem 1.75rem;margin-bottom:1rem}
.brand{display:flex;align-items:center;gap:6px;margin-bottom:1.75rem}
.bi{font-size:14px;font-weight:500;letter-spacing:.12em;color:#fff}
.bt{font-size:14px;font-weight:500;letter-spacing:.12em;color:#facc15}
.rp-badge{margin-left:auto;font-size:10px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.25);color:#facc15;padding:3px 10px;border-radius:20px}
.hero-top{display:flex;align-items:center;gap:1.1rem;margin-bottom:1.75rem}
.av{width:52px;height:52px;border-radius:50%;background:rgba(250,204,21,0.1);border:1.5px solid rgba(250,204,21,0.35);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:500;color:#facc15;flex-shrink:0}
.hn{font-size:28px;font-weight:500;line-height:1}
.hm{font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px}
.s3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sc{background:#111114;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:1.1rem .9rem;text-align:center;transition:border-color .2s,transform .15s;cursor:pointer;text-decoration:none;display:block}
.sc:hover{border-color:rgba(250,204,21,0.45);transform:translateY(-2px)}
.sv{font-size:26px;font-weight:500;color:#facc15;line-height:1}
.sl{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.4);margin-top:5px}
.ss{font-size:10px;color:rgba(255,255,255,0.3);margin-top:3px}
.sec{background:#0d0f11;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:1.5rem 1.75rem;margin-bottom:1rem}
.sh{display:flex;align-items:center;gap:9px;margin-bottom:1.25rem}
.sn{width:24px;height:24px;border-radius:50%;background:rgba(250,204,21,0.12);border:1px solid rgba(250,204,21,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:500;color:#facc15;flex-shrink:0}
.sn.r{background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.3);color:#f87171}
.st{font-size:14px;font-weight:500}
.sb{margin-left:auto;font-size:10px;color:rgba(255,255,255,0.35)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.g4{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px}
.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
.c{background:#111114;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:1rem 1.1rem;transition:all .2s;cursor:default}
.c:hover{border-color:rgba(250,204,21,0.35);transform:translateY(-2px)}
.c.gd{border-color:rgba(250,204,21,0.14)}
.c.rd{border-color:rgba(239,68,68,0.18)}
.cl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,0.4);margin-bottom:4px}
.cv{font-size:20px;font-weight:500;line-height:1}
.cv.g{color:#facc15}.cv.gr{color:#22c55e}.cv.r{color:#ef4444}.cv.o{color:#f97316}.cv.w{color:#fff}
.cs{font-size:10px;color:rgba(255,255,255,0.3);margin-top:3px}
.tl{background:#111114;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:.8rem .7rem;text-align:center;cursor:default;transition:all .2s}
.tl:hover{border-color:rgba(250,204,21,0.35);transform:translateY(-2px)}
.tl.cur{border-color:rgba(250,204,21,0.3);background:rgba(250,204,21,0.03)}
.tlt{display:inline-block;font-size:8px;font-weight:500;background:rgba(250,204,21,0.15);color:#facc15;border:1px solid rgba(250,204,21,0.3);padding:2px 6px;border-radius:20px;margin-bottom:4px;letter-spacing:.05em}
.tld{font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:4px}
.tlw{font-size:15px;font-weight:500}
.tlb{font-size:10px;color:#facc15;margin-top:2px}
.tlm{font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px}
.al{border-left:2px solid;border-radius:10px;padding:.85rem 1rem;margin-bottom:.6rem;cursor:default}
.al.d{border-color:#ef4444;background:rgba(239,68,68,0.06)}
.al.w{border-color:#f97316;background:rgba(249,115,22,0.06)}
.al-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.al-title{font-size:12px;font-weight:500}
.al-desc{font-size:10px;color:rgba(255,255,255,0.5);line-height:1.55}
.bk{display:inline-block;font-size:9px;padding:2px 7px;border-radius:20px;font-weight:500}
.bk.d{background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3)}
.bk.w{background:rgba(249,115,22,0.15);color:#fb923c;border:1px solid rgba(249,115,22,0.25)}
.bk.gld{background:rgba(250,204,21,0.12);color:#facc15;border:1px solid rgba(250,204,21,0.25)}
.pb{margin-bottom:.5rem}
.pb-row{display:flex;align-items:center;gap:7px}
.pb-l{font-size:10px;color:rgba(255,255,255,0.45);flex:0 0 90px;white-space:nowrap}
.pb-t{flex:1;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden}
.pb-f{height:100%;border-radius:2px}
.pb-v{font-size:10px;font-weight:500;flex:0 0 40px;text-align:right}
.pl{display:inline-block;font-size:10px;padding:2px 8px;border-radius:20px;margin:2px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.09)}
.pl.dp{background:rgba(239,68,68,0.09);color:#fca5a5;border-color:rgba(239,68,68,0.2)}
.pl.rst{background:rgba(34,197,94,0.09);color:#86efac;border-color:rgba(34,197,94,0.18)}
.dc{background:#111114;border:1px solid rgba(255,255,255,0.07);border-radius:11px;padding:.9rem 1rem;cursor:pointer;transition:all .2s;text-decoration:none;display:block}
.dc:hover{border-color:rgba(250,204,21,0.35);transform:translateY(-2px)}
.dcd{font-size:9px;font-weight:500;color:#facc15;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}
.dcn{font-size:11px;font-weight:500;margin-bottom:.45rem;line-height:1.3}
.pc{border-radius:11px;padding:.9rem 1rem;margin-bottom:.55rem;display:flex;gap:.85rem;align-items:flex-start;cursor:default}
.pc.p1{background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18)}
.pc.p2{background:rgba(249,115,22,0.07);border:1px solid rgba(249,115,22,0.18)}
.pc.p3{background:rgba(250,204,21,0.05);border:1px solid rgba(250,204,21,0.14)}
.pn{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;flex-shrink:0}
.p1 .pn{background:rgba(239,68,68,0.18);color:#f87171}
.p2 .pn{background:rgba(249,115,22,0.18);color:#fb923c}
.p3 .pn{background:rgba(250,204,21,0.14);color:#facc15}
.pt{font-size:12px;font-weight:500;margin-bottom:3px}
.pd{font-size:10px;color:rgba(255,255,255,0.45);line-height:1.55}
.dlbl{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.3);margin:1rem 0 .55rem}
.ft{background:#111114;border-radius:0 0 16px 16px;padding:1.5rem;text-align:center;margin-top:1rem}
.clist{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-top:.9rem}
.cta{background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.28);color:#facc15;padding:.5rem 1.1rem;border-radius:25px;font-size:11px;font-weight:500;cursor:pointer;text-decoration:none;display:inline-block;font-family:inherit;transition:all .2s}
.cta:hover{background:rgba(250,204,21,0.18);border-color:rgba(250,204,21,0.5)}
.cta.sec2{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.65)}
.cta.sec2:hover{background:rgba(255,255,255,0.1)}
.chart-lgd{display:flex;gap:12px;margin-top:6px;flex-wrap:wrap;font-size:10px;color:rgba(255,255,255,0.35)}
.lgd-dot{width:12px;height:2px;border-radius:1px;display:inline-block}
@media(max-width:600px){.s3,.g5{grid-template-columns:1fr}.g2,.g3{grid-template-columns:1fr}}
`

export default async function RelatorioPage({ params }: PageProps) {
  const { userId } = await params

  // Authz (auditoria 2026-06-27): este relatório expõe email + composição
  // corporal + nutrição + marcadores de exame. Antes era PÚBLICO por userId —
  // qualquer anônimo lia dados de saúde de qualquer pessoa enumerando o UUID
  // (IDOR, risco LGPD art. 11). Agora exige login e que o visitante seja o
  // próprio dono, o professor vinculado ou admin.
  const viewerClient = await createClient()
  const { data: { user: viewer } } = await viewerClient.auth.getUser()
  if (!viewer?.id) redirect(`/?next=${encodeURIComponent(`/relatorio/${userId}`)}`)
  if (viewer.id !== userId && !(await canCoachStudent({ id: viewer.id, email: viewer.email }, userId))) {
    notFound()
  }

  const db = createAdminClient()

  const now = new Date()
  const sixMonthsAgo = new Date(now.getTime() - 185 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0]
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString()

  const [authRes, profileRes, assessmentsRes, workoutsAllRes, workouts6mRes, nutritionRes, vipRes, goalsRes, templatesRes] =
    await Promise.all([
      db.auth.admin.getUserById(userId),
      db.from('profiles').select('display_name').eq('id', userId).single(),
      db.from('assessments')
        .select('date,weight,body_fat_percentage,lean_mass,bmr,bmi,arm_circ,chest_circ,waist_circ,hip_circ,thigh_circ,calf_circ')
        .eq('user_id', userId)
        .order('date', { ascending: true })
        .limit(10),
      db.from('workouts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_template', false)
        .is('archived_at', null)
        .not('completed_at', 'is', null)
        .gte('completed_at', yearStart),
      db.from('workouts')
        .select('completed_at')
        .eq('user_id', userId)
        .eq('is_template', false)
        .is('archived_at', null)
        .not('completed_at', 'is', null)
        .gte('completed_at', sixMonthsAgo),
      db.from('daily_nutrition_logs')
        .select('date,calories,protein,carbs,fat,water_ml')
        .eq('user_id', userId)
        .gte('date', fourteenDaysAgo)
        .order('date', { ascending: true }),
      db.from('vip_profile').select('goal,constraints').eq('user_id', userId).single(),
      db.from('nutrition_goals').select('calories,protein,carbs,fat').eq('user_id', userId).single(),
      db.from('workouts')
        .select('id,name,exercises(name,muscle_group,method,is_unilateral)')
        .eq('user_id', userId)
        .eq('is_template', true)
        .is('archived_at', null)
        .order('created_at'),
    ])

  if (authRes.error || !authRes.data.user) return notFound()

  const user = authRes.data.user
  const name = profileRes.data?.display_name ?? user.email?.split('@')[0] ?? 'Usuário'
  const initials = name.slice(0, 2).toUpperCase()

  const assessments = assessmentsRes.data ?? []
  const totalWorkouts = workoutsAllRes.count ?? 0
  const workouts6m = workouts6mRes.data ?? []
  const nutritionLogs = nutritionRes.data ?? []
  const vipProfile = vipRes.data
  const goals = goalsRes.data
  const templates = (templatesRes.data ?? []) as Array<{
    id: string
    name: string
    exercises: Array<{ name: string; muscle_group: string | null; method: string | null; is_unilateral: boolean }>
  }>

  // Parse lab values from vip_profile.constraints
  const ct = vipProfile?.constraints ?? ''
  const lab = {
    ldl: parseLabValue(ct, /LDL (\d+)/),
    hdl: parseLabValue(ct, /HDL (\d+)/),
    hct: parseLabValue(ct, /Hematócrito ([\d,]+)/, true),
    hcy: parseLabValue(ct, /Homocisteína (\d+)/),
    vitd: parseLabValue(ct, /Vit\.?D ([\d,]+)/, true),
  }
  const hasLab = lab.ldl > 0 || lab.hdl > 0 || lab.hct > 0

  // Group workouts by month for chart
  const wMap: Record<string, number> = {}
  for (const w of workouts6m) {
    const m = (w.completed_at as string).slice(0, 7)
    wMap[m] = (wMap[m] ?? 0) + 1
  }
  const workoutsByMonth = Object.entries(wMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, t]) => ({ mes: fmtMonth(m), treinos: t }))

  // Nutrition averages (skip incomplete days < 1200 kcal)
  const fullDays = nutritionLogs.filter((d) => d.calories > 1200)
  const avg = (key: 'calories' | 'protein' | 'carbs' | 'fat') =>
    fullDays.length ? Math.round(fullDays.reduce((s, d) => s + (d[key] ?? 0), 0) / fullDays.length) : 0
  const avgKcal = avg('calories')
  const avgProt = avg('protein')
  const avgCarbs = avg('carbs')
  const avgFat = avg('fat')

  // Latest & first assessments
  const latest = assessments[assessments.length - 1]
  const first = assessments[0]
  const leanDelta = latest && first ? (latest.lean_mass ?? 0) - (first.lean_mass ?? 0) : 0
  const bfDelta = latest && first ? (first.body_fat_percentage ?? 0) - (latest.body_fat_percentage ?? 0) : 0

  // Assessments data for chart
  const chartAssessments = assessments.map((a) => ({
    date: fmtDate(a.date as string),
    weight: Number(a.weight ?? 0),
    bf: Number(a.body_fat_percentage ?? 0),
    lean: Number(a.lean_mass ?? 0),
  }))

  // Nutrition chart data
  const chartNutrition = nutritionLogs.map((d) => ({
    date: d.date as string,
    calories: Math.round(d.calories ?? 0),
  }))

  const goalKcal = goals?.calories ?? 2900
  const goalProt = goals?.protein ?? 215
  const goalCarbs = goals?.carbs ?? 350
  const goalFat = goals?.fat ?? 70

  const diffPct = (val: number, goal: number) =>
    goal > 0 ? Math.round(((val - goal) / goal) * 100) : 0

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="rp">
        <div className="inner">

          {/* HERO */}
          <div className="hero">
            <div className="brand">
              <span className="bi">IRON</span><span className="bt">TRACKS</span>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, margin: '0 4px' }}>·</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Performance Report</span>
              <span className="rp-badge">VIP · {new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span>
            </div>
            <div className="hero-top">
              <div className="av">{initials}</div>
              <div>
                <div className="hn">{name}</div>
                <div className="hm">
                  {latest ? `Masculino` : '—'}
                  {' · '}{user.email}
                </div>
              </div>
            </div>
            <div className="s3">
              <a className="sc" href="https://irontracks.com.br/assessments" target="_blank" rel="noopener">
                <div className="sv">{num(latest?.lean_mass, 1)} kg</div>
                <div style={{ fontSize: 9, color: '#facc15', marginTop: 2, fontWeight: 500 }}>massa magra</div>
                <div className="sl">Composição</div>
                <div className="ss">{leanDelta > 0 ? `+${num(leanDelta)} kg` : '—'} em {assessments.length > 1 ? `${assessments.length - 1} aval.` : 'avaliações'}</div>
              </a>
              <a className="sc" href="https://irontracks.com.br/assessments" target="_blank" rel="noopener">
                <div className="sv">{num(latest?.body_fat_percentage)}%</div>
                <div style={{ fontSize: 9, color: '#22c55e', marginTop: 2, fontWeight: 500 }}>gordura corporal</div>
                <div className="sl">% gordura</div>
                <div className="ss">{bfDelta > 0 ? `-${num(bfDelta)} pp` : '—'} desde início</div>
              </a>
              <a className="sc" href="https://irontracks.com.br" target="_blank" rel="noopener">
                <div className="sv">{totalWorkouts}</div>
                <div style={{ fontSize: 9, color: '#facc15', marginTop: 2, fontWeight: 500 }}>treinos em {new Date().getFullYear()}</div>
                <div className="sl">Frequência</div>
                <div className="ss">
                  {workoutsByMonth.length > 0
                    ? `~${(workoutsByMonth.reduce((s, w) => s + w.treinos, 0) / workoutsByMonth.length).toFixed(1).replace('.', ',')}× por mês`
                    : '—'}
                </div>
              </a>
            </div>
          </div>

          {/* 1 — EVOLUÇÃO CORPORAL */}
          {assessments.length > 0 && (
            <div className="sec">
              <div className="sh">
                <div className="sn">1</div>
                <div className="st">Evolução corporal</div>
                <span className="sb">
                  {first ? fmtDate(first.date as string) : '—'} → {latest ? fmtDate(latest.date as string) : '—'}
                </span>
              </div>

              <div className="g5" style={{ marginBottom: '1.1rem' }}>
                {assessments.map((a, i) => (
                  <div key={i} className={`tl${i === assessments.length - 1 ? ' cur' : ''}`}>
                    {i === assessments.length - 1 && <div className="tlt">ATUAL</div>}
                    <div className="tld">{fmtDate(a.date as string)}</div>
                    <div className="tlw" style={i === assessments.length - 1 ? { color: '#facc15' } : {}}>{num(a.weight)} kg</div>
                    <div className="tlb">{num(a.body_fat_percentage)}% GC</div>
                    <div className="tlm">{num(a.lean_mass)} kg magra</div>
                  </div>
                ))}
              </div>

              {chartAssessments.length >= 2 && (
                <>
                  <RelatorioCharts
                    assessments={chartAssessments}
                    workoutsByMonth={workoutsByMonth}
                    nutritionDays={chartNutrition}
                    nutritionGoalKcal={goalKcal}
                    showEvolution
                    showFrequency={false}
                    showNutrition={false}
                  />
                  <div className="chart-lgd" style={{ marginTop: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="lgd-dot" style={{ background: '#facc15' }}></span>Massa magra</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="lgd-dot" style={{ background: '#60a5fa' }}></span>Peso total</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="lgd-dot" style={{ background: '#f87171' }}></span>% Gordura</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 2 — MEDIDAS */}
          {latest && (
            <div className="sec">
              <div className="sh">
                <div className="sn">2</div>
                <div className="st">Medidas corporais</div>
                <span className="sb">
                  {first ? fmtDate(first.date as string) : '—'} → {latest ? fmtDate(latest.date as string) : '—'}
                </span>
              </div>
              <div className="g3" style={{ marginBottom: 9 }}>
                <div className="c gd">
                  <div className="cl">Braço</div>
                  <div className="cv g">{num(latest.arm_circ)} cm</div>
                  <div className="cs">
                    {first?.arm_circ ? `+${num((latest.arm_circ ?? 0) - (first.arm_circ ?? 0))} cm desde início` : '—'}
                  </div>
                </div>
                <div className="c gd">
                  <div className="cl">Peito</div>
                  <div className="cv g">{num(latest.chest_circ)} cm</div>
                  <div className="cs">
                    {first?.chest_circ ? `${(latest.chest_circ ?? 0) >= (first.chest_circ ?? 0) ? '+' : ''}${num((latest.chest_circ ?? 0) - (first.chest_circ ?? 0))} cm` : '—'}
                  </div>
                </div>
                <div className="c gd">
                  <div className="cl">Cintura</div>
                  <div className="cv gr">{num(latest.waist_circ)} cm</div>
                  <div className="cs">
                    {first?.waist_circ ? `${num((latest.waist_circ ?? 0) - (first.waist_circ ?? 0))} cm vs início` : '—'}
                  </div>
                </div>
              </div>
              <div className="g3">
                <div className="c gd">
                  <div className="cl">Coxa</div>
                  <div className="cv g">{num(latest.thigh_circ)} cm</div>
                  <div className="cs">
                    {first?.thigh_circ ? `+${num((latest.thigh_circ ?? 0) - (first.thigh_circ ?? 0))} cm` : '—'}
                  </div>
                </div>
                <div className="c gd">
                  <div className="cl">Panturrilha</div>
                  <div className="cv g">{num(latest.calf_circ)} cm</div>
                  <div className="cs">
                    {first?.calf_circ ? `+${num((latest.calf_circ ?? 0) - (first.calf_circ ?? 0))} cm` : '—'}
                  </div>
                </div>
                <div className="c gd">
                  <div className="cl">BMR</div>
                  <div className="cv w">{num(latest.bmr, 0)} kcal</div>
                  <div className="cs">BMI {num(latest.bmi)}</div>
                </div>
              </div>
            </div>
          )}

          {/* 3 — ALERTAS MÉDICOS */}
          {hasLab && (
            <div className="sec" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
              <div className="sh">
                <div className="sn r">3</div>
                <div className="st">Alertas médicos</div>
                <span className="bk d" style={{ marginLeft: 'auto' }}>Exames recentes</span>
              </div>

              {lab.ldl > 0 && (
                <div className="al d">
                  <div className="al-top">
                    <span className="al-title">LDL {lab.ldl} mg/dL</span>
                    <span className="bk d">Crítico</span>
                  </div>
                  <div style={{ margin: '.4rem 0' }}>
                    <div className="pb"><div className="pb-row"><div className="pb-l">Seu valor</div><div className="pb-t"><div className="pb-f" style={{ width: Math.min((lab.ldl / 300) * 100, 100) + '%', background: '#ef4444' }}></div></div><div className="pb-v" style={{ color: '#ef4444' }}>{lab.ldl}</div></div></div>
                    <div className="pb" style={{ marginBottom: 0 }}><div className="pb-row"><div className="pb-l">Ideal (&lt;100)</div><div className="pb-t"><div className="pb-f" style={{ width: '33%', background: 'rgba(34,197,94,0.5)' }}></div></div><div className="pb-v" style={{ color: '#4ade80' }}>100</div></div></div>
                  </div>
                  <div className="al-desc">Risco cardiovascular muito alto. Acompanhamento cardiológico urgente. Reduzir gordura saturada — impacto direto no LDL.</div>
                </div>
              )}

              {lab.hdl > 0 && (
                <div className="al d">
                  <div className="al-top">
                    <span className="al-title">HDL {lab.hdl} mg/dL</span>
                    <span className="bk d">Crítico</span>
                  </div>
                  <div style={{ margin: '.4rem 0' }}>
                    <div className="pb"><div className="pb-row"><div className="pb-l">Seu valor</div><div className="pb-t"><div className="pb-f" style={{ width: Math.min((lab.hdl / 100) * 100, 100) + '%', background: '#ef4444' }}></div></div><div className="pb-v" style={{ color: '#ef4444' }}>{lab.hdl}</div></div></div>
                    <div className="pb" style={{ marginBottom: 0 }}><div className="pb-row"><div className="pb-l">Ideal (&gt;40)</div><div className="pb-t"><div className="pb-f" style={{ width: '40%', background: 'rgba(34,197,94,0.5)' }}></div></div><div className="pb-v" style={{ color: '#4ade80' }}>40+</div></div></div>
                  </div>
                  <div className="al-desc">HDL baixo amplifica o risco do LDL alto. Cardio zona 2 (2–3×/sem, 30–45 min) eleva HDL naturalmente.</div>
                </div>
              )}

              {lab.hct > 0 && (
                <div className="al d">
                  <div className="al-top">
                    <span className="al-title">Hematócrito {num(lab.hct)}%</span>
                    <span className="bk d">Crítico</span>
                  </div>
                  <div style={{ margin: '.4rem 0' }}>
                    <div className="pb"><div className="pb-row"><div className="pb-l">Seu valor</div><div className="pb-t"><div className="pb-f" style={{ width: Math.min(lab.hct, 100) + '%', background: '#ef4444' }}></div></div><div className="pb-v" style={{ color: '#ef4444' }}>{num(lab.hct)}%</div></div></div>
                    <div className="pb" style={{ marginBottom: 0 }}><div className="pb-row"><div className="pb-l">Normal (&lt;52%)</div><div className="pb-t"><div className="pb-f" style={{ width: '52%', background: 'rgba(34,197,94,0.5)' }}></div></div><div className="pb-v" style={{ color: '#4ade80' }}>52%</div></div></div>
                  </div>
                  <div className="al-desc">Sangue mais viscoso = risco de trombose. Com desidratação crônica, o risco se multiplica. 3L+/dia é tratamento.</div>
                </div>
              )}

              {lab.hcy > 0 && (
                <div className="al d">
                  <div className="al-top">
                    <span className="al-title">Homocisteína {lab.hcy} µmol/L</span>
                    <span className="bk d">Muito alto</span>
                  </div>
                  <div className="al-desc">Ideal abaixo de 15. Fator de risco cardiovascular independente. B6, B12 e ácido fólico ajudam a reduzir — acompanhamento médico.</div>
                </div>
              )}

              {lab.vitd > 0 && (
                <div className="al w">
                  <div className="al-top">
                    <span className="al-title">Vitamina D {num(lab.vitd)} ng/mL</span>
                    <span className="bk w">Deficiente</span>
                  </div>
                  <div style={{ margin: '.4rem 0' }}>
                    <div className="pb"><div className="pb-row"><div className="pb-l">Seu valor</div><div className="pb-t"><div className="pb-f" style={{ width: Math.min((lab.vitd / 80) * 100, 100) + '%', background: '#f97316' }}></div></div><div className="pb-v" style={{ color: '#f97316' }}>{num(lab.vitd)}</div></div></div>
                    <div className="pb" style={{ marginBottom: 0 }}><div className="pb-row"><div className="pb-l">Ótimo (&gt;50)</div><div className="pb-t"><div className="pb-f" style={{ width: '62%', background: 'rgba(34,197,94,0.5)' }}></div></div><div className="pb-v" style={{ color: '#4ade80' }}>50</div></div></div>
                  </div>
                  <div className="al-desc">Impacta força, recuperação e imunidade. Suplementar imediatamente: 5.000–10.000 UI/dia. Refazer exame em 90 dias.</div>
                </div>
              )}
            </div>
          )}

          {/* 4 — TREINOS */}
          {workoutsByMonth.length > 0 && (
            <div className="sec">
              <div className="sh">
                <div className="sn">4</div>
                <div className="st">Treinos</div>
                <span className="sb">Últimos 6 meses</span>
              </div>
              <div className="g3" style={{ marginBottom: '1.1rem' }}>
                <div className="c">
                  <div className="cl">Frequência</div>
                  <div className="cv gr">
                    {workoutsByMonth.length > 0
                      ? `${((workoutsByMonth.reduce((s, w) => s + w.treinos, 0) / workoutsByMonth.length) / 4).toFixed(1).replace('.', ',')}×/sem`
                      : '—'}
                  </div>
                  <div className="cs">Consistência alta</div>
                </div>
                <div className="c">
                  <div className="cl">Pico mensal</div>
                  <div className="cv w">
                    {workoutsByMonth.length > 0 ? workoutsByMonth.reduce((a, b) => b.treinos > a.treinos ? b : a).mes : '—'}
                  </div>
                  <div className="cs">{workoutsByMonth.length > 0 ? `${workoutsByMonth.reduce((a, b) => b.treinos > a.treinos ? b : a).treinos} treinos` : ''}</div>
                </div>
                <div className="c">
                  <div className="cl">Total {new Date().getFullYear()}</div>
                  <div className="cv g">{totalWorkouts}</div>
                  <div className="cs">Treinos concluídos</div>
                </div>
              </div>

              <RelatorioCharts
                assessments={chartAssessments}
                workoutsByMonth={workoutsByMonth}
                nutritionDays={chartNutrition}
                nutritionGoalKcal={goalKcal}
                showEvolution={false}
                showFrequency
                showNutrition={false}
              />

              {templates.length > 0 && (
                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                  {templates.map((t) => (
                    <a key={t.id} className="dc" href="https://irontracks.com.br" target="_blank" rel="noopener">
                      <div className="dcd">{t.name.split('·')[0].trim()}</div>
                      <div className="dcn">{t.name.includes('·') ? t.name.split('·').slice(1).join('·').trim() : t.name}</div>
                      <div>
                        {(t.exercises ?? []).map((e, i) => (
                          <span
                            key={i}
                            className={`pl${e.method === 'Drop-Set' ? ' dp' : e.method === 'Rest-Pause' ? ' rst' : ''}`}
                          >
                            {e.name}
                          </span>
                        ))}
                      </div>
                    </a>
                  ))}
                </div>
              )}
              {templates.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="pl dp">Drop-set</span>
                  <span className="pl rst">Rest-pause</span>
                  <span className="pl">Normal</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>métodos de intensidade</span>
                </div>
              )}
            </div>
          )}

          {/* 5 — NUTRIÇÃO */}
          {nutritionLogs.length > 0 && (
            <div className="sec">
              <div className="sh">
                <div className="sn">5</div>
                <div className="st">Nutrição</div>
                <span className="sb">Últimos 14 dias</span>
              </div>

              {lab.hct > 52 && (
                <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 11, padding: '.85rem 1rem', marginBottom: '.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>Hidratação — emergência</div>
                    <span className="bk d">~0 ml registrado/dia</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.55 }}>
                    Com hematócrito {num(lab.hct)}%, beber 3L+/dia é tratamento médico — não é opcional.
                  </div>
                </div>
              )}

              <div className="g4" style={{ marginBottom: '1.1rem' }}>
                <div className={`c${Math.abs(diffPct(avgKcal, goalKcal)) > 15 ? ' rd' : ''}`}>
                  <div className="cl">Calorias · meta {goalKcal.toLocaleString('pt-BR')}</div>
                  <div className={`cv ${Math.abs(diffPct(avgKcal, goalKcal)) > 15 ? 'o' : 'w'}`}>{avgKcal.toLocaleString('pt-BR')}</div>
                  <div className="cs">{diffPct(avgKcal, goalKcal) > 0 ? '+' : ''}{diffPct(avgKcal, goalKcal)}% da meta</div>
                </div>
                <div className={`c${avgProt < goalProt * 0.9 ? ' rd' : ''}`}>
                  <div className="cl">Proteína · meta {goalProt}g</div>
                  <div className={`cv ${avgProt >= goalProt * 0.95 ? 'gr' : avgProt >= goalProt * 0.85 ? 'o' : 'r'}`}>{avgProt} g</div>
                  <div className="cs">{diffPct(avgProt, goalProt) > 0 ? '+' : ''}{diffPct(avgProt, goalProt)}% da meta</div>
                </div>
                <div className="c">
                  <div className="cl">Carbs · meta {goalCarbs}g</div>
                  <div className={`cv ${avgCarbs >= goalCarbs * 0.95 ? 'gr' : 'o'}`}>{avgCarbs} g</div>
                  <div className="cs">{diffPct(avgCarbs, goalCarbs) > 0 ? '+' : ''}{diffPct(avgCarbs, goalCarbs)}% da meta</div>
                </div>
                <div className={`c${avgFat > goalFat * 1.2 ? ' rd' : ''}`}>
                  <div className="cl">Gordura · meta {goalFat}g</div>
                  <div className={`cv ${avgFat <= goalFat * 1.05 ? 'gr' : avgFat <= goalFat * 1.2 ? 'o' : 'r'}`}>{avgFat} g</div>
                  <div className="cs">{diffPct(avgFat, goalFat) > 0 ? '+' : ''}{diffPct(avgFat, goalFat)}% da meta{avgFat > goalFat * 1.2 ? ' !' : ''}</div>
                </div>
              </div>

              <RelatorioCharts
                assessments={chartAssessments}
                workoutsByMonth={workoutsByMonth}
                nutritionDays={chartNutrition}
                nutritionGoalKcal={goalKcal}
                showEvolution={false}
                showFrequency={false}
                showNutrition
              />
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
                Barras vermelhas = dias com registro incompleto · linha tracejada = meta {goalKcal.toLocaleString('pt-BR')} kcal
              </div>
            </div>
          )}

          {/* 6 — PLANO DE AÇÃO */}
          <div className="sec">
            <div className="sh">
              <div className="sn" style={{ background: 'rgba(250,204,21,0.12)', borderColor: 'rgba(250,204,21,0.3)', color: '#facc15' }}>6</div>
              <div className="st">Plano de ação</div>
            </div>

            {hasLab && (
              <>
                <div className="dlbl">Urgente — saúde cardiovascular</div>
                <div className="pc p1">
                  <div className="pn">1</div>
                  <div><div className="pt">Consulta cardiologista + endocrinologista</div><div className="pd">{lab.ldl > 0 ? `LDL ${lab.ldl}` : ''}{lab.hdl > 0 ? ` · HDL ${lab.hdl}` : ''}{lab.hct > 0 ? ` · Hematócrito ${num(lab.hct)}%` : ''} — avaliação médica urgente com os exames recentes.</div></div>
                </div>
                {lab.hct > 52 && (
                  <div className="pc p1">
                    <div className="pn">2</div>
                    <div><div className="pt">Água: 3 litros mínimo por dia</div><div className="pd">Hematócrito elevado + desidratação = risco de trombose. Registrar no app todo dia.</div></div>
                  </div>
                )}
                {lab.vitd > 0 && lab.vitd < 30 && (
                  <div className="pc p1">
                    <div className="pn">3</div>
                    <div><div className="pt">Suplementar Vitamina D imediatamente</div><div className="pd">Nível atual {num(lab.vitd)} ng/mL. 5.000–10.000 UI/dia. Refazer exame em 90 dias.</div></div>
                  </div>
                )}
              </>
            )}

            <div className="dlbl">Nutrição — ajustes esta semana</div>
            {avgFat > goalFat * 1.15 && (
              <div className="pc p2">
                <div className="pn">{hasLab ? 4 : 1}</div>
                <div><div className="pt">Reduzir gordura saturada ({avgFat}g → meta {goalFat}g)</div><div className="pd">+{diffPct(avgFat, goalFat)}% acima da meta. Evitar queijos pesados, embutidos e frituras. Direto no LDL.</div></div>
              </div>
            )}
            {avgProt < goalProt * 0.92 && (
              <div className="pc p2">
                <div className="pn">{hasLab ? 5 : 2}</div>
                <div><div className="pt">Aumentar proteína ({avgProt}g → meta {goalProt}g)</div><div className="pd">Café da tarde e pós-treino são as refeições com menos proteína. Whey + iogurte grego resolvem.</div></div>
              </div>
            )}

            <div className="dlbl">Treino — inclusão</div>
            <div className="pc p3">
              <div className="pn">{hasLab ? 7 : 3}</div>
              <div><div className="pt">Cardio zona 2 (2–3×/semana, 30–45 min)</div><div className="pd">60–70% FCmáx. Eleva HDL, reduz LDL, melhora viscosidade sanguínea. O exercício mais cardioprotetor para este perfil.</div></div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="ft">
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
              <span style={{ color: '#fff' }}>IRON</span><span style={{ color: '#facc15' }}>TRACKS</span>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              Gerado em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} · Dados reais do app · {user.email}
            </div>
            <div className="clist">
              <a className="cta" href="https://irontracks.com.br">Abrir IronTracks</a>
              <a className="cta sec2" href={`mailto:${user.email}`}>Entrar em contato</a>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
