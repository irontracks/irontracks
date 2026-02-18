/**
 * VideoCompositor.ts - CORRIGIDO
 * Motor universal de composição e exportação de vídeo para o IronTracks.
 * Garante sincronia frame-a-frame, áudio mixado via Web Audio API e compatibilidade cross-platform.
 * 
 * CORREÇÃO: Agora SEMPRE prioriza MP4 para compatibilidade universal
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
     * 🔧 CORREÇÃO: Detecta o melhor formato priorizando MP4
     * Agora SEMPRE tenta MP4 primeiro para compatibilidade universal
     */
    private getBestMimeType(): string {
        // SEMPRE priorizar MP4 para compatibilidade com Safari e upload
        const mp4Candidates = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', // H.264 Main Profile + AAC
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',   // Sem aspas
            'video/mp4'                                  // Genérico
        ];

        for (const type of mp4Candidates) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log('[VideoCompositor] Usando formato:', type);
                return type;
            }
        }

        // Fallback para WebM apenas se MP4 não for suportado
        // Importante: Isso pode causar problemas no upload (ver StoriesBar.tsx linha 62)
        const webmCandidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];

        for (const type of webmCandidates) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.warn('[VideoCompositor] MP4 não suportado, usando WebM. Compatibilidade limitada no Safari.');
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
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.destNode = this.audioCtx.createMediaStreamDestination();
        
        try {
            this.sourceNode = this.audioCtx.createMediaElementSource(videoElement);
            this.sourceNode.connect(this.destNode);
        } catch (e) {
            console.warn('Falha ao conectar áudio via Web Audio API, tentando fallback simples', e);
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
        const originalMuted = videoElement.muted;
        const originalCurrentTime = videoElement.currentTime;
        const originalVolume = videoElement.volume;
        const originalLoop = videoElement.loop;

        videoElement.muted = false;
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
            if (videoElement.readyState >= 2 && !videoElement.seeking) {
                videoElement.removeEventListener('seeked', onSeek);
                resolve();
            }
        });

        // Iniciar gravação
        this.recorder.start(1000);
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

        const processFrame = () => {
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

            // @ts-ignore
            if (videoElement.requestVideoFrameCallback) {
                // @ts-ignore
                videoElement.requestVideoFrameCallback(processFrame);
            } else {
                requestAnimationFrame(processFrame);
            }
        };

        // Iniciar loop
        // @ts-ignore
        if (videoElement.requestVideoFrameCallback) {
            // @ts-ignore
            videoElement.requestVideoFrameCallback(processFrame);
        } else {
            requestAnimationFrame(processFrame);
        }

        // Aguardar fim
        try {
            const result = await recordingPromise;
            return result;
        } finally {
            videoElement.muted = originalMuted;
            videoElement.volume = originalVolume;
            videoElement.loop = originalLoop;
            this.cleanup();
        }
    }
}
