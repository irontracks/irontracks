
"use client";

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDialog } from '@/contexts/DialogContext';

const getAppVersion = () => {
  try {
    return process.env.NEXT_PUBLIC_APP_VERSION || '';
  } catch {
    return '';
  }
};

const getErrorMessage = (errLike: unknown) => {
  try {
    if (!errLike) return 'Erro desconhecido';
    if (typeof errLike === 'string') return errLike;
    if ((errLike as Error)?.message) return String((errLike as Error).message);
    return String(errLike);
  } catch {
    return 'Erro desconhecido';
  }
};

const getErrorStack = (errLike: unknown) => {
  try {
    const stack = (errLike as Error)?.stack ? String((errLike as Error).stack) : '';
    return stack || '';
  } catch {
    return '';
  }
};

const normalizeKey = (v: unknown) => {
  try {
    return String(v || '').slice(0, 800);
  } catch {
    return '';
  }
};

interface ErrorPayload {
  message: string;
  stack: string;
  pathname: string;
  url: string;
  userAgent: string;
  source: string;
  appVersion: string;
  meta: Record<string, unknown>;
}

export default function ErrorReporterProvider({ children }: { children: React.ReactNode }) {
  const { confirm, alert } = useDialog();
  const lastShownBySigRef = useRef(new Map<string, number>());
  const inFlightRef = useRef(false);

  const getContextSnapshot = useMemo(() => {
    return () => {
      try {
        const url = typeof window !== 'undefined' ? window.location?.href : '';
        const pathname = typeof window !== 'undefined' ? window.location?.pathname : '';
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        return { url, pathname, userAgent };
      } catch {
        return { url: '', pathname: '', userAgent: '' };
      }
    };
  }, []);

  const shouldThrottle = (signature: string, windowMs = 15000) => {
    const now = Date.now();
    const last = lastShownBySigRef.current.get(signature) || 0;
    if (now - last < windowMs) return true;
    lastShownBySigRef.current.set(signature, now);
    return false;
  };

  const reportToServer = async (payload: ErrorPayload) => {
    const res = await fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch((): any => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao reportar erro');
    return json;
  };

  const handleError = useCallback(async ({ error, source, meta }: { error: unknown, source: string, meta: Record<string, unknown> }) => {
    if (inFlightRef.current) return;

    const { url, pathname, userAgent } = getContextSnapshot();
    const message = getErrorMessage(error);
    const stack = getErrorStack(error);
    const signature = normalizeKey([source, pathname, message, stack?.slice(0, 400)].join('|'));
    if (shouldThrottle(signature)) return;

    inFlightRef.current = true;
    try {
      const details = stack ? `\n\nDetalhes técnicos:\n${stack.slice(0, 1400)}` : '';
      const shouldReport = await confirm(
        `${message}${details}`,
        'Ocorreu um erro',
        { confirmText: 'Reportar para a equipe', cancelText: 'OK' }
      );

      if (!shouldReport) return;

      await reportToServer({
        message,
        stack,
        pathname,
        url,
        userAgent,
        source,
        appVersion: getAppVersion(),
        meta: meta && typeof meta === 'object' ? meta : {},
      });
      await alert('Erro reportado. Obrigado!', 'Enviado');
    } catch (e) {
      try {
        await alert('Não foi possível reportar o erro: ' + getErrorMessage(e), 'Falha ao reportar');
      } catch { }
    } finally {
      inFlightRef.current = false;
    }
  }, [alert, confirm, getContextSnapshot]);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      try {
        handleError({
          error: event?.error || event?.message || 'Erro',
          source: 'window',
          meta: { filename: event?.filename, lineno: event?.lineno, colno: event?.colno },
        });
      } catch { }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      try {
        handleError({
          error: event?.reason || 'Promise rejeitada',
          source: 'unhandledrejection',
          meta: {},
        });
      } catch { }
    };

    const onBoundaryEvent = (event: CustomEvent) => {
      try {
        const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
        handleError({
          error: detail?.error || 'Erro',
          source: detail?.source || 'errorboundary',
          meta: detail?.meta || {},
        });
      } catch { }
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('irontracks:error', onBoundaryEvent as EventListener);
    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('irontracks:error', onBoundaryEvent as EventListener);
    };
  }, [handleError]);

  return <>{children}</>;
}
