"use client";

import { useEffect, useRef, useState } from "react";
import { parseInput, MealAnalysis } from "@/utils/parser";
import { useData } from "@/context/DataContext";
import VoiceInput from "./VoiceInput";

export default function MealInput({
  embedded,
  autoFocus,
  onSaved
}: {
  embedded?: boolean;
  autoFocus?: boolean;
  onSaved?: () => void;
}) {
  const { addMeal, userSettings } = useData();
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (isSaving) return;

    const raw = input;
    if (!raw.trim()) {
      setAnalysis(null);
      setErrorMessage(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        const result = parseInput(raw, userSettings);
        setAnalysis(result);
        setErrorMessage(null);
      } catch {
        setAnalysis(null);
        setErrorMessage("Não consegui interpretar essa refeição. Tente separar por linhas (ex: '4 ovos' e '150g frango').");
      }
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [input, isSaving, userSettings]);

  const handleConfirm = async () => {
    if (!analysis) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await addMeal({
          name: analysis.mealName,
          timestamp: new Date().toISOString(),
          foods: analysis.foods,
          totals: analysis.totals,
          cals: analysis.totals.kcal,
          prot: analysis.totals.p,
          carb: analysis.totals.c,
          fat: analysis.totals.f,
          isApproximate: analysis.isApproximate
      });

      setInput("");
      setAnalysis(null);
      onSaved?.();
    } catch {
      setErrorMessage("Falha ao salvar a refeição. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoiceTranscript = (text: string) => {
    // Append to existing text or set new
    setInput(prev => {
        const separator = prev.trim() ? "\n" : "";
        return prev + separator + text;
    });
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Placeholder for future Vision API implementation
    if (e.target.files && e.target.files[0]) {
        alert("Recurso 'Iron Vision' (IA Vision) será implementado em breve! A foto foi selecionada.");
    }
  };

  return (
    <div className={embedded ? "relative" : "surface rounded-3xl p-4 shadow-lg relative group"}>
      {!embedded && (
        <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-3xl opacity-0 group-hover:opacity-15 transition duration-500 blur"></div>
      )}

      <div className={embedded ? "" : "relative"}>
        <div className="flex justify-between items-center mb-3">
            <label className="text-gray-400 text-xs uppercase font-bold flex items-center gap-2">
                <span className="bg-yellow-500/10 text-yellow-400 p-1.5 rounded"><i className="fa-solid fa-utensils"></i></span>
                Nova Refeição
            </label>

            <div className="flex gap-2">
                {/* Voice Input Button */}
                <VoiceInput onTranscript={handleVoiceTranscript} />
                
                {/* Camera Button (Future Vision API) */}
                <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                />
                <button 
                    onClick={handleCameraClick}
                    className="w-12 h-12 rounded-2xl bg-zinc-900/60 text-yellow-200 border border-white/10 hover:bg-white/5 transition-all flex items-center justify-center"
                    title="Iron Vision (Camera)"
                >
                    <i className="fa-solid fa-camera"></i>
                </button>
            </div>
        </div>
        
        <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            ref={textareaRef}
            className="w-full bg-zinc-950/50 text-white rounded-2xl p-4 border border-white/10 focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/25 outline-none text-base mb-3 resize-none h-32 font-mono text-sm leading-relaxed"
            placeholder={'Exemplos:\n4 ovos\n150g frango\n100g arroz'}
        ></textarea>

        {errorMessage && (
          <div className="mt-3 text-sm text-red-300 bg-red-950/30 border border-red-900/40 rounded-2xl p-3">
            <i className="fa-solid fa-triangle-exclamation mr-2"></i>
            {errorMessage}
          </div>
        )}

        {/* Analysis Modal / Result Area */}
        {analysis && (
            <div className="mt-6 bg-zinc-950/50 rounded-3xl border border-white/10 p-4 animate-in fade-in slide-in-from-top-4">
                <div className="bg-zinc-900/60 rounded-2xl p-4 mb-4 text-center border border-white/10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 to-amber-500"></div>
                    <div className="text-xl font-bold text-white mb-2">{analysis.mealName}</div>
                    <div className="flex justify-center gap-4 text-sm font-mono">
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500">KCAL</span>
                            <span className="text-white font-bold text-lg">{Math.round(analysis.totals.kcal)}</span>
                        </div>
                        <div className="w-px bg-slate-700"></div>
                        <div className="flex flex-col">
                            <span className="text-xs text-zinc-500">PROT</span>
                            <span className="text-white font-bold">{Math.round(analysis.totals.p)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-zinc-500">CARB</span>
                            <span className="text-white font-bold">{Math.round(analysis.totals.c)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-zinc-500">GORD</span>
                            <span className="text-white font-bold">{Math.round(analysis.totals.f)}</span>
                        </div>
                    </div>
                    {analysis.isApproximate && (
                        <div className="text-amber-200 text-[10px] mt-3 bg-amber-500/10 py-1 rounded-xl border border-amber-500/20">
                            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                            Valores estimados
                        </div>
                    )}
                </div>

                <div className="space-y-2 mb-4">
                    {analysis.foods.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
                             {item.error ? (
                                <div className="text-red-400 text-sm flex items-center">
                                    <i className="fa-solid fa-circle-xmark mr-2"></i>
                                    {item.rawName} <span className="text-xs opacity-60 ml-1">(Não encontrado)</span>
                                </div>
                             ) : (
                                <>
                                    <div>
                                        <div className="text-gray-200 font-medium text-sm">{item.name}</div>
                                        <div className="text-xs text-yellow-200 bg-yellow-500/10 px-2 py-1 rounded-xl inline-block mt-1 border border-white/5">{item.qtd} {item.unitDisplay}</div>
                                    </div>
                                    <div className="text-right text-xs text-gray-400 font-mono">
                                        <div className="font-bold text-white">{Math.round(item.macros.kcal)} kcal</div>
                                        <div className="flex gap-1.5 opacity-80 mt-0.5">
                                            <span className="text-zinc-300">P:{Math.round(item.macros.p)}</span>
                                            <span className="text-zinc-300">C:{Math.round(item.macros.c)}</span>
                                            <span className="text-zinc-300">G:{Math.round(item.macros.f)}</span>
                                        </div>
                                    </div>
                                </>
                             )}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => {
                          setInput("");
                          setAnalysis(null);
                          setErrorMessage(null);
                        }}
                        disabled={isSaving}
                        className="btn-ghost"
                    >
                        CANCELAR
                    </button>
                    <button 
                        onClick={handleConfirm}
                        disabled={isSaving || !analysis}
                        className="btn-primary h-11 text-sm"
                    >
                        {isSaving ? (
                          <>
                            <i className="fa-solid fa-circle-notch fa-spin"></i>
                            SALVANDO
                          </>
                        ) : (
                          <>
                            CONFIRMAR <i className="fa-solid fa-check ml-1"></i>
                          </>
                        )}
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
