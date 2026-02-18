import React from 'react';
import { useAdminPanel } from './AdminPanelContext';
import { AlertTriangle, CheckCircle, Search, Filter } from 'lucide-react';
import { ErrorReport } from '@/types/admin';

export const ErrorsTab: React.FC = () => {
    const {
        errorReports,
        errorsLoading,
        errorsQuery,
        setErrorsQuery,
        errorsStatusFilter,
        setErrorsStatusFilter,
        // Preciso de handleResolveError, handleDeleteError
        // Vou adicionar placeholders
    } = useAdminPanel();

    const handleResolveError = (id: string) => { alert('Resolver erro em implementação'); };
    const handleDeleteError = (id: string) => { alert('Excluir erro em implementação'); };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 backdrop-blur-sm">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar erros..."
                        value={errorsQuery}
                        onChange={(e) => setErrorsQuery(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none transition-colors"
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        <select
                            value={errorsStatusFilter}
                            onChange={(e) => setErrorsStatusFilter(e.target.value)}
                            className="w-full md:w-48 bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white appearance-none focus:border-yellow-500 focus:outline-none cursor-pointer"
                        >
                            <option value="all">Todos os Status</option>
                            <option value="open">Abertos</option>
                            <option value="resolved">Resolvidos</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid gap-3">
                {errorsLoading ? (
                    <div className="text-center py-12 text-neutral-500 animate-pulse">Carregando erros...</div>
                ) : errorReports.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-neutral-800 rounded-2xl">
                        <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={32} className="text-green-500" />
                        </div>
                        <h3 className="text-white font-bold text-lg mb-1">Sem erros reportados</h3>
                        <p className="text-neutral-500">O sistema está funcionando perfeitamente.</p>
                    </div>
                ) : (
                    errorReports.map((err) => (
                        <div key={err.id} className="group bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 hover:border-red-500/30 transition-all">
                            <div className="flex flex-col md:flex-row gap-4 justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-red-500/10 rounded-lg shrink-0">
                                        <AlertTriangle size={20} className="text-red-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-sm break-all">{err.message || 'Erro desconhecido'}</h3>
                                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-neutral-400">
                                            <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded">{err.code || 'NO_CODE'}</span>
                                            <span>•</span>
                                            <span>{new Date(err.created_at).toLocaleString()}</span>
                                            <span>•</span>
                                            <span>{err.user_email || 'Anônimo'}</span>
                                        </div>
                                        {err.stack && (
                                            <details className="mt-2 text-xs text-neutral-500 cursor-pointer">
                                                <summary className="hover:text-neutral-300 transition-colors">Ver Stack Trace</summary>
                                                <pre className="mt-2 p-2 bg-black rounded-lg overflow-x-auto text-[10px] text-red-300/80 font-mono">
                                                    {err.stack}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-2 shrink-0">
                                    {err.status !== 'resolved' && (
                                        <button
                                            onClick={() => handleResolveError(err.id)}
                                            className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Resolver
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeleteError(err.id)}
                                        className="px-3 py-1.5 bg-neutral-800 hover:bg-red-500/10 hover:text-red-500 text-neutral-400 rounded-lg text-xs font-bold transition-colors"
                                    >
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
