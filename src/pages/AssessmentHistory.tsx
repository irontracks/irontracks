"use client";
import React, { useEffect, useState, useMemo } from 'react';
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
import { Download, TrendingUp, Calendar, User, Calculator } from 'lucide-react';
import { useAssessment } from '@/hooks/useAssessment';
import AssessmentPDFGenerator from '@/components/assessment/AssessmentPDFGenerator';

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
}

export default function AssessmentHistory({ studentId: propStudentId }: AssessmentHistoryProps) {
  const studentId = propStudentId ? String(propStudentId) : '';
  const { getStudentAssessments } = useAssessment();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!studentId) {
          if (mounted) {
            setAssessments([]);
            setError('ID do aluno não fornecido.');
            setLoading(false);
          }
          return;
        }
        setLoading(true);
        const list = await getStudentAssessments(studentId);
        if (mounted) setAssessments(list);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Erro ao carregar avaliações');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [studentId, getStudentAssessments]);

  const sortedAssessments = useMemo(() => {
    return [...(assessments || [])].sort((a, b) =>
      new Date(a.date || a.assessment_date).getTime() - new Date(b.date || b.assessment_date).getTime()
    );
  }, [assessments]);

  const chartData = useMemo(() => {
    const labels = sortedAssessments.map(assessment =>
      new Date(assessment.date || assessment.assessment_date).toLocaleDateString('pt-BR')
    );

    return {
      bodyComposition: {
        labels,
        datasets: [
          {
            label: '% Gordura',
            data: sortedAssessments.map(a => a.body_fat_percentage ?? a.bf ?? 0),
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Massa Magra (kg)',
            data: sortedAssessments.map(a => {
              const bf = Number(a.body_fat_percentage ?? a.bf ?? 0);
              const w = Number(a.weight ?? 0);
              return w > 0 ? w * (1 - bf / 100) : 0;
            }),
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      weightProgress: {
        labels,
        datasets: [
          {
            label: 'Peso (kg)',
            data: sortedAssessments.map(a => a.weight ?? 0),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      measurements: {
        labels,
        datasets: [
          {
            label: 'Braço (cm)',
            data: sortedAssessments.map(a => a.arm || a.measurements?.arm || 0),
            backgroundColor: 'rgba(168, 85, 247, 0.8)'
          },
          {
            label: 'Cintura (cm)',
            data: sortedAssessments.map(a => a.waist || a.measurements?.waist || 0),
            backgroundColor: 'rgba(236, 72, 153, 0.8)'
          },
          {
            label: 'Dobras Soma (mm)',
            data: sortedAssessments.map(a => a.sum7 || a.measurements?.sum7 || 0),
            backgroundColor: 'rgba(245, 158, 11, 0.8)'
          },
          {
            label: '—',
            data: sortedAssessments.map(() => 0),
            backgroundColor: 'rgba(34, 197, 94, 0.8)'
          }
        ]
      }
    };
  }, [sortedAssessments]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Evolução da Composição Corporal'
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  const latestAssessment = sortedAssessments[sortedAssessments.length - 1];
  const previousAssessment = sortedAssessments[sortedAssessments.length - 2];

  const getProgress = (current: number, previous: number) => {
    if (!previous) return null;
    const change = current - previous;
    const percentage = ((change / previous) * 100).toFixed(1);
    return { change, percentage };
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center bg-neutral-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-neutral-400">Carregando histórico de avaliações...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-neutral-900">
        <div className="bg-red-900/20 border border-red-500/40 rounded-xl p-4 text-red-400">
          Erro ao carregar histórico: {error}
        </div>
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div className="p-6 bg-neutral-900">
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-8 text-center">
          <TrendingUp className="w-16 h-16 text-neutral-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Nenhuma avaliação encontrada</h2>
          <p className="text-neutral-400">Este aluno ainda não possui avaliações físicas registradas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-neutral-900 text-white">
      {/* Cabeçalho escuro com ações */}
      <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <User className="w-8 h-8 text-yellow-500 mr-3" />
            <div>
              <h1 className="text-xl font-black">Avaliações Físicas</h1>
              <p className="text-neutral-400 text-sm">Gerencie as avaliações e acompanhe a evolução</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl bg-yellow-500 text-black font-bold">+ Nova Avaliação</button>
            <button className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 font-medium">Ver Histórico</button>
          </div>
        </div>
        {latestAssessment && previousAssessment && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-bold uppercase">Peso</span>
                <TrendingUp className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{latestAssessment.weight} kg</div>
              {(() => {
                const progress = getProgress(latestAssessment.weight, previousAssessment.weight);
                return progress && (
                  <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progress.change > 0 ? '+' : ''}{progress.change.toFixed(1)} kg ({progress.percentage}%)
                  </div>
                );
              })()}
            </div>
            <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-bold uppercase">% Gordura</span>
                <Calculator className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{latestAssessment.body_fat_percentage.toFixed(1)}%</div>
              {(() => {
                const progress = getProgress(latestAssessment.body_fat_percentage, previousAssessment.body_fat_percentage);
                return progress && (
                  <div className={`text-sm ${progress.change < 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progress.change > 0 ? '+' : ''}{progress.change.toFixed(1)}% ({progress.percentage}%)
                  </div>
                );
              })()}
            </div>
            <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-bold uppercase">Massa Magra</span>
                <TrendingUp className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{latestAssessment.lean_mass.toFixed(1)} kg</div>
              {(() => {
                const progress = getProgress(latestAssessment.lean_mass, previousAssessment.lean_mass);
                return progress && (
                  <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progress.change > 0 ? '+' : ''}{progress.change.toFixed(1)} kg ({progress.percentage}%)
                  </div>
                );
              })()}
            </div>
            <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-bold uppercase">BMR</span>
                <Calculator className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{latestAssessment.bmr.toFixed(0)} kcal</div>
              {(() => {
                const progress = getProgress(latestAssessment.bmr, previousAssessment.bmr);
                return progress && (
                  <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progress.change > 0 ? '+' : ''}{progress.change.toFixed(0)} kcal ({progress.percentage}%)
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Gráficos escuros */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Evolução da Composição Corporal</h3>
          <div className="h-64">
            <Line data={chartData.bodyComposition} options={chartOptions} />
          </div>
        </div>
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Evolução do Peso</h3>
          <div className="h-64">
            <Line data={chartData.weightProgress} options={chartOptions} />
          </div>
        </div>
      </div>

      <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">Evolução das Circunferências</h3>
        <div className="h-64">
          <Bar data={chartData.measurements} options={chartOptions} />
        </div>
      </div>

      {/* Lista escura */}
      <div className="bg-neutral-800 rounded-xl border border-neutral-700">
        <div className="p-6 border-b border-neutral-700">
          <h3 className="text-lg font-bold text-white flex items-center">
            <Calendar className="w-5 h-5 mr-2" />
            Histórico Completo
          </h3>
        </div>
        <div className="divide-y divide-neutral-700">
          {sortedAssessments.map((assessment) => (
            <div key={assessment.id} className="p-6 hover:bg-neutral-900 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <span className="font-bold text-white">
                      {new Date(assessment.date || assessment.assessment_date).toLocaleDateString('pt-BR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                    <span className="ml-3 px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                      {assessment.age ?? '-'} anos
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-neutral-400">Peso:</span>
                      <span className="ml-1 font-medium text-white">{assessment.weight ?? '-'} kg</span>
                    </div>
                    <div>
                      <span className="text-neutral-400">% Gordura:</span>
                      <span className="ml-1 font-medium text-white">{Number(assessment.body_fat_percentage ?? assessment.bf ?? 0).toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-neutral-400">Massa Magra:</span>
                      <span className="ml-1 font-medium text-white">{(() => { const bf = Number(assessment.body_fat_percentage ?? assessment.bf ?? 0); const w = Number(assessment.weight ?? 0); const lm = w > 0 ? w * (1 - bf / 100) : 0; return lm.toFixed(1); })()} kg</span>
                    </div>
                    <div>
                      <span className="text-neutral-400">BMR:</span>
                      <span className="ml-1 font-medium text-white">{assessment.bmr ? Number(assessment.bmr).toFixed(0) : '-'} kcal</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {assessment.photos && assessment.photos.length > 0 && (
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                      Com fotos
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedAssessment(selectedAssessment === assessment.id ? null : assessment.id)}
                    className="px-3 py-1 text-yellow-500 hover:text-yellow-400 text-sm font-bold"
                  >
                    {selectedAssessment === assessment.id ? 'Ocultar' : 'Detalhes'}
                  </button>
                  <AssessmentPDFGenerator
                    formData={{
                      assessment_date: String(assessment.assessment_date || ''),
                      weight: String(assessment.weight || ''),
                      height: String(assessment.height || ''),
                      age: String(assessment.age || ''),
                      gender: assessment.gender,
                      arm_circ: String(assessment.measurements?.arm || ''),
                      chest_circ: String(assessment.measurements?.chest || ''),
                      waist_circ: String(assessment.measurements?.waist || ''),
                      hip_circ: String(assessment.measurements?.hip || ''),
                      thigh_circ: String(assessment.measurements?.thigh || ''),
                      calf_circ: String(assessment.measurements?.calf || ''),
                      triceps_skinfold: String(assessment.skinfolds?.triceps || ''),
                      biceps_skinfold: String(assessment.skinfolds?.biceps || ''),
                      subscapular_skinfold: String(assessment.skinfolds?.subscapular || ''),
                      suprailiac_skinfold: String(assessment.skinfolds?.suprailiac || ''),
                      abdominal_skinfold: String(assessment.skinfolds?.abdominal || ''),
                      thigh_skinfold: String(assessment.skinfolds?.thigh || ''),
                      calf_skinfold: String(assessment.skinfolds?.calf || ''),
                      observations: ''
                    }}

                    studentName={assessment.student_name}
                    trainerName={assessment.trainer_name}
                    assessmentDate={new Date(assessment.assessment_date)}
                  />
                </div>
              </div>
              {selectedAssessment === assessment.id && (
                <div className="mt-4 pt-4 border-t border-neutral-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-bold text-white mb-2">Dobras Cutâneas (mm)</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {assessment.skinfolds && Object.entries(assessment.skinfolds).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-neutral-400 capitalize">{key}:</span>
                            <span className="font-medium text-white">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-white mb-2">Circunferências (cm)</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {assessment.measurements && Object.entries(assessment.measurements).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-neutral-400 capitalize">{key}:</span>
                            <span className="font-medium text-white">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
