import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, ArrowLeft, User, Ruler, Calculator, TrendingUp, FileText, Code } from 'lucide-react';
import dynamic from 'next/dynamic';
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

const BodyMeasurementMap = dynamic(() => import('./BodyMeasurementMap'), { ssr: false })

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

    // Helper: bilateral average or direct value
    const avgBilateral = (direct: string, left: string, right: string): number => {
      const d = formData as unknown as Record<string, string>;
      const l = parseFloat(d[left] || '0');
      const r = parseFloat(d[right] || '0');
      if (l > 0 && r > 0) return (l + r) / 2;
      if (l > 0) return l;
      if (r > 0) return r;
      return parseFloat(d[direct] || '0');
    };

    const tricepsAvg = avgBilateral('triceps_skinfold', 'triceps_skinfold_left', 'triceps_skinfold_right');
    const bicepsAvg = avgBilateral('biceps_skinfold', 'biceps_skinfold_left', 'biceps_skinfold_right');
    const thighSkinAvg = avgBilateral('thigh_skinfold', 'thigh_skinfold_left', 'thigh_skinfold_right');
    const calfSkinAvg = avgBilateral('calf_skinfold', 'calf_skinfold_left', 'calf_skinfold_right');

    const sumOfSkinfolds = calculateSumSkinfolds({
      triceps_skinfold: tricepsAvg,
      biceps_skinfold: bicepsAvg,
      subscapular_skinfold: parseFloat(formData.subscapular_skinfold || '0'),
      suprailiac_skinfold: parseFloat(formData.suprailiac_skinfold || '0'),
      abdominal_skinfold: parseFloat(formData.abdominal_skinfold || '0'),
      thigh_skinfold: thighSkinAvg,
      calf_skinfold: calfSkinAvg
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
      // generateAssessmentPdf now opens the printable page internally
      await generateAssessmentPdf(formData as unknown as Record<string, unknown>, results, studentName);
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
      className="space-y-4"
    >
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-white mb-1">Resultados da Avaliação</h2>
        <p className="text-neutral-400 text-sm">Confira os resultados antes de salvar</p>
      </div>

      {/* Informações Básicas */}
      <div className="rounded-2xl border p-5 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
        <div className="flex items-center gap-2 mb-3">
          <User className="w-5 h-5 text-yellow-500 shrink-0" />
          <h3 className="text-lg font-bold text-white">Informações do Aluno</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Nome</p>
            <p className="font-semibold text-white text-sm mt-0.5 truncate">{studentName}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Data</p>
            <p className="font-semibold text-white text-sm mt-0.5">{formatDate(new Date())}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Idade</p>
            <p className="font-semibold text-white text-sm mt-0.5">{formData.age} anos</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Gênero</p>
            <p className="font-semibold text-white text-sm mt-0.5">{formData.gender === 'M' ? 'Masculino' : 'Feminino'}</p>
          </div>
        </div>
      </div>

      {/* Medidas Antropométricas */}
      <div className="rounded-2xl border p-5 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
        <div className="flex items-center gap-2 mb-3">
          <Ruler className="w-5 h-5 text-yellow-500 shrink-0" />
          <h3 className="text-lg font-bold text-white">Medidas Antropométricas</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-3 bg-neutral-900 rounded-xl min-h-[88px] flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Peso</p>
            <p className="text-xl font-black text-white mt-1 whitespace-nowrap">{formData.weight} <span className="text-sm font-bold text-neutral-400">kg</span></p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-xl min-h-[88px] flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Altura</p>
            <p className="text-xl font-black text-white mt-1 whitespace-nowrap">{formData.height} <span className="text-sm font-bold text-neutral-400">cm</span></p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-xl min-h-[88px] flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">IMC</p>
            <p className="text-xl font-black text-white mt-1">{results.bmi.toFixed(1)}</p>
            <p className={`text-[11px] font-bold mt-0.5 ${getClassificationColor(results.bmiClassification)}`}>
              {results.bmiClassification}
            </p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-xl min-h-[88px] flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Circunf.</p>
            <p className="text-xl font-black text-white mt-1">{[
              formData.arm_circ,
              formData.chest_circ,
              formData.waist_circ,
              formData.hip_circ,
              formData.thigh_circ,
              formData.calf_circ
            ].filter(Boolean).length}</p>
            <p className="text-[11px] text-neutral-500 font-bold">medidas</p>
          </div>
        </div>
      </div>

      {/* Composição Corporal */}
      <div className="rounded-2xl border p-5 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="w-5 h-5 text-yellow-500 shrink-0" />
          <h3 className="text-lg font-bold text-white">Composição Corporal</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="text-center p-3 bg-neutral-900 rounded-xl border border-neutral-800 min-h-[88px] flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">% Gordura</p>
            <p className="text-xl font-black text-white mt-1">{results.bodyComposition.bodyFatPercentage.toFixed(1)}%</p>
            <p className={`text-[11px] font-bold mt-0.5 ${getClassificationColor(results.bodyFatClassification)}`}>
              {results.bodyFatClassification}
            </p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-xl border border-neutral-800 min-h-[88px] flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Massa Magra</p>
            <p className="text-xl font-black text-emerald-400 mt-1 whitespace-nowrap">{results.leanMass.toFixed(1)} <span className="text-sm font-bold">kg</span></p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-xl border border-neutral-800 min-h-[88px] flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">Massa Gorda</p>
            <p className="text-xl font-black text-red-400 mt-1 whitespace-nowrap">{results.fatMass.toFixed(1)} <span className="text-sm font-bold">kg</span></p>
          </div>
          <div className="text-center p-3 bg-neutral-900 rounded-xl border border-neutral-800 min-h-[88px] flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide font-bold">TMB</p>
            <p className="text-xl font-black text-yellow-400 mt-1 whitespace-nowrap">{results.bmr.toFixed(0)} <span className="text-sm font-bold">kcal</span></p>
          </div>
        </div>

        {/* Dobras Cutâneas */}
        <div className="bg-neutral-900 rounded-xl p-4">
          <h4 className="font-bold text-white mb-3 text-sm">Dobras Cutâneas (mm)</h4>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {([
              { label: 'Tríceps', left: formData.triceps_skinfold_left, right: formData.triceps_skinfold_right, single: formData.triceps_skinfold },
              { label: 'Bíceps', left: formData.biceps_skinfold_left, right: formData.biceps_skinfold_right, single: formData.biceps_skinfold },
              { label: 'Subesc.', single: formData.subscapular_skinfold },
              { label: 'Supraíl.', single: formData.suprailiac_skinfold },
              { label: 'Abdom.', single: formData.abdominal_skinfold },
              { label: 'Coxa', left: formData.thigh_skinfold_left, right: formData.thigh_skinfold_right, single: formData.thigh_skinfold },
              { label: 'Pantur.', left: formData.calf_skinfold_left, right: formData.calf_skinfold_right, single: formData.calf_skinfold },
            ] as { label: string; left?: string; right?: string; single?: string }[]).filter(s => !!(s.left || s.right || s.single)).map((s) => {
              const hasLR = !!(s.left && s.right);
              const l = parseFloat(s.left || '0');
              const r = parseFloat(s.right || '0');
              const avg = (l > 0 && r > 0) ? ((l + r) / 2).toFixed(1) : null;
              const display = avg || s.single || (l > 0 ? String(l) : String(r));
              return (
                <div key={s.label} className="text-center p-2 bg-neutral-800/60 rounded-lg">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wide font-bold truncate">{s.label}</p>
                  <p className="text-base font-black text-white mt-0.5">{display}</p>
                  {hasLR && <p className="text-[9px] text-neutral-600 mt-0.5">E:{s.left} D:{s.right}</p>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-neutral-700 flex items-center justify-between">
            <p className="text-xs text-neutral-400">
              Soma das dobras: <span className="font-black text-white">{results.bodyComposition.sumOfSkinfolds.toFixed(1)} mm</span>
            </p>
            <p className="text-[10px] text-neutral-600">
              Pollock 7 dobras
            </p>
          </div>
        </div>
      </div>

      {/* Mapa Corporal com Medidas */}
      <BodyMeasurementMap formData={formData} bodyFatPercentage={results.bodyComposition.bodyFatPercentage} />

      {/* Medidas Circunferências */}
      {[
        formData.arm_circ,
        formData.chest_circ,
        formData.waist_circ,
        formData.hip_circ,
        formData.thigh_circ,
        formData.calf_circ
      ].some(Boolean) && (
          <div className="rounded-2xl border p-5 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-yellow-500 shrink-0" />
              <h3 className="text-lg font-bold text-white">Circunferências (cm)</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {([
                { label: 'Braço', left: formData.arm_circ_left, right: formData.arm_circ_right, single: formData.arm_circ },
                { label: 'Tórax', single: formData.chest_circ },
                { label: 'Cintura', single: formData.waist_circ },
                { label: 'Quadril', single: formData.hip_circ },
                { label: 'Coxa', left: formData.thigh_circ_left, right: formData.thigh_circ_right, single: formData.thigh_circ },
                { label: 'Panturrilha', left: formData.calf_circ_left, right: formData.calf_circ_right, single: formData.calf_circ },
              ] as { label: string; left?: string; right?: string; single?: string }[]).filter(c => !!(c.left || c.right || c.single)).map((c) => {
                const hasLR = !!(c.left && c.right);
                const l = parseFloat(c.left || '0');
                const r = parseFloat(c.right || '0');
                const avg = (l > 0 && r > 0) ? ((l + r) / 2).toFixed(1) : null;
                const display = avg || c.single || (l > 0 ? String(l) : String(r));
                return (
                  <div key={c.label} className="text-center p-3 bg-neutral-900 rounded-lg">
                    <p className="text-sm text-neutral-400 capitalize">{c.label}</p>
                    <p className="text-lg font-bold text-white">{display} cm</p>
                    {hasLR && <p className="text-[10px] text-neutral-600 mt-0.5">E:{c.left} D:{c.right}</p>}
                  </div>
                );
              })}
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
