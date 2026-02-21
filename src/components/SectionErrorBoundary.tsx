'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { logError } from '@/lib/logger';

interface Props {
  children: React.ReactNode;
  /** Label shown in the fallback (e.g. "Painel Admin") */
  section?: string;
  /** When true shows a full-screen fallback instead of inline */
  fullScreen?: boolean;
  /** Called when the user clicks "retry" */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class SectionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const section = this.props.section ?? 'unknown';
    logError(`SectionErrorBoundary[${section}]`, error, { componentStack: info.componentStack });
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('irontracks:error', {
            detail: { source: `section:${section}`, error, meta: { componentStack: info.componentStack } },
          })
        );
      }
    } catch { /* ignore */ }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { section = 'Seção', fullScreen = false } = this.props;

    if (fullScreen) {
      return (
        <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4 animate-pulse">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-black text-white mb-1 uppercase tracking-tight">
            Erro em {section}
          </h2>
          <p className="text-neutral-400 text-sm mb-6 max-w-xs">
            Ocorreu um erro inesperado. Tente novamente.
          </p>
          {this.state.error && (
            <div className="bg-black/50 p-3 rounded-lg mb-6 w-full max-w-sm text-left border border-red-900/30 overflow-x-auto">
              <p className="text-red-400 font-mono text-xs break-all">
                {this.state.error.message}
              </p>
            </div>
          )}
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 bg-yellow-500 text-black px-5 py-2.5 rounded-xl font-bold hover:bg-yellow-400 transition-all active:scale-95 text-sm"
          >
            <RefreshCw size={16} />
            Tentar novamente
          </button>
        </div>
      );
    }

    // Inline/compact fallback — used inside modals and panels
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center rounded-2xl bg-neutral-900/80 border border-red-900/30 min-h-[160px]">
        <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
          <AlertCircle size={20} className="text-red-500" />
        </div>
        <div>
          <p className="text-white font-bold text-sm">{section} encontrou um erro</p>
          {this.state.error && (
            <p className="text-neutral-500 font-mono text-xs mt-1 max-w-xs truncate">
              {this.state.error.message}
            </p>
          )}
        </div>
        <button
          onClick={this.handleReset}
          className="flex items-center gap-1.5 bg-neutral-800 text-white px-4 py-2 rounded-lg font-semibold hover:bg-neutral-700 transition-all active:scale-95 text-xs"
        >
          <RefreshCw size={13} />
          Tentar novamente
        </button>
      </div>
    );
  }
}

export default SectionErrorBoundary;
