/**
 * @module scannerDetection
 *
 * Pure utility functions extracted from ExerciseEditor for detecting
 * exercise types and training methods when importing from AI scanner results.
 * These functions have no side-effects and can be reused across components.
 */

const REST_PAUSE_DEFAULT_PAUSE_SEC = 20;

const CARDIO_OPTIONS = ['Escada', 'Esteira', 'Bicicleta', 'Bike Outdoor', 'Corrida', 'Caminhada', 'Elíptico'];
const DEFAULT_CARDIO_OPTION = 'Esteira';

export interface CardioDetection {
    modality: string;
    minutes: number;
}

export interface RestPauseDetection {
    method: 'Rest-Pause';
    normalizedReps: string;
    cleanedNotes: string;
    config: {
        initial_reps: number | null;
        mini_sets: number | null;
        rest_time_sec: number;
    };
}

/**
 * Detect if an exercise scanned from an image is a cardio exercise.
 * Returns cardio metadata or null if not cardio.
 */
export function detectCardioFromScanner(name: unknown, reps: unknown, notes: unknown): CardioDetection | null {
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
        minutes: resolvedMinutes,
    };
}

/**
 * Detect Rest-Pause training method configuration from scanned exercise data.
 * Returns rest-pause metadata or null if not rest-pause.
 */
export function detectRestPauseConfig(name: unknown, reps: unknown, notes: unknown): RestPauseDetection | null {
    const text = `${String(name || '')} ${String(reps || '')} ${String(notes || '')}`.toLowerCase();
    const hasRestPause = text.includes('rest-pause') || text.includes('rest pause') || text.includes('restpause');
    if (!hasRestPause) return null;

    const source = `${String(reps || '')} ${String(notes || '')}`;

    const plusMatch = source.match(/(\d+)\s*\+\s*(\d+)(?:\s*\+\s*(\d+))?/);
    if (plusMatch) {
        const numbers = [plusMatch[1], plusMatch[2], plusMatch[3]].filter(Boolean).map(Number);
        const initialReps = numbers[0];
        const miniSets = numbers.length > 1 ? numbers.length : 2;

        const cleanedNotes = String(notes || '')
            .replace(/rest[- ]?pause/gi, '')
            .replace(plusMatch[0], `rest-pause ${numbers.join('+')}`)
            .trim();

        return {
            method: 'Rest-Pause',
            normalizedReps: String(reps || initialReps).trim() || String(initialReps),
            cleanedNotes,
            config: {
                initial_reps: initialReps,
                mini_sets: miniSets || null,
                rest_time_sec: REST_PAUSE_DEFAULT_PAUSE_SEC,
            },
        };
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
                rest_time_sec: REST_PAUSE_DEFAULT_PAUSE_SEC,
            },
        };
    }

    return {
        method: 'Rest-Pause',
        normalizedReps: String(reps || '').trim() || '10',
        cleanedNotes: String(notes || '').trim(),
        config: {
            initial_reps: null,
            mini_sets: null,
            rest_time_sec: REST_PAUSE_DEFAULT_PAUSE_SEC,
        },
    };
}

/**
 * Extract per-set rep targets from an exercise's primary reps and notes fields.
 * Used by scanner to assign different rep counts to individual sets.
 */
export function extractRepsTargets(primaryReps: unknown, notes: unknown): string[] {
    const normalize = (value: unknown) => {
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

    const targets: string[] = [];
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
}
