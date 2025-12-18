// Componente de informações básicas da avaliação física

import React from 'react';
import { Calendar, User, Weight, Ruler } from 'lucide-react';
import { AssessmentFormData } from '@/types/assessment';

interface BasicInfoStepProps {
  formData: AssessmentFormData;
  updateFormData: (updates: Partial<AssessmentFormData>) => void;
  errors: Record<string, string>;
  studentName: string;
}

export const BasicInfoStep: React.FC<BasicInfoStepProps> = ({
  formData,
  updateFormData,
  errors,
  studentName
}) => {
  const handleInputChange = (field: keyof AssessmentFormData, value: string) => {
    updateFormData({ [field]: value });
  };

  const handleNumberInput = (field: keyof AssessmentFormData, value: string) => {
    // Permitir apenas números e vírgula/ponto para decimais
    const cleanedValue = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    updateFormData({ [field]: cleanedValue });
  };

  const handleIntegerInput = (field: keyof AssessmentFormData, value: string) => {
    // Permitir apenas números inteiros
    const cleanedValue = value.replace(/[^0-9]/g, '');
    updateFormData({ [field]: cleanedValue });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Informações Básicas</h2>
        <p className="text-gray-600">
          Preencha os dados fundamentais para a avaliação física de <span className="font-semibold">{studentName}</span>
        </p>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Data da Avaliação */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            <Calendar className="w-4 h-4 inline mr-2" />
            Data da Avaliação *
          </label>
          <input
            type="date"
            value={formData.assessment_date}
            onChange={(e) => handleInputChange('assessment_date', e.target.value)}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-600 text-gray-900 bg-white ${
              errors.assessment_date ? 'border-red-300' : 'border-gray-300'
            }`}
            max={new Date().toISOString().split('T')[0]}
          />
          {errors.assessment_date && (
            <p className="text-sm text-red-600">{errors.assessment_date}</p>
          )}
        </div>

        {/* Peso */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            <Weight className="w-4 h-4 inline mr-2" />
            Peso (kg) *
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={formData.weight}
              onChange={(e) => handleNumberInput('weight', e.target.value)}
              placeholder="Ex: 75.5"
              className={`w-full px-3 py-2 pr-12 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-600 text-gray-900 bg-white ${
                errors.weight ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm">kg</span>
          </div>
          {errors.weight && (
            <p className="text-sm text-red-600">{errors.weight}</p>
          )}
        </div>

        {/* Altura */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            <Ruler className="w-4 h-4 inline mr-2" />
            Altura (cm) *
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={formData.height}
              onChange={(e) => handleNumberInput('height', e.target.value)}
              placeholder="Ex: 175"
              className={`w-full px-3 py-2 pr-12 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-600 text-gray-900 bg-white ${
                errors.height ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm">cm</span>
          </div>
          {errors.height && (
            <p className="text-sm text-red-600">{errors.height}</p>
          )}
        </div>

        {/* Idade */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            <User className="w-4 h-4 inline mr-2" />
            Idade (anos) *
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={formData.age}
              onChange={(e) => handleIntegerInput('age', e.target.value)}
              placeholder="Ex: 25"
              className={`w-full px-3 py-2 pr-12 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-600 text-gray-900 bg-white ${
                errors.age ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm">anos</span>
          </div>
          {errors.age && (
            <p className="text-sm text-red-600">{errors.age}</p>
          )}
        </div>

        {/* Gênero */}
        <div className="space-y-2 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            <User className="w-4 h-4 inline mr-2" />
            Gênero *
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="gender"
                value="M"
                checked={formData.gender === 'M'}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Masculino</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="gender"
                value="F"
                checked={formData.gender === 'F'}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Feminino</span>
            </label>
          </div>
          {errors.gender && (
            <p className="text-sm text-red-600">{errors.gender}</p>
          )}
        </div>
      </div>

      {/* Informações Importantes */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Importante:</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Certifique-se de que as medidas foram tomadas corretamente</li>
          <li>• O aluno deve estar em jejum ou ter seguido as orientações pré-avaliação</li>
          <li>• Use o mesmo equipamento e técnica para garantir consistência</li>
          <li>• Anote a data exata para referência futura</li>
        </ul>
      </div>

      {/* Valores de Referência Rápidos */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Valores de Referência:</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
          <div>
            <p className="font-medium">Peso:</p>
            <p>30-300 kg</p>
          </div>
          <div>
            <p className="font-medium">Altura:</p>
            <p>100-250 cm</p>
          </div>
          <div>
            <p className="font-medium">Idade:</p>
            <p>10-100 anos</p>
          </div>
          <div>
            <p className="font-medium">Gênero:</p>
            <p>Masculino/Feminino</p>
          </div>
        </div>
      </div>
    </div>
  );
};
