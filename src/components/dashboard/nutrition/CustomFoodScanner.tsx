'use client'
/**
 * CustomFoodScanner
 *
 * Allows the user to photograph a nutritional label, review the AI-extracted
 * values, add a name and aliases, then save to their custom food library.
 */
import { useState, useRef, useCallback, memo } from 'react'
import type { CustomFoodDraft } from './useCustomFoods'

interface ScannedLabel {
  productName: string
  servingSizeG: number
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  fiberPer100g: number
  confidence: 'high' | 'medium' | 'low'
}

interface Props {
  saving: boolean
  onSave: (draft: CustomFoodDraft) => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '✅ Alta confiança',
  medium: '⚠️ Confiança média — revise os valores',
  low: '❌ Baixa confiança — corrija os valores antes de salvar',
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-widest text-neutral-400">{label}</label>
      <input
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
        className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
      />
    </div>
  )
}

const CustomFoodScanner = memo(function CustomFoodScanner({ saving, onSave, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Editable label data
  const [label, setLabel] = useState<ScannedLabel | null>(null)
  const [name, setName] = useState('')
  const [aliasInput, setAliasInput] = useState('')
  const [aliases, setAliases] = useState<string[]>([])

  const handleFile = useCallback(async (file: File) => {
    setScanning(true)
    setScanError(null)
    setSaveError(null)
    setLabel(null)
    setPreviewUrl(URL.createObjectURL(file))

    try {
      const fd = new FormData()
      fd.append('photo', file)
      const res = await fetch('/api/ai/scan-nutrition-label', { method: 'POST', body: fd, credentials: 'include' })
      const json = await res.json()
      if (!json.ok) {
        const msgs: Record<string, string> = {
          rate_limited: 'Limite de scans atingido. Tente em 1 hora.',
          could_not_read_label: 'Não consegui ler o rótulo. Tente uma foto mais nítida.',
          photo_too_large: 'Foto muito grande (máx 5 MB).',
          no_photo: 'Nenhuma foto recebida.',
        }
        setScanError(msgs[json.error] || json.error || 'Erro ao analisar rótulo')
        return
      }
      const d: ScannedLabel = json.data
      setLabel(d)
      setName(d.productName)
      setAliases([])
    } catch {
      setScanError('Erro de conexão ao analisar o rótulo.')
    } finally {
      setScanning(false)
    }
  }, [])

  const addAlias = useCallback(() => {
    const trimmed = aliasInput.trim()
    if (!trimmed || aliases.includes(trimmed)) return
    setAliases(prev => [...prev, trimmed])
    setAliasInput('')
  }, [aliasInput, aliases])

  const removeAlias = useCallback((a: string) => {
    setAliases(prev => prev.filter(x => x !== a))
  }, [])

  const handleSave = useCallback(async () => {
    if (!label || !name.trim()) return
    setSaveError(null)
    const result = await onSave({
      name: name.trim(),
      aliases,
      serving_size_g: label.servingSizeG,
      kcal_per100g: label.kcalPer100g,
      protein_per100g: label.proteinPer100g,
      carbs_per100g: label.carbsPer100g,
      fat_per100g: label.fatPer100g,
      fiber_per100g: label.fiberPer100g,
      label_image_url: null, // future: upload to Supabase Storage
    })
    if (result.ok) {
      onClose()
    } else {
      setSaveError(result.error || 'Erro ao salvar')
    }
  }, [label, name, aliases, onSave, onClose])

  const setField = useCallback((field: keyof ScannedLabel, val: number) => {
    setLabel(prev => prev ? { ...prev, [field]: val } : null)
  }, [])

  return (
    <div className="rounded-3xl bg-neutral-950 border border-neutral-800 p-5 space-y-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-400">Biblioteca de alimentos</div>
          <div className="mt-0.5 text-base font-semibold text-white">📷 Escanear rótulo nutricional</div>
        </div>
        <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white text-xl transition">✕</button>
      </div>

      {/* Upload trigger */}
      {!label && !scanning && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-2xl border-2 border-dashed border-neutral-700 hover:border-yellow-500/50 bg-neutral-900/50 hover:bg-neutral-900 transition py-8 flex flex-col items-center gap-2"
        >
          <span className="text-3xl">📸</span>
          <span className="text-sm font-semibold text-white">Fotografar tabela nutricional</span>
          <span className="text-xs text-neutral-400">Ou selecione da galeria</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />

      {/* Scanning state */}
      {scanning && (
        <div className="flex items-center gap-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3">
          <span className="animate-spin text-lg">⏳</span>
          <span className="text-sm text-yellow-200">Analisando rótulo com IA...</span>
        </div>
      )}

      {/* Preview thumbnail */}
      {previewUrl && !scanning && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Rótulo" className="w-16 h-16 rounded-xl object-cover border border-neutral-700" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-neutral-400 hover:text-white transition"
          >
            📷 Trocar foto
          </button>
        </div>
      )}

      {/* Scan error */}
      {scanError && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-200">{scanError}</div>
      )}

      {/* Extracted label + edit form */}
      {label && (
        <div className="space-y-4">
          <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 px-3 py-2 text-xs text-neutral-300">
            {CONFIDENCE_LABEL[label.confidence]}
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-400">Nome do produto *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Whey True WPI"
              className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
            />
          </div>

          {/* Aliases */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-neutral-400">Apelidos (para reconhecimento rápido)</label>
            <div className="flex gap-2">
              <input
                value={aliasInput}
                onChange={e => setAliasInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAlias())}
                placeholder="Ex: whey, proteína"
                className="flex-1 rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
              />
              <button type="button" onClick={addAlias} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-700 transition">
                + Adicionar
              </button>
            </div>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aliases.map(a => (
                  <span key={a} className="inline-flex items-center gap-1 text-xs bg-neutral-800 border border-neutral-700 rounded-full px-2.5 py-1 text-neutral-200">
                    {a}
                    <button type="button" onClick={() => removeAlias(a)} className="text-neutral-500 hover:text-red-400 transition">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Macros per 100g grid */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">Valores por 100g (edite se necessário)</div>
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Calorias (kcal)" value={label.kcalPer100g} onChange={v => setField('kcalPer100g', v)} />
              <NumInput label="Proteína (g)" value={label.proteinPer100g} onChange={v => setField('proteinPer100g', v)} />
              <NumInput label="Carboidratos (g)" value={label.carbsPer100g} onChange={v => setField('carbsPer100g', v)} />
              <NumInput label="Gordura (g)" value={label.fatPer100g} onChange={v => setField('fatPer100g', v)} />
              <NumInput label="Fibra (g)" value={label.fiberPer100g} onChange={v => setField('fiberPer100g', v)} />
              <NumInput label="Porção padrão (g)" value={label.servingSizeG} onChange={v => setField('servingSizeG', v)} />
            </div>
          </div>

          {/* Preview calculation */}
          <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-[10px] text-neutral-400">Por {Math.round(label.servingSizeG)}g:</span>
            <span className="text-xs font-semibold text-neutral-100">{Math.round(label.kcalPer100g * label.servingSizeG / 100)} kcal</span>
            <span className="text-xs text-blue-300">P {(label.proteinPer100g * label.servingSizeG / 100).toFixed(1)}g</span>
            <span className="text-xs text-orange-300">C {(label.carbsPer100g * label.servingSizeG / 100).toFixed(1)}g</span>
            <span className="text-xs text-yellow-300">G {(label.fatPer100g * label.servingSizeG / 100).toFixed(1)}g</span>
          </div>

          {saveError && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-200">{saveError}</div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full h-11 rounded-2xl bg-gradient-to-r from-yellow-400 to-yellow-500 text-black font-semibold text-sm shadow-lg shadow-yellow-500/30 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? 'Salvando...' : '✅ Salvar na minha biblioteca'}
          </button>
        </div>
      )}
    </div>
  )
})

export default CustomFoodScanner
