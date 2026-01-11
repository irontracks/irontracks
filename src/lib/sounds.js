let __ctx;
let __unlocked = false;

const UNLOCK_SILENT_GAIN = 0.000001;
const UNLOCK_SILENT_DURATION_S = 0.03;

const ensureCtx = (opts) => {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const allowCreate = !!(opts && typeof opts === 'object' && opts.create);
    if (!__ctx || __ctx.state === 'closed') {
        if (!__unlocked && !allowCreate) return null;
        __ctx = new AC();
    }
    if (__ctx.state === 'suspended') { try { __ctx.resume(); } catch {} }
    return __ctx;
};

export const unlockAudio = () => {
    try {
        __unlocked = true;
        const ctx = ensureCtx({ create: true });
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            try {
                const maybePromise = ctx.resume();
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.catch(() => {});
                }
            } catch {}
        }
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(UNLOCK_SILENT_GAIN, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + UNLOCK_SILENT_DURATION_S);
        } catch {}
    } catch {}
};

export const playStartSound = () => {
    try {
        const ctx = ensureCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
        console.error("Erro ao tocar som de início:", e);
    }
};

export const playFinishSound = () => {
    try {
        const ctx = ensureCtx();
        if (!ctx) return;
        const playNote = (freq, time, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.2, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
            osc.start(time);
            osc.stop(time + duration);
        };
        const now = ctx.currentTime;
        playNote(523.25, now, 0.4);
        playNote(659.25, now + 0.1, 0.4);
        playNote(783.99, now + 0.2, 0.6);
        playNote(1046.5, now + 0.3, 0.8);
    } catch (e) {
        console.error("Erro ao tocar som de fim:", e);
    }
};

export const playTimerFinishSound = () => {
    try {
        const ctx = ensureCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(0, ctx.currentTime + 0.11);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
        osc.frequency.setValueAtTime(0, ctx.currentTime + 0.31);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Erro ao tocar som do timer:", e);
    }
};

export const playTick = () => {
    try {
        const ctx = ensureCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
        console.error("Erro ao tocar tick:", e);
    }
};
