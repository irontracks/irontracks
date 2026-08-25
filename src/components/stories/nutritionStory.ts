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
  clampBrandOffset,
  enterBrandSpace,
} from '../storyComposerUtils'
import { type StoryTemplate, storyFont } from './storyTemplates'
import { drawCustomTextLayer } from './customText'

export type NutritionStoryItem = { label: string; grams: number }

export type NutritionStoryContent =
  | {
      kind: 'meal'
      mealName: string
      calories: number
      protein: number
      carbs: number
      fat: number
      items?: NutritionStoryItem[]
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
  | {
      /**
       * Semana / mês — MÉDIA por dia registrado.
       *
       * `loggedDays`/`windowDays` não são enfeite: sem a cobertura, "2.180
       * kcal/dia" de quem lançou 8 dias em 30 lê como se fosse o mês inteiro.
       * O story sai da mão do dono e ninguém do outro lado tem como perguntar.
       */
      kind: 'period'
      /** "Semana" | "Mês" | "45 dias". */
      periodLabel: string
      /** "10 – 16 de ago." */
      rangeText: string
      calories: number
      /** Meta ATUAL (0 quando não há) — o banco não guarda meta datada. */
      goalCalories: number
      protein: number
      carbs: number
      fat: number
      loggedDays: number
      windowDays: number
      /**
       * SOMA do período. O hero continua sendo a MÉDIA POR DIA (é ela que se
       * compara com a meta diária), mas um story que diz "MÊS" e mostra só um
       * número de dia lia como o dia de hoje — foi exatamente a leitura do dono
       * ao ver o card pronto (19/08/2026). O total responde "quanto no mês".
       */
      totalCalories: number
      totalProtein: number
      totalCarbs: number
      totalFat: number
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
  content: NutritionStoryContent
  transparentBg?: boolean
  skipClear?: boolean
  template: StoryTemplate
  /** Zoom/reposição do card (pinça + arrasto). O fundo/foto NÃO é afetado. */
  workoutTransform?: { scale: number; offsetX: number; offsetY: number }
  /** Posição própria da marca (IRON·TRACKS) — imune ao zoom/pan do bloco. */
  brandOffset?: { x: number; y: number }
  /** Escala própria da marca (pinça sobre o logo) — só ela cresce. */
  brandScale?: number
  /** Legenda livre do usuário, na tipografia do template. */
  customText?: string
  /** Posição própria da legenda (arrastável). */
  customTextOffset?: { x: number; y: number }
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

  // Zoom/reposição do card (pinça + arrasto). Só o CONTEÚDO transforma — o fundo
  // (foto/gradiente + overlay acima) fica fixo. Pivô no centro do canvas.
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
  // Marca em espaço próprio: desfaz o zoom/pan do bloco e aplica só o offset
  // dela (independência total do resto do story).
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

  // ── Título ────────────────────────────────────────────────────────────────
  const rawTitle =
    content.kind === 'meal' ? content.mealName
      : content.kind === 'period' ? content.periodLabel
        : 'Resumo do dia'
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
  const subText =
    content.kind === 'day' ? content.dateText
      : content.kind === 'period' ? content.rangeText
        : 'REFEIÇÃO'

  /** Pill do template — devolve onde ele terminou, para o próximo encostar. */
  const drawPill = (x: number, y: number, text: string): number => {
    ctx.font = f(F.subtitleWeight, 22)
    const tw = ctx.measureText(text).width
    const padX = 16
    const padY = 9
    const pillW = tw + padX * 2
    const pillH = 22 + padY * 2
    drawRoundedRect(ctx, x, y, pillW, pillH, pillH / 2)
    ctx.fillStyle = C.pillFill
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = C.pillBorder
    ctx.stroke()
    ctx.fillStyle = C.pillText
    ctx.textBaseline = 'top'
    ctx.fillText(text, x + padX, y + padY)
    return x + pillW
  }

  if (subText) {
    const fim = drawPill(left, subY, subText)
    // A cobertura anda GRUDADA no período: é ela que impede a média de ser
    // lida como "todo dia do mês". Some quando não cabe — melhor sem o segundo
    // pill do que com ele estourando a margem segura.
    if (content.kind === 'period') {
      const cobertura = `${nf(content.loggedDays)} de ${nf(content.windowDays)} dias`
      ctx.font = f(F.subtitleWeight, 22)
      const larguraNecessaria = ctx.measureText(cobertura).width + 32
      if (fim + 10 + larguraNecessaria <= right) drawPill(fim + 10, subY, cobertura)
    }
  }

  // ── CALORIAS hero ──────────────────────────────────────────────────────────
  const cardTopY = safeBottomY - 16 - cardH
  const heroLabelY = cardTopY - 188

  // ── Lista de alimentos (modo refeição) ─────────────────────────────────────
  // Cada linha é o que o usuário digitou (ex.: "200g arroz branco"). Cabe entre
  // o subtítulo e o hero; se não couber tudo, mostra "+N mais".
  if (content.kind === 'meal' && Array.isArray(content.items) && content.items.length > 0) {
    const listX = left
    const listTop = subY + 48 + 22 // abaixo do pill (~48px)
    const lineH = 36
    const maxLines = Math.max(1, Math.floor((heroLabelY - 24 - listTop) / lineH))
    const all = content.items
    const fitsAll = all.length <= maxLines
    const visible = fitsAll ? all : all.slice(0, Math.max(1, maxLines - 1))
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.65)'
    ctx.shadowBlur = 8
    ctx.textBaseline = 'top'
    visible.forEach((it, i) => {
      const y = listTop + i * lineH
      ctx.fillStyle = C.cardAccent
      ctx.font = f(F.valueWeight, 22)
      ctx.fillText('•', listX, y + 3)
      const bulletW = 22
      ctx.fillStyle = C.title
      ctx.font = f(F.subtitleWeight, 28)
      let label = String(it.label || '')
      const maxW = right - listX - bulletW
      if (ctx.measureText(label).width > maxW) {
        while (label.length > 1 && ctx.measureText(label + '…').width > maxW) label = label.slice(0, -1)
        label = label + '…'
      }
      ctx.fillText(label, listX + bulletW, y)
    })
    if (!fitsAll) {
      ctx.fillStyle = C.subtitle
      ctx.font = f(F.subtitleWeight, 24)
      ctx.fillText(`+${all.length - visible.length} mais`, listX, listTop + visible.length * lineH)
    }
    ctx.restore()
  }
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 10
  ctx.textBaseline = 'top'
  ctx.font = f(F.labelWeight, 22)
  ctx.fillStyle = C.cardLabel
  ctx.letterSpacing = F.labelLetterSpacing
  ctx.fillText(content.kind === 'period' ? 'MÉDIA POR DIA' : 'CALORIAS', left, heroLabelY)
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
  const tail =
    content.kind === 'day' ? ` / ${nf(content.goalCalories)} kcal`
      : content.kind === 'period'
        ? (content.goalCalories > 0 ? ` / ${nf(content.goalCalories)} kcal` : ' kcal')
        : ' kcal'
  ctx.fillText(tail, left + calW + 12, heroNumY + heroSize - 44)
  ctx.restore()

  // ── Total do período (só no modo período) ─────────────────────────────────
  // Vai ACIMA do hero, no vão que a lista de alimentos ocupa no modo refeição.
  // O hero segue sendo a média por dia — é ela que se compara com a meta —, e
  // esta linha responde a pergunta que o título "MÊS" levanta: quanto no total.
  if (content.kind === 'period' && content.totalCalories > 0) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 10
    ctx.textBaseline = 'top'
    // 140 = altura do bloco (rótulo 22 + valor 46 + macros 26, com respiros) e
    // ainda sobra ar antes do hero. Com 96 o bloco encostava no "MÉDIA POR DIA".
    const totalLabelY = heroLabelY - 140
    ctx.font = f(F.labelWeight, 22)
    ctx.fillStyle = C.cardLabel
    ctx.letterSpacing = F.labelLetterSpacing
    ctx.fillText(`TOTAL ${String(content.periodLabel || '').toUpperCase()}`.trim(), left, totalLabelY)
    ctx.letterSpacing = '0px'

    ctx.font = f(F.valueWeight, 46)
    ctx.fillStyle = C.value
    const totalStr = `${nf(content.totalCalories)} kcal`
    ctx.fillText(totalStr, left, totalLabelY + 30)

    // Macros somados, em texto menor: quem quer o número do mês quer os três.
    ctx.font = f(F.subtitleWeight, 26)
    ctx.fillStyle = C.subtitle
    ctx.fillText(
      `${nf(content.totalProtein)}g P · ${nf(content.totalCarbs)}g C · ${nf(content.totalFat)}g G`,
      left,
      totalLabelY + 84,
    )
    ctx.restore()
  }

  // ── 3 cards P/C/G ──────────────────────────────────────────────────────────
  const cardW = Math.floor((right - left - gap * 2) / 3)
  const mg = (v: number) => `${nf(v)}g`
  const dg = (v: number, goal: number) => `${nf(v)}/${nf(goal)}g`
  // No PERÍODO o rótulo carrega o "/DIA": os números dos cards são média, igual
  // ao hero, e sem o sufixo eles liam como total do mês ao lado de um título
  // que diz "MÊS".
  const cards: Array<{ label: string; value: string }> =
    content.kind === 'period'
      ? [
          { label: 'PROTEÍNA/DIA', value: mg(content.protein) },
          { label: 'CARBO/DIA', value: mg(content.carbs) },
          { label: 'GORDURA/DIA', value: mg(content.fat) },
        ]
      : content.kind === 'meal'
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

  if (wtApplied) ctx.restore()
  // Legenda do usuário por ÚLTIMO — nada do template pode cobri-la.
  drawCustomTextLayer(ctx, template, String(customText ?? ''), customTextOffset)
}

// ── Adapters: dados do NutritionMixer → conteúdo do story ────────────────────
export const mealToContent = (item: {
  food_name?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  items?: Array<{ label?: unknown; grams?: unknown }> | null
}): NutritionStoryContent => ({
  kind: 'meal',
  mealName: String(item?.food_name || 'Refeição'),
  calories: Number(item?.calories) || 0,
  protein: Number(item?.protein) || 0,
  carbs: Number(item?.carbs) || 0,
  fat: Number(item?.fat) || 0,
  items: Array.isArray(item?.items)
    ? item.items
        .map((it) => ({ label: String(it?.label ?? '').trim(), grams: Number(it?.grams) || 0 }))
        .filter((it) => it.label)
    : undefined,
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

/**
 * Resumo de período (semana/mês) → conteúdo do story.
 *
 * Os números são MÉDIA POR DIA REGISTRADO — vêm prontos de `summarizeHistory`,
 * que é quem sabe dividir pelo denominador certo. Este adapter não recalcula
 * nada: duas contas para a mesma média é como nasce divergência entre a tela e
 * o que foi postado.
 */
export const periodToContent = (
  summary: {
    loggedDays: number; windowDays: number
    avgCalories: number; avgProtein: number; avgCarbs: number; avgFat: number
    totalCalories?: number; totalProtein?: number; totalCarbs?: number; totalFat?: number
  },
  goals: { calories?: number } | null | undefined,
  labels: { periodLabel: string; rangeText: string },
): NutritionStoryContent => ({
  kind: 'period',
  periodLabel: String(labels?.periodLabel || 'Período'),
  rangeText: String(labels?.rangeText || ''),
  calories: Number(summary?.avgCalories) || 0,
  goalCalories: Number(goals?.calories) || 0,
  protein: Number(summary?.avgProtein) || 0,
  carbs: Number(summary?.avgCarbs) || 0,
  fat: Number(summary?.avgFat) || 0,
  loggedDays: Number(summary?.loggedDays) || 0,
  windowDays: Number(summary?.windowDays) || 0,
  totalCalories: Number(summary?.totalCalories) || 0,
  totalProtein: Number(summary?.totalProtein) || 0,
  totalCarbs: Number(summary?.totalCarbs) || 0,
  totalFat: Number(summary?.totalFat) || 0,
})
