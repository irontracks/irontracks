"use client";
import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, TrendingUp, X, Upload } from 'lucide-react';
import { AssessmentForm } from './AssessmentForm';
import { logError, logWarn, logInfo } from '@/lib/logger'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleNewAssessment = () => {
    router.push(`/assessments/new/${studentId}`);
  };

  const handleViewHistory = () => {
    router.push(`/assessments/${studentId}`);
  };

  const handleAssessmentComplete = () => {
    setShowForm(false);
    // Recarregar a página ou atualizar os dados
    window.location.reload();
  };

  const handleImportClick = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.click();
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      let parsed: unknown;

      parsed = parseJsonWithSchema(text, z.record(z.unknown()));
      if (!parsed) {
        logError('error', "Erro ao parsear JSON de avaliação", new Error('invalid_json'));
        if (typeof window !== "undefined") {
          window.alert("Arquivo JSON inválido. Verifique o conteúdo exportado.");
        }
        return;
      }

      if (!parsed || typeof parsed !== "object") {
        if (typeof window !== "undefined") {
          window.alert("Formato de arquivo não reconhecido para avaliação.");
        }
        return;
      }

      const payload = parsed as Record<string, unknown>;
      const importedForm = payload.formData || payload;
      if (!importedForm || typeof importedForm !== "object") {
        if (typeof window !== "undefined") {
          window.alert("JSON não contém dados de avaliação válidos.");
        }
        return;
      }

      const hasCoreField =
        "weight" in importedForm ||
        "height" in importedForm ||
        "assessment_date" in importedForm;

      if (!hasCoreField) {
        if (typeof window !== "undefined") {
          window.alert("JSON não parece ser uma avaliação física exportada.");
        }
        return;
      }

      if (typeof window !== "undefined") {
        try {
          const storageKey = `assessment_import_${studentId}`;
          window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
        } catch (error) {
          logError('error', "Erro ao salvar avaliação importada na sessão", error);
          window.alert("Não foi possível preparar os dados importados. Tente novamente.");
          return;
        }
      }

      router.push(`/assessments/new/${studentId}`);
    } catch (error) {
      logError('error', "Erro ao importar JSON de avaliação", error);
      if (typeof window !== "undefined") {
        window.alert("Falha ao importar arquivo JSON de avaliação.");
      }
    } finally {
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  if (showForm) {
    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 pt-20" role="button" tabIndex={-1} aria-label="Fechar avaliação" onClick={() => setShowForm(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowForm(false) }}>
        <div
          className="max-w-4xl w-full max-h-[90vh] overflow-y-auto relative custom-scrollbar rounded-2xl border shadow-2xl"
          style={{
            background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)',
            borderColor: 'rgba(234,179,8,0.12)',
            boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={() => setShowForm(false)}
              className="w-9 h-9 rounded-xl border flex items-center justify-center text-neutral-500 hover:text-white hover:border-yellow-500/40 transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
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
      <div
        className={`rounded-2xl border p-6 relative overflow-hidden ${className}`}
        style={{
          background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80">Avaliações Físicas</h3>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }}>
            <TrendingUp className="w-4 h-4 text-yellow-500" />
          </div>
        </div>
        <p className="text-neutral-500 text-sm mb-4">
          Gerencie as avaliações físicas e acompanhe a evolução do aluno
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleNewAssessment}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 font-black rounded-xl transition-all active:scale-95 btn-gold-animated"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Avaliação
          </button>
          <button
            onClick={handleViewHistory}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl border text-neutral-300 font-bold hover:text-white hover:border-yellow-500/30 transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <FileText className="w-4 h-4 mr-2" />
            Ver Histórico
          </button>
          <button
            onClick={handleImportClick}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-dashed text-neutral-400 hover:border-yellow-500/40 hover:text-yellow-500 transition-all active:scale-95"
            style={{ borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFileChange}
          />
        </div>
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <div className={`flex gap-2 ${className}`}>
        <button
          onClick={handleNewAssessment}
          className="p-2 rounded-xl transition-all active:scale-95 btn-gold-animated"
          title="Nova Avaliação"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={handleViewHistory}
          className="p-2 rounded-xl border text-neutral-400 hover:text-white hover:border-yellow-500/30 transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
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
        className="inline-flex items-center px-4 py-2.5 font-black rounded-xl transition-all active:scale-95 btn-gold-animated"
      >
        <Plus className="w-4 h-4 mr-2" />
        Nova Avaliação
      </button>
      <button
        onClick={handleViewHistory}
        className="inline-flex items-center px-4 py-2.5 rounded-xl border text-neutral-300 font-bold hover:text-white hover:border-yellow-500/30 transition-all active:scale-95"
        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <FileText className="w-4 h-4 mr-2" />
        Histórico
      </button>
    </div>
  );
}
