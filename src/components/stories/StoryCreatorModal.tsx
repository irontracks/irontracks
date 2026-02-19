'use client';

import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { X, Type, Smile, Scissors, Sparkles, Send, Loader2, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { VideoCompositor } from '@/lib/video/VideoCompositor';

const FILTERS = [
  { name: 'Normal', class: '' },
  { name: 'Vivid', class: 'brightness-110 contrast-125 saturate-150' },
  { name: 'Noir', class: 'grayscale contrast-125 brightness-90' },
  { name: 'Vintage', class: 'sepia-[.5] contrast-90 brightness-110 hue-rotate-[-10deg]' },
  { name: 'Cool', class: 'saturate-50 hue-rotate-30 contrast-110' },
  { name: 'Warm', class: 'sepia-[.3] saturate-150 hue-rotate-[-10deg]' },
  { name: 'Dramatic', class: 'contrast-150 saturate-0 brightness-90' },
];

const EMOJIS = ['🔥', '💪', '🏋️', '💯', '🥵', '🚀', '😤', '💧', '🥗', '🥩', '🍗', '🛑', '✅', '❌', '⚠️', '💤', '❤️', '👏'];
const COLORS = ['#FFFFFF', '#000000', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];

const MAX_VIDEO_SECONDS = 60;
const PHOTO_SECONDS = 15;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MIN_TRIM_SECONDS = 0.5;
const COMPRESS_MAX_WIDTH = 720;
const COMPRESS_MAX_HEIGHT = 1280;
const COMPRESS_VIDEO_BPS = 2_500_000;
const COMPRESS_AUDIO_BPS = 96_000;

type StoryMediaType = 'image' | 'video';
type StoryStep = 'picker' | 'editor';
type StoryTool = 'text' | 'emoji' | 'filter' | 'trim' | null;

type StoryOverlay =
  | { id: number; type: 'text'; content: string; x: number; y: number; color: string; scale: number }
  | { id: number; type: 'emoji'; content: string; x: number; y: number; scale: number };

type StoryCreatorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onPost: (file: File, metadata?: any) => Promise<void> | void;
};

export default function StoryCreatorModal({ isOpen, onClose, onPost }: StoryCreatorModalProps) {
  const [step, setStep] = useState<StoryStep>('picker');
  const [media, setMedia] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<StoryMediaType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Editor State
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(FILTERS[0]);
  const [overlays, setOverlays] = useState<StoryOverlay[]>([]);
  const [activeTool, setActiveTool] = useState<StoryTool>(null);
  
  // Text Tool State
  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  
  // Video Trim State
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [compressionRunning, setCompressionRunning] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionError, setCompressionError] = useState('');
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const trackWidthRef = useRef(0);
  const compositorRef = useRef<VideoCompositor | null>(null);
  const [posting, setPosting] = useState(false);

  const startX = useMotionValue(0);
  const endX = useMotionValue(0);
  const selectedWidth = useTransform([startX, endX], ([s, e]) => Math.max(0, (e as number) - (s as number)));

  // Update track width and thumb positions
  useEffect(() => {
    if (activeTool !== 'trim') return;
    
    const update = () => {
        if (!trackRef.current) return;
        const w = trackRef.current.getBoundingClientRect().width;
        trackWidthRef.current = w;
        
        if (videoDuration > 0) {
            startX.set((trimRange.start / videoDuration) * w);
            endX.set((trimRange.end / videoDuration) * w);
        }
    };

    update();
    window.addEventListener('resize', update);
    // Also update after a short delay to ensure modal animation finished
    setTimeout(update, 100);
    setTimeout(update, 300);
    
    return () => window.removeEventListener('resize', update);
  }, [activeTool, videoDuration, trimRange.start, trimRange.end]);

  // --- File Handling ---
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = String(file.type || '').toLowerCase().startsWith('video');
    const isImage = String(file.type || '').toLowerCase().startsWith('image');
    if (!isVideo && !isImage) {
      try { e.target.value = ''; } catch {}
      alert('Selecione uma imagem ou um vídeo.');
      return;
    }

    if (isImage && file.size > MAX_IMAGE_BYTES) {
      try { e.target.value = ''; } catch {}
      alert(`Imagem muito grande (máx 12MB). Atual: ${(file.size / (1024 * 1024)).toFixed(1)}MB`);
      return;
    }

    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      try { e.target.value = e.target.value; } catch {}
      alert(`Vídeo acima de 200MB. Vamos comprimir antes de publicar. Atual: ${(file.size / (1024 * 1024)).toFixed(1)}MB`);
    }

    const url = URL.createObjectURL(file);
    setMedia(file);
    setPreviewUrl(url);
    setMediaType(file.type.startsWith('video') ? 'video' : 'image');
    setStep('editor');
    setCompressionError('');
    setCompressionRunning(false);
    setCompressionProgress(0);
    
    // Reset state
    setFilter(FILTERS[0]);
    setOverlays([]);
    setActiveTool(null);
  };

  useEffect(() => {
    if (!isOpen) {
      setStep('picker');
      setMedia(null);
      setPreviewUrl(null);
      setOverlays([]);
      setCompressionRunning(false);
      setCompressionProgress(0);
      setCompressionError('');
    }
  }, [isOpen]);

  // --- Video Logic ---
    const handleVideoLoad = () => {
        if (videoRef.current) {
            const dur = videoRef.current.duration;
            if (Number.isFinite(dur)) {
                const safeDur = Math.max(0, dur);
                setVideoDuration(safeDur);
                const end = Math.min(safeDur, MAX_VIDEO_SECONDS);
                setTrimRange({ start: 0, end });
                try { videoRef.current.currentTime = 0; } catch {}
            }
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current && mediaType === 'video') {
            const start = Math.max(0, trimRange.start);
            const maxEnd = Math.min(trimRange.end, start + MAX_VIDEO_SECONDS);
            if (videoRef.current.currentTime >= maxEnd) {
                videoRef.current.pause();
                try { videoRef.current.currentTime = start; } catch {}
                setIsPlaying(false);
            }
        }
    };

    const safePlay = async () => {
        if (!videoRef.current) return;
        try {
            await videoRef.current.play();
            setIsPlaying(true);
        } catch (err) {
            console.warn('Playback interrupted:', err);
            setIsPlaying(false);
        }
    };

    const safePause = () => {
        if (!videoRef.current) return;
        videoRef.current.pause();
        setIsPlaying(false);
    };

    const togglePlay = () => {
        if (isPlaying) safePause();
        else safePlay();
    };

  // --- Overlay Logic ---
  const addText = () => {
    if (!textInput.trim()) return;
    setOverlays([...overlays, {
      id: Date.now(),
      type: 'text',
      content: textInput,
      x: 50, // %
      y: 50, // %
      color: textColor,
      scale: 1
    }]);
    setTextInput('');
    setActiveTool(null);
  };

  const addEmoji = (emoji: string) => {
    setOverlays([...overlays, {
      id: Date.now(),
      type: 'emoji',
      content: emoji,
      x: 50,
      y: 50,
      scale: 1.5
    }]);
    setActiveTool(null);
  };

  const updateOverlayPos = (id: number, info: any) => {
     // info.point is relative to viewport, we need percentage of container
     if (!containerRef.current) return;
     const rect = containerRef.current.getBoundingClientRect();
     // Calculate center of element based on drag
     // Framer motion drag gives us delta or point. 
     // A simpler way with framer motion is to update state onDragEnd
  };

  const handleDragEnd = (id: number, info: any) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = Number(info?.offset?.x || 0);
    const dy = Number(info?.offset?.y || 0);
    const dxPct = rect.width > 0 ? (dx / rect.width) * 100 : 0;
    const dyPct = rect.height > 0 ? (dy / rect.height) * 100 : 0;

    setOverlays(prev =>
      prev.map(o => {
        if (o.id !== id) return o;
        const newX = Math.max(0, Math.min(100, o.x + dxPct));
        const newY = Math.max(0, Math.min(100, o.y + dyPct));
        return { ...o, x: newX, y: newY };
      })
    );
  };

  const removeOverlay = (id: number) => {
    setOverlays(overlays.filter(o => o.id !== id));
  };

  // --- Export Logic ---
  const handlePost = async () => {
    if (!media) return;
    setPosting(true);

    try {
      if (!previewUrl) throw new Error('preview_unavailable');
      let fileToUpload = media;
      setCompressionError('');
      let metadata: any = {
        filter: filter.class ? filter.class : undefined,
        trim: mediaType === 'video' ? {
          start: Math.max(0, trimRange.start),
          end: Math.max(Math.min(trimRange.end, trimRange.start + MAX_VIDEO_SECONDS), trimRange.start + MIN_TRIM_SECONDS)
        } : undefined,
        durationSec: mediaType === 'image' ? PHOTO_SECONDS : Math.min(MAX_VIDEO_SECONDS, Math.max(MIN_TRIM_SECONDS, trimRange.end - trimRange.start)),
        // Only send necessary overlay data
        overlays: overlays.map(o => ({ 
            type: o.type, 
            content: o.content, 
            x: Number(o.x.toFixed(2)), 
            y: Number(o.y.toFixed(2)), 
            color: 'color' in o ? o.color : undefined, 
            scale: o.scale 
        }))
      };

      // Payload Size Check (approximate)
      const payloadSize = JSON.stringify(metadata).length;
      if (payloadSize > 50 * 1024) { // 50KB limit for metadata
          throw new Error('Muitos elementos no story. Remova alguns para publicar.');
      }

      if (mediaType === 'image') {
        // Burn everything into canvas for images
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas_unsupported');
        const img = new window.Image();
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = previewUrl;
        });

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Draw Image with Filter
        const previewEl = document.querySelector('#preview-img') as HTMLElement | null;
        const cssFilter = previewEl ? getComputedStyle(previewEl).filter : 'none';
        ctx.filter = cssFilter;
        ctx.drawImage(img, 0, 0);
        ctx.filter = 'none';

        // Draw Overlays
        overlays.forEach(ov => {
            ctx.save();
            const x = (ov.x / 100) * canvas.width;
            const y = (ov.y / 100) * canvas.height;
            
            ctx.translate(x, y);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            if (ov.type === 'text') {
                const fontSize = canvas.width * 0.08 * ov.scale; // Responsive font size
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = ov.color;
                ctx.strokeStyle = 'black';
                ctx.lineWidth = fontSize * 0.05;
                ctx.strokeText(ov.content, 0, 0);
                ctx.fillText(ov.content, 0, 0);
            } else {
                const fontSize = canvas.width * 0.15 * ov.scale;
                ctx.font = `${fontSize}px serif`;
                ctx.fillText(ov.content, 0, 0);
            }
            ctx.restore();
        });

        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob_failed'))), 'image/jpeg', 0.9)
        );
        fileToUpload = new File([blob], `story_${Date.now()}.jpg`, { type: 'image/jpeg' });
        metadata.processed = true; // Flag to skip server processing if any
      }

      if (mediaType === 'video' && fileToUpload.size > MAX_VIDEO_BYTES) {
        setCompressionRunning(true);
        setCompressionProgress(0);
        const v = videoRef.current;
        if (!v) throw new Error('video_not_ready');
        const ensureReady = () => new Promise<void>((resolve, reject) => {
          try {
            if (Number.isFinite(v.duration) && v.duration > 0) return resolve();
          } catch {}
          const onLoaded = () => {
            try { v.removeEventListener('loadedmetadata', onLoaded); } catch {}
            resolve();
          };
          try { v.addEventListener('loadedmetadata', onLoaded); } catch {}
          setTimeout(() => reject(new Error('video_metadata_timeout')), 4000);
        });
        await ensureReady();
        const start = Math.max(0, trimRange.start);
        const maxEnd = Math.min(trimRange.end, start + MAX_VIDEO_SECONDS);
        const end = Math.max(start + MIN_TRIM_SECONDS, maxEnd);
        const srcW = Number(v.videoWidth || COMPRESS_MAX_WIDTH);
        const srcH = Number(v.videoHeight || COMPRESS_MAX_HEIGHT);
        const scale = Math.min(1, COMPRESS_MAX_WIDTH / srcW, COMPRESS_MAX_HEIGHT / srcH);
        const outW = Math.max(2, Math.round(srcW * scale));
        const outH = Math.max(2, Math.round(srcH * scale));
        const compositor = new VideoCompositor();
        compositorRef.current = compositor;
        const previewEl = document.querySelector('#preview-img') as HTMLElement | null;
        const cssFilter = previewEl ? getComputedStyle(previewEl).filter : 'none';
        const result = await compositor.render({
          videoElement: v,
          trimRange: [start, end],
          cssFilter,
          onDrawFrame: (ctx, video) => {
            try { ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height); } catch {}
            // Render overlays on video frames
            overlays.forEach(ov => {
                ctx.save();
                const x = (ov.x / 100) * ctx.canvas.width;
                const y = (ov.y / 100) * ctx.canvas.height;
                ctx.translate(x, y);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (ov.type === 'text') {
                    const fontSize = ctx.canvas.width * 0.08 * ov.scale;
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.fillStyle = ov.color;
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = fontSize * 0.05;
                    ctx.strokeText(ov.content, 0, 0);
                    ctx.fillText(ov.content, 0, 0);
                } else {
                    const fontSize = ctx.canvas.width * 0.15 * ov.scale;
                    ctx.font = `${fontSize}px serif`;
                    ctx.fillText(ov.content, 0, 0);
                }
                ctx.restore();
            });
          },
          outputWidth: outW,
          outputHeight: outH,
          fps: 30,
          videoBitsPerSecond: COMPRESS_VIDEO_BPS,
          audioBitsPerSecond: COMPRESS_AUDIO_BPS,
          onProgress: (p) => {
            try { setCompressionProgress(Math.max(0, Math.min(1, Number(p || 0)))); } catch {}
          }
        });
        fileToUpload = new File([result.blob], result.filename, { type: result.mime || 'video/mp4' });
        metadata.processed = true;
      }

      await onPost(fileToUpload, metadata);
      onClose();
    } catch (err) {
      console.error(err);
      const errMsg = String((err as Record<string, unknown>)?.message || '').toLowerCase();
      if (errMsg.includes('video_metadata_timeout')) {
        setCompressionError('Não foi possível carregar o vídeo para compressão. Tente novamente.');
      } else if (errMsg.includes('cancel')) {
        // Silently handled
      } else if (mediaType === 'video' && media?.size > MAX_VIDEO_BYTES) {
        setCompressionError('Falha ao comprimir o vídeo. Reduza duração ou resolução e tente novamente.');
      }
      if (!errMsg.includes('cancel')) {
         alert('Erro ao processar story');
      }
    } finally {
      setPosting(false);
      setCompressionRunning(false);
      compositorRef.current = null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col pb-safe">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 pt-safe flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={onClose} className="p-2 bg-black/20 rounded-full backdrop-blur-md">
            <X className="text-white" />
        </button>
        {step === 'editor' && (
            <div className="flex gap-4">
                <button onClick={() => setActiveTool(activeTool === 'text' ? null : 'text')} className={`p-2 rounded-full backdrop-blur-md ${activeTool === 'text' ? 'bg-white text-black' : 'bg-black/20 text-white'}`}>
                    <Type size={20} />
                </button>
                <button onClick={() => setActiveTool(activeTool === 'emoji' ? null : 'emoji')} className={`p-2 rounded-full backdrop-blur-md ${activeTool === 'emoji' ? 'bg-white text-black' : 'bg-black/20 text-white'}`}>
                    <Smile size={20} />
                </button>
                <button onClick={() => setActiveTool(activeTool === 'filter' ? null : 'filter')} className={`p-2 rounded-full backdrop-blur-md ${activeTool === 'filter' ? 'bg-white text-black' : 'bg-black/20 text-white'}`}>
                    <Sparkles size={20} />
                </button>
                {mediaType === 'video' && (
                    <button onClick={() => setActiveTool(activeTool === 'trim' ? null : 'trim')} className={`p-2 rounded-full backdrop-blur-md ${activeTool === 'trim' ? 'bg-white text-black' : 'bg-black/20 text-white'}`}>
                        <Scissors size={20} />
                    </button>
                )}
            </div>
        )}
      </div>

      {/* Compression Overlay */}
      {compressionRunning && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6">
            <Loader2 className="w-12 h-12 text-yellow-500 animate-spin mb-4" />
            <h3 className="text-white font-bold text-xl mb-6">Processando vídeo...</h3>
            
            <div className="w-full max-w-xs h-2 bg-neutral-700 rounded-full overflow-hidden mb-2">
                <div 
                    className="h-full bg-yellow-500 transition-all duration-300 ease-out"
                    style={{ width: `${Math.min(100, Math.max(0, compressionProgress * 100))}%` }}
                />
            </div>
            
            <span className="text-yellow-500 font-mono font-bold text-lg mb-1">{(compressionProgress * 100).toFixed(0)}%</span>
            <p className="text-neutral-400 text-xs mb-8">Isso pode levar alguns segundos</p>
            
            <button 
                onClick={() => {
                    if (compositorRef.current) {
                        compositorRef.current.cancel();
                        setCompressionError('Compressão cancelada.');
                    }
                }}
                className="text-white/50 hover:text-white text-sm font-medium transition-colors border border-white/10 px-4 py-2 rounded-lg hover:bg-white/5"
            >
                Cancelar
            </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 relative flex items-center justify-center bg-neutral-900 overflow-hidden" ref={containerRef}>
        {step === 'picker' ? (
            <div className="text-center p-8">
                <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <Sparkles className="text-yellow-500" size={40} />
                </div>
                <h3 className="text-white font-bold text-xl mb-2">Criar Story</h3>
                <p className="text-neutral-400 text-sm mb-6">Compartilhe seu treino, refeição ou progresso.</p>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-yellow-500 text-black font-bold py-3 px-8 rounded-full hover:bg-yellow-400 transition-transform active:scale-95"
                >
                    Escolher Mídia
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    accept="image/*,video/*"
                />
            </div>
        ) : (
            <>
                {/* Media Preview */}
                <div className={`relative w-full h-full max-h-[80vh] flex items-center justify-center overflow-hidden transition-all duration-300 ${filter.class}`} id="preview-img">
                    {mediaType === 'image' ? (
                        previewUrl ? (
                          <Image src={previewUrl} alt="Preview" fill sizes="100vw" className="object-contain" unoptimized />
                        ) : null
                    ) : (
                        <video 
                            ref={videoRef}
                            src={previewUrl || ''} 
                            className="w-full h-full object-contain" 
                            playsInline 
                            loop 
                            autoPlay
                            muted={true}
                            preload="metadata"
                            onLoadedMetadata={handleVideoLoad}
                            onTimeUpdate={handleTimeUpdate}
                            onClick={togglePlay}
                        />
                    )}
                </div>

                {/* Overlays Layer */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {overlays.map(ov => (
                        <motion.div 
                            key={ov.id}
                            drag
                            dragMomentum={false}
                            dragConstraints={containerRef}
                            onDragEnd={(e, info) => handleDragEnd(ov.id, info)}
                            className="absolute pointer-events-auto cursor-move select-none active:scale-110 transition-transform"
                            style={{ 
                                left: `${ov.x}%`, 
                                top: `${ov.y}%`,
                                x: '-50%', // Center anchor
                                y: '-50%', // Center anchor
                                fontSize: ov.type === 'text' ? '24px' : '48px',
                                color: ov.type === 'text' ? ov.color : undefined,
                                textShadow: '0px 2px 4px rgba(0,0,0,0.5)',
                                fontWeight: 'bold'
                            }}
                            onClick={() => { /* Optional: Edit on click */ }} 
                        >
                            {ov.content}
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeOverlay(ov.id); }}
                                className="absolute -top-4 -right-4 bg-red-500 text-white rounded-full p-1 opacity-0 hover:opacity-100 transition-opacity pointer-events-auto"
                            >
                                <X size={12} />
                            </button>
                        </motion.div>
                    ))}
                </div>

                {/* Tools Panels */}
                <div className="absolute bottom-[100px] left-0 right-0 z-40 px-4">
                    
                    {/* Text Tool */}
                    {activeTool === 'text' && (
                        <div className="bg-black/80 backdrop-blur-md rounded-2xl p-4 animate-in slide-in-from-bottom-10">
                            <input 
                                autoFocus
                                value={textInput}
                                onChange={e => setTextInput(e.target.value)}
                                placeholder="Digite algo..."
                                className="w-full bg-transparent text-white text-xl font-bold placeholder-white/50 outline-none text-center mb-4"
                                onKeyDown={e => e.key === 'Enter' && addText()}
                            />
                            <div className="flex justify-center gap-2 overflow-x-auto pb-2">
                                {COLORS.map(c => (
                                    <button 
                                        key={c}
                                        onClick={() => setTextColor(c)}
                                        className={`w-8 h-8 rounded-full border-2 ${textColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-end">
                                <button onClick={addText} className="text-yellow-500 font-bold text-sm">Adicionar</button>
                            </div>
                        </div>
                    )}

                    {/* Emoji Tool */}
                    {activeTool === 'emoji' && (
                        <div className="bg-black/80 backdrop-blur-md rounded-2xl p-4 animate-in slide-in-from-bottom-10">
                            <div className="grid grid-cols-6 gap-2">
                                {EMOJIS.map(emoji => (
                                    <button 
                                        key={emoji}
                                        onClick={() => addEmoji(emoji)}
                                        className="text-3xl hover:scale-125 transition-transform"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Filter Tool */}
                    {activeTool === 'filter' && (
                        <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                            {FILTERS.map(f => (
                                <button 
                                    key={f.name}
                                    onClick={() => setFilter(f)}
                                    className="flex flex-col items-center gap-2 shrink-0 snap-center"
                                >
                                    <div className={`w-16 h-16 rounded-lg overflow-hidden border-2 ${filter.name === f.name ? 'border-yellow-500' : 'border-transparent'}`}>
                                        <div className={`relative w-full h-full bg-neutral-800 ${f.class}`}>
                                            {mediaType === 'image' && previewUrl ? (
                                              <Image src={previewUrl} alt="" fill sizes="64px" className="object-cover" unoptimized />
                                            ) : null}
                                            {mediaType === 'video' && <div className="w-full h-full bg-neutral-700" />}
                                        </div>
                                    </div>
                                    <span className={`text-xs ${filter.name === f.name ? 'text-yellow-500 font-bold' : 'text-neutral-400'}`}>{f.name}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Trim Tool (Video Only) */}
                    {activeTool === 'trim' && mediaType === 'video' && (
                        <div className="bg-black/80 backdrop-blur-md rounded-2xl p-4 animate-in slide-in-from-bottom-10">
                            <div className="flex justify-between items-center text-xs text-neutral-400 mb-4 font-mono">
                                <div className="text-center">
                                    <span className="block text-[10px] uppercase text-yellow-500">Início</span>
                                    <span className="text-white font-bold text-lg">{trimRange.start.toFixed(1)}s</span>
                                </div>
                                <div className="h-[1px] flex-1 bg-neutral-700 mx-4"></div>
                                <div className="text-center">
                                    <span className="block text-[10px] uppercase text-red-500">Fim</span>
                                    <span className="text-white font-bold text-lg">{trimRange.end.toFixed(1)}s</span>
                                </div>
                            </div>

                            {/* Framer Motion Slider */}
                            <div 
                                className="relative h-12 bg-neutral-800 rounded-lg mb-6 touch-none"
                                ref={trackRef}
                            >
                                {/* Track Background */}
                                <div className="absolute inset-0 bg-neutral-700/50 rounded-lg pointer-events-none" />

                                {/* Selected Range Highlight */}
                                <motion.div 
                                    className="absolute top-0 bottom-0 bg-yellow-500/30 border-l-2 border-r-2 border-yellow-500 pointer-events-none z-10"
                                    style={{ left: startX, width: selectedWidth }}
                                />

                                {/* Thumb Start */}
                                <motion.div
                                    className="absolute top-1/2 w-5 h-8 bg-yellow-500 rounded-md cursor-grab active:cursor-grabbing z-20 flex items-center justify-center shadow-lg"
                                    style={{ x: startX, y: '-50%' }}
                                    drag="x"
                                    dragMomentum={false}
                                    dragElastic={0}
                                    dragConstraints={trackRef}
                                    onDrag={(e, info) => {
                                        if (!trackRef.current) return;
                                        const rect = trackRef.current.getBoundingClientRect();
                                        const w = rect.width;
                                        const x = info.point.x - rect.left;
                                        
                                        const rawStart = (x / w) * videoDuration;
                                        const maxStart = trimRange.end - MIN_TRIM_SECONDS;
                                        
                                        let newStart = Math.max(0, Math.min(rawStart, maxStart));
                                        
                                        // Update state
                                        setTrimRange(prev => ({ ...prev, start: newStart }));
                                        
                                        // Force limits on visual thumb if needed
                                        if (rawStart > maxStart) {
                                            startX.set((maxStart / videoDuration) * w);
                                        } else if (rawStart < 0) {
                                            startX.set(0);
                                        }

                                        // Update video preview
                                        if (videoRef.current) {
                                            videoRef.current.currentTime = newStart;
                                        }
                                    }}
                                >
                                    <ChevronRight size={12} className="text-black" />
                                </motion.div>

                                {/* Thumb End */}
                                <motion.div
                                    className="absolute top-1/2 w-5 h-8 bg-yellow-500 rounded-md cursor-grab active:cursor-grabbing z-20 flex items-center justify-center shadow-lg"
                                    style={{ x: endX, y: '-50%' }}
                                    drag="x"
                                    dragMomentum={false}
                                    dragElastic={0}
                                    dragConstraints={trackRef}
                                    onDrag={(e, info) => {
                                        if (!trackRef.current) return;
                                        const rect = trackRef.current.getBoundingClientRect();
                                        const w = rect.width;
                                        const x = info.point.x - rect.left;
                                        
                                        const rawEnd = (x / w) * videoDuration;
                                        const minEnd = trimRange.start + MIN_TRIM_SECONDS;
                                        const maxEnd = Math.min(videoDuration, trimRange.start + MAX_VIDEO_SECONDS);
                                        
                                        let newEnd = Math.max(minEnd, Math.min(rawEnd, maxEnd));
                                        
                                        setTrimRange(prev => ({ ...prev, end: newEnd }));

                                        if (rawEnd < minEnd) {
                                            endX.set((minEnd / videoDuration) * w);
                                        } else if (rawEnd > maxEnd) {
                                            endX.set((maxEnd / videoDuration) * w);
                                        }

                                        if (videoRef.current) {
                                            videoRef.current.currentTime = newEnd;
                                        }
                                    }}
                                >
                                    <ChevronLeft size={12} className="text-black" />
                                </motion.div>
                            </div>
                            
                            <div className="flex justify-between mt-4">
                                <p className="text-[10px] text-neutral-500">Duração: {(trimRange.end - trimRange.start).toFixed(1)}s (máx {MAX_VIDEO_SECONDS}s)</p>
                                <button onClick={() => {
                                     if(videoRef.current) {
                                         videoRef.current.currentTime = trimRange.start;
                                         safePlay();
                                     }
                                 }} className="text-[10px] font-bold text-yellow-500 uppercase flex items-center gap-1">
                                    <Play size={10} /> Preview Corte
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </>
        )}
      </div>

      {/* Bottom Bar */}
      {step === 'editor' && (
          <div className="p-4 bg-black border-t border-neutral-900 flex justify-between items-center z-50">
            <button onClick={() => setStep('picker')} className="text-white text-sm font-medium">
                Cancelar
            </button>
            {compressionError ? (
                <div className="text-xs text-red-400 font-semibold text-center px-3">{compressionError}</div>
            ) : null}
            <button 
                onClick={handlePost}
                disabled={posting || compressionRunning}
                className="bg-yellow-500 text-black font-bold py-3 px-6 rounded-full flex items-center gap-2 hover:bg-yellow-400 active:scale-95 disabled:opacity-50"
            >
                {posting || compressionRunning ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                <span>{compressionRunning ? `Comprimindo ${Math.round(compressionProgress * 100)}%` : 'Seu Story'}</span>
            </button>
          </div>
      )}
    </div>
  );
}
