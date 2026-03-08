/**
 * @module assessmentChartData
 *
 * Pure utility functions for building chart.js datasets from AssessmentRow[].
 * Extracted from AssessmentHistory.tsx to reduce component complexity.
 */

import {
    AssessmentRow,
    isRecord,
    getWeightKg,
    getBodyFatPercent,
    getFatMassKg,
    getLeanMassKg,
    getMeasurementCm,
    getSum7Mm,
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

// ── Chart data builders ─────────────────────────────────────────────────────

export interface AssessmentChartData {
    bodyComposition: { labels: string[]; datasets: unknown[] };
    weightProgress: { labels: string[]; datasets: unknown[] };
    measurements: { labels: string[]; datasets: unknown[] };
}

export function buildAssessmentChartData(sortedAssessments: AssessmentRow[]): AssessmentChartData {
    const labels = sortedAssessments.map(assessment => {
        const rawDate = assessment?.date ?? assessment?.assessment_date;
        const date = new Date(typeof rawDate === 'string' || typeof rawDate === 'number' || rawDate instanceof Date ? rawDate : String(rawDate ?? ''));
        return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
    });

    return {
        bodyComposition: {
            labels,
            datasets: [
                {
                    label: '% Gordura',
                    data: sortedAssessments.map(getBodyFatPercent),
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4,
                },
                {
                    label: 'Massa Magra (kg)',
                    data: sortedAssessments.map(getLeanMassKg),
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    fill: true,
                    tension: 0.4,
                },
                {
                    label: 'Massa Gorda (kg)',
                    data: sortedAssessments.map(getFatMassKg),
                    borderColor: 'rgb(245, 158, 11)',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true,
                    tension: 0.4,
                },
            ],
        },
        weightProgress: {
            labels,
            datasets: [
                {
                    label: 'Peso (kg)',
                    data: sortedAssessments.map(getWeightKg),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                },
            ],
        },
        measurements: {
            labels,
            datasets: [
                { label: 'Braço (cm)', data: sortedAssessments.map(a => getMeasurementCm(a, 'arm')), backgroundColor: 'rgba(168, 85, 247, 0.8)' },
                { label: 'Peito (cm)', data: sortedAssessments.map(a => getMeasurementCm(a, 'chest')), backgroundColor: 'rgba(59, 130, 246, 0.8)' },
                { label: 'Cintura (cm)', data: sortedAssessments.map(a => getMeasurementCm(a, 'waist')), backgroundColor: 'rgba(236, 72, 153, 0.8)' },
                { label: 'Quadril (cm)', data: sortedAssessments.map(a => getMeasurementCm(a, 'hip')), backgroundColor: 'rgba(14, 165, 233, 0.8)' },
                { label: 'Coxa (cm)', data: sortedAssessments.map(a => getMeasurementCm(a, 'thigh')), backgroundColor: 'rgba(34, 197, 94, 0.8)' },
                { label: 'Panturrilha (cm)', data: sortedAssessments.map(a => getMeasurementCm(a, 'calf')), backgroundColor: 'rgba(251, 191, 36, 0.8)' },
                { label: 'Dobras Soma (mm)', data: sortedAssessments.map(getSum7Mm), backgroundColor: 'rgba(245, 158, 11, 0.8)' },
            ],
        },
    };
}

export function checkChartHasData(chartData: AssessmentChartData): { bodyComposition: boolean; weightProgress: boolean; measurements: boolean } {
    const hasNumber = (data: unknown): boolean => {
        return Array.isArray(data) && data.some((v: unknown) => typeof v === 'number' && Number.isFinite(v));
    };

    const hasDatasetNumbers = (datasets: unknown): boolean => {
        return Array.isArray(datasets) && datasets.some((ds: unknown) => hasNumber(isRecord(ds) ? (ds as Record<string, unknown>).data : null));
    };

    return {
        bodyComposition: hasDatasetNumbers(chartData?.bodyComposition?.datasets),
        weightProgress: hasDatasetNumbers(chartData?.weightProgress?.datasets),
        measurements: hasDatasetNumbers(chartData?.measurements?.datasets),
    };
}

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
