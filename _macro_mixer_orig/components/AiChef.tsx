"use client";

import { useData } from "@/context/DataContext";
import { foodDatabase, FoodItem } from "@/data/foodDatabase";
import { useEffect, useRef, useState } from "react";
import { parseInput } from "@/utils/parser";

export default function AiChef() {
  const { dailyLog, userSettings, addMeal } = useData();
  const [suggestion, setSuggestion] = useState<{ text: string, foods: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Calculate missing macros
  const remaining = {
    prot: userSettings.prot - dailyLog.total.prot,
    carb: userSettings.carb - dailyLog.total.carb,
    fat: userSettings.fat - dailyLog.total.fat,
    cals: userSettings.cals - dailyLog.total.cals
  };

  const generateSuggestion = () => {
    setLoading(true);
    setSuggestion(null);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Artificial delay for "Cyberpunk calculation" effect
    timeoutRef.current = setTimeout(() => {
      let advice = "";
      let suggestedFoods: string[] = [];

      // Logic: Prioritize the most deficient macro
      const deficit = [
        { name: "prot", val: remaining.prot, label: "Proteína" },
        { name: "carb", val: remaining.carb, label: "Carbo" },
        { name: "fat", val: remaining.fat, label: "Gordura" }
      ].sort((a, b) => b.val - a.val); // Sort descending (biggest deficit first)

      const primary = deficit[0];

      if (primary.val <= 0 && remaining.cals <= 0) {
        advice = "Meta batida! Você é uma máquina. Apenas descanse.";
      } else {
        // Find food sources based on primary deficit
        const sources = findSources(primary.name);

        // Pick a random source
        const food = sources[Math.floor(Math.random() * sources.length)];

        // Calculate portion
        // Rule of thumb: Aim to cover 50-100% of the deficit with this meal, capped at reasonable amounts
        let portion = 0;
        let unit = "";

        // Simple heuristic calculation (very basic)
        // e.g. if we need 30g protein and chicken has 32g/100g -> suggest ~100g
        const nutrientPer100g = food.item[primary.name as keyof FoodItem] as number;
        if (nutrientPer100g > 0) {
          const neededAmount = (primary.val / nutrientPer100g) * 100;
          // Round to nearest 10g
          portion = Math.round(neededAmount / 10) * 10;
          // Cap portion to reasonable limits (e.g. 300g max meat)
          if (portion > 300) portion = 300;
          if (portion < 50) portion = 50;

          unit = "g";
        }

        // Construct the text
        const foodName = food.key; // e.g. "frango"
        const text = `${portion}${unit} ${foodName}`;
        suggestedFoods.push(text);

        advice = `Faltam ${Math.round(primary.val)}g de ${primary.label}. O Dr. Bot sugere:`;
      }

      // If we have a suggestion, parse it to show macros preview
      if (suggestedFoods.length > 0) {
        const fullText = suggestedFoods.join(", ");
        const analysis = parseInput(fullText, userSettings);
        setSuggestion({
          text: fullText,
          foods: analysis.foods
        });
      } else {
        setSuggestion({ text: advice, foods: [] });
      }

      setLoading(false);
      timeoutRef.current = null;
    }, 1500);
  };

  // Helper to find foods rich in a specific macro
  const findSources = (macro: string) => {
    const list = [];
    for (const [key, item] of Object.entries(foodDatabase)) {
      // Filter criteria:
      // 1. Must be high in the target macro (>10g per 100g for P/C, >5g for F)
      // 2. Must not be a "junk" entry or drink if we want solid food (simple filter)
      let threshold = 10;
      if (macro === 'fat') threshold = 5;

      // Use 'as any' to bypass strict key check for this quick prototype
      if ((item as any)[macro] > threshold) {
        list.push({ key, item });
      }
    }
    // Fallback if list is empty (shouldn't happen with our db)
    if (list.length === 0) return [{ key: "whey", item: foodDatabase["whey"] }];
    return list;
  };

  const acceptSuggestion = async () => {
    if (!suggestion || suggestion.foods.length === 0) return;

    // Create the meal
    const analysis = parseInput(suggestion.text, userSettings);

    await addMeal({
      name: "Sugestão do Chef IA",
      timestamp: new Date().toISOString(),
      foods: analysis.foods,
      totals: analysis.totals,
      cals: analysis.totals.kcal,
      prot: analysis.totals.p,
      carb: analysis.totals.c,
      fat: analysis.totals.f,
      isApproximate: false
    });

    setSuggestion(null); // Clear after adding
  };

  return (
    <div className="surface rounded-3xl p-4 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl -z-10 group-hover:bg-yellow-500/20 transition-all"></div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold flex items-center gap-2">
          <i className="fa-solid fa-robot text-yellow-400"></i>
          <span className="bg-gradient-to-r from-yellow-400 to-amber-300 bg-clip-text text-transparent">
            Dr. Bot Chef
          </span>
        </h3>
        <button
          onClick={generateSuggestion}
          disabled={loading}
          className="btn-secondary px-3 text-xs text-yellow-100"
        >
          {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <><i className="fa-solid fa-wand-magic-sparkles mr-1"></i> Sugerir</>}
        </button>
      </div>

      {/* Content Area */}
      <div className="min-h-[60px] flex items-center justify-center">
        {!suggestion && !loading && (
          <p className="text-slate-500 text-sm text-center">
            Sem ideias? Peça uma sugestão para fechar seus macros.
          </p>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-2 text-yellow-300">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-bounce delay-0"></span>
              <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-bounce delay-100"></span>
              <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-bounce delay-200"></span>
            </div>
            <span className="text-xs font-mono">CALCULANDO MATRIZ NUTRICIONAL...</span>
          </div>
        )}

        {suggestion && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-slate-950/50 rounded-2xl p-3 border border-white/10 mb-3">
              <p className="text-gray-300 text-sm mb-2">
                <span className="text-amber-300 font-bold">Sugestão: </span>
                {suggestion.text}
              </p>
              {suggestion.foods.length > 0 && (
                <div className="flex gap-3 text-xs font-mono border-t border-white/10 pt-2">
                  <span className="text-green-400">P: {Math.round(suggestion.foods[0].macros.p)}g</span>
                  <span className="text-sky-300">C: {Math.round(suggestion.foods[0].macros.c)}g</span>
                  <span className="text-amber-300">G: {Math.round(suggestion.foods[0].macros.f)}g</span>
                </div>
              )}
            </div>

            {suggestion.foods.length > 0 && (
              <button
                onClick={acceptSuggestion}
                className="btn-primary h-11 text-sm"
              >
                <i className="fa-solid fa-plus"></i> Aceitar Sugestão
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
