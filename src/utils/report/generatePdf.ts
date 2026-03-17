import { logError } from '@/lib/logger'

interface AssessmentFormData {
  assessment_date?: string | null
  weight?: number | string | null
  height?: number | string | null
  age?: number | string | null
  gender?: string | null
  arm_circ?: number | string | null
  chest_circ?: number | string | null
  waist_circ?: number | string | null
  hip_circ?: number | string | null
  thigh_circ?: number | string | null
  calf_circ?: number | string | null
  triceps_skinfold?: number | string | null
  biceps_skinfold?: number | string | null
  subscapular_skinfold?: number | string | null
  suprailiac_skinfold?: number | string | null
  abdominal_skinfold?: number | string | null
  thigh_skinfold?: number | string | null
  calf_skinfold?: number | string | null
  observations?: string | null
}

interface BodyComposition {
  bodyFatPercentage?: number | null
  sumOfSkinfolds?: number | null
  leanMass?: number | null
  fatMass?: number | null
  bmi?: number | null
  bmr?: number | null
  tdee?: number | null
  [key: string]: unknown
}

interface AssessmentResults {
  bodyComposition?: BodyComposition | null
  bmr?: number | null
  bmi?: number | null
  leanMass?: number | null
  fatMass?: number | null
  bmiClassification?: string | null
  bodyFatClassification?: string | null
  [key: string]: unknown
}

// ── Helper: detect if running inside Capacitor WebView ────────────────────────
const isNativeApp = (): boolean => {
  try {
    if (typeof window === 'undefined') return false
    const win = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    return !!win.Capacitor?.isNativePlatform?.()
  } catch { return false }
}

// ── Build the assessment HTML document ────────────────────────────────────────
function buildAssessmentHtml(
  formData: AssessmentFormData,
  results: AssessmentResults,
  studentName: string
): string {
  const data = formData && typeof formData === 'object' ? formData : {}
  const metrics = results && typeof results === 'object' ? results : {}

  const name = String(studentName || 'Aluno').trim() || 'Aluno'
  const dateRaw = data?.assessment_date ?? new Date().toISOString().split('T')[0]
  const date = typeof dateRaw === 'string' && dateRaw ? dateRaw : new Date().toISOString().split('T')[0]

  const weight = Number.parseFloat(String(data?.weight ?? '0').replace(',', '.')) || 0
  const height = Number.parseFloat(String(data?.height ?? '0').replace(',', '.')) || 0
  const age = Number.parseInt(String(data?.age ?? '0'), 10) || 0
  const gender = String(data?.gender || '').toUpperCase()

  const bodyComposition = (metrics?.bodyComposition && typeof metrics.bodyComposition === 'object'
    ? metrics.bodyComposition
    : {}) as BodyComposition

  const bodyFatPercentage = Number(bodyComposition?.bodyFatPercentage ?? 0) || 0
  const sumOfSkinfolds = Number(bodyComposition?.sumOfSkinfolds ?? 0) || 0

  const bmr = Number(metrics?.bmr ?? 0) || 0
  const bmi = Number(metrics?.bmi ?? 0) || 0
  const bmiClassification = String(metrics?.bmiClassification || '')
  const bodyFatClassification = String(metrics?.bodyFatClassification || '')
  const leanMass = Number(metrics?.leanMass ?? 0) || 0
  const fatMass = Number(metrics?.fatMass ?? 0) || 0

  const observations = String(data?.observations || '')

  // Circumferences
  const circs = [
    ['Braço', data?.arm_circ],
    ['Tórax', data?.chest_circ],
    ['Cintura', data?.waist_circ],
    ['Quadril', data?.hip_circ],
    ['Coxa', data?.thigh_circ],
    ['Panturrilha', data?.calf_circ],
  ].filter(([_, v]) => v != null && v !== '' && v !== '0' && Number(v) > 0)

  const circRows = circs.map(([label, value]) =>
    `<tr><td>${label}</td><td>${value} cm</td></tr>`
  ).join('')

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Avaliação Física • ${name}</title>
    <style>
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0; background: #fff; color: #111;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px; line-height: 1.5;
      }
      .container { max-width: 800px; margin: 0 auto; padding: 24px; }
      .header {
        display: flex; justify-content: space-between; align-items: flex-end;
        border-bottom: 3px solid #111; padding-bottom: 12px; margin-bottom: 20px;
      }
      .brand { font-weight: 900; font-size: 28px; letter-spacing: -1px; }
      .brand .highlight { color: #d4a017; font-style: italic; }
      .subtitle { font-size: 11px; text-transform: uppercase; color: #666; font-weight: 700; letter-spacing: 2px; }
      .title { font-size: 18px; font-weight: 800; }
      .date { font-size: 12px; color: #666; }
      .section { margin-bottom: 20px; }
      .section h2 {
        font-size: 13px; margin: 0 0 8px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 1px; color: #333;
        border-bottom: 1px solid #e0e0e0; padding-bottom: 4px;
      }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
      .card {
        background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px;
      }
      .label { font-size: 10px; text-transform: uppercase; color: #888; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
      .value { font-size: 16px; font-weight: 800; }
      .value.green { color: #059669; }
      .value.red { color: #dc2626; }
      .value.gold { color: #d4a017; }
      .class-label { font-size: 11px; color: #666; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
      th, td { border-bottom: 1px solid #eee; padding: 5px 4px; text-align: left; }
      th { color: #888; text-transform: uppercase; font-weight: 700; font-size: 10px; }
      .footer {
        margin-top: 24px; padding-top: 8px; border-top: 1px solid #ddd;
        text-align: center; font-size: 10px; color: #999;
        text-transform: uppercase; letter-spacing: 2px;
      }
      .print-btn {
        display: block; margin: 20px auto; padding: 12px 32px;
        background: #111; color: #fff; border: none; border-radius: 8px;
        font-size: 15px; font-weight: 700; cursor: pointer;
        letter-spacing: 1px;
      }
      .print-btn:active { opacity: 0.7; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <div class="brand">IRON<span class="highlight">TRACKS</span></div>
          <div class="subtitle">Avaliação Física</div>
        </div>
        <div style="text-align:right">
          <div class="title">${name}</div>
          <div class="date">${date} • ${age ? `${age} anos` : ''} • ${gender === 'M' ? 'Masculino' : gender === 'F' ? 'Feminino' : ''}</div>
        </div>
      </div>

      <div class="section">
        <h2>Dados Básicos</h2>
        <div class="grid">
          <div class="card">
            <div class="label">Peso</div>
            <div class="value">${weight ? `${weight.toFixed(1)} kg` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Altura</div>
            <div class="value">${height ? `${height} cm` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">IMC</div>
            <div class="value">${bmi ? bmi.toFixed(1) : '-'}</div>
            ${bmiClassification ? `<div class="class-label">${bmiClassification}</div>` : ''}
          </div>
          <div class="card">
            <div class="label">TMB</div>
            <div class="value gold">${bmr ? `${bmr.toFixed(0)} kcal` : '-'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Composição Corporal</h2>
        <div class="grid">
          <div class="card">
            <div class="label">% Gordura</div>
            <div class="value">${bodyFatPercentage ? `${bodyFatPercentage.toFixed(1)}%` : '-'}</div>
            ${bodyFatClassification ? `<div class="class-label">${bodyFatClassification}</div>` : ''}
          </div>
          <div class="card">
            <div class="label">Massa Magra</div>
            <div class="value green">${leanMass ? `${leanMass.toFixed(1)} kg` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Massa Gorda</div>
            <div class="value red">${fatMass ? `${fatMass.toFixed(1)} kg` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Soma das Dobras</div>
            <div class="value">${sumOfSkinfolds ? `${sumOfSkinfolds.toFixed(1)} mm` : '-'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Dobras Cutâneas (mm)</h2>
        <table>
          <thead><tr><th>Região</th><th>Valor</th></tr></thead>
          <tbody>
            ${data?.triceps_skinfold ? `<tr><td>Tríceps</td><td>${data.triceps_skinfold} mm</td></tr>` : ''}
            ${data?.biceps_skinfold ? `<tr><td>Bíceps</td><td>${data.biceps_skinfold} mm</td></tr>` : ''}
            ${data?.subscapular_skinfold ? `<tr><td>Subescapular</td><td>${data.subscapular_skinfold} mm</td></tr>` : ''}
            ${data?.suprailiac_skinfold ? `<tr><td>Supra-ilíaca</td><td>${data.suprailiac_skinfold} mm</td></tr>` : ''}
            ${data?.abdominal_skinfold ? `<tr><td>Abdominal</td><td>${data.abdominal_skinfold} mm</td></tr>` : ''}
            ${data?.thigh_skinfold ? `<tr><td>Coxa</td><td>${data.thigh_skinfold} mm</td></tr>` : ''}
            ${data?.calf_skinfold ? `<tr><td>Panturrilha</td><td>${data.calf_skinfold} mm</td></tr>` : ''}
          </tbody>
        </table>
      </div>

      ${circs.length > 0 ? `
      <div class="section">
        <h2>Circunferências (cm)</h2>
        <table>
          <thead><tr><th>Região</th><th>Valor</th></tr></thead>
          <tbody>${circRows}</tbody>
        </table>
      </div>
      ` : ''}

      ${observations ? `<div class="section"><h2>Observações</h2><p style="color:#555">${observations}</p></div>` : ''}

      <div class="footer">IronTracks • ${date}</div>

      <button class="print-btn no-print" onclick="window.print()">
        📄 Salvar como PDF
      </button>
    </div>
  </body>
</html>`
}

/**
 * Opens the assessment as a printable page for PDF export.
 *
 * On iOS/Android (Capacitor), opens in the Capacitor Browser or iframe fallback.
 * On desktop, opens a new tab and triggers the print dialog.
 * If popups are blocked, uses a full-screen iframe overlay as fallback.
 */
export async function generateAssessmentPdf(
  formData: AssessmentFormData,
  results: AssessmentResults,
  studentName: string
): Promise<Blob> {
  try {
    const html = buildAssessmentHtml(formData, results, studentName)
    const blob = new Blob([html], { type: 'text/html' })

    if (isNativeApp()) {
      const url = URL.createObjectURL(blob)

      // Try Capacitor Browser plugin first
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { Browser } = await import('@capacitor/browser' as any)
        await Browser.open({ url })
        return blob
      } catch { /* plugin not available — try fallback */ }

      // Fallback: open in new window
      const w = window.open(url, '_blank')
      if (w) return blob

      // Last resort: inline iframe
      showPdfIframe(html)
      return blob
    }

    // Desktop: try opening a new tab
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      setTimeout(() => {
        try { printWindow.print() } catch { /* user cancelled */ }
      }, 500)
      return blob
    }

    // Popup blocked — use iframe fallback so the user still gets the PDF
    showPdfIframe(html)
    return blob
  } catch (error) {
    logError('error', 'Erro ao gerar PDF da avaliação', error)
    throw error
  }
}

/** Full-screen iframe overlay with close + print buttons — used when popups are blocked */
function showPdfIframe(html: string) {
  // Backdrop
  const backdrop = document.createElement('div')
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.6)'

  // Iframe
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:48px;left:0;right:0;bottom:0;width:100%;height:calc(100% - 48px);border:none;z-index:99999;background:#fff'
  iframe.srcdoc = html

  // Toolbar
  const toolbar = document.createElement('div')
  toolbar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:48px;z-index:100000;background:#111;display:flex;align-items:center;justify-content:space-between;padding:0 12px'

  const printBtn = document.createElement('button')
  printBtn.textContent = '📄 Salvar como PDF'
  printBtn.style.cssText = 'padding:8px 16px;background:#d4a017;color:#000;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer'
  printBtn.onclick = () => {
    try {
      const iframeWindow = iframe.contentWindow
      if (iframeWindow) iframeWindow.print()
    } catch { /* cross-origin — open in new tab instead */ }
  }

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕ Fechar'
  closeBtn.style.cssText = 'padding:8px 16px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-weight:700;font-size:13px;cursor:pointer'
  closeBtn.onclick = () => {
    backdrop.remove()
    iframe.remove()
    toolbar.remove()
  }

  toolbar.appendChild(printBtn)
  toolbar.appendChild(closeBtn)

  document.body.appendChild(backdrop)
  document.body.appendChild(iframe)
  document.body.appendChild(toolbar)

  backdrop.onclick = closeBtn.onclick
}

/**
 * Legacy compatibility: also export the HTML builder for other uses.
 */
export { buildAssessmentHtml }
