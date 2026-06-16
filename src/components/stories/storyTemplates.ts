/**
 * storyTemplates.ts
 *
 * Registry de ESTILOS (templates) do Story do Instagram. Cada template é só
 * paleta de cor + tipografia (peso/itálico/espaçamento) + estilo de card/overlay
 * — NUNCA geometria/posições/tamanhos (isso fica em drawStory pra os layouts
 * existentes não mudarem). O template é ortogonal ao layout (live/group/etc.).
 *
 * `classic` reproduz EXATAMENTE o visual atual (preto + dourado #facc15).
 */

export interface StoryTemplateColors {
  brandPrimary: string // "IRON"
  brandAccent: string // "TRACKS"
  brandDot: string // separador " · " (layouts standard)
  title: string
  subtitle: string
  value: string // valor do card
  cardLabel: string
  cardFill: string
  cardBorder: string
  cardAccent: string // linha inferior do card
  badgeFill: string
  badgeBorder: string
  badgeText: string
  pillFill: string
  pillBorder: string
  pillText: string
  timeFill: string
  timeBorder: string
  timeText: string
}

export interface StoryTemplateFonts {
  family: string
  brandWeight: string
  brandStyle: 'italic' | 'normal'
  titleWeight: string
  subtitleWeight: string
  valueWeight: string
  labelWeight: string
  labelLetterSpacing: string
}

export interface StoryTemplateOverlay {
  fallbackBg: [string, string] // gradiente do fundo quando não há imagem
  gradientStart: string // topo do overlay (geralmente transparente)
  gradientEnd: string // base do overlay
}

export interface StoryTemplateCard {
  radius: number
  accentHeight: number
  showAccentLine: boolean
}

export interface StoryTemplate {
  id: string
  name: string
  swatch: [string, string] // [fundo, acento] — usados no seletor
  colors: StoryTemplateColors
  fonts: StoryTemplateFonts
  overlay: StoryTemplateOverlay
  card: StoryTemplateCard
}

const SYSTEM_STACK = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'

/** Monta a string de `ctx.font` a partir do template. */
export const storyFont = (
  family: string,
  weight: string,
  size: number,
  style: 'italic' | 'normal' = 'normal',
): string => `${style === 'italic' ? 'italic ' : ''}${weight} ${size}px ${family}`

// ── 1. Clássico (visual ATUAL — valores idênticos ao hardcoded de hoje) ──────
const CLASSIC_TEMPLATE: StoryTemplate = {
  id: 'classic',
  name: 'Clássico',
  swatch: ['#111827', '#facc15'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#facc15',
    brandDot: 'rgba(250,204,21,0.55)',
    title: '#ffffff',
    subtitle: 'rgba(255,255,255,0.85)',
    value: '#ffffff',
    cardLabel: 'rgba(250,204,21,0.85)',
    cardFill: 'rgba(0,0,0,0.72)',
    cardBorder: 'rgba(255,255,255,0.10)',
    cardAccent: 'rgba(250,204,21,0.70)',
    badgeFill: 'rgba(250,204,21,0.16)',
    badgeBorder: 'rgba(250,204,21,0.28)',
    badgeText: '#facc15',
    pillFill: 'rgba(0,0,0,0.52)',
    pillBorder: 'rgba(250,204,21,0.30)',
    pillText: 'rgba(255,255,255,0.80)',
    timeFill: 'rgba(0,0,0,0.55)',
    timeBorder: 'rgba(250,204,21,0.5)',
    timeText: '#facc15',
  },
  fonts: {
    family: SYSTEM_STACK,
    brandWeight: '900',
    brandStyle: 'italic',
    titleWeight: '800',
    subtitleWeight: '700',
    valueWeight: '900',
    labelWeight: '800',
    labelLetterSpacing: '2px',
  },
  overlay: {
    fallbackBg: ['#0a0a0a', '#111827'],
    gradientStart: 'rgba(0,0,0,0)',
    gradientEnd: 'rgba(0,0,0,0.78)',
  },
  card: { radius: 28, accentHeight: 3, showAccentLine: true },
}

// ── 2. Noir (monocromático, editorial, sem linha de acento) ──────────────────
const NOIR_TEMPLATE: StoryTemplate = {
  id: 'noir',
  name: 'Noir',
  swatch: ['#1c1c1c', '#e5e5e5'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#e5e5e5',
    brandDot: 'rgba(255,255,255,0.45)',
    title: '#ffffff',
    subtitle: 'rgba(255,255,255,0.80)',
    value: '#ffffff',
    cardLabel: 'rgba(255,255,255,0.70)',
    cardFill: 'rgba(255,255,255,0.06)',
    cardBorder: 'rgba(255,255,255,0.18)',
    cardAccent: 'rgba(255,255,255,0.50)',
    badgeFill: 'rgba(255,255,255,0.12)',
    badgeBorder: 'rgba(255,255,255,0.25)',
    badgeText: '#ffffff',
    pillFill: 'rgba(0,0,0,0.45)',
    pillBorder: 'rgba(255,255,255,0.25)',
    pillText: 'rgba(255,255,255,0.85)',
    timeFill: 'rgba(0,0,0,0.45)',
    timeBorder: 'rgba(255,255,255,0.35)',
    timeText: '#ffffff',
  },
  fonts: {
    family: SYSTEM_STACK,
    brandWeight: '800',
    brandStyle: 'normal',
    titleWeight: '700',
    subtitleWeight: '600',
    valueWeight: '800',
    labelWeight: '700',
    labelLetterSpacing: '4px',
  },
  overlay: {
    fallbackBg: ['#0a0a0a', '#1c1c1c'],
    gradientStart: 'rgba(0,0,0,0)',
    gradientEnd: 'rgba(0,0,0,0.82)',
  },
  card: { radius: 20, accentHeight: 2, showAccentLine: false },
}

// ── 3. Sunset (quente, coral/laranja) ────────────────────────────────────────
const SUNSET_TEMPLATE: StoryTemplate = {
  id: 'sunset',
  name: 'Sunset',
  swatch: ['#2b1a10', '#fb7185'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#fb7185',
    brandDot: 'rgba(251,146,60,0.6)',
    title: '#fff7ed',
    subtitle: 'rgba(255,237,213,0.88)',
    value: '#ffffff',
    cardLabel: 'rgba(251,146,60,0.95)',
    cardFill: 'rgba(40,16,24,0.66)',
    cardBorder: 'rgba(251,113,133,0.22)',
    cardAccent: 'rgba(249,115,22,0.85)',
    badgeFill: 'rgba(251,113,133,0.18)',
    badgeBorder: 'rgba(251,113,133,0.35)',
    badgeText: '#fb7185',
    pillFill: 'rgba(40,16,24,0.55)',
    pillBorder: 'rgba(249,115,22,0.40)',
    pillText: 'rgba(255,237,213,0.90)',
    timeFill: 'rgba(40,16,24,0.60)',
    timeBorder: 'rgba(249,115,22,0.55)',
    timeText: '#fdba74',
  },
  fonts: {
    family: SYSTEM_STACK,
    brandWeight: '900',
    brandStyle: 'italic',
    titleWeight: '800',
    subtitleWeight: '700',
    valueWeight: '900',
    labelWeight: '800',
    labelLetterSpacing: '2px',
  },
  overlay: {
    fallbackBg: ['#1f1115', '#2b1a10'],
    gradientStart: 'rgba(20,6,10,0)',
    gradientEnd: 'rgba(20,6,10,0.80)',
  },
  card: { radius: 28, accentHeight: 3, showAccentLine: true },
}

// ── 4. Ocean (ciano/azul) ────────────────────────────────────────────────────
const OCEAN_TEMPLATE: StoryTemplate = {
  id: 'ocean',
  name: 'Ocean',
  swatch: ['#0c2238', '#38bdf8'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#38bdf8',
    brandDot: 'rgba(56,189,248,0.55)',
    title: '#ffffff',
    subtitle: 'rgba(224,242,254,0.88)',
    value: '#ffffff',
    cardLabel: 'rgba(56,189,248,0.95)',
    cardFill: 'rgba(8,20,34,0.70)',
    cardBorder: 'rgba(56,189,248,0.20)',
    cardAccent: 'rgba(56,189,248,0.80)',
    badgeFill: 'rgba(56,189,248,0.16)',
    badgeBorder: 'rgba(56,189,248,0.30)',
    badgeText: '#38bdf8',
    pillFill: 'rgba(8,20,34,0.55)',
    pillBorder: 'rgba(56,189,248,0.32)',
    pillText: 'rgba(224,242,254,0.90)',
    timeFill: 'rgba(8,20,34,0.60)',
    timeBorder: 'rgba(56,189,248,0.50)',
    timeText: '#7dd3fc',
  },
  fonts: {
    family: SYSTEM_STACK,
    brandWeight: '900',
    brandStyle: 'italic',
    titleWeight: '800',
    subtitleWeight: '700',
    valueWeight: '900',
    labelWeight: '800',
    labelLetterSpacing: '2px',
  },
  overlay: {
    fallbackBg: ['#06121f', '#0c2238'],
    gradientStart: 'rgba(2,8,18,0)',
    gradientEnd: 'rgba(2,8,18,0.80)',
  },
  card: { radius: 24, accentHeight: 3, showAccentLine: true },
}

// ── 5. Lime (alto contraste, verde-limão, bold) ──────────────────────────────
const LIME_TEMPLATE: StoryTemplate = {
  id: 'lime',
  name: 'Lime',
  swatch: ['#14160d', '#a3e635'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#a3e635',
    brandDot: 'rgba(163,230,53,0.55)',
    title: '#ffffff',
    subtitle: 'rgba(236,252,203,0.85)',
    value: '#a3e635',
    cardLabel: 'rgba(163,230,53,0.95)',
    cardFill: 'rgba(0,0,0,0.78)',
    cardBorder: 'rgba(163,230,53,0.22)',
    cardAccent: 'rgba(163,230,53,0.85)',
    badgeFill: 'rgba(163,230,53,0.16)',
    badgeBorder: 'rgba(163,230,53,0.32)',
    badgeText: '#a3e635',
    pillFill: 'rgba(0,0,0,0.60)',
    pillBorder: 'rgba(163,230,53,0.35)',
    pillText: 'rgba(236,252,203,0.90)',
    timeFill: 'rgba(0,0,0,0.60)',
    timeBorder: 'rgba(163,230,53,0.50)',
    timeText: '#a3e635',
  },
  fonts: {
    family: SYSTEM_STACK,
    brandWeight: '900',
    brandStyle: 'normal',
    titleWeight: '900',
    subtitleWeight: '800',
    valueWeight: '900',
    labelWeight: '900',
    labelLetterSpacing: '3px',
  },
  overlay: {
    fallbackBg: ['#0a0a0a', '#14160d'],
    gradientStart: 'rgba(0,0,0,0)',
    gradientEnd: 'rgba(0,0,0,0.82)',
  },
  card: { radius: 16, accentHeight: 4, showAccentLine: true },
}

export const STORY_TEMPLATES: StoryTemplate[] = [
  CLASSIC_TEMPLATE,
  NOIR_TEMPLATE,
  SUNSET_TEMPLATE,
  OCEAN_TEMPLATE,
  LIME_TEMPLATE,
]

export const DEFAULT_STORY_TEMPLATE = STORY_TEMPLATES[0]

export const getTemplateById = (id?: string | null): StoryTemplate =>
  STORY_TEMPLATES.find((t) => t.id === id) ?? DEFAULT_STORY_TEMPLATE
