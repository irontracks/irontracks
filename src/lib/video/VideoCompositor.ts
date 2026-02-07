/**
 * VideoCompositor.ts
 * Motor universal de composição e exportação de vídeo para o IronTracks.
 * Garante sincronia frame-a-frame, áudio mixado via Web Audio API e compatibilidade cross-platform.
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
}

interface ExportResult {
    blob: Blob;
    filename: string;
    mime: string;
    duration: number;
}

export class VideoCompositor {
    private ctx: CanvasRenderingContext2D | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private audioCtx: AudioContext | null = null;
    private destNode: MediaStreamAudioDestinationNode | null = null;
    private sourceNode: MediaElementAudioSourceNode | null = null;
    private recorder: MediaRecorder | null = null;
    private isCancelled = false;
    private manualTimer: number | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.canvas = document.createElement('canvas');
            // Desynchronized pode melhorar performance, alpha: false remove transparência desnecessária
            this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
        }
    }

    public cancel() {
        this.isCancelled = true;
        this.cleanup();
    }

    private cleanup() {
        if (this.manualTimer) {
            try { clearTimeout(this.manualTimer); } catch {}
        }
        this.manualTimer = null;
        if (this.sourceNode) {
            try { this.sourceNode.disconnect(); } catch {}
        }
        if (this.destNode) {
            try { this.destNode.disconnect(); } catch {}
        }
        if (this.audioCtx) {
            try { this.audioCtx.close(); } catch {}
        }
        if (this.recorder && this.recorder.state !== 'inactive') {
            try { this.recorder.stop(); } catch {}
        }
        this.sourceNode = null;
        this.destNode = null;
        this.audioCtx = null;
        this.recorder = null;
    }

    private async assembleBlob(chunks: Blob[], mimeType: string): Promise<Blob> {
        try {
            const safeChunks = Array.isArray(chunks) ? chunks : [];
            if (typeof Worker === 'undefined' || safeChunks.length === 0) {
                return new Blob(safeChunks, { type: mimeType });
            }
            const workerCode = `self.onmessage=(e)=>{try{const d=e.data||{};const list=Array.isArray(d.chunks)?d.chunks:[];const blob=new Blob(list,{type:d.type||''});self.postMessage({ok:true,blob});}catch(err){self.postMessage({ok:false,error:String(err&&err.message?err.message:err)});}};`;
            const url = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
            const worker = new Worker(url);
            try { URL.revokeObjectURL(url); } catch {}
            return await new Promise<Blob>((resolve) => {
                let settled = false;
                const done = (blob: Blob) => {
                    if (settled) return;
                    settled = true;
                    try { worker.terminate(); } catch {}
                    resolve(blob);
                };
                const fallback = () => done(new Blob(safeChunks, { type: mimeType }));
                const timer = setTimeout(() => fallback(), 3000);
                worker.onmessage = (ev) => {
                    try { clearTimeout(timer); } catch {}
                    const data = ev?.data || {};
                    if (data?.ok && data?.blob) {
                        done(data.blob);
                        return;
                    }
                    fallback();
                };
                worker.onerror = () => {
                    try { clearTimeout(timer); } catch {}
                    fallback();
                };
                try {
                    worker.postMessage({ chunks: safeChunks, type: mimeType });
                } catch {
                    try { clearTimeout(timer); } catch {}
                    fallback();
                }
            });
        } catch {
            return new Blob(Array.isArray(chunks) ? chunks : [], { type: mimeType });
        }
    }

    /**
     * Detecta o melhor formato suportado pelo navegador
     */
    private getBestMimeType(): string {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

        // Ordem de preferência: H.264 (MP4) > VP9 (WebM) > VP8 (WebM)
        const candidates = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', // H.264 Main Profile
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];

        // No iOS/Safari, forçamos a verificação estrita de MP4 primeiro
        if (isIOS || isSafari) {
            const mp4 = candidates.find(c => MediaRecorder.isTypeSupported(c));
            if (mp4) return mp4;
        }

        for (const type of candidates) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        
        throw new Error('Nenhum formato de vídeo suportado encontrado neste navegador.');
    }

    /**
     * Renderiza o vídeo frame a frame garantindo sincronia
     */
    public async render({
        videoElement,
        trimRange,
        onDrawFrame,
        onProgress,
        outputWidth = 1080,
        outputHeight = 1920,
        fps = 30,
        mimeTypeOverride,
        videoBitsPerSecond: userVideoBps,
        audioBitsPerSecond: userAudioBps
    }: RenderOptions): Promise<ExportResult> {
        this.isCancelled = false;
        
        if (!this.canvas || !this.ctx) throw new Error('Canvas context not initialized');
        
        // 1. Setup Canvas
        this.canvas.width = outputWidth;
        this.canvas.height = outputHeight;

        // 2. Setup Audio (Web Audio API para mixagem robusta)
        // Necessário user gesture prévio para AudioContext em alguns browsers, mas aqui já estamos num fluxo iniciado pelo user
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.destNode = this.audioCtx.createMediaStreamDestination();
        
        // Conecta o vídeo ao destino de gravação
        try {
            this.sourceNode = this.audioCtx.createMediaElementSource(videoElement);
            this.sourceNode.connect(this.destNode);
            // Também conecta ao destino padrão (speakers) se quisermos ouvir durante o processo? 
            // Melhor não, para não dar eco. O vídeo será mutado visualmente mas processado internamente.
        } catch (e) {
            console.warn('Falha ao conectar áudio via Web Audio API, tentando fallback simples', e);
            // Fallback: tentar capturar stream direto do vídeo se possível, ou prosseguir mudo
        }

        // 3. Preparar Stream de Saída
        const canvasStream = this.canvas.captureStream(fps);
        if (this.destNode) {
            const audioTracks = this.destNode.stream.getAudioTracks();
            if (audioTracks.length > 0) {
                canvasStream.addTrack(audioTracks[0]);
            }
        } else {
            // Tenta pegar direto do vídeo se Web Audio falhou
            // @ts-ignore
            const vidStream = videoElement.captureStream ? videoElement.captureStream() : videoElement.mozCaptureStream ? videoElement.mozCaptureStream() : null;
            if (vidStream) {
                const audioTracks = vidStream.getAudioTracks();
                if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);
            }
        }

        // 4. Setup Gravador
        let mimeType = this.getBestMimeType();
        if (mimeTypeOverride) {
            try {
                if (MediaRecorder.isTypeSupported(mimeTypeOverride)) {
                    mimeType = mimeTypeOverride;
                }
            } catch {}
        }
        const videoBitsPerSecond = typeof userVideoBps === 'number' && userVideoBps > 0 ? userVideoBps : 5_000_000;
        const audioBitsPerSecond = typeof userAudioBps === 'number' && userAudioBps > 0 ? userAudioBps : 128_000;
        
        try {
            this.recorder = new MediaRecorder(canvasStream, {
                mimeType,
                videoBitsPerSecond,
                audioBitsPerSecond
            });
        } catch (e) {
            console.warn('Bitrate control not supported, using defaults', e);
            this.recorder = new MediaRecorder(canvasStream, { mimeType });
        }

        const chunks: Blob[] = [];
        this.recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        // Promise que resolve quando a gravação termina
        const recordingPromise = new Promise<ExportResult>((resolve, reject) => {
            if (!this.recorder) return reject(new Error('Recorder not initialized'));

            this.recorder.onstop = async () => {
                if (this.isCancelled) {
                    reject(new Error('Renderização cancelada'));
                    return;
                }
                try {
                    const blob = await this.assembleBlob(chunks, mimeType);
                    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                    resolve({
                        blob,
                        filename: `story-${Date.now()}.${ext}`,
                        mime: mimeType,
                        duration: (trimRange[1] - trimRange[0])
                    });
                } catch (e) {
                    reject(e);
                }
            };
            this.recorder.onerror = (e) => reject(e);
        });

        // 5. Loop de Renderização Síncrona
        // Salvar estado original do vídeo
        const originalMuted = videoElement.muted;
        const originalCurrentTime = videoElement.currentTime;
        const originalVolume = videoElement.volume;
        const originalLoop = videoElement.loop;

        // Preparar vídeo
        videoElement.muted = false; // Necessário para o AudioContext capturar (mas não sai som se não conectar ao destination)
        videoElement.volume = 1.0;
        videoElement.loop = false;
        videoElement.currentTime = trimRange[0];

        // Aguardar seek
        await new Promise<void>(resolve => {
            const onSeek = () => {
                videoElement.removeEventListener('seeked', onSeek);
                resolve();
            };
            videoElement.addEventListener('seeked', onSeek);
            // Fallback se já estiver pronto
            if (videoElement.readyState >= 2 && !videoElement.seeking) {
                videoElement.removeEventListener('seeked', onSeek);
                resolve();
            }
        });

        // Iniciar gravação com timeslice para melhor gerenciamento de memória
        this.recorder.start(1000); // 1 segundo chunks
        try {
            await videoElement.play();
        } catch (e) {
            try {
                if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
            } catch {}
            throw e;
        }

        // Loop principal
        const duration = trimRange[1] - trimRange[0];
        
        const useManualFps = false;
        const frameIntervalMs = fps > 0 ? (1000 / fps) : 33.3333333333;
        let lastManualTs = 0;

        const processFrame = () => {
            if (this.isCancelled) return;

            // Checar fim
            if (videoElement.ended || videoElement.currentTime >= trimRange[1]) {
                if (this.recorder && this.recorder.state === 'recording') {
                    this.recorder.stop();
                }
                return;
            }

            // Desenhar frame
            if (this.ctx) {
                onDrawFrame(this.ctx, videoElement);
            }

            // Atualizar progresso
            if (onProgress) {
                const current = Math.max(0, videoElement.currentTime - trimRange[0]);
                onProgress(Math.min(1, current / duration));
            }

            // Próximo frame
            // @ts-ignore
            if (videoElement.requestVideoFrameCallback) {
                // @ts-ignore
                videoElement.requestVideoFrameCallback(processFrame);
            } else {
                requestAnimationFrame(processFrame);
            }
        };

        const processFrameManual = () => {
            if (this.isCancelled) return;

            if (videoElement.ended || videoElement.currentTime >= trimRange[1]) {
                if (this.recorder && this.recorder.state === 'recording') {
                    this.recorder.stop();
                }
                return;
            }

            if (this.ctx) {
                onDrawFrame(this.ctx, videoElement);
            }

            if (onProgress) {
                const current = Math.max(0, videoElement.currentTime - trimRange[0]);
                onProgress(Math.min(1, current / duration));
            }

            const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
            const elapsed = lastManualTs ? (now - lastManualTs) : 0;
            const delay = Math.max(0, frameIntervalMs - elapsed);
            lastManualTs = now;
            try {
                this.manualTimer = setTimeout(processFrameManual, delay) as unknown as number;
            } catch {
                this.manualTimer = null;
            }
        };

        // Iniciar loop
        if (useManualFps) {
            processFrameManual();
        }
        if (!useManualFps) {
            // @ts-ignore
            if (videoElement.requestVideoFrameCallback) {
                // @ts-ignore
                videoElement.requestVideoFrameCallback(processFrame);
            } else {
                requestAnimationFrame(processFrame);
            }
        }

        // Aguardar fim
        try {
            const result = await recordingPromise;
            return result;
        } finally {
            // Restaurar estado
            videoElement.muted = originalMuted;
            videoElement.volume = originalVolume;
            videoElement.loop = originalLoop;
            // Não restauramos currentTime aqui para não travar a UI, deixamos onde parou ou voltamos pro início
            this.cleanup();
        }
    }
}
