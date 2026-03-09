import React from 'react';
import { Trash2, Plus, ArrowLeft, Link2, Play } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { parseExerciseNotesToSetOverrides } from '@/utils/training/notesMethodParser';
import { HelpHint } from '@/components/ui/HelpHint';
import { HELP_TERMS } from '@/utils/help/terms';
import { WorkoutHeader } from './ExerciseEditor/EditorHeader';
import { CardioFields, CARDIO_OPTIONS } from './ExerciseEditor/CardioFields';
import { SetDetailsSection } from './ExerciseEditor/SetDetailsSection';
import type { AdvancedConfig, SetDetail, Exercise, Workout } from './ExerciseEditor/types';
import { useExerciseEditorLogic } from '@/hooks/useExerciseEditorLogic';
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical';

const REST_PAUSE_DEFAULT_PAUSE_SEC = 20;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

interface ExerciseEditorProps {
    workout: Workout;
    onSave?: (workout: Workout) => Promise<unknown>;
    onCancel?: () => void;
    onChange?: (workout: Workout) => void;
    onSaved?: () => void;
}

const ExerciseEditor: React.FC<ExerciseEditorProps> = ({ workout, onSave, onCancel, onChange, onSaved }) => {
    const { confirm, alert, closeDialog, showLoading } = useDialog();
    const [saving, setSaving] = React.useState(false);
    const [scannerLoading, setScannerLoading] = React.useState(false);
    const [scannerError, setScannerError] = React.useState('');

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const scannerFileInputRef = React.useRef<HTMLInputElement>(null);

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
        handleScannerFileChange,
        handleImportJson,
        handleSave,
    } = useExerciseEditorLogic({
        workout,
        onSave, onCancel, onChange, onSaved,
        saving, setSaving,
        setScannerLoading, setScannerError,
        fileInputRef: fileInputRef as React.RefObject<HTMLInputElement>,
        scannerFileInputRef: scannerFileInputRef as React.RefObject<HTMLInputElement>,
        normalizeMethod, buildDefaultSetDetail, ensureSetDetails,
    });

    const handleScannerFileClick = () => { if (!scannerLoading && scannerFileInputRef.current) scannerFileInputRef.current.click(); };
    const handleImportJsonClick = () => fileInputRef.current?.click();

    if (!workout) return null;

    return (
        <div className="h-full flex flex-col bg-neutral-900">
            <WorkoutHeader
                saving={saving}
                scannerLoading={scannerLoading}
                scannerFileInputRef={scannerFileInputRef}
                fileInputRef={fileInputRef}
                onSave={handleSave}
                onCancel={() => onCancel?.()}
                onScannerFileClick={handleScannerFileClick}
                onScannerFileChange={handleScannerFileChange}
                onImportJsonClick={handleImportJsonClick}
                onImportJson={handleImportJson}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {scannerLoading && (
                    <div className="mb-3 p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/5 text-yellow-200 text-xs font-semibold">
                        A IA está lendo seu treino...
                    </div>
                )}
                {!scannerLoading && scannerError && (
                    <div className="mb-3 p-3 rounded-xl border border-red-500/40 bg-red-900/20 text-red-200 text-xs font-semibold">
                        {scannerError}
                    </div>
                )}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCancel}
                                className="inline-flex items-center gap-2 px-3 py-2 text-neutral-300 hover:text-white rounded-full bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 transition-colors text-xs min-h-[44px]"
                                title="Voltar"
                            >
                                <ArrowLeft size={16} />
                                <span>Voltar</span>
                            </button>
                            <label className="text-xs font-bold text-neutral-500 uppercase">Nome do Treino</label>
                        </div>
                    </div>
                    <input
                        value={workout.title || ''}
                        onChange={e => onChange?.({ ...workout, title: e.target.value })}
                        className="w-full bg-neutral-800 text-xl font-bold p-4 rounded-xl border border-neutral-700 outline-none focus:border-yellow-500 text-white placeholder-neutral-600 transition-colors"
                        placeholder="Ex: Treino A - Peito e Tríceps"
                    />
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Exercícios ({workout.exercises?.length || 0})</label>
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

                        return (
                            <React.Fragment key={index}>
                                <div
                                    className={`bg-neutral-800 p-4 border border-neutral-700 relative group transition-all hover:border-neutral-600 ${linkedFromPrev ? '-mt-4 rounded-t-none border-t-0' : 'rounded-xl'} ${isBiSet && hasNext ? 'rounded-b-none' : ''}`}
                                >
                                    {(isBiSet || linkedFromPrev) && (
                                        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 bg-yellow-500/20" />
                                    )}
                                    <div className="absolute top-2 right-2 flex gap-2">
                                        <button
                                            onClick={() => toggleExerciseType(index, exerciseType)}
                                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${exerciseType === 'cardio'
                                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                                                : 'bg-neutral-700 text-neutral-400 border-neutral-600 hover:border-neutral-400'
                                                }`}
                                        >
                                            {exerciseType === 'cardio' ? 'Cardio' : 'Força'}
                                        </button>
                                        {isBiSet && hasNext && (
                                            <button
                                                type="button"
                                                onClick={() => toggleBiSetWithNext(index)}
                                                className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-yellow-500/30 text-yellow-500 hover:text-yellow-400 hover:border-yellow-500/50 bg-yellow-500/10"
                                                title="Deslinkar do próximo"
                                            >
                                                Deslinkar
                                            </button>
                                        )}
                                        <button
                                            onClick={() => removeExercise(index)}
                                            className="text-neutral-600 hover:text-red-500 p-1 transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="space-y-4 pr-0 pt-6">
                                        {exerciseType === 'cardio' ? (
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold mb-1 block">Modalidade</label>
                                                <select
                                                    value={exercise.name || ''}
                                                    onChange={e => updateExercise(index, 'name', e.target.value)}
                                                    className="w-full bg-neutral-900 font-bold text-white text-lg p-3 rounded-xl border border-neutral-700 outline-none focus:border-blue-500 transition-colors appearance-none"
                                                >
                                                    {CARDIO_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : (
                                            <div>
                                                <input
                                                    value={exercise.name || ''}
                                                    onChange={e => updateExercise(index, 'name', e.target.value)}
                                                    className="w-full bg-transparent font-bold text-white text-lg border-b border-neutral-700 pb-2 focus:border-yellow-500 outline-none placeholder-neutral-600 transition-colors"
                                                    placeholder="Nome do exercício"
                                                />
                                                {(() => {
                                                    const info = resolveCanonicalExerciseName(exercise.name || '')
                                                    if (!info?.changed || !info?.canonical) return null
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={() => updateExercise(index, 'name', info.canonical)}
                                                            className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 font-bold text-xs hover:bg-yellow-500/15"
                                                        >
                                                            Padronizar: {info.canonical}
                                                        </button>
                                                    )
                                                })()}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Sets</label>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        value={setsCount || ''}
                                                        onChange={e => updateExercise(index, 'sets', e.target.value)}
                                                        className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                    />
                                                    <button
                                                        onClick={() => updateExercise(index, 'duplicate', true)}
                                                        className="h-8 w-8 bg-neutral-700 hover:bg-white hover:text-black text-neutral-400 rounded-lg flex items-center justify-center transition-colors"
                                                        title="Duplicar Série"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Reps</label>
                                                <input
                                                    type="text"
                                                    value={exercise.reps ? String(exercise.reps) : ''}
                                                    onChange={e => updateExercise(index, 'reps', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-yellow-500 uppercase font-bold text-center block mb-1 inline-flex items-center justify-center gap-1 group">
                                                    RPE
                                                    <HelpHint title={HELP_TERMS.rpe.title} text={HELP_TERMS.rpe.text} tooltip={HELP_TERMS.rpe.tooltip} className="h-4 w-4 text-[10px]" />
                                                </label>
                                                <input
                                                    type="number"
                                                    value={exercise.rpe ? String(exercise.rpe) : ''}
                                                    onChange={e => updateExercise(index, 'rpe', e.target.value)}
                                                    className="w-full bg-neutral-900 border border-yellow-500/20 rounded-lg p-2 text-center text-sm font-bold text-yellow-500 outline-none focus:ring-1 ring-yellow-500 placeholder-yellow-500/30"
                                                    placeholder="8"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Rest(s)</label>
                                                <input
                                                    type="number"
                                                    value={(exercise.restTime ?? '')}
                                                    onChange={e => updateExercise(index, 'restTime', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1 inline-flex items-center justify-center gap-1 group">
                                                    Cad
                                                    <HelpHint title={HELP_TERMS.cadence.title} text={HELP_TERMS.cadence.text} tooltip={HELP_TERMS.cadence.tooltip} className="h-4 w-4 text-[10px]" />
                                                </label>
                                                <input
                                                    type="text"
                                                    value={exercise.cadence || ''}
                                                    onChange={e => updateExercise(index, 'cadence', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1 inline-flex items-center justify-center gap-1 group">
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
                                                </label>
                                                <select
                                                    value={safeMethod || 'Normal'}
                                                    onChange={e => updateExercise(index, 'method', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-[10px] font-bold text-white h-[36px] outline-none focus:ring-1 ring-yellow-500"
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
                                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">

                                                <div>
                                                    <div className="flex items-center justify-between gap-3 mb-1">
                                                        <label className="text-[10px] text-blue-400 uppercase font-bold block">Vídeo Demonstração (URL)</label>
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
                                                                className="inline-flex items-center gap-2 text-blue-300 hover:text-blue-200 text-[11px] font-bold opacity-70 hover:opacity-100"
                                                                title="Ver vídeo"
                                                            >
                                                                <Play size={14} />
                                                                Ver vídeo
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <input
                                                        value={exercise.videoUrl || ''}
                                                        onChange={e => updateExercise(index, 'videoUrl', e.target.value)}
                                                        className="w-full bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 text-xs text-blue-200 focus:border-blue-500 outline-none placeholder-blue-500/30 transition-colors"
                                                        placeholder="https://youtube.com/..."
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold mb-1 block">Notas</label>
                                                    <textarea
                                                        value={exercise.notes || ''}
                                                        onChange={e => updateExercise(index, 'notes', e.target.value)}
                                                        className="w-full bg-neutral-900 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 min-h-[60px] resize-none"
                                                        placeholder="Dicas de execução..."
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {setsCount > 0 && exerciseType !== 'cardio' && (
                                            <SetDetailsSection
                                                setDetails={setDetails}
                                                safeMethod={safeMethod}
                                                exerciseIndex={index}
                                                onUpdateSetDetail={updateSetDetail}
                                            />
                                        )}
                                    </div>

                                    {isBiSet && hasNext && (
                                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 rounded-full px-3 py-1 flex items-center gap-2 z-20 shadow-lg">
                                            <Link2 size={14} className="text-yellow-500" />
                                            <span className="text-[10px] text-neutral-300 font-bold">BI-SET</span>
                                        </div>
                                    )}
                                </div>

                                {canShowLinkButton && !isBiSet && (
                                    <div className="flex justify-center -mt-4 -mb-4 relative z-10">
                                        <button
                                            type="button"
                                            onClick={() => toggleBiSetWithNext(index)}
                                            className="mt-3 mb-3 inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-full text-xs font-bold text-neutral-200 hover:bg-neutral-800 hover:text-white transition-colors min-h-[44px]"
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
                    className="w-full py-4 border-2 border-dashed border-neutral-800 text-neutral-500 rounded-xl font-bold hover:bg-neutral-800 hover:text-white hover:border-neutral-700 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={20} /> Adicionar Exercício
                </button>
            </div>
        </div>
    );
};

export default ExerciseEditor;
