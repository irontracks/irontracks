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
      <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
          <div className="absolute top-3 right-3">
            <button
              onClick={() => setShowForm(false)}
              className="p-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
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
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Avaliações Físicas</h3>
          <TrendingUp className="w-6 h-6 text-blue-500" />
        </div>
        <p className="text-gray-600 mb-4">
          Gerencie as avaliações físicas e acompanhe a evolução do aluno
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleNewAssessment}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Avaliação
          </button>
          <button
            onClick={handleViewHistory}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
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
          className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          title="Nova Avaliação"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={handleViewHistory}
          className="p-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
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
        className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        <Plus className="w-4 h-4 mr-2" />
        Nova Avaliação
      </button>
      <button
        onClick={handleViewHistory}
        className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <FileText className="w-4 h-4 mr-2" />
        Histórico
      </button>
    </div>
  );
}
