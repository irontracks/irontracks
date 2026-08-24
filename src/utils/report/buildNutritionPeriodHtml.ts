/**
 * HTML do relatório de NUTRIÇÃO por período — o arquivo que vai para o
 * nutricionista (pedido do dono, 24/08/2026).
 *
 * Documento impresso, não tela: fundo branco, tipografia do sistema e nenhuma
 * dependência externa. O `exportHtmlAsPdf` embute isto num arquivo único, e no
 * iPhone o share sheet leva para Arquivos/WhatsApp/e-mail — por isso não pode
 * haver `<img src="http…">` nem fonte remota: o que não estiver embutido chega
 * quebrado do outro lado.
 *
 * ## O que este relatório NÃO faz, de propósito
 *
 * Não inventa dia. A lista traz só os dias COM lançamento, e a cobertura
 * ("22 de 30 dias") viaja no cabeçalho justamente para o leitor saber o que
 * está faltando. Preencher os 8 dias vazios com zero produziria uma média
 * despencada que nunca aconteceu — a mesma classe do `workout_calories: 300`
 * que já saiu do heatmap por ser um literal exibido como medição.
 *
 * A média divide pelos dias REGISTRADOS (é o que `summarizeHistory` entrega),
 * e o texto diz isso com todas as letras. Num relatório clínico a diferença
 * entre "média por dia registrado" e "média do período" é a diferença entre um
 * dado e um erro.
 */
import { escapeHtml } from '@/utils/escapeHtml'
import type { NutritionHistoryDay, NutritionHistorySummary } from '@/lib/nutrition/history'
import { formatarDataCurta, rotuloPeriodo, type NutritionPeriod } from '@/lib/nutrition/historyPeriod'

export type NutritionPeriodReportInput = {
  periodo: NutritionPeriod
  dias: NutritionHistoryDay[]
  resumo: NutritionHistorySummary
  /** Meta diária ATUAL, quando houver. O banco não guarda meta datada. */
  metaKcal?: number | null
  /** Nome de quem gerou, para o cabeçalho. Opcional. */
  nome?: string | null
  /** Logo em data URL. Ausente = cabeçalho só com o nome da marca. */
  logoDataUrl?: string | null
  /** Data de emissão (YYYY-MM-DD). Injetada pelo chamador — nada de relógio aqui dentro. */
  emitidoEm: string
}

const inteiro = (n: unknown): string => {
  const v = Number(n)
  return (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0).toLocaleString('pt-BR')
}

/** "Sáb., 22 de ago." — o mesmo formato que o usuário vê na lista do app. */
const rotuloDiaLongo = (date: string): string => {
  try {
    const d = new Date(`${date}T12:00:00`)
    const s = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  } catch {
    return formatarDataCurta(date)
  }
}

export function buildNutritionPeriodHtml(input: NutritionPeriodReportInput): string {
  const { periodo, dias, resumo, metaKcal, nome, logoDataUrl, emitidoEm } = input
  const lista = Array.isArray(dias) ? dias : []

  const titulo = `Nutrição — ${rotuloPeriodo(periodo)}`
  /**
   * A linha sob o título sempre ACRESCENTA, nunca repete.
   *
   * Numa janela fixa o título diz "Últimos 7 dias" e as datas são a informação
   * que falta. Num período personalizado é o contrário: o título JÁ é o
   * intervalo (`rotuloPeriodo` devolve as datas), e repeti-lo imprimia
   * "01/05/2026 a 31/07/2026" duas vezes seguidas — visto ao conferir o
   * documento renderizado, não por teste. Um fato aparece uma vez
   * (`docs/DESIGN_HIERARCHY.md`); ali o que falta é o TAMANHO do período.
   */
  const subtitulo = periodo.janelaFixa != null
    ? `${formatarDataCurta(periodo.inicio)} a ${formatarDataCurta(periodo.fim)}`
    : `${periodo.dias} dias`

  const meta = Number(metaKcal)
  const temMeta = Number.isFinite(meta) && meta > 0
  // Só faz sentido comparar a meta com a média POR DIA REGISTRADO — comparar
  // com o total do período diria "você comeu 45.000 de 2.600".
  const difMeta = temMeta ? resumo.avgCalories - Math.round(meta) : 0

  const linhas = lista.map((d) => `
        <tr>
          <td class="dia">${escapeHtml(rotuloDiaLongo(d.date))}</td>
          <td class="num forte">${inteiro(d.calories)}</td>
          <td class="num">${inteiro(d.protein)} g</td>
          <td class="num">${inteiro(d.carbs)} g</td>
          <td class="num">${inteiro(d.fat)} g</td>
          <td class="num suave">${inteiro(d.meals)}</td>
        </tr>`).join('')

  const corpoTabela = lista.length
    ? linhas
    : `<tr><td class="vazio" colspan="6">Nenhum dia com lançamento neste período.</td></tr>`

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(titulo)}</title>
<style>
  @page{margin:14mm}
  *{box-sizing:border-box}
  body{margin:0;background:#ffffff;color:#0b0b0c;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.35}
  .wrap{max-width:820px;margin:0 auto;padding:18px}
  .head{display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px}
  .brand-logo{width:34px;height:34px;border-radius:9px;object-fit:cover;border:1px solid #e5e7eb;background:#fff}
  .brand-name{font-size:15px;font-weight:900;letter-spacing:.02em}
  .head-right{margin-left:auto;text-align:right}
  .pill{display:inline-flex;align-items:center;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.16em;color:#0b0b0c;background:#facc15;border:1px solid rgba(0,0,0,.15);padding:6px 10px;border-radius:999px}
  .meta{font-size:12px;color:#6b7280;font-weight:700;margin-top:6px}
  h1{font-size:20px;font-weight:900;margin:0 0 2px}
  .range{font-size:12px;color:#111827;font-weight:800;margin-bottom:14px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px}
  .card{background:#f7f7f8;border:1px solid #e5e7eb;border-radius:14px;padding:12px;break-inside:avoid;page-break-inside:avoid}
  .card-label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#6b7280;font-weight:900}
  .card-value{font-size:18px;font-weight:900;color:#0b0b0c;margin-top:6px}
  .card-sub{font-size:11px;color:#6b7280;font-weight:700;margin-top:2px}
  .nota{font-size:11px;color:#6b7280;font-weight:600;margin:10px 0 18px}
  .section-title{font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#6b7280;font-weight:900;margin:0 0 8px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #eef2f7;border-radius:12px;overflow:hidden}
  th,td{padding:7px 10px;text-align:left;font-size:12px;border-bottom:1px solid #f1f5f9}
  th{color:#6b7280;text-transform:uppercase;font-weight:900;font-size:10px;letter-spacing:.16em;background:#fafafa}
  tr:last-child td{border-bottom:none}
  td.dia{font-weight:800;color:#111827;white-space:nowrap}
  td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.forte{font-weight:900}
  td.suave{color:#6b7280}
  td.vazio{color:#6b7280;text-align:center;padding:18px}
  tfoot td{background:#fafafa;font-weight:900;border-top:1px solid #e5e7eb}
  .rodape{margin-top:18px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;font-weight:700}
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      ${logoDataUrl ? `<img class="brand-logo" src="${escapeHtml(logoDataUrl)}" alt="" />` : ''}
      <div>
        <div class="brand-name">IRONTRACKS</div>
        ${nome ? `<div class="meta">${escapeHtml(String(nome))}</div>` : ''}
      </div>
      <div class="head-right">
        <span class="pill">Nutrição</span>
        <div class="meta">Emitido em ${escapeHtml(formatarDataCurta(emitidoEm))}</div>
      </div>
    </div>

    <h1>${escapeHtml(titulo)}</h1>
    <div class="range">${escapeHtml(subtitulo)}</div>

    <div class="cards">
      <div class="card">
        <div class="card-label">Média por dia registrado</div>
        <div class="card-value">${inteiro(resumo.avgCalories)} kcal</div>
        ${temMeta ? `<div class="card-sub">Meta ${inteiro(meta)} kcal · ${difMeta >= 0 ? '+' : '−'}${inteiro(Math.abs(difMeta))}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-label">Proteína / dia</div>
        <div class="card-value">${inteiro(resumo.avgProtein)} g</div>
        <div class="card-sub">Total ${inteiro(resumo.totalProtein)} g</div>
      </div>
      <div class="card">
        <div class="card-label">Carbo / dia</div>
        <div class="card-value">${inteiro(resumo.avgCarbs)} g</div>
        <div class="card-sub">Total ${inteiro(resumo.totalCarbs)} g</div>
      </div>
      <div class="card">
        <div class="card-label">Gordura / dia</div>
        <div class="card-value">${inteiro(resumo.avgFat)} g</div>
        <div class="card-sub">Total ${inteiro(resumo.totalFat)} g</div>
      </div>
    </div>

    <p class="nota">
      ${inteiro(resumo.loggedDays)} de ${inteiro(resumo.windowDays)} dias com lançamento.
      As médias dividem pelos dias <strong>registrados</strong> — dias sem lançamento não entram
      como zero, para não rebaixar a média com refeições que apenas não foram anotadas.
    </p>

    <div class="section-title">Dia a dia</div>
    <table>
      <thead>
        <tr>
          <th>Dia</th><th style="text-align:right">kcal</th>
          <th style="text-align:right">Proteína</th><th style="text-align:right">Carbo</th>
          <th style="text-align:right">Gordura</th><th style="text-align:right">Refeições</th>
        </tr>
      </thead>
      <tbody>${corpoTabela}
      </tbody>
      ${lista.length ? `<tfoot>
        <tr>
          <td>Total do período</td>
          <td class="num">${inteiro(resumo.totalCalories)}</td>
          <td class="num">${inteiro(resumo.totalProtein)} g</td>
          <td class="num">${inteiro(resumo.totalCarbs)} g</td>
          <td class="num">${inteiro(resumo.totalFat)} g</td>
          <td class="num">—</td>
        </tr>
      </tfoot>` : ''}
    </table>

    <div class="rodape">Gerado pelo IronTracks · irontracks.com.br</div>
  </div>
</body>
</html>`
}
