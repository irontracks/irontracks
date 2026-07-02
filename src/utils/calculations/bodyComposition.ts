// Funções de cálculo para composição corporal

import { Assessment, CalculatedMetrics } from '@/types/assessment';

/**
 * Calcula a densidade corporal usando a fórmula de Pollock (7 dobras)
 * @param sum7Skinfolds - Soma das 7 dobras cutâneas em mm
 * @param age - Idade em anos
 * @param gender - Gênero ('M' ou 'F')
 * @returns Densidade corporal
 */
export const calculateBodyDensity = (
  sum7Skinfolds: number,
  age: number,
  gender: 'M' | 'F'
): number => {
  if (sum7Skinfolds <= 0 || age <= 0) {
    throw new Error('Dobras e idade devem ser maiores que zero');
  }

  let density: number;

  if (gender === 'M') {
    // Fórmula de Pollock para homens (7 dobras)
    density = 1.112 -
      (0.00043499 * sum7Skinfolds) +
      (0.00000055 * Math.pow(sum7Skinfolds, 2)) -
      (0.00028826 * age);
  } else {
    // Fórmula de Pollock para mulheres (7 dobras)
    density = 1.097 -
      (0.00046971 * sum7Skinfolds) +
      (0.00000056 * Math.pow(sum7Skinfolds, 2)) -
      (0.00012828 * age);
  }

  return Math.max(1.0, Math.min(1.1, density)); // Limitar valores extremos
};

/**
 * Calcula o percentual de gordura a partir da densidade corporal
 * @param bodyDensity - Densidade corporal
 * @returns Percentual de gordura
 */
export const calculateBodyFatPercentage = (bodyDensity: number): number => {
  if (bodyDensity <= 0) {
    throw new Error('Densidade corporal deve ser maior que zero');
  }

  // Fórmula de Siri
  const bodyFatPercentage = (495 / bodyDensity) - 450;

  return Math.max(3, Math.min(50, bodyFatPercentage)); // Limitar valores extremos
};

/**
 * Calcula a massa gorda em kg
 * @param weight - Peso total em kg
 * @param bodyFatPercentage - Percentual de gordura
 * @returns Massa gorda em kg
 */
export const calculateFatMass = (weight: number, bodyFatPercentage: number): number => {
  if (weight <= 0 || bodyFatPercentage < 0) {
    throw new Error('Peso deve ser maior que zero e % gordura não pode ser negativa');
  }

  return (weight * bodyFatPercentage) / 100;
};

/**
 * Calcula a massa magra em kg
 * @param weight - Peso total em kg
 * @param fatMass - Massa gorda em kg
 * @returns Massa magra em kg
 */
export const calculateLeanMass = (weight: number, fatMass: number): number => {
  if (weight <= 0 || fatMass < 0 || fatMass >= weight) {
    throw new Error('Peso inválido ou massa gorda inconsistente');
  }

  return weight - fatMass;
};

/**
 * Calcula o IMC (Índice de Massa Corporal)
 * @param weight - Peso em kg
 * @param height - Altura em cm
 * @returns IMC
 */
export const calculateBMI = (weight: number, height: number): number => {
  if (weight <= 0 || height <= 0) {
    throw new Error('Peso e altura devem ser maiores que zero');
  }

  const heightInMeters = height / 100;
  const bmi = weight / Math.pow(heightInMeters, 2);

  return Math.max(10, Math.min(60, bmi)); // Limitar valores extremos
};

/**
 * Classifica o IMC de acordo com a OMS
 * @param bmi - IMC
 * @returns Classificação
 */
export const classifyBMI = (bmi: number): string => {
  if (bmi < 18.5) return 'Abaixo do peso';
  if (bmi < 25) return 'Peso normal';
  if (bmi < 30) return 'Sobrepeso';
  if (bmi < 35) return 'Obesidade grau I';
  if (bmi < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
};

/**
 * Calcula a soma das 7 dobras cutâneas
 * @param assessment - Objeto com as dobras
 * @returns Soma das dobras em mm
 */
export const calculateSumSkinfolds = (assessment: Partial<Assessment>): number => {
  const skinfolds = [
    assessment.triceps_skinfold,
    assessment.biceps_skinfold,
    assessment.subscapular_skinfold,
    assessment.suprailiac_skinfold,
    assessment.abdominal_skinfold,
    assessment.thigh_skinfold,
    assessment.calf_skinfold
  ];

  return skinfolds.reduce<number>((sum, value) => sum + (value ?? 0), 0);
};

/**
 * Calcula todos os métricos de composição corporal
 * @param assessment - Dados da avaliação
 * @returns Objeto com todos os cálculos
 */
export const calculateAllMetrics = (assessment: Assessment): CalculatedMetrics => {
  try {
    // Validar dados necessários
    if (!assessment.weight || !assessment.height || !assessment.age || !assessment.gender) {
      throw new Error('Dados insuficientes para cálculo');
    }

    // Calcular soma das dobras
    const sumSkinfolds = calculateSumSkinfolds(assessment);

    // Calcular densidade corporal
    const bodyDensity = calculateBodyDensity(sumSkinfolds, assessment.age, assessment.gender);

    // Calcular % gordura
    const bodyFatPercentage = calculateBodyFatPercentage(bodyDensity);

    // Calcular massa gorda
    const fatMass = calculateFatMass(assessment.weight, bodyFatPercentage);

    // Calcular massa magra
    const leanMass = calculateLeanMass(assessment.weight, fatMass);

    // Calcular IMC
    const bmi = calculateBMI(assessment.weight, assessment.height);

    return {
      body_fat_percentage: Math.round(bodyFatPercentage * 100) / 100, // 2 casas decimais
      lean_mass: Math.round(leanMass * 100) / 100,
      fat_mass: Math.round(fatMass * 100) / 100,
      bmr: 0, // Será calculado separadamente
      bmi: Math.round(bmi * 100) / 100,
      sum_skinfolds: Math.round(sumSkinfolds * 10) / 10, // 1 casa decimal
      body_density: Math.round(bodyDensity * 1000000) / 1000000 // 6 casas decimais
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Erro no cálculo da composição corporal: ${msg}`);
  }
};

/**
 * Avalia o percentual de gordura de acordo com tabelas de referência
 * @param bodyFatPercentage - Percentual de gordura
 * @param gender - Gênero
 * @param age - Idade
 * @returns Classificação
 */
export const classifyBodyFat = (bodyFatPercentage: number, gender: 'M' | 'F', age: number): string => {
  if (gender === 'M') {
    if (age < 30) {
      if (bodyFatPercentage < 8) return 'Muito baixo';
      if (bodyFatPercentage < 12) return 'Baixo';
      if (bodyFatPercentage < 16) return 'Ideal';
      if (bodyFatPercentage < 20) return 'Elevado';
      return 'Muito elevado';
    } else if (age < 40) {
      if (bodyFatPercentage < 11) return 'Muito baixo';
      if (bodyFatPercentage < 15) return 'Baixo';
      if (bodyFatPercentage < 19) return 'Ideal';
      if (bodyFatPercentage < 23) return 'Elevado';
      return 'Muito elevado';
    } else {
      if (bodyFatPercentage < 13) return 'Muito baixo';
      if (bodyFatPercentage < 17) return 'Baixo';
      if (bodyFatPercentage < 21) return 'Ideal';
      if (bodyFatPercentage < 25) return 'Elevado';
      return 'Muito elevado';
    }
  } else {
    if (age < 30) {
      if (bodyFatPercentage < 16) return 'Muito baixo';
      if (bodyFatPercentage < 20) return 'Baixo';
      if (bodyFatPercentage < 24) return 'Ideal';
      if (bodyFatPercentage < 28) return 'Elevado';
      return 'Muito elevado';
    } else if (age < 40) {
      if (bodyFatPercentage < 17) return 'Muito baixo';
      if (bodyFatPercentage < 21) return 'Baixo';
      if (bodyFatPercentage < 25) return 'Ideal';
      if (bodyFatPercentage < 29) return 'Elevado';
      return 'Muito elevado';
    } else {
      if (bodyFatPercentage < 18) return 'Muito baixo';
      if (bodyFatPercentage < 22) return 'Baixo';
      if (bodyFatPercentage < 26) return 'Ideal';
      if (bodyFatPercentage < 30) return 'Elevado';
      return 'Muito elevado';
    }
  }
};

/**
 * Calcula a taxa de metabolismo basal (BMR) - Fórmula de Mifflin-St Jeor
 * (padrão atual da literatura; substitui a Harris-Benedict, que superestimava ~5%).
 * @param weight - Peso em kg
 * @param height - Altura em cm
 * @param age - Idade em anos
 * @param gender - Gênero
 * @returns BMR em kcal/dia
 */
export const calculateBMR = (weight: number, height: number, age: number, gender: 'M' | 'F'): number => {
  if (weight <= 0 || height <= 0 || age <= 0) {
    throw new Error('Peso, altura e idade devem ser maiores que zero');
  }

  // Mifflin-St Jeor. Homem: +5; mulher: −161.
  const bmr = (10 * weight) + (6.25 * height) - (5 * age) + (gender === 'M' ? 5 : -161);

  return Math.round(bmr * 100) / 100; // 2 casas decimais
};

/**
 * Calcula o gasto energético total (TDEE)
 * @param bmr - Taxa metabólica basal
 * @param activityFactor - Fator de atividade
 * @returns TDEE em kcal/dia
 */
export const calculateTDEE = (bmr: number, activityFactor: number): number => {
  if (bmr <= 0 || activityFactor <= 0) {
    throw new Error('BMR e fator de atividade devem ser maiores que zero');
  }

  const tdee = bmr * activityFactor;
  return Math.round(tdee * 100) / 100; // 2 casas decimais
};

/**
 * Calcula a diferença entre duas avaliações
 * @param current - Avaliação atual
 * @param previous - Avaliação anterior
 * @returns Diferenças entre as avaliações
 */
export const calculateAssessmentDifference = (current: Assessment, previous: Assessment) => {
  const differences = {
    weight: current.weight - previous.weight,
    body_fat_percentage: (current.body_fat_percentage || 0) - (previous.body_fat_percentage || 0),
    lean_mass: (current.lean_mass || 0) - (previous.lean_mass || 0),
    fat_mass: (current.fat_mass || 0) - (previous.fat_mass || 0),
    bmi: (current.bmi || 0) - (previous.bmi || 0)
  };

  return differences;
};

/**
 * Valida se os valores de entrada são razoáveis
 * @param assessment - Dados da avaliação
 * @returns true se válido, false se inválido
 */
export const validateAssessmentValues = (assessment: Partial<Assessment>): boolean => {
  try {
    // Validar ranges básicos
    if (assessment.weight && (assessment.weight < 30 || assessment.weight > 300)) return false;
    if (assessment.height && (assessment.height < 100 || assessment.height > 250)) return false;
    if (assessment.age && (assessment.age < 10 || assessment.age > 100)) return false;

    // Validar dobras
    const skinfolds = [
      assessment.triceps_skinfold,
      assessment.biceps_skinfold,
      assessment.subscapular_skinfold,
      assessment.suprailiac_skinfold,
      assessment.abdominal_skinfold,
      assessment.thigh_skinfold,
      assessment.calf_skinfold
    ];

    for (const skinfold of skinfolds) {
      if (skinfold && (skinfold < 3 || skinfold > 50)) return false;
    }

    // Validar circunferências
    const circumferences = [
      assessment.arm_circ,
      assessment.chest_circ,
      assessment.waist_circ,
      assessment.hip_circ,
      assessment.thigh_circ,
      assessment.calf_circ
    ];

    for (const circumference of circumferences) {
      if (circumference && (circumference < 10 || circumference > 200)) return false;
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Formata valores para exibição
 * @param value - Valor numérico
 * @param decimals - Número de casas decimais
 * @returns String formatada
 */
export const formatMetric = (value: number | null | undefined, decimals: number = 1): string => {
  if (value === null || value === undefined) return '—';
  return value.toFixed(decimals);
};

/**
 * Calcula a soma das dobras cutâneas com validação
 * @param assessment - Dados da avaliação
 * @returns Soma das dobras ou null se não houver dados suficientes
 */
export const safeCalculateSumSkinfolds = (assessment: Partial<Assessment>): number | null => {
  try {
    const skinfolds = [
      assessment.triceps_skinfold,
      assessment.biceps_skinfold,
      assessment.subscapular_skinfold,
      assessment.suprailiac_skinfold,
      assessment.abdominal_skinfold,
      assessment.thigh_skinfold,
      assessment.calf_skinfold
    ];

    // Verificar se tem pelo menos 4 dobras para um cálculo válido
    const validSkinfolds = skinfolds.filter(s => s !== null && s !== undefined && s > 0) as number[];

    // Pollock 7-fold formula requires ALL 7 skinfolds — partial sums produce incorrect body fat %
    if (validSkinfolds.length < 7) {
      return null;
    }

    return validSkinfolds.reduce((sum, value) => sum + value, 0);
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Skinfold + BIA reconciliation
//
// Many users record both a 7-skinfold (Siri/Pollock) reading and a
// bioimpedance reading from a scale. Each technique has well-known biases
// (skinfolds underestimate in lean subjects, BIA fluctuates with hydration),
// so the most useful "single number" to surface long-term is the simple
// arithmetic mean of the two when both are available.
//
// We deliberately do NOT weight one over the other (option B in the product
// spec): the UI shows the three readings side by side and lets the user
// reason about the discrepancy themselves.
// ─────────────────────────────────────────────────────────────────────────────

const isValidPercent = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

// Faixa fisiologicamente plausível de %BF para ENTRAR NA MÉDIA. Um valor fora
// dela — BIA digitado como "90" por erro de vírgula, ou "0" num campo zerado por
// engano — é DESCARTADO do blend pra não distorcer massa magra/gorda. Continua
// visível no breakdown bruto (o usuário precisa enxergar o valor pra corrigir).
// As dobras já são travadas em 3–50% na origem; aqui protegemos também o BIA.
// Teto = 75%: obesidade extrema real chega a ~60% e balanças BIA superestimam em
// alta adiposidade (podem marcar 60–70%), então 3–75 salva o caso real e ainda
// rejeita erro de vírgula (80/90). Exportado pra UI mostrar só a "média" real.
export const PLAUSIBLE_BF_MIN = 3;
export const PLAUSIBLE_BF_MAX = 75;
export const isPlausibleBodyFat = (v: number | null | undefined): v is number =>
  isValidPercent(v) && v >= PLAUSIBLE_BF_MIN && v <= PLAUSIBLE_BF_MAX;

/**
 * Returns the "blended" body-fat % to store/display as the single primary
 * value. Behaviour:
 *   - Both inputs valid → simple average (a + b) / 2.
 *   - Only one input valid → that input.
 *   - Neither valid → null.
 *
 * Exposed as a pure function so it's trivially unit-testable and re-usable
 * by the UI, the persistence layer (useAssessment) and the PDF generator.
 */
export const combinedBodyFat = (
  skinfoldBF: number | null | undefined,
  biaBF: number | null | undefined,
): number | null => {
  const sf = isPlausibleBodyFat(skinfoldBF) ? skinfoldBF : null;
  const bia = isPlausibleBodyFat(biaBF) ? biaBF : null;
  if (sf != null && bia != null) return (sf + bia) / 2;
  if (sf != null) return sf;
  if (bia != null) return bia;
  return null;
};

export type BodyFatBreakdown = {
  /** Siri-derived value from 7 skinfolds (null if dobras incompletas). */
  skinfold: number | null;
  /** Manually entered BIA reading (null if not provided). */
  bia: number | null;
  /** Blended value used as the canonical body_fat_percentage. */
  combined: number | null;
};

/**
 * Convenience wrapper that returns the three figures the assessment screens
 * need to render: skinfold-only, BIA-only, blended. Use this anywhere the UI
 * shows the trio (ResultsPreview, PDF, history modal).
 */
export const buildBodyFatBreakdown = (
  skinfoldBF: number | null | undefined,
  biaBF: number | null | undefined,
): BodyFatBreakdown => {
  const skinfold = isValidPercent(skinfoldBF) ? (skinfoldBF as number) : null;
  const bia = isValidPercent(biaBF) ? (biaBF as number) : null;
  return {
    skinfold,
    bia,
    combined: combinedBodyFat(skinfold, bia),
  };
};
