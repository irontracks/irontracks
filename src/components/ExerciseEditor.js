import React from 'react';
import { Trash2, Plus, ArrowLeft, Save, Upload, Link2 } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { createClient } from '@/utils/supabase/client';

const ExerciseEditor = ({ workout, onSave, onCancel, onChange, onSaved }) => {
	const { confirm, alert, closeDialog, showLoading } = useDialog();
    const [saving, setSaving] = React.useState(false);

    const fileInputRef = React.useRef(null);

	React.useEffect(() => {
		if (!Array.isArray(workout?.exercises)) return;
		const validExercises = workout.exercises.filter(e => e && typeof e === 'object');
		if (validExercises.length !== workout.exercises.length) {
			onChange?.({ ...workout, exercises: validExercises });
		}
	}, [workout, onChange]);

    if (!workout) return null;

    const normalizeMethod = (method) => {
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
    };

    const buildDefaultSetDetail = (exercise, setNumber) => {
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
    };

    const ensureSetDetails = (exercise, desiredCount) => {
        const existing = Array.isArray(exercise?.setDetails) ? exercise.setDetails : [];
        const next = [];
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
    };

    const updateSetDetail = (exerciseIndex, setIndex, patch) => {
        const newExercises = [...(workout.exercises || [])];
        const ex = newExercises[exerciseIndex] || {};
        const setsCount = Math.max(0, parseInt(ex?.sets) || 0);
        const setDetails = ensureSetDetails(ex, setsCount);
        const current = setDetails[setIndex] || buildDefaultSetDetail(ex, setIndex + 1);
        setDetails[setIndex] = { ...current, ...patch };
        newExercises[exerciseIndex] = { ...ex, setDetails };
        onChange?.({ ...workout, exercises: newExercises });
    };

	const updateExercise = (index, field, value) => {
		const newExercises = [...(workout.exercises || [])];
		if (field === 'duplicate') {
			newExercises.splice(index + 1, 0, { ...newExercises[index] });
			} else {
				const ex = newExercises[index] || {};
				if (field === 'sets') {
					const nextCount = Math.max(0, parseInt(value) || 0);
					const nextDetails = ensureSetDetails(ex, nextCount);
					newExercises[index] = { ...ex, sets: value, setDetails: nextDetails };
				} else if (field === 'method') {
				const prevMethod = normalizeMethod(ex?.method);
				const nextMethod = normalizeMethod(value);
				const currentCount = Math.max(0, parseInt(ex?.sets) || 0);
				const nextIsSpecial =
					nextMethod === 'Drop-set' ||
					nextMethod === 'Rest-Pause' ||
					nextMethod === 'Cluster';
				const prevIsSpecial =
					prevMethod === 'Drop-set' ||
					prevMethod === 'Rest-Pause' ||
					prevMethod === 'Cluster';
				const setsCount = nextIsSpecial ? Math.max(1, currentCount || 1) : (currentCount || 4);
				const switchingBetweenSpecial = prevIsSpecial && nextIsSpecial && prevMethod !== nextMethod;
				const shouldResetConfig =
					nextMethod === 'Normal' ||
					nextMethod === 'Bi-Set' ||
					nextMethod === 'Cardio' ||
					switchingBetweenSpecial;
				const baseDetails = ensureSetDetails({ ...ex, method: nextMethod }, setsCount);
				const nextDetails = shouldResetConfig
					? baseDetails.map((s) => ({
							...s,
							advanced_config: null
					  }))
					: baseDetails;
				const currentRestTime = ex?.restTime ?? ex?.rest_time ?? null;
				const currentRestTimeNum = currentRestTime === '' ? NaN : Number(currentRestTime);
				const shouldSuggestRestZero = nextMethod === 'Bi-Set' && (!Number.isFinite(currentRestTimeNum) || currentRestTimeNum === 60);
				newExercises[index] = {
					...ex,
					method: nextMethod,
					restTime: shouldSuggestRestZero ? 0 : (ex?.restTime ?? ex?.rest_time ?? null),
					sets: setsCount,
					setDetails: nextDetails
				};
			} else if (field === 'reps' || field === 'rpe') {
                const prevValue = ex[field];
                const nextValue = value;
                const setsCount = Math.max(0, parseInt(ex?.sets) || 0);
                const existingDetails = ensureSetDetails(ex, setsCount);
                const updatedDetails = existingDetails.map((s) => {
                    if (field === 'reps') {
                        const currentReps = s?.reps;
                        if (currentReps == null || currentReps === '' || currentReps === prevValue) {
                            return { ...s, reps: nextValue };
                        }
                    }
                    if (field === 'rpe') {
                        const currentRpe = s?.rpe;
                        if (currentRpe == null || currentRpe === '' || String(currentRpe) === String(prevValue)) {
                            return { ...s, rpe: nextValue === '' ? null : Number(nextValue) };
                        }
                    }
                    return s;
                });
                newExercises[index] = { ...ex, [field]: value, setDetails: updatedDetails };
            } else {
                newExercises[index] = { ...ex, [field]: value };
            }
        }
        onChange?.({ ...workout, exercises: newExercises });
    };

    const removeExercise = async (index) => {
        if (await confirm('Tem certeza que deseja remover este exercício?', 'Remover Exercício')) {
            const newExercises = [...(workout.exercises || [])];
            newExercises.splice(index, 1);
            onChange?.({ ...workout, exercises: newExercises });
        }
    };

    const handleCancel = async () => {
        if (await confirm('Deseja mesmo cancelar?', 'Cancelar Edição')) {
            onCancel?.();
        }
    };

    const CARDIO_OPTIONS = ['Escada', 'Esteira', 'Bicicleta', 'Corrida', 'Caminhada', 'Elíptico'];

    const getExerciseType = (ex) => {
        if (ex.type) return ex.type;
        return ex.method === 'Cardio' ? 'cardio' : 'strength';
    };

    const toggleExerciseType = (index, currentType) => {
        const newType = currentType === 'strength' ? 'cardio' : 'strength';
        const newExercises = [...(workout.exercises || [])];
        const ex = newExercises[index];

        if (newType === 'cardio') {
            newExercises[index] = {
                ...ex,
                type: 'cardio',
                method: 'Cardio',
                sets: 1,
                name: CARDIO_OPTIONS.includes(ex.name) ? ex.name : CARDIO_OPTIONS[0],
                reps: ex.reps || '20',
                rpe: ex.rpe || 5
            };
        } else {
            newExercises[index] = {
                ...ex,
                type: 'strength',
                method: 'Normal',
                sets: 4,
                name: '',
                reps: '10',
                rpe: 8
            };
        }
        onChange?.({ ...workout, exercises: newExercises });
    };

    const toggleBiSetWithNext = async (index) => {
        try {
            const list = Array.isArray(workout?.exercises) ? workout.exercises : [];
            const current = list[index];
            const next = list[index + 1];
            if (!current || !next) return;

            const currentType = getExerciseType(current);
            const nextType = getExerciseType(next);
            if (currentType === 'cardio' || nextType === 'cardio') {
                await alert('Bi-set só pode ser usado entre exercícios de força.', 'Atenção');
                return;
            }

            const currentMethod = normalizeMethod(current?.method);
            if (currentMethod === 'Bi-Set') {
                updateExercise(index, 'method', 'Normal');
                return;
            }

            const allowedMethods = new Set(['Normal', 'Bi-Set']);
            if (!allowedMethods.has(currentMethod)) {
                const ok = await confirm('Isso vai trocar o método para Bi-Set. Continuar?', 'Linkar com Próximo');
                if (!ok) return;
            }

            updateExercise(index, 'method', 'Bi-Set');
        } catch (e) {
            await alert('Não foi possível atualizar o link. ' + (e?.message ?? String(e)), 'Erro');
        }
    };

    const addExercise = () => {
        onChange?.({
            ...workout,
            exercises: [
                ...(workout.exercises || []),
                {
                    name: '',
                    sets: 4,
                    reps: '10',
                    rpe: '8',
                    cadence: '2020',
                    restTime: 60,
                    method: 'Normal',
                    videoUrl: '',
                    notes: ''
                }
            ]
        });
    };

    const handleImportJsonClick = () => fileInputRef.current?.click();
    const handleImportJson = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const raw = JSON.parse(text);
            const src = raw.workout || raw.session || raw;
            const title = src.title || src.workoutTitle || workout.title || 'Treino Importado';
            const exs = Array.isArray(src.exercises) ? src.exercises : [];
            const mapped = exs.map(ex => ({
                name: ex.name || '',
                sets: Number(ex.sets) || (Array.isArray(ex?.setDetails) ? ex.setDetails.length : (Array.isArray(ex?.set_details) ? ex.set_details.length : (Array.isArray(ex?.sets) && ex.sets.length && typeof ex.sets[0] === 'object' ? ex.sets.length : 0))),
                reps: String(ex.reps || ''),
                rpe: Number(ex.rpe || ex.intensity || 8),
                cadence: ex.cadence || '2020',
                restTime: Number(ex.restTime || ex.rest_time || 0),
                method: normalizeMethod(ex.method || 'Normal'),
                videoUrl: ex.videoUrl || ex.video_url || '',
                notes: ex.notes || '',
                setDetails: Array.isArray(ex?.setDetails)
                    ? ex.setDetails
                    : (Array.isArray(ex?.set_details)
                        ? ex.set_details
                        : (Array.isArray(ex?.sets) && ex.sets.length && typeof ex.sets[0] === 'object' ? ex.sets : []))
            }));
            const imported = { title, exercises: mapped };
            onChange?.(imported);
            if (await confirm('Importar e salvar este treino agora?', 'Salvar')) {
                await onSave?.(imported);
            }
        } catch (err) {
            const msg = (err && typeof err === 'object' && 'message' in err) ? err.message : String(err || '');
            await alert(`Falha ao importar JSON${msg ? `: ${msg}` : ''}`, 'Erro');
        } finally {
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        if (!workout.title || !workout.title.trim()) {
            return await alert("Dê um nome ao treino!", "Atenção");
        }

		setSaving(true);
		if (typeof showLoading === 'function') {
			showLoading('Seu treino está sendo salvo. Aguarde...', 'Salvando');
		}
	try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                await alert("Usuário não logado. O treino não será salvo sem dono.", "Erro");
                return;
            }

			if (onSave) {
				 await onSave({ ...workout, created_by: user.id, user_id: user.id });
			} else {
                 // 1. Create/Update Workout
                 let workoutId = workout.id;
                 if (workoutId) {
                     const { error } = await supabase.from('workouts').update({
                         name: workout.title,
                         notes: workout.notes,
                         created_by: user.id 
                     }).eq('id', workoutId);
                     if (error) throw error;
                 } else {
                     const { data: newW, error } = await supabase.from('workouts').insert({
                         user_id: user.id, 
                         created_by: user.id,
                         name: workout.title,
                         is_template: true,
                         notes: workout.notes
                     }).select().single();
                     if (error) throw error;
                     workoutId = newW.id;
                 }

                 await supabase.from('exercises').delete().eq('workout_id', workoutId);

                 const exercisesToInsert = (workout.exercises || []).map((ex, idx) => ({
                     workout_id: workoutId,
                     name: ex.name,
                     notes: ex.notes,
                     video_url: ex.videoUrl,
                     rest_time: ex.restTime,
                     cadence: ex.cadence,
                     method: ex.method,
                     "order": idx
                 }));

                 if (exercisesToInsert.length > 0) {
                     const { data: insertedExs, error: exErr } = await supabase.from('exercises').insert(exercisesToInsert).select();
                     if (exErr) throw exErr;

                    const SETS_INSERT_CHUNK_SIZE = 200;
                    const chunkArray = (arr, size) => {
                        const safe = Array.isArray(arr) ? arr : [];
                        const chunkSize = Math.max(1, Number(size) || 1);
                        const out = [];
                        for (let i = 0; i < safe.length; i += chunkSize) out.push(safe.slice(i, i + chunkSize));
                        return out;
                    };

                    const insertSetsBulkSafe = async (rows) => {
                        const chunks = chunkArray(rows, SETS_INSERT_CHUNK_SIZE);
                        for (const batch of chunks) {
                            if (!Array.isArray(batch) || batch.length === 0) continue;
                            const { error } = await supabase.from('sets').insert(batch);
                            if (!error) continue;

                            const msg = String(error?.message || '').toLowerCase();
                            const shouldReduce = msg.includes('advanced_config') || msg.includes('is_warmup');
                            if (!shouldReduce) throw error;

                            const reducedBatch = batch.map((row) => {
                                if (!row || typeof row !== 'object') return row;
                                const next = { ...row };
                                delete next.advanced_config;
                                delete next.is_warmup;
                                return next;
                            });

                            const { error: reducedErr } = await supabase.from('sets').insert(reducedBatch);
                            if (reducedErr) throw reducedErr;
                        }
                    };

                    const setRows = [];
                    for (const ex of (insertedExs || [])) {
                        const original = (typeof ex?.order === 'number' && Array.isArray(workout.exercises))
                            ? workout.exercises[ex.order]
                            : (workout.exercises || []).find(e => e?.name === ex.name);
                        const setDetails = Array.isArray(original?.setDetails)
                            ? original.setDetails
                            : (Array.isArray(original?.set_details) ? original.set_details : null);
                        const numSets = setDetails
                            ? setDetails.length
                            : (parseInt(original?.sets) || 0);
                        for (let i = 0; i < numSets; i += 1) {
                            const s = setDetails ? setDetails[i] : null;
                            setRows.push({
                                exercise_id: ex.id,
                                reps: s?.reps ?? original?.reps ?? null,
                                rpe: s?.rpe ?? original?.rpe ?? null,
                                set_number: s?.set_number ?? (i + 1),
                                weight: s?.weight ?? null,
                                is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                                advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null
                            });
                        }
                    }

                    if (setRows.length > 0) await insertSetsBulkSafe(setRows);
                 }
			}
			
			await alert("Treino Salvo com Sucesso!", "Sucesso");
			if (typeof onSaved === 'function') {
				onSaved();
			}
            // window.location.href = '/'; // Removido para evitar reload forçado que causava tela preta

		} catch (e) {
			const msg = e?.message || String(e || '');
			await alert("Erro ao salvar: " + msg);
		} finally {
			if (typeof closeDialog === 'function') {
				closeDialog();
			}
			setSaving(false);
		}
	};

	return (
		<div className="h-full flex flex-col bg-neutral-900">
            <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between bg-neutral-950 sticky top-0 z-30 pt-safe">
                <div className="w-full flex items-center justify-between gap-3 min-h-[48px]">
                    <h2 className="text-base md:text-lg font-bold text-white whitespace-nowrap">
                        Editar Treino
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleImportJsonClick}
                            className="flex items-center gap-2 px-3 py-2 text-neutral-300 hover:text-white rounded-full hover:bg-neutral-800 transition-colors min-h-[44px]"
                            title="Carregar JSON"
                        >
                            <Upload size={18} />
                            <span className="text-sm font-bold">Carregar JSON</span>
                        </button>
                        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportJson} />
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
                        >
                            <Save size={18} />
                            <span>{saving ? 'SALVANDO...' : 'SALVAR'}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                        <button
                            onClick={handleImportJsonClick}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-blue-400 hover:text-white rounded-full hover:bg-blue-500/10 transition-colors text-xs"
                            title="Importar JSON"
                        >
                            <Upload size={16} />
                            <span>Importar JSON</span>
                        </button>
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
                        const setsCount = Math.max(0, parseInt(exercise?.sets) || 0);
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
                                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                                                exerciseType === 'cardio'
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
                                        <input
                                            value={exercise.name || ''}
                                            onChange={e => updateExercise(index, 'name', e.target.value)}
                                            className="w-full bg-transparent font-bold text-white text-lg border-b border-neutral-700 pb-2 focus:border-yellow-500 outline-none placeholder-neutral-600 transition-colors"
                                            placeholder="Nome do exercício"
                                        />
                                    )}

                                    {exerciseType === 'cardio' ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Tempo (minutos)</label>
                                                <input
                                                    type="number"
                                                    value={exercise.reps || ''}
                                                    onChange={e => updateExercise(index, 'reps', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-xl p-4 text-center text-xl font-bold text-white outline-none focus:ring-1 ring-blue-500 border border-neutral-700"
                                                    placeholder="30"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-yellow-500 uppercase font-bold text-center block mb-1">Intensidade</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={exercise.rpe || ''}
                                                    onChange={e => updateExercise(index, 'rpe', e.target.value)}
                                                    className="w-full bg-neutral-900 border border-yellow-500/20 rounded-xl p-4 text-center text-xl font-bold text-yellow-500 outline-none focus:ring-1 ring-yellow-500 placeholder-yellow-500/30"
                                                    placeholder="5"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Sets</label>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        value={exercise.sets || ''}
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
                                                    value={exercise.reps || ''}
                                                    onChange={e => updateExercise(index, 'reps', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-yellow-500 uppercase font-bold text-center block mb-1">RPE</label>
                                                <input
                                                    type="number"
                                                    value={exercise.rpe || ''}
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
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Cad</label>
                                                <input
                                                    type="text"
                                                    value={exercise.cadence || ''}
                                                    onChange={e => updateExercise(index, 'cadence', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Método</label>
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
                                    )}

                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="text-[10px] text-blue-400 uppercase font-bold mb-1 block">Vídeo Demonstração (URL)</label>
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

                                    {exerciseType !== 'cardio' && setsCount > 0 && (
                                        <div className="pt-4 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[10px] text-neutral-500 uppercase font-bold">Séries</div>
                                                <div className="text-[10px] text-neutral-600">{setsCount}</div>
                                            </div>

                                            {setDetails.map((s, setIdx) => {
                                                const isWarmup = !!(s?.is_warmup ?? s?.isWarmup)
                                                const borderClass = isWarmup ? 'border-yellow-500/60' : 'border-neutral-700'
                                                const config = s?.advanced_config ?? s?.advancedConfig ?? null

                                                const updateConfig = (nextConfig) => {
                                                    updateSetDetail(index, setIdx, { advanced_config: nextConfig })
                                                }

                                                return (
                                                    <div key={setIdx} className={`bg-neutral-900 border ${borderClass} rounded-xl p-3`}>
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="text-xs font-bold text-white">Série {s?.set_number ?? (setIdx + 1)}</div>
                                                                <label className="flex items-center gap-2 text-[10px] text-neutral-300 font-bold">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isWarmup}
                                                                        onChange={(e) => updateSetDetail(index, setIdx, { is_warmup: !!e.target.checked })}
                                                                        className="accent-yellow-500"
                                                                    />
                                                                    Série de Aquecimento
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {(safeMethod === 'Normal' || safeMethod === 'Bi-Set') && (
                                                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Carga (kg)</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(s?.weight ?? '')}
                                                                        onChange={(e) => updateSetDetail(index, setIdx, { weight: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Reps</label>
                                                                    <input
                                                                        type="text"
                                                                        value={(s?.reps ?? '')}
                                                                        onChange={(e) => updateSetDetail(index, setIdx, { reps: e.target.value })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-yellow-500 uppercase font-bold">RPE</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(s?.rpe ?? '')}
                                                                        onChange={(e) => updateSetDetail(index, setIdx, { rpe: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-yellow-500/20 rounded-lg p-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {safeMethod === 'Drop-set' && (
                                                            <div className="mt-3 space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="text-[10px] text-neutral-500 uppercase font-bold">Drop Set</div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const list = Array.isArray(config) ? config : []
                                                                            updateConfig([...(list || []), { weight: null, reps: '' }])
                                                                        }}
                                                                        className="text-[10px] font-bold text-yellow-500 hover:text-yellow-400"
                                                                    >
                                                                        (+) Add Drop
                                                                    </button>
                                                                </div>

                                                                {(Array.isArray(config) ? config : []).map((d, dIdx) => (
                                                                    <div key={dIdx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                                                                        <div>
                                                                            <label className="text-[10px] text-neutral-500 uppercase font-bold">Peso (kg)</label>
                                                                            <input
                                                                                type="number"
                                                                                value={(d?.weight ?? '')}
                                                                                onChange={(e) => {
                                                                                    const list = Array.isArray(config) ? [...config] : []
                                                                                    const next = { ...(list[dIdx] || {}), weight: e.target.value === '' ? null : Number(e.target.value) }
                                                                                    list[dIdx] = next
                                                                                    updateConfig(list)
                                                                                }}
                                                                                className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className="text-[10px] text-neutral-500 uppercase font-bold">Reps</label>
                                                                            <input
                                                                                type="text"
                                                                                value={(d?.reps ?? '')}
                                                                                onChange={(e) => {
                                                                                    const list = Array.isArray(config) ? [...config] : []
                                                                                    const next = { ...(list[dIdx] || {}), reps: e.target.value }
                                                                                    list[dIdx] = next
                                                                                    updateConfig(list)
                                                                                }}
                                                                                className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                            />
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const list = Array.isArray(config) ? [...config] : []
                                                                                list.splice(dIdx, 1)
                                                                                updateConfig(list)
                                                                            }}
                                                                            className="h-9 w-9 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 hover:text-red-400"
                                                                            title="Remover drop"
                                                                        >
                                                                            <Trash2 size={14} className="mx-auto" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {safeMethod === 'Rest-Pause' && (
                                                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Carga</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(config?.weight ?? '')}
                                                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), weight: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Reps Iniciais</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(config?.initial_reps ?? '')}
                                                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), initial_reps: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Pausa (s)</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(config?.rest_time_sec ?? '')}
                                                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), rest_time_sec: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Mini-sets</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(config?.mini_sets ?? '')}
                                                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), mini_sets: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {safeMethod === 'Cluster' && (
                                                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Carga</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(config?.weight ?? '')}
                                                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), weight: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Total Reps</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(config?.total_reps ?? '')}
                                                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), total_reps: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Cluster</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(config?.cluster_size ?? '')}
                                                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), cluster_size: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold">Intra (s)</label>
                                                                    <input
                                                                        type="number"
                                                                        value={(config?.intra_rest_sec ?? '')}
                                                                        onChange={(e) => updateConfig({ ...(config && typeof config === 'object' ? config : {}), intra_rest_sec: e.target.value === '' ? null : Number(e.target.value) })}
                                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                    </div>
                                                )
                                            })}
                                        </div>
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
