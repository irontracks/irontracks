'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

type Props = {
  onResult: (ean: string) => void
  onClose: () => void
}

type ScanState = 'starting' | 'scanning' | 'error'

type ScannerControls = { stop: () => void }

/**
 * Web-based barcode scanner (getUserMedia + @zxing/browser).
 *
 * Replaces the native @capacitor-mlkit plugin, which is CocoaPods-only and
 * therefore incompatible with this app's SPM iOS build. Since the app loads
 * from the production web (server.url), the camera runs inside the WebView via
 * getUserMedia — no native plugin / rebuild required. NSCameraUsageDescription
 * is already declared in the iOS Info.plist.
 */
export default function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<ScannerControls | null>(null)
  const doneRef = useRef(false)
  const [state, setState] = useState<ScanState>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  const cleanup = useCallback(() => {
    try { controlsRef.current?.stop() } catch { /* noop */ }
    controlsRef.current = null
    const video = videoRef.current
    const stream = video?.srcObject as MediaStream | null
    if (stream) {
      for (const track of stream.getTracks()) {
        try { track.stop() } catch { /* noop */ }
      }
    }
    if (video) video.srcObject = null
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          setState('error')
          setErrorMsg('Câmera não disponível neste dispositivo.')
          return
        }

        const videoEl = videoRef.current
        if (!videoEl) return

        // Hints: foca nos formatos de código de barras de produto (EAN/UPC) e
        // liga "try harder" — sem isso o leitor varre todos os formatos e
        // frequentemente não trava no código.
        const hints = new Map<DecodeHintType, unknown>()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)

        const reader = new BrowserMultiFormatReader(hints)
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoEl,
          (result) => {
            if (!result || doneRef.current) return
            const ean = result.getText().trim()
            if (!ean) return
            doneRef.current = true
            cleanup()
            onResult(ean)
          },
        )

        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setState('scanning')
      } catch (e: unknown) {
        if (cancelled) return
        const name = (e as { name?: string })?.name || ''
        setState('error')
        setErrorMsg(
          name === 'NotAllowedError'
            ? 'Permissão de câmera negada. Libere o acesso da câmera nas configurações do app.'
            : name === 'NotFoundError'
              ? 'Nenhuma câmera encontrada.'
              : 'Não foi possível abrir a câmera. Tente novamente.',
        )
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [cleanup, onResult])

  const handleClose = useCallback(() => {
    cleanup()
    onClose()
  }, [cleanup, onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          aria-label="Câmera do scanner de código de barras"
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        >
          <track kind="captions" />
        </video>

        {/* Aiming frame */}
        {state !== 'error' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-72 rounded-2xl border-2 border-yellow-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}

        <div className="absolute left-0 right-0 top-8 px-6 text-center">
          <p className="text-sm font-medium text-white/90">
            {state === 'starting' ? 'Abrindo câmera…' : state === 'scanning' ? 'Aponte para o código de barras' : ''}
          </p>
        </div>

        {state === 'error' && (
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl border border-red-500/30 bg-red-500/15 p-4 text-center">
            <p className="text-sm text-red-200">{errorMsg}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center bg-black p-4 pb-8">
        <button
          type="button"
          onClick={handleClose}
          className="h-11 rounded-xl bg-white/10 px-8 text-sm font-semibold text-white active:scale-95"
        >
          {state === 'error' ? 'Fechar' : 'Cancelar'}
        </button>
      </div>
    </div>
  )
}
