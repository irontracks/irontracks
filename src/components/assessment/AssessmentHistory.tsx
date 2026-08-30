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
import { Calendar, ChevronRight, Images, TrendingUp } from 'lucide-react';
import { useModalStore } from '@/lib/state/modalStore';
import { useRouter } from 'next/navigation';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import QuickBIAModal from '@/components/assessment/QuickBIAModal';
import { WeightTrendCard } from '@/components/assessment/WeightTrendCard';
import { DialogProvider } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { AssessmentHeader } from '@/components/assessment/AssessmentHeader';
import { AssessmentSummaryCards } from '@/components/assessment/AssessmentSummaryCards';
import { AssessmentListItem, measurementFields, skinfoldFields } from '@/components/assessment/AssessmentListItem';
import { AssessmentPlanModal } from '@/components/assessment/AssessmentPlanModal';
import { AssessmentHistoryModal } from './AssessmentHistoryModal';
import { BodyPhotoCaptureModal } from '@/components/body-photo/BodyPhotoCaptureModal';
import { BodyPhotoHistoryModal } from '@/components/body-photo/BodyPhotoHistoryModal';
import { LabExamsSection } from '@/components/lab-exams/LabExamsSection';
import { useAssessmentHistoryData } from '@/hooks/useAssessmentHistoryData';
import { ArrowLeft } from 'lucide-react';

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
  /**
   * O próprio aluno está vendo (aba Avaliações do app), não o professor
   * consultando um aluno em `/assessments/[studentId]`. Muda a voz do texto:
   * "você" em vez de "este aluno".
   */
  selfView?: boolean;
  onClose?: () => void;
}

/**
 * O `DialogProvider` envolve a tela INTEIRA, não só o caminho feliz.
 *
 * Ele ficava no `return` final, e os branches de carregando/erro/vazio saíam
 * sem provider. `LabExamsSection` renderiza também no estado VAZIO e passou a
 * usar `useDialog` para apagar exame — e `useDialog` LANÇA sem provider, o que
 * derrubaria a rota web `/assessments/[studentId]` justamente para quem ainda
 * não tem avaliação nenhuma. No dashboard não aparecia: lá já existe um
 * provider acima.
 */
export default function AssessmentHistory(props: AssessmentHistoryProps) {
  return (
    <DialogProvider>
      <GlobalDialog />
      <AssessmentHistoryInner {...props} />
    </DialogProvider>
  );
}

function AssessmentHistoryInner({ studentId: propStudentId, selfView = false, onClose }: AssessmentHistoryProps) {
  const studentId = propStudentId;
  const router = useRouter();
  const [quickBiaOpen, setQuickBiaOpen] = React.useState(false);
  const [photoModalOpen, setPhotoModalOpen] = React.useState(false);
  // O Diário de Progresso é montado no shell do dashboard (`DashboardModals`);
  // daqui só se pede a abertura, pelo mesmo store que o menu já usa.
  const setShowProgressPhotos = useModalStore((st) => st.setShowProgressPhotos);
  // Histórico dos laudos por foto — o laudo fica salvo no banco; sem esta tela
  // ele só existia enquanto o modal de captura estava aberto.
  const [photoHistoryOpen, setPhotoHistoryOpen] = React.useState(false);

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

    // AI plan
    aiPlanByAssessmentId,
    planModalOpen,
    setPlanModalOpen,
    planModalAssessment,

    // Refs
    planAnchorRefs,

    // Handlers
    handleDeleteAssessment,
    handleGenerateAssessmentPlan,
    handleOpenAssessmentPlanModal,
  } = useAssessmentHistoryData(studentId);

  // Gênero pro guia de pose do modal de foto. Melhor fonte disponível é a
  // última avaliação (profiles não tem gênero); cai em 'M' só quando o aluno
  // ainda não tem nenhuma avaliação salva.
  const poseGender = safeGender(latestAssessment?.gender);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-yellow-500/30 border-t-yellow-500 animate-spin" />
          <p className="text-neutral-400 text-sm font-bold">Carregando histórico de avaliações...</p>
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
          // Passava `undefined` explícito, o que jogava fora o `onClose` do pai
          // e fazia o botão cair no `history.back()` do navegador — na aba do
          // dashboard, que é ESTADO e não rota, o destino era o que estivesse
          // empilhado, não a tela de onde o usuário veio.
          onClose={onClose}
          onAddBia={studentId ? () => setQuickBiaOpen(true) : undefined}
          onPhotoAssessment={() => setPhotoModalOpen(true)}
          onPhotoHistory={() => setPhotoHistoryOpen(true)}
          // Sem nenhuma avaliação, o menu precisa nascer ABERTO: era o único
          // caminho para "+ Nova Avaliação", e ficava escondido atrás de um
          // título que não parece clicável — bem na tela de quem ainda não fez
          // nenhuma. Com histórico, o acordeão continua fechado (a lista é o
          // que importa ali).
          defaultOpen
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
          {/* Este texto dizia "Este aluno ainda não possui avaliações físicas
              registradas" — voz de professor numa tela que o próprio aluno abre
              pelo menu Avaliações. Ele lia sobre si mesmo na terceira pessoa.
              O componente serve aos dois contextos, então quem chama informa. */}
          <p className="text-neutral-400 text-sm">
            {selfView
              ? 'Registre sua primeira avaliação para acompanhar a evolução ao longo do tempo.'
              : 'Este aluno ainda não possui avaliações físicas registradas.'}
          </p>
        </div>

        {/* Exames Laboratoriais — acessível mesmo sem avaliação física prévia */}
        <LabExamsSection studentUserId={studentId ?? null} />

        <BodyPhotoCaptureModal
          open={photoModalOpen}
          onClose={() => setPhotoModalOpen(false)}
          studentUserId={studentId ?? null}
          gender={poseGender}
        />
        {photoHistoryOpen ? <BodyPhotoHistoryModal onClose={() => setPhotoHistoryOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <>
      <div className="p-4 text-white">
        <AssessmentHeader
          onCreate={() => setShowForm(true)}
          onShowHistory={() => setShowHistory(true)}
          onClose={onClose}
          onAddBia={studentId ? () => setQuickBiaOpen(true) : undefined}
          onPhotoAssessment={() => setPhotoModalOpen(true)}
          onPhotoHistory={() => setPhotoHistoryOpen(true)}
        />
        {latestAssessment && previousAssessment && (
          <AssessmentSummaryCards
            latestAssessment={latestAssessment}
            previousAssessment={previousAssessment}
            getWeightKg={getWeightKg}
            getBodyFatPercent={getBodyFatPercent}
            getLeanMassKg={getLeanMassKg}
            getBmrKcal={getBmrKcal}
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
            <div className="h-72">
              {chartHasData.weightLeanMass ? (
                <Line data={chartData.weightLeanMass} options={chartOptions.weightLeanMass as never} />
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
                  Sem dados de peso suficientes.
                </div>
              )}
            </div>
          </div>

          {/* Tendência de Peso (avaliações + check-ins de treino) */}
          <WeightTrendCard studentId={studentId ?? null} />

          {/* Diário de Progresso — fotos before/after.
              Ele existe, funciona e tinha ZERO uso: morava em Configurações ›
              Ferramentas, ao lado de "Novidades". Medido em 30/08/2026: a
              tabela `photos` estava vazia, enquanto 15 pessoas registravam peso
              no check-in (805 vezes). O interesse por acompanhar evolução
              existe — o lugar é que estava errado, e evolução corporal se
              procura AQUI, ao lado do peso e da gordura. */}
          <button
            type="button"
            onClick={() => setShowProgressPhotos(true)}
            // Sem gradiente inline: o guard `ctaDouradoFormas` congela por
            // teto POR ARQUIVO os gradientes escritos à mão, e ele só desce.
            // Um card novo não pode gastar essa cota — `bg-depth-2` é o token
            // da superfície e diz a mesma coisa.
            className="w-full rounded-2xl border border-white/[0.06] bg-depth-2 p-5 text-left transition-all hover:border-yellow-500/30 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10">
                  <Images size={18} className="text-yellow-500" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80">Diário de Progresso</h3>
                  <p className="mt-0.5 text-xs text-neutral-400">Fotos lado a lado, com comparador deslizável.</p>
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-neutral-500" aria-hidden="true" />
            </div>
          </button>

          {/* Body Fat % */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 mb-4">Gordura Corporal</h3>
            <div className="h-72">
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
            <div className="h-72">
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
            <div className="h-72">
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
            {/* Mais RECENTE primeiro (pedido do dono, ago/2026): quem abre o
                histórico quer ver a última avaliação, não rolar meses até o fim.
                `sortedAssessments` segue crescente porque os GRÁFICOS dependem
                disso (linha do tempo e `slice(-N)` das mais recentes) — a
                inversão é só da lista. */}
            {[...sortedAssessments].reverse().map((assessment, revIdx) => {
              // Índice na ordem cronológica, para achar a avaliação ANTERIOR.
              const idx = sortedAssessments.length - 1 - revIdx;
              // A anterior no TEMPO — base da variação exibida no card. Na lista
              // invertida ela é a próxima linha, mas o que importa é a data.
              // `prevInTime` e não `previousAssessment`: esse nome já existe no
              // escopo do componente (vem do hook) e o shadow confundiria.
              const prevInTime = idx > 0 ? sortedAssessments[idx - 1] ?? null : null;
              // Resolve a contraparte (full ↔ bia) para essa avaliação. O
              // pareamento é bidirecional: ambos os registros têm
              // paired_assessment_id apontando um pro outro. O lookup é em
              // memória (sem fetch), pois o histórico já carregou tudo.
              const pairedId = assessment?.paired_assessment_id
                ? String(assessment.paired_assessment_id)
                : null;
              const pairedAssessment = pairedId
                ? assessments.find((a) => String(a?.id) === pairedId) ?? null
                : null;
              return (
                <AssessmentListItem
                  key={String(assessment?.id ?? idx)}
                  assessment={assessment}
                  pairedAssessment={pairedAssessment}
                  previousAssessment={prevInTime}
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
              );
            })}
          </div>
        </div>

        {/* Exames Laboratoriais + protocolo integrado por IA (VIP) */}
        <LabExamsSection studentUserId={studentId ?? null} />

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
              pectoral_skinfold: String(getSkinfoldMm(a, 'pectoral') || ''),
              midaxillary_skinfold: String(getSkinfoldMm(a, 'midaxillary') || ''),
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
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              role="button"
              tabIndex={-1}
              aria-label={editAssessmentId ? 'Fechar edição de avaliação' : 'Fechar nova avaliação'}
              onClick={() => { setShowForm(false); setEditAssessmentId(null); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowForm(false); setEditAssessmentId(null); } }}
            >
              <div
                role="none"
                className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={editAssessmentId ? 'Editar avaliação' : 'Nova avaliação'}
              >
                <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                  <h3 className="font-bold text-white">{editAssessmentId ? 'Editar Avaliação' : 'Nova Avaliação'}</h3>
                  <button onClick={() => { setShowForm(false); setEditAssessmentId(null); }} className="p-2 hover:bg-neutral-800 rounded-full" aria-label="Voltar" title="Voltar"><ArrowLeft className="w-5 h-5 text-neutral-400" /></button>
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
        {/* Modal pra registrar bioimpedância standalone (PDF da farmácia).
            Só renderizamos quando há studentId — `onAddBia` no header
            também depende dele. Após salvar, a página recarrega pra puxar
            o novo registro com o pareamento já feito. */}
        {studentId && (
          <QuickBIAModal
            isOpen={quickBiaOpen}
            studentId={studentId}
            studentName={studentName}
            onClose={() => setQuickBiaOpen(false)}
            onSaved={() => { if (typeof window !== 'undefined') location.reload(); }}
          />
        )}
        {/* Avaliação por foto (laudo IA). studentUserId define self vs personal:
            o action compara com o usuário logado pra decidir trainer_id. */}
        <BodyPhotoCaptureModal
          open={photoModalOpen}
          onClose={() => setPhotoModalOpen(false)}
          studentUserId={studentId ?? null}
          gender={poseGender}
        />
        {photoHistoryOpen ? <BodyPhotoHistoryModal onClose={() => setPhotoHistoryOpen(false)} /> : null}
      </div>
    </>
  );
}
