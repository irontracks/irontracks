/**
 * Converte linhas de `workouts` em `ReportHistory` — o histórico por exercício
 * que o app usa para autoload, deload e watermark de peso.
 *
 * POR QUE ESTE MÓDULO EXISTE
 *
 * Até 12/09/2026 esta conversão vivia presa dentro de `useWorkoutDeload`, como
 * dois `useCallback`. Quem não fosse React não tinha como chamá-la — e o painel
 * de controle do PROFESSOR precisa exatamente do mesmo número que o ALUNO vê na
 * tela: o peso da última sessão, a média, o `topWeight`, o `setFailures` que
 * trava a progressão. Reimplementar do outro lado seria pedir divergência
 * silenciosa: os dois lados continuariam "certos" isoladamente e discordariam
 * na fronteira, que é a forma de defeito que nenhuma suíte verde pega.
 *
 * É a mesma lição dos 14 renderers de série documentada no `CLAUDE.md`: cada um
 * reimplementava peso/reps/RPE/concluir por conta própria e isso rendeu bugs por
 * um ano (Bi-Set exigindo reps para concluir, drop escondendo o peso das etapas)
 * até 12 deles passarem a desenhar pelo MESMO molde. Um fato, um lugar.
 *
 * CONTRATO
 *
 * - Funções PURAS: sem React, sem Supabase, sem `window`/`document`. As linhas
 *   chegam já lidas por quem tem o cliente (hook no navegador, service-role no
 *   servidor); aqui só se converte.
 * - A chave de log do `logError` continua dizendo `hook:useWorkoutDeload.*` de
 *   propósito: é o que já existe no Sentry, e renomear numa extração mecânica
 *   órfãna o histórico de ocorrências sem ganhar nada.
 */

import type {
  UnknownRecord,
  ReportHistory,
  ReportHistoryItem,
} from '@/components/workout/types';
import {
  isObject,
  toNumber,
  safeJsonParse,
  toDateMs,
  averageNumbers,
  extractLogWeight,
  extractLogReps,
  extractLogRpe,
  normalizeExerciseKey,
  DELOAD_HISTORY_SIZE,
  REPORT_HISTORY_LIMIT,
} from '@/components/workout/utils';
import { isRealDeload } from '@/utils/report/sessionDeload';
import { isEnginePrefillOnly, isLogDone } from '@/lib/workout/isLogDone';
import { logError } from '@/lib/logger';

/**
 * Teto de linhas de `workouts` que alimentam o histórico. Reexportado daqui para
 * que quem consome o conversor (inclusive o servidor) leia o MESMO limite que o
 * app — a definição segue única, em `components/workout/utils`.
 */
export { REPORT_HISTORY_LIMIT };

/**
 * `toDateMs` para uso em cadeia de `??`: devolve `null` (e não 0) quando o
 * campo simplesmente não existe. Ver a nota no cálculo do `ts`.
 */
function dataOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const ms = toDateMs(v);
  return ms === null || ms <= 0 ? null : ms;
}

/**
 * Teto de treinos distintos guardados por exercício no cache de histórico.
 *
 * O corte por treino (ver `buildReportHistoryFromWorkouts`) multiplicaria o
 * tamanho do cache pelo número de treinos em que o exercício aparece. Quatro
 * cobre o caso real mais espalhado desta base (Crucifixo invertido vive em três)
 * e mantém o `localStorage` no mesmo patamar.
 */
export const MAX_TREINOS_POR_EXERCICIO = 4;

/**
 * A linha de `workouts` que este conversor lê — o mesmo `select` do app:
 * `id, notes, date, created_at`. Campos extras são ignorados.
 */
export type WorkoutHistoryRow = {
  id?: unknown;
  notes?: unknown;
  date?: unknown;
  created_at?: unknown;
  [key: string]: unknown;
};

export function buildExerciseHistoryEntryFromSessionLogs(
  sessionObj: unknown,
  exIdx: number,
  meta: UnknownRecord,
): ReportHistoryItem | null {
  try {
    const base = isObject(sessionObj) ? sessionObj : null;
    if (!base) return null;
    const logsObj: UnknownRecord = isObject(base.logs) ? (base.logs as UnknownRecord) : {};
    // Coleta sets com índice para manter a ordenção correta. We also
    // capture the raw drop_set.stages so the modal can show per-stage
    // previous weights instead of a single averaged value.
    const indexedSets: Array<{
      setIdx: number;
      weight: number | null;
      reps: number | null;
      rpe: number | null;
      notes: string | null;
      dropStages: Array<{ weight: number | null; reps: number | null }> | null;
      failed: boolean;
    }> = [];
    let hadDeload = false;
    Object.entries(logsObj).forEach(([key, value]) => {
      try {
        const parts = String(key || '').split('-');
        const eIdx = Number(parts[0]);
        const sIdx = Number(parts[1]);
        if (!Number.isFinite(eIdx) || eIdx !== exIdx) return;
        if (!Number.isFinite(sIdx)) return;
        const log = isObject(value) ? value : null;
        if (!log) return;
        const weight = extractLogWeight(log);
        // Unilateral grava reps/rpe por lado (L_reps/R_reps, L_rpe/R_rpe) — os
        // extractors fazem o fallback pelos lados. Não inlinar com `??`: toNumber
        // devolve 0 (não null) para campo ausente e o fallback nunca rodaria.
        const reps = extractLogReps(log);
        const rpe = extractLogRpe(log);
        const notes = typeof log.notes === 'string' && log.notes.trim() ? log.notes.trim() : null;
        // Preserve drop-set per-stage values for this set (if any).
        const dropSet = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : null;
        const dropStagesRaw = dropSet && Array.isArray(dropSet.stages) ? (dropSet.stages as unknown[]) : null;
        const dropStages = dropStagesRaw && dropStagesRaw.length > 0
          ? dropStagesRaw.map((s) => {
              const obj = isObject(s) ? (s as UnknownRecord) : {};
              const w = toNumber(obj.weight ?? null);
              const r = toNumber(obj.reps ?? null);
              return {
                weight: w != null && Number.isFinite(w) && w > 0 ? w : null,
                reps: r != null && Number.isFinite(r) && r > 0 ? r : null,
              };
            })
          : null;
        const hasValues = weight != null || reps != null;
        // Fonte única (lib/workout/isLogDone). A regra "prefill do motor não é
        // série feita" NASCEU aqui e foi promovida para os outros seis lugares
        // que respondiam a mesma pergunta — o relatório dizia 29/30 com uma
        // série feita enquanto este builder já sabia descartar (06/09/2026).
        const done = isLogDone(log);
        if (!done && !hasValues) return;
        // Descarta o PREFILL do próprio motor de carga: peso escrito por ele
        // (weightSource 'auto'), sem nenhuma rep e sem conclusão explícita, é
        // exercício PULADO — não treino executado. Sem esta guarda o prefill
        // entrava no histórico (só o peso já satisfaz `hasValues`), o
        // exercício virava um item com `setReps: null`, e na sessão seguinte
        // o autoload lia esse item, não achava rep nenhuma e concluía "sem
        // histórico" — auto-envenenamento. A regra mora em
        // `lib/workout/isLogDone` (nasceu aqui; hoje é de todos).
        if (isEnginePrefillOnly(log)) return;
        // Série levada à falha. Aceita boolean e a string "true" (o log passa
        // por serialização JSON em workouts.notes e volta como texto).
        const failureRaw = log.failure ?? null;
        const failed = failureRaw === true || String(failureRaw ?? '').toLowerCase() === 'true';
        // Marca a sessão como "teve deload neste exercício". O campo `deload` é
        // gravado por applyDeloadToExercise e, até aqui, nunca era lido por
        // ninguém — então carga reduzida de propósito entrava no histórico como
        // treino normal.
        //
        // ⚠️ A EXISTÊNCIA da marca não basta: exige redução REAL. Até
        // 08/09/2026 bastava o objeto existir (`isObject(log.deload)`), e
        // `pickUsableHistory` descarta do motor de carga toda sessão com
        // `deloadApplied` — de propósito, para não punir quem descarrega.
        // Medido na sessão de 07/09/2026 do dono: pullover (35 → 35 kg) e
        // tríceps corda (37,5 → 37,5), treinados em carga CHEIA mas marcados
        // como descarga de 30 % e 25 %, sumiam do histórico do motor. O
        // melhor sinal disponível ia para o lixo.
        //
        // `isRealDeload` é a fonte única — os PESOS decidem; o percentual
        // anunciado é só o plano (ver `utils/report/sessionDeload`).
        if (isRealDeload(log.deload)) hadDeload = true;
        if (hasValues) {
          indexedSets.push({ setIdx: sIdx, weight, reps, rpe, notes, dropStages, failed });
        }
      } catch { }
    });

    if (!indexedSets.length) return null;
    // Ordena por índice de série para preservar progressão correta
    indexedSets.sort((a, b) => a.setIdx - b.setIdx);
    const sets = indexedSets.map(s => ({ weight: s.weight, reps: s.reps }));
    const weightList = sets
      .map((s) => s.weight)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    const repsList = sets
      .map((s) => s.reps)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    const avgWeight = averageNumbers(weightList);
    const avgReps = averageNumbers(repsList);
    const totalVolume = sets.reduce((acc, s) => {
      const w = Number(s.weight ?? 0);
      const r = Number(s.reps ?? 0);
      if (!Number.isFinite(w) || !Number.isFinite(r)) return acc;
      if (w <= 0 || r <= 0) return acc;
      return acc + w * r;
    }, 0);
    const topWeight = weightList.length ? Math.max(...weightList) : null;
    if (!avgWeight && !avgReps && !totalVolume) return null;
    /**
     * ⚠️ `toDateMs(undefined)` devolve **0**, não `null` (ele converte o valor
     * não-string em `0` e `new Date(0).getTime()` é 0, que é finito). Numa
     * cadeia de `??` isso significa que o PRIMEIRO termo sempre vence: sessão
     * sem `date` no `notes` saía com `ts = 0` — 01/01/1970 — em vez de cair no
     * carimbo da linha, e um item assim nunca vence como "mais recente" e é o
     * primeiro a ser cortado pelos tetos.
     *
     * Medido em produção em 12/09/2026: 703 sessões, **zero** sem `date` — o
     * defeito é latente, não ativo. Corrigido mesmo assim porque agora o painel
     * do professor escolhe a sessão de referência por este `ts`: uma sessão
     * carimbada em 1970 mostraria ao coach o peso errado.
     *
     * `dataOuNulo` só aceita o que é de fato data; `??` volta a funcionar.
     */
    const ts =
      dataOuNulo(base.date) ??
      dataOuNulo(base.completed_at) ??
      dataOuNulo(base.completedAt) ??
      dataOuNulo(meta.date) ??
      dataOuNulo(meta.created_at) ??
      Date.now();
    // Treino de origem — ver `workoutKey` em ReportHistoryItem. Sem isto o
    // histórico do exercício mistura treinos com cargas incomparáveis.
    const workoutKey = normalizeExerciseKey(
      String(meta.name ?? meta.workout_name ?? (base.workout as UnknownRecord | undefined)?.name ?? ''),
    );
    // Build per-set arrays indexed by setIdx (the index the consumer reads
    // with `setWeights[setIdx]`). The previous version filtered out null/0
    // values, which silently shifted later sets down — `setWeights[1]`
    // could end up holding what was actually set 2's weight whenever set 1
    // was logged without a value. Now we keep the slot as null and let the
    // consumer fall back to its own placeholder logic.
    const maxIdx = indexedSets.reduce((acc, s) => Math.max(acc, s.setIdx), -1);
    const setsLen = maxIdx + 1;
    const setWeights: (number | null)[] = Array(setsLen).fill(null);
    const setReps: (number | null)[] = Array(setsLen).fill(null);
    const setRpes: (number | null)[] = Array(setsLen).fill(null);
    const setNotes: (string | null)[] = Array(setsLen).fill(null);
    const dropSetStages: (Array<{ weight: number | null; reps: number | null }> | null)[] = Array(setsLen).fill(null);
    const setFailures: (boolean | null)[] = Array(setsLen).fill(null);
    const isPosNum = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
    for (const s of indexedSets) {
      setWeights[s.setIdx] = isPosNum(s.weight) ? s.weight : null;
      setReps[s.setIdx] = isPosNum(s.reps) ? s.reps : null;
      setRpes[s.setIdx] = isPosNum(s.rpe) ? s.rpe : null;
      setNotes[s.setIdx] = s.notes ?? null;
      dropSetStages[s.setIdx] = s.dropStages ?? null;
      setFailures[s.setIdx] = s.failed ? true : null;
    }
    const hasAnyWeight = setWeights.some(v => v !== null);
    const hasAnyReps = setReps.some(v => v !== null);
    const hasAnyRpe = setRpes.some(v => v !== null);
    const hasAnyNote = setNotes.some(v => v !== null);
    const hasAnyDropStages = dropSetStages.some(v => v !== null);
    const hasAnyFailure = setFailures.some(v => v !== null);
    return {
      ts,
      avgWeight: avgWeight ?? null,
      avgReps: avgReps ?? null,
      totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0,
      topWeight,
      setsCount: sets.length,
      setWeights: hasAnyWeight ? setWeights : null,
      setReps: hasAnyReps ? setReps : null,
      setRpes: hasAnyRpe ? setRpes : null,
      setNotes: hasAnyNote ? setNotes : null,
      dropSetStages: hasAnyDropStages ? dropSetStages : null,
      setFailures: hasAnyFailure ? setFailures : null,
      deloadApplied: hadDeload ? true : undefined,
      workoutKey: workoutKey || undefined,
    };
  } catch (e) {
    logError('hook:useWorkoutDeload.buildHistoryEntry', e);
    return null;
  }
}

/**
 * Agrupa as linhas de `workouts` por exercício.
 *
 * Aceita `unknown` de propósito: o `notes` vem como TEXT do banco e a sessão
 * inteira mora lá — linha malformada não pode derrubar o histórico dos outros.
 */
export function buildReportHistoryFromWorkouts(rows: unknown): ReportHistory {
  try {
    const list: unknown[] = Array.isArray(rows) ? rows : [];
    const next: ReportHistory = { version: 1, exercises: {} };
    list.forEach((row) => {
      const rowObj = isObject(row) ? row : null;
      if (!rowObj) return;
      const sessionObj = safeJsonParse(rowObj.notes);
      if (!isObject(sessionObj)) return;
      const rawExercises = (sessionObj as UnknownRecord).exercises;
      const exercisesArr: unknown[] = Array.isArray(rawExercises) ? rawExercises : [];
      if (!exercisesArr.length) return;
      exercisesArr.forEach((ex, exIdx) => {
        const exObj = isObject(ex) ? ex : null;
        const name = String(exObj?.name || '').trim();
        if (!name) return;
        const key = normalizeExerciseKey(name);
        if (!key) return;
        const entry = buildExerciseHistoryEntryFromSessionLogs(sessionObj, exIdx, rowObj);
        if (!entry) return;
        const prev = next.exercises[key] ?? { name, items: [] };
        next.exercises[key] = { name, items: [...prev.items, { ...entry, name }] };
      });
    });
    Object.keys(next.exercises).forEach((key) => {
      const ex = next.exercises[key];
      const items: ReportHistoryItem[] = Array.isArray(ex?.items) ? ex.items : [];
      const validos = items
        .filter((it): it is ReportHistoryItem => !!it && typeof it.ts === 'number')
        .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
      // Corta as últimas N sessões POR TREINO, não no total.
      //
      // O corte global vinha ANTES do filtro por `workoutKey`, então exercício
      // que alterna entre dois treinos (Panturrilha do dono: SEG · Upper B e
      // SEX · Pump) nunca juntava as DELOAD_HISTORY_MIN sessões do treino
      // corrente — não gerava alerta e nunca era oferecido para descarga.
      // Guardar 6 de cada resolve sem inchar o cache: o teto total continua.
      const porTreino = new Map<string, ReportHistoryItem[]>();
      for (const it of validos) {
        const wk = String(it.workoutKey ?? '');
        const lista = porTreino.get(wk) ?? [];
        lista.push(it);
        porTreino.set(wk, lista);
      }
      const ordered = [...porTreino.values()]
        .flatMap((lista) => lista.slice(-DELOAD_HISTORY_SIZE))
        .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0))
        .slice(-DELOAD_HISTORY_SIZE * MAX_TREINOS_POR_EXERCICIO);
      next.exercises[key] = { ...ex, items: ordered };
    });
    return next;
  } catch (e) {
    logError('hook:useWorkoutDeload.buildReportHistory', e);
    return { version: 1, exercises: {} };
  }
}
