// Hook para gerenciamento de avaliações físicas
'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  Assessment,
  AssessmentFormData,
  AssessmentResponse,
  AssessmentListResponse,
  CreateAssessmentRequest,
  UpdateAssessmentRequest,
  parseNumberInput,
  validateAssessmentForm
} from '@/types/assessment';
import {
  calculateSumSkinfolds,
  calculateBodyDensity,
  calculateBodyFatPercentage,
  calculateBMR,
  calculateBMI,
  calculateFatMass,
  calculateLeanMass
} from '@/utils/calculations/bodyComposition';
// Auth será obtido diretamente do Supabase nesta aplicação

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
        const { data: directProfile, error: directProfileError } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('id', candidateId)
          .maybeSingle();

        if (directProfileError) {
          console.error('Erro ao buscar perfil do aluno (por id) para avaliação', directProfileError);
        }

        if (directProfile?.id) {
          return directProfile.id as string;
        }

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

  const normalizeAssessmentRow = useCallback((row: any) => {
    if (!row || typeof row !== 'object') {
      return row;
    }

    const toNumberOrNull = (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const normalized = value.replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const resolveGender = (value: any): 'M' | 'F' | null => {
      return value === 'M' || value === 'F' ? value : null;
    };

    const measurementsSource =
      row.measurements && typeof row.measurements === 'object' ? row.measurements : null;
    const skinfoldsSource = row.skinfolds && typeof row.skinfolds === 'object' ? row.skinfolds : null;

    const measurements = {
      arm: toNumberOrNull(measurementsSource?.arm ?? row.arm_circ ?? row.arm),
      chest: toNumberOrNull(measurementsSource?.chest ?? row.chest_circ),
      waist: toNumberOrNull(measurementsSource?.waist ?? row.waist_circ ?? row.waist),
      hip: toNumberOrNull(measurementsSource?.hip ?? row.hip_circ),
      thigh: toNumberOrNull(measurementsSource?.thigh ?? row.thigh_circ),
      calf: toNumberOrNull(measurementsSource?.calf ?? row.calf_circ),
      sum7: toNumberOrNull(measurementsSource?.sum7 ?? row.sum7)
    };

    const skinfolds = {
      triceps: toNumberOrNull(skinfoldsSource?.triceps ?? row.triceps_skinfold),
      biceps: toNumberOrNull(skinfoldsSource?.biceps ?? row.biceps_skinfold),
      subscapular: toNumberOrNull(skinfoldsSource?.subscapular ?? row.subscapular_skinfold),
      suprailiac: toNumberOrNull(skinfoldsSource?.suprailiac ?? row.suprailiac_skinfold),
      abdominal: toNumberOrNull(skinfoldsSource?.abdominal ?? row.abdominal_skinfold),
      thigh: toNumberOrNull(skinfoldsSource?.thigh ?? row.thigh_skinfold),
      calf: toNumberOrNull(skinfoldsSource?.calf ?? row.calf_skinfold)
    };

    const weight = toNumberOrNull(row.weight);
    const height = toNumberOrNull(row.height);
    const age = toNumberOrNull(row.age);
    const gender = resolveGender(row.gender);

    const storedSum7 = toNumberOrNull(row.sum7 ?? measurements.sum7);
    let sum7 = storedSum7;
    if (!sum7 || sum7 <= 0) {
      try {
        const candidate = calculateSumSkinfolds({
          triceps_skinfold: skinfolds.triceps ?? undefined,
          biceps_skinfold: skinfolds.biceps ?? undefined,
          subscapular_skinfold: skinfolds.subscapular ?? undefined,
          suprailiac_skinfold: skinfolds.suprailiac ?? undefined,
          abdominal_skinfold: skinfolds.abdominal ?? undefined,
          thigh_skinfold: skinfolds.thigh ?? undefined,
          calf_skinfold: skinfolds.calf ?? undefined
        } as any);

        sum7 = candidate > 0 ? candidate : null;
      } catch {
        sum7 = null;
      }
    }

    const storedBf = toNumberOrNull(row.body_fat_percentage ?? row.bf);
    let bodyFatPercentage = storedBf;

    if ((!bodyFatPercentage || bodyFatPercentage <= 0) && sum7 && sum7 > 0 && age && age > 0 && gender) {
      try {
        const density = calculateBodyDensity(sum7, age, gender);
        const bf = calculateBodyFatPercentage(density);
        bodyFatPercentage = bf > 0 ? bf : null;
      } catch {
        bodyFatPercentage = null;
      }
    }

    const storedBmr = toNumberOrNull(row.bmr);
    let bmr = storedBmr;
    if ((!bmr || bmr <= 0) && weight && weight > 0 && height && height > 0 && age && age > 0 && gender) {
      try {
        bmr = calculateBMR(weight, height, age, gender);
      } catch {
        bmr = null;
      }
    }

    const storedBmi = toNumberOrNull(row.bmi);
    let bmi = storedBmi;
    if ((!bmi || bmi <= 0) && weight && weight > 0 && height && height > 0) {
      try {
        bmi = calculateBMI(weight, height);
      } catch {
        bmi = null;
      }
    }

    const storedFatMass = toNumberOrNull(row.fat_mass);
    const storedLeanMass = toNumberOrNull(row.lean_mass);
    let fatMass = storedFatMass;
    let leanMass = storedLeanMass;

    if (
      (!fatMass || fatMass <= 0 || !leanMass || leanMass <= 0) &&
      weight &&
      weight > 0 &&
      bodyFatPercentage &&
      bodyFatPercentage > 0
    ) {
      try {
        fatMass = calculateFatMass(weight, bodyFatPercentage);
        leanMass = calculateLeanMass(weight, fatMass);
      } catch {
        fatMass = fatMass && fatMass > 0 ? fatMass : null;
        leanMass = leanMass && leanMass > 0 ? leanMass : null;
      }
    }

    return {
      ...row,
      weight: weight ?? row.weight,
      height: height ?? row.height,
      age: age ?? row.age,
      gender: gender ?? row.gender,
      sum7: sum7 ?? row.sum7,
      bf: bodyFatPercentage ?? row.bf,
      body_fat_percentage: bodyFatPercentage ?? row.body_fat_percentage,
      bmr: bmr ?? row.bmr,
      bmi: bmi ?? row.bmi,
      fat_mass: fatMass ?? row.fat_mass,
      lean_mass: leanMass ?? row.lean_mass,
      measurements: {
        ...measurements,
        sum7: sum7 ?? measurements.sum7
      },
      skinfolds
    };
  }, []);

  // Converter dados do formulário para formato da API
  const formDataToAssessment = useCallback((data: AssessmentFormData, studentId: string) => {
    const weight = parseNumberInput(data.weight) || 0;
    const height = parseNumberInput(data.height) || 0;
    const age = parseInt(data.age) || 0;
    const gender = data.gender;

    const armCirc = parseNumberInput(data.arm_circ) || null;
    const chestCirc = parseNumberInput(data.chest_circ) || null;
    const waistCirc = parseNumberInput(data.waist_circ) || null;
    const hipCirc = parseNumberInput(data.hip_circ) || null;
    const thighCirc = parseNumberInput(data.thigh_circ) || null;
    const calfCirc = parseNumberInput(data.calf_circ) || null;

    const triceps = parseNumberInput(data.triceps_skinfold) || null;
    const biceps = parseNumberInput(data.biceps_skinfold) || null;
    const subscapular = parseNumberInput(data.subscapular_skinfold) || null;
    const suprailiac = parseNumberInput(data.suprailiac_skinfold) || null;
    const abdominal = parseNumberInput(data.abdominal_skinfold) || null;
    const thighSkinfold = parseNumberInput(data.thigh_skinfold) || null;
    const calfSkinfold = parseNumberInput(data.calf_skinfold) || null;

    let sumSkinfolds: number | null = null;
    let bodyDensity: number | null = null;
    let bodyFatPercentage: number | null = null;
    let bmi: number | null = null;
    let bmr: number | null = null;
    let fatMass: number | null = null;
    let leanMass: number | null = null;

    try {
      const skinfoldInput = {
        triceps_skinfold: triceps ?? undefined,
        biceps_skinfold: biceps ?? undefined,
        subscapular_skinfold: subscapular ?? undefined,
        suprailiac_skinfold: suprailiac ?? undefined,
        abdominal_skinfold: abdominal ?? undefined,
        thigh_skinfold: thighSkinfold ?? undefined,
        calf_skinfold: calfSkinfold ?? undefined
      } as Partial<Assessment>;

      const calculatedSum = calculateSumSkinfolds(skinfoldInput);
      sumSkinfolds = calculatedSum > 0 ? calculatedSum : null;
    } catch (e) {
      console.error('Erro ao calcular soma das dobras na avaliação', e);
      sumSkinfolds = null;
    }

    try {
      if (sumSkinfolds && age > 0 && (gender === 'M' || gender === 'F')) {
        const density = calculateBodyDensity(sumSkinfolds, age, gender);
        bodyDensity = density;
        const bf = calculateBodyFatPercentage(density);
        bodyFatPercentage = bf;
      }
    } catch (e) {
      console.error('Erro ao calcular percentual de gordura na avaliação', e);
      bodyDensity = null;
      bodyFatPercentage = null;
    }

    try {
      if (weight > 0 && height > 0) {
        bmi = calculateBMI(weight, height);
      }
    } catch (e) {
      console.error('Erro ao calcular IMC na avaliação', e);
      bmi = null;
    }

    try {
      if (weight > 0 && bodyFatPercentage && bodyFatPercentage > 0) {
        const fm = calculateFatMass(weight, bodyFatPercentage);
        const lm = calculateLeanMass(weight, fm);
        fatMass = fm;
        leanMass = lm;
      }
    } catch (e) {
      console.error('Erro ao calcular massa magra/gorda na avaliação', e);
      fatMass = null;
      leanMass = null;
    }

    try {
      if (weight > 0 && height > 0 && age > 0 && (gender === 'M' || gender === 'F')) {
        bmr = calculateBMR(weight, height, age, gender);
      }
    } catch (e) {
      console.error('Erro ao calcular BMR na avaliação', e);
      bmr = null;
    }

    return {
      student_id: studentId,
      trainer_id: user?.id || '',
      assessment_date: data.assessment_date,
      date: data.assessment_date ? new Date(data.assessment_date) : undefined,
      weight,
      height,
      age,
      gender,
      arm_circ: armCirc,
      chest_circ: chestCirc,
      waist_circ: waistCirc,
      hip_circ: hipCirc,
      thigh_circ: thighCirc,
      calf_circ: calfCirc,
      triceps_skinfold: triceps,
      biceps_skinfold: biceps,
      subscapular_skinfold: subscapular,
      suprailiac_skinfold: suprailiac,
      abdominal_skinfold: abdominal,
      thigh_skinfold: thighSkinfold,
      calf_skinfold: calfSkinfold,
      body_fat_percentage: bodyFatPercentage ?? null,
      lean_mass: leanMass ?? null,
      fat_mass: fatMass ?? null,
      bmr: bmr ?? null,
      bmi: bmi ?? null,
      bf: bodyFatPercentage ?? null,
      sum7: sumSkinfolds ?? null,
      waist: waistCirc ?? null,
      arm: armCirc ?? null,
      observations: data.observations || null
    } as any;
  }, [user?.id]);

  // Criar nova avaliação
  const createAssessment = useCallback(async (data: AssessmentFormData, studentId: string): Promise<AssessmentResponse> => {
    try {
      setLoading(true);
      setError(null);

      const validationErrors = validateAssessmentForm(data);
      if (Object.keys(validationErrors).length > 0) {
        throw new Error(`Erros de validação: ${Object.values(validationErrors).join(', ')}`);
      }

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const resolvedStudentId = await resolveStudentRecordId(studentId);

      const assessmentData = formDataToAssessment(data, resolvedStudentId);

      const { data: newAssessment, error: insertError } = await supabase
        .from('assessments')
        .insert(assessmentData)
        .select('*')
        .single();

      if (insertError) {
        console.error('Erro de inserção na tabela assessments', insertError);
        throw new Error(`Erro ao criar avaliação: ${insertError.message}`);
      }

      const formattedAssessment: Assessment = normalizeAssessmentRow(newAssessment) as Assessment;

      setAssessments(prev => [formattedAssessment, ...prev]);

      return {
        success: true,
        data: formattedAssessment,
        message: 'Avaliação criada com sucesso!'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao criar avaliação';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, [formDataToAssessment, normalizeAssessmentRow, resolveStudentRecordId, supabase, user]);

  // Atualizar avaliação
  const updateAssessment = useCallback(async (id: string, data: UpdateAssessmentRequest): Promise<AssessmentResponse> => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // Atualizar no banco de dados
      const { data: updatedAssessment, error: updateError } = await supabase
        .from('assessments')
        .update(data)
        .eq('id', id)
        .select('*')
        .single();

      if (updateError) {
        throw new Error(`Erro ao atualizar avaliação: ${updateError.message}`);
      }

      // Formatar resposta
      const formattedAssessment: Assessment = normalizeAssessmentRow(updatedAssessment) as Assessment;

      // Atualizar lista local
      setAssessments(prev => prev.map(assessment => 
        assessment.id === id ? formattedAssessment : assessment 
      ));

      return {
        success: true,
        data: formattedAssessment,
        message: 'Avaliação atualizada com sucesso!'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao atualizar avaliação';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, [normalizeAssessmentRow, supabase, user]);

  // Deletar avaliação
  const deleteAssessment = useCallback(async (id: string): Promise<AssessmentResponse> => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // Deletar do banco de dados
      const { error: deleteError } = await supabase
        .from('assessments')
        .delete()
        .eq('id', id);

      if (deleteError) {
        throw new Error(`Erro ao deletar avaliação: ${deleteError.message}`);
      }

      // Remover da lista local
      setAssessments(prev => prev.filter(assessment => assessment.id !== id));

      return {
        success: true,
        message: 'Avaliação deletada com sucesso!'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao deletar avaliação';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, [supabase, user]);

  // Buscar avaliação específica
  const getAssessment = useCallback(async (id: string): Promise<Assessment | null> => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        throw new Error(`Erro ao buscar avaliação: ${fetchError.message}`);
      }

      if (!data) {
        return null;
      }

      return normalizeAssessmentRow(data) as Assessment;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar avaliação';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [normalizeAssessmentRow, supabase]);

  // Buscar avaliações de um aluno específico
  const getStudentAssessments = useCallback(async (rawStudentId: string): Promise<Assessment[]> => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const resolvedStudentId = await resolveStudentRecordId(rawStudentId);

      const rawCandidateId = (rawStudentId || '').trim();
      const candidateIds = Array.from(
        new Set([resolvedStudentId, rawCandidateId].filter((id): id is string => !!id))
      );

      const query = supabase
        .from('assessments')
        .select('*')
        .in('student_id', candidateIds)
        .order('assessment_date', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(`Erro ao buscar avaliações: ${fetchError.message}`);
      }

      const normalized = (data || []).map(normalizeAssessmentRow) as Assessment[];
      const uniqueById = new Map<string, Assessment>();
      for (const item of normalized) {
        if (item?.id) uniqueById.set(item.id, item);
      }
      return Array.from(uniqueById.values());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar avaliações';
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  }, [normalizeAssessmentRow, resolveStudentRecordId, supabase, user]);

  // Atualizar lista de avaliações
  const refreshAssessments = useCallback(async (): Promise<void> => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('assessments')
        .select('*')
        .order('assessment_date', { ascending: false });
      // Se necessário, filtrar por usuário autenticado
      if (user?.id) {
        query = query.or(`student_id.eq.${user.id},trainer_id.eq.${user.id}`);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(`Erro ao buscar avaliações: ${fetchError.message}`);
      }

      setAssessments((data || []).map(normalizeAssessmentRow) as Assessment[]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar avaliações';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [normalizeAssessmentRow, supabase, user]);

  // Carregar avaliações iniciais
  useEffect(() => {
    if (user) {
      refreshAssessments();
    }
  }, [user, refreshAssessments]);

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
