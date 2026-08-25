/**
 * storyComposerUtils.ts
 *
 * Tipos, constantes e funções utilitárias/canvas extraídas do StoryComposer.tsx (L1–581).
 * Nenhuma dependência de estado ou hooks React — todas as funções são puras.
 */

import { safeString } from '@/utils/guards'
import { calculateTotalVolume as canonicalCalculateTotalVolume, formatMinutesLabel } from '@/utils/report/formatters'
import { estimateCaloriesMet, MET_LIGHT, DEFAULT_BODY_WEIGHT_KG } from '@/utils/calories/metEstimate'
import { type StoryTemplate, DEFAULT_STORY_TEMPLATE, storyFont } from '@/components/stories/storyTemplates'
import { drawCustomTextLayer } from '@/components/stories/customText'

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

/**
 * Os layouts oferecidos ao usuário.
 *
 * Eram sete até 25/08/2026. Saíram **Topo**, **LIVE** e **Grupo** (decisão do
 * dono) quando o HORÁRIO passou a ser independente do layout, como a marca:
 *
 *  - `live` existia para arrastar as peças. Com marca, legenda e horário já
 *    arrastáveis em qualquer layout, ele deixou de ser um layout e virou uma
 *    duplicata dos outros com as posições soltas.
 *  - `group` usava a mesma engine do `live` — a mesma duplicata, com outro nome.
 *  - `top-row` era o único que o dono não usava, e competia com o `bottom-row`
 *    sem oferecer decisão diferente.
 *
 * Quatro opções, cada uma com um propósito distinto: onde os cards ficam
 * (embaixo, à direita, à esquerda) ou a tabela de exercícios.
 *
 * ⚠️ Quem tiver um layout antigo em memória cai no fallback de
 * `renderStoryFrame` (`STORY_LAYOUTS.some(...) ? layout : 'bottom-row'`) — por
 * isso remover daqui é seguro, e por isso esse fallback não pode sumir.
 */
export const STORY_LAYOUTS: LayoutOption[] = [
    { id: 'bottom-row', label: 'Normal' },
    { id: 'right-stack', label: 'Direita' },
    { id: 'left-stack', label: 'Esquerda' },
    { id: 'workout', label: 'Treino' },
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

/**
 * Duração no card do story.
 *
 * Abaixo de 1 h DELEGA ao `formatMinutesLabel` (fonte única): este arquivo
 * usava `Math.floor`, então um treino de 114 s saía como "1min" no story
 * enquanto o resumo do histórico dizia "2 min" e o relatório, "1.9 min" — o
 * mesmo treino com quatro números diferentes, visto no simulador em 09/08/2026.
 *
 * A faixa de horas fica aqui porque é específica deste card, onde "125 min"
 * não cabe nem se lê: acima de 1 h vira "2h 5min".
 */
export const formatDuration = (totalSeconds: unknown): string => {
    const sec = Number(totalSeconds) || 0;
    if (sec <= 0) return '0 min';
    const h = Math.floor(sec / 3600);
    if (h > 0) {
        const m = Math.round((sec % 3600) / 60);
        return `${h}h ${m}min`;
    }
    return formatMinutesLabel(sec);
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
    brandOffset,
    brandScale,
    timeOffset,
    customText,
    customTextOffset,
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
    /** Zoom/reposicionamento do conteúdo (pinça + arrasto) — vale para todos os layouts. */
    workoutTransform?: { scale: number; offsetX: number; offsetY: number };
    /** Posição própria da marca (IRON·TRACKS) — imune ao zoom/pan do bloco. */
    brandOffset?: { x: number; y: number };
    /**
     * Deslocamento próprio do HORÁRIO, mesmo contrato do `brandOffset`.
     * Independente do layout e imune ao zoom/pan do bloco.
     */
    timeOffset?: { x: number; y: number };
    /** Escala própria da marca (pinça sobre o logo). */
    brandScale?: number;
    /** Legenda livre do usuário, na tipografia do template. */
    customText?: string;
    /** Posição própria da legenda (arrastável). */
    customTextOffset?: { x: number; y: number };
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

    // Zoom/reposição do conteúdo (pinça + arrasto) — vale para TODOS os layouts.
    // Só o CONTEÚDO transforma: fundo (foto/gradiente) e overlay acima ficam fixos.
    // Pivô no centro do canvas pra o zoom crescer/encolher "no lugar".
    // ⚠️ Todo caminho de saída desta função precisa do `restore` correspondente
    // (há um `return` antecipado no bloco live/group e outro no workout).
    const wt = workoutTransform ?? { scale: 1, offsetX: 0, offsetY: 0 };
    const wtApplied = wt.scale !== 1 || wt.offsetX !== 0 || wt.offsetY !== 0;
    // Offset SÓ da marca (aplicado dentro do transform geral, nos blocos de brand).
    const bOff = clampBrandOffset(brandOffset);
    const tOff = clampBrandOffset(timeOffset);
    if (wtApplied) {
        ctx.save();
        ctx.translate(wt.offsetX, wt.offsetY);
        const pivotX = canvasW / 2;
        const pivotY = canvasH / 2;
        ctx.translate(pivotX, pivotY);
        ctx.scale(wt.scale, wt.scale);
        ctx.translate(-pivotX, -pivotY);
    }

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
        if (wtApplied) ctx.restore();
        return;
    }

    // ── Layout "Treino do Dia" — tabela de exercícios (Exercício/Reps/Peso/RPE) ─
    if (layoutId === 'workout') {
        const rows = Array.isArray(metrics?.exercises) ? metrics.exercises : [];

        // Brand
        ctx.textBaseline = 'top';
        const bY = SAFE_TOP + 14;
        const bSize = 48;
        ctx.save();
        // Marca em espaço próprio: desfaz o zoom/pan do bloco e aplica só o
        // offset dela (independência total do resto do story).
        enterBrandSpace(ctx, wt, bOff, brandScale);
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
        // O horário vem DEPOIS do restore: ele é independente do zoom/pan do
        // bloco, como a marca. Antes deste ponto, este caminho retornava sem
        // desenhar horário nenhum — o layout "Treino" saía sem ele.
        drawTimePill(ctx, { C, f, right, safeBottomY, offset: tOff });
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
    // Marca em espaço próprio: desfaz o zoom/pan do bloco e aplica só o offset
    // dela (independência total do resto do story).
    enterBrandSpace(ctx, wt, bOff, brandScale);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = C.brandPrimary;
    // IRONTRACKS: uma palavra. Duas cores, zero separador — ver a nota no topo
    // de `storyTemplates.ts`. Este caminho já foi o único que inseria ' · ',
    // enquanto live/group/workout desenhavam junto: a mesma marca, escrita de
    // dois jeitos conforme o layout.
    ctx.fillText('IRON', left, brandY);
    const ironW = ctx.measureText('IRON').width;
    ctx.fillStyle = C.brandAccent;
    ctx.fillText('TRACKS', left + ironW, brandY);
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

    // O horário é INDEPENDENTE do layout, como a marca — ver `drawTimePill`.
    drawTimePill(ctx, { C, f, right, safeBottomY, offset: tOff });

    if (wtApplied) ctx.restore();

    // Legenda do usuário POR ÚLTIMO: é o que ele acabou de escrever e posicionar,
    // então nada do template pode cobri-la. Em espaço próprio (desfaz o zoom/pan do
    // bloco), como a marca — ver customText.ts.
    drawCustomTextLayer(ctx, template, String(customText ?? ''), customTextOffset);
};

/**
 * A pílula do HORÁRIO — desenhada em TODOS os layouts, com posição própria.
 *
 * Até 25/08/2026 ela morava no fim do caminho padrão de `renderStoryFrame`, e
 * os layouts que retornavam antes (`workout`, e os extintos `live`/`group`)
 * simplesmente não tinham horário. Ou seja: um elemento da peça aparecia ou
 * sumia conforme uma escolha que nada tem a ver com ele. Relato do dono, que
 * pediu o horário "independente do layout, igual o IRONTRACKS".
 *
 * O `offset` é o mesmo contrato da marca (`brandOffset`): deslocamento em
 * pixels de canvas a partir da âncora, arrastado pelo usuário e imune ao
 * zoom/pan do bloco — por isso o desenho acontece FORA de qualquer transform
 * do bloco, com `save`/`restore` próprios.
 */
export function drawTimePill(
    ctx: CanvasRenderingContext2D,
    opts: {
        C: { timeFill: string; timeBorder: string; timeText: string }
        f: (weight: string, size: number, style?: 'italic' | 'normal') => string
        right: number
        safeBottomY: number
        offset?: Offset | null
    },
): void {
    const { C, f, right, safeBottomY } = opts
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

    // Âncora: canto inferior direito, centrada na faixa segura de baixo. O
    // offset do usuário parte daqui, então "sem arrastar" continua sendo
    // exatamente onde a pílula sempre esteve.
    const off = clampBrandOffset(opts.offset)
    const pillX = right - pillW + off.x
    const pillY = safeBottomY + (SAFE_BOTTOM - pillH) / 2 + off.y

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
}

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

// ── Marca (IRON·TRACKS) 100% independente do bloco ───────────────────────────
// O arrasto/zoom geral move e redimensiona o bloco (título, cards, tabela). A
// marca NÃO entra nisso: vive em espaço próprio, com posição própria e tamanho
// fixo. Antes o offset dela era aplicado DENTRO do transform geral, então
// encolher os dados encolhia a marca junto — não era independência de verdade.
export type Offset = { x: number; y: number }
export const NO_OFFSET: Offset = { x: 0, y: 0 }

/** Âncora da marca no canvas (mesma origem usada pelos renderers). */
export const BRAND_BASE_X = SAFE_SIDE
export const BRAND_BASE_Y = SAFE_TOP + 18

/** Corpo da fonte da marca — o mesmo `brandFontSize` usado ao desenhar. */
export const BRAND_FONT_SIZE = 54

/**
 * Caixa REAL ocupada pela marca no canvas, medida com a mesma fonte do desenho.
 *
 * Existe porque a alça de arrasto usava 380×66 chumbado, e a caixa tracejada
 * aparecia deslocada do logo (print do dono, 03/08/2026). A largura do
 * "IRONTRACKS" depende da fonte do template — que varia peso, família e itálico
 * —, então nenhum número fixo acerta em todos. (O separador `brandDivider` saiu
 * em 25/08/2026: a marca é uma palavra só.)
 *
 * A mesma caixa também decide, no overlay de gesto, se a pinça é da MARCA ou do
 * bloco — daí ela precisar ser fiel, e não aproximada.
 *
 * Mede num canvas offscreen. Sem canvas disponível (SSR), cai num tamanho
 * conservador em vez de lançar.
 */
/** Folga em px de CANVAS entre a tinta do logo e o traçado da alça. */
const BRAND_BOX_PAD = 8

export const measureBrandBox = (
    template: { fonts: { family: string; brandWeight: string; brandStyle?: 'italic' | 'normal' } },
    scale = 1,
): { w: number; h: number; dx: number; dy: number } => {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1
    // Sem canvas (SSR/jsdom): números conservadores, com o mesmo formato.
    const fallback = {
        w: (380 + BRAND_BOX_PAD * 2) * s,
        h: (BRAND_FONT_SIZE + BRAND_BOX_PAD * 2) * s,
        dx: -BRAND_BOX_PAD * s,
        dy: -BRAND_BOX_PAD * s,
    }
    try {
        if (typeof document === 'undefined') return fallback
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return fallback

        const F = template.fonts
        const style = F.brandStyle ?? 'normal'
        // MESMO baseline do desenho: as métricas abaixo são relativas a ele.
        ctx.textBaseline = 'top'
        ctx.font = storyFont(F.family, F.brandWeight, BRAND_FONT_SIZE, style)
        const iron = ctx.measureText('IRON')
        const tracks = ctx.measureText('TRACKS')

        const inkW = iron.width + tracks.width
        if (!Number.isFinite(inkW) || inkW <= 0) return fallback

        /**
         * Caixa VERTICAL da tinta, não da em-box da fonte.
         *
         * Com `textBaseline = 'top'` o ponto de desenho é o topo da em-box, e as
         * MAIÚSCULAS começam bem abaixo dele — o gap do ascender. Usar a âncora
         * como topo da caixa deixava uma sobra visível acima do logo, que foi
         * exatamente o desalinhamento que sobrou depois da primeira correção.
         *
         * Pela spec, `actualBoundingBoxAscent` é positivo PARA CIMA a partir da
         * linha do baseline corrente; com baseline 'top' a tinta fica abaixo dela,
         * então o valor vem negativo e `-ascent` é a distância até o topo da tinta.
         */
        const ascent = Math.max(
            Number(iron.actualBoundingBoxAscent) || 0,
            Number(tracks.actualBoundingBoxAscent) || 0,
        )
        const descent = Math.max(
            Number(iron.actualBoundingBoxDescent) || 0,
            Number(tracks.actualBoundingBoxDescent) || 0,
        )
        const inkTop = -ascent
        const inkH = ascent + descent

        // Métricas ausentes (navegador antigo) → altura pela em-box, como antes.
        const usableH = Number.isFinite(inkH) && inkH > 0 ? inkH : BRAND_FONT_SIZE
        const usableTop = Number.isFinite(inkTop) ? inkTop : 0

        return {
            w: (inkW + BRAND_BOX_PAD * 2) * s,
            h: (usableH + BRAND_BOX_PAD * 2) * s,
            // Deslocamento da ÂNCORA até o canto superior esquerdo do traçado.
            dx: -BRAND_BOX_PAD * s,
            dy: (usableTop - BRAND_BOX_PAD) * s,
        }
    } catch {
        return fallback
    }
}

export const clampBrandOffset = (o: Offset | null | undefined): Offset => ({
    x: clampWorkoutOffset(Number(o?.x) || 0),
    y: clampWorkoutOffset(Number(o?.y) || 0),
})

/**
 * Faixa da escala PRÓPRIA da marca. Teto menor que o do bloco: a marca é assinatura,
 * não conteúdo — passar disso ela invade o story em vez de assinar. Piso em 0,5 para
 * continuar legível e clicável.
 */
export const BRAND_SCALE_MIN = 0.5
export const BRAND_SCALE_MAX = 2.5
export const clampBrandScale = (s: number | null | undefined): number => {
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return 1
    return Math.min(BRAND_SCALE_MAX, Math.max(BRAND_SCALE_MIN, n))
}

/**
 * Distância (px de CANVAS) em que o arrasto passa a grudar no eixo central.
 *
 * 14px num canvas de 720 ≈ 2% do lado — perto o bastante para o dedo alcançar sem
 * mirar, longe o bastante para não capturar quem quer parar ali do lado.
 */
export const BRAND_SNAP_THRESHOLD = 14

export interface BrandSnapResult {
    offset: Offset
    /** Centro da marca grudado no eixo VERTICAL do canvas (linha em pé). */
    snappedX: boolean
    /** Centro da marca grudado no eixo HORIZONTAL do canvas (linha deitada). */
    snappedY: boolean
}

/**
 * Guias de alinhamento no arrasto da marca — o comportamento do Instagram Stories:
 * ao cruzar o centro, o elemento GRUDA e uma linha aparece confirmando.
 *
 * Sem o snap a linha seria decorativa: acertar o centro exato com o dedo, num canvas
 * exibido a menos da metade do tamanho, é questão de sorte — o usuário pararia
 * sempre 1-2px fora e o guia ficaria piscando.
 *
 * Trabalha com o CENTRO da caixa da tinta (não com a âncora), que é o que o olho
 * usa para julgar se algo está centralizado.
 */
export const snapBrandToCenter = (
    offset: Offset | null | undefined,
    box: { w: number; h: number; dx: number; dy: number },
    threshold = BRAND_SNAP_THRESHOLD,
    /** Âncora do elemento. A legenda do usuário tem a sua — ver customText.ts. */
    baseX = BRAND_BASE_X,
    baseY = BRAND_BASE_Y,
): BrandSnapResult => {
    const o = clampBrandOffset(offset)
    const t = Number.isFinite(threshold) && threshold > 0 ? threshold : BRAND_SNAP_THRESHOLD

    const centerX = baseX + o.x + box.dx + box.w / 2
    const centerY = baseY + o.y + box.dy + box.h / 2
    const targetX = CANVAS_W / 2
    const targetY = CANVAS_H / 2

    const snappedX = Math.abs(centerX - targetX) <= t
    const snappedY = Math.abs(centerY - targetY) <= t

    return {
        offset: clampBrandOffset({
            x: snappedX ? o.x + (targetX - centerX) : o.x,
            y: snappedY ? o.y + (targetY - centerY) : o.y,
        }),
        snappedX,
        snappedY,
    }
}

export interface BlockSnapResult {
    offsetX: number
    offsetY: number
    /** Bloco no eixo horizontal original — mostra a linha vertical central. */
    snappedX: boolean
    /** Bloco na altura original do template. Sem linha: ver comentário abaixo. */
    snappedY: boolean
}

/**
 * Guias do arrasto do BLOCO (título + cards) — a "parte de baixo" do story.
 *
 * O snap da marca não valia aqui: ela é arrastada pela própria alça, o bloco pelo
 * overlay de gesto. Por isso as linhas só apareciam no IRONTRACKS (relato do dono,
 * 03/08/2026).
 *
 * Aqui o alvo é o offset ZERO, não o centro do canvas — e a diferença importa. O
 * bloco não tem uma caixa estável para medir: cada layout (normal, direita, topo…)
 * desenha título e cards em coordenadas próprias, e derivar o centro de cada um
 * seria frágil e quebraria a cada ajuste de layout. Já o offset zero é, por
 * construção, o alinhamento que o template define — e nele o bloco fica simétrico
 * entre as margens seguras, ou seja, horizontalmente CENTRADO.
 *
 * Por isso `snappedX` acende a linha vertical central: ela é de fato o eixo do
 * conteúdo. `snappedY` gruda na altura original mas NÃO acende linha horizontal —
 * a altura de repouso do bloco fica na parte de baixo do story, não no meio, e
 * desenhar a linha central ali apontaria para um alinhamento que não existe.
 */
export const snapWorkoutOffset = (
    offsetX: number,
    offsetY: number,
    threshold = BRAND_SNAP_THRESHOLD,
): BlockSnapResult => {
    const t = Number.isFinite(threshold) && threshold > 0 ? threshold : BRAND_SNAP_THRESHOLD
    const x = Number.isFinite(offsetX) ? offsetX : 0
    const y = Number.isFinite(offsetY) ? offsetY : 0

    const snappedX = Math.abs(x) <= t
    const snappedY = Math.abs(y) <= t

    return {
        offsetX: snappedX ? 0 : x,
        offsetY: snappedY ? 0 : y,
        snappedX,
        snappedY,
    }
}

/**
 * O ponto (em px de TELA) caiu sobre a marca?
 *
 * Decide de quem é o gesto de pinça: da marca ou do bloco. Sem isso, pinçar o logo
 * escalava o story inteiro — a caixa da marca é pequena, o segundo dedo cai fora
 * dela, e o overlay de gesto assumia o comando (print do dono, 03/08/2026).
 *
 * Usa a caixa MEDIDA (`measureBrandBox`), a mesma do traçado da alça: se as duas
 * divergirem, o usuário vê um alvo e acerta outro.
 */
export const isPointOverBrand = (
    clientX: number,
    clientY: number,
    rect: DOMRect | null | undefined,
    template: { fonts: { family: string; brandWeight: string; brandStyle?: 'italic' | 'normal' } } | null | undefined,
    brandOffset: Offset | null | undefined,
    brandScale?: number | null,
): boolean => {
    if (!rect || rect.width <= 0 || rect.height <= 0 || !template) return false
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    // Tela → canvas.
    const cx = (clientX - rect.left) * scaleX
    const cy = (clientY - rect.top) * scaleY

    const b = clampBrandOffset(brandOffset)
    const box = measureBrandBox(template, clampBrandScale(brandScale))
    // `dx`/`dy` são o mesmo deslocamento que a alça usa: o alvo do gesto e o
    // traçado que o usuário vê PRECISAM ser o mesmo retângulo, senão ele mira num
    // lugar e acerta outro.
    const x0 = BRAND_BASE_X + b.x + box.dx
    const y0 = BRAND_BASE_Y + b.y + box.dy
    return cx >= x0 && cx <= x0 + box.w && cy >= y0 && cy <= y0 + box.h
}

/**
 * Onde a alça da marca cai no preview (fração 0..1 do lado). NÃO depende do
 * zoom/pan geral — a marca não é afetada por eles.
 */

// ── Horário: medida e alça (espelha o contrato da MARCA) ─────────────────────

/**
 * Tamanho e âncora da pílula do horário, em px de canvas.
 *
 * Diferente da marca, a pílula NÃO muda com o template: fonte, corpo e padding
 * são fixos em `drawTimePill`. O que varia é a largura do texto — "09:01" e
 * "23:47" não medem igual —, então a caixa é MEDIDA, não chutada. A alça e o
 * hit-test do gesto usam este mesmo retângulo: divergir faz o usuário mirar
 * num lugar e acertar outro (lição da alça da marca, 03/08/2026).
 */
export function measureTimePillBox(): { w: number; h: number; x: number; y: number } {
    const fontSize = 32
    const padX = 18
    const padY = 10
    const h = fontSize + padY * 2
    const fallbackW = 150

    let textW = 0
    try {
        if (typeof document !== 'undefined') {
            const ctx = document.createElement('canvas').getContext('2d')
            if (ctx) {
                ctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`
                const now = new Date()
                textW = ctx.measureText(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })).width
            }
        }
    } catch {
        // jsdom não implementa measureText de verdade — cai no fallback, que é
        // suficiente para o teste e nunca é usado no aparelho.
    }

    const w = (Number.isFinite(textW) && textW > 0 ? textW : fallbackW - padX * 2) + padX * 2
    return {
        w,
        h,
        // Âncora: canto inferior direito, dentro da faixa segura de baixo — a
        // mesma conta de `drawTimePill`, para alça e desenho não discordarem.
        x: CANVAS_W - SAFE_SIDE - w,
        y: CANVAS_H - SAFE_BOTTOM + (SAFE_BOTTOM - h) / 2,
    }
}

/** Posição da alça do horário em % do canvas, já com o offset do usuário. */
export const timeHandlePct = (timeOffset: Offset | null | undefined): Offset => {
    const t = clampBrandOffset(timeOffset)
    const box = measureTimePillBox()
    return { x: (box.x + t.x) / CANVAS_W, y: (box.y + t.y) / CANVAS_H }
}

/** O ponto (px de tela) caiu sobre a pílula do horário? */
export const isPointOverTime = (
    px: number,
    py: number,
    rect: DOMRect | null,
    timeOffset: Offset | null | undefined,
): boolean => {
    if (!rect || rect.width <= 0) return false
    const t = clampBrandOffset(timeOffset)
    const box = measureTimePillBox()
    const fx = rect.width / CANVAS_W
    const fy = rect.height / CANVAS_H
    const x0 = rect.left + (box.x + t.x) * fx
    const y0 = rect.top + (box.y + t.y) * fy
    return px >= x0 && px <= x0 + box.w * fx && py >= y0 && py <= y0 + box.h * fy
}

export const brandHandlePct = (brandOffset: Offset | null | undefined): Offset => {
    const b = clampBrandOffset(brandOffset)
    return {
        x: (BRAND_BASE_X + b.x) / CANVAS_W,
        y: (BRAND_BASE_Y + b.y) / CANVAS_H,
    }
}

/** Arrasto da alça: px de tela → px de canvas (só o fator de exibição). */
export const dragToBrandOffset = (
    start: Offset,
    dxScreen: number,
    dyScreen: number,
    factor: number,
): Offset => clampBrandOffset({
    x: (Number(start?.x) || 0) + (Number(dxScreen) || 0) * factor,
    y: (Number(start?.y) || 0) + (Number(dyScreen) || 0) * factor,
})

/**
 * Põe o ctx em ESPAÇO DA MARCA: desfaz o transform geral (zoom + pan do bloco)
 * e aplica só o offset próprio da marca. Chamar logo após o `ctx.save()` do
 * bloco da marca — o `ctx.restore()` correspondente devolve o transform geral.
 *
 * Desfazer é o ponto todo: os renderers desenham a marca já dentro do transform
 * do bloco, então sem a inversa o zoom dos dados encolhe/estica a marca junto.
 * A inversa de `T(off)·P·S·P⁻¹` é `P·S⁻¹·P⁻¹·T(-off)` — nesta ordem de chamadas.
 */
export const enterBrandSpace = (
    ctx: CanvasRenderingContext2D,
    workoutTransform: { scale: number; offsetX: number; offsetY: number } | null | undefined,
    brandOffset: Offset | null | undefined,
    brandScale?: number | null,
): void => {
    const s = clampWorkoutScale(Number(workoutTransform?.scale) || 1)
    const offX = Number(workoutTransform?.offsetX) || 0
    const offY = Number(workoutTransform?.offsetY) || 0
    const pivotX = CANVAS_W / 2
    const pivotY = CANVAS_H / 2
    if (s !== 1) {
        ctx.translate(pivotX, pivotY)
        ctx.scale(1 / s, 1 / s)
        ctx.translate(-pivotX, -pivotY)
    }
    if (offX !== 0 || offY !== 0) ctx.translate(-offX, -offY)
    const b = clampBrandOffset(brandOffset)
    if (b.x !== 0 || b.y !== 0) ctx.translate(b.x, b.y)

    // Escala PRÓPRIA da marca, com pivô na âncora dela (canto superior esquerdo do
    // logo) para que crescer não a arraste para fora da área segura. Aplicada por
    // último, depois de desfazer o transform do bloco: é o que permite pinçar a
    // marca sem mexer no resto. (pedido do dono, 03/08/2026 — antes a pinça sobre o
    // logo escalava todas as peças)
    const bs = clampBrandScale(brandScale)
    if (bs !== 1) {
        ctx.translate(BRAND_BASE_X, BRAND_BASE_Y)
        ctx.scale(bs, bs)
        ctx.translate(-BRAND_BASE_X, -BRAND_BASE_Y)
    }
}
