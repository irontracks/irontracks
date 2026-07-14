/**
 * storyComposerUtils.ts
 *
 * Tipos, constantes e funções utilitárias/canvas extraídas do StoryComposer.tsx (L1–581).
 * Nenhuma dependência de estado ou hooks React — todas as funções são puras.
 */

import { safeString } from '@/utils/guards'
import { calculateTotalVolume as canonicalCalculateTotalVolume } from '@/utils/report/formatters'
import { estimateCaloriesMet, MET_LIGHT, DEFAULT_BODY_WEIGHT_KG } from '@/utils/calories/metEstimate'
import { type StoryTemplate, DEFAULT_STORY_TEMPLATE, storyFont } from '@/components/stories/storyTemplates'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionLite {
    id?: string;
    name?: string;
    date?: string;
    exercises?: unknown[];
    logs?: Record<string, unknown>;
    elapsedSeconds?: number;
    [key: string]: unknown;
}

/** Linha por exercício pro layout "Treino do Dia" (tabela). */
export interface WorkoutRow {
    name: string;
    reps: string;
    weight: string;
    rpe: string;
    /** Total de execuções (soma das reps de todas as séries) do exercício. */
    totalReps?: string;
}

export interface Metrics {
    title: string;
    date: string;
    volume: number;
    totalTime: number;
    kcal: number;
    teamCount: number;
    /** Linhas da tabela (layout 'workout'). Top set por exercício. */
    exercises?: WorkoutRow[];
}

export interface LivePosition {
    x: number;
    y: number;
}

export interface LivePositions {
    [key: string]: LivePosition;
}

export interface LayoutOption {
    id: string;
    label: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CANVAS_W = 720;
export const CANVAS_H = 1280;
// Instagram Stories safe zone scaled to 720x1280:
// top/bottom: 250/1920 * 1280 ≈ 167px; sides: 60/1080 * 720 ≈ 40px
export const SAFE_TOP = 168;
export const SAFE_BOTTOM = 200;
export const SAFE_SIDE = 56;

export const STORY_LAYOUTS: LayoutOption[] = [
    { id: 'bottom-row', label: 'Normal' },
    { id: 'right-stack', label: 'Direita' },
    { id: 'left-stack', label: 'Esquerda' },
    { id: 'top-row', label: 'Topo' },
    { id: 'workout', label: 'Treino' },
    { id: 'live', label: 'LIVE' },
    { id: 'group', label: 'Grupo' },
];

// Safe-area-aware defaults for LIVE layout
// Top boundary: SAFE_TOP/CANVAS_H = 168/1280 ≈ 0.131
// Bottom boundary for card bottom: (CANVAS_H - SAFE_BOTTOM - cardH) / CANVAS_H = (1280 - 200 - 130) / 1280 ≈ 0.742
export const DEFAULT_LIVE_POSITIONS: LivePositions = {
    brand: { x: 0.078, y: 0.135 },  // just below safe top
    title: { x: 0.078, y: 0.225 },
    subtitle: { x: 0.078, y: 0.340 },
    cardVolume: { x: 0.078, y: 0.720 },  // cards end at ≈0.822, safely above safe bottom
    cardTempo: { x: 0.366, y: 0.720 },
    cardKcal: { x: 0.654, y: 0.720 },
};

// Group layout starts with the same arrangement as the Normal (bottom-row)
// layout: brand at top, title and subtitle clustered just above the cards at
// the bottom. Numbers derive from bottom-row's drawStory math:
//   cardTopY  = safeBottomY - 16 - cardH           = 934 → 934/1280 ≈ 0.730
//   subtitleY = cardTopY - 52                       = 882 → 882/1280 ≈ 0.689
//   titleY    = subtitleY - 16 - 2*titleLineH       = 778 → 778/1280 ≈ 0.608
// (titleY uses the 2-line worst case so longer titles don't collide with the
// subtitle pill.)
export const DEFAULT_GROUP_POSITIONS: LivePositions = {
    brand: { x: 0.078, y: 0.135 },
    title: { x: 0.078, y: 0.608 },
    subtitle: { x: 0.078, y: 0.689 },
    cardVolume: { x: 0.078, y: 0.730 },
    cardTempo: { x: 0.366, y: 0.730 },
    cardKcal: { x: 0.654, y: 0.730 },
};

// ─── Helper Utilities ─────────────────────────────────────────────────────────


export const isIOSUserAgent = (ua: string): boolean => {
    const s = String(ua || '');
    if (/(iPad|iPhone|iPod)/i.test(s)) return true;
    try {
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (nav && nav.platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1) return true;
    } catch { }
    return false;
};

export const pickFirstSupportedMime = (candidates: string[]): string => {
    try {
        return (
            (Array.isArray(candidates) ? candidates : []).find((t) => {
                try {
                    return !!(
                        t &&
                        typeof MediaRecorder !== 'undefined' &&
                        typeof MediaRecorder.isTypeSupported === 'function' &&
                        MediaRecorder.isTypeSupported(t)
                    );
                } catch {
                    return false;
                }
            }) || ''
        );
    } catch {
        return '';
    }
};

export const formatDatePt = (v: unknown): string => {
    try {
        if (!v) return '';
        const vObj = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
        const raw =
            vObj?.toDate && typeof vObj.toDate === 'function'
                ? (vObj.toDate as () => unknown)()
                : v;
        const d = raw instanceof Date ? raw : new Date(raw as string | number | Date);
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '';
    }
};

export const formatDuration = (totalSeconds: unknown): string => {
    const sec = Number(totalSeconds) || 0;
    if (sec <= 0) return '0min';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
};

/**
 * Volume total do Story — DELEGA à fonte única (utils/report/formatters →
 * setVolume + isWorkingSet).
 *
 * A implementação local era naive: tratava cluster, mas depois caía em
 * `weight × reps` do TOPO do log. Isso (a) SUBCONTAVA drop-set/stripping — as
 * etapas (ex.: 57kg→36kg) viravam "36 × total de reps" —, (b) zerava exercícios
 * UNILATERAIS (que só gravam L_/R_) e (c) não filtrava aquecimento. Resultado: o
 * Story mostrava um volume MENOR que o do relatório/histórico pro MESMO treino
 * (caso real: 18.856 kg no Story vs 19.696 kg reais — 840 kg a menos só do drop).
 *
 * `parseRepsValue` da fonte única já trata o formato "feito/planejado" ("8/10" → 8),
 * então nada se perde na delegação.
 */
export const calculateTotalVolume = (logs: Record<string, unknown>): number =>
    canonicalCalculateTotalVolume(logs);


export const computeKcal = ({
    session,
    volume: _volume,
}: {
    session: SessionLite;
    volume: number;
}): number => {
    try {
        const existing = Number(session?.calories) || Number(session?.kcal);
        if (Number.isFinite(existing) && existing > 0) return Math.round(existing);

        const s = session as Record<string, unknown>
        const logs = s?.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
        const durationMin = (Number(s?.totalTime) || 0) / 60
        const exerciseNames = Array.isArray(s?.exercises)
            ? (s.exercises as unknown[]).map((ex) => {
                const e = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null
                return String(e?.name || '').trim()
            }).filter(Boolean) as string[]
            : null
        // Extract available session data for a richer estimate
        const pcRaw = s?.preCheckin && typeof s.preCheckin === 'object' ? (s.preCheckin as Record<string, unknown>) : null
        const bwCandidates = [pcRaw?.weight, pcRaw?.body_weight_kg, pcRaw?.answers && typeof pcRaw.answers === 'object' ? (pcRaw.answers as Record<string, unknown>).body_weight_kg : null]
        const bodyWeightKg = bwCandidates.reduce<number | null>((acc, c) => {
            if (acc !== null) return acc
            const n = Number(c)
            return Number.isFinite(n) && n >= 20 && n <= 300 ? n : null
        }, null)
        const execSec = Number(s?.executionTotalSeconds ?? s?.execution_total_seconds ?? 0) || 0
        const restSec = Number(s?.restTotalSeconds ?? s?.rest_total_seconds ?? 0) || 0
        const sexRaw = String(s?.biologicalSex ?? '').toLowerCase()
        const bioSex = sexRaw === 'male' || sexRaw === 'female' ? sexRaw : null

        const kcal = estimateCaloriesMet(
            logs, durationMin, bodyWeightKg, exerciseNames,
            null, execSec > 0 ? execSec / 60 : null, restSec > 0 ? restSec / 60 : null, bioSex,
        )
        if (kcal > 0) return kcal

        // Dead-last fallback when MET model returns 0 (no logs/duration)
        if (durationMin > 0) return Math.round(MET_LIGHT * DEFAULT_BODY_WEIGHT_KG * (durationMin / 60))
        return 0;
    } catch {
        return 0;
    }
};

export const fitCover = ({
    canvasW,
    canvasH,
    imageW,
    imageH,
}: {
    canvasW: number;
    canvasH: number;
    imageW: number;
    imageH: number;
}) => {
    const iw = Number(imageW) || 0;
    const ih = Number(imageH) || 0;
    if (iw <= 0 || ih <= 0) return { scale: 1, dw: 0, dh: 0 };
    const coverScale = Math.max(canvasW / iw, canvasH / ih);
    const dw = iw * coverScale;
    const dh = ih * coverScale;
    return { scale: coverScale, dw, dh };
};

export const clamp01 = (n: unknown): number => Math.max(0, Math.min(1, Number(n) || 0));

export const clampPctWithSize = ({
    pos,
    size,
}: {
    pos: LivePosition;
    size: { w: number; h: number };
}) => {
    const px = clamp01(pos?.x);
    const py = clamp01(pos?.y);
    const sw = clamp01(size?.w);
    const sh = clamp01(size?.h);
    return {
        x: Math.max(0, Math.min(1 - sw, px)),
        y: Math.max(0, Math.min(1 - sh, py)),
    };
};

export const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) => {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};

// ─── Canvas Logic ─────────────────────────────────────────────────────────────

export const computeLiveSizes = ({
    ctx,
    metrics,
    template = DEFAULT_STORY_TEMPLATE,
}: {
    ctx: CanvasRenderingContext2D | null;
    metrics: Metrics;
    template?: StoryTemplate;
}) => {
    try {
        if (!ctx) {
            return {
                brand: { w: 0.5, h: 0.04 },
                title: { w: 0.7, h: 0.08 },
                subtitle: { w: 0.8, h: 0.04 },
                card: { w: 0.26, h: 0.07 },
                titleLines: [] as string[],
            };
        }

        const F = template.fonts;
        const titleFont = storyFont(F.family, F.titleWeight, 34);
        const left = SAFE_SIDE;
        const right = CANVAS_W - SAFE_SIDE;
        const title = template.titleUppercase
            ? safeString(metrics?.title).toUpperCase()
            : safeString(metrics?.title);
        const words = title.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let line = '';

        ctx.font = titleFont;
        for (const w of words) {
            const candidate = line ? `${line} ${w}` : w;
            if (ctx.measureText(candidate).width <= right - left) line = candidate;
            else {
                if (line) lines.push(line);
                line = w;
            }
            if (lines.length >= 2) break;
        }
        if (line && lines.length < 2) lines.push(line);

        const brandW = (() => {
            ctx.font = storyFont(F.family, F.brandWeight, 56, F.brandStyle);
            const ironW = ctx.measureText('IRON').width;
            const tracksW = ctx.measureText('TRACKS').width;
            return ironW + tracksW;
        })();
        const brandH = 56;

        const titleW = (() => {
            ctx.font = titleFont;
            return Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
        })();
        const titleH = lines.length * 40;

        const subtitleW = (() => {
            ctx.font = titleFont;
            const dateText = metrics?.date ? `• ${metrics.date}` : '';
            return ctx.measureText(`RELATÓRIO DO TREINO ${dateText}`.trim()).width;
        })();
        const subtitleH = 34;

        const cardW = Math.floor((right - left - 18 * 2) / 3);
        const cardH = 130;

        return {
            brand: { w: brandW / CANVAS_W, h: brandH / CANVAS_H },
            title: { w: titleW / CANVAS_W, h: titleH / CANVAS_H },
            subtitle: { w: subtitleW / CANVAS_W, h: subtitleH / CANVAS_H },
            card: { w: cardW / CANVAS_W, h: cardH / CANVAS_H },
            titleLines: lines,
        };
    } catch {
        return {
            brand: { w: 0.5, h: 0.04 },
            title: { w: 0.7, h: 0.08 },
            subtitle: { w: 0.8, h: 0.04 },
            card: { w: 0.26, h: 0.07 },
            titleLines: [] as string[],
        };
    }
};

export const drawStory = ({
    ctx,
    canvasW,
    canvasH,
    backgroundImage,
    metrics,
    layout,
    livePositions,
    transparentBg = false,
    skipClear = false,
    template = DEFAULT_STORY_TEMPLATE,
    workoutTransform,
}: {
    ctx: CanvasRenderingContext2D;
    canvasW: number;
    canvasH: number;
    backgroundImage: HTMLImageElement | null;
    metrics: Metrics;
    layout: string;
    livePositions: LivePositions;
    transparentBg?: boolean;
    skipClear?: boolean;
    template?: StoryTemplate;
    /** Zoom/reposicionamento do card no layout 'workout' (pinça + arrasto). */
    workoutTransform?: { scale: number; offsetX: number; offsetY: number };
}) => {
    // Atalhos do template (cores/fontes/card). A GEOMETRIA segue literal abaixo —
    // o template só troca cor/peso/itálico/acento, nunca posições/tamanhos.
    const C = template.colors;
    const F = template.fonts;
    const f = (weight: string, size: number, style: 'italic' | 'normal' = 'normal') =>
        storyFont(F.family, weight, size, style);

    if (!skipClear) ctx.clearRect(0, 0, canvasW, canvasH);

    // Background
    if (!transparentBg) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvasW, canvasH);

        if (backgroundImage) {
            const iw = Number(backgroundImage.naturalWidth) || 0;
            const ih = Number(backgroundImage.naturalHeight) || 0;
            const { scale: coverScale } = fitCover({ canvasW, canvasH, imageW: iw, imageH: ih });
            const dw = iw * coverScale;
            const dh = ih * coverScale;
            const cx = (canvasW - dw) / 2;
            const cy = (canvasH - dh) / 2;
            ctx.drawImage(backgroundImage, cx, cy, dw, dh);
        } else {
            const g = ctx.createLinearGradient(0, 0, canvasW, canvasH);
            g.addColorStop(0, template.overlay.fallbackBg[0]);
            g.addColorStop(1, template.overlay.fallbackBg[1]);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, canvasW, canvasH);
        }
    }

    // Gradient Overlay
    const baseOverlay = ctx.createLinearGradient(0, canvasH * 0.35, 0, canvasH);
    baseOverlay.addColorStop(0, template.overlay.gradientStart);
    baseOverlay.addColorStop(1, template.overlay.gradientEnd);
    ctx.fillStyle = baseOverlay;
    ctx.fillRect(0, 0, canvasW, canvasH);

    const left = SAFE_SIDE;
    const right = canvasW - SAFE_SIDE;
    const safeBottomY = canvasH - SAFE_BOTTOM;

    // Team Badge
    const teamCount = Number(metrics?.teamCount) || 0;
    if (teamCount >= 2) {
        const label = `EQUIPE • ${teamCount}`;
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.font = f('900', 24);
        const padX = 18;
        const padY = 12;
        const textW = ctx.measureText(label).width;
        const w = Math.ceil(textW + padX * 2);
        const h = 46;
        const x = Math.max(left, right - w);
        const y = SAFE_TOP;
        drawRoundedRect(ctx, x, y, w, h, 18);
        ctx.fillStyle = C.badgeFill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = C.badgeBorder;
        ctx.stroke();
        ctx.fillStyle = C.badgeText;
        ctx.fillText(label, x + padX, y + padY);
        ctx.restore();
    }

    const gap = 18;
    const cardH = 130;

    // ── Premium card renderer ─────────────────────────────────────────────────
    const drawCard = (
        box: { x: number; y: number; w: number; h: number },
        card: { label: string; value: string },
    ) => {
        const r = template.card.radius;

        // 1. Dark glass fill
        drawRoundedRect(ctx, box.x, box.y, box.w, box.h, r);
        ctx.fillStyle = C.cardFill;
        ctx.fill();

        // 2. Subtle border
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = C.cardBorder;
        ctx.stroke();

        // 3. Accent bottom line (opcional por template)
        const accentH = template.card.accentHeight;
        if (template.card.showAccentLine) {
            const accentY = box.y + box.h - accentH;
            const accentInset = 14;
            drawRoundedRect(ctx, box.x + accentInset, accentY, box.w - accentInset * 2, accentH, accentH / 2);
            ctx.fillStyle = C.cardAccent;
            ctx.fill();
        }

        // 4. Label (acento)
        ctx.textBaseline = 'top';
        ctx.font = f(F.labelWeight, 20);
        ctx.fillStyle = C.cardLabel;
        ctx.letterSpacing = F.labelLetterSpacing;
        const labelW = ctx.measureText(card.label).width;
        const labelX = box.x + (box.w - labelW) / 2;
        ctx.fillText(card.label, labelX, box.y + 20);
        ctx.letterSpacing = '0px';

        // 5. Value — auto-shrink to fit
        ctx.fillStyle = C.value;
        let valFont = 52;
        ctx.font = f(F.valueWeight, valFont);
        let valW = ctx.measureText(card.value).width;
        while (valW > box.w - 24 && valFont > 26) {
            valFont -= 2;
            ctx.font = f(F.valueWeight, valFont);
            valW = ctx.measureText(card.value).width;
        }
        const valX = box.x + (box.w - valW) / 2;
        // centre value vertically in the card (accounting for label height ~40px)
        const valY = box.y + 20 + 32 + Math.max(0, (box.h - 20 - 32 - valFont - accentH - 8) / 2);
        ctx.fillText(card.value, valX, valY);
    };

    const layoutId = STORY_LAYOUTS.some((l) => l.id === layout) ? layout : 'bottom-row';

    if (layoutId === 'live' || layoutId === 'group') {
        const safe =
            livePositions && typeof livePositions === 'object' ? livePositions : DEFAULT_LIVE_POSITIONS;
        const sizes = computeLiveSizes({ ctx, metrics, template });

        const brandPos = clampPctWithSize({ pos: safe.brand, size: sizes.brand });
        const titlePos = clampPctWithSize({ pos: safe.title, size: sizes.title });
        const subtitlePos = clampPctWithSize({ pos: safe.subtitle, size: sizes.subtitle });
        const cardVolumePos = clampPctWithSize({ pos: safe.cardVolume, size: sizes.card });
        const cardTempoPos = clampPctWithSize({ pos: safe.cardTempo, size: sizes.card });
        const cardKcalPos = clampPctWithSize({ pos: safe.cardKcal, size: sizes.card });

        const brandX = brandPos.x * CANVAS_W;
        const brandY = brandPos.y * CANVAS_H;

        ctx.textBaseline = 'top';
        ctx.font = f(F.brandWeight, 56, F.brandStyle);
        ctx.fillStyle = C.brandPrimary;
        ctx.fillText('IRON', brandX, brandY);
        const ironW = ctx.measureText('IRON').width;
        ctx.fillStyle = C.brandAccent;
        ctx.fillText('TRACKS', brandX + ironW, brandY);

        const titleX = titlePos.x * CANVAS_W;
        const titleY = titlePos.y * CANVAS_H;
        ctx.fillStyle = C.title;
        ctx.font = f(F.titleWeight, 34);
        ; (sizes.titleLines ?? []).forEach((l, idx) => {
            ctx.fillText(l, titleX, titleY + idx * 40);
        });

        const subtitleX = subtitlePos.x * CANVAS_W;
        const subtitleY = subtitlePos.y * CANVAS_H;
        ctx.fillStyle = C.subtitle;
        ctx.font = f(F.titleWeight, 34);
        const dateText = metrics?.date ? `• ${metrics.date}` : '';
        ctx.fillText(`RELATÓRIO DO TREINO ${dateText}`.trim(), subtitleX, subtitleY);

        const cards = [
            {
                label: 'VOLUME',
                value: `${Math.round(Number(metrics?.volume) || 0).toLocaleString('pt-BR')} kg`,
            },
            { label: 'TEMPO', value: formatDuration(metrics?.totalTime) },
            { label: 'KCAL', value: String(metrics?.kcal || 0) },
        ];

        const cardW = Math.floor((CANVAS_W - SAFE_SIDE * 2 - gap * 2) / 3);
        const cardsBoxes = [
            { x: cardVolumePos.x * CANVAS_W, y: cardVolumePos.y * CANVAS_H, w: cardW, h: cardH },
            { x: cardTempoPos.x * CANVAS_W, y: cardTempoPos.y * CANVAS_H, w: cardW, h: cardH },
            { x: cardKcalPos.x * CANVAS_W, y: cardKcalPos.y * CANVAS_H, w: cardW, h: cardH },
        ];

        cards.forEach((c, idx) => drawCard(cardsBoxes[idx], c));
        return;
    }

    // ── Layout "Treino do Dia" — tabela de exercícios (Exercício/Reps/Peso/RPE) ─
    if (layoutId === 'workout') {
        const rows = Array.isArray(metrics?.exercises) ? metrics.exercises : [];

        // Zoom/reposicionamento do card (pinça + arrasto). Pivô no centro do canvas
        // pra o zoom crescer/encolher "no lugar". O fundo (foto) NÃO é afetado —
        // só o conteúdo do card.
        const wt = workoutTransform ?? { scale: 1, offsetX: 0, offsetY: 0 };
        const wtApplied = wt.scale !== 1 || wt.offsetX !== 0 || wt.offsetY !== 0;
        if (wtApplied) {
            ctx.save();
            ctx.translate(wt.offsetX, wt.offsetY);
            const pivotX = canvasW / 2;
            const pivotY = canvasH / 2;
            ctx.translate(pivotX, pivotY);
            ctx.scale(wt.scale, wt.scale);
            ctx.translate(-pivotX, -pivotY);
        }

        // Brand
        ctx.textBaseline = 'top';
        const bY = SAFE_TOP + 14;
        const bSize = 48;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 12;
        ctx.font = f(F.brandWeight, bSize, F.brandStyle);
        ctx.fillStyle = C.brandPrimary;
        ctx.fillText('IRON', left, bY);
        const ironWidth = ctx.measureText('IRON').width;
        ctx.fillStyle = C.brandAccent;
        ctx.fillText('TRACKS', left + ironWidth, bY);
        ctx.restore();

        // Título (1 linha, trunca pra largura)
        const tY = bY + bSize + 14;
        ctx.font = f(F.titleWeight, 40);
        ctx.fillStyle = C.title;
        let tStr = (template.titleUppercase ? safeString(metrics?.title).toUpperCase() : safeString(metrics?.title)) || 'TREINO';
        while (ctx.measureText(tStr).width > right - left && tStr.length > 4) tStr = tStr.slice(0, -2);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.fillText(tStr, left, tY);
        ctx.restore();

        // Data / subtítulo
        const dY = tY + 50;
        ctx.font = f(F.subtitleWeight, 24);
        ctx.fillStyle = C.subtitle;
        ctx.letterSpacing = F.labelLetterSpacing;
        ctx.fillText(metrics?.date ? `TREINO DO DIA · ${metrics.date}` : 'TREINO DO DIA', left, dY);
        ctx.letterSpacing = '0px';

        // Footer cards (TEMPO + CALORIAS + VOLUME TOTAL) ancorados no rodapé seguro
        const footerH = cardH;
        const footerY = safeBottomY - footerH;
        const fW = Math.floor((right - left - gap * 2) / 3);
        const tSecs = Math.max(0, Math.round(Number(metrics?.totalTime) || 0));
        const tMin = Math.floor(tSecs / 60);
        const tempoStr = tMin >= 60 ? `${Math.floor(tMin / 60)}h ${String(tMin % 60).padStart(2, '0')}min` : `${tMin}min`;
        drawCard({ x: left, y: footerY, w: fW, h: footerH }, { label: 'TEMPO', value: tempoStr });
        drawCard({ x: left + fW + gap, y: footerY, w: fW, h: footerH }, { label: 'CALORIAS', value: `${Math.round(Number(metrics?.kcal) || 0)} kcal` });
        drawCard({ x: left + (fW + gap) * 2, y: footerY, w: fW, h: footerH }, { label: 'VOLUME TOTAL', value: `${Math.round(Number(metrics?.volume) || 0).toLocaleString('pt-BR')} kg` });

        // Cartão da tabela
        const tableTop = dY + 44;
        const tableBottom = footerY - 22;
        drawRoundedRect(ctx, left, tableTop, right - left, tableBottom - tableTop, template.card.radius);
        ctx.fillStyle = C.cardFill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = C.cardBorder;
        ctx.stroke();

        // Colunas (nome à esquerda; reps/peso/rpe alinhados à direita)
        const padX = 24;
        const nameX = left + padX;
        const rpeR = right - padX;
        const pesoR = rpeR - 92;
        const repsR = pesoR - 104;
        const nameMaxW = repsR - 72 - nameX;

        // Cabeçalho
        const headY = tableTop + 22;
        ctx.font = f(F.labelWeight, 19);
        ctx.fillStyle = C.cardLabel;
        ctx.letterSpacing = F.labelLetterSpacing;
        ctx.textAlign = 'left';
        ctx.fillText('EXERCÍCIO', nameX, headY);
        ctx.textAlign = 'right';
        ctx.fillText('REPS', repsR, headY);
        ctx.fillText('PESO', pesoR, headY);
        ctx.fillText('TOTAL', rpeR, headY);
        ctx.letterSpacing = '0px';

        // Divisória
        const headBottom = headY + 30;
        ctx.beginPath();
        ctx.moveTo(nameX, headBottom);
        ctx.lineTo(rpeR, headBottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = C.cardBorder;
        ctx.stroke();

        // Linhas
        const rowsTop = headBottom + 16;
        const rowH = 46;
        const maxRows = Math.max(0, Math.floor((tableBottom - rowsTop - 8) / rowH));
        const overflow = rows.length > maxRows;
        const visible = overflow ? rows.slice(0, Math.max(0, maxRows - 1)) : rows;
        visible.forEach((row, i) => {
            const ry = rowsTop + i * rowH;
            ctx.textAlign = 'left';
            ctx.font = f('700', 26);
            ctx.fillStyle = C.value;
            const full = String(row?.name || '');
            let nm = full;
            if (ctx.measureText(nm).width > nameMaxW) {
                while (nm.length > 2 && ctx.measureText(`${nm}…`).width > nameMaxW) nm = nm.slice(0, -1);
                nm = `${nm}…`;
            }
            ctx.fillText(nm, nameX, ry);
            ctx.textAlign = 'right';
            ctx.font = f(F.valueWeight, 26);
            ctx.fillStyle = C.value;
            ctx.fillText(String(row?.reps ?? '—'), repsR, ry);
            ctx.fillText(String(row?.weight ?? '—'), pesoR, ry);
            ctx.fillStyle = C.cardAccent;
            ctx.fillText(String(row?.totalReps ?? row?.rpe ?? '—'), rpeR, ry);
        });
        if (overflow && rows.length > visible.length) {
            ctx.textAlign = 'left';
            ctx.font = f('700', 22);
            ctx.fillStyle = C.subtitle;
            ctx.fillText(`+ ${rows.length - visible.length} exercícios`, nameX, rowsTop + visible.length * rowH + 4);
        }
        if (rows.length === 0) {
            ctx.textAlign = 'left';
            ctx.font = f('700', 24);
            ctx.fillStyle = C.subtitle;
            ctx.fillText('Sem séries registradas', nameX, rowsTop + 4);
        }

        ctx.textAlign = 'left';
        ctx.letterSpacing = '0px';
        if (wtApplied) ctx.restore();
        return;
    }

    // ── Standard Layouts ──────────────────────────────────────────────────────
    ctx.textBaseline = 'top';

    // Safe usable area
    const safeH = canvasH - SAFE_TOP - SAFE_BOTTOM; // usable vertical pixels
    void safeH; // referenced below per layout

    // ── Brand logo (IRON·TRACKS) — strictly below SAFE_TOP ───────────────────
    const brandY = SAFE_TOP + 18;
    const brandFontSize = 54;
    ctx.font = f(F.brandWeight, brandFontSize, F.brandStyle);
    ctx.textBaseline = 'top';

    // Shadow for legibility on any background
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = C.brandPrimary;
    ctx.fillText('IRON', left, brandY);
    const ironW = ctx.measureText('IRON').width;
    // separator (varia por template — pode ser '', ' · ', ' — ', ' / ')
    const divider = template.brandDivider;
    ctx.fillStyle = C.brandDot;
    ctx.font = f(F.brandWeight, Math.round(brandFontSize * 0.55), F.brandStyle);
    const dotW = divider ? ctx.measureText(divider).width : 0;
    if (divider) ctx.fillText(divider, left + ironW, brandY + brandFontSize * 0.22);
    ctx.font = f(F.brandWeight, brandFontSize, F.brandStyle);
    ctx.fillStyle = C.brandAccent;
    ctx.fillText('TRACKS', left + ironW + dotW, brandY);
    ctx.restore();

    // ── Workout title — wrapping text ─────────────────────────────────────────
    const titleFontSize = 36;
    const titleLineH = titleFontSize + 8;
    const title = template.titleUppercase
        ? safeString(metrics?.title).toUpperCase()
        : safeString(metrics?.title);
    ctx.font = f(F.titleWeight, titleFontSize);
    const lines: string[] = [];
    const words = title.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
        const candidate = line ? `${line} ${w}` : w;
        if (ctx.measureText(candidate).width <= right - left) line = candidate;
        else {
            if (line) lines.push(line);
            line = w;
        }
        if (lines.length >= 2) break;
    }
    if (line && lines.length < 2) lines.push(line);

    // ── Card data ─────────────────────────────────────────────────────────────
    const cards = [
        { label: 'VOLUME', value: `${Math.round(Number(metrics?.volume) || 0).toLocaleString('pt-BR')} kg` },
        { label: 'TEMPO', value: formatDuration(metrics?.totalTime) },
        { label: 'KCAL', value: String(metrics?.kcal || 0) },
    ];

    // ── Subtitle pill helper ───────────────────────────────────────────────────
    const drawSubtitlePill = (x: number, y: number) => {
        const dateText = metrics?.date ? ` · ${metrics.date}` : '';
        const subText = `RELATÓRIO${dateText}`;
        ctx.font = f(F.subtitleWeight, 24);
        const tw = ctx.measureText(subText).width;
        const padX = 18; const padY = 10;
        const pillW = tw + padX * 2;
        const pillH = 24 + padY * 2;
        drawRoundedRect(ctx, x, y, pillW, pillH, pillH / 2);
        ctx.fillStyle = C.pillFill;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = C.pillBorder;
        ctx.stroke();
        ctx.fillStyle = C.pillText;
        ctx.fillText(subText, x + padX, y + padY);
    };

    // ── Layout coordinates (strict safe-area clamping) ────────────────────────
    const cardW3 = Math.floor((right - left - gap * 2) / 3);
    // Max card bottom Y = safeBottomY (= canvasH - SAFE_BOTTOM)
    // So max card top Y = safeBottomY - cardH
    const maxCardTopY = safeBottomY - cardH;

    let titleY = 0;
    let subtitleY = 0;
    let cardsBoxes: { x: number; y: number; w: number; h: number }[] = [];

    if (layoutId === 'top-row') {
        // Brand → title → subtitle → cards, all top-aligned
        titleY = Math.max(brandY + brandFontSize + 16, SAFE_TOP + brandFontSize + 28);
        subtitleY = titleY + lines.length * titleLineH + 14;
        const cardTopY = subtitleY + 50;
        // Clamp cards so they don't exceed safeBottomY
        const clampedCardY = Math.min(cardTopY, maxCardTopY);
        cardsBoxes = cards.map((_, idx) => ({
            x: left + idx * (cardW3 + gap),
            y: clampedCardY,
            w: cardW3,
            h: cardH,
        }));
    } else if (layoutId === 'right-stack' || layoutId === 'left-stack') {
        const stackW = Math.round((right - left) * 0.52); // ~52% of usable width
        const x = layoutId === 'right-stack' ? right - stackW : left;
        const totalStackH = cardH * 3 + gap * 2;
        // Anchor bottom of last card to safe bottom edge
        const lastCardBottom = Math.min(safeBottomY - 16, canvasH - SAFE_BOTTOM - 16);
        const cardY0 = Math.max(SAFE_TOP, lastCardBottom - totalStackH);
        cardsBoxes = cards.map((_, idx) => ({
            x,
            y: cardY0 + idx * (cardH + gap),
            w: stackW,
            h: cardH,
        }));
        subtitleY = Math.max(SAFE_TOP, cardsBoxes[0].y - 52);
        titleY = Math.max(brandY + brandFontSize + 16, subtitleY - 16 - lines.length * titleLineH);
    } else {
        // bottom-row (default)
        // Cards sit just above safe bottom edge
        const cardTopY = safeBottomY - 16 - cardH;
        subtitleY = cardTopY - 52;
        titleY = Math.max(brandY + brandFontSize + 16, subtitleY - 16 - lines.length * titleLineH);
        cardsBoxes = cards.map((_, idx) => ({
            x: left + idx * (cardW3 + gap),
            y: cardTopY,
            w: cardW3,
            h: cardH,
        }));
    }

    // ── Draw workout title ────────────────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = C.title;
    ctx.font = f(F.titleWeight, titleFontSize);
    ctx.textBaseline = 'top';
    lines.forEach((l, idx) => {
        ctx.fillText(l, left, titleY + idx * titleLineH);
    });
    ctx.restore();

    // ── Draw subtitle pill ────────────────────────────────────────────────────
    ctx.textBaseline = 'top';
    drawSubtitlePill(left, subtitleY);

    // ── Draw cards ────────────────────────────────────────────────────────────
    cards.forEach((c, idx) => drawCard(cardsBoxes[idx], c));

    // ── Timestamp badge — bottom-right, inside safe-bottom zone ──────────────
    (() => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (!timeStr) return;

        ctx.save();
        const fontSize = 32;
        ctx.font = f('900', fontSize);
        const timeW = ctx.measureText(timeStr).width;

        const padX = 18;
        const padY = 10;
        const pillW = timeW + padX * 2;
        const pillH = fontSize + padY * 2;
        // Place in bottom-right, centered vertically inside SAFE_BOTTOM zone
        const pillX = right - pillW;
        const pillY = safeBottomY + (SAFE_BOTTOM - pillH) / 2;

        // Glass background
        drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 14);
        ctx.fillStyle = C.timeFill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = C.timeBorder;
        ctx.stroke();

        // Time text
        ctx.font = f('900', fontSize);
        ctx.textBaseline = 'top';
        ctx.fillStyle = C.timeText;
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 6;
        ctx.fillText(timeStr, pillX + padX, pillY + padY);

        ctx.restore();
    })();
};

// ── Zoom/reposição do card no layout 'workout' (funções puras, testáveis) ─────
export const WORKOUT_MIN_SCALE = 0.4
export const WORKOUT_MAX_SCALE = 3

export const clampWorkoutScale = (s: number): number =>
    Math.min(WORKOUT_MAX_SCALE, Math.max(WORKOUT_MIN_SCALE, Number.isFinite(s) ? s : 1))

export const clampWorkoutOffset = (o: number): number =>
    Math.min(CANVAS_W, Math.max(-CANVAS_W, Number.isFinite(o) ? o : 0))

export type WorkoutGestureStart = {
    startOffsetX: number
    startOffsetY: number
    startScale: number
    startDist: number
    startMidX: number
    startMidY: number
    startX: number
    startY: number
}

/** Pinça: escala pela razão de distância entre os dedos + pan pelo ponto médio. */
export const pinchToWorkoutTransform = (
    g: WorkoutGestureStart,
    curDist: number,
    midX: number,
    midY: number,
    factor: number,
): { scale: number; offsetX: number; offsetY: number } => ({
    scale: clampWorkoutScale(g.startScale * (curDist / (g.startDist || 1))),
    offsetX: clampWorkoutOffset(g.startOffsetX + (midX - g.startMidX) * factor),
    offsetY: clampWorkoutOffset(g.startOffsetY + (midY - g.startMidY) * factor),
})

/** Arrasto de 1 dedo: só move (offset), mantém a escala. */
export const panToWorkoutOffset = (
    g: WorkoutGestureStart,
    x: number,
    y: number,
    factor: number,
): { offsetX: number; offsetY: number } => ({
    offsetX: clampWorkoutOffset(g.startOffsetX + (x - g.startX) * factor),
    offsetY: clampWorkoutOffset(g.startOffsetY + (y - g.startY) * factor),
})
