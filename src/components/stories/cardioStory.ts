/**
 * cardioStory.ts
 *
 * Renderer do Story de CARDIO DE RUA (canvas 720x1280), estilo Strava: a rota
 * GPS desenhada como traço luminoso + métricas herói (distância) e cards
 * (tempo, pace, calorias). Reusa as primitivas e o tipo de template dos outros
 * stories. A rota é desenhada DIRETO no canvas a partir dos pontos {lat,lng}
 * (projeção equiretangular) — sem tiles de mapa, funciona offline e sem API key.
 */
import {
  drawRoundedRect,
  fitCover,
  SAFE_TOP,
  SAFE_BOTTOM,
  SAFE_SIDE,
} from '../storyComposerUtils'
import { type StoryTemplate, storyFont } from './storyTemplates'

export type CardioRoutePoint = { lat: number; lng: number }

export type CardioStoryContent = {
  activityType: string
  dateText: string
  distanceMeters: number
  durationSeconds: number
  paceMinKm: number | null
  caloriesEstimated: number
  maxSpeedKmh?: number | null
  route: CardioRoutePoint[]
}

const ACTIVITY_LABELS: Record<string, string> = {
  running: 'Corrida',
  run: 'Corrida',
  walking: 'Caminhada',
  walk: 'Caminhada',
  cycling: 'Pedal',
  bike: 'Pedal',
}

export const activityLabel = (t: string | null | undefined): string =>
  ACTIVITY_LABELS[String(t || '').toLowerCase().trim()] || 'Cardio'

// ── Formatação (pt-BR) ────────────────────────────────────────────────────────
export const formatKm = (meters: number): string => {
  const km = (Number(meters) || 0) / 1000
  return `${km.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
}

export const formatClock = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export const formatPaceMinKm = (paceMinKm: number | null | undefined): string => {
  if (paceMinKm == null || !Number.isFinite(paceMinKm) || paceMinKm <= 0) return '—'
  const totalSec = Math.round(paceMinKm * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Projeta os pontos GPS num box de tela (px), preservando o aspecto (norte pra
 * cima), centralizado e com padding. Equiretangular: x escala por cos(lat) pra
 * não "esticar" a rota em latitudes altas. Função pura → testável.
 */
export const projectRoutePoints = (
  route: CardioRoutePoint[],
  box: { x: number; y: number; w: number; h: number },
  pad = 26,
): Array<{ x: number; y: number }> => {
  const pts = (Array.isArray(route) ? route : []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  )
  if (pts.length < 2) return []

  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const midLat = (minLat + maxLat) / 2
  const cos = Math.cos((midLat * Math.PI) / 180) || 1

  // x cresce pra leste, y cresce pra SUL (invertido: norte no topo)
  const xs = pts.map((p) => (p.lng - minLng) * cos)
  const ys = pts.map((p) => maxLat - p.lat)
  const spanX = Math.max(...xs) || 0
  const spanY = Math.max(...ys) || 0
  if (spanX === 0 && spanY === 0) return [] // todos no mesmo ponto

  const availW = Math.max(1, box.w - pad * 2)
  const availH = Math.max(1, box.h - pad * 2)
  // escala isotrópica: cabe no menor eixo (evita distorcer o traçado)
  const scale = Math.min(spanX > 0 ? availW / spanX : Infinity, spanY > 0 ? availH / spanY : Infinity)
  const s = Number.isFinite(scale) ? scale : Math.min(availW, availH)
  const drawnW = spanX * s
  const drawnH = spanY * s
  const offX = box.x + pad + (availW - drawnW) / 2
  const offY = box.y + pad + (availH - drawnH) / 2

  return pts.map((_, i) => ({ x: offX + xs[i] * s, y: offY + ys[i] * s }))
}

export const drawCardioStory = ({
  ctx,
  canvasW,
  canvasH,
  backgroundImage,
  content,
  transparentBg = false,
  skipClear = false,
  template,
}: {
  ctx: CanvasRenderingContext2D
  canvasW: number
  canvasH: number
  backgroundImage: HTMLImageElement | null
  content: CardioStoryContent
  transparentBg?: boolean
  skipClear?: boolean
  template: StoryTemplate
}) => {
  const C = template.colors
  const F = template.fonts
  const f = (weight: string, size: number, style: 'italic' | 'normal' = 'normal') =>
    storyFont(F.family, weight, size, style)

  if (!skipClear) ctx.clearRect(0, 0, canvasW, canvasH)

  // ── Background (foto / gradiente do template) ──────────────────────────────
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

  // ── Overlay gradiente (legibilidade) ───────────────────────────────────────
  const overlay = ctx.createLinearGradient(0, canvasH * 0.3, 0, canvasH)
  overlay.addColorStop(0, template.overlay.gradientStart)
  overlay.addColorStop(1, template.overlay.gradientEnd)
  ctx.fillStyle = overlay
  ctx.fillRect(0, 0, canvasW, canvasH)

  const left = SAFE_SIDE
  const right = canvasW - SAFE_SIDE
  const safeBottomY = canvasH - SAFE_BOTTOM

  // ── Brand (IRON · TRACKS) ──────────────────────────────────────────────────
  const brandY = SAFE_TOP + 18
  const brandSize = 54
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 12
  ctx.textBaseline = 'top'
  ctx.font = f(F.brandWeight, brandSize, F.brandStyle)
  ctx.fillStyle = C.brandPrimary
  ctx.fillText('IRON', left, brandY)
  const ironW = ctx.measureText('IRON').width
  const divider = template.brandDivider
  ctx.fillStyle = C.brandDot
  ctx.font = f(F.brandWeight, Math.round(brandSize * 0.55), F.brandStyle)
  const dotW = divider ? ctx.measureText(divider).width : 0
  if (divider) ctx.fillText(divider, left + ironW, brandY + brandSize * 0.22)
  ctx.font = f(F.brandWeight, brandSize, F.brandStyle)
  ctx.fillStyle = C.brandAccent
  ctx.fillText('TRACKS', left + ironW + dotW, brandY)
  ctx.restore()

  // ── Título (atividade) ─────────────────────────────────────────────────────
  const rawTitle = activityLabel(content.activityType)
  const titleText = template.titleUppercase ? rawTitle.toUpperCase() : rawTitle
  const titleSize = 44
  const titleY = brandY + brandSize + 22
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 10
  ctx.fillStyle = C.title
  ctx.textBaseline = 'top'
  ctx.font = f(F.titleWeight, titleSize)
  ctx.fillText(titleText, left, titleY)
  ctx.restore()

  // ── Data pill ──────────────────────────────────────────────────────────────
  const subY = titleY + titleSize + 16
  if (content.dateText) {
    ctx.font = f(F.subtitleWeight, 22)
    const tw = ctx.measureText(content.dateText).width
    const padX = 16
    const padY = 9
    const pillW = tw + padX * 2
    const pillH = 22 + padY * 2
    drawRoundedRect(ctx, left, subY, pillW, pillH, pillH / 2)
    ctx.fillStyle = C.pillFill
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = C.pillBorder
    ctx.stroke()
    ctx.fillStyle = C.pillText
    ctx.textBaseline = 'top'
    ctx.fillText(content.dateText, left + padX, subY + padY)
  }

  // ── Cards inferiores (Tempo, Pace, Calorias) ───────────────────────────────
  const cardH = 130
  const gap = 18
  const cardTopY = safeBottomY - 16 - cardH
  const cardW = Math.floor((right - left - gap * 2) / 3)

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
    ctx.font = f(F.labelWeight, 20)
    ctx.fillStyle = C.cardLabel
    ctx.letterSpacing = F.labelLetterSpacing
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
    const valX = box.x + (box.w - valW) / 2
    const valY = box.y + 20 + 30 + Math.max(0, (box.h - 20 - 30 - valFont - accentH - 8) / 2)
    ctx.fillText(value, valX, valY)
  }

  // ── Hero: DISTÂNCIA ────────────────────────────────────────────────────────
  const heroSize = 104
  const heroNumY = cardTopY - 24 - heroSize
  const heroLabelY = heroNumY - 40
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 10
  ctx.textBaseline = 'top'
  ctx.font = f(F.labelWeight, 22)
  ctx.fillStyle = C.cardLabel
  ctx.letterSpacing = F.labelLetterSpacing
  ctx.fillText('DISTÂNCIA', left, heroLabelY)
  ctx.letterSpacing = '0px'
  // número grande + unidade km ao lado
  const km = ((Number(content.distanceMeters) || 0) / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  ctx.font = f(F.valueWeight, heroSize)
  ctx.fillStyle = C.value
  ctx.fillText(km, left, heroNumY)
  const kmW = ctx.measureText(km).width
  ctx.font = f(F.subtitleWeight, 34)
  ctx.fillStyle = C.subtitle
  ctx.fillText(' km', left + kmW + 12, heroNumY + heroSize - 44)
  ctx.restore()

  // ── Rota GPS (entre a data e o hero) ───────────────────────────────────────
  const routeTop = subY + 60
  const routeBox = { x: left, y: routeTop, w: right - left, h: Math.max(60, heroLabelY - 28 - routeTop) }
  const projected = projectRoutePoints(content.route, routeBox)
  if (projected.length >= 2) {
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // glow embaixo
    ctx.shadowColor = C.cardAccent
    ctx.shadowBlur = 22
    ctx.strokeStyle = C.cardAccent
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(projected[0].x, projected[0].y)
    for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i].x, projected[i].y)
    ctx.stroke()
    // linha clara por cima (sem sombra)
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.stroke()
    // pontos início (verde) / fim (accent)
    const dot = (p: { x: number; y: number }, color: string) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
    }
    dot(projected[0], '#22c55e')
    dot(projected[projected.length - 1], C.cardAccent)
    ctx.restore()
  }

  // Cards (usa maxSpeed no 3º slot só se não houver pace? mantemos Tempo/Pace/Cal)
  const cards: Array<{ label: string; value: string }> = [
    { label: 'TEMPO', value: formatClock(content.durationSeconds) },
    { label: 'PACE', value: `${formatPaceMinKm(content.paceMinKm)}/km` },
    { label: 'CALORIAS', value: `${Math.round(Number(content.caloriesEstimated) || 0)}` },
  ]
  cards.forEach((c, i) =>
    drawCard({ x: left + i * (cardW + gap), y: cardTopY, w: cardW, h: cardH }, c.label, c.value),
  )

  // ── Timestamp (canto inferior direito) ─────────────────────────────────────
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
    const pillW = timeW + padX * 2
    const pillH = fontSize + padY * 2
    const pillX = right - pillW
    const pillY = safeBottomY + (SAFE_BOTTOM - pillH) / 2
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 14)
    ctx.fillStyle = C.timeFill
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = C.timeBorder
    ctx.stroke()
    ctx.font = f('900', fontSize)
    ctx.textBaseline = 'top'
    ctx.fillStyle = C.timeText
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = 6
    ctx.fillText(timeStr, pillX + padX, pillY + padY)
    ctx.restore()
  })()
}

// ── Adapter: métricas + rota → conteúdo do story ─────────────────────────────
export const cardioToContent = (input: {
  activityType: string
  distanceMeters: number
  durationSeconds: number
  paceMinKm: number | null
  caloriesEstimated: number
  maxSpeedKmh?: number | null
  route: Array<{ lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown }>
  date?: Date
}): CardioStoryContent => {
  const d = input.date instanceof Date ? input.date : new Date()
  const dateText = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
  const route: CardioRoutePoint[] = (Array.isArray(input.route) ? input.route : [])
    .map((p) => ({
      lat: Number(p?.lat ?? p?.latitude),
      lng: Number(p?.lng ?? p?.longitude),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  return {
    activityType: String(input.activityType || 'running'),
    dateText,
    distanceMeters: Number(input.distanceMeters) || 0,
    durationSeconds: Number(input.durationSeconds) || 0,
    paceMinKm: input.paceMinKm != null && Number.isFinite(Number(input.paceMinKm)) ? Number(input.paceMinKm) : null,
    caloriesEstimated: Number(input.caloriesEstimated) || 0,
    maxSpeedKmh: input.maxSpeedKmh != null ? Number(input.maxSpeedKmh) : null,
    route,
  }
}
