/**
 * @module useAssessment
 *
 * Manages the lifecycle of physical assessments (avaliações físicas).
 * Provides CRUD operations against the `assessments` table, automatic
 * body-composition calculations (BF%, BMI, BMR, lean/fat mass), and
 * student ID resolution across `profiles` and `students` tables.
 *
 * @returns `{ assessments, loading, error, createAssessment, updateAssessment, deleteAssessment, ... }`
 */
'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import {
  Assessment,
  AssessmentFormData,
  AssessmentResponse,
  CreateAssessmentRequest,
  UpdateAssessmentRequest,
  parseNumberInput
} from '@/types/assessment';
import {
  calculateBodyFatPercentage,
  calculateBMR,
  calculateBMI,
  calculateFatMass,
  calculateLeanMass,
  calculateBodyDensity,
  calculateSumSkinfolds,
  combinedBodyFat
} from '@/utils/calculations/bodyComposition';
import { tryAutoPair } from '@/utils/calculations/assessmentPairing';
import { getErrorMessage } from '@/utils/errorMessage';
import { logError } from '@/lib/logger'
import { safePg, safePgLike } from '@/utils/safePgFilter'

interface UseAssessmentReturn {
  // Estado
  assessments: Assessment[];
  loading: boolean;
  error: string | null;

  // Ações
  createAssessment: (data: AssessmentFormData, studentId: string) => Promise<AssessmentResponse>;
  /**
   * Cria registro standalone de bioimpedância (sem dobras / medidas /
   * fotos). Usado pelo QuickBIAModal quando o aluno chega só com o PDF
   * da farmácia. Auto-pareia com 'full' próxima em ±14 dias.
   */
  createBiaAssessment: (
    data: {
      assessment_date: string;
      bia_body_fat_percentage: number | null;
      bia_lean_mass?: number | null;
      bia_fat_mass?: number | null;
      bia_water_percentage?: number | null;
      bia_visceral_fat?: number | null;
      bia_metabolic_age?: number | null;
      observations?: string;
    },
    studentId: string,
  ) => Promise<AssessmentResponse>;
  updateAssessment: (id: string, data: UpdateAssessmentRequest) => Promise<AssessmentResponse>;
  deleteAssessment: (id: string) => Promise<AssessmentResponse>;
  getAssessment: (id: string) => Promise<Assessment | null>;
  getStudentAssessments: (studentId: string) => Promise<Assessment[]>;
  refreshAssessments: () => Promise<void>;

  // Utilitários
  clearError: () => void;
  formDataToAssessment: (data: AssessmentFormData, studentId: string) => CreateAssessmentRequest;
}

export const useAssessment = (): UseAssessmentReturn => {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (isMounted) {
          setUser(user);
        }
      } catch (e) {
        logError('error', 'Erro ao carregar usuário no hook useAssessment', e);
        if (isMounted) {
          setUser(null);
        }
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resolveStudentRecordId = useCallback(
    async (rawStudentId: string): Promise<string> => {
      const candidateId = (rawStudentId || '').trim();

      if (!candidateId) {
        throw new Error('ID do aluno não informado para a avaliação.');
      }

      try {
        // Tenta buscar direto na profiles (se for ID de usuário)
        const { data: directProfile, error: directProfileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', candidateId)
          .maybeSingle();

        if (directProfileError) {
          logError('error', 'Erro ao buscar perfil do aluno (por id) para avaliação', directProfileError);
        }

        if (directProfile?.id) {
          return directProfile.id as string;
        }

        // Tenta buscar na tabela students pelo ID do registro
        const { data: studentById, error: studentByIdError } = await supabase
          .from('students')
          .select('id, user_id, email')
          .eq('id', candidateId)
          .maybeSingle();

        if (studentByIdError) {
          logError('error', 'Erro ao buscar aluno por id para avaliação', studentByIdError);
        }

        if (studentById?.user_id) {
          try {
            const { data: profileForStudent } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', studentById.user_id)
              .maybeSingle();

            if (profileForStudent?.id) {
              return profileForStudent.id as string;
            }
          } catch (e) {
            logError('error', 'Erro ao validar perfil vinculado ao aluno (por id)', e);
            return studentById.user_id as string;
          }
        }

        // Tenta buscar pelo email na profiles
        if (studentById?.email) {
          const { data: profileByEmail, error: profileByEmailError } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', safePgLike(studentById.email))
            .maybeSingle();

          if (profileByEmailError) {
            logError('error', 'Erro ao buscar perfil por email do aluno (por id)', profileByEmailError);
          }

          if (profileByEmail?.id) {
            return profileByEmail.id as string;
          }
        }

        // Tenta buscar na students pelo user_id
        const { data: studentByUser, error: studentByUserError } = await supabase
          .from('students')
          .select('id, user_id, email')
          .eq('user_id', candidateId)
          .maybeSingle();

        if (studentByUserError) {
          logError('error', 'Erro ao buscar aluno por user_id para avaliação', studentByUserError);
        }

        if (studentByUser?.user_id) {
          return studentByUser.user_id as string;
        }

        throw new Error(
          'Não foi possível localizar um perfil vinculado a este aluno. Verifique se o aluno já ativou a conta pelo convite.'
        );
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : 'Falha ao resolver o perfil vinculado à avaliação.';
        throw new Error(message);
      }
    },
    [supabase]
  );

  const normalizeAssessmentRow = useCallback((row: Record<string, unknown>): Assessment => {
    if (!row || typeof row !== 'object') {
      return row as unknown as Assessment;
    }

    const toNumberOrUndefined = (value: unknown): number | undefined => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? undefined : parsed;
      }
      return undefined;
    };

    return {
      ...row,
      weight: toNumberOrUndefined(row.weight) ?? 0,
      height: toNumberOrUndefined(row.height) ?? 0,
      age: toNumberOrUndefined(row.age) ?? 0,

      // Circunferências (com fallback para schema antigo)
      arm_circ: toNumberOrUndefined(row.arm_circ ?? row.arm),
      chest_circ: toNumberOrUndefined(row.chest_circ ?? row.chest),
      waist_circ: toNumberOrUndefined(row.waist_circ ?? row.waist),
      hip_circ: toNumberOrUndefined(row.hip_circ ?? row.hip),
      thigh_circ: toNumberOrUndefined(row.thigh_circ ?? row.thigh),
      calf_circ: toNumberOrUndefined(row.calf_circ ?? row.calf),

      // Dobras (com fallback para schema antigo)
      triceps_skinfold: toNumberOrUndefined(row.triceps_skinfold ?? row.triceps),
      biceps_skinfold: toNumberOrUndefined(row.biceps_skinfold ?? row.biceps),
      subscapular_skinfold: toNumberOrUndefined(row.subscapular_skinfold ?? row.subscapular),
      suprailiac_skinfold: toNumberOrUndefined(row.suprailiac_skinfold ?? row.suprailiac),
      abdominal_skinfold: toNumberOrUndefined(row.abdominal_skinfold ?? row.abdominal),
      thigh_skinfold: toNumberOrUndefined(row.thigh_skinfold ?? row.thigh_fold),
      calf_skinfold: toNumberOrUndefined(row.calf_skinfold ?? row.calf_fold),

      // Cálculos (com fallback)
      body_fat_percentage: toNumberOrUndefined(row.body_fat_percentage ?? row.bf),
      body_fat_percentage_skinfold: toNumberOrUndefined(row.body_fat_percentage_skinfold),
      lean_mass: toNumberOrUndefined(row.lean_mass),
      fat_mass: toNumberOrUndefined(row.fat_mass),
      bmr: toNumberOrUndefined(row.bmr),
      tdee: toNumberOrUndefined(row.tdee),
      bmi: toNumberOrUndefined(row.bmi),

      // Bioimpedância (postgres numeric pode vir como string)
      bia_body_fat_percentage: toNumberOrUndefined(row.bia_body_fat_percentage),
      bia_lean_mass: toNumberOrUndefined(row.bia_lean_mass),
      bia_fat_mass: toNumberOrUndefined(row.bia_fat_mass),
      bia_water_percentage: toNumberOrUndefined(row.bia_water_percentage),
      bia_visceral_fat: toNumberOrUndefined(row.bia_visceral_fat),
      bia_metabolic_age: toNumberOrUndefined(row.bia_metabolic_age),

      // Pareamento — strings/null vão direto
      assessment_type: (row.assessment_type === 'bia' ? 'bia' : 'full') as 'full' | 'bia',
      paired_assessment_id: row.paired_assessment_id ? String(row.paired_assessment_id) : null,
    } as Assessment;
  }, []);

  const getAssessment = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return normalizeAssessmentRow(data);
    } catch (e: unknown) {
      logError('error', 'Erro ao buscar avaliação:', e);
      setError(getErrorMessage(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [supabase, normalizeAssessmentRow]);

  const getStudentAssessments = useCallback(async (studentId: string) => {
    try {
      setLoading(true);
      setError(null);

      const resolvedId = await resolveStudentRecordId(studentId);
      setCurrentStudentId(resolvedId);

      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .or(`student_id.eq.${safePg(resolvedId)},user_id.eq.${safePg(resolvedId)}`)
        .order('assessment_date', { ascending: false });

      if (error) throw error;

      const normalized = (data || []).map(normalizeAssessmentRow);
      setAssessments(normalized);
      return normalized;
    } catch (e: unknown) {
      logError('error', 'Erro ao buscar avaliações do aluno:', e);
      setError(getErrorMessage(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, [supabase, resolveStudentRecordId, normalizeAssessmentRow]);

  const refreshAssessments = useCallback(async () => {
    if (currentStudentId) {
      await getStudentAssessments(currentStudentId);
    }
  }, [currentStudentId, getStudentAssessments]);

  const formDataToAssessment = useCallback((data: AssessmentFormData, studentId: string): CreateAssessmentRequest => {
    // Converter valores
    const weight = parseNumberInput(data.weight) || 0;
    const height = parseNumberInput(data.height) || 0;
    const age = parseInt(data.age) || 0;
    const gender = data.gender;

    // Helper: average of left+right, or single side, or direct field
    const dataRec = data as unknown as Record<string, string>;
    const avgOrDirect = (
      directField: string,
      leftField: string,
      rightField: string
    ): number | null => {
      const l = parseNumberInput(dataRec[leftField] ?? '');
      const r = parseNumberInput(dataRec[rightField] ?? '');
      if (l != null && l > 0 && r != null && r > 0) return Math.round(((l + r) / 2) * 100) / 100;
      if (l != null && l > 0) return l;
      if (r != null && r > 0) return r;
      return parseNumberInput(dataRec[directField] ?? '');
    };

    // Dobras — bilateral fields averaged
    const triceps = avgOrDirect('triceps_skinfold', 'triceps_skinfold_left', 'triceps_skinfold_right');
    const biceps = avgOrDirect('biceps_skinfold', 'biceps_skinfold_left', 'biceps_skinfold_right');
    const subscapular = parseNumberInput(data.subscapular_skinfold);
    const suprailiac = parseNumberInput(data.suprailiac_skinfold);
    const abdominal = parseNumberInput(data.abdominal_skinfold);
    const thighSkin = avgOrDirect('thigh_skinfold', 'thigh_skinfold_left', 'thigh_skinfold_right');
    const calfSkin = avgOrDirect('calf_skinfold', 'calf_skinfold_left', 'calf_skinfold_right');

    // Circunferências — bilateral fields averaged
    const armCirc = avgOrDirect('arm_circ', 'arm_circ_left', 'arm_circ_right');
    const thighCirc = avgOrDirect('thigh_circ', 'thigh_circ_left', 'thigh_circ_right');
    const calfCirc = avgOrDirect('calf_circ', 'calf_circ_left', 'calf_circ_right');

    // Calcular métricas das dobras (Siri/Pollock). Antes lançava erro quando
    // o usuário não preenchia dobras suficientes; agora trata isso como
    // "esse método não foi usado" e delega para a BIA (ou fica vazio).
    const sumSkinfolds = calculateSumSkinfolds({
      triceps_skinfold: triceps ?? undefined,
      biceps_skinfold: biceps ?? undefined,
      subscapular_skinfold: subscapular ?? undefined,
      suprailiac_skinfold: suprailiac ?? undefined,
      abdominal_skinfold: abdominal ?? undefined,
      thigh_skinfold: thighSkin ?? undefined,
      calf_skinfold: calfSkin ?? undefined,
    });

    let bodyFatSkinfold: number | null = null;
    if (sumSkinfolds > 0 && age > 0) {
      try {
        const bodyDensity = calculateBodyDensity(sumSkinfolds, age, gender);
        bodyFatSkinfold = calculateBodyFatPercentage(bodyDensity);
      } catch {
        // Dobras incompletas/inconsistentes — segue sem skinfold-derived.
        bodyFatSkinfold = null;
      }
    }

    // Bioimpedância — apenas o %BF é "principal" para a média ponderada;
    // os demais campos são extras de rastreabilidade salvos verbatim.
    const biaBodyFat = parseNumberInput(data.bia_body_fat_percentage);
    const biaLeanMass = parseNumberInput(data.bia_lean_mass);
    const biaFatMass = parseNumberInput(data.bia_fat_mass);
    const biaWaterPct = parseNumberInput(data.bia_water_percentage);
    const biaVisceralFat = parseNumberInput(data.bia_visceral_fat);
    const biaMetabolicAge = parseNumberInput(data.bia_metabolic_age);

    // %BF "blended" = média simples skinfold + BIA (quando ambos), senão o
    // que estiver disponível. É esse valor que alimenta histórico/gráficos.
    const bodyFat = combinedBodyFat(bodyFatSkinfold, biaBodyFat);

    // Massa magra/gorda derivam do %BF blended quando há um. Se nenhum dos
    // dois métodos foi usado, retornamos undefined em vez de chutar zeros.
    let fatMass: number | undefined;
    let leanMass: number | undefined;
    if (bodyFat != null && weight > 0) {
      try {
        fatMass = calculateFatMass(weight, bodyFat);
        leanMass = calculateLeanMass(weight, fatMass);
      } catch {
        fatMass = undefined;
        leanMass = undefined;
      }
    }

    const bmi = weight > 0 && height > 0 ? calculateBMI(weight, height) : 0;
    const bmr = weight > 0 && height > 0 && age > 0
      ? calculateBMR(weight, height, age, gender)
      : 0;

    return {
      student_id: studentId,
      trainer_id: user?.id || '',
      assessment_date: data.assessment_date,
      weight,
      height,
      age,
      gender,

      // Circunferências (médias bilaterais)
      arm_circ: armCirc ?? undefined,
      arm_circ_left: parseNumberInput(data.arm_circ_left) ?? undefined,
      arm_circ_right: parseNumberInput(data.arm_circ_right) ?? undefined,
      chest_circ: parseNumberInput(data.chest_circ) ?? undefined,
      waist_circ: parseNumberInput(data.waist_circ) ?? undefined,
      hip_circ: parseNumberInput(data.hip_circ) ?? undefined,
      thigh_circ: thighCirc ?? undefined,
      thigh_circ_left: parseNumberInput(data.thigh_circ_left) ?? undefined,
      thigh_circ_right: parseNumberInput(data.thigh_circ_right) ?? undefined,
      calf_circ: calfCirc ?? undefined,
      calf_circ_left: parseNumberInput(data.calf_circ_left) ?? undefined,
      calf_circ_right: parseNumberInput(data.calf_circ_right) ?? undefined,

      // Dobras (médias bilaterais)
      triceps_skinfold: triceps ?? undefined,
      triceps_skinfold_left: parseNumberInput(data.triceps_skinfold_left) ?? undefined,
      triceps_skinfold_right: parseNumberInput(data.triceps_skinfold_right) ?? undefined,
      biceps_skinfold: biceps ?? undefined,
      biceps_skinfold_left: parseNumberInput(data.biceps_skinfold_left) ?? undefined,
      biceps_skinfold_right: parseNumberInput(data.biceps_skinfold_right) ?? undefined,
      subscapular_skinfold: subscapular ?? undefined,
      suprailiac_skinfold: suprailiac ?? undefined,
      abdominal_skinfold: abdominal ?? undefined,
      thigh_skinfold: thighSkin ?? undefined,
      thigh_skinfold_left: parseNumberInput(data.thigh_skinfold_left) ?? undefined,
      thigh_skinfold_right: parseNumberInput(data.thigh_skinfold_right) ?? undefined,
      calf_skinfold: calfSkin ?? undefined,
      calf_skinfold_left: parseNumberInput(data.calf_skinfold_left) ?? undefined,
      calf_skinfold_right: parseNumberInput(data.calf_skinfold_right) ?? undefined,

      // Calculados — body_fat_percentage agora é o blended (skinfold+BIA
      // quando ambos), e mantemos o skinfold-only separado para o UI/PDF.
      body_fat_percentage: bodyFat ?? undefined,
      body_fat_percentage_skinfold: bodyFatSkinfold ?? undefined,
      lean_mass: leanMass,
      fat_mass: fatMass,
      bmi,
      bmr,

      // Bioimpedância — todos opcionais. Salvamos verbatim o que o usuário
      // digitou pra ter rastreabilidade do aparelho (alguns têm extras como
      // gordura visceral e idade metabólica).
      bia_body_fat_percentage: biaBodyFat ?? undefined,
      bia_lean_mass: biaLeanMass ?? undefined,
      bia_fat_mass: biaFatMass ?? undefined,
      bia_water_percentage: biaWaterPct ?? undefined,
      bia_visceral_fat: biaVisceralFat ?? undefined,
      bia_metabolic_age: biaMetabolicAge ?? undefined,

      // Tipo do registro — esse fluxo (formDataToAssessment) sempre cria
      // avaliação 'full' (passa pelos steps completos). Registros 'bia'
      // standalone usam outro caminho (createBiaAssessment).
      assessment_type: 'full' as const,

      observations: data.observations
    };
  }, [user?.id]);

  const createAssessment = useCallback(async (data: AssessmentFormData, studentId: string): Promise<AssessmentResponse> => {
    try {
      setLoading(true);
      setError(null);

      if (!user?.id) throw new Error('Usuário não autenticado');

      const resolvedStudentId = await resolveStudentRecordId(studentId);
      const payload = formDataToAssessment(data, resolvedStudentId);

      // Garantir trainer_id
      payload.trainer_id = user.id;

      const { data: newAssessment, error: insertError } = await supabase
        .from('assessments')
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;

      // Auto-pair: tenta cruzar essa avaliação 'full' com algum registro
      // 'bia' standalone do mesmo aluno em ±14 dias. Falha não bloqueia o
      // fluxo principal — o registro já foi salvo, pareamento é cosmético.
      try {
        const pairId = await tryAutoPair(supabase, {
          id: String(newAssessment.id),
          student_id: String(newAssessment.student_id),
          assessment_type: 'full',
          assessment_date: String(newAssessment.assessment_date),
        });
        if (pairId) {
          (newAssessment as Record<string, unknown>).paired_assessment_id = pairId;
        }
      } catch (pairErr) {
        logError('error', 'Erro ao parear avaliação:', pairErr);
      }

      const normalized = normalizeAssessmentRow(newAssessment);
      setAssessments(prev => [normalized, ...prev]);

      return { success: true, data: normalized };
    } catch (e: unknown) {
      logError('error', 'Erro ao criar avaliação:', e);
      setError(getErrorMessage(e));
      return { success: false, error: getErrorMessage(e) };
    } finally {
      setLoading(false);
    }
  }, [supabase, user?.id, resolveStudentRecordId, formDataToAssessment, normalizeAssessmentRow]);

  /**
   * Cria um registro standalone de bioimpedância (assessment_type='bia').
   *
   * Usa quando o aluno chega com o PDF da farmácia/clínica — sem passar
   * pelo formulário completo de dobras+medidas+fotos. Após inserir,
   * tenta auto-parear com uma avaliação 'full' do mesmo aluno em ±14 dias.
   */
  const createBiaAssessment = useCallback(async (
    data: {
      assessment_date: string;
      bia_body_fat_percentage: number | null;
      bia_lean_mass?: number | null;
      bia_fat_mass?: number | null;
      bia_water_percentage?: number | null;
      bia_visceral_fat?: number | null;
      bia_metabolic_age?: number | null;
      observations?: string;
    },
    studentId: string,
  ): Promise<AssessmentResponse> => {
    try {
      setLoading(true);
      setError(null);
      if (!user?.id) throw new Error('Usuário não autenticado');

      const resolvedStudentId = await resolveStudentRecordId(studentId);

      // Para registros 'bia' standalone, body_fat_percentage = o valor do
      // BIA (ele é o único método disponível nesse registro). Massa magra
      // / fat_mass derivam dele se o aluno pesou na máquina; senão ficam
      // null e o histórico/gráfico só mostra %BF do BIA.
      const bia = data.bia_body_fat_percentage;

      const payload = {
        student_id: resolvedStudentId,
        trainer_id: user.id,
        assessment_date: data.assessment_date,
        // Campos de antropometria zerados — esse registro não os coleta.
        // O Assessment type permite ausentes e o resto da app já trata
        // weight/height/age 0 como "não informado".
        weight: 0,
        height: 0,
        age: 0,
        gender: 'M' as const,
        // BIA verbatim
        bia_body_fat_percentage: bia ?? undefined,
        bia_lean_mass: data.bia_lean_mass ?? undefined,
        bia_fat_mass: data.bia_fat_mass ?? undefined,
        bia_water_percentage: data.bia_water_percentage ?? undefined,
        bia_visceral_fat: data.bia_visceral_fat ?? undefined,
        bia_metabolic_age: data.bia_metabolic_age ?? undefined,
        // body_fat_percentage = BIA pra alimentar gráfico/histórico
        body_fat_percentage: bia ?? undefined,
        assessment_type: 'bia' as const,
        observations: data.observations || '',
      };

      const { data: newAssessment, error: insertError } = await supabase
        .from('assessments')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;

      // Auto-pair com avaliação 'full' próxima
      try {
        const pairId = await tryAutoPair(supabase, {
          id: String(newAssessment.id),
          student_id: String(newAssessment.student_id),
          assessment_type: 'bia',
          assessment_date: String(newAssessment.assessment_date),
        });
        if (pairId) {
          (newAssessment as Record<string, unknown>).paired_assessment_id = pairId;
        }
      } catch (pairErr) {
        logError('error', 'Erro ao parear avaliação BIA:', pairErr);
      }

      const normalized = normalizeAssessmentRow(newAssessment);
      setAssessments(prev => [normalized, ...prev]);
      return { success: true, data: normalized };
    } catch (e: unknown) {
      logError('error', 'Erro ao criar avaliação BIA:', e);
      setError(getErrorMessage(e));
      return { success: false, error: getErrorMessage(e) };
    } finally {
      setLoading(false);
    }
  }, [supabase, user?.id, resolveStudentRecordId, normalizeAssessmentRow]);

  const updateAssessment = useCallback(async (id: string, data: UpdateAssessmentRequest): Promise<AssessmentResponse> => {
    try {
      setLoading(true);
      setError(null);

      const { data: updated, error: updateError } = await supabase
        .from('assessments')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      const normalized = normalizeAssessmentRow(updated);
      setAssessments(prev => prev.map(a => a.id === id ? normalized : a));

      return { success: true, data: normalized };
    } catch (e: unknown) {
      logError('error', 'Erro ao atualizar avaliação:', e);
      setError(getErrorMessage(e));
      return { success: false, error: getErrorMessage(e) };
    } finally {
      setLoading(false);
    }
  }, [supabase, normalizeAssessmentRow]);

  const deleteAssessment = useCallback(async (id: string): Promise<AssessmentResponse> => {
    try {
      setLoading(true);
      setError(null);

      const { error: deleteError } = await supabase
        .from('assessments')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setAssessments(prev => prev.filter(a => a.id !== id));

      return { success: true };
    } catch (e: unknown) {
      logError('error', 'Erro ao excluir avaliação:', e);
      setError(getErrorMessage(e));
      return { success: false, error: getErrorMessage(e) };
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  return {
    assessments,
    loading,
    error,
    createAssessment,
    createBiaAssessment,
    updateAssessment,
    deleteAssessment,
    getAssessment,
    getStudentAssessments,
    refreshAssessments,
    clearError,
    formDataToAssessment
  };
};
