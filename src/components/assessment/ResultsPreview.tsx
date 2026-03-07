import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, ArrowLeft, User, Ruler, Calculator, TrendingUp, FileText, Code } from 'lucide-react';
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
import { logError, logWarn, logInfo } from '@/lib/logger'

interface ResultsPreviewProps {
  formData: AssessmentFormData;
  onBack: () => void;
  studentName: string;
}

export default function ResultsPreview({ formData, onBack, studentName }: ResultsPreviewProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
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
    } as unknown as Parameters<typeof calculateSumSkinfolds>[0]);

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

  const handleExportPdf = async () => {
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
      logError('error', 'Erro ao gerar PDF da avaliação', e);
    } finally {
      setShowExportMenu(false);
    }
  };

  const handleExportJson = () => {
    try {
      const payload = {
        formData: formData || {},
        results: results || {}
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = formData.assessment_date || new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `avaliacao_${studentName?.replace(/\s+/g, '_') || 'aluno'}_${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      logError('error', 'Erro ao exportar avaliação em JSON', e);
    } finally {
      setShowExportMenu(false);
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
        <h2 className="text-2xl font-bold text-white mb-2">Resultados da Avaliação</h2>
        <p className="text-neutral-400">Confira os resultados antes de salvar</p>
      </div>

      {/* Informações Básicas */}
      <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6">
        <div className="flex items-center mb-4">
          <User className="w-5 h-5 text-yellow-500 mr-2" />
          <h3 className="text-lg font-bold text-white">Informações do Aluno</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-neutral-400">Nome</p>
            <p className="font-medium text-white">{studentName}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-400">Data da Avaliação</p>
            <p className="font-medium text-white">{formatDate(new Date())}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-400">Idade</p>
            <p className="font-medium text-white">{formData.age} anos</p>
          </div>
          <div>
            <p className="text-sm text-neutral-400">Gênero</p>
            <p className="font-medium text-white">{formData.gender === 'M' ? 'Masculino' : 'Feminino'}</p>
          </div>
        </div>
      </div>

      {/* Medidas Antropométricas */}
      <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6">
        <div className="flex items-center mb-4">
          <Ruler className="w-5 h-5 text-yellow-500 mr-2" />
          <h3 className="text-lg font-bold text-white">Medidas Antropométricas</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-neutral-900 rounded-lg">
            <p className="text-sm text-neutral-400">Peso</p>
            <p className="text-xl font-bold text-white">{formData.weight} kg</p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-lg">
            <p className="text-sm text-neutral-400">Altura</p>
            <p className="text-xl font-bold text-white">{formData.height} cm</p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-lg">
            <p className="text-sm text-neutral-400">IMC</p>
            <p className="text-xl font-bold text-white">{results.bmi.toFixed(1)}</p>
            <p className={`text-xs font-medium ${getClassificationColor(results.bmiClassification)}`}>
              {results.bmiClassification}
            </p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-lg">
            <p className="text-sm text-neutral-400">Circunferências</p>
            <p className="text-xs text-neutral-500">{[
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
      <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6">
        <div className="flex items-center mb-4">
          <Calculator className="w-5 h-5 text-yellow-500 mr-2" />
          <h3 className="text-lg font-bold text-white">Composição Corporal</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-neutral-900 rounded-lg border border-neutral-800">
            <p className="text-sm text-neutral-400">% Gordura</p>
            <p className="text-2xl font-bold text-white">{results.bodyComposition.bodyFatPercentage.toFixed(1)}%</p>
            <p className={`text-xs font-medium ${getClassificationColor(results.bodyFatClassification)}`}>
              {results.bodyFatClassification}
            </p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-lg border border-neutral-800">
            <p className="text-sm text-neutral-400">Massa Magra</p>
            <p className="text-2xl font-bold text-green-400">{results.leanMass.toFixed(1)} kg</p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-lg border border-neutral-800">
            <p className="text-sm text-neutral-400">Massa Gorda</p>
            <p className="text-2xl font-bold text-red-400">{results.fatMass.toFixed(1)} kg</p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-lg border border-neutral-800">
            <p className="text-sm text-neutral-400">Taxa Metabólica Basal</p>
            <p className="text-xl font-bold text-yellow-400">{results.bmr.toFixed(0)} kcal</p>
          </div>
        </div>

        {/* Dobra Cutâneas */}
        <div className="bg-neutral-900 rounded-xl p-4">
          <h4 className="font-bold text-white mb-3">Dobras Cutâneas (mm)</h4>
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
                <span className="text-neutral-400 capitalize">{label}:</span>
                <span className="font-medium text-white">{value} mm</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-neutral-700">
            <p className="text-sm text-neutral-400">
              Soma das dobras: <span className="font-medium text-white">{results.bodyComposition.sumOfSkinfolds.toFixed(1)} mm</span>
            </p>
            <p className="text-xs text-neutral-500 mt-1">
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
          <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6">
            <div className="flex items-center mb-4">
              <TrendingUp className="w-5 h-5 text-yellow-500 mr-2" />
              <h3 className="text-lg font-bold text-white">Circunferências (cm)</h3>
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
                <div key={String(label)} className="text-center p-3 bg-neutral-900 rounded-lg">
                  <p className="text-sm text-neutral-400 capitalize">{label}</p>
                  <p className="text-lg font-bold text-white">{value} cm</p>
                </div>
              ))}
            </div>
          </div>
        )}

      <div className="flex justify-end items-center pt-6">
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(v => !v)}
            className="px-6 py-2 border border-yellow-500/30 rounded-xl text-yellow-500 hover:bg-yellow-500/10 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Exportar</span>
          </button>
          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-52 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl z-10">
              <button
                onClick={handleExportPdf}
                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-neutral-100 hover:bg-neutral-800"
              >
                <FileText className="w-4 h-4 text-yellow-500" />
                <span>Exportar PDF</span>
              </button>
              <button
                onClick={handleExportJson}
                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-neutral-100 hover:bg-neutral-800"
              >
                <Code className="w-4 h-4 text-yellow-500" />
                <span>Exportar JSON</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-neutral-500 text-center mt-4">
        Os resultados serão salvos no perfil do aluno e poderão ser acessados posteriormente
      </p>
    </motion.div>
  );
}
