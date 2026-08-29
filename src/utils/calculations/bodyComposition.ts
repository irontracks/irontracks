// Funções de cálculo para composição corporal

import { Assessment } from '@/types/assessment';
import { basalMetabolicRate, totalDailyEnergyExpenditure } from '@/lib/health/mifflinStJeor';

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
 * Limites do IMC gravado e exibido.
 *
 * O clamp existe para ERRO DE DIGITAÇÃO, não para esconder caso real: altura em
 * metros ("1,75") no campo de centímetros produz IMC 261 — impossível. O teto
 * era 60, e isso mentia sobre gente que existe (obesidade grau III passa de 60);
 * 80 cobre o extremo clínico registrado e continua barrando o absurdo.
 */
export const BMI_MIN = 10;
export const BMI_MAX = 80;

/**
 * Calcula o IMC (Índice de Massa Corporal)
 *
 * ⚠️ FONTE ÚNICA. Até 28/08/2026 o `useAssessment` calculava de novo, à mão, no
 * caminho que PERSISTE — sem clamp e arredondando a 1 casa. O resultado é que o
 * banco podia guardar 261 enquanto a tela mostrava 60: o número gravado e o
 * exibido eram outros. Quem for exibir ou gravar IMC chama esta função.
 *
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

  return Math.max(BMI_MIN, Math.min(BMI_MAX, bmi));
};

/**
 * O IMC como ele deve ser GRAVADO: mesma regra da tela, uma casa decimal.
 *
 * Devolve `undefined` sem peso ou altura — não persistimos lixo, e é por isso
 * que esta função não lança onde `calculateBMI` lança: o caminho de escrita
 * precisa seguir sem o valor.
 */
export const bmiForStorage = (weight: number, height: number): number | undefined => {
  if (!(weight > 0) || !(height > 0)) return undefined;
  return Number(calculateBMI(weight, height).toFixed(1));
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
 * As SETE dobras do protocolo Jackson & Pollock — as que a equação de
 * `calculateBodyDensity` foi derivada para receber.
 *
 * ⚠️ Auditoria de 23/08/2026: o app somava OUTRO conjunto — trocava **peitoral**
 * e **axilar média** por **bíceps** e **panturrilha** — enquanto usava as
 * constantes de J&P e anunciava "Pollock 7 dobras" na tela. Equação de um
 * protocolo com as entradas de outro não devolve o número de nenhum dos dois.
 * Medido nos casos reais do banco: 1 a 1,9 ponto percentual de gordura.
 *
 * As colunas `pectoral_skinfold`/`midaxillary_skinfold` já existiam no banco e
 * estavam preenchidas em 6 das 9 avaliações — nenhum código as lia. Era o
 * formulário antigo, que media o protocolo certo.
 */
export const JP7_SKINFOLD_FIELDS = [
  'pectoral_skinfold',
  'midaxillary_skinfold',
  'triceps_skinfold',
  'subscapular_skinfold',
  'abdominal_skinfold',
  'suprailiac_skinfold',
  'thigh_skinfold',
] as const satisfies ReadonlyArray<keyof Assessment>

/**
 * Soma das 7 dobras do protocolo. **`null` quando falta alguma.**
 *
 * O `null` é a segunda metade da correção e vale por si: a versão anterior
 * somava com `?? 0`, então dobra ausente entrava como zero — a soma caía, a
 * densidade subia e o laudo saía com gordura MENOR do que a real, sem nenhum
 * aviso. Medir seis dobras e receber um número que finge ser de sete é pior que
 * não receber número nenhum: o app já sabe conviver com isso (quem só tem BIA
 * segue pela BIA).
 */
export const sumSkinfoldsJP7 = (assessment: Partial<Assessment>): number | null => {
  let sum = 0
  for (const field of JP7_SKINFOLD_FIELDS) {
    const raw = assessment[field]
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(value) || value <= 0) return null
    sum += value
  }
  return sum
}


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
  // A conta vive em `lib/health/mifflinStJeor` — era a mesma fórmula escrita
  // aqui e em `lib/nutrition/goals`. Esta assinatura (posicional) permanece
  // porque é a que o fluxo de avaliação usa; o que não se repete é o cálculo.
  const bmr = basalMetabolicRate({ weightKg: weight, heightCm: height, ageYears: age, sex: gender });
  if (bmr == null) {
    throw new Error('Peso, altura e idade devem ser maiores que zero');
  }
  return bmr;
};

/**
 * Calcula o gasto energético total (TDEE)
 * @param bmr - Taxa metabólica basal
 * @param activityFactor - Fator de atividade
 * @returns TDEE em kcal/dia
 */
export const calculateTDEE = (bmr: number, activityFactor: number): number => {
  const tdee = totalDailyEnergyExpenditure(bmr, activityFactor);
  if (tdee == null) {
    throw new Error('BMR e fator de atividade devem ser maiores que zero');
  }
  return tdee;
};

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
