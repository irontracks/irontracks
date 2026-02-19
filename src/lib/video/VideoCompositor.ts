interface RenderOptions {
    videoElement: HTMLVideoElement;
    trimRange: [number, number];
    onDrawFrame: (ctx: CanvasRenderingContext2D, video: HTMLVideoElement) => void;
    onProgress?: (progress: number) => void;
    outputWidth?: number;
    outputHeight?: number;
    fps?: number;
    mimeTypeOverride?: string;
    videoBitsPerSecond?: number;
    audioBitsPerSecond?: number;
    cssFilter?: string;
}

interface ExportResult {
    blob: Blob;
    filename: string;
    mime: string;
    duration: number;
}

type VideoElementWithCapture = HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
    requestVideoFrameCallback?: (cb: () => void) => number;
};

type CanvasWithCapture = HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
    mozCaptureStream?: (fps?: number) => MediaStream;
};

export class VideoCompositor {
    private isCancelled = false;

    public cancel() {
        this.isCancelled = true;
    }

    private getBestMimeType(): string {
        if (typeof MediaRecorder === 'undefined') return 'video/webm';
        const candidates = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
        ];
        for (const t of candidates) {
            try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
        }
        return 'video/webm';
    }

    private canUseCaptureStream(): boolean {
        try {
            const c = document.createElement('canvas') as CanvasWithCapture;
            return typeof c.captureStream === 'function' || typeof c.mozCaptureStream === 'function';
        } catch { return false; }
    }

    private getCaptureStream(canvas: HTMLCanvasElement, fps: number): MediaStream | null {
        const c = canvas as CanvasWithCapture;
        try {
            if (typeof c.captureStream === 'function') return c.captureStream(fps);
            if (typeof c.mozCaptureStream === 'function') return c.mozCaptureStream(fps);
        } catch {}
        return null;
    }

    // Seek frame a frame, captura frames como ImageData, depois encoda via MediaRecorder
    public async render({
        videoElement,
        trimRange,
        onDrawFrame,
        onProgress,
        outputWidth = 1080,
        outputHeight = 1920,
        fps = 30,
        videoBitsPerSecond: userVideoBps,
        audioBitsPerSecond: userAudioBps,
        cssFilter = '',
    }: RenderOptions): Promise<ExportResult> {
        this.isCancelled = false;

        if (typeof window === 'undefined') throw new Error('Sem suporte a canvas');

        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Canvas context indisponível');

        const duration = Math.max(0.1, trimRange[1] - trimRange[0]);
        // Limitar fps a 15 para seek-based (reduz uso de memória drasticamente)
        // 15fps é suave o suficiente para stories (Instagram usa 30fps mas 15 é aceitável)
        const seekFps = Math.min(fps, 15);
        const frameInterval = 1 / seekFps;
        const totalFrames = Math.ceil(duration * seekFps);

        // ── FASE 1: capturar frames via seek ──────────────────────────────────
        const originalMuted = videoElement.muted;
        const originalLoop = videoElement.loop;
        const originalCurrentTime = videoElement.currentTime;
        videoElement.muted = true;
        videoElement.loop = false;

        let videoPaused = false;
        try { videoElement.pause(); videoPaused = true; } catch {}

        const seekTo = (time: number): Promise<void> => new Promise(resolve => {
            if (this.isCancelled) { resolve(); return; }
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                videoElement.removeEventListener('seeked', finish);
                resolve();
            };
            videoElement.addEventListener('seeked', finish);
            videoElement.currentTime = time;
            // Timeout de segurança caso seeked não dispare
            setTimeout(finish, 3000);
        });

        const frames: ImageData[] = [];

        try {
            for (let i = 0; i < totalFrames; i++) {
                if (this.isCancelled) throw new Error('Renderização cancelada');

                const targetTime = trimRange[0] + i * frameInterval;
                await seekTo(Math.min(targetTime, trimRange[1] - 0.001));

                if (cssFilter && cssFilter.trim() !== '') ctx.filter = cssFilter;
                else ctx.filter = 'none';
                onDrawFrame(ctx, videoElement);
                ctx.filter = 'none';

                frames.push(ctx.getImageData(0, 0, outputWidth, outputHeight));
                onProgress?.(i / totalFrames);
            }
        } finally {
            videoElement.muted = originalMuted;
            videoElement.loop = originalLoop;
            try { videoElement.currentTime = originalCurrentTime; } catch {}
        }

        if (this.isCancelled) throw new Error('Renderização cancelada');
        onProgress?.(0.95);

        // ── FASE 2: encodeamento ──────────────────────────────────────────────
        const mimeType = this.getBestMimeType();
        const videoBitsPerSecond = typeof userVideoBps === 'number' && userVideoBps > 0 ? userVideoBps : 4_000_000;
        const audioBitsPerSecond = typeof userAudioBps === 'number' && userAudioBps > 0 ? userAudioBps : 128_000;

        // Tenta encodeamento via MediaRecorder + captureStream
        if (this.canUseCaptureStream() && typeof MediaRecorder !== 'undefined') {
            const offCanvas = document.createElement('canvas');
            offCanvas.width = outputWidth;
            offCanvas.height = outputHeight;
            const offCtx = offCanvas.getContext('2d')!;

            const stream = this.getCaptureStream(offCanvas, seekFps);
            if (stream && stream.getVideoTracks().length > 0) {
                let recorder: MediaRecorder;
                try {
                    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond });
                } catch {
                    try { recorder = new MediaRecorder(stream, { mimeType }); }
                    catch { recorder = new MediaRecorder(stream); }
                }

                const chunks: Blob[] = [];
                recorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data); };

                const encodeDone = new Promise<void>((resolve, reject) => {
                    recorder.onstop = () => resolve();
                    recorder.onerror = (e) => reject(e);
                });

                recorder.start();

                const frameDelay = Math.round(1000 / seekFps);
                for (let i = 0; i < frames.length; i++) {
                    if (this.isCancelled) break;
                    offCtx.putImageData(frames[i], 0, 0);
                    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
                    if (typeof track?.requestFrame === 'function') track.requestFrame();
                    await new Promise(r => setTimeout(r, frameDelay));
                }

                // Timeout de segurança para stop
                const stopTimer = setTimeout(() => {
                    try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
                }, 5000);

                try { recorder.stop(); } catch {}
                await encodeDone;
                clearTimeout(stopTimer);

                // Parar tracks para liberar recursos
                stream.getTracks().forEach(t => { try { t.stop(); } catch {} });

                const blob = new Blob(chunks, { type: mimeType });
                const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                onProgress?.(1);
                return {
                    blob,
                    filename: `story-${Date.now()}.${ext}`,
                    mime: mimeType,
                    duration,
                };
            }
        }

        // Fallback: exportar como GIF animado via frames JPEG concatenados em MP4 não é possível
        // sem biblioteca externa. Neste caso, exportamos apenas o primeiro frame como imagem JPEG
        // com aviso para o usuário tentar em outro browser.
        throw new Error(
            'Seu navegador não suporta exportação de vídeo. ' +
            'Tente no Chrome (Android ou desktop) ou use "Baixar" para salvar a imagem do treino.'
        );
    }
}
