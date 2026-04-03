'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type VoiceInputProps = {
  onTranscript: (text: string) => void
  disabled?: boolean
}

// Check if Web Speech API is available (not in Firefox / some environments)
function isSpeechAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export default function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const [pulse, setPulse] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSupported(isSpeechAvailable())
  }, [])

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    try {
      recognitionRef.current?.stop()
    } catch {}
    setListening(false)
    setPulse(false)
  }, [])

  const start = useCallback(() => {
    if (!isSpeechAvailable() || disabled) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'pt-BR'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.continuous = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results?.[0]?.[0]?.transcript
      if (transcript && typeof transcript === 'string' && transcript.trim()) {
        onTranscript(transcript.trim())
      }
      stop()
    }

    recognition.onerror = () => {
      stop()
    }

    recognition.onend = () => {
      stop()
    }

    recognitionRef.current = recognition
    setListening(true)
    setPulse(true)
    recognition.start()

    // Auto-stop after 15 seconds to prevent dangling sessions
    timeoutRef.current = setTimeout(() => {
      stop()
    }, 15_000)
  }, [disabled, onTranscript, stop])

  const toggle = useCallback(() => {
    if (listening) {
      stop()
    } else {
      start()
    }
  }, [listening, start, stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop() } catch {}
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? 'Parar gravação de voz' : 'Gravar refeição por voz'}
      title={listening ? 'Parar' : 'Falar refeição'}
      className={`
        relative flex items-center justify-center
        rounded-xl p-2.5
        text-lg transition-all duration-200
        ${listening
          ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.35)]'
          : 'bg-neutral-800/60 text-neutral-400 border border-neutral-700/50 hover:text-yellow-400 hover:border-yellow-500/30 hover:bg-neutral-800'
        }
        disabled:opacity-40 disabled:cursor-not-allowed
      `}
    >
      {/* Pulse ring animation */}
      {pulse && (
        <span className="absolute inset-0 rounded-xl border-2 border-red-400/60 animate-ping pointer-events-none" />
      )}
      <span className="relative">
        {listening ? '⏹️' : '🎤'}
      </span>
    </button>
  )
}

// Type augmentation for Web Speech API
declare global {
   
  interface SpeechRecognition extends EventTarget {
    lang: string
    interimResults: boolean
    maxAlternatives: number
    continuous: boolean
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: Event) => void) | null
    onend: (() => void) | null
    start(): void
    stop(): void
  }

   
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
  }

  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}
