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
  const density = (sum > 0 && Number(formData.age) > 0) ? calculateBodyDensity(sum, Number(formData.age), formData.gender) : 1.05
  const bfp = calculateBodyFatPercentage(density)
  const bmr = calculateBMR(Number(formData.weight), Number(formData.height), Number(formData.age), formData.gender)
  const bmi = calculateBMI(Number(formData.weight), Number(formData.height))
  const bmiClassification = classifyBMI(bmi)
  const bodyFatClassification = classifyBodyFat(bfp, formData.gender, Number(formData.age))
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
    gender: formData.gender,
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
