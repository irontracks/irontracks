import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AssessmentFormData } from '@/types/assessment';
import {
  calculateSumSkinfolds,
  calculateBodyDensity,
  calculateBodyFatPercentage,
  calculateBMR,
  calculateBMI,
  classifyBMI,
  classifyBodyFat
} from '@/utils/calculations/bodyComposition';
import { generateAssessmentPdf } from '@/utils/report/generatePdf';
import { logError } from '@/lib/logger'

interface AssessmentPDFGeneratorProps {
  formData: AssessmentFormData;
  studentName: string;
  trainerName: string;
  assessmentDate: Date;
  photos?: string[]; // Base64 encoded photos
}

/** Resolve bilateral average: if both left+right exist, average. Otherwise single side or legacy field. */
function avgBilateral(formData: AssessmentFormData, direct: keyof AssessmentFormData, left: keyof AssessmentFormData, right: keyof AssessmentFormData): number {
  const l = Number(formData[left] || 0)
  const r = Number(formData[right] || 0)
  if (l > 0 && r > 0) return Math.round(((l + r) / 2) * 100) / 100
  if (l > 0) return l
  if (r > 0) return r
  return Number(formData[direct] || 0)
}

export async function generateAssessmentPDF({
  formData,
  studentName,
  assessmentDate,
}: AssessmentPDFGeneratorProps): Promise<Blob> {
  // All 7 Pollock skinfolds — with bilateral averaging
  const triceps = avgBilateral(formData, 'triceps_skinfold', 'triceps_skinfold_left', 'triceps_skinfold_right')
  const biceps = avgBilateral(formData, 'biceps_skinfold', 'biceps_skinfold_left', 'biceps_skinfold_right')
  const subscapular = Number(formData.subscapular_skinfold || 0)
  const suprailiac = Number(formData.suprailiac_skinfold || 0)
  const abdominal = Number(formData.abdominal_skinfold || 0)
  const thigh = avgBilateral(formData, 'thigh_skinfold', 'thigh_skinfold_left', 'thigh_skinfold_right')
  const calf = avgBilateral(formData, 'calf_skinfold', 'calf_skinfold_left', 'calf_skinfold_right')

  // Correct sum of ALL 7 skinfolds
  const sum = calculateSumSkinfolds({
    triceps_skinfold: triceps || undefined,
    biceps_skinfold: biceps || undefined,
    subscapular_skinfold: subscapular || undefined,
    suprailiac_skinfold: suprailiac || undefined,
    abdominal_skinfold: abdominal || undefined,
    thigh_skinfold: thigh || undefined,
    calf_skinfold: calf || undefined,
  })

  const age = Number(formData.age) || 0
  const weight = Number(formData.weight) || 0
  const height = Number(formData.height) || 0
  const gender = formData.gender

  const density = (sum > 0 && age > 0) ? calculateBodyDensity(sum, age, gender) : 1.05
  const bfp = calculateBodyFatPercentage(density)
  const bmr = (weight > 0 && height > 0 && age > 0) ? calculateBMR(weight, height, age, gender) : 0
  const bmi = (weight > 0 && height > 0) ? calculateBMI(weight, height) : 0
  const bmiClassification = bmi ? classifyBMI(bmi) : ''
  const bodyFatClassification = classifyBodyFat(bfp, gender, age || 18)
  const leanMass = weight > 0 ? weight * (1 - bfp / 100) : 0
  const fatMass = weight > 0 ? weight * (bfp / 100) : 0

  // Circumference bilateral averages
  const armCirc = avgBilateral(formData, 'arm_circ', 'arm_circ_left', 'arm_circ_right')
  const thighCirc = avgBilateral(formData, 'thigh_circ', 'thigh_circ_left', 'thigh_circ_right')
  const calfCirc = avgBilateral(formData, 'calf_circ', 'calf_circ_left', 'calf_circ_right')

  const results = {
    bodyComposition: { bodyFatPercentage: bfp, sumOfSkinfolds: sum },
    bmr,
    bmi,
    bmiClassification,
    bodyFatClassification,
    leanMass,
    fatMass
  }

  return await generateAssessmentPdf({
    assessment_date: assessmentDate.toISOString().split('T')[0],
    weight: String(weight),
    height: String(height),
    age: String(age),
    gender,
    // Circumferences — pass bilateral + computed average
    arm_circ: armCirc || null,
    arm_circ_left: Number(formData.arm_circ_left) || null,
    arm_circ_right: Number(formData.arm_circ_right) || null,
    chest_circ: Number(formData.chest_circ) || null,
    waist_circ: Number(formData.waist_circ) || null,
    hip_circ: Number(formData.hip_circ) || null,
    thigh_circ: thighCirc || null,
    thigh_circ_left: Number(formData.thigh_circ_left) || null,
    thigh_circ_right: Number(formData.thigh_circ_right) || null,
    calf_circ: calfCirc || null,
    calf_circ_left: Number(formData.calf_circ_left) || null,
    calf_circ_right: Number(formData.calf_circ_right) || null,
    // Skinfolds — pass bilateral + computed average
    triceps_skinfold: triceps,
    triceps_skinfold_left: Number(formData.triceps_skinfold_left) || null,
    triceps_skinfold_right: Number(formData.triceps_skinfold_right) || null,
    biceps_skinfold: biceps,
    biceps_skinfold_left: Number(formData.biceps_skinfold_left) || null,
    biceps_skinfold_right: Number(formData.biceps_skinfold_right) || null,
    subscapular_skinfold: subscapular,
    suprailiac_skinfold: suprailiac,
    abdominal_skinfold: abdominal,
    thigh_skinfold: thigh,
    thigh_skinfold_left: Number(formData.thigh_skinfold_left) || null,
    thigh_skinfold_right: Number(formData.thigh_skinfold_right) || null,
    calf_skinfold: calf,
    calf_skinfold_left: Number(formData.calf_skinfold_left) || null,
    calf_skinfold_right: Number(formData.calf_skinfold_right) || null,
    observations: formData.observations || ''
  }, results, studentName)
}

// Componente React para geração de PDF
export default function AssessmentPDFGenerator({
  formData,
  studentName,
  trainerName,
  assessmentDate,
  photos
}: AssessmentPDFGeneratorProps) {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const generatePDF = async () => {
    try {
      if (isGenerating) return;
      setIsGenerating(true);

      const safeStudentName = String(studentName || 'Aluno');
      const safeDate = assessmentDate instanceof Date && !isNaN(assessmentDate.getTime())
        ? assessmentDate
        : new Date();

      await generateAssessmentPDF({
        formData,
        studentName: safeStudentName,
        trainerName,
        assessmentDate: safeDate,
        photos
      });

      return { success: true };
    } catch (error) {
      logError('error', 'Erro ao gerar PDF:', error);
      return { success: false, error };
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      onClick={generatePDF}
      disabled={isGenerating}
      className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 bg-yellow-500 text-black rounded-xl font-black shadow-lg shadow-yellow-500/20 hover:bg-yellow-400 transition-all duration-300 active:scale-95 disabled:opacity-60 disabled:active:scale-100"
    >
      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {isGenerating ? 'Gerando…' : 'Gerar PDF'}
    </button>
  );
}
