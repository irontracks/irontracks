"use client"
import React, { useRef, useState, useEffect } from 'react';
import { Download, ArrowLeft, TrendingUp, TrendingDown, Flame, FileText, Code, Users } from 'lucide-react';
import { buildReportHTML } from '@/utils/report/buildHtml';
import { workoutPlanHtml } from '@/utils/report/templates';

const WorkoutReport = ({ session, previousSession, user, onClose }) => {
    const reportRef = useRef();
    const [isGenerating, setIsGenerating] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [pdfBlob, setPdfBlob] = useState(null);
    const pdfFrameRef = useRef(null);

    useEffect(() => {
        const onAfterPrint = () => { setIsGenerating(false); };
        const onFocus = () => { setIsGenerating(false); };
        const onVisibility = () => { if (!document.hidden) setIsGenerating(false); };
        window.addEventListener('afterprint', onAfterPrint);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('afterprint', onAfterPrint);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    if (!session) return null;

    const formatDate = (ts) => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (s) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const getCurrentDate = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const calculateTotalVolume = (logs) => {
        let volume = 0;
        Object.values(logs).forEach(log => {
            if (log.weight && log.reps) volume += (parseFloat(log.weight) * parseFloat(log.reps));
        });
        return volume;
    };

    const currentVolume = calculateTotalVolume(session.logs || {});
    const prevVolume = previousSession ? calculateTotalVolume(previousSession.logs || {}) : 0;
    const volumeDelta = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : 0;
    const durationInMinutes = session.totalTime / 60;
    const calories = Math.round((currentVolume * 0.02) + (durationInMinutes * 4));

    const prevLogsMap = {};
    if (previousSession && previousSession.logs) {
        previousSession.exercises.forEach((ex, exIdx) => {
            const exLogs = [];
            Object.keys(previousSession.logs).forEach(key => {
                const [eIdx, sIdx] = key.split('-');
                if (parseInt(eIdx) === exIdx) exLogs.push(previousSession.logs[key]);
            });
            prevLogsMap[ex.name] = exLogs;
        });
    }

    const handleDownloadPDF = async () => {
        try {
            setIsGenerating(true);
            const html = buildReportHTML(session, previousSession, user?.displayName || user?.email || '');
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            setPdfBlob(blob);
            setPdfUrl(url);
        } catch (e) {
            alert('Não foi possível abrir impressão: ' + e.message + '\nPermita pop-ups para este site.');
        } finally {
            setIsGenerating(false);
            setTimeout(() => setIsGenerating(false), 500);
        }
    };

    const handlePartnerPlan = (participant) => {
        try {
            if (!participant) return;
            const exercises = Array.isArray(session.exercises) ? session.exercises : [];
            const workout = {
                title: session.workoutTitle || 'Treino',
                exercises: exercises.map((ex) => ({
                    name: ex.name,
                    sets: Number(ex.sets) || 0,
                    reps: ex.reps,
                    rpe: ex.rpe,
                    cadence: ex.cadence,
                    restTime: ex.restTime,
                    method: ex.method,
                    notes: ex.notes
                }))
            };
            const partnerUser = {
                displayName: participant.name || participant.uid || '',
                email: participant.email || ''
            };
            const html = workoutPlanHtml(workout, partnerUser);
            const win = window.open('', '_blank');
            if (!win) return;
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => {
                try {
                    win.print();
                } catch {}
            }, 300);
        } catch (e) {
            alert('Não foi possível gerar o PDF do parceiro: ' + (e?.message || String(e)));
        }
    };

    const closePreview = () => {
        try { if (pdfUrl) URL.revokeObjectURL(pdfUrl); } catch {}
        setPdfUrl(null);
        setPdfBlob(null);
    };

    const handlePrintIframe = () => {
        try { pdfFrameRef.current?.contentWindow?.print(); } catch {}
    };

    const handleShare = async () => {
        try {
            const title = 'Relatório IronTracks';
            if (navigator.share) {
                if (pdfBlob && navigator.canShare && navigator.canShare({ files: [new File([pdfBlob], 'relatorio-irontracks.html', { type: 'text/html' })] })) {
                    const file = new File([pdfBlob], 'relatorio-irontracks.html', { type: 'text/html' });
                    await navigator.share({ files: [file], title });
                    return;
                }
                await navigator.share({ title, url: pdfUrl });
                return;
            }
            const a = document.createElement('a');
            a.href = pdfUrl;
            a.download = 'relatorio-irontracks.html';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch ( e) {
            alert('Não foi possível compartilhar. Baixei o arquivo para você.\n+Abra com seu gerenciador e compartilhe.');
            try {
                const a = document.createElement('a');
                a.href = pdfUrl;
                a.download = 'relatorio-irontracks.html';
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch {}
        }
    };

    const handleDownloadJson = () => {
        try {
            const payload = session || {};
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
            const link = document.createElement('a');
            link.href = jsonString;
            const baseName = (session.workoutTitle || 'Treino');
            link.download = `${baseName}_${new Date().toISOString()}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } finally {
            setShowExportMenu(false);
        }
    };

    const teamMeta = session.teamMeta && typeof session.teamMeta === 'object' ? session.teamMeta : null;
    const rawParticipants = teamMeta && Array.isArray(teamMeta.participants) ? teamMeta.participants : [];
    const currentUserId = user?.id || user?.uid || null;
    const partners = rawParticipants.filter((p) => {
        const uid = p && (p.uid || p.id || null);
        if (!uid || !currentUserId) return true;
        return uid !== currentUserId;
    });

    const isTeamSession = partners.length > 0;

    return (
        <div className="fixed inset-0 z-[1000] overflow-y-auto bg-neutral-900 text-black">
            <div className={`fixed top-4 right-4 mt-safe mr-safe flex gap-2 no-print z-[1100] pointer-events-auto ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="relative">
                    <button
                        onClick={() => setShowExportMenu(v => !v)}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                    >
                        <Download size={16} />
                        <span className="text-sm font-medium">Salvar</span>
                    </button>
                    {showExportMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-xl overflow-hidden">
                            <button onClick={() => { setShowExportMenu(false); handleDownloadPDF(); }} className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50">
                                <FileText size={16} className="text-gray-600" />
                                <span>Salvar PDF</span>
                            </button>
                            <button onClick={handleDownloadJson} className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50">
                                <Code size={16} className="text-gray-600" />
                                <span>Salvar JSON</span>
                            </button>
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="bg-white text.black px-3 py-2 rounded-xl font-bold shadow-lg inline-flex items-center gap-2">
                    <ArrowLeft size={18} />
                    <span className="text-xs">Voltar</span>
                </button>
            </div>
            <div ref={reportRef} className="min-h-screen bg-white text-black p-8 max-w-4xl mx-auto" style={{ paddingTop: 'calc(2rem + env(safe-area-inset-top))' }}>
                <div className="border-b-4 border-black pb-6 mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-black italic tracking-tighter mb-1">IRON<span className="text-neutral-500">TRACKS</span></h1>
                        <p className="text-sm font-bold uppercase tracking-widest text-neutral-500">Relatório de Performance</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold">{session.workoutTitle}</p>
                        <p className="text-neutral-600">{formatDate(session.date)}</p>
                    </div>
                </div>

                {isTeamSession && (
                    <div className="mb-8 p-4 rounded-lg border border-neutral-200 bg-neutral-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center">
                                <Users size={18} />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Treino em Equipe</p>
                                <p className="text-sm font-semibold text-neutral-900">
                                    {partners.length === 1 ? '1 parceiro treinando com você' : `${partners.length} parceiros treinando com você`}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {partners.map((p, idx) => (
                                <button
                                    key={p.uid || p.id || idx}
                                    onClick={() => handlePartnerPlan(p)}
                                    className="px-3 py-2 rounded-full bg-black text-white text-xs font-bold uppercase tracking-wide hover:bg-neutral-900"
                                >
                                    Ver PDF de {p.name || 'Parceiro'}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-neutral-100 p-4 rounded-lg border border-neutral-200">
                        <p className="text-xs font-bold uppercase text-neutral-500 mb-1">Tempo Total</p>
                        <p className="text-3xl font-mono font-bold">{formatDuration(session.totalTime)}</p>
                    </div>
                    <div className="bg-neutral-100 p-4 rounded-lg border border-neutral-200">
                        <p className="text-xs font-bold uppercase text-neutral-500 mb-1">Volume (Kg)</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-3xl font-mono font-bold">{currentVolume.toLocaleString()}kg</p>
                            {previousSession && (
                                <span className={`text-xs font-bold flex items-center ${volumeDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {volumeDelta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                    {volumeDelta > 0 ? '+' : ''}{volumeDelta.toFixed(1)}%
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                        <p className="text-xs font-bold uppercase text-orange-500 mb-1 flex items-center gap-1">
                            <Flame size={12} /> Calorias
                        </p>
                        <p className="text-3xl font-mono font-bold text-orange-600">~{calories}</p>
                    </div>
                    <div className="bg-black text-white p-4 rounded-lg">
                        <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Status</p>
                        <p className="text-xl font-bold uppercase italic">CONCLUÍDO</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {(!Array.isArray(session.exercises) || session.exercises.length === 0) && (
                        <div className="text-neutral-500 p-4 bg-neutral-100 rounded-lg border border-neutral-200">
                            Nenhum dado de exercício registrado para este treino.
                        </div>
                    )}
                    {(Array.isArray(session.exercises) ? session.exercises : []).map((ex, exIdx) => {
                        const prevLogs = prevLogsMap[ex.name] || [];
                        return (
                            <div key={exIdx} className="break-inside-avoid">
                                <div className="flex justify-between items-end mb-2 border-b-2 border-neutral-200 pb-2">
                                    <h3 className="text-xl font-bold uppercase flex items-center gap-2">
                                        <span className="bg-black text-white w-6 h-6 flex items-center justify-center rounded text-xs">{exIdx + 1}</span>
                                        {ex.name}
                                    </h3>
                                    <div className="flex gap-3 text-xs font-mono text-neutral-500">
                                        {ex.method && ex.method !== 'Normal' && <span className="text-red-600 font-bold uppercase">{ex.method}</span>}
                                        {ex.rpe && <span>RPE: <span className="font-bold text-black">{ex.rpe}</span></span>}
                                        <span>Cad: <span className="font-bold text-black">{ex.cadence || '-'}</span></span>
                                    </div>
                                </div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-neutral-500 border-b border-neutral-100">
                                            <th className="py-2 text-left w-16">Série</th>
                                            <th className="py-2 text-center w-24">Carga</th>
                                            <th className="py-2 text-center w-24">Reps</th>
                                            <th className="py-2 text-center w-32">Evolução</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => {
                                            const key = `${exIdx}-${sIdx}`;
                                            const log = (session.logs || {})[key];
                                            const prevLog = prevLogs[sIdx];

                                            if (!log || (!log.weight && !log.reps)) return null;

                                            let progressionText = "-";
                                            let rowClass = "";

                                            if (prevLog && prevLog.weight) {
                                                const delta = parseFloat(log.weight) - parseFloat(prevLog.weight);
                                                if (delta > 0) {
                                                    progressionText = `+${delta}kg`;
                                                    rowClass = "bg-green-50 text-green-900 font-bold";
                                                } else if (delta < 0) {
                                                    progressionText = `${delta}kg`;
                                                    rowClass = "text-red-600 font-bold";
                                                } else {
                                                    progressionText = "=";
                                                }
                                            }

                                            return (
                                                <tr key={sIdx} className="border-b border-neutral-100">
                                                    <td className="py-3 font-mono text-neutral-500">#{sIdx + 1}</td>
                                                    <td className="py-3 text-center font-bold text-lg">{log.weight}</td>
                                                    <td className="py-3 text-center font-mono">{log.reps}</td>
                                                    <td className={`py-3 text-center text-xs uppercase ${rowClass}`}>{progressionText}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-12 pt-6 border-t border-neutral-200 text-center text-xs text-neutral-400 uppercase tracking-widest">
                    IronTracks System • {getCurrentDate()}
                </div>
            </div>

            {pdfUrl && (
                <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur flex flex-col">
                    <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between h-16 pt-safe">
                        <h3 className="text-white font-bold">Pré-visualização</h3>
                        <button onClick={closePreview} className="bg-white text-black px-4 py-2 rounded-lg font-bold">Fechar</button>
                    </div>
                    <div className="flex-1 bg-white">
                        <iframe ref={pdfFrameRef} src={pdfUrl} className="w-full h-full" />
                    </div>
                    <div className="p-4 bg-neutral-900 border-t border-neutral-800 flex items-center justify-end gap-2 pb-safe">
                        <button onClick={handleShare} className="bg-neutral-800 text-white px-4 py-2 rounded-lg">Compartilhar</button>
                        <button onClick={handlePrintIframe} className="bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold">Imprimir</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkoutReport;
