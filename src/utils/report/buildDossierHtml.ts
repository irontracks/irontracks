import { escapeHtml } from '@/utils/escapeHtml'
import {
  avisoForaDoPeriodo, formatarDataBr, SEM_REGISTRO,
  type DossierInput, type Registro, type RegistroResolvido,
} from '@/lib/dossier/buildDossier'

/**
 * HTML do dossiê (semanal/mensal). Sem IA de propósito (decisão do dono):
 * é um documento de FATOS para avaliação externa — treino, dieta, exame e
 * avaliações — e cada seção diz quando não tem dado, ou quando o dado é de
 * fora do período. Sai por `exportHtmlAsPdf`, como todo arquivo do app.
 */

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const fmt = (v: unknown, casas = 1, sufixo = ''): string => {
  const n = num(v)
  return n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: casas })}${sufixo}`
}
const int = (v: unknown): string => fmt(v, 0)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))
const rec = (v: unknown): Registro => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Registro) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const card = (label: string, value: string, sub?: string) =>
  `<div class="card"><div class="card-label">${escapeHtml(label)}</div><div class="card-value">${escapeHtml(value)}</div>${sub ? `<div class="card-sub">${escapeHtml(sub)}</div>` : ''}</div>`

const aviso = (texto: string) => `<p class="aviso">${escapeHtml(texto)}</p>`
const vazio = (texto: string) => `<p class="vazio">${escapeHtml(texto)}</p>`

function cabecalhoRegistro<T>(r: RegistroResolvido<T> | null): string {
  if (!r) return vazio(SEM_REGISTRO)
  return r.foraDoPeriodo
    ? aviso(avisoForaDoPeriodo(r.data))
    : `<p class="quando">Registro de ${escapeHtml(formatarDataBr(r.data))}</p>`
}

function secaoTreino(input: DossierInput): string {
  const t = input.treino
  if (!t || !t.stats || !(Number(t.stats.count) > 0)) return vazio('Nenhum treino concluído no período.')
  const s = t.stats
  const top = arr(s.topExercisesByVolume).slice(0, 5).map((e) => rec(e))
  const sessoes = arr(s.sessionSummaries).map((x) => rec(x))
  return `
    <div class="cards">
      ${card('Treinos', int(s.count), `${int(s.uniqueDaysCount ?? s.count)} dias distintos`)}
      ${card('Tempo total', `${int(s.totalMinutes)} min`, `média ${int(s.avgMinutes)} min/treino`)}
      ${card('Volume', `${int(s.totalVolumeKg)} kg`, `média ${int(s.avgVolumeKg)} kg/treino`)}
      ${card('Séries · reps', `${int(s.totalSets)} · ${int(s.totalReps)}`)}
    </div>
    ${top.length ? `
    <p class="section-sub">Exercícios com mais volume</p>
    <table><thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Volume</th><th>Sessões</th></tr></thead><tbody>
      ${top.map((e) => `<tr><td class="dia">${escapeHtml(str(e.name))}</td><td>${int(e.sets)}</td><td>${int(e.reps)}</td><td>${int(e.volumeKg)} kg</td><td>${int(e.sessionsCount)}</td></tr>`).join('')}
    </tbody></table>` : ''}
    ${sessoes.length ? `
    <p class="section-sub">Sessões</p>
    <table><thead><tr><th>Data</th><th>Duração</th><th>Volume</th></tr></thead><tbody>
      ${sessoes.map((x) => {
        const d = x.date instanceof Date ? x.date : new Date(String(x.date ?? ''))
        const dl = Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
        return `<tr><td class="dia">${escapeHtml(dl)}</td><td>${int(x.minutes)} min</td><td>${int(x.volumeKg)} kg</td></tr>`
      }).join('')}
    </tbody></table>` : ''}`
}

function secaoNutricao(input: DossierInput): string {
  const n = input.nutricao
  if (!n || n.loggedDays <= 0) return vazio('Nenhuma refeição lançada no período.')
  const meta = input.metaKcal
  const cobertura = `${n.loggedDays} de ${n.windowDays} dias com lançamento` + (n.excludedDays > 0 ? ` · ${n.excludedDays} marcado(s) como registro incompleto, fora da média` : '')
  const dias = [...input.nutricaoDias].sort((a, b) => (a.date < b.date ? 1 : -1))
  return `
    <div class="cards">
      ${card('Média diária', `${int(n.avgCalories)} kcal`, meta ? `meta ${int(meta)} kcal` : undefined)}
      ${card('Proteína', `${int(n.avgProtein)} g/dia`)}
      ${card('Carboidrato', `${int(n.avgCarbs)} g/dia`)}
      ${card('Gordura', `${int(n.avgFat)} g/dia`)}
    </div>
    <p class="nota">${escapeHtml(cobertura)}. Dia sem lançamento não entra como zero.</p>
    ${dias.length ? `
    <table><thead><tr><th>Dia</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Refeições</th></tr></thead><tbody>
      ${dias.map((d) => `<tr><td class="dia">${escapeHtml(formatarDataBr(d.date))}</td><td>${int(d.calories)}</td><td>${int(d.protein)} g</td><td>${int(d.carbs)} g</td><td>${int(d.fat)} g</td><td>${int(d.meals)}</td></tr>`).join('')}
    </tbody></table>` : ''}`
}

function secaoExame(input: DossierInput): string {
  const r = input.exame
  const head = cabecalhoRegistro(r)
  if (!r) return head
  const e = r.registro
  const protocolo = rec(e.protocol)
  const extraido = rec(e.extracted_markers)
  const marcadores = arr(extraido.markers).map((m) => rec(m))
  const foraDaFaixa = marcadores.filter((m) => str(m.status) && str(m.status) !== 'normal')
  const alertas = arr(protocolo.medicalAlerts).map((a) => rec(a))
  return `${head}
    <p class="linha"><strong>Laboratório:</strong> ${escapeHtml(str(e.lab_name) || '—')}</p>
    ${str(protocolo.headline) ? `<p class="destaque">${escapeHtml(str(protocolo.headline))}</p>` : ''}
    ${str(protocolo.overallAssessment) ? `<p class="linha">${escapeHtml(str(protocolo.overallAssessment))}</p>` : ''}
    ${alertas.length ? `<p class="section-sub">Alertas</p><ul class="lista">${alertas.map((a) => `<li>${escapeHtml(str(a.marker || a.name || a.title))}${str(a.marker || a.name || a.title) ? ': ' : ''}${escapeHtml(str(a.message || a.text || a.description || a.value))}</li>`).join('')}</ul>` : ''}
    ${marcadores.length ? `
    <p class="section-sub">Marcadores (${marcadores.length}; ${foraDaFaixa.length} fora da faixa)</p>
    <table><thead><tr><th>Marcador</th><th>Valor</th><th>Referência</th><th>Status</th></tr></thead><tbody>
      ${[...foraDaFaixa, ...marcadores.filter((m) => !foraDaFaixa.includes(m))].slice(0, 60).map((m) => {
        const ref = m.refMin != null || m.refMax != null ? `${fmt(m.refMin, 2)} – ${fmt(m.refMax, 2)}` : '—'
        const st = str(m.status) || '—'
        return `<tr><td class="dia">${escapeHtml(str(m.name))}</td><td>${escapeHtml(fmt(m.value, 2))} ${escapeHtml(str(m.unit))}</td><td>${escapeHtml(ref)}</td><td class="${st !== 'normal' ? 'fora' : ''}">${escapeHtml(st)}</td></tr>`
      }).join('')}
    </tbody></table>` : ''}`
}

function secaoAvaliacaoFisica(input: DossierInput): string {
  const r = input.avaliacaoFisica
  const head = cabecalhoRegistro(r)
  if (!r) return head
  const a = r.registro
  const bf = a.body_fat_percentage ?? a.body_fat_percentage_skinfold ?? a.bia_body_fat_percentage ?? a.bf
  const circ = (label: string, v: unknown) => (num(v) == null ? '' : `<tr><td class="dia">${escapeHtml(label)}</td><td>${escapeHtml(fmt(v, 1, ' cm'))}</td></tr>`)
  const circs = [
    circ('Braço', a.arm_circ ?? a.arm), circ('Peito', a.chest_circ), circ('Cintura', a.waist_circ ?? a.waist),
    circ('Quadril', a.hip_circ), circ('Coxa', a.thigh_circ), circ('Panturrilha', a.calf_circ),
  ].join('')
  return `${head}
    <div class="cards">
      ${card('Peso', fmt(a.weight, 1, ' kg'))}
      ${card('Gordura', fmt(bf, 1, '%'))}
      ${card('Massa magra', fmt(a.lean_mass ?? a.bia_lean_mass, 1, ' kg'))}
      ${card('IMC', fmt(a.bmi, 1))}
    </div>
    ${num(a.bia_water_percentage) != null || num(a.bia_visceral_fat) != null ? `<p class="linha"><strong>BIA:</strong> água ${escapeHtml(fmt(a.bia_water_percentage, 1, '%'))} · gordura visceral ${escapeHtml(fmt(a.bia_visceral_fat, 1))} · idade metabólica ${escapeHtml(fmt(a.bia_metabolic_age, 0))}</p>` : ''}
    ${circs ? `<p class="section-sub">Circunferências</p><table><tbody>${circs}</tbody></table>` : ''}
    ${str(a.observations || a.notes) ? `<p class="linha"><strong>Observações:</strong> ${escapeHtml(str(a.observations || a.notes))}</p>` : ''}`
}

function secaoAvaliacaoFoto(input: DossierInput): string {
  const r = input.avaliacaoFoto
  const head = cabecalhoRegistro(r)
  if (!r) return head
  const f = r.registro
  const an = rec(f.analysis)
  const lo = f.body_fat_estimate_low, hi = f.body_fat_estimate_high
  const pontos = arr(an.strengths).map(str).filter(Boolean)
  const melhorar = arr(an.improvements).map(str).filter(Boolean)
  return `${head}
    <div class="cards">
      ${card('Gordura estimada', num(lo) != null && num(hi) != null ? `${fmt(lo, 0)}–${fmt(hi, 0)}%` : '—')}
      ${card('Composição', fmt(f.composition_score, 0))}
      ${card('Simetria', fmt(f.symmetry_score, 0))}
      ${card('Postura', fmt(f.posture_score, 0))}
    </div>
    ${str(an.summary) ? `<p class="linha">${escapeHtml(str(an.summary))}</p>` : ''}
    ${pontos.length ? `<p class="section-sub">Pontos fortes</p><ul class="lista">${pontos.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
    ${melhorar.length ? `<p class="section-sub">A melhorar</p><ul class="lista">${melhorar.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}`
}

export function buildDossierHtml(input: DossierInput): string {
  const p = input.periodo
  const titulo = p.tipo === 'week' ? 'Dossiê semanal' : 'Dossiê mensal'
  const intervalo = `${formatarDataBr(p.inicio)} – ${formatarDataBr(p.fim)}`
  const gerado = new Date(input.geradoEm)
  const geradoLabel = Number.isNaN(gerado.getTime()) ? '' : gerado.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const secao = (t: string, corpo: string) => `<section class="secao"><h2 class="section-title">${escapeHtml(t)}</h2>${corpo}</section>`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(titulo)} — IronTracks</title>
<style>
  @page{margin:14mm}
  *{box-sizing:border-box}
  body{margin:0;background:#ffffff;color:#0b0b0c;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.35}
  .wrap{max-width:820px;margin:0 auto;padding:18px}
  .head{display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px}
  .brand-name{font-size:15px;font-weight:900;letter-spacing:.02em}
  .head-right{margin-left:auto;text-align:right}
  .pill{display:inline-flex;align-items:center;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.16em;color:#0b0b0c;background:#facc15;border:1px solid rgba(0,0,0,.15);padding:6px 10px;border-radius:999px}
  .meta{font-size:12px;color:#6b7280;font-weight:700;margin-top:6px}
  h1{font-size:20px;font-weight:900;margin:0 0 2px}
  .range{font-size:12px;color:#111827;font-weight:800;margin-bottom:14px}
  .secao{margin-bottom:22px;break-inside:avoid;page-break-inside:avoid}
  .section-title{font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#6b7280;font-weight:900;margin:0 0 8px;border-bottom:1px solid #eef2f7;padding-bottom:4px}
  .section-sub{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6b7280;font-weight:800;margin:12px 0 6px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px}
  .card{background:#f7f7f8;border:1px solid #e5e7eb;border-radius:14px;padding:12px}
  .card-label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#6b7280;font-weight:900}
  .card-value{font-size:18px;font-weight:900;color:#0b0b0c;margin-top:6px}
  .card-sub{font-size:11px;color:#6b7280;font-weight:700;margin-top:2px}
  .nota,.quando{font-size:11px;color:#6b7280;font-weight:600;margin:6px 0 10px}
  .aviso{font-size:11px;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:8px 10px;font-weight:700;margin:0 0 10px}
  .vazio{font-size:12px;color:#6b7280;font-weight:700;margin:0}
  .linha{font-size:12px;color:#111827;margin:6px 0}
  .destaque{font-size:13px;color:#111827;font-weight:900;margin:6px 0}
  .lista{font-size:12px;color:#111827;margin:4px 0 8px;padding-left:18px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #eef2f7;border-radius:12px;overflow:hidden}
  th,td{padding:7px 10px;text-align:left;font-size:12px;border-bottom:1px solid #f1f5f9}
  th{color:#6b7280;text-transform:uppercase;font-weight:900;font-size:10px;letter-spacing:.16em;background:#fafafa}
  tr:last-child td{border-bottom:none}
  td.dia{font-weight:800;color:#111827;white-space:nowrap}
  td.fora{color:#b91c1c;font-weight:800}
  .foot{margin-top:18px;font-size:10px;color:#6b7280;font-weight:600}
</style></head><body><div class="wrap">
  <div class="head">
    <div class="brand-name">IRONTRACKS</div>
    <div class="head-right"><span class="pill">${escapeHtml(titulo)}</span><div class="meta">${escapeHtml(input.aluno || '')}${geradoLabel ? ` · gerado em ${escapeHtml(geradoLabel)}` : ''}</div></div>
  </div>
  <h1>${escapeHtml(titulo)}</h1>
  <div class="range">${escapeHtml(intervalo)} · ${p.dias} dias</div>
  ${secao('Treinos', secaoTreino(input))}
  ${secao('Dieta', secaoNutricao(input))}
  ${secao('Exames laboratoriais', secaoExame(input))}
  ${secao('Avaliação física', secaoAvaliacaoFisica(input))}
  ${secao('Avaliação por foto', secaoAvaliacaoFoto(input))}
  <p class="foot">Documento gerado pelo IronTracks a partir dos registros do próprio usuário. Não substitui avaliação profissional.</p>
</div></body></html>`
}
