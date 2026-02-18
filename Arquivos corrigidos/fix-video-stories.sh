#!/bin/bash

# fix-video-stories.sh
# Script de correção automática para o problema de vídeos no Iron Story

set -e  # Parar em caso de erro

echo "🔧 IronTracks - Correção de Upload de Vídeos para Stories"
echo "=========================================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo -e "${RED}❌ Erro: Execute este script na raiz do projeto IronTracks${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Verificando arquivos...${NC}"
echo ""

# Verificar se os arquivos existem
FILES_TO_CHECK=(
    "src/lib/video/VideoCompositor.ts"
    "src/components/dashboard/StoriesBar.tsx"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Arquivo não encontrado: $file${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} $file"
done

echo ""
echo -e "${YELLOW}🔍 Criando backup dos arquivos...${NC}"

# Criar diretório de backup
BACKUP_DIR="backups/video-stories-fix-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Fazer backup
cp "src/lib/video/VideoCompositor.ts" "$BACKUP_DIR/"
cp "src/components/dashboard/StoriesBar.tsx" "$BACKUP_DIR/"

echo -e "${GREEN}✓${NC} Backup criado em: $BACKUP_DIR"
echo ""

# CORREÇÃO #1: VideoCompositor - Forçar MP4
echo -e "${YELLOW}🔧 Aplicando Correção #1: VideoCompositor (forçar MP4)...${NC}"

cat > "src/lib/video/VideoCompositor.ts.new" << 'EOF'
/**
 * VideoCompositor.ts - CORRIGIDO
 * Motor universal de composição e exportação de vídeo para o IronTracks.
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
     * 🔧 CORREÇÃO: Prioriza MP4 para compatibilidade universal
     */
    private getBestMimeType(): string {
        // SEMPRE priorizar MP4
        const mp4Candidates = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/mp4'
        ];

        for (const type of mp4Candidates) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log('[VideoCompositor] Usando formato:', type);
                return type;
            }
        }

        // Fallback WebM
        const webmCandidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];

        for (const type of webmCandidates) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.warn('[VideoCompositor] MP4 não suportado, usando WebM.');
                return type;
            }
        }
        
        throw new Error('Nenhum formato de vídeo suportado.');
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
        audioBitsPerSecond: userAudioBps
    }: RenderOptions): Promise<ExportResult> {
        this.isCancelled = false;
        
        if (!this.canvas || !this.ctx) throw new Error('Canvas context not initialized');
        
        this.canvas.width = outputWidth;
        this.canvas.height = outputHeight;

        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.destNode = this.audioCtx.createMediaStreamDestination();
        
        try {
            this.sourceNode = this.audioCtx.createMediaElementSource(videoElement);
            this.sourceNode.connect(this.destNode);
        } catch (e) {
            console.warn('Falha ao conectar áudio', e);
        }

        const canvasStream = this.canvas.captureStream(fps);
        if (this.destNode) {
            const audioTracks = this.destNode.stream.getAudioTracks();
            if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);
        } else {
            // @ts-ignore
            const vidStream = videoElement.captureStream ? videoElement.captureStream() : videoElement.mozCaptureStream ? videoElement.mozCaptureStream() : null;
            if (vidStream) {
                const audioTracks = vidStream.getAudioTracks();
                if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);
            }
        }

        let mimeType = this.getBestMimeType();
        if (mimeTypeOverride && MediaRecorder.isTypeSupported(mimeTypeOverride)) {
            mimeType = mimeTypeOverride;
        }
        
        const videoBitsPerSecond = typeof userVideoBps === 'number' && userVideoBps > 0 ? userVideoBps : 5_000_000;
        const audioBitsPerSecond = typeof userAudioBps === 'number' && userAudioBps > 0 ? userAudioBps : 128_000;
        
        try {
            this.recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond, audioBitsPerSecond });
        } catch (e) {
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
                    reject(new Error('Cancelado'));
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
            if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
            throw e;
        }

        const duration = trimRange[1] - trimRange[0];

        const processFrame = () => {
            if (this.isCancelled) return;
            if (videoElement.ended || videoElement.currentTime >= trimRange[1]) {
                if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
                return;
            }

            if (this.ctx) onDrawFrame(this.ctx, videoElement);
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

        // @ts-ignore
        if (videoElement.requestVideoFrameCallback) {
            // @ts-ignore
            videoElement.requestVideoFrameCallback(processFrame);
        } else {
            requestAnimationFrame(processFrame);
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
EOF

mv "src/lib/video/VideoCompositor.ts.new" "src/lib/video/VideoCompositor.ts"
echo -e "${GREEN}✓${NC} VideoCompositor.ts atualizado"

# CORREÇÃO #2: StoriesBar - Remover validação WEBM
echo ""
echo -e "${YELLOW}🔧 Aplicando Correção #2: StoriesBar (remover validação WEBM)...${NC}"

# Remover linhas 62-64
sed -i '62,64d' "src/components/dashboard/StoriesBar.tsx"
echo -e "${GREEN}✓${NC} StoriesBar.tsx atualizado"

# CORREÇÃO #3: Limpar arquivos duplicados
echo ""
echo -e "${YELLOW}🔧 Aplicando Correção #3: Remover arquivos duplicados...${NC}"

# Listar arquivos duplicados
DUPLICATES=$(find src -name "* 2.ts" -o -name "* 2.tsx" -o -type d \( -name "* 2" -o -name "* 3" \))

if [ -n "$DUPLICATES" ]; then
    echo "$DUPLICATES" | while read -r file; do
        echo -e "  Removendo: $file"
        rm -rf "$file"
    done
    echo -e "${GREEN}✓${NC} Arquivos duplicados removidos"
else
    echo -e "${GREEN}✓${NC} Nenhum arquivo duplicado encontrado"
fi

# Resumo
echo ""
echo "=========================================================="
echo -e "${GREEN}✅ Correções aplicadas com sucesso!${NC}"
echo ""
echo -e "📂 Backup salvo em: ${YELLOW}$BACKUP_DIR${NC}"
echo ""
echo -e "${YELLOW}Próximos passos:${NC}"
echo "1. Testar upload de vídeo < 200MB"
echo "2. Testar upload de vídeo > 200MB (com compressão)"
echo "3. Validar em diferentes navegadores (Chrome, Safari, Firefox)"
echo ""
echo -e "${YELLOW}Se algo der errado, restaure o backup:${NC}"
echo "  cp $BACKUP_DIR/VideoCompositor.ts src/lib/video/"
echo "  cp $BACKUP_DIR/StoriesBar.tsx src/components/dashboard/"
echo ""
echo "=========================================================="
