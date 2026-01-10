export async function generateWorkoutPdf(session, previousSession) {
  let PDFDocument;
  let StandardFonts;
  let rgb;
  try {
    const pdfLib = await import('pdf-lib')
    PDFDocument = pdfLib.PDFDocument
    StandardFonts = pdfLib.StandardFonts
    rgb = pdfLib.rgb
  } catch (e) {
    throw new Error('Falha ao carregar o gerador de PDF')
  }

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()
  const margin = 36
  const lineH = 18
  const titleSize = 24
  const textSize = 12
  const monoSize = 12
  const boldSize = 14

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let y = height - margin

  const drawText = (text, x, size = textSize, f = font, color = rgb(0, 0, 0)) => {
    page.drawText(String(text ?? ''), { x, y, size, font: f, color })
    y -= lineH
  }

  const drawKV = (k, v) => {
    page.drawText(String(k), { x: margin, y, size: textSize, font: bold, color: rgb(0.4, 0.4, 0.4) })
    page.drawText(String(v), { x: margin + 120, y, size: textSize, font, color: rgb(0, 0, 0) })
    y -= lineH
  }

  const ensureSpace = (rows = 1) => {
    if (y - rows * lineH < margin) {
      const p = pdfDoc.addPage([595, 842])
      y = 842 - margin
    }
  }

  const formatDate = (ts) => {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (s) => {
    const mins = Math.floor((s || 0) / 60)
    const secs = Math.floor((s || 0) % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const calcVolume = (logs) => {
    try {
      let v = 0
      const safeLogs = logs && typeof logs === 'object' ? logs : {}
      Object.values(safeLogs).forEach((l) => {
        if (!l || typeof l !== 'object') return
        const w = Number(String(l.weight ?? '').replace(',', '.'))
        const r = Number(String(l.reps ?? '').replace(',', '.'))
        if (!Number.isFinite(w) || !Number.isFinite(r)) return
        if (w <= 0 || r <= 0) return
        v += w * r
      })
      return v
    } catch {
      return 0
    }
  }

  const currentVolume = calcVolume(session?.logs)
  const prevVolume = calcVolume(previousSession?.logs)
  const delta = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : 0
  const durationM = (session?.totalTime || 0) / 60
  const calories = Math.round((currentVolume * 0.02) + (durationM * 4))

  page.drawText('IRONTRACKS', { x: margin, y, size: titleSize, font: bold })
  y -= lineH
  page.drawText('Relatório de Performance', { x: margin, y, size: textSize, font })
  y -= lineH
  drawKV('Treino', session?.workoutTitle || 'Treino')
  drawKV('Data', formatDate(session?.date))
  y -= 6

  page.drawRectangle({ x: margin - 4, y: y - 4, width: width - margin * 2 + 8, height: 4, color: rgb(0, 0, 0) })
  y -= lineH

  drawKV('Tempo', formatDuration(session?.totalTime))
  if (session?.realTotalTime) {
    drawKV('Tempo Real', formatDuration(session.realTotalTime))
  }
  drawKV('Volume', `${currentVolume.toLocaleString()} kg`)
  drawKV('Evolução', `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`)
  drawKV('Calorias', `~${calories}`)
  y -= lineH

  const prevMap = {}
  const safePrevLogs = previousSession?.logs && typeof previousSession.logs === 'object' ? previousSession.logs : {}
  if (previousSession && Array.isArray(previousSession?.exercises)) {
    previousSession.exercises.forEach((ex, exIdx) => {
      if (!ex || typeof ex !== 'object') return
      const exName = String(ex?.name || '').trim()
      if (!exName) return
      const exLogs = []
      Object.keys(safePrevLogs).forEach(key => {
        const [eIdx] = key.split('-')
        if (Number(eIdx) === exIdx) exLogs.push(safePrevLogs[key])
      })
      prevMap[exName] = exLogs
    })
  }

  const safeExercises = Array.isArray(session?.exercises) ? session.exercises : []
  safeExercises.forEach((ex, exIdx) => {
    if (!ex || typeof ex !== 'object') return
    ensureSpace(3)
    page.drawText(`${exIdx + 1}. ${String(ex?.name || '')}`, { x: margin, y, size: boldSize, font: bold })
    y -= lineH
    page.drawText(`Método: ${String(ex?.method || 'Normal')}  RPE: ${String(ex?.rpe || '-')}  Cad: ${String(ex?.cadence || '-')}`, { x: margin, y, size: textSize, font })
    y -= lineH
    ensureSpace(2)
    page.drawText('Série   Carga   Reps   Evolução', { x: margin, y, size: monoSize, font })
    y -= lineH
    const sets = Number(ex?.sets || 0)
    const prevLogs = prevMap[String(ex?.name || '').trim()] || []
    for (let sIdx = 0; sIdx < sets; sIdx++) {
      ensureSpace(1)
      const key = `${exIdx}-${sIdx}`
      const log = session?.logs?.[key]
      const prev = prevLogs[sIdx]
      if (!log || typeof log !== 'object') continue
      if (!log.weight && !log.reps) continue
      let evol = '-'
      if (prev?.weight) {
        const d = Number(log.weight) - Number(prev.weight)
        evol = d === 0 ? '=' : `${d > 0 ? '+' : ''}${d}kg`
      }
      page.drawText(`#${sIdx + 1}`.padEnd(7) + String(log.weight || '-').padEnd(7) + String(log.reps || '-').padEnd(7) + evol, { x: margin, y, size: monoSize, font })
      y -= lineH

      const note = log.note || log.observation
      if (note) {
        ensureSpace(1)
        const text = String(note)
        page.drawText(`Obs: ${text}`, { x: margin + 8, y, size: textSize - 1, font })
        y -= lineH
      }
    }
    y -= 6
  })

  const bytes = await pdfDoc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export async function generateAssessmentPdf(formData, results, studentName) {
  let PDFDocument;
  let StandardFonts;
  let rgb;
  try {
    const pdfLib = await import('pdf-lib')
    PDFDocument = pdfLib.PDFDocument
    StandardFonts = pdfLib.StandardFonts
    rgb = pdfLib.rgb
  } catch (e) {
    throw new Error('Falha ao carregar o gerador de PDF')
  }

  const pdfDoc = await PDFDocument.create()
  let page = pdfDoc.addPage([595, 842])
  const { width, height } = page.getSize()
  const margin = 36
  const lineH = 18
  const titleSize = 24
  const textSize = 12
  const boldSize = 14

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let y = height - margin

  const drawText = (text, x, size = textSize, f = font, color = rgb(0, 0, 0)) => {
    page.drawText(String(text ?? ''), { x, y, size, font: f, color })
    y -= lineH
  }

  const drawKV = (k, v) => {
    page.drawText(String(k), { x: margin, y, size: textSize, font: bold, color: rgb(0.4, 0.4, 0.4) })
    page.drawText(String(v), { x: margin + 160, y, size: textSize, font, color: rgb(0, 0, 0) })
    y -= lineH
  }

  const ensureSpace = (rows = 1) => {
    if (y - rows * lineH < margin) {
      page = pdfDoc.addPage([595, 842])
      y = 842 - margin
    }
  }

  const formatNumber = (n, d = 1) => {
    const v = Number(n || 0)
    return isNaN(v) ? '-' : v.toFixed(d)
  }

  drawText('IRONTRACKS', margin, titleSize, bold)
  drawText('Avaliação Física', margin)
  drawKV('Aluno', studentName || '-')
  drawKV('Data', formData.assessment_date || '-')
  y -= 6
  page.drawRectangle({ x: margin - 4, y: y - 4, width: width - margin * 2 + 8, height: 4, color: rgb(0, 0, 0) })
  y -= lineH

  // Dados básicos
  drawText('Dados Básicos', margin, boldSize, bold)
  drawKV('Peso', `${formData.weight || '-'} kg`)
  drawKV('Altura', `${formData.height || '-'} cm`)
  drawKV('Idade', `${formData.age || '-'} anos`)
  drawKV('Gênero', formData.gender === 'M' ? 'Masculino' : 'Feminino')
  y -= 6

  // Composição corporal
  drawText('Composição Corporal', margin, boldSize, bold)
  drawKV('% Gordura', `${formatNumber(results?.bodyComposition?.bodyFatPercentage, 1)}%`)
  drawKV('Massa Magra', `${formatNumber(results?.leanMass, 1)} kg`)
  drawKV('Massa Gorda', `${formatNumber(results?.fatMass, 1)} kg`)
  drawKV('IMC', formatNumber(results?.bmi, 1))
  if (results?.bmiClassification) {
    drawKV('Classificação IMC', results.bmiClassification)
  }
  if (results?.bodyFatClassification) {
    drawKV('Classificação Gordura', results.bodyFatClassification)
  }
  drawKV('BMR', `${formatNumber(results?.bmr, 0)} kcal/dia`)
  y -= 6

  // Circunferências
  drawText('Circunferências (cm)', margin, boldSize, bold)
  const circ = [
    ['Braço', formData.arm_circ],
    ['Tórax', formData.chest_circ],
    ['Cintura', formData.waist_circ],
    ['Quadril', formData.hip_circ],
    ['Coxa', formData.thigh_circ],
    ['Panturrilha', formData.calf_circ]
  ]
  circ.forEach(([k, v]) => { if (v) drawKV(k, `${v} cm`) })
  y -= 6

  // Dobras cutâneas
  drawText('Dobras Cutâneas (mm)', margin, boldSize, bold)
  const skin = [
    ['Tricipital', formData.triceps_skinfold],
    ['Bicipital', formData.biceps_skinfold],
    ['Subescapular', formData.subscapular_skinfold],
    ['Suprailíaca', formData.suprailiac_skinfold],
    ['Abdominal', formData.abdominal_skinfold],
    ['Coxa', formData.thigh_skinfold],
    ['Panturrilha', formData.calf_skinfold]
  ]
  skin.forEach(([k, v]) => { if (v) drawKV(k, `${v} mm`) })

  if (results?.bodyComposition?.sumOfSkinfolds || results?.bodyComposition?.sum_skinfolds) {
    const sum = results?.bodyComposition?.sumOfSkinfolds || results?.bodyComposition?.sum_skinfolds
    drawKV('Soma das dobras', `${formatNumber(sum, 1)} mm`)
  }

  // Observações
  if (formData.observations) {
    y -= 6
    drawText('Observações', margin, boldSize, bold)
    const text = String(formData.observations)
    page.drawText(text, { x: margin, y, size: textSize, font })
  }

  const bytes = await pdfDoc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}
