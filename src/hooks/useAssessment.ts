// Hook para gerenciamento de avaliações físicas
'use client';
import { useState, useCallback, useEffect } from 'react';
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
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    loadUser();
  }, []);

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Converter dados do formulário para formato da API
  const formDataToAssessment = useCallback((data: AssessmentFormData, studentId: string) => {
    return {
      student_id: studentId,
      trainer_id: user?.id || '',
      assessment_date: data.assessment_date,
      weight: parseNumberInput(data.weight) || 0,
      height: parseNumberInput(data.height) || 0,
      age: parseInt(data.age) || 0,
      gender: data.gender,
      arm_circ: parseNumberInput(data.arm_circ) || null,
      chest_circ: parseNumberInput(data.chest_circ) || null,
      waist_circ: parseNumberInput(data.waist_circ) || null,
      hip_circ: parseNumberInput(data.hip_circ) || null,
      thigh_circ: parseNumberInput(data.thigh_circ) || null,
      calf_circ: parseNumberInput(data.calf_circ) || null,
      triceps_skinfold: parseNumberInput(data.triceps_skinfold) || null,
      biceps_skinfold: parseNumberInput(data.biceps_skinfold) || null,
      subscapular_skinfold: parseNumberInput(data.subscapular_skinfold) || null,
      suprailiac_skinfold: parseNumberInput(data.suprailiac_skinfold) || null,
      abdominal_skinfold: parseNumberInput(data.abdominal_skinfold) || null,
      thigh_skinfold: parseNumberInput(data.thigh_skinfold) || null,
      calf_skinfold: parseNumberInput(data.calf_skinfold) || null,
      observations: data.observations || null
    } as any;
  }, [user?.id]);

  // Criar nova avaliação
  const createAssessment = useCallback(async (data: AssessmentFormData, studentId: string): Promise<AssessmentResponse> => {
    try {
      setLoading(true);
      setError(null);

      // Validar dados do formulário
      const validationErrors = validateAssessmentForm(data);
      if (Object.keys(validationErrors).length > 0) {
        throw new Error(`Erros de validação: ${Object.values(validationErrors).join(', ')}`);
      }

      // Verificar usuário autenticado
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // Converter dados do formulário
      const assessmentData = formDataToAssessment(data, studentId);

      // Inserir no banco de dados
      const { data: newAssessment, error: insertError } = await supabase
        .from('assessments')
        .insert(assessmentData)
        .select('*')
        .single();

      if (insertError) {
        throw new Error(`Erro ao criar avaliação: ${insertError.message}`);
      }

      // Formatar resposta
      const formattedAssessment: Assessment = newAssessment as Assessment;

      // Atualizar lista local
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
  }, [user, formDataToAssessment]);

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
      const formattedAssessment: Assessment = updatedAssessment as Assessment;

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
  }, [user]);

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
  }, [user]);

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

      return data as Assessment;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar avaliação';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar avaliações de um aluno específico
  const getStudentAssessments = useCallback(async (studentId: string): Promise<Assessment[]> => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const query = supabase
        .from('assessments')
        .select('*')
        .eq('student_id', studentId)
        .order('assessment_date', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(`Erro ao buscar avaliações: ${fetchError.message}`);
      }

      return (data || []) as Assessment[];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar avaliações';
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

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

      setAssessments((data || []) as Assessment[]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar avaliações';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [user]);

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

