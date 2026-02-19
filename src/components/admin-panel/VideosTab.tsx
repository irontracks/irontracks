import React from 'react';
import { useAdminPanel } from './AdminPanelContext';
import { Video, RefreshCw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export const VideosTab: React.FC = () => {
    const {
        videoQueue,
        videoLoading,
        videoMissingCount,
        videoMissingLoading,
        videoExerciseName,
        setVideoExerciseName,
        videoBackfillLimit,
        setVideoBackfillLimit,
        videoCycleRunning,
        videoCycleStats,
        // Preciso das funções handleBackfillVideoData, handleProcessVideoQueue, handleStopVideoCycle
        // Vou assumir que estão no hook ou adicionar placeholders
    } = useAdminPanel();

    const handleBackfillVideoData = async () => { alert('Backfill em implementação'); };
    const handleProcessVideoQueue = async () => { alert('Processamento em implementação'); };
    const handleStopVideoCycle = () => { alert('Parar ciclo em implementação'); };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                <h3 className="font-black text-white text-lg mb-4 flex items-center gap-2">
                    <Video size={20} className="text-yellow-500" />
                    Gerenciamento de Vídeos (Backfill)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700">
                        <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Vídeos Faltantes</div>
                        <div className="text-2xl font-black text-white mt-1">
                            {videoMissingLoading ? '...' : videoMissingCount ?? '-'}
                        </div>
                    </div>
                    
                    <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700">
                        <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Na Fila</div>
                        <div className="text-2xl font-black text-white mt-1">
                            {videoQueue.length}
                        </div>
                    </div>

                    <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700">
                        <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Processados Hoje</div>
                        <div className="text-2xl font-black text-white mt-1">
                            {videoCycleStats.processed}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex gap-2">
                         <input
                            value={videoExerciseName}
                            onChange={(e) => setVideoExerciseName(e.target.value)}
                            placeholder="Nome do exercício (opcional)"
                            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                        />
                        <select
                            value={videoBackfillLimit}
                            onChange={(e) => setVideoBackfillLimit(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                        >
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleBackfillVideoData}
                            disabled={videoLoading || videoCycleRunning}
                            className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                        >
                            <RefreshCw size={18} className={`inline mr-2 ${videoLoading ? 'animate-spin' : ''}`} />
                            Carregar Faltantes
                        </button>
                        
                        {!videoCycleRunning ? (
                            <button
                                onClick={handleProcessVideoQueue}
                                disabled={videoQueue.length === 0}
                                className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl transition-all disabled:opacity-50"
                            >
                                Iniciar Processamento
                            </button>
                        ) : (
                            <button
                                onClick={handleStopVideoCycle}
                                className="flex-1 py-3 bg-red-500 hover:bg-red-400 text-white font-black rounded-xl transition-all"
                            >
                                Parar Processamento
                            </button>
                        )}
                    </div>
                </div>

                {/* Queue Visualization */}
                {videoQueue.length > 0 && (
                    <div className="mt-6 border-t border-neutral-800 pt-6">
                        <h4 className="font-bold text-white mb-3 text-sm uppercase tracking-wide">Fila de Processamento</h4>
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {videoQueue.map((item: any, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-neutral-900 rounded-lg border border-neutral-800 text-sm">
                                    <span className="text-neutral-300 truncate max-w-[70%]">{item.name}</span>
                                    <span className="text-xs text-neutral-500">{item.status || 'Pendente'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
