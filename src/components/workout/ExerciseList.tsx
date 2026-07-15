'use client';

import React from 'react';
import { useWorkoutContext, useWorkoutLogs } from './WorkoutContext';
import ExerciseCard from './ExerciseCard';
import { buildExerciseGroups } from '@/lib/workoutGroups';

function setsCountOf(ex: unknown): number {
  if (!ex || typeof ex !== 'object') return 0;
  const o = ex as Record<string, unknown>;
  const setsHeader = Math.max(0, parseInt(String(o?.sets ?? '0'), 10) || 0);
  const sdArr = Array.isArray(o?.setDetails) ? o.setDetails : Array.isArray(o?.set_details) ? (o.set_details as unknown[]) : [];
  return Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
}

function doneCountOf(logs: Record<string, Record<string, unknown>>, exIdx: number, count: number): number {
  let done = 0;
  for (let i = 0; i < count; i++) {
    if (logs[`${exIdx}-${i}`]?.done) done++;
  }
  return done;
}

/** Conector visual entre dois cards de um mesmo grupo (Bi-Set, etc.). */
function GroupConnector({ method }: { method: string }) {
  return (
    <div className="relative flex items-center justify-center h-7" aria-hidden="true">
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-yellow-500/30" />
      <span className="relative z-10 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-[0.12em] bg-neutral-950 border border-yellow-500/40 text-yellow-500">
        {method.toUpperCase()}
      </span>
    </div>
  );
}

export default function ExerciseList() {
  const { exercises, session, collapsed, setCollapsed } = useWorkoutContext();
  const logs = useWorkoutLogs();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const prevCompletedRef = React.useRef<Set<number>>(new Set());
  const prevDoneKeysRef = React.useRef<Set<string>>(new Set());

  const groups = React.useMemo(() => buildExerciseGroups(exercises as unknown[]), [exercises]);

  React.useEffect(() => {
    const scrollToTop = () => {
      try {
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
      } catch { }
    };
    const raf = requestAnimationFrame(scrollToTop);
    return () => cancelAnimationFrame(raf);
  }, [session?.id, exercises.length]);

  // Auto-scroll to next incomplete exercise when one finishes
  React.useEffect(() => {
    const completedNow = new Set<number>();
    exercises.forEach((ex, exIdx) => {
      const count = setsCountOf(ex);
      if (count === 0) return;
      if (doneCountOf(logs as Record<string, Record<string, unknown>>, exIdx, count) >= count) completedNow.add(exIdx);
    });

    // Scroll is handled by normalSet.tsx after collapse — no duplicate scroll here.
    prevCompletedRef.current = completedNow;
  }, [exercises, logs]);

  // ── Bi-Set / Super-Set: alterna automaticamente entre exercícios do grupo ──
  // Quando uma série (que NÃO é a última do exercício) é concluída num exercício
  // agrupado, expande e rola para o próximo exercício do grupo — dando a sensação
  // de "fez um, já vai pro outro". A última série de cada exercício segue o fluxo
  // padrão (collapse + scroll pra frente do normalSet), evitando conflito.
  React.useEffect(() => {
    const logsObj = logs as Record<string, Record<string, unknown>>;
    const doneNow = new Set<string>();
    for (const [k, v] of Object.entries(logsObj)) {
      if (v?.done) doneNow.add(k);
    }
    // Detecta a série recém-concluída (presente agora, ausente antes)
    let newlyDone: string | null = null;
    for (const k of doneNow) {
      if (!prevDoneKeysRef.current.has(k)) { newlyDone = k; break; }
    }
    prevDoneKeysRef.current = doneNow;
    if (!newlyDone) return;

    const dash = newlyDone.indexOf('-');
    if (dash === -1) return;
    const exIdx = parseInt(newlyDone.slice(0, dash), 10);
    const setIdx = parseInt(newlyDone.slice(dash + 1), 10);
    if (!Number.isFinite(exIdx) || !Number.isFinite(setIdx)) return;

    const g = groups.get(exIdx);
    if (!g) return;

    // Só alterna em séries que não são a última do exercício (a última segue o fluxo padrão)
    const srcCount = setsCountOf(exercises[exIdx]);
    if (setIdx >= srcCount - 1) return;

    // Próximo exercício do grupo (ciclo: ...→ último → primeiro)
    const targetIdx = g.members[(g.position + 1) % g.size];
    if (targetIdx === exIdx) return;

    // Só pula se o alvo ainda tiver séries pendentes
    const tgtCount = setsCountOf(exercises[targetIdx]);
    if (tgtCount === 0) return;
    if (doneCountOf(logsObj, targetIdx, tgtCount) >= tgtCount) return;

    // Expande o alvo (caso esteja recolhido) e rola até ele
    if (collapsed?.has(targetIdx)) {
      setCollapsed?.((prev: Set<number>) => {
        const next = new Set(prev);
        next.delete(targetIdx);
        return next;
      });
    }
    const t = setTimeout(() => {
      try {
        const firstSet = document.querySelector<HTMLElement>(`[data-set-first="${targetIdx}"]`);
        const card = document.querySelector<HTMLElement>(`[data-exercise-idx="${targetIdx}"]`);
        const target = firstSet ?? card;
        // 'instant' evita o auto-zoom do iOS WKWebView com 'smooth' após layout shift
        if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
      } catch { /* silenced */ }
    }, 250);
    return () => clearTimeout(t);
  }, [logs, groups, exercises, collapsed, setCollapsed]);

  const exerciseList = Array.isArray(exercises) ? exercises as Array<{ name?: string }> : [];

  // Monta a sequência de blocos: card solo OU bloco de grupo (cards + conectores)
  const blocks = React.useMemo(() => {
    const out: Array<{ type: 'solo'; idx: number } | { type: 'group'; method: string; members: number[] }> = [];
    let i = 0;
    while (i < exerciseList.length) {
      const g = groups.get(i);
      if (g && g.position === 0) {
        out.push({ type: 'group', method: g.method, members: g.members });
        i += g.members.length;
      } else {
        out.push({ type: 'solo', idx: i });
        i += 1;
      }
    }
    return out;
  }, [exerciseList.length, groups]);

  return (
    <div ref={containerRef} className="flex-1 w-full max-w-6xl mx-auto py-4 space-y-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 160px)' }}>
      <div className="px-4 md:px-6 space-y-4">
        {exerciseList.length === 0 ? (
          <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-6 text-neutral-300">Sem exercícios neste treino.</div>
        ) : (
          blocks.map((b) => {
            if (b.type === 'solo') {
              const exIdx = b.idx;
              return <ExerciseCard key={String(exercises[exIdx]?.id ?? `noid-${exIdx}-${exercises[exIdx]?.name ?? ''}`)} ex={exercises[exIdx]} exIdx={exIdx} />;
            }
            return (
              <div key={`grp-${b.members[0]}`} className="rounded-2xl bg-yellow-500/[0.02] border border-yellow-500/10 p-1.5 space-y-0">
                {b.members.map((exIdx, i) => (
                  <React.Fragment key={String(exercises[exIdx]?.id ?? `noid-${exIdx}-${exercises[exIdx]?.name ?? ''}`)}>
                    <ExerciseCard
                      ex={exercises[exIdx]}
                      exIdx={exIdx}
                      groupPos={i === 0 ? 'first' : i === b.members.length - 1 ? 'last' : 'middle'}
                    />
                    {i < b.members.length - 1 && <GroupConnector method={b.method} />}
                  </React.Fragment>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
