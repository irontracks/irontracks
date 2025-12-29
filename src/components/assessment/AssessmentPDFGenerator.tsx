import React from 'react';
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

interface AssessmentPDFGeneratorProps {
  formData: AssessmentFormData;
  studentName: string;
  trainerName: string;
  assessmentDate: Date;
  photos?: string[]; // Base64 encoded photos
}

export async function generateAssessmentPDF({
  formData,
  studentName,
  trainerName,
  assessmentDate,
  photos = []
}: AssessmentPDFGeneratorProps): Promise<Blob> {
  const tr = Number(formData.triceps_skinfold || 0)
  const ch = 0
  const mx = 0
  const sc = Number(formData.subscapular_skinfold || 0)
  const ab = Number(formData.abdominal_skinfold || 0)
  const si = Number(formData.suprailiac_skinfold || 0)
  const th = Number(formData.thigh_skinfold || 0)

  const sum = tr + ch + mx + sc + ab + si + th
  const density = (sum > 0 && Number(formData.age) > 0) ? calculateBodyDensity(sum, Number(formData.age), formData.gender as any) : 1.05
  const bfp = calculateBodyFatPercentage(density)
  const bmr = calculateBMR(Number(formData.weight), Number(formData.height), Number(formData.age), formData.gender as any)
  const bmi = calculateBMI(Number(formData.weight), Number(formData.height))
  const bmiClassification = classifyBMI(bmi)
  const bodyFatClassification = classifyBodyFat(bfp, formData.gender as any, Number(formData.age))
  const leanMass = Number(formData.weight) * (1 - bfp / 100)
  const fatMass = Number(formData.weight) * (bfp / 100)

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
    weight: String(formData.weight),
    height: String(formData.height),
    age: String(formData.age),
    gender: formData.gender as any,
    arm_circ: '',
    chest_circ: '',
    waist_circ: '',
    hip_circ: '',
    thigh_circ: '',
    calf_circ: '',
    triceps_skinfold: String(tr),
    biceps_skinfold: String(formData.biceps_skinfold || 0),
    subscapular_skinfold: String(sc),
    suprailiac_skinfold: String(si),
    abdominal_skinfold: String(ab),
    thigh_skinfold: String(th),
    calf_skinfold: String(formData.calf_skinfold || 0),
    observations: ''
  } as any, results as any, studentName)
}

// Componente React para geração de PDF
export default function AssessmentPDFGenerator({
  formData,
  studentName,
  trainerName,
  assessmentDate,
  photos
}: AssessmentPDFGeneratorProps) {
  const generatePDF = async () => {
    try {
      const safeStudentName = String(studentName || 'Aluno');
      const safeDate = assessmentDate instanceof Date && !isNaN(assessmentDate as any)
        ? assessmentDate
        : new Date();

      const pdfBlob = await generateAssessmentPDF({
        formData,
        studentName: safeStudentName,
        trainerName,
        assessmentDate: safeDate,
        photos
      });

      // Criar link de download
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      const fileDate = safeDate.toISOString().split('T')[0];
      link.download = `avaliacao_fisica_${safeStudentName.replace(/\s+/g, '_')}_${fileDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return { success: true };
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      return { success: false, error };
    }
  };

  return (
    <button
      onClick={generatePDF}
      className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Gerar PDF
    </button>
  );
}
