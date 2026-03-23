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
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
         role="dialog" aria-modal="true" aria-label="AssessmentHistory">
            <div
                className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden"
                style={{
                    background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)',
                    borderColor: 'rgba(234,179,8,0.12)',
                    boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center relative" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80">Histórico de Avaliações</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-xl border flex items-center justify-center text-neutral-500 hover:text-white hover:border-yellow-500/40 transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
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
                                className="rounded-xl border p-3 transition-all"
                                style={{
                                    background: 'rgba(255,255,255,0.02)',
                                    borderColor: isOpen ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)',
                                }}
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
                                            className="min-h-[44px] px-4 py-2 rounded-xl border text-yellow-500 hover:text-yellow-400 font-black hover:border-yellow-500/40 transition-all duration-300 active:scale-95"
                                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
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
                                            } as import('@/types/assessment').AssessmentFormData}
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
                                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-yellow-500/60 mb-2">Dobras Cutâneas (mm)</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {skinfoldFields.map(({ key, label }) => {
                                                        const value = getSkinfoldMm(a, key);
                                                        return (
                                                            <div key={key} className="flex justify-between">
                                                                <span className="text-neutral-500">{label}:</span>
                                                                <span className="font-bold text-white">
                                                                    {value == null ? '-' : String(value)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-yellow-500/60 mb-2">Circunferências (cm)</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {measurementFields.map(({ key, label }) => {
                                                        const value = getMeasurementCm(a, key);
                                                        return (
                                                            <div key={key} className="flex justify-between">
                                                                <span className="text-neutral-500">{label}:</span>
                                                                <span className="font-bold text-white">
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
