import React from 'react';
import { Trash2, Plus, ArrowLeft, Save, Upload, Link2, X, Image as ImageIcon } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { createClient } from '@/utils/supabase/client';

const REST_PAUSE_DEFAULT_PAUSE_SEC = 20;
const DEFAULT_CARDIO_OPTION = 'Esteira';

const ExerciseEditor = ({ workout, onSave, onCancel, onChange, onSaved }) => {
	const { confirm, alert, closeDialog, showLoading } = useDialog();
    const [saving, setSaving] = React.useState(false);
    const [scannerLoading, setScannerLoading] = React.useState(false);
    const [scannerError, setScannerError] = React.useState('');

    const fileInputRef = React.useRef(null);
    const scannerFileInputRef = React.useRef(null);

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

    const detectRestPauseConfig = (name, reps, notes) => {
        const text = `${String(name || '')} ${String(reps || '')} ${String(notes || '')}`.toLowerCase();
        const hasRestPause = text.includes('rest-pause') || text.includes('rest pause') || text.includes('restpause');
        if (!hasRestPause) return null;

        const source = String(reps || notes || '');

        const plusPattern = /(\d+)\s*\+\s*(\d+)(?:\s*\+\s*(\d+))*/i;
        const plusMatch = source.match(plusPattern);
        if (plusMatch) {
            const numbers = plusMatch[0]
                .split('+')
                .map((part) => parseInt(part.trim(), 10))
                .filter((n) => Number.isFinite(n) && n > 0);
            if (numbers.length) {
                const initialReps = numbers[0];
                const miniSets = Math.max(0, numbers.length - 1);
                const cleanedNotes = String(notes || '')
                    .replace(plusMatch[0], `rest-pause ${numbers.join('+')}`)
                    .trim();

                return {
                    method: 'Rest-Pause',
                    normalizedReps: String(reps || initialReps).trim() || String(initialReps),
                    cleanedNotes,
                    config: {
                        initial_reps: initialReps,
                        mini_sets: miniSets || null,
                        rest_time_sec: REST_PAUSE_DEFAULT_PAUSE_SEC
                    }
                };
            }
        }

        const rangePattern = /(\d+)\s*(?:a|-|to)\s*(\d+)/i;
        const rangeMatch = source.match(rangePattern);
        if (rangeMatch) {
            const first = parseInt(rangeMatch[1], 10);
            const second = parseInt(rangeMatch[2], 10);
            const low = Number.isFinite(first) ? first : second;
            const high = Number.isFinite(second) ? second : first;
            const initialReps = Number.isFinite(high) ? high : low;
            const normalizedReps = `${low}-${high}`;
            const cleanedNotes = String(notes || '')
                .replace(/rest[- ]?pause/gi, '')
                .trim();

            return {
                method: 'Rest-Pause',
                normalizedReps,
                cleanedNotes,
                config: {
                    initial_reps: initialReps,
                    mini_sets: 2,
                    rest_time_sec: REST_PAUSE_DEFAULT_PAUSE_SEC
                }
            };
        }

        return {
            method: 'Rest-Pause',
            normalizedReps: String(reps || '').trim() || '10',
            cleanedNotes: String(notes || '').trim(),
            config: {
                initial_reps: null,
                mini_sets: null,
                rest_time_sec: REST_PAUSE_DEFAULT_PAUSE_SEC
            }
        };
    };

    const extractRepsTargets = (primaryReps, notes) => {
        const normalize = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const rangePattern = /(\d+)\s*(?:a|-|to)\s*(\d+)/i;
            const rangeMatch = raw.match(rangePattern);
            if (rangeMatch) {
                const first = parseInt(rangeMatch[1], 10);
                const second = parseInt(rangeMatch[2], 10);
                if (Number.isFinite(first) && Number.isFinite(second)) return `${first}-${second}`;
            }
            const numMatch = raw.match(/\d+/);
            if (numMatch) return numMatch[0];
            return raw;
        };

        const targets = [];
        const normalizedPrimary = normalize(primaryReps);
        if (normalizedPrimary) targets.push(normalizedPrimary);

        const text = String(notes || '');
        const parts = text
            .split(/\n|,|;|\|/)
            .map((p) => String(p || '').trim())
            .filter((p) => p.length > 0);

        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i];
            const normalized = normalize(part);
            if (!normalized) continue;
            const prev = targets[targets.length - 1];
            if (prev === normalized) continue;
            targets.push(normalized);
        }

        return targets;
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
        const next = { ...current, ...patch };
        setDetails[setIndex] = next;

        if (Object.prototype.hasOwnProperty.call(patch || {}, 'is_warmup')) {
            if (setIndex !== 0 && next.is_warmup) {
                setDetails[setIndex] = { ...next, is_warmup: false };
            }
            if (setIndex === 0 && next.is_warmup) {
                for (let i = 1; i < setDetails.length; i += 1) {
                    const other = setDetails[i] || buildDefaultSetDetail(ex, i + 1);
                    setDetails[i] = { ...other, is_warmup: false };
                }
            }
        }
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

    const CARDIO_OPTIONS = ['Escada', 'Esteira', 'Bicicleta', 'Bike Outdoor', 'Corrida', 'Caminhada', 'Elíptico'];

    const getExerciseType = (ex) => {
        if (ex.type) return ex.type;
        return ex.method === 'Cardio' ? 'cardio' : 'strength';
    };

    const detectCardioFromScanner = (name, reps, notes) => {
        const rawName = String(name || '').trim();
        const text = `${rawName} ${String(reps || '')} ${String(notes || '')}`.toLowerCase();

        const looksLikeCardio =
            text.includes('cardio') ||
            text.includes('min') ||
            text.includes('minuto') ||
            text.includes('esteira') ||
            text.includes('treadmill') ||
            text.includes('bike') ||
            text.includes('bici') ||
            text.includes('bicicleta') ||
            text.includes('spinning') ||
            text.includes('escada') ||
            text.includes('corrida') ||
            text.includes('caminhada') ||
            text.includes('eliptico') ||
            text.includes('elíptico');

        if (!looksLikeCardio) return null;

        let modality = '';
        const isOutdoor = text.includes('out') || text.includes('rua') || text.includes('extern') || text.includes('outdoor');
        const isBike = text.includes('bicicleta') || text.includes('bike') || text.includes('bici') || text.includes('spinning') || text.includes('cicl') || text.includes('pedal');
        if (isBike && isOutdoor) {
            modality = 'Bike Outdoor';
        } else if (isBike) {
            modality = 'Bicicleta';
        } else if (text.includes('esteira') || text.includes('treadmill')) {
            modality = 'Esteira';
        } else if (text.includes('escada')) {
            modality = 'Escada';
        } else if (text.includes('corrida')) {
            modality = 'Corrida';
        } else if (text.includes('caminhada')) {
            modality = 'Caminhada';
        } else if (text.includes('eliptico') || text.includes('elíptico')) {
            modality = 'Elíptico';
        }

        const nameIsKnownCardio = CARDIO_OPTIONS.includes(rawName);
        const resolvedModality = nameIsKnownCardio
            ? rawName
            : (CARDIO_OPTIONS.includes(modality) ? modality : DEFAULT_CARDIO_OPTION);

        const minutesMatch = text.match(/(\d+)\s*(?:min|mins|minuto|minutos)/i) || text.match(/\b(\d+)\b/);
        const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : NaN;
        const resolvedMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 20;

        return {
            modality: resolvedModality,
            minutes: resolvedMinutes
        };
    };

    const handleScannerFileClick = () => {
        if (scannerLoading) return;
        if (scannerFileInputRef.current) {
            scannerFileInputRef.current.click();
        }
    };

    const handleScannerFileChange = async (e) => {
        try {
            setScannerError('');
            const files = e?.target?.files;
            if (!files || files.length === 0) return;

            const selectedFiles = Array.from(files).filter((f) => !!f);
            if (selectedFiles.length === 0) return;

            setScannerLoading(true);

            const allRawExercises = [];

            for (let i = 0; i < selectedFiles.length; i += 1) {
                const file = selectedFiles[i];
                const formData = new FormData();
                formData.append('file', file);

                const res = await fetch('/api/iron-scanner', {
                    method: 'POST',
                    body: formData
                });

                const json = await res.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor' }));
                if (!res.ok || !json?.ok) {
                    const msg = json?.error || 'Não conseguimos ler o treino. Tente uma foto mais nítida.';
                    setScannerError(msg);
                    await alert(msg, 'Falha na importação');
                    return;
                }

                const list = Array.isArray(json.exercises) ? json.exercises : [];
                if (list.length === 0) {
                    const msg = 'Não encontramos exercícios válidos em uma das imagens.';
                    setScannerError(msg);
                    await alert(msg, 'Sem exercícios detectados');
                    return;
                }

                allRawExercises.push(...list);
            }

            if (allRawExercises.length === 0) {
                const msg = 'Não encontramos exercícios válidos nas imagens selecionadas.';
                setScannerError(msg);
                await alert(msg, 'Sem exercícios válidos');
                return;
            }

            const mappedExercises = allRawExercises
                .map((item) => {
                    const name = String(item?.name || '').trim();
                    const setsRaw = item?.sets;
                    const setsNum = typeof setsRaw === 'number' ? setsRaw : parseInt(String(setsRaw || '0')) || 0;
                    const repsRaw = String(item?.reps ?? '').trim();
                    const notesRaw = String(item?.notes ?? '').trim();
                    const baseSets = Number.isFinite(setsNum) && setsNum > 0 ? setsNum : 4;

                    const cardioInfo = detectCardioFromScanner(name, repsRaw, notesRaw);
                    if (cardioInfo) {
                        const minutesStr = String(cardioInfo.minutes);
                        const exercise = {
                            name: cardioInfo.modality,
                            type: 'cardio',
                            method: 'Cardio',
                            sets: 1,
                            reps: minutesStr,
                            rpe: '5',
                            cadence: '',
                            restTime: 0,
                            videoUrl: '',
                            notes: notesRaw
                        };
                        const setDetails = ensureSetDetails(exercise, 1);
                        setDetails[0] = { ...(setDetails[0] || buildDefaultSetDetail(exercise, 1)), reps: minutesStr };
                        return { ...exercise, setDetails };
                    }

                    const restPauseInfo = detectRestPauseConfig(name, repsRaw, notesRaw);
                    const method = restPauseInfo?.method || 'Normal';
                    const reps = restPauseInfo?.normalizedReps || repsRaw || '10';
                    const notes = restPauseInfo?.cleanedNotes ?? notesRaw;

                    const exercise = {
                        name,
                        sets: baseSets,
                        reps,
                        rpe: '8',
                        cadence: '2020',
                        restTime: 60,
                        method,
                        videoUrl: '',
                        notes
                    };

                    const setDetails = ensureSetDetails(exercise, baseSets);

                    const repsTargets = extractRepsTargets(reps, notesRaw);
                    for (let i = 0; i < setDetails.length; i += 1) {
                        const target = repsTargets[i];
                        if (!target) continue;
                        const current = setDetails[i] || buildDefaultSetDetail(exercise, i + 1);
                        setDetails[i] = { ...current, reps: target };
                    }

                    if (method === 'Rest-Pause' && restPauseInfo?.config && setDetails.length > 0) {
                        const lastIndex = setDetails.length - 1;
                        const last = setDetails[lastIndex] || buildDefaultSetDetail(exercise, lastIndex + 1);
                        setDetails[lastIndex] = {
                            ...last,
                            advanced_config: {
                                ...(last.advanced_config && typeof last.advanced_config === 'object' ? last.advanced_config : {}),
                                ...restPauseInfo.config
                            }
                        };
                    }

                    return {
                        ...exercise,
                        setDetails
                    };
                })
                .filter((ex) => String(ex.name || '').trim().length > 0);

            if (!mappedExercises.length) {
                const msg = 'Não encontramos exercícios utilizáveis nas imagens.';
                setScannerError(msg);
                await alert(msg, 'Sem exercícios válidos');
                return;
            }

            const nextWorkout = {
                ...(workout || {}),
                exercises: mappedExercises
            };

            onChange?.(nextWorkout);
            await alert('Treino importado pela IA. Revise antes de salvar.', 'Importação concluída');
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err);
            const friendly = msg || 'Não conseguimos ler o treino. Tente uma foto mais nítida.';
            setScannerError(friendly);
            await alert(friendly, 'Erro na importação');
        } finally {
            setScannerLoading(false);
            if (e?.target) {
                e.target.value = '';
            }
        }
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
                name: CARDIO_OPTIONS.includes(ex.name) ? ex.name : DEFAULT_CARDIO_OPTION,
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
				 const res = await onSave({ ...workout, created_by: user.id, user_id: user.id });
				 const sync = res?.sync || null;
				 if (sync) {
					const created = Number(sync?.created || 0);
					const updated = Number(sync?.updated || 0);
					const failed = Number(sync?.failed || 0);
					const extra = sync?.error
						? `\n\nSincronização: falhou (${String(sync.error)})`
						: `\n\nSincronização: ${updated} atualizado(s), ${created} criado(s)${failed ? `, ${failed} falha(s)` : ''}`;
					await alert("Treino Salvo com Sucesso!" + extra, "Sucesso");
					if (typeof onSaved === 'function') onSaved();
					return;
				 }
			} else {
                 const exercisesPayload = (workout.exercises || []).map((ex, idx) => {
                    const setDetails = Array.isArray(ex?.setDetails)
                        ? ex.setDetails
                        : (Array.isArray(ex?.set_details) ? ex.set_details : null);
                    const headerSets = Number.parseInt(ex?.sets, 10) || 0;
                    const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0);
                    const sets = [];
                    for (let i = 0; i < numSets; i += 1) {
                        const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null;
                        sets.push({
                            weight: s?.weight ?? null,
                            reps: s?.reps ?? ex?.reps ?? null,
                            rpe: s?.rpe ?? ex?.rpe ?? null,
                            set_number: s?.set_number ?? (i + 1),
                            completed: false,
                            is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                            advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
                        });
                    }
                    return {
                        name: ex?.name || '',
                        notes: ex?.notes || '',
                        video_url: ex?.videoUrl || null,
                        rest_time: ex?.restTime ?? null,
                        cadence: ex?.cadence ?? null,
                        method: ex?.method ?? null,
                        order: idx,
                        sets
                    };
                 });

                 const { data: workoutId, error } = await supabase.rpc('save_workout_atomic', {
                    p_workout_id: workout.id || null,
                    p_user_id: user.id,
                    p_created_by: user.id,
                    p_is_template: true,
                    p_name: workout.title,
                    p_notes: workout.notes,
                    p_exercises: exercisesPayload
                 });
                 if (error) throw error;
                 if (!workoutId) throw new Error('Falha ao salvar treino');
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
				<div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-h-[48px]">
					<div className="flex items-center justify-between gap-3 min-w-0">
						<h2 className="text-base md:text-lg font-bold text-white whitespace-nowrap truncate min-w-0">
							Editar Treino
						</h2>
						<div className="shrink-0 flex items-center gap-2">
							<button
								type="button"
								onClick={handleCancel}
								className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800 transition-colors"
								title="Fechar"
							>
								<X size={16} />
							</button>
							<button
								type="button"
								onClick={handleSave}
								disabled={saving}
								className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
							>
								<Save size={18} />
								<span className="hidden sm:inline">{saving ? 'SALVANDO...' : 'SALVAR'}</span>
							</button>
						</div>
					</div>
					<div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<button
							onClick={handleScannerFileClick}
							disabled={scannerLoading}
							className="shrink-0 flex items-center gap-2 px-3 py-2 text-yellow-400 hover:text-yellow-300 rounded-full hover:bg-yellow-500/10 transition-colors min-h-[44px] disabled:opacity-60 disabled:cursor-not-allowed"
							title="Importar treino via IA (foto/PDF)"
						>
							<ImageIcon size={18} />
							<span className="text-sm font-bold hidden sm:inline">Importar Treino (Foto/PDF)</span>
							<span className="text-sm font-bold sm:hidden">Importar</span>
						</button>
						<input
							ref={scannerFileInputRef}
							type="file"
							accept="image/*,application/pdf"
							multiple
							className="hidden"
							onChange={handleScannerFileChange}
						/>
						<button
							onClick={handleImportJsonClick}
							className="shrink-0 flex items-center gap-2 px-3 py-2 text-neutral-300 hover:text-white rounded-full hover:bg-neutral-800 transition-colors min-h-[44px]"
							title="Carregar JSON"
						>
							<Upload size={18} />
							<span className="text-sm font-bold hidden sm:inline">Carregar JSON</span>
							<span className="text-sm font-bold sm:hidden">JSON</span>
						</button>
						<input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportJson} />
					</div>
				</div>
			</div>

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
												<label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">
													{String(exercise?.name || '').toLowerCase() === 'bike outdoor'
														? 'Tempo (minutos) (opcional)'
														: 'Tempo (minutos)'}
												</label>
									<input
										type="number"
										min={String(exercise?.name || '').toLowerCase() === 'bike outdoor' ? undefined : 1}
										value={exercise.reps || ''}
										onChange={e => updateExercise(index, 'reps', e.target.value)}
										className="w-full bg-neutral-900 rounded-xl p-4 text-center text-xl font-bold text-white outline-none focus:ring-1 ring-blue-500 border border-neutral-700"
										placeholder={String(exercise?.name || '').toLowerCase() === 'bike outdoor' ? 'Livre' : '30'}
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
                                                                    {setIdx === 0 && (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isWarmup}
                                                                            onChange={(e) => updateSetDetail(index, setIdx, { is_warmup: !!e.target.checked })}
                                                                            className="accent-yellow-500"
                                                                        />
                                                                    )}
                                                                    {setIdx === 0 && 'Série de Aquecimento'}
                                                                </label>
                                                            </div>
                                                        </div>

												{(safeMethod === 'Normal' || safeMethod === 'Bi-Set' || (safeMethod === 'Rest-Pause' && !config)) && (
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

													{safeMethod === 'Rest-Pause' && config && typeof config === 'object' && (
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
