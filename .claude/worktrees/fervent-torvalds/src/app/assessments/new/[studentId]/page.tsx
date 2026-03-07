"use client";
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DialogProvider } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { BackButton } from '@/components/ui/BackButton';

export default function NewAssessmentPage() {
  const router = useRouter();
  const params = useParams<{ studentId?: string | string[] }>();
  const rawStudentId = params?.studentId;
  const studentId = Array.isArray(rawStudentId)
    ? rawStudentId[0]
    : rawStudentId;
  const studentName = 'Aluno';

  if (!studentId) {
    return (
      <DialogProvider>
        <GlobalDialog />
        <div className="min-h-screen bg-neutral-900 text-white p-4 flex items-center justify-center">
          <div className="bg-neutral-800 rounded-2xl border border-red-500/40 px-6 py-5 max-w-md w-full text-center">
            <h3 className="text-red-400 font-bold mb-2">Erro na Avaliação</h3>
            <p className="text-sm text-neutral-300 mb-4">
              Não foi possível identificar o aluno para esta avaliação física.
            </p>
            <BackButton className="bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 w-full" />
          </div>
        </div>
      </DialogProvider>
    );
  }
  return (
    <DialogProvider>
      <GlobalDialog />
      <div className="min-h-screen bg-neutral-900 text-white p-4">
        <div className="max-w-5xl mx-auto bg-neutral-800 rounded-2xl border border-neutral-700">
          <div className="p-4 border-b border-neutral-700 flex justify-between items-center">
            <h3 className="font-bold">Nova Avaliação</h3>
            <BackButton className="bg-neutral-900 border border-neutral-700 hover:bg-neutral-800" />
          </div>
          <div className="p-4">
            <AssessmentForm
              studentId={studentId}
              studentName={studentName}
              onSuccess={() => router.back()}
              onCancel={() => router.back()}
            />
          </div>
        </div>
      </div>
    </DialogProvider>
  );
}
