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
        <h2 className="text-2xl font-bold text-white mb-2">Informações Básicas</h2>
        <p className="text-neutral-400">
          Preencha os dados fundamentais para a avaliação física de <span className="font-semibold text-white">{studentName}</span>
        </p>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Data da Avaliação */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-300">
            <Calendar className="w-4 h-4 inline mr-2 text-yellow-500" />
            Data da Avaliação *
          </label>
          <input
            type="date"
            value={formData.assessment_date}
            onChange={(e) => handleInputChange('assessment_date', e.target.value)}
            className={`w-full px-3 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600 text-white bg-neutral-800 ${
              errors.assessment_date ? 'border-red-500' : 'border-neutral-700'
            }`}
            max={new Date().toISOString().split('T')[0]}
          />
          {errors.assessment_date && (
            <p className="text-sm text-red-500">{errors.assessment_date}</p>
          )}
        </div>

        {/* Peso */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-300">
            <Weight className="w-4 h-4 inline mr-2 text-yellow-500" />
            Peso (kg) *
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={formData.weight}
              onChange={(e) => handleNumberInput('weight', e.target.value)}
              placeholder="Ex: 75.5"
              className={`w-full px-3 py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600 text-white bg-neutral-800 ${
                errors.weight ? 'border-red-500' : 'border-neutral-700'
              }`}
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm">kg</span>
          </div>
          {errors.weight && (
            <p className="text-sm text-red-500">{errors.weight}</p>
          )}
        </div>

        {/* Altura */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-300">
            <Ruler className="w-4 h-4 inline mr-2 text-yellow-500" />
            Altura (cm) *
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={formData.height}
              onChange={(e) => handleNumberInput('height', e.target.value)}
              placeholder="Ex: 175"
              className={`w-full px-3 py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600 text-white bg-neutral-800 ${
                errors.height ? 'border-red-500' : 'border-neutral-700'
              }`}
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm">cm</span>
          </div>
          {errors.height && (
            <p className="text-sm text-red-500">{errors.height}</p>
          )}
        </div>

        {/* Idade */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-300">
            <User className="w-4 h-4 inline mr-2 text-yellow-500" />
            Idade (anos) *
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={formData.age}
              onChange={(e) => handleIntegerInput('age', e.target.value)}
              placeholder="Ex: 25"
              className={`w-full px-3 py-3 pr-12 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder:text-neutral-600 text-white bg-neutral-800 ${
                errors.age ? 'border-red-500' : 'border-neutral-700'
              }`}
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm">anos</span>
          </div>
          {errors.age && (
            <p className="text-sm text-red-500">{errors.age}</p>
          )}
        </div>

        {/* Gênero */}
        <div className="space-y-2 md:col-span-2">
          <label className="block text-sm font-bold text-neutral-300">
            <User className="w-4 h-4 inline mr-2 text-yellow-500" />
            Gênero *
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="gender"
                value="M"
                checked={formData.gender === 'M'}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                className="mr-2 text-yellow-500 focus:ring-yellow-500 bg-neutral-800 border-neutral-600"
              />
              <span className="text-sm text-neutral-300">Masculino</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="gender"
                value="F"
                checked={formData.gender === 'F'}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                className="mr-2 text-yellow-500 focus:ring-yellow-500 bg-neutral-800 border-neutral-600"
              />
              <span className="text-sm text-neutral-300">Feminino</span>
            </label>
          </div>
          {errors.gender && (
            <p className="text-sm text-red-500">{errors.gender}</p>
          )}
        </div>
      </div>

      {/* Informações Importantes */}
      <div className="bg-neutral-900/70 border border-neutral-700 rounded-xl p-4">
        <h3 className="text-sm font-bold text-yellow-500 mb-2">Importante:</h3>
        <ul className="text-sm text-neutral-300 space-y-1">
          <li>• Certifique-se de que as medidas foram tomadas corretamente</li>
          <li>• O aluno deve estar em jejum ou ter seguido as orientações pré-avaliação</li>
          <li>• Use o mesmo equipamento e técnica para garantir consistência</li>
          <li>• Anote a data exata para referência futura</li>
        </ul>
      </div>

      {/* Valores de Referência Rápidos */}
      <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
        <h3 className="text-sm font-bold text-white mb-3">Valores de Referência:</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-neutral-400">
          <div>
            <p className="font-bold text-neutral-300">Peso:</p>
            <p>30-300 kg</p>
          </div>
          <div>
            <p className="font-bold text-neutral-300">Altura:</p>
            <p>100-250 cm</p>
          </div>
          <div>
            <p className="font-bold text-neutral-300">Idade:</p>
            <p>10-100 anos</p>
          </div>
          <div>
            <p className="font-bold text-neutral-300">Gênero:</p>
            <p>Masculino/Feminino</p>
          </div>
        </div>
      </div>
    </div>
  );
};
