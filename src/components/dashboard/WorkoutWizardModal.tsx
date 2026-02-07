"use client";

import React, { useMemo, useState } from "react";
import { X, Sparkles, Brain, Timer, Dumbbell } from "lucide-react";

export type WorkoutWizardGoal = "hypertrophy" | "strength" | "conditioning" | "maintenance";
export type WorkoutWizardLevel = "beginner" | "intermediate" | "advanced";
export type WorkoutWizardEquipment = "minimal" | "home" | "gym";
export type WorkoutWizardSplit = "full_body" | "upper_lower" | "ppl";
export type WorkoutWizardFocus = "balanced" | "upper" | "lower" | "push" | "pull" | "legs";

export type WorkoutDraft = {
  title: string;
  exercises: any[];
};

export type WorkoutWizardAnswers = {
  goal: WorkoutWizardGoal;
  level: WorkoutWizardLevel;
  equipment: WorkoutWizardEquipment;
  split: WorkoutWizardSplit;
  focus: WorkoutWizardFocus;
  timeMinutes: number;
  daysPerWeek?: number;
  constraints: string;
};

export type WorkoutWizardMode = "single" | "program";

export type WorkoutWizardGenerateOptions = {
  mode?: WorkoutWizardMode;
};

type WorkoutWizardModalProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onManual?: () => void;
  onGenerate?: (
    answers: WorkoutWizardAnswers,
    options: WorkoutWizardGenerateOptions
  ) => Promise<WorkoutDraft | { drafts: WorkoutDraft[] }>;
  onSaveDrafts?: (drafts: WorkoutDraft[]) => Promise<void> | void;
  onUseDraft?: (draft: WorkoutDraft) => void;
};

const GOAL_OPTIONS: { value: WorkoutWizardGoal; label: string }[] = [
  { value: "hypertrophy", label: "Hipertrofia" },
  { value: "strength", label: "Força" },
  { value: "conditioning", label: "Condicionamento" },
  { value: "maintenance", label: "Manutenção" },
];

const LEVEL_OPTIONS: { value: WorkoutWizardLevel; label: string }[] = [
  { value: "beginner", label: "Iniciante" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced", label: "Avançado" },
];

const EQUIPMENT_OPTIONS: { value: WorkoutWizardEquipment; label: string }[] = [
  { value: "minimal", label: "Mínimo (peso corporal/elástico)" },
  { value: "home", label: "Casa (halteres/banco)" },
  { value: "gym", label: "Academia completa" },
];

const SPLIT_OPTIONS: { value: WorkoutWizardSplit; label: string }[] = [
  { value: "full_body", label: "Full Body" },
  { value: "upper_lower", label: "Upper/Lower" },
  { value: "ppl", label: "PPL (Push/Pull/Legs)" },
];

const FOCUS_OPTIONS: { value: WorkoutWizardFocus; label: string }[] = [
  { value: "balanced", label: "Equilíbrio geral" },
  { value: "upper", label: "Upper" },
  { value: "lower", label: "Lower" },
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Pernas" },
];

export default function WorkoutWizardModal(props: WorkoutWizardModalProps) {
  const { isOpen, onClose, onManual, onGenerate, onSaveDrafts, onUseDraft } = props;

  const [mode, setMode] = useState<WorkoutWizardMode>("single");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const [goal, setGoal] = useState<WorkoutWizardGoal>("hypertrophy");
  const [level, setLevel] = useState<WorkoutWizardLevel>("intermediate");
  const [equipment, setEquipment] = useState<WorkoutWizardEquipment>("gym");
  const [split, setSplit] = useState<WorkoutWizardSplit>("full_body");
  const [focus, setFocus] = useState<WorkoutWizardFocus>("balanced");
  const [timeMinutesRaw, setTimeMinutesRaw] = useState("60");
  const [daysPerWeekRaw, setDaysPerWeekRaw] = useState("3");
  const [constraints, setConstraints] = useState("");

  const parsedTimeMinutes = useMemo(() => {
    const n = Number(timeMinutesRaw.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return 60;
    return Math.max(20, Math.min(120, n));
  }, [timeMinutesRaw]);

  const parsedDaysPerWeek = useMemo(() => {
    const n = Number(daysPerWeekRaw.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return 3;
    return Math.max(2, Math.min(6, n));
  }, [daysPerWeekRaw]);

  if (!isOpen) return null;

  const answers: WorkoutWizardAnswers = {
    goal,
    level,
    equipment,
    split,
    focus,
    timeMinutes: parsedTimeMinutes,
    daysPerWeek: parsedDaysPerWeek,
    constraints,
  };

  const closeSafely = () => {
    if (busy) return;
    setError("");
    if (onClose) onClose();
  };

  const handleManual = () => {
    if (busy) return;
    try {
      if (onManual) onManual();
    } finally {
      if (onClose) onClose();
    }
  };

  const handleGenerate = async () => {
    if (!onGenerate) return;
    setBusy(true);
    setError("");
    try {
      const result = await onGenerate(answers, { mode });
      if (result && typeof result === "object" && "drafts" in result) {
        const drafts = Array.isArray((result as any).drafts)
          ? ((result as any).drafts as WorkoutDraft[])
          : [];
        if (drafts.length && onSaveDrafts) {
          await onSaveDrafts(drafts);
        }
      } else if (result && onUseDraft) {
        onUseDraft(result as WorkoutDraft);
      }
      if (onClose) onClose();
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e ?? "Erro ao gerar treino");
      setError(msg);
      try {
        if (typeof window !== "undefined" && window.alert) {
          window.alert(msg);
        }
      } catch {}
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Sparkles className="text-yellow-500" size={18} />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">Assistente de Treinos com IA</span>
              <span className="text-[11px] text-neutral-400">Defina o contexto e deixe o IronTracks montar o treino.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSafely}
            className="h-9 w-9 rounded-full flex items-center justify-center bg-neutral-900 text-neutral-400 border border-neutral-700 hover:text-white hover:bg-neutral-800 active:scale-95 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 pt-4 pb-3 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 flex items-center gap-1">
                <Brain size={12} /> Objetivo principal
              </label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as WorkoutWizardGoal)}
                className="w-full bg-black/40 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 outline-none focus:ring-1 ring-yellow-500"
              >
                {GOAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Nível</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as WorkoutWizardLevel)}
                className="w-full bg-black/40 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 outline-none focus:ring-1 ring-yellow-500"
              >
                {LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 flex items-center gap-1">
                <Dumbbell size={12} /> Estrutura de treino
              </label>
              <select
                value={split}
                onChange={(e) => setSplit(e.target.value as WorkoutWizardSplit)}
                className="w-full bg-black/40 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 outline-none focus:ring-1 ring-yellow-500"
              >
                {SPLIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Foco principal</label>
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as WorkoutWizardFocus)}
                className="w-full bg-black/40 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 outline-none focus:ring-1 ring-yellow-500"
              >
                {FOCUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Equipamentos disponíveis</label>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as WorkoutWizardEquipment)}
              className="w-full bg-black/40 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 outline-none focus:ring-1 ring-yellow-500"
            >
              {EQUIPMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 flex items-center gap-1">
                <Timer size={12} /> Duração por sessão (min)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={timeMinutesRaw}
                onChange={(e) => setTimeMinutesRaw(e.target.value)}
                className="w-full bg-black/40 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 outline-none focus:ring-1 ring-yellow-500"
              />
              <p className="text-[10px] text-neutral-500">Entre 20 e 120 minutos.</p>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Dias de treino por semana</label>
              <input
                type="text"
                inputMode="numeric"
                value={daysPerWeekRaw}
                onChange={(e) => setDaysPerWeekRaw(e.target.value)}
                className="w-full bg-black/40 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 outline-none focus:ring-1 ring-yellow-500"
              />
              <p className="text-[10px] text-neutral-500">Usado quando gerar um programa completo.</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Restrições, lesões ou observações</label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={3}
              className="w-full bg-black/40 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 outline-none focus:ring-1 ring-yellow-500 resize-none"
              placeholder="Ex: dor no joelho, evitar overhead press, foco em lombar saudável"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`px-3 py-1.5 rounded-full border text-xs transition-all ${
                  mode === "single"
                    ? "bg-yellow-500 text-black border-yellow-500"
                    : "bg-neutral-900 text-neutral-200 border-neutral-700"
                }`}
              >
                Treino único
              </button>
              <button
                type="button"
                onClick={() => setMode("program")}
                className={`px-3 py-1.5 rounded-full border text-xs transition-all ${
                  mode === "program"
                    ? "bg-yellow-500 text-black border-yellow-500"
                    : "bg-neutral-900 text-neutral-200 border-neutral-700"
                }`}
              >
                Plano completo
              </button>
            </div>
            <div className="text-[11px] text-neutral-500 text-right">
              {mode === "single" ? "Gerar um treino baseado nas escolhas acima." : "Gerar um plano semanal com vários treinos."}
            </div>
          </div>

          {error && (
            <div className="text-[11px] text-red-400 mt-1">{error}</div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleManual}
            className="h-10 min-w-[44px] px-3 rounded-xl bg-neutral-900 text-xs text-neutral-200 border border-neutral-700 active:scale-95 transition-all disabled:opacity-60"
            disabled={busy}
          >
            Editar manualmente
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeSafely}
              className="h-10 min-w-[44px] px-3 rounded-xl bg-neutral-900 text-xs text-neutral-300 border border-neutral-700 active:scale-95 transition-all disabled:opacity-60"
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              className="h-10 min-w-[44px] px-4 rounded-xl bg-yellow-500 text-xs font-semibold text-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
              disabled={busy || !onGenerate}
            >
              <Sparkles size={16} />
              <span>{busy ? "Gerando..." : "Gerar com IA"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

