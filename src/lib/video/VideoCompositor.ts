interface RenderOptions {
    videoElement: HTMLVideoElement;
    trimRange: [number, number];
    onDrawFrame: (ctx: CanvasRenderingContext2D, video: HTMLVideoElement) => void;
    onProgress?: (progress: number) => void;
    outputWidth?: number; outputHeight?: number; fps?: number; mimeTypeOverride?: string;
    videoBitsPerSecond?: number; audioBitsPerSecond?: number;
    cssFilter?: string;
}

interface ExportResult {
    blob: Blob; filename: string; mime: string; duration: number;
}

type VideoElementWithCapture = HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
    requestVideoFrameCallback?: (cb: () => void) => number;
};

export class VideoCompositor {
    private ctx: CanvasRenderingContext2D | null = null; private canvas: HTMLCanvasElement | null = null;
    private audioCtx: AudioContext | null = null; private destNode: MediaStreamAudioDestinationNode | null = null;
    private sourceNode: MediaElementAudioSourceNode | null = null; private recorder: MediaRecorder | null = null;
    private isCancelled = false; private manualTimer: number | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: false });
        }
    }

    public cancel() {
        this.isCancelled = true;
        this.cleanup();
    }

    private cleanup() {
        if (this.manualTimer !== null) {
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

    private getBestMimeType(): string {
        const mp4Candidates = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/mp4'
        ];

        for (const type of mp4Candidates) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        const webmCandidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];

        for (const type of webmCandidates) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.warn('MP4 não suportado, usando WebM. Compatibilidade pode ser limitada.');
                return type;
            }
        }

        throw new Error('Nenhum formato de vídeo suportado encontrado neste navegador.');
    }

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
        audioBitsPerSecond: userAudioBps,
        cssFilter
    }: RenderOptions): Promise<ExportResult> {
        this.isCancelled = false;
        
        if (!this.canvas || !this.ctx) throw new Error('Canvas context not initialized');
        
        this.canvas.width = outputWidth;
        this.canvas.height = outputHeight;

        const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
        const AudioCtxCtor = w.AudioContext || w.webkitAudioContext
        if (!AudioCtxCtor) throw new Error('AudioContext not available')
        this.audioCtx = new AudioCtxCtor();
        this.destNode = this.audioCtx.createMediaStreamDestination();
        
        try {
            this.sourceNode = this.audioCtx.createMediaElementSource(videoElement);
            this.sourceNode.connect(this.destNode);
        } catch (e) {
            console.warn('Falha ao conectar áudio via Web Audio API, tentando fallback simples', e);
        }

        const canvasStream = this.canvas.captureStream(0); // 0 = modo manual
        if (this.destNode) {
            const audioTracks = this.destNode.stream.getAudioTracks();
            if (audioTracks.length > 0) {
                canvasStream.addTrack(audioTracks[0]);
            }
        } else {
            const v = videoElement as VideoElementWithCapture;
            const vidStream = v.captureStream ? v.captureStream() : v.mozCaptureStream ? v.mozCaptureStream() : null;
            if (vidStream) {
                const audioTracks = vidStream.getAudioTracks();
                if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);
            }
        }

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

        const originalMuted = videoElement.muted;
        const originalCurrentTime = videoElement.currentTime;
        const originalVolume = videoElement.volume;
        const originalLoop = videoElement.loop;

        videoElement.muted = false;
        videoElement.volume = 1.0;
        videoElement.loop = false;
        videoElement.currentTime = trimRange[0];

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

        this.recorder.start(1000);
        try {
            await videoElement.play();
        } catch (e) {
            try {
                if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
            } catch {}
            throw e;
        }

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
                if (cssFilter && typeof cssFilter === 'string' && cssFilter.trim() !== '') {
                    this.ctx.filter = cssFilter;
                }
                onDrawFrame(this.ctx, videoElement);
                this.ctx.filter = 'none';
            }

            // Sinalizar ao MediaRecorder que um novo frame está pronto
            const videoTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack & {
                requestFrame?: () => void
            }
            if (typeof videoTrack?.requestFrame === 'function') {
                videoTrack.requestFrame()
            }

            if (onProgress) {
                const current = Math.max(0, videoElement.currentTime - trimRange[0]);
                onProgress(Math.min(1, current / duration));
            }

            const v = videoElement as VideoElementWithCapture;
            if (typeof v.requestVideoFrameCallback === 'function') {
                v.requestVideoFrameCallback(() => processFrame())
            } else {
                // requestAnimationFrame é 60fps — metade dos frames seriam duplicatas para 30fps
                // setTimeout garante o intervalo correto
                this.manualTimer = setTimeout(processFrame, 1000 / fps) as unknown as number
            }
        };

        const v = videoElement as VideoElementWithCapture;
        if (typeof v.requestVideoFrameCallback === 'function') {
            v.requestVideoFrameCallback(() => processFrame())
        } else {
            // requestAnimationFrame é 60fps — metade dos frames seriam duplicatas para 30fps
            // setTimeout garante o intervalo correto
            this.manualTimer = setTimeout(processFrame, 1000 / fps) as unknown as number
        }

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
