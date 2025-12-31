"use client";

import { useData } from "@/context/DataContext";

export default function WaterTracker() {
  const { dailyLog, addWater } = useData();
  const DEFAULT_WATER_GOAL_ML = 3000;
  const goal = DEFAULT_WATER_GOAL_ML;
  const current = dailyLog.water || 0;
  const percentage = Math.min(100, (current / goal) * 100);

  const getStatus = () => {
    if (percentage >= 100) return { text: "Meta atingida!", color: "text-green-400", icon: "fa-check-circle" };
    if (percentage >= 75) return { text: "Ótimo progresso!", color: "text-emerald-300", icon: "fa-thumbs-up" };
    if (percentage >= 50) return { text: "Continue assim!", color: "text-yellow-300", icon: "fa-droplet" };
    if (percentage >= 25) return { text: "Beba mais água!", color: "text-amber-300", icon: "fa-info-circle" };
    return { text: "Hidrate-se!", color: "text-orange-300", icon: "fa-triangle-exclamation" };
  };

  const status = getStatus();

  return (
    <div className="surface rounded-3xl p-4 shadow-lg mb-6">
      <div className="flex justify-between items-center mb-2">
        <div className="text-gray-400 text-xs uppercase font-bold">
            <i className="fa-solid fa-glass-water text-yellow-500 mr-1"></i> Hidratação
        </div>
        <div className={`text-xs font-bold flex items-center ${status.color}`}>
            <i className={`fa-solid ${status.icon} mr-1`}></i>
            {status.text}
        </div>
      </div>

      <div className="flex items-end justify-between mb-2">
        <div className="text-2xl font-bold text-white">
            {current} <span className="text-sm text-gray-500 font-normal">ml</span>
        </div>
        <div className="text-xs text-gray-500 mb-1">
            Meta: {goal}ml
        </div>
      </div>

      <div className="w-full bg-slate-900/60 rounded-full h-2 mb-4 relative overflow-hidden">
        <div 
            className="bg-gradient-to-r from-yellow-500 to-amber-500 h-full rounded-full transition-all duration-500 relative"
            style={{ width: `${percentage}%` }}
        >
            <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => addWater(200)} className="btn-ghost h-11 text-xs text-yellow-200">+200ml</button>
        <button onClick={() => addWater(300)} className="btn-ghost h-11 text-xs text-yellow-200">+300ml</button>
        <button onClick={() => addWater(500)} className="btn-ghost h-11 text-xs text-yellow-200">+500ml</button>
        <button onClick={() => addWater(-200)} className="btn-ghost h-11 text-xs text-red-300 hover:text-red-200" aria-label="Remover 200ml">
          <i className="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  );
}
