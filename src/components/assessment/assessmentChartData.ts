/**
 * @module assessmentChartData
 *
 * Pure utility functions for building chart.js datasets from AssessmentRow[].
 * Produces professional, readable charts with smart Y-axis scaling and
 * separated chart groups for clarity.
 */

import {
    AssessmentRow,
    isRecord,
    getWeightKg,
    getBodyFatPercent,
    getFatMassKg,
    getLeanMassKg,
    getMeasurementCm,
} from './assessmentUtils';

// ── Date formatting helpers ─────────────────────────────────────────────────

export function formatAssessmentDate(rawDate: unknown, options?: Intl.DateTimeFormatOptions): string {
    if (!rawDate) return '-';
    const date = new Date(typeof rawDate === 'string' || typeof rawDate === 'number' || rawDate instanceof Date ? rawDate : String(rawDate));
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR', options);
}

export function formatDateCompact(rawDate: unknown): string {
    return formatAssessmentDate(rawDate, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatWeekdayCompact(rawDate: unknown): string {
    return formatAssessmentDate(rawDate, { weekday: 'long' });
}

export function safeGender(raw: unknown): 'M' | 'F' {
    return raw === 'F' || raw === 'M' ? raw : 'M';
}

// ── Progress calculation ────────────────────────────────────────────────────

export function getProgress(currentRaw: unknown, previousRaw: unknown): { change: number; percentage: number } | null {
    if (currentRaw === null || currentRaw === undefined) return null;
    if (previousRaw === null || previousRaw === undefined) return null;
    const current = Number(currentRaw);
    const previous = Number(previousRaw);
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
    const change = current - previous;
    const percentage = (change / previous) * 100;
    if (!Number.isFinite(percentage)) return null;
    return { change, percentage };
}

// ── Smart scale helpers ─────────────────────────────────────────────────────

function getSmartBounds(values: (number | null)[], marginPct = 0.15): { suggestedMin: number; suggestedMax: number } {
    const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (valid.length === 0) return { suggestedMin: 0, suggestedMax: 100 };

    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || max * 0.1 || 10;
    const margin = range * marginPct;

    return {
        suggestedMin: Math.max(0, Math.floor((min - margin) / 5) * 5),
        suggestedMax: Math.ceil((max + margin) / 5) * 5,
    };
}

function getAllValues(datasets: { data: (number | null)[] }[]): (number | null)[] {
    return datasets.flatMap(ds => ds.data);
}

// ── Chart option builders ───────────────────────────────────────────────────

const GRID_COLOR = 'rgba(255, 255, 255, 0.04)';
const TICK_COLOR = 'rgba(255, 255, 255, 0.55)';
const FONT_FAMILY = "'Inter', 'system-ui', sans-serif";

function buildLineOptions(title: string, unit: string, datasets: { data: (number | null)[] }[]): Record<string, unknown> {
    const bounds = getSmartBounds(getAllValues(datasets));
    return {
        responsive: true,
        maintainAspectRatio: false,
        spanGaps: true,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
            legend: {
                position: 'bottom' as const,
                labels: {
                    color: TICK_COLOR,
                    font: { family: FONT_FAMILY, size: 11, weight: '700' as const },
                    usePointStyle: true,
                    pointStyle: 'circle' as const,
                    padding: 20,
                    boxWidth: 8,
                    boxHeight: 8,
                },
            },
            title: { display: false },
            tooltip: {
                backgroundColor: 'rgba(8, 8, 8, 0.97)',
                titleColor: '#fbbf24',
                titleFont: { family: FONT_FAMILY, size: 12, weight: '800' as const },
                bodyColor: 'rgba(255,255,255,0.8)',
                bodyFont: { family: FONT_FAMILY, size: 12, weight: '500' as const },
                borderColor: 'rgba(251,191,36,0.2)',
                borderWidth: 1,
                padding: { x: 14, y: 10 },
                cornerRadius: 12,
                displayColors: true,
                callbacks: {
                    label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
                        const label = ctx.dataset.label || '';
                        const value = ctx.parsed.y;
                        if (value == null) return `${label}: -`;
                        return `  ${label}: ${value.toFixed(1)} ${unit}`;
                    },
                },
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 10, weight: '600' as const } },
            },
            y: {
                suggestedMin: bounds.suggestedMin,
                suggestedMax: bounds.suggestedMax,
                grid: { color: GRID_COLOR, drawBorder: false },
                ticks: {
                    color: TICK_COLOR,
                    font: { family: FONT_FAMILY, size: 10, weight: '600' as const },
                    callback: (value: number) => `${value}${unit === '%' ? '%' : ''}`,
                },
            },
        },
        elements: {
            point: { radius: 5, hoverRadius: 9, borderWidth: 2.5, backgroundColor: '#060606', hoverBorderWidth: 3 },
            line: { borderWidth: 3, borderCapStyle: 'round' as const, borderJoinStyle: 'round' as const },
        },
    };
}

function buildBarOptions(title: string, datasets: { data: (number | null)[] }[]): Record<string, unknown> {
    const bounds = getSmartBounds(getAllValues(datasets), 0.1);
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
            legend: {
                position: 'bottom' as const,
                labels: {
                    color: TICK_COLOR,
                    font: { family: FONT_FAMILY, size: 11, weight: '600' as const },
                    usePointStyle: true,
                    pointStyle: 'rectRounded' as const,
                    padding: 14,
                },
            },
            title: { display: false },
            tooltip: {
                backgroundColor: 'rgba(10, 10, 10, 0.95)',
                titleColor: '#facc15',
                titleFont: { family: FONT_FAMILY, size: 12, weight: '700' as const },
                bodyColor: '#e5e5e5',
                bodyFont: { family: FONT_FAMILY, size: 12 },
                borderColor: 'rgba(255, 255, 255, 0.08)',
                borderWidth: 1,
                padding: { x: 12, y: 8 },
                cornerRadius: 10,
                callbacks: {
                    label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
                        const label = ctx.dataset.label || '';
                        const value = ctx.parsed.y;
                        if (value == null) return `${label}: -`;
                        return `${label}: ${value.toFixed(1)} cm`;
                    },
                },
            },
        },
        datasets: {
            bar: { maxBarThickness: 22, borderSkipped: false },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: TICK_COLOR,
                    font: { family: FONT_FAMILY, size: 10, weight: '600' as const },
                    maxRotation: 45,
                    minRotation: 45,
                },
            },
            y: {
                suggestedMin: bounds.suggestedMin,
                suggestedMax: bounds.suggestedMax,
                grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 10, weight: '600' as const } },
            },
        },
    };
}

// ── Chart data builders ─────────────────────────────────────────────────────

export interface AssessmentChartData {
    /** Weight + Lean Mass (kg scale) */
    weightLeanMass: { labels: string[]; datasets: { label: string; data: (number | null)[]; borderColor: string; backgroundColor: string; fill: boolean; tension: number }[] };
    /** Body Fat % (% scale) */
    bodyFatPercent: { labels: string[]; datasets: { label: string; data: (number | null)[]; borderColor: string; backgroundColor: string; fill: boolean; tension: number }[] };
    /** Trunk circumferences: Chest, Waist, Hip */
    trunkMeasurements: { labels: string[]; datasets: { label: string; data: (number | null)[]; backgroundColor: string; borderColor: string; borderWidth: number; borderRadius: number }[] };
    /** Limb circumferences: Arm, Thigh, Calf */
    limbMeasurements: { labels: string[]; datasets: { label: string; data: (number | null)[]; backgroundColor: string; borderColor: string; borderWidth: number; borderRadius: number }[] };
}

// Número máximo de avaliações exibidas nos gráficos de barra — evita
// superlotação do eixo X em mobile com muitos registros históricos.
const CHART_BAR_LIMIT = 6;

export function buildAssessmentChartData(sortedAssessments: AssessmentRow[]): AssessmentChartData {
    const makeLabel = (assessment: AssessmentRow) => {
        const rawDate = assessment?.date ?? assessment?.assessment_date;
        const date = new Date(typeof rawDate === 'string' || typeof rawDate === 'number' || rawDate instanceof Date ? rawDate : String(rawDate ?? ''));
        return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    };

    const labels = sortedAssessments.map(makeLabel);

    // Barras: apenas as N mais recentes para não sobrecarregar o eixo X
    const barAssessments = sortedAssessments.slice(-CHART_BAR_LIMIT);
    const barLabels = barAssessments.map(makeLabel);

    return {
        weightLeanMass: {
            labels,
            datasets: [
                {
                    label: 'Peso (kg)',
                    data: sortedAssessments.map(getWeightKg),
                    borderColor: '#fbbf24',
                    backgroundColor: 'rgba(251,191,36,0.12)',
                    fill: true,
                    tension: 0.4,
                },
                {
                    label: 'Massa Magra (kg)',
                    data: sortedAssessments.map(getLeanMassKg),
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74,222,128,0.1)',
                    fill: true,
                    tension: 0.4,
                },
            ],
        },
        bodyFatPercent: {
            labels,
            datasets: [
                {
                    label: '% Gordura',
                    data: sortedAssessments.map(getBodyFatPercent),
                    borderColor: '#f43f5e',
                    backgroundColor: 'rgba(244,63,94,0.1)',
                    fill: true,
                    tension: 0.4,
                },
                {
                    label: 'Massa Gorda (kg)',
                    data: sortedAssessments.map(getFatMassKg),
                    borderColor: '#fb923c',
                    backgroundColor: 'rgba(251,146,60,0.08)',
                    fill: false,
                    tension: 0.4,
                },
            ],
        },
        trunkMeasurements: {
            labels: barLabels,
            datasets: [
                { label: 'Peito', data: barAssessments.map(a => getMeasurementCm(a, 'chest')), backgroundColor: 'rgba(96,165,250,0.85)', borderColor: 'rgba(96,165,250,1)', borderWidth: 1.5, borderRadius: 10 },
                { label: 'Cintura', data: barAssessments.map(a => getMeasurementCm(a, 'waist')), backgroundColor: 'rgba(244,114,182,0.85)', borderColor: 'rgba(244,114,182,1)', borderWidth: 1.5, borderRadius: 10 },
                { label: 'Quadril', data: barAssessments.map(a => getMeasurementCm(a, 'hip')), backgroundColor: 'rgba(56,189,248,0.85)', borderColor: 'rgba(56,189,248,1)', borderWidth: 1.5, borderRadius: 10 },
            ],
        },
        limbMeasurements: {
            labels: barLabels,
            datasets: [
                { label: 'Braço', data: barAssessments.map(a => getMeasurementCm(a, 'arm')), backgroundColor: 'rgba(192,132,252,0.85)', borderColor: 'rgba(192,132,252,1)', borderWidth: 1.5, borderRadius: 10 },
                { label: 'Coxa', data: barAssessments.map(a => getMeasurementCm(a, 'thigh')), backgroundColor: 'rgba(52,211,153,0.85)', borderColor: 'rgba(52,211,153,1)', borderWidth: 1.5, borderRadius: 10 },
                { label: 'Panturrilha', data: barAssessments.map(a => getMeasurementCm(a, 'calf')), backgroundColor: 'rgba(252,211,77,0.85)', borderColor: 'rgba(252,211,77,1)', borderWidth: 1.5, borderRadius: 10 },
            ],
        },
    };
}

export function checkChartHasData(chartData: AssessmentChartData): {
    weightLeanMass: boolean;
    bodyFatPercent: boolean;
    trunkMeasurements: boolean;
    limbMeasurements: boolean;
} {
    const hasNumber = (data: unknown): boolean => {
        return Array.isArray(data) && data.some((v: unknown) => typeof v === 'number' && Number.isFinite(v));
    };

    const hasDatasetNumbers = (datasets: unknown): boolean => {
        return Array.isArray(datasets) && datasets.some((ds: unknown) => hasNumber(isRecord(ds) ? (ds as Record<string, unknown>).data : null));
    };

    return {
        weightLeanMass: hasDatasetNumbers(chartData?.weightLeanMass?.datasets),
        bodyFatPercent: hasDatasetNumbers(chartData?.bodyFatPercent?.datasets),
        trunkMeasurements: hasDatasetNumbers(chartData?.trunkMeasurements?.datasets),
        limbMeasurements: hasDatasetNumbers(chartData?.limbMeasurements?.datasets),
    };
}

// ── Chart options exports ───────────────────────────────────────────────────

export function buildChartOptions(chartData: AssessmentChartData) {
    return {
        weightLeanMass: buildLineOptions('Peso × Massa Magra', 'kg', chartData.weightLeanMass.datasets),
        bodyFatPercent: buildLineOptions('Gordura Corporal', '%', chartData.bodyFatPercent.datasets),
        trunkMeasurements: buildBarOptions('Tronco', chartData.trunkMeasurements.datasets),
        limbMeasurements: buildBarOptions('Membros', chartData.limbMeasurements.datasets),
    };
}

/** @deprecated Use buildChartOptions() instead — kept for backwards compat */
export const CHART_OPTIONS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { position: 'top' as const },
        title: { display: false, text: '' },
    },
    scales: {
        y: { beginAtZero: true },
    },
};
