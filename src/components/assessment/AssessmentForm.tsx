// Componente principal do formulário de avaliação física
'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Ruler, 
  Calendar, 
  Weight, 
  Camera, 
  FileText, 
  Save, 
  ArrowLeft, 
  ArrowRight,
  AlertCircle 
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

import { AssessmentFormData, isValidGender } from '@/types/assessment';
import { useAssessment } from '@/hooks/useAssessment';
import { useDialog } from '@/contexts/DialogContext';
import { BasicInfoStep } from './BasicInfoStep';
import { MeasurementStep } from './MeasurementStep';
import { SkinfoldStep } from './SkinfoldStep';
import PhotoUploadStep from './PhotoUploadStep';
import ResultsPreview from './ResultsPreview';
import { logError, logWarn, logInfo } from '@/lib/logger'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

interface AssessmentFormProps {
  studentId: string;
  studentName: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

type AssessmentStepComponent = React.ComponentType<AssessmentStepProps>;
type PhotoStepComponent = typeof PhotoUploadStep;
type ResultsStepComponent = typeof ResultsPreview;

type FormStep =
  | {
      id: 'basic' | 'measurements' | 'skinfolds';
      title: string;
      description: string;
      icon: React.ComponentType<LucideProps>;
      component: AssessmentStepComponent;
      required: true;
    }
  | {
      id: 'photos';
      title: string;
      description: string;
      icon: React.ComponentType<LucideProps>;
      component: PhotoStepComponent;
      required: false;
    }
  | {
      id: 'results';
      title: string;
      description: string;
      icon: React.ComponentType<LucideProps>;
      component: ResultsStepComponent;
      required: true;
    };

type AssessmentStepProps = {
  formData: AssessmentFormData;
  updateFormData: (updates: Partial<AssessmentFormData>) => void;
  errors: Record<string, string>;
  studentName: string;
};

const buildDefaultFormData = (): AssessmentFormData => ({
  assessment_date: new Date().toISOString().split('T')[0],
  weight: '',
  height: '',
  age: '',
  gender: 'M',
  arm_circ: '',
  chest_circ: '',
  waist_circ: '',
  hip_circ: '',
  thigh_circ: '',
  calf_circ: '',
  triceps_skinfold: '',
  biceps_skinfold: '',
  subscapular_skinfold: '',
  suprailiac_skinfold: '',
  abdominal_skinfold: '',
  thigh_skinfold: '',
  calf_skinfold: '',
  observations: ''
});

export const AssessmentForm: React.FC<AssessmentFormProps> = ({
  studentId,
  studentName,
  onSuccess,
  onCancel
}) => {
  const { createAssessment, loading, error } = useAssessment();
  const { alert } = useDialog();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<AssessmentFormData>(() => {
    const base = buildDefaultFormData();

    if (typeof window === 'undefined') {
      return base;
    }

    try {
      const storageKey = `assessment_import_${studentId}`;
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        return base;
      }

      const parsed = parseJsonWithSchema(raw, z.record(z.unknown()));
      const parsedObj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      const source: Record<string, unknown> = parsedObj?.formData && typeof parsedObj.formData === 'object'
        ? (parsedObj.formData as Record<string, unknown>)
        : parsedObj;

      if (!source || typeof source !== 'object') {
        return base;
      }

      const merged: AssessmentFormData = { ...base };
      (Object.keys(base) as (keyof AssessmentFormData)[]).forEach((field) => {
        const value = (source as Record<string, unknown>)[field];
        if (value !== undefined && value !== null && value !== '') {
          if (field === 'gender') {
            if (isValidGender(value)) {
              merged.gender = value;
            }
            return;
          }

          merged[field as Exclude<keyof AssessmentFormData, 'gender'>] = String(value);
        }
      });

      return merged;
    } catch (error) {
      logError('error', 'Erro ao aplicar dados de avaliação importados', error);
      return base;
    }
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const storageKey = `assessment_import_${studentId}`;
      if (window.sessionStorage.getItem(storageKey)) {
        window.sessionStorage.removeItem(storageKey);
      }
    } catch (error) {
      logError('error', 'Erro ao limpar dados de avaliação importados', error);
    }
  }, [studentId]);

  const steps = useMemo<FormStep[]>(() => {
    return [
      {
        id: 'basic',
        title: 'Informações Básicas',
        description: 'Dados pessoais e antropométricos',
        icon: User,
        component: BasicInfoStep,
        required: true
      },
      {
        id: 'measurements',
        title: 'Medidas Corporais',
        description: 'Circunferências e medidas',
        icon: Ruler,
        component: MeasurementStep,
        required: true
      },
      {
        id: 'skinfolds',
        title: 'Dobras Cutâneas',
        description: '7 dobras para análise de composição',
        icon: Ruler,
        component: SkinfoldStep,
        required: true
      },
      {
        id: 'photos',
        title: 'Fotos (Opcional)',
        description: 'Registro visual da avaliação',
        icon: Camera,
        component: PhotoUploadStep,
        required: false
      },
      {
        id: 'results',
        title: 'Resultados',
        description: 'Prévia dos cálculos e resultados',
        icon: FileText,
        component: ResultsPreview,
        required: true
      }
    ];
  }, []);

  const currentStepData = steps[currentStep];

  const validateStep = useCallback((stepIndex: number): boolean => {
    const errors: Record<string, string> = {};
    const step = steps[stepIndex];

    switch (step.id) {
      case 'basic':
        if (!formData.assessment_date) errors.assessment_date = 'Data é obrigatória';
        if (!formData.weight || parseFloat(formData.weight) <= 0) errors.weight = 'Peso inválido';
        if (!formData.height || parseFloat(formData.height) <= 0) errors.height = 'Altura inválida';
        if (!formData.age || parseInt(formData.age) <= 0) errors.age = 'Idade inválida';
        if (!formData.gender) errors.gender = 'Gênero é obrigatório';
        break;

      case 'measurements':
        // Validação opcional para medidas, mas verificar formato se preenchido
        const measurements = ['arm_circ', 'chest_circ', 'waist_circ', 'hip_circ', 'thigh_circ', 'calf_circ'];
        measurements.forEach(field => {
          const value = formData[field as keyof AssessmentFormData];
          if (value && (parseFloat(value) < 10 || parseFloat(value) > 200)) {
            errors[field] = 'Medida deve estar entre 10-200 cm';
          }
        });
        break;

      case 'skinfolds':
        // Validação opcional para dobras, mas verificar formato se preenchido
        const skinfolds = ['triceps_skinfold', 'biceps_skinfold', 'subscapular_skinfold', 
                          'suprailiac_skinfold', 'abdominal_skinfold', 'thigh_skinfold', 'calf_skinfold'];
        skinfolds.forEach(field => {
          const value = formData[field as keyof AssessmentFormData];
          if (value && (parseFloat(value) < 3 || parseFloat(value) > 50)) {
            errors[field] = 'Dobra deve estar entre 3-50 mm';
          }
        });
        break;

      default:
        break;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, steps]);

  const handleNext = useCallback(() => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  }, [currentStep, steps.length, validateStep]);

  const handlePrevious = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const handleStepClick = useCallback((stepIndex: number) => {
    // Permitir navegação para steps anteriores ou o próximo step se o atual estiver válido
    if (stepIndex < currentStep || (stepIndex === currentStep + 1 && validateStep(currentStep))) {
      setCurrentStep(stepIndex);
    }
  }, [currentStep, validateStep]);

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    try {
      const response = await createAssessment(formData, studentId);
      
      if (response.success) {
        await alert('Avaliação salva com sucesso!','Sucesso');
        onSuccess?.();
      } else {
        await alert(`Erro ao salvar: ${response.error || 'Tente novamente'}`,'Erro');
      }
    } catch (error) {
      logError('error', 'Erro ao salvar avaliação:', error);
      await alert('Erro ao salvar avaliação. Verifique os dados e tente novamente.','Erro');
    }
  };

  const updateFormData = useCallback((updates: Partial<AssessmentFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    // Limpar erros dos campos que foram atualizados
    const updatedFields = Object.keys(updates);
    setFormErrors(prev => {
      const newErrors = { ...prev };
      updatedFields.forEach(field => {
        delete newErrors[field];
      });
      return newErrors;
    });
  }, []);

  // Validação de permissão deve ser feita pelo componente pai conforme a aplicação

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 text-white">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          Nova Avaliação Física
        </h1>
        <p className="text-sm text-neutral-400">
          Aluno: <span className="font-semibold text-white">{studentName}</span>
        </p>
      </div>

      <div className="mb-4 sm:mb-6">
        {/* Step circles + flex-1 connectors (never overflow) */}
        <div className="flex items-center">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <button
                onClick={() => handleStepClick(index)}
                className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-200 ${
                  index <= currentStep
                    ? 'bg-yellow-500 border-yellow-500 text-black'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-500'
                } ${index < currentStep ? 'cursor-pointer' : ''}`}
                disabled={index > currentStep + 1}
              >
                <step.icon className="w-5 h-5" />
              </button>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-1 mx-1 sm:mx-2 transition-all duration-200 ${
                  index < currentStep ? 'bg-yellow-500' : 'bg-neutral-700'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
        {/* Show only the current step label — no 5-column layout */}
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold text-yellow-500">{currentStepData.title}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{currentStepData.description}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/40 border border-red-500/40 rounded-xl">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-sm text-red-100">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 shadow-lg">
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStepData.id === 'photos' ? (
                <PhotoUploadStep
                  formData={formData}
                  onUpdate={updateFormData}
                  onNext={handleNext}
                  onBack={handlePrevious}
                />
              ) : currentStepData.id === 'results' ? (
                <ResultsPreview
                  formData={formData}
                  onBack={handlePrevious}
                  studentName={studentName}
                />
              ) : (() => {
                const StepComponent = currentStepData.component;
                return (
                  <StepComponent
                    formData={formData}
                    updateFormData={updateFormData}
                    errors={formErrors}
                    studentName={studentName}
                  />
                );
              })()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="px-4 sm:px-6 py-4 bg-neutral-950/60 border-t border-neutral-800 rounded-b-2xl flex justify-between items-center gap-2">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex items-center gap-2 min-h-[44px] px-4 py-2 text-sm font-medium text-neutral-200 bg-neutral-900 border border-neutral-700 rounded-xl hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <div className="text-xs text-neutral-500 whitespace-nowrap">
            Passo {currentStep + 1} de {steps.length}
          </div>

          {currentStep === steps.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 min-h-[44px] px-4 py-2 text-sm font-semibold text-black bg-yellow-500 border border-yellow-500 rounded-xl hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-yellow-900/30"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Salvando...' : 'Salvar'}</span>
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 min-h-[44px] px-4 py-2 text-sm font-semibold text-black bg-yellow-500 border border-yellow-500 rounded-xl hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-900/30"
            >
              <span>Próximo</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={onCancel}
          className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Cancelar avaliação
        </button>
      </div>
    </div>
  );
};
