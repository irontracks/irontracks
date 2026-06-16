/**
 * nutritionStoryTemplates.ts
 *
 * Templates EXCLUSIVOS do Story de Nutrição (separados dos de treino). Reusa o
 * tipo StoryTemplate; só paleta/tipografia/estilo — geometria fica no renderer
 * (drawNutritionStory). Fontes já instaladas no iOS/macOS (sem web font).
 */
import type { StoryTemplate } from './storyTemplates'

const SYSTEM_STACK = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
const SERIF_STACK = 'Georgia, "Times New Roman", "Noto Serif", serif'
const ROUNDED_STACK = '"Avenir Next", "Avenir", "Trebuchet MS", "Segoe UI", sans-serif'
const GEOMETRIC_STACK = '"Futura", "Century Gothic", "Trebuchet MS", system-ui, sans-serif'
const HEAVY_STACK = '"Impact", "Haettenschweiler", "Arial Narrow Bold", "Anton", sans-serif'

// ── 1. Fresh (verde, saudável — DEFAULT) ─────────────────────────────────────
const FRESH_TEMPLATE: StoryTemplate = {
  id: 'fresh',
  name: 'Fresh',
  swatch: ['#0c2a1c', '#4ade80'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#4ade80',
    brandDot: 'rgba(74,222,128,0.55)',
    title: '#ffffff',
    subtitle: 'rgba(220,252,231,0.88)',
    value: '#ffffff',
    cardLabel: 'rgba(74,222,128,0.95)',
    cardFill: 'rgba(6,24,16,0.66)',
    cardBorder: 'rgba(74,222,128,0.20)',
    cardAccent: 'rgba(34,197,94,0.85)',
    badgeFill: 'rgba(74,222,128,0.16)',
    badgeBorder: 'rgba(74,222,128,0.32)',
    badgeText: '#4ade80',
    pillFill: 'rgba(6,24,16,0.55)',
    pillBorder: 'rgba(34,197,94,0.35)',
    pillText: 'rgba(220,252,231,0.90)',
    timeFill: 'rgba(6,24,16,0.60)',
    timeBorder: 'rgba(34,197,94,0.50)',
    timeText: '#4ade80',
  },
  fonts: {
    family: ROUNDED_STACK,
    brandWeight: '800',
    brandStyle: 'italic',
    titleWeight: '700',
    subtitleWeight: '600',
    valueWeight: '800',
    labelWeight: '700',
    labelLetterSpacing: '2px',
  },
  overlay: {
    fallbackBg: ['#08160f', '#0c2a1c'],
    gradientStart: 'rgba(2,12,8,0)',
    gradientEnd: 'rgba(2,12,8,0.80)',
  },
  card: { radius: 24, accentHeight: 3, showAccentLine: true },
  titleUppercase: true,
  brandDivider: ' · ',
}

// ── 2. Protein (vermelho, pesado/condensado) ─────────────────────────────────
const PROTEIN_TEMPLATE: StoryTemplate = {
  id: 'protein',
  name: 'Protein',
  swatch: ['#28100c', '#f87171'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#f87171',
    brandDot: 'rgba(248,113,113,0.55)',
    title: '#ffffff',
    subtitle: 'rgba(254,226,226,0.88)',
    value: '#ffffff',
    cardLabel: 'rgba(248,113,113,0.95)',
    cardFill: 'rgba(28,8,8,0.72)',
    cardBorder: 'rgba(248,113,113,0.22)',
    cardAccent: 'rgba(239,68,68,0.85)',
    badgeFill: 'rgba(248,113,113,0.16)',
    badgeBorder: 'rgba(248,113,113,0.32)',
    badgeText: '#f87171',
    pillFill: 'rgba(28,8,8,0.60)',
    pillBorder: 'rgba(239,68,68,0.35)',
    pillText: 'rgba(254,226,226,0.90)',
    timeFill: 'rgba(28,8,8,0.60)',
    timeBorder: 'rgba(239,68,68,0.50)',
    timeText: '#f87171',
  },
  fonts: {
    family: HEAVY_STACK,
    brandWeight: '400',
    brandStyle: 'normal',
    titleWeight: '400',
    subtitleWeight: '400',
    valueWeight: '400',
    labelWeight: '400',
    labelLetterSpacing: '2px',
  },
  overlay: {
    fallbackBg: ['#140606', '#28100c'],
    gradientStart: 'rgba(12,4,4,0)',
    gradientEnd: 'rgba(12,4,4,0.82)',
  },
  card: { radius: 14, accentHeight: 4, showAccentLine: true },
  titleUppercase: true,
  brandDivider: '',
}

// ── 3. Berry (roxo, geométrico) ──────────────────────────────────────────────
const BERRY_TEMPLATE: StoryTemplate = {
  id: 'berry',
  name: 'Berry',
  swatch: ['#1a0e2e', '#c084fc'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#c084fc',
    brandDot: 'rgba(192,132,252,0.55)',
    title: '#ffffff',
    subtitle: 'rgba(243,232,255,0.88)',
    value: '#ffffff',
    cardLabel: 'rgba(192,132,252,0.95)',
    cardFill: 'rgba(20,10,30,0.70)',
    cardBorder: 'rgba(192,132,252,0.20)',
    cardAccent: 'rgba(168,85,247,0.85)',
    badgeFill: 'rgba(192,132,252,0.16)',
    badgeBorder: 'rgba(192,132,252,0.32)',
    badgeText: '#c084fc',
    pillFill: 'rgba(20,10,30,0.55)',
    pillBorder: 'rgba(168,85,247,0.35)',
    pillText: 'rgba(243,232,255,0.90)',
    timeFill: 'rgba(20,10,30,0.60)',
    timeBorder: 'rgba(168,85,247,0.50)',
    timeText: '#c084fc',
  },
  fonts: {
    family: GEOMETRIC_STACK,
    brandWeight: '700',
    brandStyle: 'normal',
    titleWeight: '600',
    subtitleWeight: '500',
    valueWeight: '700',
    labelWeight: '700',
    labelLetterSpacing: '3px',
  },
  overlay: {
    fallbackBg: ['#0e0716', '#1a0e2e'],
    gradientStart: 'rgba(8,4,14,0)',
    gradientEnd: 'rgba(8,4,14,0.82)',
  },
  card: { radius: 24, accentHeight: 3, showAccentLine: true },
  titleUppercase: true,
  brandDivider: ' / ',
}

// ── 4. Citrus (laranja, sistema) ─────────────────────────────────────────────
const CITRUS_TEMPLATE: StoryTemplate = {
  id: 'citrus',
  name: 'Citrus',
  swatch: ['#241606', '#fbbf24'],
  colors: {
    brandPrimary: '#ffffff',
    brandAccent: '#fbbf24',
    brandDot: 'rgba(251,146,60,0.55)',
    title: '#ffffff',
    subtitle: 'rgba(255,237,213,0.88)',
    value: '#ffffff',
    cardLabel: 'rgba(251,146,60,0.95)',
    cardFill: 'rgba(28,16,4,0.66)',
    cardBorder: 'rgba(251,191,36,0.20)',
    cardAccent: 'rgba(245,158,11,0.85)',
    badgeFill: 'rgba(251,191,36,0.16)',
    badgeBorder: 'rgba(251,191,36,0.32)',
    badgeText: '#fbbf24',
    pillFill: 'rgba(28,16,4,0.55)',
    pillBorder: 'rgba(245,158,11,0.35)',
    pillText: 'rgba(255,237,213,0.90)',
    timeFill: 'rgba(28,16,4,0.60)',
    timeBorder: 'rgba(245,158,11,0.50)',
    timeText: '#fbbf24',
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
    fallbackBg: ['#160d04', '#241606'],
    gradientStart: 'rgba(12,7,2,0)',
    gradientEnd: 'rgba(12,7,2,0.80)',
  },
  card: { radius: 24, accentHeight: 3, showAccentLine: true },
  titleUppercase: true,
  brandDivider: ' · ',
}

// ── 5. Mono (serifada, clean) ────────────────────────────────────────────────
const MONO_TEMPLATE: StoryTemplate = {
  id: 'mono',
  name: 'Mono',
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
    family: SERIF_STACK,
    brandWeight: '700',
    brandStyle: 'normal',
    titleWeight: '700',
    subtitleWeight: '400',
    valueWeight: '700',
    labelWeight: '700',
    labelLetterSpacing: '4px',
  },
  overlay: {
    fallbackBg: ['#0a0a0a', '#1c1c1c'],
    gradientStart: 'rgba(0,0,0,0)',
    gradientEnd: 'rgba(0,0,0,0.82)',
  },
  card: { radius: 18, accentHeight: 2, showAccentLine: false },
  titleUppercase: false,
  brandDivider: '',
}

export const NUTRITION_STORY_TEMPLATES: StoryTemplate[] = [
  FRESH_TEMPLATE,
  PROTEIN_TEMPLATE,
  BERRY_TEMPLATE,
  CITRUS_TEMPLATE,
  MONO_TEMPLATE,
]

export const DEFAULT_NUTRITION_TEMPLATE = NUTRITION_STORY_TEMPLATES[0]

export const getNutritionTemplateById = (id?: string | null): StoryTemplate =>
  NUTRITION_STORY_TEMPLATES.find((t) => t.id === id) ?? DEFAULT_NUTRITION_TEMPLATE
