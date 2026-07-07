import React from 'react';
import { Trash2, Plus, Link2, Play, ChevronDown } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import { WorkoutHeader } from './ExerciseEditor/EditorHeader';
import { CardioFields, CARDIO_OPTIONS } from './ExerciseEditor/CardioFields';
import { SetDetailsSection } from './ExerciseEditor/SetDetailsSection';
import type { AdvancedConfig, SetDetail, Exercise, Workout } from './ExerciseEditor/types';
import { useExerciseEditorLogic } from '@/hooks/useExerciseEditorLogic';
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical';

const REST_PAUSE_DEFAULT_PAUSE_SEC = 20;


interface ExerciseEditorProps {
    workout: Workout;
    onSave?: (workout: Workout) => Promise<unknown>;
    onCancel?: () => void;
    onChange?: (workout: Workout) => void;
    onSaved?: () => void;
}

const ExerciseEditor: React.FC<ExerciseEditorProps> = ({ workout, onSave, onCancel, onChange, onSaved }) => {
    useDialog();
    const [saving, setSaving] = React.useState(false);
    // Override explícito do usuário pra abrir/fechar a lista de "séries por série".
    // Efetivo = override[key] ?? (tem customização). Assim o caso comum nasce
    // recolhido (mata a duplicação visual) sem esconder dados personalizados.
    const [seriesOpen, setSeriesOpen] = React.useState<Record<string, boolean>>({});

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const normalizeMethod = React.useCallback((method: unknown) => {
        const raw = String(method || '').trim();
        const lower = raw.toLowerCase();
        if (!raw) return 'Normal';
        if (lower === 'warm-up' || lower === 'warm_up' || lower === 'warmup') return 'Normal';
        if (lower === 'drop-set' || lower === 'drop set' || lower === 'dropset') return 'Drop-set';
        if (lower === 'rest-pause' || lower === 'rest pause' || lower === 'restpause') return 'Rest-Pause';
        if (lower === 'bi-set' || lower === 'bi set' || lower === 'biset') return 'Bi-Set';
        if (lower === 'cluster' || lower === 'cluster set' || lower === 'clusterset') return 'Cluster';
        if (lower === 'cardio') return 'Cardio';
        return raw;
    }, []);

    const buildDefaultSetDetail = React.useCallback((exercise: Exercise, setNumber: number): SetDetail => {
        const reps = (exercise?.reps ?? '')
        const rpeNum = Number(exercise?.rpe)
        return {
            set_number: setNumber,
            reps: reps === '' ? null : String(reps),
            rpe: Number.isFinite(rpeNum) ? rpeNum : null,
            weight: null,
            is_warmup: false,
            advanced_config: null
        };
    }, []);

    const ensureSetDetails = React.useCallback((exercise: Exercise, desiredCount: number) => {
        const existing = Array.isArray(exercise?.setDetails) ? exercise.setDetails : [];
        const next: SetDetail[] = [];
        for (let i = 0; i < desiredCount; i++) {
            const setNumber = i + 1;
            const current = existing[i];
            next.push({
                ...buildDefaultSetDetail(exercise, setNumber),
                ...(current && typeof current === 'object' ? current : null),
                set_number: (current?.set_number ?? setNumber)
            });
        }
        return next;
    }, [buildDefaultSetDetail]);

    React.useEffect(() => {
        if (!Array.isArray(workout?.exercises)) return;
        const validExercises = workout.exercises.filter(e => e && typeof e === 'object');
        if (validExercises.length !== workout.exercises.length) {
            onChange?.({ ...workout, exercises: validExercises });
        }
    }, [workout, onChange]);
    React.useEffect(() => {
        if (!Array.isArray(workout?.exercises)) return;
        let changed = false;
        const nextExercises = workout.exercises.map((ex) => {
            if (!ex || typeof ex !== 'object') return ex;

            const existingDetailsRaw = Array.isArray(ex?.setDetails) ? ex.setDetails : [];
            const setsFromField = Math.max(0, parseInt(String(ex?.sets)) || 0);
            const setsFromDetails = Array.isArray(existingDetailsRaw) ? existingDetailsRaw.length : 0;
            const desiredCount = Math.max(setsFromField, setsFromDetails);
            if (!desiredCount) return ex;

            const nextDetails = ensureSetDetails(ex, desiredCount);
            let next = ex;

            if (setsFromField !== desiredCount || ex?.sets === '' || ex?.sets == null) {
                next = { ...next, sets: desiredCount };
                changed = true;
            }

            const detailsString = JSON.stringify(existingDetailsRaw || []);
            const nextDetailsString = JSON.stringify(nextDetails || []);
            if (detailsString !== nextDetailsString) {
                next = { ...next, setDetails: nextDetails };
                changed = true;
            }

            const method = normalizeMethod(next?.method);
            if (method !== 'Rest-Pause') return next;

            const findRpConfig = () => {
                for (const s of nextDetails) {
                    const cfg = s?.advanced_config ?? s?.advancedConfig ?? null;
                    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
                    const hasAny =
                        Object.prototype.hasOwnProperty.call(cfg, 'initial_reps') ||
                        Object.prototype.hasOwnProperty.call(cfg, 'mini_sets') ||
                        Object.prototype.hasOwnProperty.call(cfg, 'rest_time_sec');
                    if (hasAny) return cfg;
                }
                return null;
            };

            const template = findRpConfig();
            const repsNum = Number.parseInt(String(next?.reps ?? ''), 10);
            const fallbackTemplate = {
                initial_reps: Number.isFinite(repsNum) ? repsNum : null,
                mini_sets: null as number | null,
                rest_time_sec: REST_PAUSE_DEFAULT_PAUSE_SEC,
            };

            const rp = (template || fallbackTemplate) as AdvancedConfig;

            const propagated = nextDetails.map((s) => {
                const cfg = s?.advanced_config ?? s?.advancedConfig ?? null;
                const baseCfg = cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {};
                const nextCfg: AdvancedConfig = {
                    ...baseCfg,
                    initial_reps: baseCfg?.initial_reps ?? rp.initial_reps,
                    mini_sets: baseCfg?.mini_sets ?? rp.mini_sets,
                    rest_time_sec: baseCfg?.rest_time_sec ?? rp.rest_time_sec,
                };
                return { ...s, advanced_config: nextCfg };
            });

            const propagatedString = JSON.stringify(propagated || []);
            if (propagatedString !== nextDetailsString) {
                next = { ...next, setDetails: propagated };
                changed = true;
            }

            return next;
        });

        if (!changed) return;
        onChange?.({ ...workout, exercises: nextExercises });
    }, [ensureSetDetails, normalizeMethod, workout, onChange]);
    // ── All handlers via hook ───────────────────────────────────────────────
    const {
        getExerciseType,
        updateSetDetail,
        updateExercise,
        removeExercise,
        handleCancel,
        addExercise,
        toggleExerciseType,
        toggleBiSetWithNext,
        handleImportJson,
        handleSave,
    } = useExerciseEditorLogic({
        workout,
        onSave, onCancel, onChange, onSaved,
        saving, setSaving,
        fileInputRef: fileInputRef as React.RefObject<HTMLInputElement>,
        normalizeMethod, buildDefaultSetDetail, ensureSetDetails,
    });

    const handleImportJsonClick = () => fileInputRef.current?.click();

    if (!workout) return null;

    return (
        <div className="h-full flex flex-col bg-depth-0">
            <WorkoutHeader
                saving={saving}
                fileInputRef={fileInputRef}
                onSave={handleSave}
                onCancel={handleCancel}
                onImportJsonClick={handleImportJsonClick}
                onImportJson={handleImportJson}
            />

            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
                {/* Nome do treino */}
                <div>
                    <label htmlFor="workout-title" className="block text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2">
                        Nome do Treino
                    </label>
                    <input
                        id="workout-title"
                        aria-label="Nome do Treino"
                        value={workout.title || ''}
                        onChange={e => onChange?.({ ...workout, title: e.target.value })}
                        className="w-full bg-depth-1 text-xl font-black p-4 rounded-2xl border border-white/[0.06] outline-none focus:border-yellow-500/60 text-white placeholder-neutral-700 transition-colors"
                        placeholder="Ex: Treino A - Peito e Tríceps"
                    />
                </div>

                {/* Lista de exercícios */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">Exercícios</p>
                        <span className="text-[11px] font-black text-neutral-500 tabular-nums">{workout.exercises?.length || 0}</span>
                    </div>

                    {(workout.exercises || []).map((exercise, index) => {
                        if (!exercise) return null;
                        const exerciseType = getExerciseType(exercise);
                        const safeMethod = normalizeMethod(exercise?.method);
                        const prev = (workout.exercises || [])[index - 1];
                        const linkedFromPrev = normalizeMethod(prev?.method) === 'Bi-Set';
                        const hasNext = index < ((workout.exercises || []).length - 1);
                        const isBiSet = safeMethod === 'Bi-Set';
                        const nextExercise = hasNext ? (workout.exercises || [])[index + 1] : null;
                        const nextType = nextExercise ? getExerciseType(nextExercise) : null;
                        const canShowLinkButton = hasNext && exerciseType !== 'cardio' && nextType !== 'cardio';
                        const setsFromField = Math.max(0, parseInt(String(exercise?.sets)) || 0);
                        const setsFromDetails = Array.isArray(exercise?.setDetails) ? exercise.setDetails.length : 0;
                        const setsCount = Math.max(setsFromField, setsFromDetails);
                        const setDetails = ensureSetDetails(exercise, setsCount);

                        // Key estável: prioriza id do exercício; fallback combina nome + index pra
                        // não perder identidade ao reordenar. `index` puro causava foco "pular" entre
                        // inputs ao arrastar exercícios.
                        const stableKey = String(
                            (exercise as { id?: string; _itx_exKey?: string })?.id
                            ?? (exercise as { _itx_exKey?: string })?._itx_exKey
                            ?? `${exercise?.name || 'ex'}-${index}`
                        );

                        // Canônico (só força) e detecção de séries customizadas — dirige o
                        // default recolhido/expandido da lista "séries por série".
                        const canonicalInfo = exerciseType !== 'cardio'
                            ? resolveCanonicalExerciseName(exercise.name || '')
                            : null;
                        const hasCustomSeries = setDetails.some((s) =>
                            !!(s?.is_warmup ?? s?.isWarmup) ||
                            (s?.advanced_config ?? s?.advancedConfig) != null ||
                            s?.weight != null ||
                            (s?.reps != null && String(s.reps) !== String(exercise?.reps ?? ''))
                        );
                        const seriesExpanded = seriesOpen[stableKey] ?? hasCustomSeries;
                        const toggleSeries = () => setSeriesOpen((prevState) => ({ ...prevState, [stableKey]: !seriesExpanded }));

                        return (
                            <React.Fragment key={stableKey}>
                                <div
                                    className={`bg-depth-1 border border-white/[0.06] p-4 relative transition-colors hover:border-white/10 ${linkedFromPrev ? '-mt-4 rounded-t-none border-t-0' : 'rounded-2xl'} ${isBiSet && hasNext ? 'rounded-b-none' : ''}`}
                                >
                                    {(isBiSet || linkedFromPrev) && (
                                        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 bg-yellow-500/40" />
                                    )}

                                    {/* Cabeçalho: índice + identidade + ações */}
                                    <div className="flex items-start gap-3">
                                        <div className="shrink-0 h-9 w-9 rounded-xl bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center text-sm font-black text-yellow-500 tabular-nums">
                                            {index + 1}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {exerciseType === 'cardio' ? (
                                                <>
                                                    <span className="block text-[10px] text-neutral-500 uppercase font-black tracking-wider mb-1">Modalidade</span>
                                                    <select
                                                        aria-label="Modalidade"
                                                        value={exercise.name || ''}
                                                        onChange={e => updateExercise(index, 'name', e.target.value)}
                                                        className="w-full bg-depth-2 font-black text-white text-lg px-3 py-2.5 rounded-xl border border-white/[0.06] outline-none focus:border-amber-500/60 transition-colors appearance-none"
                                                    >
                                                        {CARDIO_OPTIONS.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                </>
                                            ) : (
                                                <input
                                                    aria-label="Nome do exercício"
                                                    value={exercise.name || ''}
                                                    onChange={e => updateExercise(index, 'name', e.target.value)}
                                                    className="w-full bg-transparent font-black text-white text-lg border-b border-white/[0.06] pb-2 focus:border-yellow-500/60 outline-none placeholder-neutral-700 transition-colors"
                                                    placeholder="Nome do exercício"
                                                />
                                            )}
                                        </div>

                                        <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                                            <button
                                                onClick={() => toggleExerciseType(index, exerciseType)}
                                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors ${exerciseType === 'cardio'
                                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                                                    : 'bg-white/[0.04] text-neutral-400 border-white/[0.08] hover:border-white/20'
                                                    }`}
                                            >
                                                {exerciseType === 'cardio' ? 'Cardio' : 'Força'}
                                            </button>
                                            {isBiSet && hasNext && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleBiSetWithNext(index)}
                                                    className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-yellow-500/30 text-yellow-500 hover:text-yellow-400 hover:border-yellow-500/50 bg-yellow-500/10 transition-colors"
                                                    title="Deslinkar do próximo"
                                                >
                                                    Deslinkar
                                                </button>
                                            )}
                                            <button
                                                onClick={() => removeExercise(index)}
                                                aria-label="Remover exercício"
                                                className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {canonicalInfo?.changed && canonicalInfo?.canonical && (
                                        <button
                                            type="button"
                                            onClick={() => updateExercise(index, 'name', canonicalInfo.canonical)}
                                            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/25 text-yellow-500 font-black text-xs hover:bg-yellow-500/15 transition-colors"
                                        >
                                            Padronizar: {canonicalInfo.canonical}
                                        </button>
                                    )}

                                    <div className="mt-4 space-y-3">
                                        {/* Parâmetros primários */}
                                        <div className="grid grid-cols-3 gap-2.5">
                                            <div>
                                                <span className="block text-[10px] text-neutral-400 uppercase font-black tracking-wider text-center mb-1.5">Sets</span>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        aria-label="Número de sets"
                                                        type="number"
                                                        value={setsCount || ''}
                                                        onChange={e => updateExercise(index, 'sets', e.target.value)}
                                                        className="w-full bg-depth-2 border border-white/[0.06] rounded-xl px-2 py-2.5 text-center text-base font-black text-white outline-none focus:border-yellow-500/60 transition-colors"
                                                    />
                                                    <button
                                                        onClick={() => updateExercise(index, 'duplicate', true)}
                                                        className="shrink-0 h-10 w-10 bg-white/[0.04] border border-white/[0.06] hover:bg-yellow-500 hover:text-black hover:border-yellow-500 text-neutral-400 rounded-xl flex items-center justify-center transition-colors"
                                                        title="Duplicar Série"
                                                        aria-label="Duplicar série"
                                                    >
                                                        <Plus size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] text-neutral-400 uppercase font-black tracking-wider text-center mb-1.5">Reps</span>
                                                <input
                                                    aria-label="Repetições"
                                                    type="text"
                                                    value={exercise.reps ? String(exercise.reps) : ''}
                                                    onChange={e => updateExercise(index, 'reps', e.target.value)}
                                                    className="w-full bg-depth-2 border border-white/[0.06] rounded-xl px-2 py-2.5 text-center text-base font-black text-white outline-none focus:border-yellow-500/60 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-yellow-500 uppercase font-black tracking-wider text-center mb-1.5 flex items-center justify-center gap-1">
                                                    RPE
                                                    <HelpHint title={HELP_TERMS.rpe.title} text={HELP_TERMS.rpe.text} tooltip={HELP_TERMS.rpe.tooltip} className="h-4 w-4 text-[10px]" />
                                                </span>
                                                <input
                                                    aria-label="RPE"
                                                    type="number"
                                                    value={exercise.rpe ? String(exercise.rpe) : ''}
                                                    onChange={e => updateExercise(index, 'rpe', e.target.value)}
                                                    className="w-full bg-depth-2 border border-white/[0.06] rounded-xl px-2 py-2.5 text-center text-base font-black text-yellow-500 outline-none focus:border-yellow-500/60 placeholder-yellow-500/30 transition-colors"
                                                    placeholder="8"
                                                />
                                            </div>
                                        </div>

                                        {/* Parâmetros secundários — recolhidos num plano mais fundo */}
                                        <div className="grid grid-cols-3 gap-2.5 rounded-xl bg-black/20 p-2.5">
                                            <div>
                                                <span className="block text-[10px] text-neutral-500 uppercase font-black tracking-wider text-center mb-1.5">Rest(s)</span>
                                                <input
                                                    aria-label="Descanso em segundos"
                                                    type="number"
                                                    value={(exercise.restTime ?? '')}
                                                    onChange={e => updateExercise(index, 'restTime', e.target.value)}
                                                    className="w-full bg-depth-1 border border-white/[0.06] rounded-lg px-2 py-2 text-center text-sm font-bold text-neutral-200 outline-none focus:border-yellow-500/60 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-neutral-500 uppercase font-black tracking-wider text-center mb-1.5 flex items-center justify-center gap-1">
                                                    Cad
                                                    <HelpHint title={HELP_TERMS.cadence.title} text={HELP_TERMS.cadence.text} tooltip={HELP_TERMS.cadence.tooltip} className="h-4 w-4 text-[10px]" />
                                                </span>
                                                <input
                                                    aria-label="Cadência"
                                                    type="text"
                                                    value={exercise.cadence || ''}
                                                    onChange={e => updateExercise(index, 'cadence', e.target.value)}
                                                    className="w-full bg-depth-1 border border-white/[0.06] rounded-lg px-2 py-2 text-center text-sm font-bold text-neutral-200 outline-none focus:border-yellow-500/60 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-neutral-500 uppercase font-black tracking-wider text-center mb-1.5 flex items-center justify-center gap-1">
                                                    Método
                                                    {(() => {
                                                        const m = String(safeMethod || 'Normal');
                                                        const term =
                                                            m === 'Drop-set'
                                                                ? HELP_TERMS.dropSet
                                                                : m === 'Rest-Pause'
                                                                    ? HELP_TERMS.restPause
                                                                    : m === 'Cluster'
                                                                        ? HELP_TERMS.cluster
                                                                        : m === 'Bi-Set'
                                                                            ? HELP_TERMS.biSet
                                                                            : null;
                                                        return term ? <HelpHint title={term.title} text={term.text} tooltip={term.tooltip} className="h-4 w-4 text-[10px]" /> : null;
                                                    })()}
                                                </span>
                                                <select
                                                    aria-label="Método de treino"
                                                    value={safeMethod || 'Normal'}
                                                    onChange={e => updateExercise(index, 'method', e.target.value)}
                                                    className="w-full bg-depth-1 border border-white/[0.06] rounded-lg px-1 py-2 text-center text-[11px] font-bold text-neutral-200 h-[38px] outline-none focus:border-yellow-500/60 transition-colors appearance-none"
                                                >
                                                    <option value="Normal">Normal</option>
                                                    <option value="Drop-set">Drop</option>
                                                    <option value="Rest-Pause">Rest-P</option>
                                                    <option value="Bi-Set">Bi-Set</option>
                                                    <option value="Cluster">Cluster</option>
                                                </select>
                                            </div>
                                        </div>

                                        {exerciseType === 'cardio' ? (
                                            <CardioFields
                                                exercise={exercise}
                                                setDetails={setDetails}
                                                onUpdateExercise={(field, value) => updateExercise(index, field, value)}
                                                onUpdateSetDetail={(setIdx, patch) => updateSetDetail(index, setIdx, patch)}
                                            />
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <div className="flex items-center justify-between gap-3 mb-1.5">
                                                        <span className="text-[10px] text-neutral-500 uppercase font-black tracking-wider">Vídeo (URL)</span>
                                                        {String(exercise.videoUrl || '').trim() ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    try {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                    } catch { }
                                                                    try {
                                                                        window.open(String(exercise.videoUrl || '').trim(), '_blank', 'noopener,noreferrer');
                                                                    } catch { }
                                                                }}
                                                                className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-[11px] font-black transition-colors"
                                                                title="Ver vídeo"
                                                            >
                                                                <Play size={13} />
                                                                Ver vídeo
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <input
                                                        aria-label="URL do vídeo de demonstração"
                                                        value={exercise.videoUrl || ''}
                                                        onChange={e => updateExercise(index, 'videoUrl', e.target.value)}
                                                        className="w-full bg-depth-2 border border-white/[0.06] rounded-xl px-3 py-2.5 text-xs text-neutral-200 focus:border-amber-500/50 outline-none placeholder-neutral-700 transition-colors"
                                                        placeholder="https://youtube.com/..."
                                                    />
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] text-neutral-500 uppercase font-black tracking-wider mb-1.5">Notas</span>
                                                    <textarea
                                                        aria-label="Notas do exercício"
                                                        value={exercise.notes || ''}
                                                        onChange={e => updateExercise(index, 'notes', e.target.value)}
                                                        className="w-full bg-depth-2 border border-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-yellow-500/60 min-h-[60px] resize-none transition-colors"
                                                        placeholder="Dicas de execução..."
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {setsCount > 0 && exerciseType !== 'cardio' && (
                                            <div className="rounded-xl bg-black/20 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={toggleSeries}
                                                    aria-expanded={seriesExpanded}
                                                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
                                                >
                                                    <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                        Séries por série
                                                        {hasCustomSeries && <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" title="Séries personalizadas" />}
                                                    </span>
                                                    <span className="flex items-center gap-2 text-[10px] font-black text-neutral-500 tabular-nums">
                                                        {setDetails.length}
                                                        <ChevronDown size={14} className={`transition-transform duration-200 ${seriesExpanded ? 'rotate-180' : ''}`} />
                                                    </span>
                                                </button>
                                                {seriesExpanded && (
                                                    <div className="px-2 pb-2 expand-enter">
                                                        <SetDetailsSection
                                                            setDetails={setDetails}
                                                            safeMethod={safeMethod}
                                                            exerciseIndex={index}
                                                            exerciseName={exercise.name || ''}
                                                            onUpdateSetDetail={updateSetDetail}
                                                            hideHeader
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {isBiSet && hasNext && (
                                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-depth-3 border border-yellow-500/30 rounded-full px-3 py-1 flex items-center gap-2 z-20 shadow-lg">
                                            <Link2 size={14} className="text-yellow-500" />
                                            <span className="text-[10px] text-neutral-200 font-black tracking-wider">BI-SET</span>
                                        </div>
                                    )}
                                </div>

                                {canShowLinkButton && !isBiSet && (
                                    <div className="flex justify-center -mt-4 -mb-4 relative z-10">
                                        <button
                                            type="button"
                                            onClick={() => toggleBiSetWithNext(index)}
                                            className="my-3 inline-flex items-center gap-2 px-4 py-2 bg-depth-2 border border-white/[0.08] rounded-full text-xs font-black text-neutral-300 hover:text-white hover:border-yellow-500/40 transition-colors min-h-[44px]"
                                            title="Linkar com próximo (Bi-set)"
                                        >
                                            <Link2 size={16} className="text-yellow-500" />
                                            <span>Linkar com Próximo</span>
                                        </button>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                <button
                    onClick={addExercise}
                    className="w-full py-4 rounded-2xl border-2 border-dashed border-white/[0.08] text-neutral-400 font-black hover:border-yellow-500/40 hover:text-yellow-500 hover:bg-yellow-500/[0.03] transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                    <Plus size={20} /> Adicionar Exercício
                </button>
            </div>
        </div>
    );
};

export default ExerciseEditor;
