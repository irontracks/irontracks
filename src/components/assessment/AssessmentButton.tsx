"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, TrendingUp, X } from 'lucide-react';
import { AssessmentForm } from './AssessmentForm';

interface AssessmentButtonProps {
  studentId: string;
  studentName: string;
  variant?: 'button' | 'card' | 'icon';
  className?: string;
}

export default function AssessmentButton({ 
  studentId, 
  studentName, 
  variant = 'button',
  className = '' 
}: AssessmentButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  const handleNewAssessment = () => {
    setShowForm(true);
  };

  const handleViewHistory = () => {
    router.push(`/assessments/${studentId}`);
  };

  const handleAssessmentComplete = () => {
    setShowForm(false);
    // Recarregar a página ou atualizar os dados
    window.location.reload();
  };

  if (showForm) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 pt-20" onClick={() => setShowForm(false)}>
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 max-w-4xl w-full max-h-[90vh] overflow-y-auto relative custom-scrollbar" onClick={(e) => e.stopPropagation()}>
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={() => setShowForm(false)}
              className="p-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <AssessmentForm
            studentId={studentId}
            studentName={studentName}
            onSuccess={handleAssessmentComplete}
            onCancel={() => setShowForm(false)}
          />
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`bg-neutral-800 rounded-xl border border-neutral-700 p-6 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Avaliações Físicas</h3>
          <TrendingUp className="w-6 h-6 text-yellow-500" />
        </div>
        <p className="text-neutral-400 mb-4">
          Gerencie as avaliações físicas e acompanhe a evolução do aluno
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleNewAssessment}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Avaliação
          </button>
          <button
            onClick={handleViewHistory}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-neutral-900 text-neutral-300 rounded-xl border border-neutral-700 hover:bg-neutral-800 transition-colors"
          >
            <FileText className="w-4 h-4 mr-2" />
            Ver Histórico
          </button>
        </div>
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <div className={`flex gap-2 ${className}`}>
        <button
          onClick={handleNewAssessment}
          className="p-2 bg-yellow-500 text-black rounded-xl hover:bg-yellow-400 transition-colors"
          title="Nova Avaliação"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={handleViewHistory}
          className="p-2 bg-neutral-900 text-neutral-300 rounded-xl border border-neutral-700 hover:bg-neutral-800 transition-colors"
          title="Ver Histórico"
        >
          <FileText className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${className}`}>
      <button
        onClick={handleNewAssessment}
        className="inline-flex items-center px-4 py-2 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 transition-colors"
      >
        <Plus className="w-4 h-4 mr-2" />
        Nova Avaliação
      </button>
      <button
        onClick={handleViewHistory}
        className="inline-flex items-center px-4 py-2 bg-neutral-900 text-neutral-300 rounded-xl border border-neutral-700 hover:bg-neutral-800 transition-colors"
      >
        <FileText className="w-4 h-4 mr-2" />
        Histórico
      </button>
    </div>
  );
}
