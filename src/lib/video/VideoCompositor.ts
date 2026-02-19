/**
 * VideoCompositor — exportação de vídeo com overlay
 *
 * Estratégia:
 *  - Desktop Chrome (captureStream + requestVideoFrameCallback disponíveis):
 *      Gravação em tempo real via MediaRecorder enquanto o vídeo toca.
 *  - Qualquer outro browser (Safari, Firefox, Chrome mobile):
 *      Retorna erro claro pedindo para usar Chrome desktop,
 *      pois captureStream não é suportado de forma confiável.
 *
 * Nota: A composição de vídeo no browser é fundamentalmente limitada.
 * Para suporte universal, a composição deve ser feita no servidor (ffmpeg).
 */

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

type VideoElx = HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
    requestVideoFrameCallback?: (cb: () => void) => number;
};

type CanvasElx = HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
    mozCaptureStream?: (fps?: number) => MediaStream;
};

export class VideoCompositor {
    private isCancelled = false;
    private recorder: MediaRecorder | null = null;
    private audioCtx: AudioContext | null = null;

    public cancel() {
        this.isCancelled = true;
        try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch {}
        try { if (this.audioCtx) this.audioCtx.close(); } catch {}
    }

    private getMimeType(): string {
        if (typeof MediaRecorder === 'undefined') return '';
        const list = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
        ];
        for (const t of list) {
            try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {}
        }
        return '';
    }

    private isSupported(videoEl: HTMLVideoElement): boolean {
        // Precisa de captureStream no canvas E requestVideoFrameCallback no video
        try {
            const c = document.createElement('canvas') as CanvasElx;
            const hasCapture = typeof c.captureStream === 'function' || typeof c.mozCaptureStream === 'function';
            const v = videoEl as VideoElx;
            const hasRVFC = typeof v.requestVideoFrameCallback === 'function';
            const hasMR = typeof MediaRecorder !== 'undefined' && !!this.getMimeType();
            return hasCapture && hasRVFC && hasMR;
        } catch { return false; }
    }

    public async render({
        videoElement,
        trimRange,
        onDrawFrame,
        onProgress,
        outputWidth = 1080,
        outputHeight = 1920,
        fps = 30,
        videoBitsPerSecond: userVBps,
        audioBitsPerSecond: userABps,
        cssFilter = '',
    }: RenderOptions): Promise<ExportResult> {
        this.isCancelled = false;

        if (!this.isSupported(videoElement)) {
            throw new Error(
                'BROWSER_NOT_SUPPORTED'
            );
        }

        const mimeType = this.getMimeType();
        const vBps = typeof userVBps === 'number' && userVBps > 0 ? userVBps : 6_000_000;
        const aBps = typeof userABps === 'number' && userABps > 0 ? userABps : 128_000;

        // Canvas offscreen para composição
        const canvas = document.createElement('canvas') as CanvasElx;
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Canvas context indisponível');

        // Captura stream do canvas
        const stream = canvas.captureStream
            ? canvas.captureStream(fps)
            : (canvas as CanvasElx).mozCaptureStream!(fps);

        // Áudio via Web Audio API
        try {
            const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
            const Ctor = w.AudioContext || w.webkitAudioContext;
            if (Ctor) {
                this.audioCtx = new Ctor();
                const dest = this.audioCtx.createMediaStreamDestination();
                const src = this.audioCtx.createMediaElementSource(videoElement);
                src.connect(dest);
                src.connect(this.audioCtx.destination); // monitora o áudio
                dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
            }
        } catch (e) {
            console.warn('Áudio não disponível na composição:', e);
        }

        // MediaRecorder
        let recorder: MediaRecorder;
        try {
            recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: vBps, audioBitsPerSecond: aBps });
        } catch {
            try { recorder = new MediaRecorder(stream, { mimeType }); }
            catch { recorder = new MediaRecorder(stream); }
        }
        this.recorder = recorder;

        const chunks: Blob[] = [];
        recorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data); };

        const duration = Math.max(0.1, trimRange[1] - trimRange[0]);

        // Promise que resolve quando o recorder para
        const recDone = new Promise<ExportResult>((resolve, reject) => {
            recorder.onstop = () => {
                clearTimeout(safetyId);
                if (this.isCancelled) { reject(new Error('Cancelado')); return; }
                const blob = new Blob(chunks, { type: mimeType });
                const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                resolve({ blob, filename: `story-${Date.now()}.${ext}`, mime: mimeType, duration });
            };
            recorder.onerror = reject;
        });

        // Restaurar estado do vídeo no finally
        const origMuted = videoElement.muted;
        const origLoop = videoElement.loop;
        const origVolume = videoElement.volume;

        videoElement.muted = false;
        videoElement.volume = 1.0;
        videoElement.loop = false;
        videoElement.currentTime = trimRange[0];

        // Aguarda seek inicial
        await new Promise<void>(res => {
            let done = false;
            const finish = () => { if (done) return; done = true; videoElement.removeEventListener('seeked', finish); res(); };
            videoElement.addEventListener('seeked', finish);
            if (videoElement.readyState >= 2 && !videoElement.seeking) finish();
            setTimeout(finish, 3000);
        });

        recorder.start(500);

        // Safety timer: força stop se o vídeo não terminar no tempo esperado
        const safetyId = setTimeout(() => {
            try { if (recorder.state !== 'inactive') { videoElement.pause(); recorder.stop(); } } catch {}
        }, (duration + 8) * 1000);

        // Play
        try {
            await videoElement.play();
        } catch (e) {
            clearTimeout(safetyId);
            try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
            videoElement.muted = origMuted;
            videoElement.loop = origLoop;
            videoElement.volume = origVolume;
            if (this.audioCtx) { try { this.audioCtx.close(); } catch {} }
            throw e;
        }

        // Loop de frames via requestVideoFrameCallback
        const v = videoElement as VideoElx;
        const videoTrack = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };

        const drawFrame = () => {
            if (this.isCancelled) {
                try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
                return;
            }

            // Fim do trecho
            if (videoElement.ended || videoElement.currentTime >= trimRange[1] - 0.05) {
                videoElement.pause();
                try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
                return;
            }

            // Desenha frame
            if (cssFilter && cssFilter.trim()) ctx.filter = cssFilter;
            else ctx.filter = 'none';
            onDrawFrame(ctx, videoElement);
            ctx.filter = 'none';

            // Sinaliza novo frame ao MediaRecorder
            if (typeof videoTrack?.requestFrame === 'function') videoTrack.requestFrame();

            // Progresso
            if (onProgress) {
                const elapsed = Math.max(0, videoElement.currentTime - trimRange[0]);
                onProgress(Math.min(0.99, elapsed / duration));
            }

            // Próximo frame
            v.requestVideoFrameCallback!(drawFrame);
        };

        v.requestVideoFrameCallback!(drawFrame);

        try {
            const result = await recDone;
            onProgress?.(1);
            return result;
        } finally {
            videoElement.muted = origMuted;
            videoElement.loop = origLoop;
            videoElement.volume = origVolume;
            stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
            if (this.audioCtx) { try { this.audioCtx.close(); } catch {} }
            this.recorder = null;
            this.audioCtx = null;
        }
    }
}
