// Componente das 7 dobras cutâneas

import React from 'react';
import { Ruler, Info, AlertTriangle } from 'lucide-react';
import { AssessmentFormData } from '@/types/assessment';

interface SkinfoldStepProps {
  formData: AssessmentFormData;
  updateFormData: (updates: Partial<AssessmentFormData>) => void;
  errors: Record<string, string>;
  studentName: string;
}

export const SkinfoldStep: React.FC<SkinfoldStepProps> = ({
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

  const skinfolds = [
    {
      field: 'triceps_skinfold' as keyof AssessmentFormData,
      label: 'Tricipital',
      description: 'Dobra vertical na parte posterior do braço, no ponto médio entre o acrômio e o olécrano',
      location: 'Braço',
      placeholder: 'Ex: 12.5'
    },
    {
      field: 'biceps_skinfold' as keyof AssessmentFormData,
      label: 'Bicipital',
      description: 'Dobra vertical na parte anterior do braço, sobre o músculo bíceps',
      location: 'Braço',
      placeholder: 'Ex: 8.0'
    },
    {
      field: 'subscapular_skinfold' as keyof AssessmentFormData,
      label: 'Subescapular',
      description: 'Dobra oblíqua sob a escápula, 2 cm abaixo da extremidade inferior',
      location: 'Costas',
      placeholder: 'Ex: 15.0'
    },
    {
      field: 'suprailiac_skinfold' as keyof AssessmentFormData,
      label: 'Suprailíaca',
      description: 'Dobra oblíqua acima da crista ilíaca, na linha axilar média',
      location: 'Quadril',
      placeholder: 'Ex: 18.5'
    },
    {
      field: 'abdominal_skinfold' as keyof AssessmentFormData,
      label: 'Abdominal',
      description: 'Dobra vertical a 5 cm lateralmente do umbigo',
      location: 'Abdômen',
      placeholder: 'Ex: 22.0'
    },
    {
      field: 'thigh_skinfold' as keyof AssessmentFormData,
      label: 'Coxa',
      description: 'Dobra vertical na coxa, no ponto médio entre a virilha e a patela',
      location: 'Coxa',
      placeholder: 'Ex: 25.0'
    },
    {
      field: 'calf_skinfold' as keyof AssessmentFormData,
      label: 'Panturrilha',
      description: 'Dobra vertical na panturrilha, no ponto de maior circunferência',
      location: 'Panturrilha',
      placeholder: 'Ex: 15.5'
    }
  ];

  const getSkinfoldStatus = (value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue === 0) return 'empty';
    if (numValue < 3) return 'very-low';
    if (numValue > 50) return 'very-high';
    if (numValue < 8) return 'low';
    if (numValue > 35) return 'high';
    return 'normal';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'very-low': return 'border-red-500 bg-red-50';
      case 'low': return 'border-yellow-500 bg-yellow-50';
      case 'normal': return 'border-green-500 bg-green-50';
      case 'high': return 'border-yellow-500 bg-yellow-50';
      case 'very-high': return 'border-red-500 bg-red-50';
      default: return 'border-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'very-low': return 'Muito baixa - verificar medição';
      case 'low': return 'Baixa';
      case 'normal': return 'Normal';
      case 'high': return 'Elevada';
      case 'very-high': return 'Muito elevada - verificar medição';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Dobras Cutâneas</h2>
        <p className="text-gray-600">
          Medição das 7 dobras cutâneas de <span className="font-semibold">{studentName}</span> para análise de composição corporal
        </p>
      </div>

      {/* Informações Importantes */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-800">
            <p className="font-medium mb-2">Importante - Precisão é fundamental:</p>
            <ul className="space-y-1">
              <li>• Use um adipômetro calibrado e em bom estado</li>
              <li>• Pegue a dobra com o polegar e indicador, 1 cm acima do local de medição</li>
              <li>• Meça no lado direito do corpo (padrão internacional)</li>
              <li>• Faça 3 medições e anote a média</li>
              <li>• A peça deve ser perpendicular ao músculo subjacente</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Técnica de Medição */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-2">Técnica correta:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Marque o local anatômico correto</li>
              <li>Pegue a dobra com polegar e indicador, separando bem a pele e gordura subcutânea</li>
              <li>Coloque o adipômetro 1 cm abaixo dos dedos</li>
              <li>Aguarde 2-3 segundos antes de ler a medida</li>
              <li>Libere a pressão lentamente</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {skinfolds.map((skinfold, index) => {
          const status = getSkinfoldStatus(formData[skinfold.field]);
          return (
            <div key={skinfold.field} className={`p-4 rounded-lg border-2 transition-all duration-200 ${getStatusColor(status)}`}>
              <div className="space-y-3">
                {/* Header da dobra */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Ruler className="w-4 h-4 text-gray-400 mr-2" />
                    <label className="block text-sm font-medium text-gray-700">
                      {skinfold.label}
                    </label>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-600">
                    {skinfold.location}
                  </span>
                </div>
                
                {/* Campo de entrada */}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData[skinfold.field]}
                    onChange={(e) => handleNumberInput(skinfold.field, e.target.value)}
                    placeholder={skinfold.placeholder}
                    className={`w-full px-3 py-2 pr-12 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-600 text-gray-900 bg-white ${
                      errors[skinfold.field] ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm">mm</span>
                </div>
                
                {/* Descrição */}
                <p className="text-xs text-gray-500">{skinfold.description}</p>
                
                {/* Status */}
                {status !== 'empty' && (
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      status === 'normal' ? 'bg-green-500' :
                      status === 'low' || status === 'high' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`} />
                    <span className={`text-xs font-medium ${
                      status === 'normal' ? 'text-green-700' :
                      status === 'low' || status === 'high' ? 'text-yellow-700' :
                      'text-red-700'
                    }`}>
                      {getStatusText(status)}
                    </span>
                  </div>
                )}
                
                {errors[skinfold.field] && (
                  <p className="text-sm text-red-600">{errors[skinfold.field]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Valores de Referência */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Valores de Referência (mm):</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
          <div>
            <p className="font-medium">Homens:</p>
            <p>8-20: Baixo</p>
            <p>20-35: Normal</p>
            <p>35+: Elevado</p>
          </div>
          <div>
            <p className="font-medium">Mulheres:</p>
            <p>12-25: Baixo</p>
            <p>25-40: Normal</p>
            <p>40+: Elevado</p>
          </div>
          <div>
            <p className="font-medium">Atletas:</p>
            <p>Homens: 5-15</p>
            <p>Mulheres: 8-20</p>
          </div>
          <div>
            <p className="font-medium">Geral:</p>
            <p>Mínimo: 3mm</p>
            <p>Máximo: 50mm</p>
          </div>
        </div>
      </div>

      {/* Dicas Finais */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-yellow-900 mb-2">Dicas para melhor precisão:</h3>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• Treine a técnica antes de começar as medições oficiais</li>
          <li>• Se possível, tenha um assistente para ajudar com as dobras difíceis</li>
          <li>• Meça em ambiente com temperatura estável (20-22°C ideal)</li>
          <li>• O aluno deve estar relaxado e em posição confortável</li>
          <li>• Anote se houve dificuldade em alguma medição específica</li>
          <li>• Considere fazer fotos dos locais de medição para referência futura</li>
        </ul>
      </div>

      {/* Observações */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Observações sobre as dobras (opcional)
        </label>
        <textarea
          value={formData.observations}
          onChange={(e) => updateFormData({ observations: e.target.value })}
          rows={3}
          placeholder="Anote aqui dificuldades na medição, qualidade da pele, ou outras observações relevantes..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="text-xs text-gray-500">
          Ex: "Dificuldade na dobra subescapular devido a tensão muscular", "Pele muito fina no tricipital"
        </p>
      </div>
    </div>
  );
};
