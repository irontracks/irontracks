import { setVolume, setBestE1rm, setTopWeightReps, isWorkingSet } from '@/utils/report/setVolume';
import { normalizeExerciseName } from '@/utils/normalizeExerciseName';

/**
 * Evolução de carga por exercício, a partir das sessões concluídas (o JSON de
 * `workouts.notes` já parseado). Reusa a fonte única de verdade de carga/volume
 * (`setVolume`/`setBestE1rm`/`setTopWeightReps`/`isWorkingSet`) — nada de recalcular à mão.
 *
 * Por sessão, para cada exercício (índice do array `exercises`, casado com a chave
 * "exIdx-setIdx" do `logs`), agrega SÓ as séries de trabalho concluídas: o melhor 1RM
 * estimado do dia (Epley), o volume total e a maior carga. Cruza sessões pelo NOME
 * normalizado (o índice muda entre treinos). Só devolve exercícios com >= 2 pontos — sem
 * dois pontos não há "evolução" pra mostrar.
 */

export interface LoadSessionInput {
    date?: string | null;
    logs?: Record<string, unknown> | null;
    exercises?: Array<{ name?: string | null } | null> | null;
}

export interface LoadPoint {
    date: string;
    e1rm: number;
    volume: number;
    topWeight: number;
}

export interface LoadSeries {
    exercise: string;
    points: LoadPoint[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function buildLoadEvolution(sessions: LoadSessionInput[]): LoadSeries[] {
    const map = new Map<string, { display: string; points: LoadPoint[] }>();

    for (const s of Array.isArray(sessions) ? sessions : []) {
        if (!s || typeof s !== 'object') continue;
        const date = String(s.date || '').trim();
        if (!date) continue;
        const exercises = Array.isArray(s.exercises) ? s.exercises : [];
        const logs = s.logs && typeof s.logs === 'object' ? s.logs : {};
        const entries = Object.entries(logs);

        for (let exIdx = 0; exIdx < exercises.length; exIdx += 1) {
            const name = String(exercises[exIdx]?.name || '').trim();
            if (!name) continue;

            let bestE1rm = 0;
            let volume = 0;
            let topWeight = 0;
            let hasWorking = false;

            for (const [key, log] of entries) {
                if (Number(String(key).split('-')[0]) !== exIdx) continue;
                if (!isWorkingSet(log)) continue;
                hasWorking = true;
                bestE1rm = Math.max(bestE1rm, setBestE1rm(log));
                volume += setVolume(log);
                topWeight = Math.max(topWeight, setTopWeightReps(log).weight || 0);
            }

            // Sem série de trabalho com carga registrada → não é ponto de evolução.
            if (!hasWorking || (bestE1rm <= 0 && volume <= 0)) continue;

            const norm = normalizeExerciseName(name);
            const entry = map.get(norm) || { display: name, points: [] };
            entry.points.push({ date, e1rm: round1(bestE1rm), volume: round1(volume), topWeight: round1(topWeight) });
            map.set(norm, entry);
        }
    }

    const series: LoadSeries[] = [];
    for (const { display, points } of map.values()) {
        points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        if (points.length >= 2) series.push({ exercise: display, points });
    }
    // Mais treinados primeiro (mais pontos), depois alfabético.
    series.sort((a, b) => b.points.length - a.points.length || a.exercise.localeCompare(b.exercise));
    return series;
}
