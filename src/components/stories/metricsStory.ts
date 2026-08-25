/**
 * metricsStory.ts — renderer do Story de MÉTRICAS (canvas 720x1280).
 *
 * O quarto layout da família (treino · nutrição · cardio · métricas). Os três
 * primeiros descrevem UMA sessão; este descreve um PERÍODO — daí o formato
 * genérico rótulo/valor: quem chama decide o que entra, e o mesmo layout serve
 * funil de conversão, engajamento ou o número que o dono quiser destacar.
 *
 * Hierarquia (docs/DESIGN_HIERARCHY.md): UM destaque por bloco, e o fato
 * aparece UMA vez. Por isso `metricsToContent` REMOVE o herói da lista de
 * apoio — repetir o número do herói logo abaixo dele, menor, é exatamente o
 * defeito que o ratchet de hierarquia existe para pegar.
 *
 * jsdom não implementa `canvas.getContext('2d')`, então o desenho em si não é
 * testável aqui: os testes cobrem as funções PURAS (formatação e montagem do
 * conteúdo) e o resultado na tela se confere no aparelho.
 */
import {
  drawRoundedRect,
  fitCover,
  SAFE_TOP,
  SAFE_BOTTOM,
  SAFE_SIDE,
  clampBrandOffset,
  enterBrandSpace,
} from '../storyComposerUtils'
import { type StoryTemplate, storyFont } from './storyTemplates'
import { drawCustomTextLayer } from './customText'

export type MetricsStoryItem = { key: string; label: string; value: number; sub?: string }

export type MetricsStoryContent = {
  title: string
  periodText: string
  hero: { label: string; value: string; sub?: string }
  cards: Array<{ label: string; value: string }>
  rows: Array<{ label: string; value: string }>
}

/** Quantos cabem sem o layout virar lista de telefone. Medido no 720x1280. */
export const MAX_METRIC_CARDS = 3
export const MAX_METRIC_ROWS = 4

/** Número em pt-BR (separador de milhar). Story não mostra decimal. */
export const formatMetricValue = (n: number): string =>
  (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0).toLocaleString('pt-BR')

export const periodLabel = (days: number): string => {
  const d = Math.max(1, Math.round(Number(days) || 0))
  if (d === 1) return 'ÚLTIMAS 24 HORAS'
  if (d === 7) return 'ÚLTIMOS 7 DIAS'
  if (d === 30) return 'ÚLTIMOS 30 DIAS'
  return `ÚLTIMOS ${d} DIAS`
}

/**
 * Monta o conteúdo do story a partir da lista de métricas da rota.
 *
 * `heroKey` escolhe o destaque; sem ele (ou com chave inexistente) o destaque é
 * a primeira métrica. O herói sai da lista de apoio — ver a nota de hierarquia
 * no topo do arquivo.
 */
export const metricsToContent = (
  metrics: MetricsStoryItem[],
  opts: { heroKey?: string | null; periodDays: number; title?: string },
): MetricsStoryContent => {
  const list = (Array.isArray(metrics) ? metrics : []).filter((m) => m && typeof m.label === 'string')
  const heroIdx = Math.max(0, list.findIndex((m) => m.key === opts.heroKey))
  const hero = list[heroIdx]
  const rest = list.filter((_, i) => i !== heroIdx)

  return {
    title: String(opts.title || 'MÉTRICAS'),
    periodText: periodLabel(opts.periodDays),
    hero: hero
      ? { label: hero.label, value: formatMetricValue(hero.value), sub: hero.sub }
      : { label: 'SEM DADOS', value: '—' },
    cards: rest.slice(0, MAX_METRIC_CARDS).map((m) => ({ label: m.label, value: formatMetricValue(m.value) })),
    rows: rest
      .slice(MAX_METRIC_CARDS, MAX_METRIC_CARDS + MAX_METRIC_ROWS)
      .map((m) => ({ label: m.label, value: formatMetricValue(m.value) })),
  }
}

export const drawMetricsStory = ({
  ctx,
  canvasW,
  canvasH,
  backgroundImage,
  content,
  transparentBg = false,
  skipClear = false,
  template,
  workoutTransform,
  brandOffset,
  brandScale,
  customText,
  customTextOffset,
}: {
  ctx: CanvasRenderingContext2D
  canvasW: number
  canvasH: number
  backgroundImage: HTMLImageElement | null
  content: MetricsStoryContent
  transparentBg?: boolean
  skipClear?: boolean
  template: StoryTemplate
  workoutTransform?: { scale: number; offsetX: number; offsetY: number }
  brandOffset?: { x: number; y: number }
  brandScale?: number
  customText?: string
  customTextOffset?: { x: number; y: number }
}) => {
  const C = template.colors
  const F = template.fonts
  const f = (weight: string, size: number, style: 'italic' | 'normal' = 'normal') =>
    storyFont(F.family, weight, size, style)

  if (!skipClear) ctx.clearRect(0, 0, canvasW, canvasH)

  // ── Fundo (foto do usuário ou gradiente do template) ───────────────────────
  if (!transparentBg) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvasW, canvasH)
    if (backgroundImage) {
      const iw = Number(backgroundImage.naturalWidth) || 0
      const ih = Number(backgroundImage.naturalHeight) || 0
      const { scale } = fitCover({ canvasW, canvasH, imageW: iw, imageH: ih })
      const dw = iw * scale
      const dh = ih * scale
      ctx.drawImage(backgroundImage, (canvasW - dw) / 2, (canvasH - dh) / 2, dw, dh)
    } else {
      const g = ctx.createLinearGradient(0, 0, canvasW, canvasH)
      g.addColorStop(0, template.overlay.fallbackBg[0])
      g.addColorStop(1, template.overlay.fallbackBg[1])
      ctx.fillStyle = g
      ctx.fillRect(0, 0, canvasW, canvasH)
    }
  }

  const overlay = ctx.createLinearGradient(0, canvasH * 0.3, 0, canvasH)
  overlay.addColorStop(0, template.overlay.gradientStart)
  overlay.addColorStop(1, template.overlay.gradientEnd)
  ctx.fillStyle = overlay
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Zoom/pan do bloco — só o CONTEÚDO transforma; o fundo fica fixo.
  const wt = workoutTransform ?? { scale: 1, offsetX: 0, offsetY: 0 }
  const wtApplied = wt.scale !== 1 || wt.offsetX !== 0 || wt.offsetY !== 0
  const bOff = clampBrandOffset(brandOffset)
  if (wtApplied) {
    ctx.save()
    ctx.translate(wt.offsetX, wt.offsetY)
    const pvX = canvasW / 2
    const pvY = canvasH / 2
    ctx.translate(pvX, pvY)
    ctx.scale(wt.scale, wt.scale)
    ctx.translate(-pvX, -pvY)
  }

  const left = SAFE_SIDE
  const right = canvasW - SAFE_SIDE
  const safeBottomY = canvasH - SAFE_BOTTOM

  // ── Marca ──────────────────────────────────────────────────────────────────
  const brandY = SAFE_TOP + 18
  const brandSize = 54
  ctx.save()
  enterBrandSpace(ctx, wt, bOff, brandScale)
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 12
  ctx.textBaseline = 'top'
  ctx.font = f(F.brandWeight, brandSize, F.brandStyle)
  ctx.fillStyle = C.brandPrimary
  ctx.fillText('IRON', left, brandY)
  const ironW = ctx.measureText('IRON').width
  ctx.fillStyle = C.brandAccent
  ctx.fillText('TRACKS', left + ironW, brandY)
  ctx.restore()

  // ── Título ─────────────────────────────────────────────────────────────────
  const rawTitle = String(content.title || '')
  const titleText = template.titleUppercase ? rawTitle.toUpperCase() : rawTitle
  const titleY = brandY + brandSize + 22
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 10
  ctx.fillStyle = C.title
  ctx.textBaseline = 'top'
  let titleSize = 44
  ctx.font = f(F.titleWeight, titleSize)
  while (ctx.measureText(titleText).width > right - left && titleSize > 26) {
    titleSize -= 2
    ctx.font = f(F.titleWeight, titleSize)
  }
  ctx.fillText(titleText, left, titleY)
  ctx.restore()

  // ── Pill do período ────────────────────────────────────────────────────────
  const subY = titleY + titleSize + 16
  let pillH = 0
  if (content.periodText) {
    ctx.font = f(F.subtitleWeight, 22)
    const tw = ctx.measureText(content.periodText).width
    const padX = 16
    const padY = 9
    pillH = 22 + padY * 2
    drawRoundedRect(ctx, left, subY, tw + padX * 2, pillH, pillH / 2)
    ctx.fillStyle = C.pillFill
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = C.pillBorder
    ctx.stroke()
    ctx.fillStyle = C.pillText
    ctx.textBaseline = 'top'
    ctx.fillText(content.periodText, left + padX, subY + padY)
  }

  // ── Cards do rodapé ────────────────────────────────────────────────────────
  const cards = Array.isArray(content.cards) ? content.cards.slice(0, MAX_METRIC_CARDS) : []
  const cardH = 130
  const gap = 18
  const cardTopY = safeBottomY - 16 - cardH
  const cardW = cards.length > 0 ? Math.floor((right - left - gap * (cards.length - 1)) / cards.length) : 0

  const drawCard = (box: { x: number; y: number; w: number; h: number }, label: string, value: string) => {
    drawRoundedRect(ctx, box.x, box.y, box.w, box.h, template.card.radius)
    ctx.fillStyle = C.cardFill
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = C.cardBorder
    ctx.stroke()

    const accentH = template.card.accentHeight
    if (template.card.showAccentLine) {
      const accentY = box.y + box.h - accentH
      const inset = 14
      drawRoundedRect(ctx, box.x + inset, accentY, box.w - inset * 2, accentH, accentH / 2)
      ctx.fillStyle = C.cardAccent
      ctx.fill()
    }

    ctx.textBaseline = 'top'
    ctx.fillStyle = C.cardLabel
    ctx.letterSpacing = F.labelLetterSpacing
    // O rótulo da métrica é mais longo que "PACE": encolhe até caber.
    let labelSize = 20
    ctx.font = f(F.labelWeight, labelSize)
    while (ctx.measureText(label).width > box.w - 16 && labelSize > 12) {
      labelSize -= 1
      ctx.font = f(F.labelWeight, labelSize)
    }
    const labelW = ctx.measureText(label).width
    ctx.fillText(label, box.x + (box.w - labelW) / 2, box.y + 20)
    ctx.letterSpacing = '0px'

    ctx.fillStyle = C.value
    let valFont = 44
    ctx.font = f(F.valueWeight, valFont)
    let valW = ctx.measureText(value).width
    while (valW > box.w - 20 && valFont > 22) {
      valFont -= 2
      ctx.font = f(F.valueWeight, valFont)
      valW = ctx.measureText(value).width
    }
    ctx.fillText(value, box.x + (box.w - valW) / 2, box.y + 20 + 30 + Math.max(0, (box.h - 20 - 30 - valFont - accentH - 8) / 2))
  }

  cards.forEach((c, i) =>
    drawCard({ x: left + i * (cardW + gap), y: cardTopY, w: cardW, h: cardH }, c.label, c.value),
  )

  // ── Herói ──────────────────────────────────────────────────────────────────
  const heroSize = 128
  const heroSubH = content.hero.sub ? 30 : 0
  const heroNumY = cardTopY - 28 - heroSubH - heroSize
  const heroLabelY = heroNumY - 40
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 10
  ctx.textBaseline = 'top'
  ctx.font = f(F.labelWeight, 22)
  ctx.fillStyle = C.cardLabel
  ctx.letterSpacing = F.labelLetterSpacing
  ctx.fillText(content.hero.label, left, heroLabelY)
  ctx.letterSpacing = '0px'

  let heroFont = heroSize
  ctx.font = f(F.valueWeight, heroFont)
  while (ctx.measureText(content.hero.value).width > right - left && heroFont > 48) {
    heroFont -= 4
    ctx.font = f(F.valueWeight, heroFont)
  }
  ctx.fillStyle = C.value
  ctx.fillText(content.hero.value, left, heroNumY + (heroSize - heroFont))
  if (content.hero.sub) {
    ctx.font = f(F.subtitleWeight, 26)
    ctx.fillStyle = C.subtitle
    ctx.fillText(content.hero.sub, left, heroNumY + heroSize + 6)
  }
  ctx.restore()

  // ── Linhas de apoio (entre o pill e o herói) ───────────────────────────────
  const rows = Array.isArray(content.rows) ? content.rows.slice(0, MAX_METRIC_ROWS) : []
  if (rows.length > 0) {
    const areaTop = subY + pillH + 26
    const areaBottom = heroLabelY - 24
    const rowH = Math.min(56, Math.max(34, (areaBottom - areaTop) / rows.length))
    ctx.save()
    ctx.textBaseline = 'top'
    rows.forEach((r, i) => {
      const y = areaTop + i * rowH
      if (y + rowH > areaBottom + rowH) return
      ctx.font = f(F.labelWeight, 22)
      ctx.fillStyle = C.cardLabel
      ctx.letterSpacing = F.labelLetterSpacing
      ctx.fillText(r.label, left, y)
      ctx.letterSpacing = '0px'
      ctx.font = f(F.valueWeight, 28)
      ctx.fillStyle = C.value
      const vw = ctx.measureText(r.value).width
      ctx.fillText(r.value, right - vw, y - 4)
      // fio separador
      ctx.beginPath()
      ctx.moveTo(left, y + rowH - 12)
      ctx.lineTo(right, y + rowH - 12)
      ctx.lineWidth = 1
      ctx.strokeStyle = C.cardBorder
      ctx.stroke()
    })
    ctx.restore()
  }

  // ── Timestamp ──────────────────────────────────────────────────────────────
  ;(() => {
    const now = new Date()
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    if (!timeStr) return
    ctx.save()
    const fontSize = 32
    ctx.font = f('900', fontSize)
    const timeW = ctx.measureText(timeStr).width
    const padX = 18
    const padY = 10
    const pw = timeW + padX * 2
    const ph = fontSize + padY * 2
    const px = right - pw
    const py = safeBottomY + (SAFE_BOTTOM - ph) / 2
    drawRoundedRect(ctx, px, py, pw, ph, 14)
    ctx.fillStyle = C.timeFill
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = C.timeBorder
    ctx.stroke()
    ctx.textBaseline = 'top'
    ctx.fillStyle = C.timeText
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = 6
    ctx.fillText(timeStr, px + padX, py + padY)
    ctx.restore()
  })()

  if (wtApplied) ctx.restore()
  // Legenda do usuário por ÚLTIMO — e FORA do transform do bloco (a inversa do
  // `enterBrandSpace` não vale aqui: os renderers a desenham após o restore).
  drawCustomTextLayer(ctx, template, String(customText ?? ''), customTextOffset)
}
