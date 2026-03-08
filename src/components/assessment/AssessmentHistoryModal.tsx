'use client'
// Focus trap for accessibility
import { useFocusTrap } from '@/hooks/useFocusTrap';

import React from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';
import {
    AssessmentRow,
    getWeightKg,
    getBodyFatPercent,
    getMeasurementCm,
    getSkinfoldMm,
} from './assessmentUtils';

const AssessmentPDFGenerator = dynamic(
    () => import('@/components/assessment/AssessmentPDFGenerator'),
    { ssr: false },
);

interface MeasurementField {
    key: string;
    label: string;
}

interface AssessmentHistoryModalProps {
    assessments: AssessmentRow[];
    selectedAssessment: string | null;
    setSelectedAssessment: (id: string | null) => void;
    measurementFields: readonly MeasurementField[];
    skinfoldFields: readonly MeasurementField[];
    studentName: string;
    formatDateCompact: (raw: unknown) => string;
    safeGender: (raw: unknown) => 'M' | 'F';
    onClose: () => void;
}

/**
 * AssessmentHistoryModal
 *
 * Modal "Histórico de Avaliações" com lista de todas as avaliações passadas,
 * detalhes expandíveis (dobras e circunferências) e geração de PDF por avaliação.
 * Extraído de AssessmentHistory.tsx (L1617–1720). Toda a lógica de estado e
 * carregamento de dados permanece no componente pai.
 */
export function AssessmentHistoryModal({
    assessments,
    selectedAssessment,
    setSelectedAssessment,
    measurementFields,
    skinfoldFields,
    studentName,
    formatDateCompact,
    safeGender,
    onClose,
}: AssessmentHistoryModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
         role="dialog" aria-modal="true" aria-label="AssessmentHistory">
            <div
                className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                    <h3 className="font-bold text-white">Histórico de Avaliações</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-800 rounded-full"
                        aria-label="Fechar"
                    >
                        <X className="w-5 h-5 text-neutral-400" />
                    </button>
                </div>

                {/* List */}
                <div className="p-4 max-h-[80vh] overflow-y-auto space-y-3">
                    {assessments.map((a, idx) => {
                        const assessmentId = String(a?.id ?? idx);
                        const isOpen = selectedAssessment === assessmentId;

                        return (
                            <div
                                key={assessmentId}
                                className="bg-neutral-800 p-3 rounded-xl border border-neutral-700"
                            >
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                    {/* Date + summary */}
                                    <div>
                                        <div className="font-black text-white">
                                            {formatDateCompact(a.date || a.assessment_date)}
                                        </div>
                                        <div className="text-xs text-neutral-500">
                                            {(() => {
                                                const w = getWeightKg(a);
                                                const bf = getBodyFatPercent(a);
                                                const weightLabel = w ? `${w.toFixed(1)} kg` : '-';
                                                const bfLabel = bf ? `${bf.toFixed(1)}%` : '-';
                                                return `Peso ${weightLabel} • % Gordura ${bfLabel}`;
                                            })()}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedAssessment(isOpen ? null : assessmentId)}
                                            className="min-h-[44px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-yellow-500 hover:text-yellow-400 font-black hover:bg-neutral-800 transition-all duration-300 active:scale-95"
                                        >
                                            {isOpen ? 'Ocultar' : 'Detalhes'}
                                        </button>
                                        <AssessmentPDFGenerator
                                            formData={{
                                                assessment_date: String(a.assessment_date || ''),
                                                weight: String(a.weight || ''),
                                                height: String(a.height || ''),
                                                age: String(a.age || ''),
                                                gender: safeGender(a.gender),
                                                arm_circ: String(getMeasurementCm(a, 'arm') || ''),
                                                chest_circ: String(getMeasurementCm(a, 'chest') || ''),
                                                waist_circ: String(getMeasurementCm(a, 'waist') || ''),
                                                hip_circ: String(getMeasurementCm(a, 'hip') || ''),
                                                thigh_circ: String(getMeasurementCm(a, 'thigh') || ''),
                                                calf_circ: String(getMeasurementCm(a, 'calf') || ''),
                                                triceps_skinfold: String(getSkinfoldMm(a, 'triceps') || ''),
                                                biceps_skinfold: String(getSkinfoldMm(a, 'biceps') || ''),
                                                subscapular_skinfold: String(getSkinfoldMm(a, 'subscapular') || ''),
                                                suprailiac_skinfold: String(getSkinfoldMm(a, 'suprailiac') || ''),
                                                abdominal_skinfold: String(getSkinfoldMm(a, 'abdominal') || ''),
                                                thigh_skinfold: String(getSkinfoldMm(a, 'thigh') || ''),
                                                calf_skinfold: String(getSkinfoldMm(a, 'calf') || ''),
                                                observations: '',
                                            }}
                                            studentName={studentName}
                                            trainerName={String(a.trainer_name ?? '')}
                                            assessmentDate={new Date(
                                                typeof a.assessment_date === 'string' ||
                                                    typeof a.assessment_date === 'number' ||
                                                    a.assessment_date instanceof Date
                                                    ? a.assessment_date
                                                    // eslint-disable-next-line react-hooks/purity
                                                    : String(a.assessment_date ?? Date.now()),
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* Expanded details */}
                                {isOpen && (
                                    <div className="mt-3 pt-3 border-t border-neutral-700">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <h4 className="font-bold text-white mb-2">Dobras Cutâneas (mm)</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {skinfoldFields.map(({ key, label }) => {
                                                        const value = getSkinfoldMm(a, key);
                                                        return (
                                                            <div key={key} className="flex justify-between">
                                                                <span className="text-neutral-400">{label}:</span>
                                                                <span className="font-medium text-white">
                                                                    {value == null ? '-' : String(value)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white mb-2">Circunferências (cm)</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {measurementFields.map(({ key, label }) => {
                                                        const value = getMeasurementCm(a, key);
                                                        return (
                                                            <div key={key} className="flex justify-between">
                                                                <span className="text-neutral-400">{label}:</span>
                                                                <span className="font-medium text-white">
                                                                    {value == null ? '-' : String(value)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
