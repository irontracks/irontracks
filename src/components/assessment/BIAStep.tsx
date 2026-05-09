// Componente de Bioimpedância (BIA) — entrada manual do que o aparelho exibe.
//
// Step opcional. Quando o toggle "Tenho avaliação por bioimpedância" está
// off, nenhum campo é coletado e o resultado final cai automaticamente no
// caminho clássico (só dobras cutâneas). Quando on, o usuário digita o que
// vê no display do aparelho — só o % de gordura é "principal", os demais
// (massa magra, água, etc.) são extras pra rastreabilidade.

import React from 'react';
import { Activity, Info } from 'lucide-react';
import { AssessmentFormData } from '@/types/assessment';

interface BIAStepProps {
  formData: AssessmentFormData;
  updateFormData: (updates: Partial<AssessmentFormData>) => void;
  errors: Record<string, string>;
  studentName: string;
}

type BIAField = Extract<
  keyof AssessmentFormData,
  | 'bia_body_fat_percentage'
  | 'bia_lean_mass'
  | 'bia_fat_mass'
  | 'bia_water_percentage'
  | 'bia_visceral_fat'
  | 'bia_metabolic_age'
>;

interface BIAFieldDef {
  field: BIAField;
  label: string;
  unit: string;
  placeholder: string;
  description?: string;
}

const BIA_FIELDS: BIAFieldDef[] = [
  {
    field: 'bia_body_fat_percentage',
    label: 'Percentual de gordura',
    unit: '%',
    placeholder: 'Ex: 18.5',
    description: 'Valor principal — usado para cruzar com as dobras cutâneas',
  },
  {
    field: 'bia_lean_mass',
    label: 'Massa magra',
    unit: 'kg',
    placeholder: 'Ex: 62.0',
  },
  {
    field: 'bia_fat_mass',
    label: 'Massa gorda',
    unit: 'kg',
    placeholder: 'Ex: 14.5',
  },
  {
    field: 'bia_water_percentage',
    label: 'Água corporal',
    unit: '%',
    placeholder: 'Ex: 60.0',
  },
  {
    field: 'bia_visceral_fat',
    label: 'Gordura visceral',
    unit: 'índice',
    placeholder: 'Ex: 8',
  },
  {
    field: 'bia_metabolic_age',
    label: 'Idade metabólica',
    unit: 'anos',
    placeholder: 'Ex: 28',
  },
];

export const BIAStep: React.FC<BIAStepProps> = ({
  formData,
  updateFormData,
  errors,
  studentName,
}) => {
  // We treat "tem qualquer campo BIA preenchido" como "está usando BIA".
  // Isso evita um campo extra no schema (basta deduzir do estado atual).
  const hasAnyBiaField = BIA_FIELDS.some((f) => String(formData[f.field] ?? '').trim() !== '');
  const [enabled, setEnabled] = React.useState<boolean>(hasAnyBiaField);

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    if (!next) {
      // Limpa todos os campos quando desliga, para não persistir lixo
      // residual de um toggle anterior.
      const cleared = BIA_FIELDS.reduce<Partial<AssessmentFormData>>((acc, f) => {
        acc[f.field] = '';
        return acc;
      }, {});
      updateFormData(cleared);
    }
  };

  const handleNumberInput = (field: BIAField, value: string) => {
    const cleanedValue = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    updateFormData({ [field]: cleanedValue });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(234,179,8,0.12)',
            border: '1px solid rgba(234,179,8,0.25)',
          }}
        >
          <Activity className="w-5 h-5 text-yellow-500" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black text-white">Bioimpedância</h2>
          <p className="text-sm text-neutral-400 mt-1">
            {studentName ? `Avaliação por aparelho de bioimpedância de ${studentName}.` : 'Avaliação por aparelho de bioimpedância.'}
            {' '}
            Etapa opcional — pula se não tiver os dados.
          </p>
        </div>
      </div>

      {/* Info box */}
      <div
        className="rounded-xl p-3 flex gap-2"
        style={{
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.18)',
        }}
      >
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-200 leading-relaxed">
          Quando você preencher o % de gordura aqui <strong>e</strong> a soma das 7 dobras na etapa anterior,
          a tela de resultados mostra os dois métodos lado a lado e calcula a média entre eles.
          Se preencher só um, o app usa só esse.
        </p>
      </div>

      {/* Toggle */}
      <button
        type="button"
        onClick={() => handleToggle(!enabled)}
        aria-pressed={enabled}
        className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition-all active:scale-[0.99]"
        style={{
          background: enabled ? 'rgba(234,179,8,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${enabled ? 'rgba(234,179,8,0.35)' : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <div className="text-left">
          <p className="text-sm font-bold text-white">Tenho avaliação por bioimpedância</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {enabled ? 'Ativado — preencha os campos abaixo' : 'Desativado — etapa será pulada'}
          </p>
        </div>
        {/* Switch visual */}
        <div
          className="relative w-11 h-6 rounded-full transition-colors shrink-0"
          style={{
            background: enabled ? 'rgba(234,179,8,0.65)' : 'rgba(255,255,255,0.12)',
          }}
        >
          <div
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
            style={{ left: enabled ? 'calc(100% - 22px)' : '2px' }}
          />
        </div>
      </button>

      {/* Inputs */}
      {enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {BIA_FIELDS.map(({ field, label, unit, placeholder, description }) => {
            const value = String(formData[field] ?? '');
            const error = errors[field];
            const isPrimary = field === 'bia_body_fat_percentage';
            return (
              <div key={field} className={isPrimary ? 'sm:col-span-2' : ''}>
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-2">
                  {label}
                  {isPrimary && (
                    <span className="text-[10px] font-black text-yellow-500 normal-case tracking-normal">
                      principal
                    </span>
                  )}
                </label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => handleNumberInput(field, e.target.value)}
                    placeholder={placeholder}
                    aria-label={label}
                    aria-invalid={Boolean(error)}
                    className="w-full bg-neutral-900 border rounded-xl px-3 py-2.5 text-white text-base outline-none transition-colors pr-12"
                    style={{
                      borderColor: error
                        ? 'rgba(239,68,68,0.45)'
                        : value
                          ? 'rgba(234,179,8,0.35)'
                          : 'rgba(255,255,255,0.08)',
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500">
                    {unit}
                  </span>
                </div>
                {description && !error && (
                  <p className="text-xs text-neutral-500 mt-1">{description}</p>
                )}
                {error && (
                  <p className="text-xs text-red-400 mt-1">{error}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BIAStep;
