"use client";

import { useState, useEffect, useRef } from "react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  isProcessing?: boolean;
}

export default function VoiceInput({ onTranscript, isProcessing }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop?.();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (typeof window !== "undefined") {
      // @ts-ignore - Web Speech API types are not always standard
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = "pt-BR";
        recognition.interimResults = false;

        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
          setError("Erro ao ouvir. Tente novamente.");
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            onTranscript(transcript);
          }
        };

        recognitionRef.current = recognition;
      } else {
        setError("Navegador não suporta voz.");
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop?.();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [onTranscript]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  if (error === "Navegador não suporta voz.") return null;

  return (
    <div className="relative inline-block">
      {/* Ripple Effect when listening */}
      {isListening && (
        <>
          <div className="absolute inset-0 bg-yellow-500 rounded-full animate-ping opacity-20"></div>
          <div className="absolute -inset-2 bg-yellow-500 rounded-full animate-pulse opacity-10"></div>
        </>
      )}

      <button
        type="button"
        onClick={toggleListening}
        disabled={isProcessing}
        className={`
            relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300
            ${isListening
            ? 'bg-yellow-500 text-zinc-950 shadow-[0_0_15px_rgba(234,179,8,0.5)] scale-110'
            : 'bg-zinc-900/60 text-yellow-200 border border-white/10 hover:bg-white/5'}
        `}
        title="Gravar por voz"
      >
        <i className={`fa-solid ${isListening ? 'fa-microphone-lines' : 'fa-microphone'}`}></i>
      </button>

      {/* Helper Tooltip */}
      {isListening && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 whitespace-nowrap bg-zinc-900 text-yellow-200 text-[10px] py-1 px-2 rounded border border-yellow-500/20 animate-in fade-in slide-in-from-top-1">
          Ouvindo...
        </div>
      )}
    </div>
  );
}
