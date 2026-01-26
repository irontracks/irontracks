"use client";

import React, { useMemo, useRef, useState } from 'react';
import { Video } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';

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
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const variant = String(props?.variant || 'icon');
  const label = String(props?.label || (variant === 'wide' ? 'Enviar vídeo ao professor' : 'Enviar'));

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

      const res = await fetch('/api/execution-videos/prepare', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...meta,
          file_name: String(file?.name || ''),
          content_type: String(file?.type || ''),
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

      const upload = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, {
        contentType: file.type || 'video/mp4',
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
          title={uploading ? 'Enviando...' : 'Enviar vídeo ao professor'}
          aria-label={uploading ? 'Enviando vídeo' : 'Enviar vídeo ao professor'}
        >
          <Video size={16} />
          <span className="text-xs">{uploading ? 'Enviando...' : label}</span>
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
          title={uploading ? 'Enviando...' : 'Enviar vídeo ao professor'}
          aria-label={uploading ? 'Enviando vídeo' : 'Enviar vídeo ao professor'}
        >
          <Video size={16} />
          <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">{label}</span>
        </button>
      )}
    </>
  );
}
