"use client";

import { useData } from "@/context/DataContext";

type DashboardTotals = { cals: number; prot: number; carb: number; fat: number };

const useDashboardViewModel = () => {
    const { dailyLog, userSettings } = useData();

    const total: DashboardTotals = dailyLog.total || { cals: 0, prot: 0, carb: 0, fat: 0 };
    const goal = userSettings;
    const remainingCals = goal.cals - total.cals;
    const remainingProt = goal.prot - total.prot;
    const remainingCarb = goal.carb - total.carb;
    const remainingFat = goal.fat - total.fat;

    const getPct = (val: number, max: number) => Math.min(100, Math.max(0, (val / max) * 100));

    return {
        total,
        goal,
        remainingCals,
        remainingProt,
        remainingCarb,
        remainingFat,
        getPct
    };
};

export function DashboardStatsCard() {
    const { total, goal, remainingCals, remainingProt, remainingCarb, remainingFat, getPct } = useDashboardViewModel();

    return (
        <div className="glass-panel rounded-3xl p-5 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-start gap-4 mb-4">
                <div className="min-w-0">
                    <div className="text-gray-400 text-xs uppercase tracking-wider">Kcal</div>
                    <div className={`text-2xl font-bold ${remainingCals < 0 ? "text-red-400" : "text-yellow-300"}`}>
                        {Math.round(Math.abs(remainingCals))}
                        <span className="text-sm font-normal text-gray-500 ml-2">{remainingCals < 0 ? "acima" : "restantes"}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">Consumido {Math.round(total.cals)} / {goal.cals}</div>
                </div>

                <div className="text-right">
                    <div className="text-gray-400 text-xs uppercase tracking-wider">Hoje</div>
                    <div className="text-xs text-gray-500">P/C/G: {Math.max(0, Math.round(remainingProt))}/{Math.max(0, Math.round(remainingCarb))}/{Math.max(0, Math.round(remainingFat))}g</div>
                </div>
            </div>

            <div className="w-full bg-slate-900/60 rounded-full h-3 mb-6 relative overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${total.cals > goal.cals ? "bg-red-500" : "bg-gradient-to-r from-yellow-500 to-amber-500"}`}
                    style={{ width: `${getPct(total.cals, goal.cals)}%` }}
                ></div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="surface-soft rounded-2xl p-3 hover:border-yellow-500/20 transition-colors">
                    <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-2">Proteína</div>
                    <div className="text-white font-bold text-lg">
                        {Math.max(0, Math.round(remainingProt))}g
                        <span className="text-xs font-normal text-gray-600 ml-1">restantes</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-2">{Math.round(total.prot)} / {goal.prot}g</div>
                    <div className="w-full bg-slate-900/60 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-500" style={{ width: `${getPct(total.prot, goal.prot)}%` }}></div>
                    </div>
                </div>

                <div className="surface-soft rounded-2xl p-3 hover:border-yellow-500/20 transition-colors">
                    <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-2">Carbo</div>
                    <div className="text-white font-bold text-lg">
                        {Math.max(0, Math.round(remainingCarb))}g
                        <span className="text-xs font-normal text-gray-600 ml-1">restantes</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-2">{Math.round(total.carb)} / {goal.carb}g</div>
                    <div className="w-full bg-slate-900/60 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-500" style={{ width: `${getPct(total.carb, goal.carb)}%` }}></div>
                    </div>
                </div>

                <div className="surface-soft rounded-2xl p-3 hover:border-yellow-500/20 transition-colors">
                    <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-2">Gordura</div>
                    <div className="text-white font-bold text-lg">
                        {Math.max(0, Math.round(remainingFat))}g
                        <span className="text-xs font-normal text-gray-600 ml-1">restantes</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-2">{Math.round(total.fat)} / {goal.fat}g</div>
                    <div className="w-full bg-slate-900/60 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-500" style={{ width: `${getPct(total.fat, goal.fat)}%` }}></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Dashboard() {
    return (
        <div className="space-y-6">
            <DashboardStatsCard />
        </div>
    );
}
