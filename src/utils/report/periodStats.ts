/**
 * periodStats — os agregados do relatório de período de TREINO, puros.
 *
 * Saiu de dentro de `useHistoryPeriodReport` em 02/09/2026 porque o DOSSIÊ
 * (treinos + dieta + exames + avaliações) precisa exatamente destes números,
 * e uma segunda conta para "volume do mês" seria a próxima divergência entre
 * duas telas — a classe de bug mais repetida deste repo. O hook continua
 * chamando esta função; o dossiê chama a mesma.
 */

import type { PeriodStats } from '@/types/workout';
import { WorkoutSummary, isRecord, RawSessionObjectSchema } from '@/components/historyListTypes';
import { toDateMs, calculateTotalVolumeFromLogs } from '@/components/history/hooks/useHistoryData';
import { setVolume, setTopWeightReps } from '@/utils/report/setVolume';
import { buildPeriodSessionDetails, type PeriodSessionDetail } from '@/utils/report/periodSessionDetails';
import { brtDateKey } from '@/utils/cron/dateBrt';
import { countDoneSets, countsAsWorkoutFromSummary } from '@/lib/workout/countsAsWorkout';

export const REPORT_DAYS_WEEK = 7;
export const REPORT_DAYS_MONTH = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_SESSIONS_LIMIT = 30;
const TOP_EXERCISES_LIMIT = 5;

export function buildPeriodStats(
historyItems: WorkoutSummary[],
days: unknown,
listOverride?: WorkoutSummary[],
): { stats: PeriodStats; sessions: PeriodSessionDetail[] } | null {
    try {
        const historyList = Array.isArray(listOverride) ? listOverride : (Array.isArray(historyItems) ? historyItems : []);
        const daysNumber = Number(days);
        if (!Number.isFinite(daysNumber) || daysNumber <= 0) return null;
        const cutoff = Date.now() - daysNumber * DAY_MS;
        // O MESMO piso do card de resumo (`countsAsWorkoutFromSummary`): sem
        // ele o dossiê dizia "7 treinos" ao lado de um card que dizia 6 — a
        // sessão de 44 s com uma série entrava aqui e não lá (visto na tela,
        // 02/09/2026). A regra do CLAUDE.md é que o piso vale onde o usuário LÊ.
        const list = historyList.filter((s) => {
            const t = toDateMs(s?.dateMs) ?? toDateMs(s?.date);
            if (!(Number.isFinite(t) && t !== null && t >= cutoff)) return false;
            const rawParsed = RawSessionObjectSchema.safeParse(s?.rawSession);
            const doneSets = rawParsed.success && rawParsed.data?.logs
                ? countDoneSets(rawParsed.data as Parameters<typeof countDoneSets>[0])
                : Number((s as { doneSets?: unknown })?.doneSets) || 0;
            return countsAsWorkoutFromSummary({ doneSets, totalTimeSeconds: s?.totalTime });
        });
        if (!list.length) return null;

        const totalSeconds = list.reduce((acc, s) => acc + (Number(s?.totalTime) || 0), 0);
        const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
        const count = list.length;
        const avgMinutes = count > 0 ? Math.max(0, Math.round(totalMinutes / count)) : 0;
        let totalVolumeKg = 0, totalSets = 0, totalReps = 0;
        const uniqueDays = new Set<string>();
        const exerciseMap = new Map<string, { name: string; sets: number; reps: number; volumeKg: number; sessions: Set<string> }>();
        const sessionSummaries: Array<{ date: unknown; minutes: number; volumeKg: number }> = [];
        const detailSources: Array<{ date: unknown; totalTime: unknown; title: unknown; logs: unknown; exercises: unknown }> = [];

        list.forEach((item) => {
            const rawParsed = RawSessionObjectSchema.safeParse(item?.rawSession);
            const raw = rawParsed.success ? rawParsed.data : null;
            const logs = raw?.logs ?? {};
            const exercises: unknown[] = Array.isArray(raw?.exercises) ? raw.exercises : [];
            const v = calculateTotalVolumeFromLogs(logs);
            const safeVolume = Number.isFinite(v) && v > 0 ? v : 0;
            if (safeVolume > 0) totalVolumeKg += safeVolume;
            const dateValue = item?.date ?? raw?.date ?? item?.created_at ?? null;
            let dayKey = '';
            try {
                const t = toDateMs(dateValue);
                // O dia é o do USUÁRIO, não o do servidor. Era
                // `toISOString().slice(0,10)` — dia UTC —, então todo treino
                // depois das 21h BRT contava no dia SEGUINTE: "dias
                // treinados" e "consistência" saíam inflados no relatório
                // que a pessoa manda ao professor. É a mesma classe já
                // corrigida no streak (5,7% das sessões caíam em dia
                // divergente) e no heatmap de nutrição.
                if (Number.isFinite(t) && t !== null) { dayKey = brtDateKey(t); if (dayKey) uniqueDays.add(dayKey); }
            } catch { }
            const sessionMinutes = Math.max(0, Math.round((Number(item?.totalTime ?? raw?.totalTime) || 0) / 60));
            sessionSummaries.push({ date: dateValue, minutes: sessionMinutes, volumeKg: Math.max(0, Math.round(safeVolume || 0)) });
            detailSources.push({
                date: dateValue,
                totalTime: item?.totalTime ?? raw?.totalTime ?? 0,
                title: raw?.workoutTitle ?? item?.title ?? item?.name ?? '',
                logs,
                exercises,
            });
            Object.entries(logs || {}).forEach(([key, log]) => {
                if (!isRecord(log)) return;
                // setTopWeightReps/setVolume tratam unilateral (L_/R_).
                const { weight: w, reps: r } = setTopWeightReps(log);
                if (w <= 0 || r <= 0) return;
                const vol = setVolume(log);
                totalSets += 1; totalReps += r;
                const exIdx = Number.parseInt(String(key || '').split('-')[0] || '', 10);
                const ex = Number.isFinite(exIdx) ? exercises?.[exIdx] : null;
                const name = String(isRecord(ex) ? (ex.name ?? '') : '').trim() || 'Exercício';
                const current = exerciseMap.get(name) || { name, sets: 0, reps: 0, volumeKg: 0, sessions: new Set<string>() };
                current.sets += 1; current.reps += r; current.volumeKg += vol;
                if (dayKey) current.sessions.add(dayKey);
                exerciseMap.set(name, current);
            });
        });

        const avgVolumeKg = count > 0 ? Math.max(0, Math.round(totalVolumeKg / count)) : 0;
        const exercisesList = Array.from(exerciseMap.values())
            .map(item => ({ name: String(item?.name || '').trim(), sets: Number(item?.sets) || 0, reps: Number(item?.reps) || 0, volumeKg: Math.max(0, Math.round(Number(item?.volumeKg) || 0)), sessionsCount: item?.sessions ? item.sessions.size : 0 }))
            .filter(item => item.name);
        const topExercisesByVolume = [...exercisesList].sort((a, b) => (b.volumeKg || 0) - (a.volumeKg || 0)).slice(0, TOP_EXERCISES_LIMIT);
        const topExercisesByFrequency = [...exercisesList].sort((a, b) => (b.sessionsCount || 0) - (a.sessionsCount || 0) || (b.sets || 0) - (a.sets || 0)).slice(0, TOP_EXERCISES_LIMIT);

        return {
            stats: {
                days: daysNumber, count, totalMinutes, avgMinutes,
                totalVolumeKg: Math.max(0, Math.round(totalVolumeKg)), avgVolumeKg,
                totalSets, totalReps, uniqueDaysCount: uniqueDays.size,
                topExercisesByVolume, topExercisesByFrequency,
                sessionSummaries: sessionSummaries.slice(0, PERIOD_SESSIONS_LIMIT),
            },
            // Sem `slice`: o arquivo é o registro do período INTEIRO. O teto de
            // `sessionSummaries` existe por causa do payload da IA, e o detalhe
            // não passa por lá.
            sessions: buildPeriodSessionDetails(detailSources),
        };
    } catch { return null; }
}
