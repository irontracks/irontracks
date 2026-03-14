"use client";
import React, { useState, useMemo, useRef } from 'react';
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
import { Calendar, TrendingUp, Upload, User, X } from 'lucide-react';
import { isIosNative } from '@/utils/platform';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { DialogProvider } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { useAssessment } from '@/hooks/useAssessment';
import dynamic from 'next/dynamic';
import { AssessmentHeader } from '@/components/assessment/AssessmentHeader';
import { AssessmentSummaryCards } from '@/components/assessment/AssessmentSummaryCards';
import { generateAssessmentPlanAi } from '@/actions/workout-actions';
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

const AssessmentPDFGenerator = dynamic(() => import('@/components/assessment/AssessmentPDFGenerator'), { ssr: false })

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

const LOOKBACK_DAYS = 28;
const BASE_ACTIVITY_FACTOR = 1.2;
const TEF_FACTOR = 0.1;
const MAX_SESSION_SECONDS = 4 * 60 * 60;

import {
  AssessmentRow,
  isRecord,
  toPositiveNumberOrNull,
  getWeightKg,
  getBodyFatPercent,
  getFatMassKg,
  getLeanMassKg,
  getBmrKcal,
  getMeasurementCm,
  getSkinfoldMm,
  getSum7Mm,
  safeJsonParse,
  safeDateMs,
  safeDateMsStartOfDay,
  safeDateMsEndOfDay,
  countSessionSets,
  estimateStrengthTrainingMet,
  uniqueStrings,
} from './assessmentUtils';
import { AssessmentHistoryModal } from './AssessmentHistoryModal';
import {
  formatAssessmentDate,
  formatDateCompact,
  formatWeekdayCompact,
  safeGender,
  getProgress,
  buildAssessmentChartData,
  checkChartHasData,
  CHART_OPTIONS,
} from './assessmentChartData';


interface AssessmentHistoryProps {
  studentId?: string;
  onClose?: () => void;
}

export default function AssessmentHistory({ studentId: propStudentId, onClose }: AssessmentHistoryProps) {
  const studentId = propStudentId;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { getStudentAssessments } = useAssessment();
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(!!studentId);
  const [error, setError] = useState<string | null>(null);
  const [workoutSessions, setWorkoutSessions] = useState<{ dateMs: number; metHours: number }[]>([]);
  const [workoutSessionsLoading, setWorkoutSessionsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [studentName, setStudentName] = useState<string>('Aluno');
  const [selectedAssessment, setSelectedAssessment] = useState<string | null>(null);
  const [aiPlanByAssessmentId, setAiPlanByAssessmentId] = useState<
    Record<
      string,
      {
        loading: boolean
        error: string | null
        plan: Record<string, unknown> | null
        usedAi: boolean
        reason?: string
      }
    >
  >({});
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planModalAssessment, setPlanModalAssessment] = useState<AssessmentRow | null>(null);
  const [importing, setImporting] = useState(false);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const planAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isIosNativeApp = isIosNative();

  const mergeImportedFormData = (base: Record<string, unknown>, incoming: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...(base && typeof base === 'object' ? base : {}) };
    const keys = [
      'assessment_date',
      'weight',
      'height',
      'age',
      'gender',
      'arm_circ',
      'chest_circ',
      'waist_circ',
      'hip_circ',
      'thigh_circ',
      'calf_circ',
      'triceps_skinfold',
      'biceps_skinfold',
      'subscapular_skinfold',
      'suprailiac_skinfold',
      'abdominal_skinfold',
      'thigh_skinfold',
      'calf_skinfold',
      'observations',
    ];
    keys.forEach((k) => {
      const nextVal = incoming?.[k];
      if (nextVal === undefined || nextVal === null || nextVal === '') return;
      const prevVal = out?.[k];
      if (prevVal === undefined || prevVal === null || prevVal === '') {
        out[k] = nextVal;
      }
    });
    return out;
  };

  const handleScanClick = () => {
    if (!studentId) return;
    if (!scanInputRef.current) return;
    scanInputRef.current.click();
  };

  const handleScanFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = event.target.files ? Array.from(event.target.files) : [];
      if (!files.length) return;
      if (!studentId) return;
      if (importing) return;

      setImporting(true);

      let mergedFormData: Record<string, unknown> = {};

      for (const file of files) {
        const form = new FormData();
        form.append('file', file);

        const res = await fetch('/api/assessment-scanner', {
          method: 'POST',
          body: form,
        });

        const data = await res.json().catch((): null => null);
        if (!data || !data.ok) {
          const msg = String(data?.error || 'Falha ao processar arquivo');
          if (typeof window !== 'undefined') window.alert(msg);
          return;
        }

        const nextForm = data?.formData && typeof data.formData === 'object' ? (data.formData as Record<string, unknown>) : null;
        if (nextForm) mergedFormData = mergeImportedFormData(mergedFormData, nextForm);
      }

      const hasCoreField =
        mergedFormData &&
        typeof mergedFormData === 'object' &&
        ('weight' in mergedFormData || 'height' in mergedFormData || 'assessment_date' in mergedFormData);

      if (!hasCoreField) {
        if (typeof window !== 'undefined') {
          window.alert('Não foi possível extrair dados suficientes da avaliação.');
        }
        return;
      }

      if (typeof window !== 'undefined') {
        try {
          const storageKey = `assessment_import_${studentId}`;
          window.sessionStorage.setItem(storageKey, JSON.stringify({ formData: mergedFormData }));
        } catch (error) {
          logError('error', 'Erro ao salvar avaliação importada na sessão', error);
          window.alert('Não foi possível preparar os dados importados. Tente novamente.');
          return;
        }
      }

      router.push(`/assessments/new/${studentId}`);
    } catch (error) {
      logError('error', 'Erro ao importar avaliação por imagem/PDF', error);
      if (typeof window !== 'undefined') {
        window.alert('Falha ao importar avaliação por imagem/PDF.');
      }
    } finally {
      setImporting(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

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
          if (mounted) setError('ID do aluno não fornecido.');
          return;
        }
        if (mounted) {
          setError(null);
          setLoading(true);
        }
        const listRaw = await getStudentAssessments(studentId!);
        const list = Array.isArray(listRaw) ? (listRaw as unknown as AssessmentRow[]) : [];
        if (mounted) setAssessments(list);
        if (mounted) {
          setError(null);
          const latest = list?.[0];
          if (latest?.student_name) {
            setStudentName(String(latest.student_name || 'Aluno'));
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
              logError('error', 'Erro ao resolver nome do aluno para histórico de avaliações', e);
            }

            setStudentName(resolvedName);
          }
        }
      } catch (e: unknown) {
        if (mounted) setError(getErrorMessage(e) || 'Erro ao carregar avaliações');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [studentId, getStudentAssessments, supabase]);

  const handleGenerateAssessmentPlan = async (assessment: AssessmentRow, opts?: { openDetails?: boolean }) => {
    try {
      const id = String(assessment?.id || '');
      if (!id) return;
      if (opts?.openDetails) setSelectedAssessment(id);

      setAiPlanByAssessmentId((prev) => ({
        ...prev,
        [id]: {
          loading: true,
          error: null,
          plan: prev[id]?.plan ?? null,
          usedAi: prev[id]?.usedAi ?? false,
          reason: prev[id]?.reason,
        },
      }));

      const res = await generateAssessmentPlanAi({
        assessment,
        studentName,
        trainerName: String(assessment?.trainer_name ?? ''),
        goal: String(assessment?.goal ?? assessment?.observations ?? ''),
      });

      if (!res || !res.ok) {
        setAiPlanByAssessmentId((prev) => ({
          ...prev,
          [id]: {
            loading: false,
            error: res?.error ? String(res.error) : 'Falha ao gerar plano tático',
            plan: prev[id]?.plan ?? null,
            usedAi: false,
            reason: res?.reason ? String(res.reason) : 'ai_failed',
          },
        }));
        return;
      }

      setAiPlanByAssessmentId((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: null,
          plan: res.plan ?? null,
          usedAi: !!res.usedAi,
          reason: res?.reason ? String(res.reason) : (res?.usedAi ? 'ai' : 'fallback'),
        },
      }));
      setTimeout(() => {
        try {
          planAnchorRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch { }
      }, 50);
    } catch (e) {
      const id = String(assessment?.id || '');
      if (!id) return;
      setAiPlanByAssessmentId((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: (e as Record<string, unknown>)?.message ? String((e as Record<string, unknown>).message) : 'Erro inesperado ao gerar plano tático',
          plan: prev[id]?.plan ?? null,
          usedAi: false,
          reason: 'ai_failed',
        },
      }));
    }
  };

  const handleOpenAssessmentPlanModal = async (assessment: AssessmentRow) => {
    try {
      const id = String(assessment?.id || '');
      if (!id) return;
      setPlanModalAssessment(assessment);
      setPlanModalOpen(true);
      await handleGenerateAssessmentPlan(assessment, { openDetails: false });
    } catch { }
  };

  const sortedAssessments = useMemo(() => {
    const safeTime = (raw: unknown): number => {
      const date = new Date(typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date ? raw : String(raw ?? ''));
      const time = date.getTime();
      return Number.isFinite(time) ? time : 0;
    };

    return [...(assessments || [])].sort((a, b) => {
      const aTime = safeTime(a?.date ?? a?.assessment_date);
      const bTime = safeTime(b?.date ?? b?.assessment_date);
      return aTime - bTime;
    });
  }, [assessments]);

  const workoutWindow = useMemo(() => {
    if (!Array.isArray(sortedAssessments) || sortedAssessments.length === 0) return null;
    const minTimes = sortedAssessments
      .map(a => safeDateMsStartOfDay(a?.date ?? a?.assessment_date))
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0);
    const maxTimes = sortedAssessments
      .map(a => safeDateMsEndOfDay(a?.date ?? a?.assessment_date))
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0);
    if (minTimes.length === 0 || maxTimes.length === 0) return null;
    const minTime = Math.min(...minTimes);
    const maxTime = Math.max(...maxTimes);
    const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    return {
      from: new Date(minTime - lookbackMs),
      to: new Date(maxTime)
    };
  }, [sortedAssessments]);

  const workoutWindowFromIso = workoutWindow?.from ? workoutWindow.from.toISOString() : null;
  const workoutWindowToIso = workoutWindow?.to ? workoutWindow.to.toISOString() : null;

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!studentId || !workoutWindowFromIso || !workoutWindowToIso) {
          if (mounted) setWorkoutSessions([]);
          return;
        }
        if (mounted) setWorkoutSessionsLoading(true);

        const candidateId = String(studentId || '').trim();
        const candidateIds: string[] = [];

        try {
          const { data: directProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', candidateId)
            .maybeSingle();

          if (directProfile?.id) {
            candidateIds.push(directProfile.id as string);
          } else {
            const { data: studentRow } = await supabase
              .from('students')
              .select('id, user_id, email')
              .or(`id.eq.${candidateId},user_id.eq.${candidateId}`)
              .maybeSingle();

            if (studentRow?.user_id) candidateIds.push(studentRow.user_id as string);
            if (!studentRow?.user_id && studentRow?.email) {
              const { data: profileByEmail } = await supabase
                .from('profiles')
                .select('id')
                .ilike('email', studentRow.email)
                .maybeSingle();
              if (profileByEmail?.id) candidateIds.push(profileByEmail.id as string);
            }
          }
        } catch {
          candidateIds.push(candidateId);
        }

        const ids = uniqueStrings([candidateId, ...candidateIds]);
        if (ids.length === 0) {
          if (mounted) setWorkoutSessions([]);
          return;
        }

        const baseSelect = 'id, user_id, student_id, date, created_at, completed_at, is_template, notes';
        const fromIso = workoutWindowFromIso;
        const toIso = workoutWindowToIso;
        const fromDay = typeof fromIso === 'string' ? fromIso.split('T')[0] : null;
        const toDay = typeof toIso === 'string' ? toIso.split('T')[0] : null;

        const rows: AssessmentRow[] = [];
        try {
          const { data, error: wErr } = await supabase
            .from('workouts')
            .select(baseSelect)
            .eq('is_template', false)
            .in('user_id', ids)
            .gte('completed_at', fromIso)
            .lte('completed_at', toIso)
            .order('completed_at', { ascending: true });
          if (!wErr && Array.isArray(data)) rows.push(...data);
        } catch { }

        try {
          const { data, error: wErr } = await supabase
            .from('workouts')
            .select(baseSelect)
            .eq('is_template', false)
            .in('student_id', ids)
            .gte('completed_at', fromIso)
            .lte('completed_at', toIso)
            .order('completed_at', { ascending: true });
          if (!wErr && Array.isArray(data)) rows.push(...data);
        } catch { }

        if (fromDay && toDay) {
          try {
            const { data, error: wErr } = await supabase
              .from('workouts')
              .select(baseSelect)
              .eq('is_template', false)
              .in('user_id', ids)
              .gte('date', fromDay)
              .lte('date', toDay)
              .order('date', { ascending: true });
            if (!wErr && Array.isArray(data)) rows.push(...data);
          } catch { }

          try {
            const { data, error: wErr } = await supabase
              .from('workouts')
              .select(baseSelect)
              .eq('is_template', false)
              .in('student_id', ids)
              .gte('date', fromDay)
              .lte('date', toDay)
              .order('date', { ascending: true });
            if (!wErr && Array.isArray(data)) rows.push(...data);
          } catch { }
        }

        const byId = new Map<string, AssessmentRow>();
        for (const r of rows) {
          if (r?.id) byId.set(String(r.id), r);
        }

        const sessions: { dateMs: number; metHours: number }[] = [];
        byId.forEach((r) => {
          const dateMs = safeDateMs(r?.completed_at ?? r?.date ?? r?.created_at);
          if (!dateMs) return;
          const parsed = safeJsonParse(r?.notes);
          const totalTime = toPositiveNumberOrNull(parsed?.totalTime);
          const realTime = toPositiveNumberOrNull(parsed?.realTotalTime);
          let rawSeconds = totalTime || realTime || null;
          if (!rawSeconds) {
            try {
              const exerciseDurations = Array.isArray(parsed?.exerciseDurations)
                ? (parsed.exerciseDurations as unknown[])
                : (Array.isArray(parsed?.exercisesDurations) ? (parsed.exercisesDurations as unknown[]) : null);
              if (exerciseDurations && exerciseDurations.length > 0) {
                const sum = exerciseDurations.reduce<number>((acc: number, v: unknown) => acc + (Number(v) || 0), 0);
                if (Number.isFinite(sum) && sum > 0) rawSeconds = sum;
              }
            } catch { }
          }
          if (!rawSeconds) return;
          const seconds = Math.min(rawSeconds, MAX_SESSION_SECONDS);
          if (!Number.isFinite(seconds) || seconds <= 0) return;
          const setsCount = countSessionSets(parsed || {});
          const met = estimateStrengthTrainingMet(seconds, setsCount);
          const metHours = (met * seconds) / 3600;
          if (!Number.isFinite(metHours) || metHours <= 0) return;
          sessions.push({ dateMs, metHours });
        });

        sessions.sort((a, b) => a.dateMs - b.dateMs);

        if (mounted) setWorkoutSessions(sessions);
      } catch {
        if (mounted) setWorkoutSessions([]);
      } finally {
        if (mounted) setWorkoutSessionsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [studentId, supabase, workoutWindowFromIso, workoutWindowToIso]);

  const tdeeByAssessmentId = useMemo(() => {
    const out = new Map<string, number>();
    if (!Array.isArray(sortedAssessments) || sortedAssessments.length === 0) return out;

    const sessions = Array.isArray(workoutSessions) ? workoutSessions : [];

    const dates = sessions.map(s => s.dateMs);
    const prefix: number[] = new Array(sessions.length + 1);
    prefix[0] = 0;
    for (let i = 0; i < sessions.length; i++) {
      prefix[i + 1] = prefix[i] + (Number(sessions[i]?.metHours) || 0);
    }

    const lowerBound = (arr: number[], x: number): number => {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < x) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    const upperBound = (arr: number[], x: number): number => {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] <= x) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    for (const assessment of sortedAssessments) {
      const id = assessment?.id ? String(assessment.id) : '';
      if (!id) continue;
      const dateMs = safeDateMsEndOfDay(assessment?.date ?? assessment?.assessment_date);
      if (!dateMs) continue;

      const bmr = getBmrKcal(assessment);
      const weightKg = getWeightKg(assessment);
      if (!bmr || !weightKg) continue;

      let eatPerDay = 0;
      if (sessions.length > 0) {
        const start = dateMs - lookbackMs;
        const l = lowerBound(dates, start);
        const r = upperBound(dates, dateMs);
        const sumMetHours = prefix[r] - prefix[l];
        const eatTotal = weightKg * sumMetHours;
        eatPerDay = eatTotal / LOOKBACK_DAYS;
        if (!Number.isFinite(eatPerDay) || eatPerDay < 0) eatPerDay = 0;
      }

      const baseline = bmr * BASE_ACTIVITY_FACTOR;
      const totalBeforeTef = baseline + eatPerDay;
      const tdee = totalBeforeTef * (1 + TEF_FACTOR);

      if (Number.isFinite(tdee) && tdee > 0) out.set(id, tdee);
    }

    return out;
  }, [sortedAssessments, workoutSessions]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartData = useMemo(() => buildAssessmentChartData(sortedAssessments) as any, [sortedAssessments]);

  const chartHasData = useMemo(() => checkChartHasData(chartData), [chartData]);

  const chartOptions = CHART_OPTIONS;

  const latestAssessment = sortedAssessments[sortedAssessments.length - 1];
  const previousAssessment = sortedAssessments[sortedAssessments.length - 2];

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

        {/* Gráficos escuros */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div
            className="rounded-2xl border p-5"
            style={{
              background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 mb-4">Evolução da Composição Corporal</h3>
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
          <div
            className="rounded-2xl border p-5"
            style={{
              background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 mb-4">Evolução do Peso</h3>
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

        <div
          className="rounded-2xl border p-5 mb-6"
          style={{
            background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <h3 className="text-sm font-black uppercase tracking-widest text-yellow-500/80 mb-4">Evolução das Circunferências</h3>
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
            {sortedAssessments.map((assessment, idx) => {
              const assessmentId = String(assessment?.id ?? idx)
              const photos = Array.isArray(assessment?.photos) ? assessment.photos : []
              const ageLabel = String(assessment?.age ?? '-')
              return (
                <div key={assessmentId} className="p-5 hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-black text-white text-sm sm:text-base truncate">
                            {formatDateCompact(assessment.date || assessment.assessment_date)}
                          </div>
                          <div className="text-xs text-neutral-500 mt-0.5 truncate">
                            {formatWeekdayCompact(assessment.date || assessment.assessment_date)}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-yellow-500/15 text-yellow-400 text-xs rounded-full border border-yellow-500/20 font-bold">
                            {ageLabel} anos
                          </span>
                          {photos.length > 0 && (
                            <span className="px-2.5 py-1 bg-green-500/15 text-green-400 text-xs rounded-full border border-green-500/20 font-bold">
                              Com fotos
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-sm">
                        <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Peso</div>
                          <div className="text-white font-black mt-1">{(() => {
                            const w = getWeightKg(assessment);
                            return w ? `${w.toFixed(1)} kg` : '-';
                          })()}</div>
                        </div>
                        <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">% Gordura</div>
                          <div className="text-white font-black mt-1">{(() => {
                            const bf = getBodyFatPercent(assessment);
                            return bf ? `${bf.toFixed(1)}%` : '-';
                          })()}</div>
                        </div>
                        <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Massa Magra</div>
                          <div className="text-white font-black mt-1">{(() => {
                            const lm = getLeanMassKg(assessment);
                            return lm ? `${lm.toFixed(1)} kg` : '-';
                          })()}</div>
                        </div>
                        <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">BMR</div>
                          <div className="text-white font-black mt-1">{(() => {
                            const v = getBmrKcal(assessment);
                            return v ? `${v.toFixed(0)} kcal` : '-';
                          })()}</div>
                        </div>
                        <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                          <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">TDEE</div>
                          <div className="text-white font-black mt-1">{(() => {
                            if (workoutSessionsLoading) return '...';
                            const v = tdeeByAssessmentId.get(String(assessment.id));
                            return v ? `${v.toFixed(0)} kcal` : '-';
                          })()}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row flex-wrap items-center gap-2 md:justify-end">
                      <button
                        onClick={() => setSelectedAssessment(selectedAssessment === assessmentId ? null : assessmentId)}
                        className="min-h-[44px] px-4 py-2 rounded-xl border text-yellow-500 hover:text-yellow-400 font-black hover:border-yellow-500/40 transition-all duration-300 active:scale-95"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        type="button"
                      >
                        {selectedAssessment === assessmentId ? 'Ocultar' : 'Detalhes'}
                      </button>
                      <AssessmentPDFGenerator
                        formData={{
                          assessment_date: String(assessment.assessment_date ?? ''),
                          weight: String(assessment.weight || ''),
                          height: String(assessment.height || ''),
                          age: String(assessment.age || ''),
                          gender: safeGender(assessment.gender),
                          arm_circ: String(getMeasurementCm(assessment, 'arm') || ''),
                          chest_circ: String(getMeasurementCm(assessment, 'chest') || ''),
                          waist_circ: String(getMeasurementCm(assessment, 'waist') || ''),
                          hip_circ: String(getMeasurementCm(assessment, 'hip') || ''),
                          thigh_circ: String(getMeasurementCm(assessment, 'thigh') || ''),
                          calf_circ: String(getMeasurementCm(assessment, 'calf') || ''),
                          triceps_skinfold: String(getSkinfoldMm(assessment, 'triceps') || ''),
                          biceps_skinfold: String(getSkinfoldMm(assessment, 'biceps') || ''),
                          subscapular_skinfold: String(getSkinfoldMm(assessment, 'subscapular') || ''),
                          suprailiac_skinfold: String(getSkinfoldMm(assessment, 'suprailiac') || ''),
                          abdominal_skinfold: String(getSkinfoldMm(assessment, 'abdominal') || ''),
                          thigh_skinfold: String(getSkinfoldMm(assessment, 'thigh') || ''),
                          calf_skinfold: String(getSkinfoldMm(assessment, 'calf') || ''),
                          observations: ''
                        }}
                        studentName={String(assessment.student_name ?? '')}
                        trainerName={String(assessment.trainer_name ?? '')}
                        assessmentDate={new Date(
                          typeof assessment.assessment_date === 'string' || typeof assessment.assessment_date === 'number' || assessment.assessment_date instanceof Date
                            ? assessment.assessment_date
                            : String(assessment.assessment_date ?? Date.now()),
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => handleOpenAssessmentPlanModal(assessment)}
                        disabled={!!aiPlanByAssessmentId[String(assessment.id)]?.loading}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-all duration-300 active:scale-95"
                      >
                        {aiPlanByAssessmentId[String(assessment.id)]?.loading ? 'Gerando plano…' : 'Plano Tático (AI)'}
                      </button>
                    </div>
                  </div>
                  {selectedAssessment === assessmentId && (
                    <div className="mt-4 pt-4 border-t border-neutral-700">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-bold text-white mb-2">Dobras Cutâneas (mm)</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {skinfoldFields.map(({ key, label }) => {
                              const value = getSkinfoldMm(assessment, key);
                              return (
                                <div key={key} className="flex justify-between">
                                  <span className="text-neutral-400">{label}:</span>
                                  <span className="font-medium text-white">{value == null ? '-' : String(value)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-bold text-white mb-2">Circunferências (cm)</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {measurementFields.map(({ key, label }) => {
                              const value = getMeasurementCm(assessment, key);
                              return (
                                <div key={key} className="flex justify-between">
                                  <span className="text-neutral-400">{label}:</span>
                                  <span className="font-medium text-white">{value == null ? '-' : String(value)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const s = aiPlanByAssessmentId[String(assessment.id)];
                        if (!s) return null;
                        const plan = s.plan && typeof s.plan === 'object' ? s.plan : null;
                        if (!plan && !s.loading && !s.error) return null;
                        const badge = (() => {
                          if (s.loading) return null;
                          if (s.error) return null;
                          if (s.usedAi) return { text: 'IA', tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' };
                          if (s.reason === 'missing_api_key') return { text: 'Sem IA (config)', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' };
                          if (s.reason === 'insufficient_data') return { text: 'Dados insuf.', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' };
                          if (s.reason === 'ai_failed') return { text: 'Fallback', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' };
                          return { text: 'Plano base', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' };
                        })();
                        return (
                          <div
                            className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                            ref={(el) => {
                              try {
                                planAnchorRefs.current[String(assessment.id)] = el;
                              } catch { }
                            }}
                          >
                            <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Resumo Tático</div>
                                {badge ? (
                                  <div className={`px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${badge.tone}`}>
                                    {badge.text}
                                  </div>
                                ) : null}
                              </div>
                              {s.loading ? (
                                <div className="text-sm text-neutral-300">Gerando plano tático personalizado…</div>
                              ) : s.error ? (
                                <div className="text-sm text-red-400">{s.error}</div>
                              ) : plan ? (
                                <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                                  {(() => {
                                    const raw = plan.summary
                                    const items = Array.isArray(raw) ? raw : []
                                    return items.length
                                      ? items.map((item: unknown, idx: number) => <li key={idx}>{String(item ?? '')}</li>)
                                      : null
                                  })()}
                                </ul>
                              ) : null}
                            </div>
                            {plan ? (
                              <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4 space-y-3">
                                {(() => {
                                  const raw = plan.training
                                  const items = Array.isArray(raw) ? raw : []
                                  if (!items.length) return null
                                  return (
                                    <div>
                                      <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Treino</div>
                                      <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                                        {items.map((item: unknown, idx: number) => (
                                          <li key={idx}>{String(item ?? '')}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )
                                })()}
                                {(() => {
                                  const raw = plan.nutrition
                                  const items = Array.isArray(raw) ? raw : []
                                  if (!items.length) return null
                                  return (
                                    <div>
                                      <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Nutrição</div>
                                      <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                                        {items.map((item: unknown, idx: number) => (
                                          <li key={idx}>{String(item ?? '')}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )
                                })()}
                                {(() => {
                                  const raw = plan.habits
                                  const items = Array.isArray(raw) ? raw : []
                                  if (!items.length) return null
                                  return (
                                    <div>
                                      <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Hábitos</div>
                                      <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                                        {items.map((item: unknown, idx: number) => (
                                          <li key={idx}>{String(item ?? '')}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )
                                })()}
                                {(() => {
                                  const raw = plan.warnings
                                  const items = Array.isArray(raw) ? raw : []
                                  if (!items.length) return null
                                  return (
                                    <div>
                                      <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Alertas</div>
                                      <ul className="text-sm text-neutral-300 space-y-1 list-disc list-inside">
                                        {items.map((item: unknown, idx: number) => (
                                          <li key={idx}>{String(item ?? '')}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )
                                })()}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {planModalOpen && planModalAssessment ? (
          <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPlanModalOpen(false)}>
            <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold truncate">Plano Tático</div>
                  <div className="text-white font-black truncate">
                    {formatDateCompact(planModalAssessment?.date || planModalAssessment?.assessment_date)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPlanModalOpen(false)}
                  className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 max-h-[80vh] overflow-y-auto space-y-3">
                {(() => {
                  const id = String(planModalAssessment?.id || '');
                  const s = id ? aiPlanByAssessmentId[id] : null;
                  const plan = s?.plan && typeof s.plan === 'object' ? s.plan : null;
                  const badge = (() => {
                    if (!s || s.loading) return null;
                    if (s.error) return null;
                    if (s.usedAi) return { text: 'IA', tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' };
                    if (s.reason === 'missing_api_key') return { text: 'Sem IA (config)', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' };
                    if (s.reason === 'insufficient_data') return { text: 'Dados insuf.', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' };
                    if (s.reason === 'ai_failed') return { text: 'Fallback', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' };
                    return { text: 'Plano base', tone: 'bg-neutral-800 text-neutral-200 border-neutral-700' };
                  })();

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Resumo Tático</div>
                        {badge ? (
                          <div className={`px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${badge.tone}`}>
                            {badge.text}
                          </div>
                        ) : null}
                      </div>
                      {s?.loading ? (
                        <div className="text-sm text-neutral-300">Gerando plano tático personalizado…</div>
                      ) : s?.error ? (
                        <div className="text-sm text-red-400">{s.error}</div>
                      ) : plan ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4">
                            <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                              {(() => {
                                const raw = plan.summary
                                const items = Array.isArray(raw) ? raw : []
                                return items.length
                                  ? items.map((item: unknown, idx: number) => <li key={idx}>{String(item ?? '')}</li>)
                                  : null
                              })()}
                            </ul>
                          </div>
                          <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4 space-y-3">
                            {(() => {
                              const raw = plan.training
                              const items = Array.isArray(raw) ? raw : []
                              if (!items.length) return null
                              return (
                                <div>
                                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Treino</div>
                                  <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                                    {items.map((item: unknown, idx: number) => (
                                      <li key={idx}>{String(item ?? '')}</li>
                                    ))}
                                  </ul>
                                </div>
                              )
                            })()}
                            {(() => {
                              const raw = plan.nutrition
                              const items = Array.isArray(raw) ? raw : []
                              if (!items.length) return null
                              return (
                                <div>
                                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Nutrição</div>
                                  <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                                    {items.map((item: unknown, idx: number) => (
                                      <li key={idx}>{String(item ?? '')}</li>
                                    ))}
                                  </ul>
                                </div>
                              )
                            })()}
                            {(() => {
                              const raw = plan.habits
                              const items = Array.isArray(raw) ? raw : []
                              if (!items.length) return null
                              return (
                                <div>
                                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Hábitos</div>
                                  <ul className="text-sm text-neutral-200 space-y-1 list-disc list-inside">
                                    {items.map((item: unknown, idx: number) => (
                                      <li key={idx}>{String(item ?? '')}</li>
                                    ))}
                                  </ul>
                                </div>
                              )
                            })()}
                            {(() => {
                              const raw = plan.warnings
                              const items = Array.isArray(raw) ? raw : []
                              if (!items.length) return null
                              return (
                                <div>
                                  <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-1">Alertas</div>
                                  <ul className="text-sm text-neutral-300 space-y-1 list-disc list-inside">
                                    {items.map((item: unknown, idx: number) => (
                                      <li key={idx}>{String(item ?? '')}</li>
                                    ))}
                                  </ul>
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-neutral-400">Nenhum plano disponível.</div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await handleGenerateAssessmentPlan(planModalAssessment, { openDetails: false });
                            } catch { }
                          }}
                          disabled={!!s?.loading}
                          className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-all duration-300 active:scale-95 disabled:opacity-60"
                        >
                          {s?.loading ? 'Gerando…' : 'Gerar novamente'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlanModalOpen(false)}
                          className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 transition-all duration-300 active:scale-95"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : null}

        {/* Modal do Formulário */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                <h3 className="font-bold text-white">Nova Avaliação</h3>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-neutral-800 rounded-full"><X className="w-5 h-5 text-neutral-400" /></button>
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
