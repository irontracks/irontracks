/**
 * storyComposerUtils.ts
 *
 * Tipos, constantes e funções utilitárias/canvas extraídas do StoryComposer.tsx (L1–581).
 * Nenhuma dependência de estado ou hooks React — todas as funções são puras.
 */

import { safeString } from '@/utils/guards'

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

export interface Metrics {
    title: string;
    date: string;
    volume: number;
    totalTime: number;
    kcal: number;
    teamCount: number;
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
    { id: 'live', label: 'LIVE' },
];

export const DEFAULT_LIVE_POSITIONS: LivePositions = {
    brand: { x: 0.083, y: 0.14 },
    title: { x: 0.083, y: 0.245 },
    subtitle: { x: 0.083, y: 0.365 },
    cardVolume: { x: 0.083, y: 0.66 },
    cardTempo: { x: 0.37, y: 0.66 },
    cardKcal: { x: 0.657, y: 0.66 },
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

export const parseExt = (rawName: string): string => {
    const n = safeString(rawName).toLowerCase();
    const i = n.lastIndexOf('.');
    if (i < 0) return '';
    const ext = n.slice(i);
    return ['.jpeg', '.jpg', '.png', '.mp4', '.mov', '.webm'].includes(ext) ? ext : '';
};

export const extFromMime = (mime: string): string => {
    const t = safeString(mime).toLowerCase();
    if (t === 'image/png') return '.png';
    if (t === 'image/jpeg') return '.jpg';
    if (t === 'video/mp4') return '.mp4';
    if (t === 'video/quicktime') return '.mov';
    if (t === 'video/webm') return '.webm';
    return '';
};

export const guessMediaKind = (mime: string, ext: string): 'video' | 'image' | 'unknown' => {
    const t = safeString(mime).toLowerCase();
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('image/')) return 'image';
    const e = safeString(ext).toLowerCase();
    if (['.mp4', '.mov', '.webm'].includes(e)) return 'video';
    if (['.jpg', '.jpeg', '.png'].includes(e)) return 'image';
    return 'unknown';
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

export const calculateTotalVolume = (logs: Record<string, unknown>): number => {
    try {
        let total = 0;
        Object.values(logs).forEach((log: unknown) => {
            const l = log && typeof log === 'object' ? (log as Record<string, unknown>) : {};
            const w = Number(String(l?.weight ?? '').replace(',', '.'));
            const r = Number(String(l?.reps ?? '').replace(',', '.'));
            if (Number.isFinite(w) && w > 0 && Number.isFinite(r) && r > 0) {
                total += w * r;
            }
        });
        return total;
    } catch {
        return 0;
    }
};

export const computeKcal = ({
    session,
    volume,
}: {
    session: SessionLite;
    volume: number;
}): number => {
    try {
        const existing = Number(session?.calories) || Number(session?.kcal);
        if (Number.isFinite(existing) && existing > 0) return Math.round(existing);

        const durationMin = (Number(session?.totalTime) || 0) / 60;
        if (durationMin <= 0) return 0;

        let k = durationMin * 4;
        if (volume > 0) {
            k += volume * 0.01;
        }
        return Math.round(k);
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
}: {
    ctx: CanvasRenderingContext2D | null;
    metrics: Metrics;
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

        const left = SAFE_SIDE;
        const right = CANVAS_W - SAFE_SIDE;
        const title = safeString(metrics?.title).toUpperCase();
        const words = title.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let line = '';

        ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
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
            ctx.font = 'italic 900 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
            const ironW = ctx.measureText('IRON').width;
            const tracksW = ctx.measureText('TRACKS').width;
            return ironW + tracksW;
        })();
        const brandH = 56;

        const titleW = (() => {
            ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
            return Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
        })();
        const titleH = lines.length * 40;

        const subtitleW = (() => {
            ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
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
}) => {
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
            g.addColorStop(0, '#0a0a0a');
            g.addColorStop(1, '#111827');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, canvasW, canvasH);
        }
    }

    // Gradient Overlay
    const baseOverlay = ctx.createLinearGradient(0, canvasH * 0.35, 0, canvasH);
    baseOverlay.addColorStop(0, 'rgba(0,0,0,0)');
    baseOverlay.addColorStop(1, 'rgba(0,0,0,0.78)');
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
        ctx.font = '900 24px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        const padX = 18;
        const padY = 12;
        const textW = ctx.measureText(label).width;
        const w = Math.ceil(textW + padX * 2);
        const h = 46;
        const x = Math.max(left, right - w);
        const y = SAFE_TOP;
        drawRoundedRect(ctx, x, y, w, h, 18);
        ctx.fillStyle = 'rgba(250,204,21,0.16)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(250,204,21,0.28)';
        ctx.stroke();
        ctx.fillStyle = '#facc15';
        ctx.fillText(label, x + padX, y + padY);
        ctx.restore();
    }

    const gap = 18;
    const cardH = 130;

    // Helper to draw card
    const drawCard = (
        box: { x: number; y: number; w: number; h: number },
        card: { label: string; value: string },
    ) => {
        drawRoundedRect(ctx, box.x, box.y, box.w, box.h, 24);
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '800 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.textBaseline = 'top';
        const labelW = ctx.measureText(card.label).width;
        const labelX = box.x + (box.w - labelW) / 2;
        ctx.fillText(card.label, labelX, box.y + 24);

        ctx.fillStyle = '#ffffff';
        let valFont = 48;
        ctx.font = `800 ${valFont}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        let valW = ctx.measureText(card.value).width;
        while (valW > box.w - 20 && valFont > 24) {
            valFont -= 2;
            ctx.font = `800 ${valFont}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
            valW = ctx.measureText(card.value).width;
        }
        const valX = box.x + (box.w - valW) / 2;
        ctx.fillText(card.value, valX, box.y + 64);
    };

    const layoutId = STORY_LAYOUTS.some((l) => l.id === layout) ? layout : 'bottom-row';

    if (layoutId === 'live') {
        const safe =
            livePositions && typeof livePositions === 'object' ? livePositions : DEFAULT_LIVE_POSITIONS;
        const sizes = computeLiveSizes({ ctx, metrics });

        const brandPos = clampPctWithSize({ pos: safe.brand, size: sizes.brand });
        const titlePos = clampPctWithSize({ pos: safe.title, size: sizes.title });
        const subtitlePos = clampPctWithSize({ pos: safe.subtitle, size: sizes.subtitle });
        const cardVolumePos = clampPctWithSize({ pos: safe.cardVolume, size: sizes.card });
        const cardTempoPos = clampPctWithSize({ pos: safe.cardTempo, size: sizes.card });
        const cardKcalPos = clampPctWithSize({ pos: safe.cardKcal, size: sizes.card });

        const brandX = brandPos.x * CANVAS_W;
        const brandY = brandPos.y * CANVAS_H;

        ctx.textBaseline = 'top';
        ctx.font = 'italic 900 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('IRON', brandX, brandY);
        const ironW = ctx.measureText('IRON').width;
        ctx.fillStyle = '#facc15';
        ctx.fillText('TRACKS', brandX + ironW, brandY);

        const titleX = titlePos.x * CANVAS_W;
        const titleY = titlePos.y * CANVAS_H;
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ; (sizes.titleLines ?? []).forEach((l, idx) => {
            ctx.fillText(l, titleX, titleY + idx * 40);
        });

        const subtitleX = subtitlePos.x * CANVAS_W;
        const subtitleY = subtitlePos.y * CANVAS_H;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
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

    // Standard Layouts
    ctx.textBaseline = 'top';

    const brandY = SAFE_TOP + 24;
    ctx.font = 'italic 900 56px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('IRON', left, brandY);
    const ironW = ctx.measureText('IRON').width;
    ctx.fillStyle = '#facc15';
    ctx.fillText('TRACKS', left + ironW, brandY);

    const title = safeString(metrics?.title).toUpperCase();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';

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

    const cards = [
        {
            label: 'VOLUME',
            value: `${Math.round(Number(metrics?.volume) || 0).toLocaleString('pt-BR')} kg`,
        },
        { label: 'TEMPO', value: formatDuration(metrics?.totalTime) },
        { label: 'KCAL', value: String(metrics?.kcal || 0) },
    ];

    let titleY = 0;
    let subtitleY = 0;
    let cardsBoxes: { x: number; y: number; w: number; h: number }[] = [];

    if (layoutId === 'top-row') {
        titleY = Math.max(brandY + 92, SAFE_TOP + 130);
        subtitleY = titleY + lines.length * 40 + 12;
        const cardY = subtitleY + 56;
        const cardW = Math.floor((right - left - gap * 2) / 3);
        cardsBoxes = cards.map((_, idx) => ({
            x: left + idx * (cardW + gap),
            y: cardY,
            w: cardW,
            h: cardH,
        }));
    } else if (layoutId === 'right-stack' || layoutId === 'left-stack') {
        const stackW = 360;
        const x = layoutId === 'right-stack' ? right - stackW : left;
        const totalH = cardH * 3 + gap * 2;
        const cardY0 = safeBottomY - 24 - totalH;
        cardsBoxes = cards.map((_, idx) => ({
            x,
            y: cardY0 + idx * (cardH + gap),
            w: stackW,
            h: cardH,
        }));
        subtitleY = cardsBoxes[0].y - 56;
        titleY = Math.max(brandY + 92, subtitleY - 24 - lines.length * 40);
    } else {
        // bottom-row
        const cardY = safeBottomY - 24 - cardH;
        subtitleY = cardY - 56;
        titleY = Math.max(brandY + 92, subtitleY - 24 - lines.length * 40);
        const cardW = Math.floor((right - left - gap * 2) / 3);
        cardsBoxes = cards.map((_, idx) => ({
            x: left + idx * (cardW + gap),
            y: cardY,
            w: cardW,
            h: cardH,
        }));
    }

    lines.forEach((l, idx) => {
        ctx.fillText(l, left, titleY + idx * 40);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '800 34px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
    const dateText = metrics?.date ? `• ${metrics.date}` : '';
    ctx.fillText(`RELATÓRIO DO TREINO ${dateText}`.trim(), left, subtitleY);

    cards.forEach((c, idx) => drawCard(cardsBoxes[idx], c));
};
