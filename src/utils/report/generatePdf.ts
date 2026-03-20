import { logError } from '@/lib/logger'

interface AssessmentFormData {
  assessment_date?: string | null
  weight?: number | string | null
  height?: number | string | null
  age?: number | string | null
  gender?: string | null
  arm_circ?: number | string | null
  arm_circ_left?: number | string | null
  arm_circ_right?: number | string | null
  chest_circ?: number | string | null
  waist_circ?: number | string | null
  hip_circ?: number | string | null
  thigh_circ?: number | string | null
  thigh_circ_left?: number | string | null
  thigh_circ_right?: number | string | null
  calf_circ?: number | string | null
  calf_circ_left?: number | string | null
  calf_circ_right?: number | string | null
  triceps_skinfold?: number | string | null
  triceps_skinfold_left?: number | string | null
  triceps_skinfold_right?: number | string | null
  biceps_skinfold?: number | string | null
  biceps_skinfold_left?: number | string | null
  biceps_skinfold_right?: number | string | null
  subscapular_skinfold?: number | string | null
  suprailiac_skinfold?: number | string | null
  abdominal_skinfold?: number | string | null
  thigh_skinfold?: number | string | null
  thigh_skinfold_left?: number | string | null
  thigh_skinfold_right?: number | string | null
  calf_skinfold?: number | string | null
  calf_skinfold_left?: number | string | null
  calf_skinfold_right?: number | string | null
  observations?: string | null
  [key: string]: unknown
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

  // Helper: resolve bilateral average or direct value
  const avgField = (direct: string, left: string, right: string): number => {
    const d = data as Record<string, unknown>
    const toNum = (v: unknown) => {
      if (v == null || v === '') return 0
      return Number.parseFloat(String(v).replace(',', '.')) || 0
    }
    const l = toNum(d[left])
    const r = toNum(d[right])
    if (l > 0 && r > 0) return Math.round(((l + r) / 2) * 10) / 10
    if (l > 0) return l
    if (r > 0) return r
    return toNum(d[direct])
  }

  const dToNum = (v: unknown) => {
    if (v == null || v === '') return 0
    return Number.parseFloat(String(v).replace(',', '.')) || 0
  }

  // Skinfold bilateral helper for display
  const buildSkinfoldRow = (label: string, direct: string, left?: string, right?: string): string => {
    const d = data as Record<string, unknown>
    const avg = left && right ? avgField(direct, left, right) : dToNum(d[direct])
    if (avg <= 0) return ''
    const hasLR = left && right && dToNum(d[left]) > 0 && dToNum(d[right]) > 0
    const detail = hasLR ? ` <span style="color:#999;font-size:11px">(E:${dToNum(d[left!])} D:${dToNum(d[right!])})</span>` : ''
    return `<tr><td>${label}</td><td>${avg.toFixed(1)} mm${detail}</td></tr>`
  }

  // Circumference bilateral helper for display
  const buildCircRow = (label: string, direct: string, left?: string, right?: string): string => {
    const d = data as Record<string, unknown>
    const avg = left && right ? avgField(direct, left, right) : dToNum(d[direct])
    if (avg <= 0) return ''
    const hasLR = left && right && dToNum(d[left]) > 0 && dToNum(d[right]) > 0
    const detail = hasLR ? ` <span style="color:#999;font-size:11px">(E:${dToNum(d[left!])} D:${dToNum(d[right!])})</span>` : ''
    return `<tr><td>${label}</td><td>${avg.toFixed(1)} cm${detail}</td></tr>`
  }

  const circRows = [
    buildCircRow('Braço', 'arm_circ', 'arm_circ_left', 'arm_circ_right'),
    buildCircRow('Tórax', 'chest_circ'),
    buildCircRow('Cintura', 'waist_circ'),
    buildCircRow('Quadril', 'hip_circ'),
    buildCircRow('Coxa', 'thigh_circ', 'thigh_circ_left', 'thigh_circ_right'),
    buildCircRow('Panturrilha', 'calf_circ', 'calf_circ_left', 'calf_circ_right'),
  ].filter(Boolean).join('')

  const skinfoldRows = [
    buildSkinfoldRow('Tríceps', 'triceps_skinfold', 'triceps_skinfold_left', 'triceps_skinfold_right'),
    buildSkinfoldRow('Bíceps', 'biceps_skinfold', 'biceps_skinfold_left', 'biceps_skinfold_right'),
    buildSkinfoldRow('Subescapular', 'subscapular_skinfold'),
    buildSkinfoldRow('Supra-ilíaca', 'suprailiac_skinfold'),
    buildSkinfoldRow('Abdominal', 'abdominal_skinfold'),
    buildSkinfoldRow('Coxa', 'thigh_skinfold', 'thigh_skinfold_left', 'thigh_skinfold_right'),
    buildSkinfoldRow('Panturrilha', 'calf_skinfold', 'calf_skinfold_left', 'calf_skinfold_right'),
  ].filter(Boolean).join('')

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
            ${skinfoldRows}
          </tbody>
        </table>
      </div>

      ${circRows ? `
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
      // On iOS WKWebView, window.print() is NOT supported.
      // Use Web Share API or @capacitor/filesystem as fallback.
      await shareOrSaveHtml(html, studentName)
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

    // Popup blocked — use iframe fallback with share button
    showPdfIframe(html, studentName)
    return blob
  } catch (error) {
    logError('error', 'Erro ao gerar PDF da avaliação', error)
    throw error
  }
}

/**
 * Share the assessment HTML via native share sheet (iOS/Android).
 * Strategy 1: Web Share API with file (opens native share sheet with Print option)
 * Strategy 2: @capacitor/filesystem save + alert
 */
async function shareOrSaveHtml(html: string, studentName: string): Promise<void> {
  const fileName = `Avaliacao_${studentName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`

  // Strategy 1: Web Share API with File (iOS 15+ WKWebView supports this)
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const blob = new Blob([html], { type: 'text/html' })
      const file = new File([blob], fileName, { type: 'text/html' })

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Avaliação Física - IronTracks',
          files: [file],
        })
        return
      }
    } catch (e) {
      // User cancelled or share failed — try next strategy
      if (e instanceof Error && e.name === 'AbortError') return // user cancelled, that's OK
    }
  }

  // Strategy 2: Save via @capacitor/filesystem
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore optional Capacitor dependency, may not have types installed
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path: `IronTracks/${fileName}`,
      data: html,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    alert(`✅ Avaliação salva!\n\nAbra o app "Arquivos" → "No Meu iPhone" → "IronTracks" para encontrar o arquivo.\n\nDe lá você pode compartilhar ou imprimir.`)
    return
  } catch {
    // Filesystem not available
  }

  // Strategy 3: Blob download link (last resort)
  try {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 1000)
  } catch {
    alert('Não foi possível salvar a avaliação. Tente novamente.')
  }
}

/** Full-screen iframe overlay with close + share buttons */
function showPdfIframe(html: string, studentName: string) {
  // Backdrop
  const backdrop = document.createElement('div')
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.6)'

  // Toolbar height = 48px + safe area top
  const safeTop = 'env(safe-area-inset-top, 0px)'

  // Iframe for preview
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `position:fixed;top:calc(48px + ${safeTop});left:0;right:0;bottom:0;width:100%;height:calc(100% - 48px - ${safeTop});border:none;z-index:99999;background:#fff`
  iframe.srcdoc = html

  // Toolbar — respects iOS safe area (notch / dynamic island)
  const toolbar = document.createElement('div')
  toolbar.style.cssText = `position:fixed;top:0;left:0;right:0;height:calc(48px + ${safeTop});z-index:100000;background:#111;display:flex;align-items:flex-end;justify-content:space-between;padding:0 12px 8px 12px;padding-top:${safeTop}`

  const cleanup = () => {
    backdrop.remove()
    iframe.remove()
    toolbar.remove()
  }

  const printBtn = document.createElement('button')
  printBtn.textContent = '📄 Salvar como PDF'
  printBtn.style.cssText = 'padding:8px 16px;background:#d4a017;color:#000;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer'
  printBtn.onclick = async () => {
    if (isNativeApp()) {
      // Use Web Share API or Filesystem save
      await shareOrSaveHtml(html, studentName)
    } else {
      // Desktop fallback: try to print from iframe or open new tab
      try {
        const iframeWin = iframe.contentWindow
        if (iframeWin) {
          iframeWin.focus()
          iframeWin.print()
          return
        }
      } catch { /* cross-origin */ }

      // Open in new tab
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(html)
        w.document.close()
        setTimeout(() => { try { w.print() } catch { /* ok */ } }, 500)
      }
    }
  }

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕ Fechar'
  closeBtn.style.cssText = 'padding:8px 16px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-weight:700;font-size:13px;cursor:pointer'
  closeBtn.onclick = cleanup

  toolbar.appendChild(printBtn)
  toolbar.appendChild(closeBtn)

  document.body.appendChild(backdrop)
  document.body.appendChild(iframe)
  document.body.appendChild(toolbar)

  backdrop.onclick = cleanup
}

/**
 * Legacy compatibility: also export the HTML builder for other uses.
 */
export { buildAssessmentHtml }
