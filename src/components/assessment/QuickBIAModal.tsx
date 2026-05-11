'use client'

/**
 * QuickBIAModal — registro standalone de bioimpedância
 *
 * Para o caso real onde o aluno faz BIA numa máquina externa (farmácia,
 * clínica) e chega com o PDF do resultado. Abrir o formulário completo
 * de avaliação só pra anotar 1-6 números seria atrito desnecessário.
 *
 * Após salvar, o backend tenta auto-parear esse registro com uma
 * avaliação 'full' (com dobras) do mesmo aluno em ±14 dias.
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Activity, Save, Loader2, AlertCircle } from 'lucide-react'
import { useAssessment } from '@/hooks/useAssessment'
import { useDialog } from '@/contexts/DialogContext'
import { logError } from '@/lib/logger'
import BIAAttachmentInput from './BIAAttachmentInput'
import {
  biaExtractionToFormStrings,
  biaExtractionToAnthropometry,
} from '@/utils/storage/biaExtraction'
import type { BiaExtractionData } from '@/utils/storage/biaExtraction'

interface QuickBIAModalProps {
  isOpen: boolean
  studentId: string
  studentName: string
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  assessment_date: string
  bia_body_fat_percentage: string
  bia_lean_mass: string
  bia_fat_mass: string
  bia_water_percentage: string
  bia_visceral_fat: string
  bia_metabolic_age: string
  bia_attachment_url: string
  observations: string
}

const buildInitial = (): FormState => ({
  assessment_date: new Date().toISOString().split('T')[0],
  bia_body_fat_percentage: '',
  bia_lean_mass: '',
  bia_fat_mass: '',
  bia_water_percentage: '',
  bia_visceral_fat: '',
  bia_metabolic_age: '',
  bia_attachment_url: '',
  observations: '',
})

const parseNum = (v: string): number | null => {
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function QuickBIAModal({
  isOpen,
  studentId,
  studentName,
  onClose,
  onSaved,
}: QuickBIAModalProps) {
  const [form, setForm] = useState<FormState>(buildInitial())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Antropometria extraída pela IA (peso, altura, idade, BMR). Guardada
  // separada do FormState porque não é editável no modal — vai direto
  // pro payload pra destravar IMC, TDEE e gráficos. Resetada quando o
  // anexo é removido.
  const [extractedAnthro, setExtractedAnthro] = useState<{
    weight_kg: number | null
    height_cm: number | null
    age_years: number | null
    bmr_kcal: number | null
  }>({ weight_kg: null, height_cm: null, age_years: null, bmr_kcal: null })
  const { createBiaAssessment } = useAssessment()
  const { alert } = useDialog()

  const handleNumberInput = (field: keyof FormState, value: string) => {
    const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.')
    setForm((prev) => ({ ...prev, [field]: cleaned }))
  }

  const handleSave = async () => {
    setError(null)

    // Data e %BF são os únicos obrigatórios — o resto é extra do aparelho.
    // Mensagens distintas para "vazio" vs "fora do range" porque o usuário
    // que viu uma só (a do range) ficou confuso quando não tinha digitado
    // nada — pensou que o app tinha rejeitado um valor que ele não pôs.
    if (!form.assessment_date) {
      setError('Informe a data da avaliação')
      return
    }
    const biaPct = parseNum(form.bia_body_fat_percentage)
    if (biaPct == null) {
      setError('Informe o percentual de gordura (campo principal)')
      return
    }
    if (biaPct <= 0 || biaPct > 100) {
      setError('Percentual de gordura deve estar entre 0 e 100')
      return
    }

    try {
      setSaving(true)
      const result = await createBiaAssessment({
        assessment_date: form.assessment_date,
        bia_body_fat_percentage: biaPct,
        bia_lean_mass: parseNum(form.bia_lean_mass),
        bia_fat_mass: parseNum(form.bia_fat_mass),
        bia_water_percentage: parseNum(form.bia_water_percentage),
        bia_visceral_fat: parseNum(form.bia_visceral_fat),
        bia_metabolic_age: parseNum(form.bia_metabolic_age),
        bia_attachment_url: form.bia_attachment_url || null,
        observations: form.observations || '',
        // Antropometria extraída pela IA — null quando aparelho não
        // mediu / IA não conseguiu ler. Alimenta peso/altura/idade/BMR
        // canônicos do registro.
        weight_kg: extractedAnthro.weight_kg,
        height_cm: extractedAnthro.height_cm,
        age_years: extractedAnthro.age_years,
        bmr_kcal: extractedAnthro.bmr_kcal,
      }, studentId)

      if (!result.success) {
        setError(result.error || 'Falha ao salvar')
        return
      }

      const wasPaired = !!result.data?.paired_assessment_id
      await alert(
        wasPaired
          ? 'Bioimpedância salva e linkada com a avaliação por dobras mais próxima. A média dos dois métodos aparece no histórico.'
          : 'Bioimpedância salva. Quando o personal registrar uma avaliação por dobras dentro de 14 dias, o app linka automaticamente.',
        'Pronto',
      )
      setForm(buildInitial())
      setExtractedAnthro({ weight_kg: null, height_cm: null, age_years: null, bmr_kcal: null })
      onSaved()
      onClose()
    } catch (e) {
      logError('error', 'Erro ao salvar BIA standalone', e)
      setError('Erro inesperado. Tenta de novo.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[1400] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 pt-20"
        role="button"
        tabIndex={-1}
        aria-label="Fechar bioimpedância"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="max-w-md w-full max-h-[88vh] overflow-y-auto rounded-2xl border shadow-2xl"
          style={{
            background: 'linear-gradient(160deg, rgba(20,18,10,0.99) 0%, rgba(10,10,10,0.99) 50%)',
            borderColor: 'rgba(234,179,8,0.18)',
            boxShadow: '0 32px 64px -16px rgba(0,0,0,0.85), inset 0 1px 0 rgba(234,179,8,0.1)',
          }}
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
        >
          {/* Gold shimmer */}
          <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />

          {/* Header */}
          <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-white/5">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }}
              >
                <Activity className="w-5 h-5 text-yellow-500" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white">Adicionar Bioimpedância</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {studentName ? `Aluno: ${studentName}` : 'Aluno'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl border flex items-center justify-center text-neutral-400 hover:text-white hover:border-yellow-500/40 transition-all shrink-0"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
              aria-label="Voltar"
              title="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <div
              className="rounded-xl p-3 flex gap-2 text-xs leading-relaxed"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)' }}
            >
              <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-blue-200">
                Use a data que está no PDF do aparelho. O app cruza com a avaliação por dobras mais próxima (±14 dias) automaticamente.
              </p>
            </div>

            {/* Data */}
            <div>
              <label htmlFor="bia-assessment-date" className="text-xs font-bold text-neutral-400 uppercase tracking-wide">
                Data da avaliação <span className="text-red-400">*</span>
              </label>
              <input
                id="bia-assessment-date"
                type="date"
                aria-label="Data da avaliação"
                value={form.assessment_date}
                onChange={(e) => setForm((p) => ({ ...p, assessment_date: e.target.value }))}
                className="w-full mt-1 bg-neutral-900 border rounded-xl px-3 py-2.5 text-white text-base outline-none transition-colors"
                style={{ borderColor: 'rgba(234,179,8,0.35)' }}
              />
            </div>

            {/* % gordura - principal */}
            <div>
              <label htmlFor="bia-body-fat" className="text-xs font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-2">
                Percentual de gordura
                <span className="text-[10px] font-black text-yellow-500 normal-case tracking-normal">
                  principal *
                </span>
              </label>
              <div className="relative mt-1">
                <input
                  id="bia-body-fat"
                  type="text"
                  inputMode="decimal"
                  aria-label="Percentual de gordura (BIA)"
                  value={form.bia_body_fat_percentage}
                  onChange={(e) => handleNumberInput('bia_body_fat_percentage', e.target.value)}
                  placeholder="Ex: 18.5"
                  className="w-full bg-neutral-900 border rounded-xl px-3 py-2.5 text-white text-base outline-none transition-colors pr-12"
                  style={{
                    borderColor: form.bia_body_fat_percentage
                      ? 'rgba(234,179,8,0.35)'
                      : 'rgba(255,255,255,0.08)',
                  }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500">%</span>
              </div>
            </div>

            {/* Extras opcionais em grid */}
            <div className="grid grid-cols-2 gap-3">
              {([
                { field: 'bia_lean_mass' as const, label: 'Massa magra', unit: 'kg', placeholder: '62.0' },
                { field: 'bia_fat_mass' as const, label: 'Massa gorda', unit: 'kg', placeholder: '14.5' },
                { field: 'bia_water_percentage' as const, label: 'Água', unit: '%', placeholder: '60.0' },
                { field: 'bia_visceral_fat' as const, label: 'Visceral', unit: 'idx', placeholder: '8' },
                { field: 'bia_metabolic_age' as const, label: 'Id. metab.', unit: 'anos', placeholder: '28' },
              ]).map(({ field, label, unit, placeholder }) => (
                <div key={field}>
                  <label htmlFor={`bia-${field}`} className="text-xs font-bold text-neutral-400 uppercase tracking-wide">{label}</label>
                  <div className="relative mt-1">
                    <input
                      id={`bia-${field}`}
                      type="text"
                      inputMode="decimal"
                      aria-label={label}
                      value={form[field]}
                      onChange={(e) => handleNumberInput(field, e.target.value)}
                      placeholder={placeholder}
                      className="w-full bg-neutral-900 border rounded-xl px-2.5 py-2 text-white text-sm outline-none transition-colors pr-9"
                      style={{
                        borderColor: form[field] ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.08)',
                      }}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-500">{unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Anexo do PDF/foto da máquina — diferencial do registro
                standalone: o aluno chega exatamente com esse documento. */}
            <div className="space-y-2" role="group" aria-labelledby="quick-bia-attachment-label">
              <span
                id="quick-bia-attachment-label"
                className="text-xs font-bold text-neutral-400 uppercase tracking-wide block"
              >
                Comprovante (opcional)
              </span>
              <BIAAttachmentInput
                value={form.bia_attachment_url}
                onChange={(url) => {
                  setForm((p) => ({ ...p, bia_attachment_url: url }))
                  // Anexo removido → reseta antropometria extraída.
                  if (!url) {
                    setExtractedAnthro({ weight_kg: null, height_cm: null, age_years: null, bmr_kcal: null })
                  }
                }}
                onExtracted={(extracted: BiaExtractionData) => {
                  // IA leu os dados do PDF/foto — sobrescreve só os campos
                  // que vieram com valor (deixa intocados os null pra não
                  // apagar algo que o usuário já tinha digitado).
                  const fields = biaExtractionToFormStrings(extracted)
                  setForm((p) => ({
                    ...p,
                    bia_body_fat_percentage: fields.bia_body_fat_percentage || p.bia_body_fat_percentage,
                    bia_lean_mass: fields.bia_lean_mass || p.bia_lean_mass,
                    bia_fat_mass: fields.bia_fat_mass || p.bia_fat_mass,
                    bia_water_percentage: fields.bia_water_percentage || p.bia_water_percentage,
                    bia_visceral_fat: fields.bia_visceral_fat || p.bia_visceral_fat,
                    bia_metabolic_age: fields.bia_metabolic_age || p.bia_metabolic_age,
                  }))
                  // Antropometria — vai direto pro payload do save (não
                  // tem campo no form pro usuário editar essas coisas;
                  // alimentam IMC/TDEE/gráficos diretamente).
                  setExtractedAnthro(biaExtractionToAnthropometry(extracted))
                  // Limpa erro genérico se existia (o usuário pode ter visto
                  // "informe o %" antes — agora a IA preencheu).
                  setError(null)
                }}
                helpText="Anexa o PDF ou foto. A IA vai ler e preencher os campos sozinha."
              />
            </div>

            {/* Observações */}
            <div>
              <label htmlFor="bia-observations" className="text-xs font-bold text-neutral-400 uppercase tracking-wide">
                Observações (opcional)
              </label>
              <textarea
                id="bia-observations"
                aria-label="Observações"
                value={form.observations}
                onChange={(e) => setForm((p) => ({ ...p, observations: e.target.value }))}
                placeholder="Aparelho usado, condições da avaliação, etc."
                rows={2}
                className="w-full mt-1 bg-neutral-900 border rounded-xl px-3 py-2 text-white text-sm outline-none resize-none transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.08)' }}
              />
            </div>

            {error && (
              <div
                className="rounded-xl p-3 flex gap-2 text-xs"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-200">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border text-neutral-300 font-bold hover:text-white hover:border-yellow-500/30 transition-all disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-black font-black btn-gold-animated disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
