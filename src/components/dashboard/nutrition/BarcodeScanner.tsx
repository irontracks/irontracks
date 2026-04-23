'use client'

import { useCallback, useState } from 'react'
import { isNativePlatform } from '@/utils/platform'

type BarcodeScanResult = {
  rawValue: string
}

type BarcodePlugin = {
  scan: () => Promise<{ barcodes: BarcodeScanResult[] }>
  checkPermissions: () => Promise<{ camera: string }>
  requestPermissions: () => Promise<{ camera: string }>
}

async function loadBarcodePlugin(): Promise<BarcodePlugin | null> {
  try {
    if (!isNativePlatform()) return null
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
    return BarcodeScanner as unknown as BarcodePlugin
  } catch {
    return null
  }
}

type Props = {
  onResult: (ean: string) => void
  onClose: () => void
}

type ScanState = 'idle' | 'scanning' | 'error'

export default function BarcodeScanner({ onResult, onClose }: Props) {
  const [state, setState] = useState<ScanState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const startScan = useCallback(async () => {
    setState('scanning')
    setErrorMsg('')

    const plugin = await loadBarcodePlugin()
    if (!plugin) {
      setState('error')
      setErrorMsg('Scanner de código de barras não disponível neste dispositivo.')
      return
    }

    try {
      const { camera } = await plugin.checkPermissions()
      if (camera !== 'granted') {
        const { camera: granted } = await plugin.requestPermissions()
        if (granted !== 'granted') {
          setState('error')
          setErrorMsg('Permissão de câmera necessária para escanear.')
          return
        }
      }

      const { barcodes } = await plugin.scan()
      const ean = barcodes[0]?.rawValue?.trim()

      if (!ean) {
        setState('error')
        setErrorMsg('Nenhum código detectado. Tente novamente.')
        return
      }

      setState('idle')
      onResult(ean)
    } catch {
      setState('error')
      setErrorMsg('Erro ao escanear. Tente novamente.')
    }
  }, [onResult])

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {state === 'idle' && (
        <button
          type="button"
          onClick={startScan}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-medium text-white active:scale-95"
        >
          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2v16H3V4zm4 0h1v16H7V4zm3 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h4v16h-4V4z" />
          </svg>
          Escanear código de barras
        </button>
      )}

      {state === 'scanning' && (
        <p className="text-sm text-white/60 animate-pulse">Apontando câmera…</p>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-red-400">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setState('idle')}
            className="text-xs text-white/50 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="text-xs text-white/40 underline"
      >
        Cancelar
      </button>
    </div>
  )
}
