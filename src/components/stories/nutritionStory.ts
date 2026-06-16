/**
 * nutritionStory.ts
 *
 * Renderer do Story de NUTRIÇÃO (canvas 720x1280). Geometria própria, mas reusa
 * as primitivas e o tipo de template do story de treino. Dois modos:
 *  - meal: sobre foto/vídeo → nome + CALORIAS hero + 3 cards P/C/G.
 *  - day:  card desenhado (sem foto) → "Resumo do dia" + calorias/meta + P/C/G.
 */
import {
  drawRoundedRect,
  fitCover,
  SAFE_TOP,
  SAFE_BOTTOM,
  SAFE_SIDE,
} from '../storyComposerUtils'
import { type StoryTemplate, storyFont } from './storyTemplates'

export type NutritionStoryContent =
  | {
      kind: 'meal'
      mealName: string
      calories: number
      protein: number
      carbs: number
      fat: number
    }
  | {
      kind: 'day'
      dateText: string
      calories: number
      goalCalories: number
      protein: number
      carbs: number
      fat: number
      goalProtein: number
      goalCarbs: number
      goalFat: number
    }

const nf = (n: unknown): string => Math.round(Number(n) || 0).toLocaleString('pt-BR')

export const drawNutritionStory = ({
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
  content: NutritionStoryContent
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
  const gap = 18
  const cardH = 130

  // ── Card renderer (estilo do template) ─────────────────────────────────────
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
    let valFont = 46
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

  // ── Título ────────────────────────────────────────────────────────────────
  const rawTitle = content.kind === 'meal' ? content.mealName : 'Resumo do dia'
  const titleText = template.titleUppercase ? String(rawTitle || '').toUpperCase() : String(rawTitle || '')
  const titleSize = 40
  const titleLineH = titleSize + 8
  ctx.font = f(F.titleWeight, titleSize)
  const words = titleText.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w
    if (ctx.measureText(cand).width <= right - left) line = cand
    else {
      if (line) lines.push(line)
      line = w
    }
    if (lines.length >= 2) break
  }
  if (line && lines.length < 2) lines.push(line)
  const titleY = brandY + brandSize + 22
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 10
  ctx.fillStyle = C.title
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, left, titleY + i * titleLineH))
  ctx.restore()

  // ── Subtítulo pill (data no modo dia) ──────────────────────────────────────
  const subY = titleY + lines.length * titleLineH + 14
  const subText = content.kind === 'day' ? content.dateText : 'REFEIÇÃO'
  if (subText) {
    ctx.font = f(F.subtitleWeight, 22)
    const tw = ctx.measureText(subText).width
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
    ctx.fillText(subText, left + padX, subY + padY)
  }

  // ── CALORIAS hero ──────────────────────────────────────────────────────────
  const cardTopY = safeBottomY - 16 - cardH
  const heroLabelY = cardTopY - 188
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 10
  ctx.textBaseline = 'top'
  ctx.font = f(F.labelWeight, 22)
  ctx.fillStyle = C.cardLabel
  ctx.letterSpacing = F.labelLetterSpacing
  ctx.fillText('CALORIAS', left, heroLabelY)
  ctx.letterSpacing = '0px'

  const over = content.kind === 'day' && content.calories > content.goalCalories && content.goalCalories > 0
  const heroNumY = heroLabelY + 32
  const heroSize = 104
  ctx.font = f(F.valueWeight, heroSize)
  ctx.fillStyle = over ? '#f87171' : C.value
  const calStr = nf(content.calories)
  ctx.fillText(calStr, left, heroNumY)
  const calW = ctx.measureText(calStr).width
  // unidade / meta ao lado do número grande
  ctx.font = f(F.subtitleWeight, 34)
  ctx.fillStyle = C.subtitle
  const tail = content.kind === 'day' ? ` / ${nf(content.goalCalories)} kcal` : ' kcal'
  ctx.fillText(tail, left + calW + 12, heroNumY + heroSize - 44)
  ctx.restore()

  // ── 3 cards P/C/G ──────────────────────────────────────────────────────────
  const cardW = Math.floor((right - left - gap * 2) / 3)
  const mg = (v: number) => `${nf(v)}g`
  const dg = (v: number, goal: number) => `${nf(v)}/${nf(goal)}g`
  const cards: Array<{ label: string; value: string }> =
    content.kind === 'meal'
      ? [
          { label: 'PROTEÍNA', value: mg(content.protein) },
          { label: 'CARBO', value: mg(content.carbs) },
          { label: 'GORDURA', value: mg(content.fat) },
        ]
      : [
          { label: 'PROTEÍNA', value: dg(content.protein, content.goalProtein) },
          { label: 'CARBO', value: dg(content.carbs, content.goalCarbs) },
          { label: 'GORDURA', value: dg(content.fat, content.goalFat) },
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

// ── Adapters: dados do NutritionMixer → conteúdo do story ────────────────────
export const mealToContent = (item: {
  food_name?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}): NutritionStoryContent => ({
  kind: 'meal',
  mealName: String(item?.food_name || 'Refeição'),
  calories: Number(item?.calories) || 0,
  protein: Number(item?.protein) || 0,
  carbs: Number(item?.carbs) || 0,
  fat: Number(item?.fat) || 0,
})

export const dayToContent = (
  totals: { calories?: number; protein?: number; carbs?: number; fat?: number },
  goals: { calories?: number; protein?: number; carbs?: number; fat?: number },
  dateKey: string,
): NutritionStoryContent => {
  const dateText = (() => {
    try {
      const [y, m, d] = String(dateKey || '').split('-')
      if (y && m && d) return `${d}/${m}/${y}`
    } catch { /* ignore */ }
    return String(dateKey || '')
  })()
  return {
    kind: 'day',
    dateText,
    calories: Number(totals?.calories) || 0,
    goalCalories: Number(goals?.calories) || 0,
    protein: Number(totals?.protein) || 0,
    carbs: Number(totals?.carbs) || 0,
    fat: Number(totals?.fat) || 0,
    goalProtein: Number(goals?.protein) || 0,
    goalCarbs: Number(goals?.carbs) || 0,
    goalFat: Number(goals?.fat) || 0,
  }
}
