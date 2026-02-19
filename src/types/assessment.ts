// Tipos para o sistema de avaliação física

export interface Assessment {
  id: string;
  student_id: string;
  trainer_id: string;

  // Dados Básicos
  assessment_date: string;
  weight: number; // kg
  height: number; // cm
  age: number;
  gender: 'M' | 'F';

  // Circunferências (cm)
  arm_circ?: number; // braço
  chest_circ?: number; // peito
  waist_circ?: number; // cintura
  hip_circ?: number; // quadril
  thigh_circ?: number; // coxa
  calf_circ?: number; // panturrilha

  // 7 Dobras Cutâneas (mm)
  triceps_skinfold?: number; // tricipital
  biceps_skinfold?: number; // bicipital
  subscapular_skinfold?: number; // subescapular
  suprailiac_skinfold?: number; // suprailíaca
  abdominal_skinfold?: number; // abdominal
  thigh_skinfold?: number; // coxa
  calf_skinfold?: number; // panturrilha

  // Cálculos (gerados automaticamente)
  body_fat_percentage?: number; // % gordura
  lean_mass?: number; // massa magra em kg
  fat_mass?: number; // massa gorda em kg
  bmr?: number; // taxa metabólica basal kcal/dia
  tdee?: number; // gasto energético total kcal/dia
  bmi?: number; // índice de massa corporal

  // Metadados
  observations?: string;
  pdf_url?: string;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Dados relacionados (opcional)
  student_name?: string;
  trainer_name?: string;
  photo_count?: number;
}

export interface AssessmentPhoto {
  id: string;
  assessment_id: string;
  photo_url: string;
  photo_type: 'front' | 'side' | 'back';
  file_size?: number;
  mime_type?: string;
  created_at: string;
}

export interface AssessmentFormData {
  // Dados Básicos
  assessment_date: string;
  weight: string;
  height: string;
  age: string;
  gender: 'M' | 'F';

  // Circunferências (cm)
  arm_circ: string;
  chest_circ: string;
  waist_circ: string;
  hip_circ: string;
  thigh_circ: string;
  calf_circ: string;

  // 7 Dobras Cutâneas (mm)
  triceps_skinfold: string;
  biceps_skinfold: string;
  subscapular_skinfold: string;
  suprailiac_skinfold: string;
  abdominal_skinfold: string;
  thigh_skinfold: string;
  calf_skinfold: string;

  // Metadados
  observations: string;
}

export interface CalculatedMetrics {
  body_fat_percentage: number;
  lean_mass: number;
  fat_mass: number;
  bmr: number;
  bmi: number;
  sum_skinfolds: number;
  body_density: number;
}

export interface ActivityLevel {
  value: 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
  label: string;
  description: string;
  factor: number;
}

export const activityLevels: ActivityLevel[] = [
  {
    value: 'sedentary',
    label: 'Sedentário',
    description: 'Pouco ou nenhum exercício',
    factor: 1.2
  },
  {
    value: 'light',
    label: 'Levemente ativo',
    description: 'Exercício leve 1-3 dias/semana',
    factor: 1.375
  },
  {
    value: 'moderate',
    label: 'Moderadamente ativo',
    description: 'Exercício moderado 3-5 dias/semana',
    factor: 1.55
  },
  {
    value: 'active',
    label: 'Altamente ativo',
    description: 'Exercício pesado 6-7 dias/semana',
    factor: 1.725
  },
  {
    value: 'veryActive',
    label: 'Extremamente ativo',
    description: 'Exercício muito pesado diário',
    factor: 1.9
  }
];

export interface PhotoUpload {
  file: File;
  preview: string;
  type: 'front' | 'side' | 'back';
  uploading?: boolean;
  error?: string;
}

export interface AssessmentStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<Record<string, unknown>>;
}

export interface ValidationRule {
  min?: number;
  max?: number;
  required?: boolean;
  pattern?: RegExp;
  message?: string;
}

export interface FormField {
  name: keyof AssessmentFormData;
  label: string;
  unit: string;
  placeholder: string;
  validation: ValidationRule;
  step?: number;
}

// Constantes para validações
export const MEASUREMENT_RANGES = {
  weight: { min: 30, max: 300, message: 'Peso deve estar entre 30-300 kg' },
  height: { min: 100, max: 250, message: 'Altura deve estar entre 100-250 cm' },
  age: { min: 10, max: 100, message: 'Idade deve estar entre 10-100 anos' },
  circumference: { min: 10, max: 200, message: 'Medida deve estar entre 10-200 cm' },
  skinfold: { min: 3, max: 50, message: 'Dobra deve estar entre 3-50 mm' }
};

// Tipos para gráficos
export interface ChartDataPoint {
  date: string;
  body_fat_percentage: number;
  lean_mass: number;
  weight: number;
}

export interface BodyCompositionData {
  labels: string[];
  data: number[];
  colors: string[];
}

// Tipos para PDF
export interface PDFAssessmentData {
  assessment: Assessment;
  photos: AssessmentPhoto[];
  calculatedMetrics: CalculatedMetrics;
  activityLevel?: ActivityLevel;
  tdee?: number;
}

// Tipos para API
export interface CreateAssessmentRequest extends Omit<Assessment, 'id' | 'created_at' | 'updated_at'> { }

export interface UpdateAssessmentRequest extends Partial<Omit<Assessment, 'id' | 'created_at' | 'updated_at' | 'student_id' | 'trainer_id'>> { }

export interface AssessmentResponse {
  success: boolean;
  data?: Assessment;
  error?: string;
  message?: string;
}

export interface AssessmentListResponse {
  success: boolean;
  data: Assessment[];
  count: number;
  error?: string;
}

// Funções utilitárias de tipo
export const isValidGender = (value: unknown): value is 'M' | 'F' => {
  return value === 'M' || value === 'F';
};

export const isValidPhotoType = (value: unknown): value is 'front' | 'side' | 'back' => {
  return ['front', 'side', 'back'].includes(value as string);
};

export const parseNumberInput = (value: string): number | null => {
  const parsed = parseFloat(value.replace(',', '.'));
  return isNaN(parsed) ? null : parsed;
};

export const formatNumber = (value: number | null | undefined, decimals: number = 1): string => {
  if (value === null || value === undefined) return '';
  return value.toFixed(decimals);
};

export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('pt-BR');
};

// Validações
export const validateAssessmentForm = (data: AssessmentFormData): Record<string, string> => {
  const errors: Record<string, string> = {};

  // Validação de campos obrigatórios
  const requiredFields: (keyof AssessmentFormData)[] = [
    'assessment_date', 'weight', 'height', 'age', 'gender'
  ];

  requiredFields.forEach(field => {
    if (!data[field]) {
      errors[field] = 'Campo obrigatório';
    }
  });

  // Validação de ranges
  if (data.weight) {
    const weight = parseFloat(data.weight);
    if (weight < MEASUREMENT_RANGES.weight.min || weight > MEASUREMENT_RANGES.weight.max) {
      errors.weight = MEASUREMENT_RANGES.weight.message;
    }
  }

  if (data.height) {
    const height = parseFloat(data.height);
    if (height < MEASUREMENT_RANGES.height.min || height > MEASUREMENT_RANGES.height.max) {
      errors.height = MEASUREMENT_RANGES.height.message;
    }
  }

  if (data.age) {
    const age = parseInt(data.age);
    if (age < MEASUREMENT_RANGES.age.min || age > MEASUREMENT_RANGES.age.max) {
      errors.age = MEASUREMENT_RANGES.age.message;
    }
  }

  // Validação de dobras cutâneas
  const skinfoldFields: (keyof AssessmentFormData)[] = [
    'triceps_skinfold', 'biceps_skinfold', 'subscapular_skinfold',
    'suprailiac_skinfold', 'abdominal_skinfold', 'thigh_skinfold', 'calf_skinfold'
  ];

  skinfoldFields.forEach(field => {
    if (data[field]) {
      const value = parseFloat(data[field]);
      if (value < MEASUREMENT_RANGES.skinfold.min || value > MEASUREMENT_RANGES.skinfold.max) {
        errors[field] = MEASUREMENT_RANGES.skinfold.message;
      }
    }
  });

  // Validação de circunferências
  const circumferenceFields: (keyof AssessmentFormData)[] = [
    'arm_circ', 'chest_circ', 'waist_circ', 'hip_circ', 'thigh_circ', 'calf_circ'
  ];

  circumferenceFields.forEach(field => {
    if (data[field]) {
      const value = parseFloat(data[field]);
      if (value < MEASUREMENT_RANGES.circumference.min || value > MEASUREMENT_RANGES.circumference.max) {
        errors[field] = MEASUREMENT_RANGES.circumference.message;
      }
    }
  });

  return errors;
};
