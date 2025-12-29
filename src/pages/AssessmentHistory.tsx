"use client";
import React, { useState, useMemo } from 'react';
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
import { TrendingUp, Calendar, User, Calculator, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { DialogProvider } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
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

const toPositiveNumberOrNull = (value: any): number | null => {
  const num = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const getWeightKg = (assessment: any): number | null => {
  return toPositiveNumberOrNull(assessment?.weight);
};

const getBodyFatPercent = (assessment: any): number | null => {
  return toPositiveNumberOrNull(assessment?.body_fat_percentage ?? assessment?.bf);
};

const getFatMassKg = (assessment: any): number | null => {
  const stored = toPositiveNumberOrNull(assessment?.fat_mass);
  if (stored) return stored;
  const weight = getWeightKg(assessment);
  const bf = getBodyFatPercent(assessment);
  if (!weight || !bf) return null;
  const computed = (weight * bf) / 100;
  return Number.isFinite(computed) && computed > 0 ? computed : null;
};

const getLeanMassKg = (assessment: any): number | null => {
  const weight = getWeightKg(assessment);
  const bf = getBodyFatPercent(assessment);
  const fatMass = getFatMassKg(assessment);
  const stored = toPositiveNumberOrNull(assessment?.lean_mass);

  if (stored) {
    if (!weight) return stored;
    const epsilon = 0.05;
    const isEqualToWeight = Math.abs(stored - weight) <= epsilon;
    const hasCompositionInputs = !!bf || !!fatMass;
    if (!isEqualToWeight || hasCompositionInputs) {
      return stored > 0 && stored < weight ? stored : null;
    }
  }

  if (!weight || !bf) return null;
  const computed = weight * (1 - bf / 100);
  return Number.isFinite(computed) && computed > 0 && computed < weight ? computed : null;
};

const getBmrKcal = (assessment: any): number | null => {
  return toPositiveNumberOrNull(assessment?.bmr);
};

const getMeasurementCm = (assessment: any, key: string): number | null => {
  return toPositiveNumberOrNull(assessment?.measurements?.[key]);
};

const getSum7Mm = (assessment: any): number | null => {
  return toPositiveNumberOrNull(assessment?.sum7 ?? assessment?.measurements?.sum7);
};

interface AssessmentHistoryProps {
  studentId?: string;
}

export default function AssessmentHistory({ studentId: propStudentId }: AssessmentHistoryProps) {
  const studentId = propStudentId;
  const supabase = useMemo(() => createClient(), []);
  const { getStudentAssessments } = useAssessment();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(!!studentId);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [studentName, setStudentName] = useState<string>('Aluno');
  const [selectedAssessment, setSelectedAssessment] = useState<string | null>(null);

  const measurementFields = [
    { key: 'arm', label: 'Braço' },
    { key: 'chest', label: 'Peito' },
    { key: 'waist', label: 'Cintura' },
    { key: 'hip', label: 'Quadril' },
    { key: 'thigh', label: 'Coxa' },
    { key: 'calf', label: 'Panturrilha' }
  ] as const;

  const skinfoldFields = [
    { key: 'triceps', label: 'Tríceps' },
    { key: 'biceps', label: 'Bíceps' },
    { key: 'subscapular', label: 'Subescapular' },
    { key: 'suprailiac', label: 'Suprailíaca' },
    { key: 'abdominal', label: 'Abdominal' },
    { key: 'thigh', label: 'Coxa' },
    { key: 'calf', label: 'Panturrilha' }
  ] as const;

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!studentId) {
          if (mounted) setError('ID do aluno não fornecido.')
          return
        }
        if (mounted) {
          setError(null);
          setLoading(true);
        }
        const list = await getStudentAssessments(studentId!);
        if (mounted) setAssessments(list);
        if (mounted) {
          setError(null);
          const latest = list?.[0];
          if (latest?.student_name) {
            setStudentName(latest.student_name);
          } else {
            let resolvedName = 'Aluno';
            try {
              const { data: studentRow } = await supabase
                .from('students')
                .select('name, email, user_id')
                .eq('id', studentId!)
                .maybeSingle();

              if (studentRow) {
                resolvedName = studentRow.name || studentRow.email || resolvedName;
              } else {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('display_name, email')
                  .eq('id', studentId!)
                  .maybeSingle();
                if (profile) {
                  resolvedName = profile.display_name || profile.email || resolvedName;
                }
              }
            } catch (e) {
              console.error('Erro ao resolver nome do aluno para histórico de avaliações', e);
            }

            setStudentName(resolvedName);
          }
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Erro ao carregar avaliações');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [studentId, getStudentAssessments, supabase]);

  const sortedAssessments = useMemo(() => {
    const safeTime = (raw: any) => {
      const date = new Date(raw);
      const time = date.getTime();
      return Number.isFinite(time) ? time : 0;
    };

    return [...(assessments || [])].sort((a, b) => {
      const aTime = safeTime(a?.date ?? a?.assessment_date);
      const bTime = safeTime(b?.date ?? b?.assessment_date);
      return aTime - bTime;
    });
  }, [assessments]);

  const formatDate = (rawDate: any, options?: Intl.DateTimeFormatOptions) => {
    if (!rawDate) return '-';
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR', options);
  };

  const safeGender = (raw: any) => {
    return raw === 'F' || raw === 'M' ? raw : 'M';
  };

  const chartData = useMemo(() => {
    const labels = sortedAssessments.map(assessment => {
      const rawDate = assessment?.date ?? assessment?.assessment_date;
      const date = new Date(rawDate);
      return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
    });

    return {
      bodyComposition: {
        labels,
        datasets: [
          {
            label: '% Gordura',
            data: sortedAssessments.map(getBodyFatPercent),
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Massa Magra (kg)',
            data: sortedAssessments.map(getLeanMassKg),
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Massa Gorda (kg)',
            data: sortedAssessments.map(getFatMassKg),
            borderColor: 'rgb(245, 158, 11)',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
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
            data: sortedAssessments.map(getWeightKg),
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
            data: sortedAssessments.map(a => getMeasurementCm(a, 'arm')),
            backgroundColor: 'rgba(168, 85, 247, 0.8)'
          },
          {
            label: 'Peito (cm)',
            data: sortedAssessments.map(a => getMeasurementCm(a, 'chest')),
            backgroundColor: 'rgba(59, 130, 246, 0.8)'
          },
          {
            label: 'Cintura (cm)',
            data: sortedAssessments.map(a => getMeasurementCm(a, 'waist')),
            backgroundColor: 'rgba(236, 72, 153, 0.8)'
          },
          {
            label: 'Quadril (cm)',
            data: sortedAssessments.map(a => getMeasurementCm(a, 'hip')),
            backgroundColor: 'rgba(14, 165, 233, 0.8)'
          },
          {
            label: 'Coxa (cm)',
            data: sortedAssessments.map(a => getMeasurementCm(a, 'thigh')),
            backgroundColor: 'rgba(34, 197, 94, 0.8)'
          },
          {
            label: 'Panturrilha (cm)',
            data: sortedAssessments.map(a => getMeasurementCm(a, 'calf')),
            backgroundColor: 'rgba(251, 191, 36, 0.8)'
          },
          {
            label: 'Dobras Soma (mm)',
            data: sortedAssessments.map(getSum7Mm),
            backgroundColor: 'rgba(245, 158, 11, 0.8)'
          }
        ]
      }
    };
  }, [sortedAssessments]);

  const chartHasData = useMemo(() => {
    const hasNumber = (data: any): boolean => {
      return Array.isArray(data) && data.some(v => typeof v === 'number' && Number.isFinite(v));
    };

    const hasDatasetNumbers = (datasets: any): boolean => {
      return Array.isArray(datasets) && datasets.some(ds => hasNumber(ds?.data));
    };

    return {
      bodyComposition: hasDatasetNumbers(chartData?.bodyComposition?.datasets),
      weightProgress: hasDatasetNumbers(chartData?.weightProgress?.datasets),
      measurements: hasDatasetNumbers(chartData?.measurements?.datasets)
    };
  }, [chartData]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: false,
        text: ''
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

  const getProgress = (currentRaw: any, previousRaw: any) => {
    if (currentRaw === null || currentRaw === undefined) return null;
    if (previousRaw === null || previousRaw === undefined) return null;
    const current = Number(currentRaw);
    const previous = Number(previousRaw);
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
    const change = current - previous;
    const percentage = (change / previous) * 100;
    if (!Number.isFinite(percentage)) return null;
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
    <DialogProvider>
    <GlobalDialog />
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
            <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-xl bg-yellow-500 text-black font-bold">+ Nova Avaliação</button>
            <button onClick={() => setShowHistory(true)} className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 font-medium">Ver Histórico</button>
            <button onClick={() => { if (typeof window !== 'undefined') window.history.back(); }} className="ml-2 p-2 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 hover:bg-neutral-800" title="Fechar"><X className="w-5 h-5"/></button>
          </div>
        </div>
        {latestAssessment && previousAssessment && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-bold uppercase">Peso</span>
                <TrendingUp className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{(() => {
                const v = getWeightKg(latestAssessment);
                return v ? `${v.toFixed(1)} kg` : '-';
              })()}</div>
              {(() => {
                const progress = getProgress(getWeightKg(latestAssessment), getWeightKg(previousAssessment));
                return progress && (
                  <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progress.change > 0 ? '+' : ''}{progress.change.toFixed(1)} kg ({progress.percentage.toFixed(1)}%)
                  </div>
                );
              })()}
            </div>
            <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-bold uppercase">% Gordura</span>
                <Calculator className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{(() => {
                const bf = getBodyFatPercent(latestAssessment);
                return bf ? `${bf.toFixed(1)}%` : '-';
              })()}</div>
              {(() => {
                const progress = getProgress(
                  getBodyFatPercent(latestAssessment),
                  getBodyFatPercent(previousAssessment)
                );
                return progress && (
                  <div className={`text-sm ${progress.change < 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progress.change > 0 ? '+' : ''}{progress.change.toFixed(1)}% ({progress.percentage.toFixed(1)}%)
                  </div>
                );
              })()}
            </div>
            <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-bold uppercase">Massa Magra</span>
                <TrendingUp className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{(() => {
                const lm = getLeanMassKg(latestAssessment);
                return lm ? `${lm.toFixed(1)} kg` : '-';
              })()}</div>
              {(() => {
                const currentLm = getLeanMassKg(latestAssessment);
                const previousLm = getLeanMassKg(previousAssessment);
                const progress = getProgress(currentLm, previousLm);
                return progress && (
                  <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progress.change > 0 ? '+' : ''}{progress.change.toFixed(1)} kg ({progress.percentage.toFixed(1)}%)
                  </div>
                );
              })()}
            </div>
            <div className="rounded-lg p-4 bg-neutral-900 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-bold uppercase">BMR</span>
                <Calculator className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold">{(() => {
                const v = getBmrKcal(latestAssessment);
                return v ? v.toFixed(0) : '-';
              })()} kcal</div>
              {(() => {
                const progress = getProgress(getBmrKcal(latestAssessment), getBmrKcal(previousAssessment));
                return progress && (
                  <div className={`text-sm ${progress.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progress.change > 0 ? '+' : ''}{progress.change.toFixed(0)} kcal ({progress.percentage.toFixed(1)}%)
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
            {chartHasData.bodyComposition ? (
              <Line data={chartData.bodyComposition} options={chartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
                Sem dados de composição corporal suficientes.
              </div>
            )}
          </div>
        </div>
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Evolução do Peso</h3>
          <div className="h-64">
            {chartHasData.weightProgress ? (
              <Line data={chartData.weightProgress} options={chartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
                Sem dados de peso suficientes.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6 mb-6">
        <h3 className="text-lg font-bold text-white mb-4">Evolução das Circunferências</h3>
        <div className="h-64">
          {chartHasData.measurements ? (
            <Bar data={chartData.measurements} options={chartOptions} />
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-6">
              Sem dados de circunferências suficientes.
            </div>
          )}
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
        <div id="assessments-history" className="divide-y divide-neutral-700">
          {sortedAssessments.map((assessment) => (
            <div key={assessment.id} className="p-6 hover:bg-neutral-900 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <span className="font-bold text-white">
                      {formatDate(assessment.date || assessment.assessment_date, {
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
                      <span className="ml-1 font-medium text-white">{(() => {
                        const w = getWeightKg(assessment);
                        return w ? `${w.toFixed(1)} kg` : '-';
                      })()}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400">% Gordura:</span>
                      <span className="ml-1 font-medium text-white">{(() => {
                        const bf = getBodyFatPercent(assessment);
                        return bf ? `${bf.toFixed(1)}%` : '-';
                      })()}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400">Massa Magra:</span>
                      <span className="ml-1 font-medium text-white">{(() => {
                        const lm = getLeanMassKg(assessment);
                        return lm ? `${lm.toFixed(1)} kg` : '-';
                      })()}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400">BMR:</span>
                      <span className="ml-1 font-medium text-white">{(() => {
                        const v = getBmrKcal(assessment);
                        return v ? `${v.toFixed(0)} kcal` : '-';
                      })()}</span>
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
                      gender: safeGender(assessment.gender),
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
                    assessmentDate={new Date(assessment.assessment_date || Date.now())}
                  />
                </div>
              </div>
              {selectedAssessment === assessment.id && (
                <div className="mt-4 pt-4 border-t border-neutral-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-bold text-white mb-2">Dobras Cutâneas (mm)</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {skinfoldFields.map(({ key, label }) => {
                          const value = (assessment.skinfolds || {})[key];
                          return (
                            <div key={key} className="flex justify-between">
                              <span className="text-neutral-400">{label}:</span>
                              <span className="font-medium text-white">{value === null || value === undefined || value === '' ? '-' : String(value)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-white mb-2">Circunferências (cm)</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {measurementFields.map(({ key, label }) => {
                          const value = (assessment.measurements || {})[key];
                          return (
                            <div key={key} className="flex justify-between">
                              <span className="text-neutral-400">{label}:</span>
                              <span className="font-medium text-white">{value === null || value === undefined || value === '' ? '-' : String(value)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal do Formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
              <h3 className="font-bold text-white">Nova Avaliação</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-neutral-800 rounded-full"><X className="w-5 h-5 text-neutral-400"/></button>
            </div>
            <div className="p-4 max-h-[80vh] overflow-y-auto bg-neutral-900">
              <AssessmentForm
                studentId={studentId!}
                studentName={studentName}
                onSuccess={() => { setShowForm(false); location.reload(); }}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowHistory(false)}>
          <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
              <h3 className="font-bold text-white">Histórico de Avaliações</h3>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-neutral-800 rounded-full"><X className="w-5 h-5 text-neutral-400"/></button>
            </div>
            <div className="p-4 max-h-[80vh] overflow-y-auto space-y-3">
              {sortedAssessments.map(a => (
                <div key={a.id} className="bg-neutral-800 p-3 rounded-xl border border-neutral-700">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white">{formatDate(a.date || a.assessment_date)}</div>
                      <div className="text-xs text-neutral-400">{(() => {
                        const w = getWeightKg(a);
                        const bf = getBodyFatPercent(a);
                        const weightLabel = w ? `${w.toFixed(1)} kg` : '-';
                        const bfLabel = bf ? `${bf.toFixed(1)}%` : '-';
                        return `Peso ${weightLabel} • % Gordura ${bfLabel}`;
                      })()}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedAssessment(selectedAssessment === a.id ? null : a.id)} className="px-3 py-1 text-yellow-500 hover:text-yellow-400 text-sm font-bold">Detalhes</button>
                      <AssessmentPDFGenerator
                        formData={{
                          assessment_date: String(a.assessment_date || ''),
                          weight: String(a.weight || ''),
                          height: String(a.height || ''),
                          age: String(a.age || ''),
                          gender: safeGender(a.gender),
                          arm_circ: String(a.measurements?.arm || ''),
                          chest_circ: String(a.measurements?.chest || ''),
                          waist_circ: String(a.measurements?.waist || ''),
                          hip_circ: String(a.measurements?.hip || ''),
                          thigh_circ: String(a.measurements?.thigh || ''),
                          calf_circ: String(a.measurements?.calf || ''),
                          triceps_skinfold: String(a.skinfolds?.triceps || ''),
                          biceps_skinfold: String(a.skinfolds?.biceps || ''),
                          subscapular_skinfold: String(a.skinfolds?.subscapular || ''),
                          suprailiac_skinfold: String(a.skinfolds?.suprailiac || ''),
                          abdominal_skinfold: String(a.skinfolds?.abdominal || ''),
                          thigh_skinfold: String(a.skinfolds?.thigh || ''),
                          calf_skinfold: String(a.skinfolds?.calf || ''),
                          observations: ''
                        }}
                        studentName={studentName}
                        trainerName={a.trainer_name}
                        assessmentDate={new Date(a.assessment_date || Date.now())}
                      />
                    </div>
                  </div>
                  {selectedAssessment === a.id && (
                    <div className="mt-3 pt-3 border-t border-neutral-700">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h4 className="font-bold text-white mb-2">Dobras Cutâneas (mm)</h4>
                          <div className="grid grid-cols-2 gap-2">
                          {skinfoldFields.map(({ key, label }) => {
                            const value = (a.skinfolds || {})[key];
                            return (
                              <div key={key} className="flex justify-between">
                                <span className="text-neutral-400">{label}:</span>
                                <span className="font-medium text-white">{value === null || value === undefined || value === '' ? '-' : String(value)}</span>
                              </div>
                            );
                          })}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-bold text-white mb-2">Circunferências (cm)</h4>
                          <div className="grid grid-cols-2 gap-2">
                          {measurementFields.map(({ key, label }) => {
                            const value = (a.measurements || {})[key];
                            return (
                              <div key={key} className="flex justify-between">
                                <span className="text-neutral-400">{label}:</span>
                                <span className="font-medium text-white">{value === null || value === undefined || value === '' ? '-' : String(value)}</span>
                              </div>
                            );
                          })}
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
      )}
    </div>
    </DialogProvider>
  );
}
