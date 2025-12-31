"use client";

import { useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import MealInput from "@/components/MealInput";
import MealList from "@/components/MealList";
import WaterTracker from "@/components/WaterTracker";
import SuitePanel from "@/components/SuitePanel";
import { DashboardStatsCard } from "@/components/Dashboard";
import { useAuth } from "@/context/AuthContext";
import BrandMark from "@/components/BrandMark";

type PanelKey = "none" | "meal" | "macros" | "meals" | "tools";

export default function HomeShell() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [openPanel, setOpenPanel] = useState<PanelKey>("none");

  const getSegmentClassName = (panelKey: PanelKey) => {
    return openPanel === panelKey ? "segmented-item-active" : "segmented-item";
  };

  const panelTitle = useMemo(() => {
    if (openPanel === "meal") return "Nova Refeição";
    if (openPanel === "macros") return "Macros";
    if (openPanel === "meals") return "Refeições";
    if (openPanel === "tools") return "Ferramentas";
    return "";
  }, [openPanel]);

  const isPanelOpen = openPanel !== "none";

  if (loading) {
    return <main className="min-h-screen bg-zinc-950" />;
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <div className="min-h-screen flex items-center justify-center p-4 md:p-10">
          <div className="w-full max-w-5xl">
            <div className="w-full rounded-3xl border border-white/10 bg-zinc-950/40 backdrop-blur-xl p-6 pb-16 md:p-10 md:pb-20 relative overflow-hidden md:h-[calc(100vh-80px)] md:max-h-[820px]">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-transparent" />
              <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(234,179,8,0.22)_0%,rgba(234,179,8,0.0)_62%)] blur-2xl iron-glow" />
              <div className="pointer-events-none absolute -bottom-48 left-1/2 h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(234,179,8,0.12)_0%,rgba(234,179,8,0.0)_65%)] blur-2xl iron-glow-soft" />

              <div className="relative flex flex-col h-full items-center text-center">
                <div className="flex items-center justify-center gap-3">
                  <img
                    src="/icon.svg"
                    alt="MacroMixer"
                    className="w-10 h-10 md:w-12 md:h-12 rounded-2xl shadow-[0_18px_50px_-28px_rgba(234,179,8,0.65)] ring-1 ring-yellow-500/25"
                  />
                  <div className="leading-tight">
                    <BrandMark className="font-black text-base md:text-xl tracking-tight" />
                    <div className="text-[10px] md:text-xs uppercase tracking-wider text-zinc-400">IronTracks Company</div>
                  </div>
                </div>

                <div className="mt-8 md:mt-10 max-w-2xl">
                  <div className="text-3xl md:text-5xl font-black tracking-tight text-white">
                    Registre refeições.
                    <span className="text-yellow-500"> Bata metas.</span>
                  </div>
                  <div className="mt-4 text-zinc-300 max-w-xl mx-auto">
                    Uma experiência premium, rápida e mobile-first para acompanhar macros com precisão.
                  </div>

                  <div className="mt-8 md:mt-10 grid grid-cols-2 gap-4 w-full max-w-md mx-auto">
                    <button
                      type="button"
                      onClick={signInWithGoogle}
                      className="btn-primary h-auto py-4 rounded-2xl flex-col gap-1 text-center"
                    >
                      <span className="text-sm font-black tracking-tight">Entrar e começar agora</span>
                      <span className="text-[11px] text-zinc-900/80 font-semibold">Leva 10s</span>
                    </button>
                    <div className="surface rounded-2xl p-4 text-center">
                      <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Ritmo</div>
                      <div className="mt-1 text-sm text-white font-semibold">Auto-análise</div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 w-full flex items-center justify-center py-10 md:py-0 md:translate-y-2">
                  <div className="w-full max-w-md">
                    <div className="surface rounded-3xl p-6 md:p-8 shadow-xl">
                      <div className="flex items-center justify-center gap-3">
                        <img
                          src="/icon.svg"
                          alt="MacroMixer"
                          className="w-14 h-14 rounded-2xl shadow-[0_18px_50px_-28px_rgba(234,179,8,0.65)] ring-1 ring-yellow-500/25"
                        />
                      </div>
                      <div className="mt-4 text-center">
                        <BrandMark className="text-2xl font-black tracking-tight" />
                        <div className="mt-1 text-sm text-zinc-400">Entre para sincronizar seus registros.</div>
                      </div>

                      <div className="mt-6">
                        <button type="button" onClick={signInWithGoogle} className="btn-primary">
                          <i className="fa-brands fa-google"></i>
                          Entrar com Google
                        </button>
                      </div>

                      <div className="mt-6 text-xs text-zinc-500 text-center">
                        Você pode usar o app offline e sincronizar depois.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-zinc-600">
                  © {new Date().getFullYear()} <BrandMark className="font-semibold" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-32">
      <Navbar />

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="segmented">
          <button
            type="button"
            onClick={() => setOpenPanel("macros")}
            className={getSegmentClassName("macros")}
          >
            Macros
          </button>
          <button
            type="button"
            onClick={() => setOpenPanel("meals")}
            className={getSegmentClassName("meals")}
          >
            Refeições
          </button>
          <button
            type="button"
            onClick={() => setOpenPanel("tools")}
            className={getSegmentClassName("tools")}
          >
            Ferramentas
          </button>
        </div>

        <DashboardStatsCard />

        <div className="surface rounded-3xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Nova Refeição</div>
              <div className="text-sm text-zinc-200">Registre sua refeição com análise automática.</div>
            </div>
            <button type="button" onClick={() => setOpenPanel("meal")} className="btn-primary h-11 px-4 w-auto">
              + Novo
            </button>
          </div>
        </div>

        <MealList />
        <WaterTracker />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-zinc-950/70 backdrop-blur-xl md:hidden">
        <div className="max-w-2xl mx-auto p-3">
          <button type="button" onClick={() => setOpenPanel("meal")} className="btn-primary">
            + Novo
          </button>
        </div>
      </div>

      <SuitePanel open={isPanelOpen} title={panelTitle} onClose={() => setOpenPanel("none")} size={openPanel === "meal" ? "lg" : "md"}>
        {openPanel === "meal" && (
          <MealInput embedded autoFocus onSaved={() => setOpenPanel("none")} />
        )}
        {openPanel === "macros" && <DashboardStatsCard />}
        {openPanel === "meals" && <MealList />}
        {openPanel === "tools" && <WaterTracker />}
      </SuitePanel>
    </main>
  );
}
