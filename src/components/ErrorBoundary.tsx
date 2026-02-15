import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('irontracks:error', {
            detail: {
              source: 'errorboundary',
              error,
              meta: {
                componentStack: errorInfo?.componentStack || null,
              },
            },
          })
        );
      }
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
            <AlertCircle size={40} className="text-red-500" />
          </div>
          
          <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">
            Ops! Algo deu errado.
          </h1>
          
          <p className="text-neutral-400 mb-8 max-w-sm">
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>

          <div className="bg-black/50 p-4 rounded-xl mb-8 w-full max-w-md overflow-x-auto text-left border border-red-900/30">
            <p className="text-red-400 font-mono text-xs break-all">
                {this.state.error && this.state.error.toString()}
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-yellow-500 text-black px-6 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-all active:scale-95"
          >
            <RefreshCw size={20} />
            Recarregar Aplicativo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
