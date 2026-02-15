"use client";

import React, { useMemo, useRef, useState } from 'react';
import { Video, X, StopCircle, Check, Loader2, Upload, AlertCircle } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';
import { VideoCompositor } from '@/lib/video/VideoCompositor';

const enabled = () => {
  try {
    const raw = String(process.env.NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO ?? '').trim().toLowerCase();
    if (raw === 'false') return false;
    if (raw === 'true') return true;
    return true;
  } catch {
    return true;
  }
};

export default function ExecutionVideoCapture(props) {
  const { alert } = useDialog();
  const supabase = useRef(createClient()).current;
  const inputRef = useRef<any>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const variant = String(props?.variant || 'icon');
  const label = String(props?.label || (variant === 'wide' ? 'Enviar vídeo ao professor' : variant === 'compact' ? 'Vídeo' : 'Enviar'));

  const meta = useMemo(() => {
    return {
      exercise_name: props?.exerciseName ? String(props.exerciseName) : '',
      exercise_id: props?.exerciseId ? String(props.exerciseId) : null,
      workout_id: props?.workoutId ? String(props.workoutId) : null,
      exercise_library_id: props?.exerciseLibraryId ? String(props.exerciseLibraryId) : null,
      notes: props?.notes ? String(props.notes) : '',
    };
  }, [props?.exerciseName, props?.exerciseId, props?.workoutId, props?.exerciseLibraryId, props?.notes]);

  if (!enabled()) return null;

  const runIdle = (fn) => {
    try {
      const w = typeof window !== 'undefined' ? window : null;
      const idle = w && w.requestIdleCallback;
      if (typeof idle === 'function') {
        idle(() => {
          try {
            fn();
          } catch {}
        });
        return;
      }
    } catch {}
    try {
      fn();
    } catch {}
  };

  const processVideoFile = async (file) => {
    let videoEl: HTMLVideoElement | null = null;
    let objectUrl: string | null = null;
    try {
      if (!file) return null;
      if (typeof window === 'undefined' || typeof document === 'undefined') return file;
      const mime = String(file.type || '').toLowerCase();
      if (!mime.startsWith('video/')) return file;

      videoEl = document.createElement('video');
      try {
        objectUrl = URL.createObjectURL(file);
      } catch {}
      if (!objectUrl) return file;

      videoEl.src = objectUrl;
      videoEl.crossOrigin = 'anonymous';
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.preload = 'metadata';

      await new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          try {
            videoEl.removeEventListener('loadedmetadata', onLoaded);
          } catch {}
          try {
            videoEl.removeEventListener('error', onError);
          } catch {}
        };
        const onLoaded = () => {
          cleanup();
          resolve(null);
        };
        const onError = () => {
          cleanup();
          reject(new Error('Falha ao carregar o vídeo selecionado.'));
        };
        videoEl.addEventListener('loadedmetadata', onLoaded);
        videoEl.addEventListener('error', onError);
        try {
          if (videoEl.readyState >= 1) {
            cleanup();
            resolve(null);
          }
        } catch {}
        try {
          setTimeout(() => {
            if (settled) return;
            cleanup();
            reject(new Error('Timeout ao carregar metadados do vídeo.'));
          }, 10000);
        } catch {}
      });

      const duration = Number(videoEl.duration) || 0;
      if (!Number.isFinite(duration) || duration <= 0) {
        return file;
      }

      const width = 1080;
      const height = 1920;
      const compositor = new VideoCompositor();

      const result = await compositor.render({
        videoElement: videoEl,
        trimRange: [0, duration],
        outputWidth: width,
        outputHeight: height,
        fps: 30,
        mimeTypeOverride: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
        videoBitsPerSecond: 4000000,
        onDrawFrame: (ctx, vid) => {
          try {
            const vw = Number(vid?.videoWidth || 0);
            const vh = Number(vid?.videoHeight || 0);
            if (!vw || !vh) return;
            const scale = Math.max(width / vw, height / vh);
            const dw = vw * scale;
            const dh = vh * scale;
            const ox = (width - dw) / 2;
            const oy = (height - dh) / 2;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(vid, ox, oy, dw, dh);

            const overlayTop = height * 0.7;
            ctx.fillStyle = 'rgba(0,0,0,0.78)';
            ctx.fillRect(0, overlayTop, width, height - overlayTop);

            const brand = 'IRONTRACKS';
            ctx.fillStyle = '#facc15';
            ctx.font = '900 40px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
            ctx.textBaseline = 'top';
            const brandWidth = ctx.measureText(brand).width;
            const brandX = (width - brandWidth) / 2;
            const brandY = overlayTop + 24;
            ctx.fillText(brand, brandX, brandY);

            const exerciseName = meta?.exercise_name ? String(meta.exercise_name) : '';
            const subtitle = exerciseName || 'Execução do exercício';
            ctx.fillStyle = '#ffffff';
            ctx.font = '800 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
            const maxSubtitleWidth = width - 64;
            const words = subtitle.split(/\s+/).filter(Boolean);
            const lines: any[] = [];
            let current = '';
            for (let i = 0; i < words.length; i += 1) {
              const w = words[i];
              const candidate = current ? current + ' ' + w : w;
              const measure = ctx.measureText(candidate).width;
              if (measure <= maxSubtitleWidth || !current) {
                current = candidate;
              } else {
                lines.push(current);
                current = w;
              }
              if (lines.length >= 2) break;
            }
            if (current && lines.length < 2) lines.push(current);
            const startY = brandY + 48;
            for (let i = 0; i < lines.length; i += 1) {
              const text = lines[i];
              const tw = ctx.measureText(text).width;
              const x = (width - tw) / 2;
              const y = startY + i * 32;
              ctx.fillText(text, x, y);
            }
          } catch {}
        },
        onProgress: (p) => {
          try {
            const n = Number(p);
            if (!Number.isFinite(n)) return;
            const clamped = Math.max(0, Math.min(1, n));
            runIdle(() => {
              setProgress(clamped);
            });
          } catch {}
        },
      });

      const targetMime = result?.mime || file.type || 'video/mp4';
      const baseName = (() => {
        try {
          const raw = String(file.name || 'execution').trim();
          const idx = raw.lastIndexOf('.');
          return idx > 0 ? raw.slice(0, idx) : raw;
        } catch {
          return 'execution';
        }
      })();
      const ext = targetMime.includes('mp4') ? '.mp4' : targetMime.includes('webm') ? '.webm' : '';
      const finalName = `${baseName}${ext || ''}`;

      try {
        const finalFile = new File([result.blob], finalName, { type: targetMime });
        return finalFile;
      } catch {
        return file;
      }
    } catch (err) {
      throw err;
    } finally {
      try {
        if (videoEl && typeof videoEl.pause === 'function') {
          try {
            videoEl.pause();
          } catch {}
        }
      } catch {}
      try {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      } catch {}
    }
  };

  const pickFile = () => {
    try {
      if (uploading) return;
      if (inputRef.current) inputRef.current.click();
    } catch {}
  };

  const onChange = async (e) => {
    const file = e?.target?.files?.[0] || null;
    try {
      if (e?.target) e.target.value = '';
    } catch {}
    if (!file) return;

    try {
      setUploading(true);
      setProcessing(true);
      setProgress(0);

      const processed = await processVideoFile(file).catch((err) => {
        throw err;
      });
      const fileToUpload = processed || file;

      const res = await fetch('/api/execution-videos/prepare', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...meta,
          file_name: String(fileToUpload?.name || file?.name || ''),
          content_type: String(fileToUpload?.type || file?.type || ''),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const msg = String(json?.error || `Falha ao preparar upload (${res.status})`);
        await alert(msg, 'Vídeo');
        return;
      }

      const bucket = String(json.bucket || 'execution-videos');
      const path = String(json.path || '');
      const token = String(json.token || '');
      const submissionId = String(json.submission_id || '');
      if (!path || !token || !submissionId) {
        await alert('Resposta inválida ao preparar upload.', 'Vídeo');
        return;
      }

      const upload = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, fileToUpload, {
        contentType: fileToUpload.type || file.type || 'video/mp4',
        upsert: true,
      });
      if (upload?.error) {
        await alert('Falha no upload: ' + upload.error.message, 'Vídeo');
        return;
      }

      try {
        await fetch('/api/execution-videos/complete', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ submission_id: submissionId }),
        });
      } catch {}

      if (typeof props?.onUploaded === 'function') {
        try {
          props.onUploaded({ submissionId });
        } catch {}
      }
      await alert('Vídeo enviado para o professor.', 'Vídeo');
    } catch (err) {
      await alert('Erro: ' + (err?.message ?? String(err)), 'Vídeo');
    } finally {
      setUploading(false);
      setProcessing(false);
      setProgress(0);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={onChange}
        className="hidden"
      />
      {uploading ? (
        <div className="mt-1 w-full flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-yellow-500 transition-[width]"
              style={{ width: `${Math.round((processing ? progress : 1) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-neutral-400">
            {processing ? 'Montando vídeo' : 'Enviando vídeo'}
          </span>
        </div>
      ) : null}
      {variant === 'wide' ? (
        <button
          type="button"
          data-testid="execution-video-send"
          onClick={(e) => {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch {}
            pickFile();
          }}
          disabled={uploading}
          className="w-full min-h-[38px] inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 active:scale-95 transition-transform disabled:opacity-60"
          title={uploading ? (processing ? 'Montando vídeo...' : 'Enviando...') : 'Enviar vídeo ao professor'}
          aria-label={uploading ? (processing ? 'Montando vídeo' : 'Enviando vídeo ao professor') : 'Enviar vídeo ao professor'}
        >
          <Video size={16} />
          <span className="text-xs">{uploading ? (processing ? 'Montando...' : 'Enviando...') : label}</span>
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          data-testid="execution-video-send"
          onClick={(e) => {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch {}
            pickFile();
          }}
          disabled={uploading}
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-black/30 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 active:scale-95 transition-transform disabled:opacity-60 relative"
          title={uploading ? (processing ? 'Montando vídeo...' : 'Enviando...') : 'Enviar vídeo ao professor'}
          aria-label={uploading ? (processing ? 'Montando vídeo' : 'Enviando vídeo ao professor') : 'Enviar vídeo ao professor'}
        >
          <div className="relative">
            <Video size={16} className="text-yellow-500" />
            <Upload size={10} className="absolute -top-1 -right-1 text-black bg-yellow-500 rounded-full p-[1px]" />
          </div>
          <span className="text-sm">{uploading ? (processing ? 'Montando...' : 'Enviando...') : label}</span>
        </button>
      ) : (
        <button
          type="button"
          data-testid="execution-video-send"
          onClick={(e) => {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch {}
            pickFile();
          }}
          disabled={uploading}
          className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95 disabled:opacity-60"
          title={uploading ? (processing ? 'Montando vídeo...' : 'Enviando...') : 'Enviar vídeo ao professor'}
          aria-label={uploading ? (processing ? 'Montando vídeo' : 'Enviando vídeo ao professor') : 'Enviar vídeo ao professor'}
        >
          <Video size={16} />
          <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">{uploading ? (processing ? 'Montando...' : 'Enviando...') : label}</span>
        </button>
      )}
    </>
  );
}
