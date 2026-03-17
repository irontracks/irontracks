// Componente de medidas corporais (circunferências) — com suporte bilateral (esq/dir)

import React from 'react';
import { Ruler, Info } from 'lucide-react';
import { AssessmentFormData } from '@/types/assessment';

interface MeasurementStepProps {
  formData: AssessmentFormData;
  updateFormData: (updates: Partial<AssessmentFormData>) => void;
  errors: Record<string, string>;
  studentName: string;
}

type CircField = keyof AssessmentFormData;

interface MeasurementDef {
  label: string;
  description: string;
  placeholder: string;
  /** If bilateral, contains left/right field keys. */
  bilateral?: { left: CircField; right: CircField };
  /** Single field key (used for non-bilateral or as legacy average field). */
  field: CircField;
}

export const MeasurementStep: React.FC<MeasurementStepProps> = ({
  formData,
  updateFormData,
  errors,
  studentName
}) => {
  const handleNumberInput = (field: CircField, value: string) => {
    const cleanedValue = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    updateFormData({ [field]: cleanedValue });
  };

  const measurements: MeasurementDef[] = [
    {
      field: 'arm_circ',
      label: 'Braço',
      description: 'Circunferência do braço relaxado, no ponto médio entre ombro e cotovelo',
      placeholder: 'Ex: 32.5',
      bilateral: { left: 'arm_circ_left', right: 'arm_circ_right' },
    },
    {
      field: 'chest_circ',
      label: 'Tórax',
      description: 'Circunferência do tórax na linha dos mamilos',
      placeholder: 'Ex: 95.0',
    },
    {
      field: 'waist_circ',
      label: 'Cintura',
      description: 'Circunferência da cintura no ponto mais estreito entre costelas e quadril',
      placeholder: 'Ex: 78.5',
    },
    {
      field: 'hip_circ',
      label: 'Quadril',
      description: 'Circunferência do quadril no ponto mais largo',
      placeholder: 'Ex: 95.0',
    },
    {
      field: 'thigh_circ',
      label: 'Coxa',
      description: 'Circunferência da coxa 1 cm abaixo da virilha',
      placeholder: 'Ex: 55.0',
      bilateral: { left: 'thigh_circ_left', right: 'thigh_circ_right' },
    },
    {
      field: 'calf_circ',
      label: 'Panturrilha',
      description: 'Circunferência da panturrilha no ponto de maior perímetro',
      placeholder: 'Ex: 36.5',
      bilateral: { left: 'calf_circ_left', right: 'calf_circ_right' },
    }
  ];

  const renderBilateralInput = (m: MeasurementDef) => {
    const { bilateral } = m;
    if (!bilateral) return null;

    const leftVal = formData[bilateral.left] || '';
    const rightVal = formData[bilateral.right] || '';
    const leftNum = parseFloat(String(leftVal).replace(',', '.'));
    const rightNum = parseFloat(String(rightVal).replace(',', '.'));
    const avg = !isNaN(leftNum) && leftNum > 0 && !isNaN(rightNum) && rightNum > 0
      ? ((leftNum + rightNum) / 2).toFixed(1)
      : null;

    return (
      <div className="space-y-3">
        <div className="flex items-center">
          <Ruler className="w-4 h-4 text-yellow-500 mr-2" />
          <label className="block text-sm font-bold text-neutral-300">
            {m.label}
          </label>
          <span className="ml-2 text-xs text-neutral-500">(cm)</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Esquerdo */}
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Esquerdo</label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={String(leftVal)}
                onChange={(e) => handleNumberInput(bilateral.left, e.target.value)}
                placeholder={m.placeholder}
                className={`w-full px-3 py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600 text-white bg-neutral-800 ${
                  errors[bilateral.left] ? 'border-red-500' : 'border-neutral-700'
                }`}
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm">cm</span>
            </div>
            {errors[bilateral.left] && (
              <p className="text-sm text-red-500 mt-1">{errors[bilateral.left]}</p>
            )}
          </div>

          {/* Direito */}
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Direito</label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={String(rightVal)}
                onChange={(e) => handleNumberInput(bilateral.right, e.target.value)}
                placeholder={m.placeholder}
                className={`w-full px-3 py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600 text-white bg-neutral-800 ${
                  errors[bilateral.right] ? 'border-red-500' : 'border-neutral-700'
                }`}
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm">cm</span>
            </div>
            {errors[bilateral.right] && (
              <p className="text-sm text-red-500 mt-1">{errors[bilateral.right]}</p>
            )}
          </div>
        </div>

        {avg && (
          <div className="flex items-center bg-neutral-900/60 rounded-lg px-3 py-1.5">
            <span className="text-xs text-neutral-400">Média:</span>
            <span className="ml-1 text-xs font-bold text-yellow-500">{avg} cm</span>
          </div>
        )}

        <p className="text-xs text-neutral-500">{m.description}</p>
      </div>
    );
  };

  const renderSingleInput = (m: MeasurementDef) => (
    <div className="space-y-3">
      <div className="flex items-center">
        <Ruler className="w-4 h-4 text-yellow-500 mr-2" />
        <label className="block text-sm font-bold text-neutral-300">
          {m.label}
        </label>
        <span className="ml-2 text-xs text-neutral-500">(cm)</span>
      </div>

      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={formData[m.field]}
          onChange={(e) => handleNumberInput(m.field, e.target.value)}
          placeholder={m.placeholder}
          className={`w-full px-3 py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600 text-white bg-neutral-800 ${
            errors[m.field] ? 'border-red-500' : 'border-neutral-700'
          }`}
        />
        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm">cm</span>
      </div>

      <p className="text-xs text-neutral-500">{m.description}</p>

      {errors[m.field] && (
        <p className="text-sm text-red-500">{errors[m.field]}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Medidas Corporais</h2>
        <p className="text-neutral-400">
          Registre as circunferências corporais de <span className="font-semibold text-white">{studentName}</span>
        </p>
      </div>

      {/* Informações de Medição */}
      <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4">
        <div className="flex items-start">
          <Info className="w-5 h-5 text-yellow-500 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-neutral-300">
            <p className="font-bold mb-2 text-yellow-500">Orientações para medição:</p>
            <ul className="space-y-1">
              <li>• Use fita métrica flexível e não elástica</li>
              <li>• O aluno deve estar em pé, relaxado, com respiração normal</li>
              <li>• A fita deve estar paralela ao solo e sem comprimir a pele</li>
              <li>• Faça 3 medições e anote a média</li>
              <li>• <strong className="text-yellow-500">Meça os dois lados</strong> para braço, coxa e panturrilha</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {measurements.map((m) => (
          <div key={m.field}>
            {m.bilateral ? renderBilateralInput(m) : renderSingleInput(m)}
          </div>
        ))}
      </div>

      {/* Valores de Referência */}
      <div className="rounded-2xl p-4 border relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
        <h3 className="text-sm font-bold text-white mb-3">Valores de Referência:</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs text-neutral-400">
          <div>
            <p className="font-bold text-neutral-300">Braço:</p>
            <p>20-50 cm</p>
          </div>
          <div>
            <p className="font-bold text-neutral-300">Tórax:</p>
            <p>70-130 cm</p>
          </div>
          <div>
            <p className="font-bold text-neutral-300">Cintura:</p>
            <p>60-120 cm</p>
          </div>
          <div>
            <p className="font-bold text-neutral-300">Quadril:</p>
            <p>70-140 cm</p>
          </div>
          <div>
            <p className="font-bold text-neutral-300">Coxa:</p>
            <p>40-80 cm</p>
          </div>
          <div>
            <p className="font-bold text-neutral-300">Panturrilha:</p>
            <p>25-50 cm</p>
          </div>
        </div>
      </div>

      {/* Dicas de Precisão */}
      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
        <h3 className="text-sm font-bold text-yellow-500 mb-2">Dicas para maior precisão:</h3>
        <ul className="text-sm text-yellow-400/80 space-y-1">
          <li>• Meça ambos os lados (esquerdo e direito) para braço, coxa e panturrilha</li>
          <li>• Para cintura, meça no ponto médio entre a última costela e a crista ilíaca</li>
          <li>• Para quadril, meça no ponto de maior protuberância dos glúteos</li>
          <li>• Anote o horário da medição (manhã costuma ser mais consistente)</li>
          <li>• Se possível, faça a medição em local com temperatura controlada</li>
        </ul>
      </div>

      {/* Observações */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-neutral-300">
          Observações (opcional)
        </label>
        <textarea
          value={formData.observations}
          onChange={(e) => updateFormData({ observations: e.target.value })}
          rows={3}
          placeholder="Anote aqui qualquer observação relevante sobre as medições, condições do aluno, etc."
          className="w-full px-3 py-3 border border-neutral-700 bg-neutral-800 text-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600"
        />
        <p className="text-xs text-neutral-500">
          Ex: &quot;Aluno estava resfriado&quot;, &quot;Medições tomadas pela manhã&quot;, &quot;Equipamento calibrado em...&quot;
        </p>
      </div>
    </div>
  );
};
