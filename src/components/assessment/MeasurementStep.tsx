// Componente de medidas corporais (circunferências)

import React from 'react';
import { Ruler, Info } from 'lucide-react';
import { AssessmentFormData } from '@/types/assessment';

interface MeasurementStepProps {
  formData: AssessmentFormData;
  updateFormData: (updates: Partial<AssessmentFormData>) => void;
  errors: Record<string, string>;
  studentName: string;
}

export const MeasurementStep: React.FC<MeasurementStepProps> = ({
  formData,
  updateFormData,
  errors,
  studentName
}) => {
  const handleNumberInput = (field: keyof AssessmentFormData, value: string) => {
    // Permitir apenas números e vírgula/ponto para decimais
    const cleanedValue = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    updateFormData({ [field]: cleanedValue });
  };

  const measurements = [
    {
      field: 'arm_circ' as keyof AssessmentFormData,
      label: 'Braço',
      description: 'Circunferência do braço relaxado, no ponto médio entre ombro e cotovelo',
      placeholder: 'Ex: 32.5'
    },
    {
      field: 'chest_circ' as keyof AssessmentFormData,
      label: 'Tórax',
      description: 'Circunferência do tórax na linha dos mamilos',
      placeholder: 'Ex: 95.0'
    },
    {
      field: 'waist_circ' as keyof AssessmentFormData,
      label: 'Cintura',
      description: 'Circunferência da cintura no ponto mais estreito entre costelas e quadril',
      placeholder: 'Ex: 78.5'
    },
    {
      field: 'hip_circ' as keyof AssessmentFormData,
      label: 'Quadril',
      description: 'Circunferência do quadril no ponto mais largo',
      placeholder: 'Ex: 95.0'
    },
    {
      field: 'thigh_circ' as keyof AssessmentFormData,
      label: 'Coxa',
      description: 'Circunferência da coxa 1 cm abaixo da virilha',
      placeholder: 'Ex: 55.0'
    },
    {
      field: 'calf_circ' as keyof AssessmentFormData,
      label: 'Panturrilha',
      description: 'Circunferência da panturrilha no ponto de maior perímetro',
      placeholder: 'Ex: 36.5'
    }
  ];

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
            </ul>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {measurements.map((measurement, index) => (
          <div key={measurement.field} className="space-y-3">
            <div className="flex items-center">
              <Ruler className="w-4 h-4 text-yellow-500 mr-2" />
              <label className="block text-sm font-bold text-neutral-300">
                {measurement.label}
              </label>
              <span className="ml-2 text-xs text-neutral-500">(cm)</span>
            </div>

            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={formData[measurement.field]}
                onChange={(e) => handleNumberInput(measurement.field, e.target.value)}
                placeholder={measurement.placeholder}
                className={`w-full px-3 py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600 text-white bg-neutral-800 ${errors[measurement.field] ? 'border-red-500' : 'border-neutral-700'
                  }`}
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm">cm</span>
            </div>

            <p className="text-xs text-neutral-500">{measurement.description}</p>

            {errors[measurement.field] && (
              <p className="text-sm text-red-500">{errors[measurement.field]}</p>
            )}
          </div>
        ))}
      </div>

      {/* Valores de Referência */}
      <div className="bg-neutral-800 rounded-xl p-4 border border-neutral-700">
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
          <li>• Sempre meça do mesmo lado do corpo (preferencialmente lado direito)</li>
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
