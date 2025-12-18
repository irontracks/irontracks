import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Download, Save, ArrowLeft, User, Ruler, Calculator, TrendingUp } from 'lucide-react';
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

interface ResultsPreviewProps {
  formData: AssessmentFormData;
  onSave: () => void;
  onBack: () => void;
  studentName: string;
}

export default function ResultsPreview({ formData, onSave, onBack, studentName }: ResultsPreviewProps) {
  const results = useMemo(() => {
    const weight = parseFloat(formData.weight || '0');
    const height = parseFloat(formData.height || '0');
    const age = parseInt(formData.age || '0');
    const gender = formData.gender; // 'M' | 'F'

    const sumOfSkinfolds = calculateSumSkinfolds({
      triceps_skinfold: parseFloat(formData.triceps_skinfold || '0'),
      biceps_skinfold: parseFloat(formData.biceps_skinfold || '0'),
      subscapular_skinfold: parseFloat(formData.subscapular_skinfold || '0'),
      suprailiac_skinfold: parseFloat(formData.suprailiac_skinfold || '0'),
      abdominal_skinfold: parseFloat(formData.abdominal_skinfold || '0'),
      thigh_skinfold: parseFloat(formData.thigh_skinfold || '0'),
      calf_skinfold: parseFloat(formData.calf_skinfold || '0')
    } as any);

    const bodyDensity = (sumOfSkinfolds > 0 && age > 0) ? calculateBodyDensity(sumOfSkinfolds, age, gender) : 1.05;
    const bodyFatPercentage = calculateBodyFatPercentage(bodyDensity);

    const bmr = (weight > 0 && height > 0 && age > 0) ? calculateBMR(weight, height, age, gender) : 0;
    const bmi = (weight > 0 && height > 0) ? calculateBMI(weight, height) : 0;
    const bmiClassification = bmi ? classifyBMI(bmi) : '—';
    const bodyFatClassification = classifyBodyFat(bodyFatPercentage, gender, age || 18);

    const leanMass = weight > 0 ? weight * (1 - bodyFatPercentage / 100) : 0;
    const fatMass = weight > 0 ? weight * (bodyFatPercentage / 100) : 0;

    return {
      bodyComposition: {
        bodyFatPercentage,
        sumOfSkinfolds
      },
      bmr,
      bmi,
      bmiClassification,
      bodyFatClassification,
      leanMass,
      fatMass
    };
  }, [formData]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getClassificationColor = (classification: string) => {
    switch (classification.toLowerCase()) {
      case 'baixo':
      case 'underweight':
        return 'text-blue-600';
      case 'normal':
      case 'ideal':
        return 'text-green-600';
      case 'sobrepeso':
      case 'overweight':
        return 'text-yellow-600';
      case 'obesidade':
      case 'obesity':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Resultados da Avaliação</h2>
        <p className="text-gray-600">Confira os resultados antes de salvar</p>
      </div>

      {/* Informações Básicas */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <User className="w-5 h-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Informações do Aluno</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Nome</p>
            <p className="font-medium">{studentName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Data da Avaliação</p>
            <p className="font-medium">{formatDate(new Date())}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Idade</p>
            <p className="font-medium">{formData.age} anos</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Gênero</p>
            <p className="font-medium">{formData.gender === 'M' ? 'Masculino' : 'Feminino'}</p>
          </div>
        </div>
      </div>

      {/* Medidas Antropométricas */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <Ruler className="w-5 h-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Medidas Antropométricas</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Peso</p>
            <p className="text-xl font-bold text-blue-600">{formData.weight} kg</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Altura</p>
            <p className="text-xl font-bold text-blue-600">{formData.height} cm</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">IMC</p>
            <p className="text-xl font-bold text-blue-600">{results.bmi.toFixed(1)}</p>
            <p className={`text-xs font-medium ${getClassificationColor(results.bmiClassification)}`}>
              {results.bmiClassification}
            </p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Circunferências</p>
            <p className="text-xs text-gray-500">{[
              formData.arm_circ,
              formData.chest_circ,
              formData.waist_circ,
              formData.hip_circ,
              formData.thigh_circ,
              formData.calf_circ
            ].filter(Boolean).length} medidas</p>
          </div>
        </div>
      </div>

      {/* Composição Corporal */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <Calculator className="w-5 h-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Composição Corporal</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600">% Gordura</p>
            <p className="text-2xl font-bold text-blue-600">{results.bodyComposition.bodyFatPercentage.toFixed(1)}%</p>
            <p className={`text-xs font-medium ${getClassificationColor(results.bodyFatClassification)}`}>
              {results.bodyFatClassification}
            </p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-gray-600">Massa Magra</p>
            <p className="text-2xl font-bold text-green-600">{results.leanMass.toFixed(1)} kg</p>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-sm text-gray-600">Massa Gorda</p>
            <p className="text-2xl font-bold text-orange-600">{results.fatMass.toFixed(1)} kg</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-gray-600">Taxa Metabólica Basal</p>
            <p className="text-xl font-bold text-purple-600">{results.bmr.toFixed(0)} kcal</p>
          </div>
        </div>

        {/* Dobra Cutâneas */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Dobras Cutâneas (mm)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              ['Tricipital', formData.triceps_skinfold],
              ['Bicipital', formData.biceps_skinfold],
              ['Subescapular', formData.subscapular_skinfold],
              ['Suprailíaca', formData.suprailiac_skinfold],
              ['Abdominal', formData.abdominal_skinfold],
              ['Coxa', formData.thigh_skinfold],
              ['Panturrilha', formData.calf_skinfold]
            ].filter(([_, v]) => !!v).map(([label, value]) => (
              <div key={String(label)} className="flex justify-between">
                <span className="text-gray-600 capitalize">{label}:</span>
                <span className="font-medium">{value} mm</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Soma das dobras: <span className="font-medium">{results.bodyComposition.sumOfSkinfolds.toFixed(1)} mm</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Calculado usando fórmula de Pollock para 7 dobras cutâneas
            </p>
          </div>
        </div>
      </div>

      {/* Medidas Circunferências */}
      {[
        formData.arm_circ,
        formData.chest_circ,
        formData.waist_circ,
        formData.hip_circ,
        formData.thigh_circ,
        formData.calf_circ
      ].some(Boolean) && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <TrendingUp className="w-5 h-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Circunferências (cm)</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              ['Braço', formData.arm_circ],
              ['Tórax', formData.chest_circ],
              ['Cintura', formData.waist_circ],
              ['Quadril', formData.hip_circ],
              ['Coxa', formData.thigh_circ],
              ['Panturrilha', formData.calf_circ]
            ].filter(([_, v]) => !!v).map(([label, value]) => (
              <div key={String(label)} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 capitalize">{label}</p>
                <p className="text-lg font-bold text-gray-900">{value} cm</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex justify-between pt-6">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </button>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              try {
                const blob = await generateAssessmentPdf(formData, results, studentName);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const date = formData.assessment_date || new Date().toISOString().split('T')[0];
                a.href = url;
                a.download = `avaliacao_${studentName?.replace(/\s+/g, '_') || 'aluno'}_${date}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (e) {
                console.error('Erro ao gerar PDF da avaliação', e);
              }
            }}
            className="px-6 py-2 border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Gerar PDF
          </button>
          <button
            onClick={onSave}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center"
          >
            <Save className="w-4 h-4 mr-2" />
            Salvar Avaliação
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 text-center">
        Os resultados serão salvos no perfil do aluno e poderão ser acessados posteriormente
      </p>
    </motion.div>
  );
}
