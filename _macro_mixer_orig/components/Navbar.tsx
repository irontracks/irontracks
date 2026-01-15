"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import BrandMark from "@/components/BrandMark";

export default function Navbar() {
  const { user, signInWithGoogle, logout } = useAuth();
  const { currentDate, changeDate } = useData();
  const [shouldShowFallbackLogo, setShouldShowFallbackLogo] = useState(false);

  const firstName = user?.displayName?.split(" ")[0] ?? "Coach";
  const photoUrl = user?.photoURL ?? "";
  const initial = (firstName?.[0] ?? "U").toUpperCase();

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur-xl">
      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        
        {/* Top Row: Logo & Auth */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {!shouldShowFallbackLogo ? (
              <img
                src="/icon.svg"
                alt="MacroMixer"
                className="w-9 h-9 rounded-xl shadow-[0_12px_34px_-18px_rgba(234,179,8,0.55)] ring-1 ring-yellow-500/20"
                onError={() => setShouldShowFallbackLogo(true)}
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-500 flex items-center justify-center text-zinc-950 font-black shadow-[0_12px_34px_-18px_rgba(234,179,8,0.55)] ring-1 ring-yellow-500/20">M</div>
            )}
            <div className="leading-tight">
              <BrandMark className="font-black text-base tracking-tight" />
              <div className="text-[10px] uppercase tracking-wider text-zinc-400">IronTracks Company</div>
            </div>
          </div>
          
          <div>
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Bem vindo</div>
                  <div className="text-xs font-semibold text-zinc-200">{firstName}</div>
                </div>
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={firstName}
                    className="w-10 h-10 rounded-full ring-2 ring-yellow-500/60 border border-white/10 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-900/60 ring-2 ring-yellow-500/40 border border-white/10 flex items-center justify-center text-yellow-200 font-bold">
                    {initial}
                  </div>
                )}
                <button onClick={logout} className="btn-ghost w-10 h-10 p-0" aria-label="Sair">
                  <i className="fa-solid fa-arrow-right-from-bracket"></i>
                </button>
              </div>
            ) : (
              <button 
                onClick={signInWithGoogle}
                className="btn-secondary px-3 text-xs bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-950 border-0 shadow-lg shadow-yellow-500/20"
              >
                <i className="fa-brands fa-google mr-1"></i> Entrar
              </button>
            )}
          </div>
        </div>

        {/* Date Navigator */}
        <div className="surface-soft rounded-2xl p-1 flex items-center justify-between">
            <button 
                onClick={() => changeDate(subDays(currentDate, 1))}
                className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-white active:bg-white/5 rounded-xl"
            >
                <i className="fa-solid fa-chevron-left"></i>
            </button>
            
            <div className="text-center">
                <div className="text-sm font-bold text-white capitalize">
                    {format(currentDate, "EEEE, dd/MM", { locale: ptBR })}
                </div>
                <div className="text-xs text-gray-500">
                    {format(currentDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "Hoje" : "Histórico"}
                </div>
            </div>

            <button 
                onClick={() => changeDate(addDays(currentDate, 1))}
                className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-white active:bg-white/5 rounded-xl"
            >
                <i className="fa-solid fa-chevron-right"></i>
            </button>
        </div>
      </div>
    </nav>
  );
}
