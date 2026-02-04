// Hook para gerenciamento de avaliações físicas
'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
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
  calculateSumSkinfolds
} from '@/utils/calculations/bodyComposition';

interface UseAssessmentReturn {
  // Estado
  assessments: Assessment[];
  loading: boolean;
  error: string | null;
  
  // Ações
  createAssessment: (data: AssessmentFormData, studentId: string) => Promise<AssessmentResponse>;
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
  const [user, setUser] = useState<any>(null);
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
        console.error('Erro ao carregar usuário no hook useAssessment', e);
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
          console.error('Erro ao buscar perfil do aluno (por id) para avaliação', directProfileError);
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
          console.error('Erro ao buscar aluno por id para avaliação', studentByIdError);
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
            console.error('Erro ao validar perfil vinculado ao aluno (por id)', e);
            return studentById.user_id as string;
          }
        }

        // Tenta buscar pelo email na profiles
        if (studentById?.email) {
          const { data: profileByEmail, error: profileByEmailError } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', studentById.email)
            .maybeSingle();

          if (profileByEmailError) {
            console.error('Erro ao buscar perfil por email do aluno (por id)', profileByEmailError);
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
          console.error('Erro ao buscar aluno por user_id para avaliação', studentByUserError);
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

  const normalizeAssessmentRow = useCallback((row: any): Assessment => {
    if (!row || typeof row !== 'object') {
      return row;
    }

    const toNumberOrUndefined = (value: any) => {
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
      lean_mass: toNumberOrUndefined(row.lean_mass),
      fat_mass: toNumberOrUndefined(row.fat_mass),
      bmr: toNumberOrUndefined(row.bmr),
      tdee: toNumberOrUndefined(row.tdee),
      bmi: toNumberOrUndefined(row.bmi),
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
    } catch (e: any) {
      console.error('Erro ao buscar avaliação:', e);
      setError(e.message);
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
        .or(`student_id.eq.${resolvedId},user_id.eq.${resolvedId}`)
        .order('assessment_date', { ascending: false });

      if (error) throw error;
      
      const normalized = (data || []).map(normalizeAssessmentRow);
      setAssessments(normalized);
      return normalized;
    } catch (e: any) {
      console.error('Erro ao buscar avaliações do aluno:', e);
      setError(e.message);
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

    // Dobras
    const triceps = parseNumberInput(data.triceps_skinfold);
    const biceps = parseNumberInput(data.biceps_skinfold);
    const subscapular = parseNumberInput(data.subscapular_skinfold);
    const suprailiac = parseNumberInput(data.suprailiac_skinfold);
    const abdominal = parseNumberInput(data.abdominal_skinfold);
    const thigh = parseNumberInput(data.thigh_skinfold);
    const calf = parseNumberInput(data.calf_skinfold);

    // Calcular métricas
    const sumSkinfolds = calculateSumSkinfolds({
      triceps_skinfold: triceps ?? undefined,
      biceps_skinfold: biceps ?? undefined,
      subscapular_skinfold: subscapular ?? undefined,
      suprailiac_skinfold: suprailiac ?? undefined,
      abdominal_skinfold: abdominal ?? undefined,
      thigh_skinfold: thigh ?? undefined,
      calf_skinfold: calf ?? undefined,
    });

    const bodyDensity = calculateBodyDensity(sumSkinfolds, age, gender);
    const bodyFat = calculateBodyFatPercentage(bodyDensity);
    const fatMass = calculateFatMass(weight, bodyFat);
    const leanMass = calculateLeanMass(weight, fatMass);
    const bmi = calculateBMI(weight, height);
    const bmr = calculateBMR(weight, height, age, gender);

    return {
      student_id: studentId,
      trainer_id: user?.id, // Será preenchido pelo hook ou backend
      assessment_date: data.assessment_date,
      weight,
      height,
      age,
      gender,
      
      // Circunferências
      arm_circ: parseNumberInput(data.arm_circ) ?? undefined,
      chest_circ: parseNumberInput(data.chest_circ) ?? undefined,
      waist_circ: parseNumberInput(data.waist_circ) ?? undefined,
      hip_circ: parseNumberInput(data.hip_circ) ?? undefined,
      thigh_circ: parseNumberInput(data.thigh_circ) ?? undefined,
      calf_circ: parseNumberInput(data.calf_circ) ?? undefined,

      // Dobras
      triceps_skinfold: triceps ?? undefined,
      biceps_skinfold: biceps ?? undefined,
      subscapular_skinfold: subscapular ?? undefined,
      suprailiac_skinfold: suprailiac ?? undefined,
      abdominal_skinfold: abdominal ?? undefined,
      thigh_skinfold: thigh ?? undefined,
      calf_skinfold: calf ?? undefined,

      // Calculados
      body_fat_percentage: bodyFat,
      lean_mass: leanMass,
      fat_mass: fatMass,
      bmi,
      bmr,
      
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

      const normalized = normalizeAssessmentRow(newAssessment);
      setAssessments(prev => [normalized, ...prev]);
      
      return { success: true, data: normalized };
    } catch (e: any) {
      console.error('Erro ao criar avaliação:', e);
      setError(e.message);
      return { success: false, error: e.message };
    } finally {
      setLoading(false);
    }
  }, [supabase, user?.id, resolveStudentRecordId, formDataToAssessment, normalizeAssessmentRow]);

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
    } catch (e: any) {
      console.error('Erro ao atualizar avaliação:', e);
      setError(e.message);
      return { success: false, error: e.message };
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
    } catch (e: any) {
      console.error('Erro ao excluir avaliação:', e);
      setError(e.message);
      return { success: false, error: e.message };
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  return {
    assessments,
    loading,
    error,
    createAssessment,
    updateAssessment,
    deleteAssessment,
    getAssessment,
    getStudentAssessments,
    refreshAssessments,
    clearError,
    formDataToAssessment
  };
};
