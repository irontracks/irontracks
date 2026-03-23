"use client";
import React from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Calendar, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { DialogProvider } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { AssessmentHeader } from '@/components/assessment/AssessmentHeader';
import { AssessmentSummaryCards } from '@/components/assessment/AssessmentSummaryCards';
import { AssessmentListItem, measurementFields, skinfoldFields } from '@/components/assessment/AssessmentListItem';
import { AssessmentPlanModal } from '@/components/assessment/AssessmentPlanModal';
import { AssessmentHistoryModal } from './AssessmentHistoryModal';
import { useAssessmentHistoryData } from '@/hooks/useAssessmentHistoryData';
import { X } from 'lucide-react';

import {
  getWeightKg,
  getBodyFatPercent,
  getLeanMassKg,
  getBmrKcal,
  getMeasurementCm,
  getSkinfoldMm,
} from './assessmentUtils';
import {
  formatDateCompact,
  safeGender,
  getProgress,
} from './assessmentChartData';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface AssessmentHistoryProps {
  studentId?: string;
  onClose?: () => void;
}

export default function AssessmentHistory({ studentId: propStudentId, onClose }: AssessmentHistoryProps) {
  const studentId = propStudentId;
  const router = useRouter();

  const {
    // Core data
    loading,
    error,
    studentName,
    sortedAssessments,
    latestAssessment,
    previousAssessment,
    assessments,

    // Workout sessions / TDEE
    workoutSessionsLoading,
    tdeeByAssessmentId,

    // Chart data
    chartData,
    chartHasData,
    chartOptions,

    // UI state
    showForm,
    setShowForm,
    showHistory,
    setShowHistory,
    selectedAssessment,
    setSelectedAssessment,
    editAssessmentId,
    setEditAssessmentId,
    deletingId,
    confirmDeleteId,
    setConfirmDeleteId,
    importing,

    // AI plan
    aiPlanByAssessmentId,
    planModalOpen,
    setPlanModalOpen,
    planModalAssessment,

    // Refs
    scanInputRef,
    planAnchorRefs,

    // Handlers
    handleDeleteAssessment,
    handleScanClick,
    handleScanFileChange,
    handleGenerateAssessmentPlan,
    handleOpenAssessmentPlanModal,
  } = useAssessmentHistoryData(studentId);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-yellow-500/30 border-t-yellow-500 animate-spin" />
          <p className="text-neutral-500 text-sm font-bold">Carregando histórico de avaliações...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl p-4 border" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <span className="text-red-400 font-bold">Erro ao carregar histórico:</span> <span className="text-red-300">{error}</span>
        </div>
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div className="p-4">
        <AssessmentHeader
          onCreate={() => studentId && router.push(`/assessments/new/${studentId}`)}
          onShowHistory={() => {}}
          onScan={handleScanClick}
          importing={importing}
          studentId={studentId}
          onClose={undefined}
          scanInputRef={scanInputRef}
          onScanFileChange={handleScanFileChange}
        />

        <div
          className="rounded-2xl border p-8 text-center"
          style={{
            background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)' }}>
            <TrendingUp className="w-8 h-8 text-yellow-500/60" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Nenhuma avaliação encontrada</h2>
          <p className="text-neutral-500 text-sm">Este aluno ainda não possui avaliações físicas registradas.</p>
        </div>
      </div>
    );
  }

  return (
    <DialogProvider>
      <GlobalDialog />
      <div className="p-4 text-white">
        <AssessmentHeader
          onCreate={() => setShowForm(true)}
          onShowHistory={() => setShowHistory(true)}
          onScan={handleScanClick}
          importing={importing}
          studentId={studentId}
          onClose={onClose}
          scanInputRef={scanInputRef}
          onScanFileChange={handleScanFileChange}
        />
        {latestAssessment && previousAssessment && (
          <AssessmentSummaryCards
            latestAssessment={latestAssessment}
            previousAssessment={previousAssessment}
            getWeightKg={getWeightKg}
            getBodyFatPercent={getBodyFatPercent}
            getLeanMassKg={getLeanMassKg}
            getBmrKcal={getBmrKcal}
            getProgress={getProgress}
          />
        )}

        {/* Charts — Separated for clarity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Weight × Lean Mass */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 mb-4">Peso × Massa Magra</h3>
            <div className="h-64">
              {chartHasData.weightLeanMass ? (
                <Line data={chartData.weightLeanMass} options={chartOptions.weightLeanMass as never} />
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
                  Sem dados de peso suficientes.
                </div>
              )}
            </div>
          </div>

          {/* Body Fat % */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 mb-4">Gordura Corporal</h3>
            <div className="h-64">
              {chartHasData.bodyFatPercent ? (
                <Line data={chartData.bodyFatPercent} options={chartOptions.bodyFatPercent as never} />
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
                  Sem dados de gordura corporal suficientes.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Measurements — Split into Trunk and Limbs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Trunk */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 mb-4">Circunferências — Tronco</h3>
            <div className="h-64">
              {chartHasData.trunkMeasurements ? (
                <Bar data={chartData.trunkMeasurements} options={chartOptions.trunkMeasurements as never} />
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
                  Sem dados de circunferências de tronco.
                </div>
              )}
            </div>
          </div>

          {/* Limbs */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 mb-4">Circunferências — Membros</h3>
            <div className="h-64">
              {chartHasData.limbMeasurements ? (
                <Bar data={chartData.limbMeasurements} options={chartOptions.limbMeasurements as never} />
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
                  Sem dados de circunferências de membros.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assessment List */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 flex items-center">
              <Calendar className="w-4 h-4 mr-2" />
              Histórico Completo
            </h3>
          </div>
          <div id="assessments-history" className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {sortedAssessments.map((assessment, idx) => (
              <AssessmentListItem
                key={String(assessment?.id ?? idx)}
                assessment={assessment}
                idx={idx}
                isSelected={selectedAssessment === String(assessment?.id ?? idx)}
                aiPlanState={aiPlanByAssessmentId[String(assessment.id)]}
                workoutSessionsLoading={workoutSessionsLoading}
                tdee={tdeeByAssessmentId.get(String(assessment.id))}
                deletingId={deletingId}
                confirmDeleteId={confirmDeleteId}
                onToggleDetails={(id) => setSelectedAssessment(selectedAssessment === id ? null : id)}
                onEdit={(id) => { setEditAssessmentId(id); setShowForm(true); }}
                onDelete={handleDeleteAssessment}
                onConfirmDelete={setConfirmDeleteId}
                onOpenPlanModal={handleOpenAssessmentPlanModal}
                setPlanAnchorRef={(id, el) => { try { planAnchorRefs.current[id] = el } catch {} }}
              />
            ))}
          </div>
        </div>

        {/* AI Plan Modal */}
        {planModalOpen && planModalAssessment ? (
          <AssessmentPlanModal
            assessment={planModalAssessment}
            planState={aiPlanByAssessmentId[String(planModalAssessment?.id || '')]}
            onClose={() => setPlanModalOpen(false)}
            onRegenerate={(a) => handleGenerateAssessmentPlan(a, { openDetails: false })}
          />
        ) : null}

        {/* Form Modal */}
        {showForm && (() => {
          const editData = (() => {
            if (!editAssessmentId) return null;
            const a = sortedAssessments.find(x => String(x?.id) === editAssessmentId);
            if (!a) return null;
            return {
              assessment_date: String(a.assessment_date ?? ''),
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
              observations: ''
            };
          })();

          return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={editAssessmentId ? 'Editar avaliação' : 'Nova avaliação'} onClick={() => { setShowForm(false); setEditAssessmentId(null); }}>
              <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                  <h3 className="font-bold text-white">{editAssessmentId ? 'Editar Avaliação' : 'Nova Avaliação'}</h3>
                  <button onClick={() => { setShowForm(false); setEditAssessmentId(null); }} className="p-2 hover:bg-neutral-800 rounded-full" aria-label="Fechar"><X className="w-5 h-5 text-neutral-400" /></button>
                </div>
                <div className="p-4 max-h-[80vh] overflow-y-auto bg-neutral-900">
                  <AssessmentForm
                    studentId={studentId!}
                    studentName={studentName}
                    initialData={editData}
                    onSuccess={() => { setShowForm(false); setEditAssessmentId(null); location.reload(); }}
                    onCancel={() => { setShowForm(false); setEditAssessmentId(null); }}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {showHistory && (
          <AssessmentHistoryModal
            assessments={sortedAssessments}
            selectedAssessment={selectedAssessment}
            setSelectedAssessment={setSelectedAssessment}
            measurementFields={measurementFields}
            skinfoldFields={skinfoldFields}
            studentName={studentName}
            formatDateCompact={formatDateCompact}
            safeGender={safeGender}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </DialogProvider>
  );
}
