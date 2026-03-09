'use client';

import React from 'react';
import AssessmentButton from '@/components/assessment/AssessmentButton';
import { useAdminPanel } from './AdminPanelContext';
import type { UnknownRecord } from '@/types/app';

export function StudentEvolutionTab() {
    const { selectedStudent, assessments } = useAdminPanel();

    if (!selectedStudent) return null;

    return (
        <div className="space-y-4">
            <AssessmentButton
                studentId={String(selectedStudent.user_id || selectedStudent.id || '')}
                studentName={String(selectedStudent.name || '')}
                variant="card"
            />
            {assessments.length > 0 && (
                <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
                    <h4 className="font-bold text-white mb-3">Avaliações Anteriores</h4>
                    {assessments.map((a) => (
                        <div
                            key={String((a as UnknownRecord)?.id ?? '')}
                            className="flex justify-between items-center py-2 border-b border-neutral-700 last:border-0"
                        >
                            <span className="text-neutral-400">
                                {(a as UnknownRecord)?.date ? new Date(String((a as UnknownRecord).date)).toLocaleDateString() : '—'}
                            </span>
                            <div className="text-right">
                                <span className="block font-bold text-white">{String((a as UnknownRecord)?.bf ?? '')}% Gordura</span>
                                <span className="text-xs text-neutral-500">{String((a as UnknownRecord)?.weight ?? '')}kg</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
