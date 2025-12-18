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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Medidas Corporais</h2>
        <p className="text-gray-600">
          Registre as circunferências corporais de <span className="font-semibold">{studentName}</span>
        </p>
      </div>

      {/* Informações de Medição */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-2">Orientações para medição:</p>
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
              <Ruler className="w-4 h-4 text-gray-400 mr-2" />
              <label className="block text-sm font-medium text-gray-700">
                {measurement.label}
              </label>
              <span className="ml-2 text-xs text-gray-400">(cm)</span>
            </div>
            
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={formData[measurement.field]}
                onChange={(e) => handleNumberInput(measurement.field, e.target.value)}
                placeholder={measurement.placeholder}
                className={`w-full px-3 py-2 pr-12 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-600 text-gray-900 bg-white ${
                  errors[measurement.field] ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm">cm</span>
            </div>
            
            <p className="text-xs text-gray-500">{measurement.description}</p>
            
            {errors[measurement.field] && (
              <p className="text-sm text-red-600">{errors[measurement.field]}</p>
            )}
          </div>
        ))}
      </div>

      {/* Valores de Referência */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Valores de Referência:</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs text-gray-600">
          <div>
            <p className="font-medium">Braço:</p>
            <p>20-50 cm</p>
          </div>
          <div>
            <p className="font-medium">Tórax:</p>
            <p>70-130 cm</p>
          </div>
          <div>
            <p className="font-medium">Cintura:</p>
            <p>60-120 cm</p>
          </div>
          <div>
            <p className="font-medium">Quadril:</p>
            <p>70-140 cm</p>
          </div>
          <div>
            <p className="font-medium">Coxa:</p>
            <p>40-80 cm</p>
          </div>
          <div>
            <p className="font-medium">Panturrilha:</p>
            <p>25-50 cm</p>
          </div>
        </div>
      </div>

      {/* Dicas de Precisão */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-yellow-900 mb-2">Dicas para maior precisão:</h3>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• Sempre meça do mesmo lado do corpo (preferencialmente lado direito)</li>
          <li>• Para cintura, meça no ponto médio entre a última costela e a crista ilíaca</li>
          <li>• Para quadril, meça no ponto de maior protuberância dos glúteos</li>
          <li>• Anote o horário da medição (manhã costuma ser mais consistente)</li>
          <li>• Se possível, faça a medição em local com temperatura controlada</li>
        </ul>
      </div>

      {/* Observações */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Observações (opcional)
        </label>
        <textarea
          value={formData.observations}
          onChange={(e) => updateFormData({ observations: e.target.value })}
          rows={3}
          placeholder="Anote aqui qualquer observação relevante sobre as medições, condições do aluno, etc."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="text-xs text-gray-500">
          Ex: "Aluno estava resfriado", "Medições tomadas pela manhã", "Equipamento calibrado em..."
        </p>
      </div>
    </div>
  );
};
