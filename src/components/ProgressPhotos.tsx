'use client'
/**
 * ProgressPhotos
 *
 * Diário fotográfico contínuo de progresso corporal.
 * Funcionalidades:
 *  - Upload de fotos (câmera ou galeria) com tipo (frente / lado / costas / geral)
 *  - Timeline de fotos com peso e notas opcionais
 *  - Comparador Before/After deslizável entre dois momentos
 *  - Exclusão de fotos
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera, ChevronLeft, ChevronRight, Loader2, Plus, SlidersHorizontal,
  Trash2, X, ArrowLeftRight,
} from 'lucide-react'
import Image from 'next/image'

interface ProgressPhoto {
  id: string
  url: string
  kind: 'progress' | 'front' | 'side' | 'back'
  notes: string | null
  weight_kg: number | null
  date: string
  created_at: string
}

const KIND_LABELS: Record<ProgressPhoto['kind'], string> = {
  progress: 'Geral',
  front: 'Frente',
  side: 'Lateral',
  back: 'Costas',
}

// ─── Before/After slider ───────────────────────────────────────────────────────

function BeforeAfterSlider({ before, after }: { before: ProgressPhoto; after: ProgressPhoto }) {
  const [pos, setPos] = useState(50)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const updatePos = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const pct = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100))
    setPos(pct)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    updatePos(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    updatePos(e.clientX)
  }
  const onPointerUp = () => { dragging.current = false }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden select-none bg-neutral-900 cursor-ew-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* After (right side — full) */}
        <Image src={after.url} alt="Depois" fill className="object-cover object-top" unoptimized />

        {/* Before (left side — clipped) */}
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <Image src={before.url} alt="Antes" fill className="object-cover object-top" unoptimized />
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
          style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
        >
          {/* Handle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-xl flex items-center justify-center">
            <ArrowLeftRight size={16} className="text-neutral-900" />
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-black/60 text-white text-[10px] font-bold">
          Antes · {fmtDate(before.date)}
        </div>
        <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/60 text-white text-[10px] font-bold">
          Depois · {fmtDate(after.date)}
        </div>
      </div>

      {/* Weight delta */}
      {before.weight_kg != null && after.weight_kg != null && (
        <div className="flex gap-3 text-center">
          <div className="flex-1 bg-neutral-900 rounded-xl p-3">
            <p className="text-xs text-neutral-500 mb-0.5">Antes</p>
            <p className="text-lg font-black text-white">{before.weight_kg}kg</p>
          </div>
          <div className="flex-1 bg-neutral-900 rounded-xl p-3">
            <p className="text-xs text-neutral-500 mb-0.5">Depois</p>
            <p className="text-lg font-black text-white">{after.weight_kg}kg</p>
          </div>
          <div className="flex-1 bg-neutral-900 rounded-xl p-3">
            <p className="text-xs text-neutral-500 mb-0.5">Mudança</p>
            <p className={`text-lg font-black ${after.weight_kg - before.weight_kg < 0 ? 'text-green-400' : 'text-yellow-400'}`}>
              {after.weight_kg - before.weight_kg > 0 ? '+' : ''}{(after.weight_kg - before.weight_kg).toFixed(1)}kg
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Upload modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void
  onUploaded: (photo: ProgressPhoto) => void
}

function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<ProgressPhoto['kind']>('progress')
  const [notes, setNotes] = useState('')
  const [weight, setWeight] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFile = (f: File) => {
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      // 1. Get Cloudinary signature
      const sigRes = await fetch('/api/storage/sign-cloudinary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'progress' }),
      })
      const sig = await sigRes.json()
      if (!sig.ok) throw new Error(sig.error || 'Erro ao assinar upload')

      // 2. Upload to Cloudinary
      const fd = new FormData()
      fd.append('file', file)
      fd.append('api_key', sig.apiKey)
      fd.append('timestamp', String(sig.timestamp))
      fd.append('signature', sig.signature)
      fd.append('folder', sig.folder)
      fd.append('public_id', sig.publicId)
      const upRes = await fetch(sig.uploadUrl, { method: 'POST', body: fd })
      const upJson = await upRes.json()
      if (!upRes.ok || !upJson.secure_url) throw new Error('Falha no upload da imagem')

      // 3. Save to DB
      const saveRes = await fetch('/api/progress-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: upJson.secure_url,
          kind,
          notes: notes.trim() || undefined,
          weight_kg: weight ? parseFloat(weight) : undefined,
        }),
      })
      const saveJson = await saveRes.json()
      if (!saveJson.ok) throw new Error(saveJson.error || 'Erro ao salvar foto')

      onUploaded(saveJson.photo)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1600] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-neutral-950 rounded-3xl border border-neutral-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <p className="font-black text-white">Nova foto de progresso</p>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white">
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Drop zone / preview */}
          {preview ? (
            <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="w-full h-full object-cover object-top" />
              <button
                type="button"
                onClick={() => { setPreview(null); setFile(null) }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-neutral-700 flex flex-col items-center justify-center gap-3 text-neutral-500 hover:border-yellow-500/50 hover:text-yellow-500 transition-colors"
            >
              <Camera size={32} />
              <span className="text-sm font-bold">Toque para tirar foto ou fazer upload</span>
              <span className="text-xs">Câmera · Galeria · Arrastar</span>
            </button>
          )}

          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleChange}
          />

          {/* Kind selector */}
          <div>
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Tipo de foto</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(KIND_LABELS) as [ProgressPhoto['kind'], string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={[
                    'py-2 rounded-xl text-xs font-bold transition-all',
                    kind === k
                      ? 'bg-yellow-500 text-black'
                      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Weight */}
          <div>
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Peso (opcional)</p>
            <div className="flex items-center gap-2">
              <input
                aria-label="Peso em kg"
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="ex: 85.5"
                step="0.1"
                min="20"
                max="500"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500"
              />
              <span className="text-neutral-500 text-sm font-bold">kg</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Notas (opcional)</p>
            <textarea
              aria-label="Notas sobre a foto"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Como você está se sentindo? Mudanças percebidas..."
              rows={3}
              maxLength={500}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-yellow-500"
            />
          </div>

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full py-4 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {uploading ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : 'Salvar foto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface ProgressPhotosProps {
  onClose: () => void
}

export default function ProgressPhotos({ onClose }: ProgressPhotosProps) {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [selectedA, setSelectedA] = useState<string | null>(null)
  const [selectedB, setSelectedB] = useState<string | null>(null)
  const [filterKind, setFilterKind] = useState<ProgressPhoto['kind'] | 'all'>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<ProgressPhoto | null>(null)

  useEffect(() => {
    fetch('/api/progress-photos')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setPhotos(j.photos)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleUploaded = (photo: ProgressPhoto) => {
    setPhotos((prev) => [photo, ...prev])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar esta foto?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/progress-photos/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== id))
        if (selectedA === id) setSelectedA(null)
        if (selectedB === id) setSelectedB(null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = filterKind === 'all' ? photos : photos.filter((p) => p.kind === filterKind)

  const photoA = photos.find((p) => p.id === selectedA) ?? null
  const photoB = photos.find((p) => p.id === selectedB) ?? null

  const toggleSelect = (id: string) => {
    if (!compareMode) return
    if (selectedA === id) { setSelectedA(null); return }
    if (selectedB === id) { setSelectedB(null); return }
    if (!selectedA) { setSelectedA(id); return }
    if (!selectedB) { setSelectedB(id); return }
    // Replace the oldest selection
    setSelectedA(selectedB)
    setSelectedB(id)
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-[1400] bg-neutral-950 text-white flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-safe pb-3 pt-4 border-b border-neutral-800/60 bg-neutral-950/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white">
            <ChevronLeft size={22} />
          </button>
          <div>
            <p className="font-black text-white">Diário de Progresso</p>
            <p className="text-xs text-neutral-500">{photos.length} {photos.length === 1 ? 'foto' : 'fotos'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setCompareMode((v) => !v); setSelectedA(null); setSelectedB(null) }}
            className={[
              'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all',
              compareMode ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400',
            ].join(' ')}
          >
            <SlidersHorizontal size={13} />
            Comparar
          </button>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yellow-500 text-black text-xs font-black"
          >
            <Plus size={13} />
            Foto
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Before/After comparison */}
        {compareMode && photoA && photoB && (
          <div className="p-4 border-b border-neutral-800">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Comparação</p>
            <BeforeAfterSlider before={photoA} after={photoB} />
          </div>
        )}

        {compareMode && (
          <div className="px-4 py-3 bg-yellow-500/8 border-b border-yellow-500/20">
            <p className="text-xs text-yellow-400 font-bold">
              {!selectedA && !selectedB && 'Selecione 2 fotos para comparar'}
              {selectedA && !selectedB && 'Selecione a segunda foto'}
              {selectedA && selectedB && 'Arraste o divisor para comparar →'}
            </p>
          </div>
        )}

        {/* Kind filter */}
        <div className="px-4 pt-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {(['all', 'progress', 'front', 'side', 'back'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterKind(k)}
              className={[
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all',
                filterKind === k
                  ? 'bg-yellow-500 text-black'
                  : 'bg-neutral-800 text-neutral-400',
              ].join(' ')}
            >
              {k === 'all' ? 'Todas' : KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {/* Photo grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-yellow-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 flex items-center justify-center">
              <Camera size={28} className="text-neutral-700" />
            </div>
            <div>
              <p className="font-black text-neutral-400">Nenhuma foto ainda</p>
              <p className="text-sm text-neutral-600 mt-1">Comece a registrar seu progresso visualmente</p>
            </div>
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="px-5 py-3 rounded-2xl bg-yellow-500 text-black font-black text-sm"
            >
              Adicionar primeira foto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4">
            {filtered.map((photo) => {
              const isSelectedA = selectedA === photo.id
              const isSelectedB = selectedB === photo.id
              const isSelected = isSelectedA || isSelectedB
              return (
                <button
                  type="button"
                  key={photo.id}
                  className={[
                    'relative aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-900 transition-all cursor-pointer text-left',
                    isSelectedA ? 'ring-2 ring-yellow-500 scale-[0.97]' : '',
                    isSelectedB ? 'ring-2 ring-blue-400 scale-[0.97]' : '',
                    compareMode && !isSelected ? 'opacity-70' : '',
                  ].join(' ')}
                  onClick={() => {
                    if (compareMode) { toggleSelect(photo.id); return }
                    setLightbox(photo)
                  }}
                >
                  <Image
                    src={photo.url}
                    alt={KIND_LABELS[photo.kind]}
                    fill
                    className="object-cover object-top"
                    unoptimized
                  />
                  {/* Overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-2 px-2">
                    <p className="text-[10px] font-bold text-neutral-300">{fmtDate(photo.date)}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[9px] font-bold text-yellow-500 uppercase">{KIND_LABELS[photo.kind]}</span>
                      {photo.weight_kg && (
                        <span className="text-[10px] font-black text-white">{photo.weight_kg}kg</span>
                      )}
                    </div>
                  </div>

                  {/* Compare badge */}
                  {isSelected && (
                    <div className={[
                      'absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black',
                      isSelectedA ? 'bg-yellow-500 text-black' : 'bg-blue-500 text-white',
                    ].join(' ')}>
                      {isSelectedA ? 'A' : 'B'}
                    </div>
                  )}

                  {/* Delete button */}
                  {!compareMode && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(photo.id) }}
                      disabled={deletingId === photo.id}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-neutral-400 hover:text-red-400 transition-colors"
                    >
                      {deletingId === photo.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Trash2 size={11} />
                      }
                    </button>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div
          className="fixed inset-0 z-[1700] bg-black/95 flex flex-col"
          onClick={() => setLightbox(null)}
        >
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-bold text-white text-sm">{KIND_LABELS[lightbox.kind]} · {fmtDate(lightbox.date)}</p>
              {lightbox.weight_kg && <p className="text-xs text-yellow-500 font-bold">{lightbox.weight_kg}kg</p>}
            </div>
            <button type="button" onClick={() => setLightbox(null)} className="text-neutral-400">
              <X size={22} />
            </button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="flex-1 relative" onClick={(e) => e.stopPropagation()}>
            <Image src={lightbox.url} alt={KIND_LABELS[lightbox.kind]} fill className="object-contain" unoptimized />
          </div>
          {lightbox.notes && (
            <div className="flex-shrink-0 px-4 py-4 border-t border-neutral-800">
              <p className="text-sm text-neutral-300">{lightbox.notes}</p>
            </div>
          )}
          {/* Navigation arrows */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                const idx = photos.findIndex((p) => p.id === lightbox.id)
                if (idx > 0) setLightbox(photos[idx - 1])
              }}
              className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white disabled:opacity-30"
              disabled={photos.findIndex((p) => p.id === lightbox.id) === 0}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                const idx = photos.findIndex((p) => p.id === lightbox.id)
                if (idx < photos.length - 1) setLightbox(photos[idx + 1])
              }}
              className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white disabled:opacity-30"
              disabled={photos.findIndex((p) => p.id === lightbox.id) === photos.length - 1}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />
      )}
    </div>
  )
}
