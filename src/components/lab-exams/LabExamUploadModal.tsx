'use client'

import React, { useCallback, useRef, useState } from 'react'
import { X, Loader2, Sparkles, FileText, Upload, Trash2, RotateCcw, ShieldAlert, FlaskConical } from 'lucide-react'
import { uploadLabExamFile } from '@/utils/storage/labExamUpload'
import { LAB_EXAM_MAX_FILES, LAB_EXAM_MAX_FILE_BYTES } from '@/types/labExam'
import { LAB_PROTOCOL_DISCLAIMER, type LabProtocol } from '@/schemas/labExam'
import { LabExamProtocolView } from './LabExamProtocolView'

type Stage = 'select' | 'processing' | 'result' | 'error'

interface Props {
  open: boolean
  onClose: () => void
  /** user_id do aluno (fluxo personal). Omitido = autoavaliação. */
  studentUserId?: string | null
  /** Chamado após gerar o protocolo (ex.: recarregar lista). */
  onSaved?: () => void
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; message?: string; id?: string; data?: LabProtocol }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json().catch(() => ({ ok: false, error: 'invalid_response' }))
}

export function LabExamUploadModal({ open, onClose, studentUserId, onSaved }: Props) {
  const [stage, setStage] = useState<Stage>('select')
  const [files, setFiles] = useState<File[]>([])
  const [examDate, setExamDate] = useState('')
  const [labName, setLabName] = useState('')
  const [progress, setProgress] = useState('')
  const [protocol, setProtocol] = useState<LabProtocol | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStage('select'); setFiles([]); setExamDate(''); setLabName('')
    setProgress(''); setProtocol(null); setErrorMsg('')
  }, [])

  const handleClose = useCallback(() => {
    if (stage === 'processing') {
      // Não bloqueia o fechamento — pede confirmação pra não prender o usuário
      if (typeof window !== 'undefined' && !window.confirm('O processamento ainda está em andamento. Fechar mesmo assim?')) return
    }
    reset(); onClose()
  }, [stage, reset, onClose])

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return
    setFiles((prev) => {
      const merged = [...prev]
      for (const f of Array.from(list)) {
        if (merged.length >= LAB_EXAM_MAX_FILES) break
        if (f.size > LAB_EXAM_MAX_FILE_BYTES) continue
        merged.push(f)
      }
      return merged
    })
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) return
    setStage('processing'); setErrorMsg('')
    try {
      setProgress('Criando exame…')
      const created = await postJson('/api/lab-exams/create', {
        studentUserId: studentUserId ?? null,
        examDate: examDate || null,
        labName: labName || null,
      })
      if (!created.ok || !created.id) throw new Error(created.message || created.error || 'Falha ao criar exame.')
      const examId = created.id

      for (let i = 0; i < files.length; i++) {
        setProgress(`Enviando arquivo ${i + 1} de ${files.length}…`)
        const up = await uploadLabExamFile(files[i], examId)
        if (!up.ok) throw new Error(up.error || 'Falha no upload.')
      }

      setProgress('Lendo os marcadores do exame com IA…')
      const extracted = await postJson('/api/ai/lab-exam-extract', { examId })
      if (!extracted.ok) throw new Error(extracted.message || extracted.error || 'Falha ao ler o exame.')

      setProgress('Cruzando com sua avaliação e treino…')
      const proto = await postJson('/api/ai/lab-exam-protocol', { examId })
      if (!proto.ok || !proto.data) throw new Error(proto.message || proto.error || 'Falha ao gerar o protocolo.')

      setProtocol(proto.data)
      setStage('result')
      try { onSaved?.() } catch { /* noop */ }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Erro inesperado.')
      setStage('error')
    }
  }, [files, studentUserId, examDate, labName, onSaved])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}>
              <FlaskConical className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-base font-black text-white leading-tight">Análise de Exames</h2>
              <p className="text-[11px] text-neutral-500">Protocolo integrado por IA</p>
            </div>
          </div>
          {/* Fechar sempre disponível; durante processing pergunta antes (não bloqueia) */}
          <button onClick={handleClose} aria-label="Fechar"
            className="w-9 h-9 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white hover:border-yellow-500/40 transition flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — min-h evita reflow/zoom no iOS quando conteúdo muda de tamanho */}
        <div className="flex-1 overflow-y-auto p-5 min-h-[40vh]">
          {stage === 'select' && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-400">
                Suba o PDF ou foto dos seus exames de sangue. A IA lê os marcadores e cruza com sua avaliação
                física e seus treinos pra montar um protocolo de treino, dieta e suplementação.
              </p>

              {/* Dropzone */}
              <div
                role="button" tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click() }}
                className="border-2 border-dashed border-neutral-700 rounded-2xl p-6 text-center hover:border-yellow-500/50 transition cursor-pointer"
              >
                <Upload className="w-9 h-9 text-neutral-500 mx-auto mb-2" />
                <p className="text-sm text-neutral-300 font-bold">Toque para escolher arquivos</p>
                <p className="text-[11px] text-neutral-500 mt-1">PDF, JPG, PNG · até {LAB_EXAM_MAX_FILES} arquivos · máx 20 MB cada</p>
                <input
                  ref={inputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
                  aria-label="Escolher arquivos de exame"
                  onChange={(e) => { addFiles(e.target.files); if (inputRef.current) inputRef.current.value = '' }}
                />
              </div>

              {/* Lista de arquivos */}
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2">
                      <FileText className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                      <span className="text-sm text-neutral-200 truncate flex-1">{f.name}</span>
                      <span className="text-[10px] text-neutral-500">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button onClick={() => removeFile(i)} aria-label="Remover" className="text-neutral-500 hover:text-red-400 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Metadados opcionais */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="lab-exam-date" className="text-[11px] uppercase font-bold text-neutral-500">Data do exame</label>
                  <input id="lab-exam-date" type="date" aria-label="Data do exame" value={examDate} onChange={(e) => setExamDate(e.target.value)}
                    className="w-full mt-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-[16px] text-white focus:border-yellow-500 focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="lab-exam-lab" className="text-[11px] uppercase font-bold text-neutral-500">Laboratório</label>
                  <input id="lab-exam-lab" type="text" aria-label="Laboratório" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="opcional"
                    className="w-full mt-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-[16px] text-white focus:border-yellow-500 focus:outline-none" />
                </div>
              </div>

              {/* Disclaimer */}
              <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3 flex gap-2.5">
                <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-200/90 leading-relaxed">{LAB_PROTOCOL_DISCLAIMER}</p>
              </div>

              {errorMsg ? <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorMsg}</p> : null}
            </div>
          )}

          {stage === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-4">
              <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
              <div>
                <p className="text-white font-bold">{progress || 'Processando…'}</p>
                <p className="text-xs text-neutral-500 mt-1">Não feche esta janela. Pode levar até 1 minuto.</p>
              </div>
            </div>
          )}

          {stage === 'result' && protocol ? <LabExamProtocolView protocol={protocol} /> : null}

          {stage === 'error' && (
            <div className="py-10 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <X className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-sm text-neutral-300 max-w-sm">{errorMsg || 'Não foi possível concluir a análise.'}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-neutral-800 shrink-0">
          {stage === 'select' && (
            <button
              onClick={handleAnalyze} disabled={files.length === 0}
              className="w-full min-h-[48px] rounded-xl text-black font-black shadow-lg shadow-yellow-500/20 transition active:scale-95 inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed btn-gold-animated"
            >
              <Sparkles className="w-5 h-5" />
              Analisar {files.length > 0 ? `(${files.length})` : ''}
            </button>
          )}
          {stage === 'result' && (
            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 min-h-[48px] rounded-xl border border-neutral-700 text-neutral-200 font-bold hover:border-yellow-500/40 transition active:scale-95 inline-flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" /> Novo
              </button>
              <button onClick={handleClose} className="flex-1 min-h-[48px] rounded-xl text-black font-black transition active:scale-95 btn-gold-animated">
                Concluir
              </button>
            </div>
          )}
          {stage === 'error' && (
            <button onClick={() => { setErrorMsg(''); setStage('select') }} className="w-full min-h-[48px] rounded-xl border border-neutral-700 text-neutral-200 font-bold hover:border-yellow-500/40 transition active:scale-95">
              Tentar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
