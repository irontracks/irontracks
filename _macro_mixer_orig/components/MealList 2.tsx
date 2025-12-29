"use client";

import { useData } from "@/context/DataContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function MealList() {
  const { dailyLog, deleteMeal } = useData();

  if (dailyLog.items.length === 0) {
    return (
      <div className="text-center text-gray-500 py-10 surface rounded-3xl border-dashed">
        <i className="fa-solid fa-utensils text-3xl mb-3 opacity-30"></i>
        <p className="mb-4">Nenhuma refeição registrada hoje.</p>
        <a
          href="#meal-input"
          className="btn-secondary px-4"
        >
          <i className="fa-solid fa-plus"></i>
          Adicionar refeição
        </a>
        <div className="mt-4 text-xs text-gray-600 font-mono">
          Ex: 4 ovos · 150g frango · 100g arroz
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dailyLog.items.map((meal) => (
        <div key={meal.id} className="surface rounded-3xl p-4 shadow-lg relative group">
          {/* Header */}
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-white font-bold text-lg">{meal.name}</h3>
              <div className="text-gray-500 text-xs">
                {format(new Date(meal.timestamp), "HH:mm", { locale: ptBR })}
                {meal.isApproximate && <span className="ml-2 text-amber-300"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Estimado</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-amber-400 font-bold text-lg">{Math.round(meal.cals)} kcal</div>
              <button
                onClick={() => {
                  if (confirm("Excluir esta refeição?")) deleteMeal(meal.id);
                }}
                className="text-gray-500 hover:text-red-400 text-xs mt-1 transition-colors p-2 rounded-lg hover:bg-white/5"
              >
                <i className="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>

          {/* Foods */}
          <div className="space-y-1 mb-3">
            {meal.foods.map((food: any, idx: number) => (
              <div key={idx} className="flex justify-between text-sm text-gray-300">
                <span>{food.qtd} {food.unitDisplay} {food.name}</span>
              </div>
            ))}
          </div>

          {/* Macros */}
          <div className="flex gap-4 text-xs font-mono pt-3 border-t border-white/10">
            <div className="text-green-400">P: {Math.round(meal.prot)}g</div>
            <div className="text-sky-300">C: {Math.round(meal.carb)}g</div>
            <div className="text-amber-300">G: {Math.round(meal.fat)}g</div>
          </div>
        </div>
      ))}
    </div>
  );
}
