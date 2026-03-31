'use client'
/**
 * GymQRCode
 *
 * Coach component: shows the QR Code for a gym so students can scan and
 * check-in without needing GPS.
 *
 * Features:
 *  - Generates QR code client-side using `qrcode` library
 *  - Copy link button
 *  - Regenerate token (rotate) button
 *  - Download QR as PNG
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Download, Loader2, RefreshCw, X, QrCode, Check } from 'lucide-react'

interface GymQRCodeProps {
  /** UUID of the gym owned by the current user */
  gymId: string
  gymName?: string
  onClose: () => void
}

export default function GymQRCode({ gymId, gymName, onClose }: GymQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [checkinUrl, setCheckinUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [rotating, setRotating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const renderQR = useCallback(async (url: string) => {
    if (!canvasRef.current || !url) return
    try {
      const QRCode = (await import('qrcode')).default
      await QRCode.toCanvas(canvasRef.current, url, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
    } catch {
      setError('Erro ao gerar QR Code')
    }
  }, [])

  const fetchQR = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/gps/gym-qr?gym_id=${gymId}`)
      const json = await res.json()
      if (!json.ok) { setError(json.error || 'Erro ao carregar QR'); return }
      setCheckinUrl(json.checkinUrl)
      await renderQR(json.checkinUrl)
    } catch {
      setError('Falha na conexão')
    } finally {
      setLoading(false)
    }
  }, [gymId, renderQR])

  useEffect(() => { fetchQR() }, [fetchQR])

  const handleRotate = async () => {
    if (!confirm('Gerar um novo QR Code? O código anterior vai parar de funcionar.')) return
    setRotating(true)
    try {
      const res = await fetch('/api/gps/gym-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gym_id: gymId }),
      })
      const json = await res.json()
      if (!json.ok) { setError(json.error || 'Erro ao renovar QR'); return }
      setCheckinUrl(json.checkinUrl)
      await renderQR(json.checkinUrl)
    } finally {
      setRotating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(checkinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const handleDownload = () => {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.href = canvasRef.current.toDataURL('image/png')
    link.download = `checkin-qr-${gymName || gymId}.png`
    link.click()
  }

  return (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-neutral-950 border border-neutral-800 rounded-3xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <QrCode size={16} className="text-yellow-500" />
            <p className="font-black text-white text-sm">QR Code de Check-in</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4">
          {/* Gym name */}
          {gymName && (
            <div className="text-center">
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Academia</p>
              <p className="text-base font-black text-white">{gymName}</p>
            </div>
          )}

          {/* QR Code canvas */}
          <div className={[
            'relative w-[280px] h-[280px] rounded-2xl overflow-hidden bg-white flex items-center justify-center',
            loading ? 'opacity-0' : 'opacity-100',
          ].join(' ')}>
            <canvas ref={canvasRef} aria-label="QR Code de check-in da academia" className="w-[280px] h-[280px]" />
          </div>

          {loading && (
            <div className="w-[280px] h-[280px] rounded-2xl bg-neutral-900 flex items-center justify-center -mt-[280px] relative">
              <Loader2 size={32} className="animate-spin text-yellow-500" />
            </div>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* Instruction */}
          {!loading && !error && (
            <p className="text-xs text-neutral-500 text-center">
              Mostre este QR Code para seus alunos escanearem com a câmera do celular
            </p>
          )}

          {/* Action buttons */}
          <div className="w-full grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!checkinUrl}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors disabled:opacity-50"
            >
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              <span className="text-[10px] font-bold">{copied ? 'Copiado!' : 'Copiar link'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!checkinUrl || loading}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors disabled:opacity-50"
            >
              <Download size={16} />
              <span className="text-[10px] font-bold">Baixar PNG</span>
            </button>
            <button
              type="button"
              onClick={handleRotate}
              disabled={rotating || loading}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={rotating ? 'animate-spin' : ''} />
              <span className="text-[10px] font-bold">Renovar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
