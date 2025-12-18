'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
    RotateCcw,
    History,
    MoreVertical,
    Share2,
    Trash2,
    Download,
    Copy,
    Plus,
    Flame,
    Play,
    Dumbbell,
    Check,
    LogOut,
    X,
    Clock,
    Upload
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { createWorkout, updateWorkout, deleteWorkout, importData } from '@/actions/workout-actions';

import LoginScreen from '@/components/LoginScreen';
import AdminPanelV2 from '@/components/AdminPanelV2';
import ChatScreen from '@/components/ChatScreen';
import HistoryList from '@/components/HistoryList';
import StudentEvolution from '@/components/StudentEvolution';
import WorkoutReport from '@/components/WorkoutReport';
import ActiveWorkout from '@/components/ActiveWorkout';
import RestTimerOverlay from '@/components/RestTimerOverlay';
import NotificationToast from '@/components/NotificationToast';
import LoadingScreen from '@/components/LoadingScreen';
import ExerciseEditor from '@/components/ExerciseEditor';
import IncomingInviteModal from '@/components/IncomingInviteModal';
import NotificationCenter from '@/components/NotificationCenter';
import { TeamWorkoutProvider } from '@/contexts/TeamWorkoutContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { DialogProvider, useDialog } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { playStartSound } from '@/lib/sounds';
import { workoutPlanHtml } from '@/utils/report/templates';

const AssessmentHistory = dynamic(() => import('@/pages/AssessmentHistory'), { ssr: false });

const ADMIN_EMAIL = 'djmkapple@gmail.com';
const appId = 'irontracks-production';

function IronTracksApp() {
    const { confirm, alert } = useDialog();
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true); // Start loading
    const [view, setView] = useState('dashboard');
    const [workouts, setWorkouts] = useState([]);
    const [currentWorkout, setCurrentWorkout] = useState(null);
    const [importCode, setImportCode] = useState('');
    const [shareCode, setShareCode] = useState(null);
    const [quickViewWorkout, setQuickViewWorkout] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showJsonImportModal, setShowJsonImportModal] = useState(false);
    const [reportData, setReportData] = useState({ current: null, previous: null });
    const [notification, setNotification] = useState(null);
    const [isCoach, setIsCoach] = useState(false);

    // Estado Global da Sessão Ativa
    const [activeSession, setActiveSession] = useState(null);
    const [showAdminPanel, setShowAdminPanel] = useState(false);

    const supabase = createClient();

    // Persistência da Sessão Ativa
    useEffect(() => {
        const savedSession = localStorage.getItem('activeSession');
        if (savedSession) {
            try {
                setActiveSession(JSON.parse(savedSession));
            } catch (e) {
                console.error("Erro ao restaurar sessão:", e);
                localStorage.removeItem('activeSession');
            }
        }
    }, []);

    // Persistência da View (Aba Atual)
    useEffect(() => {
        const savedView = localStorage.getItem('appView');
        if (savedView) {
            // Evita restaurar 'active' se não houver sessão, para não cair em tela vazia
            if (savedView === 'active' && !localStorage.getItem('activeSession')) {
                setView('dashboard');
            } else {
                setView(savedView);
            }
        }
    }, []);

    useEffect(() => {
        if (view) {
            localStorage.setItem('appView', view);
        }
    }, [view]);

    useEffect(() => {
        if (activeSession) {
            localStorage.setItem('activeSession', JSON.stringify(activeSession));
        } else {
            localStorage.removeItem('activeSession');
        }
    }, [activeSession]);

    // LOGICA DE AUTH SIMPLIFICADA E ROBUSTA
    useEffect(() => {
        let mounted = true;

        const checkUser = async () => {
            try {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                
                if (mounted) {
                    if (currentUser) {
                        const u = currentUser;
                        u.displayName = u.user_metadata.full_name || u.user_metadata.name || u.email.split('@')[0];
                        u.photoURL = u.user_metadata.avatar_url || u.user_metadata.picture;
                        
                        // Prevent unnecessary state updates if user ID matches
                        setUser(prev => prev?.id === u.id ? prev : u);
                        
                        if (u.email === ADMIN_EMAIL) setIsCoach(true);
                    } else {
                        setUser(null);
                    }
                    setAuthLoading(false);
                }
            } catch (error) {
                console.error("Auth check failed", error);
                if (mounted) {
                    setUser(null);
                    setAuthLoading(false);
                }
            }
        };

        checkUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;
            
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                 if (session?.user) {
                     const u = session.user;
                     u.displayName = u.user_metadata.full_name || u.user_metadata.name || u.email.split('@')[0];
                     u.photoURL = u.user_metadata.avatar_url || u.user_metadata.picture;
                     
                     // Only update if ID changed or if it was null
                     setUser(prev => prev?.id === u.id ? prev : u);
                     
                     if (u.email === ADMIN_EMAIL) setIsCoach(true);
                 }
                 setAuthLoading(false);
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                setAuthLoading(false);
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // Sync Profile Separately (Optimized)
    useEffect(() => {
        if (user?.id) {
             const syncProfile = async () => {
                 await supabase.from('profiles').upsert({
                    id: user.id,
                    email: user.email,
                    display_name: user.displayName,
                    photo_url: user.photoURL,
                    last_seen: new Date(),
                    role: user.email === ADMIN_EMAIL ? 'admin' : 'user'
                }, { onConflict: 'id' });
             };
             syncProfile();
        }
    }, [user?.id]);

    // Fetch Workouts
    const fetchWorkouts = useCallback(async () => {
        if (!user) return;
        
        try {
            const { data, error } = await supabase
                .from('workouts')
                .select(`
                    *,
                    exercises (
                        *,
                        sets (*)
                    )
                `)
                .eq('user_id', user.id)
                .eq('is_template', true)
                .order('name');
                
            if (error) throw error;

            if (data) {
                 const mappedWorkouts = data.map(w => ({
                     id: w.id,
                     title: w.name,
                     notes: w.notes,
                     exercises: w.exercises ? w.exercises.sort((a,b) => a.order - b.order).map(e => ({
                         id: e.id,
                         name: e.name,
                         notes: e.notes,
                         videoUrl: e.video_url,
                         restTime: e.rest_time,
                         cadence: e.cadence,
                         method: e.method,
                         sets: e.sets ? e.sets.length : 0,
                         reps: e.sets?.[0]?.reps || '10',
                         rpe: e.sets?.[0]?.rpe || 8
                     })) : []
                 }));
                 setWorkouts(mappedWorkouts);
            }
        } catch (e) {
            console.error("Error fetching workouts:", e);
        }
    }, [user]);

    useEffect(() => {
        fetchWorkouts();
    }, [fetchWorkouts]);


    // Handlers de Sessão
    const handleLogout = async () => {
        if (await confirm("Deseja realmente sair da sua conta?", "Sair")) {
            await supabase.auth.signOut();
            window.location.reload();
        }
    };

    const handleStartSession = (workout) => {
        playStartSound();
        setActiveSession({
            workout,
            logs: {},
            startedAt: Date.now(),
            timerTargetTime: null
        });
        setView('active');
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission().catch(e => console.warn("Erro permissão notificação:", e));
        }
    };

    const handleUpdateSessionLog = (key, data) => {
        if (!activeSession) return;
        setActiveSession(prev => {
            if (!prev) return null;
            return {
                ...prev,
                logs: { ...(prev.logs || {}), [key]: data }
            };
        });
    };

    const handleStartTimer = (duration) => {
        setActiveSession(prev => ({
            ...prev,
            timerTargetTime: Date.now() + (duration * 1000)
        }));
    };

    const handleCloseTimer = () => {
        setActiveSession(prev => ({
            ...prev,
            timerTargetTime: null
        }));
    };

    const handleFinishSession = async (sessionData, showReport) => {
        setActiveSession(null);
        if (showReport === false) {
            setView('dashboard');
            return;
        }
        setReportData({ current: sessionData, previous: null });
        setView('report');
    };

    // Handlers CRUD
    const handleCreateWorkout = () => { setCurrentWorkout({ title: '', exercises: [] }); setView('edit'); };

    const handleSaveWorkout = async () => {
        if (!user || !currentWorkout.title) return;
        try {
            if (currentWorkout.id) {
                await updateWorkout(currentWorkout.id, currentWorkout);
            } else {
                await createWorkout(currentWorkout);
            }
            await fetchWorkouts(); // Refresh list
            setView('dashboard');
        } catch (e) { await alert("Erro: " + e.message); }
    };

    const handleDeleteWorkout = async (id) => {
        if (!(await confirm("Apagar este treino?", "Excluir Treino"))) return;
        try {
            await deleteWorkout(id);
            await fetchWorkouts();
        } catch (e) { await alert("Erro: " + e.message); }
    };

    const handleDuplicateWorkout = async (workout) => {
        if (!(await confirm(`Duplicar "${workout.title}"?`, "Duplicar Treino"))) return;
        const newWorkout = { ...workout, title: `${workout.title} (Cópia)` };
        delete newWorkout.id;
        try {
            await createWorkout(newWorkout);
            await fetchWorkouts();
        } catch (e) { await alert("Erro ao duplicar: " + e.message); }
    };

    const handleShareWorkout = async (workout) => {
        try {
            const html = workoutPlanHtml(workout, user);
            const fileName = `${(workout.title || 'Treino').replace(/\s+/g, '_')}_Ficha`;
            const res = await fetch('/api/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html, fileName })
            });
            if (!res.ok) throw new Error('Falha ao gerar PDF');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            await alert('Não foi possível gerar o PDF: ' + e.message, 'Erro');
        }
    };

    const handleImportWorkout = async () => {
        await alert("Funcionalidade de importar código temporariamente indisponível na migração.", "Em Manutenção");
    };

    // JSON IMPORT HANDLER
    const handleJsonUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                if (await confirm(`Importar dados de ${json.user?.email || 'Unknown'}? Isso criará novos treinos.`, "Importar Backup")) {
                    await importData(json);
                    await fetchWorkouts();
                    await alert("Dados importados com sucesso!", "Sucesso");
                    setShowJsonImportModal(false);
                }
            } catch (err) {
                await alert("Erro ao ler arquivo JSON: " + err.message);
            }
        };
        reader.readAsText(file);
    };

    if (authLoading) return <LoadingScreen />;
    if (!user) return <LoginScreen />;

    return (
        <TeamWorkoutProvider user={user}>
            <div className="w-full bg-neutral-900 min-h-screen relative flex flex-col overflow-hidden">
                <IncomingInviteModal onStartSession={handleStartSession} />

                {/* Header */}
                {view !== 'active' && view !== 'report' && (
                    <div className="bg-neutral-900 p-4 flex justify-between items-center sticky top-0 z-40 border-b border-neutral-800 pt-safe">
                        <div className="flex items-center gap-3">
                            {view === 'history' && (
                                <button onClick={() => setView('dashboard')} className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-800 text-white"><RotateCcw size={20} /></button>
                            )}
                            {user.photoURL ? <Image src={user.photoURL} width={40} height={40} className="w-10 h-10 rounded-full border-2 border-yellow-500 object-cover" alt="Profile" /> : <div className="w-10 h-10 rounded-full bg-neutral-800 border-2 border-yellow-500 flex items-center justify-center font-bold text-yellow-500">{user.displayName?.[0]}</div>}
                            <div className="flex flex-col justify-center h-10 pt-1">
                                <p className="text-[10px] text-neutral-400 font-bold tracking-widest uppercase leading-none mb-1">BEM-VINDO ATLETA</p>
                                <h1 className="text-sm font-black text-white leading-none">{user.displayName}</h1>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            {(user.email === ADMIN_EMAIL || isCoach) && <button onClick={() => setShowAdminPanel(true)} className="w-10 h-10 rounded-full bg-yellow-500 text-black font-bold text-[10px] flex items-center justify-center border-2 border-yellow-600">CMD</button>}

                            <NotificationCenter onStartSession={handleStartSession} />

                            <button onClick={() => setView('history')} className="w-10 h-10 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center hover:text-white"><History size={20} /></button>
                            <button onClick={handleLogout} className="w-10 h-10 rounded-full bg-red-900/20 text-red-500 flex items-center justify-center hover:bg-red-900/40 transition-colors"><LogOut size={18} /></button>
                        </div>
                    </div>
                )}

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {view === 'dashboard' && (
                        <div className="p-4 space-y-4 pb-24">
                            
                            {/* Removido botão de restaurar dados JSON conforme solicitação */}

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setView('dashboard')}
                                    className={`flex-1 p-3 rounded-xl border font-bold text-sm uppercase ${view === 'dashboard' ? 'bg-yellow-500 text-black border-yellow-600' : 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}
                                >
                                    TREINOS
                                </button>
                                <button
                                    onClick={() => setView('assessments')}
                                    className={`flex-1 p-3 rounded-xl border font-bold text-sm uppercase ${view === 'assessments' ? 'bg-yellow-500 text-black border-yellow-600' : 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}
                                >
                                    AVALIAÇÕES
                                </button>
                            </div>

                            <button onClick={handleCreateWorkout} className="w-full bg-yellow-500 p-4 rounded-xl font-black text-black flex items-center justify-center gap-2 shadow-lg shadow-yellow-900/20 hover:bg-yellow-400 transition-transform active:scale-95">
                                <Plus size={24} /> Novo Treino
                            </button>

                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Meus Treinos</h3>
                                {workouts.length === 0 && (
                                    <div className="text-center py-10 text-neutral-600">
                                        <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50"><Dumbbell size={32} /></div>
                                        <p>Nenhum treino criado.</p>
                                    </div>
                                )}
                                {workouts.map(w => (
                                    <div
                                        key={w.id}
                                        className="bg-neutral-800 rounded-xl p-4 border-l-4 border-neutral-600 md:hover:border-yellow-500 transition-all group relative overflow-hidden cursor-pointer"
                                        onClick={() => setQuickViewWorkout(w)}
                                    >
                                        <div className="relative z-10">
                                            <h3 className="font-bold text-white text-lg uppercase mb-1 pr-32 leading-tight">{w.title}</h3>
                                            <p className="text-xs text-neutral-400 font-mono mb-4">{w.exercises?.length || 0} EXERCÍCIOS</p>

                                            <div className="flex gap-2 mt-2">
                                                <button onClick={(e) => { e.stopPropagation(); handleStartSession(w); }} className="relative z-30 flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg flex items-center justify-center gap-2 text-white font-bold text-sm transition-colors border border-white/10 active:scale-95 touch-manipulation">
                                                    <Play size={16} className="fill-white" /> INICIAR TREINO
                                                </button>
                                            </div>
                                        </div>

                                        <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20 bg-neutral-900/50 backdrop-blur-sm rounded-lg p-1 border border-white/5">
                                            <button onClick={(e) => { e.stopPropagation(); handleShareWorkout(w); }} className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white"><Share2 size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDuplicateWorkout(w); }} className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white"><Copy size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); setCurrentWorkout(w); setView('edit'); }} className="p-2 hover:bg-black/50 rounded text-neutral-400 hover:text-white"><MoreVertical size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteWorkout(w.id); }} className="p-2 hover:bg-red-900/80 rounded text-neutral-400 hover:text-red-500"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {view === 'edit' && (
                        <ExerciseEditor
                            workout={currentWorkout}
                            onSave={w => { setCurrentWorkout(w); handleSaveWorkout(); }}
                            onCancel={() => setView('dashboard')}
                            onChange={setCurrentWorkout}
                        />
                    )}

                    {view === 'active' && activeSession && (
                        <ActiveWorkout
                            session={activeSession}
                            user={user}
                            onUpdateLog={handleUpdateSessionLog}
                            onFinish={handleFinishSession}
                            onBack={async () => { if (await confirm("Sair do treino?", "Encerrar Sessão")) setView('dashboard'); }}
                            onStartTimer={handleStartTimer}
                            isCoach={isCoach}
                            onUpdateSession={(updates) => setActiveSession(prev => ({ ...prev, ...updates }))}
                        />
                    )}

                    {view === 'history' && (
                        <div className="p-4 pb-24">
                            <HistoryList user={user} onViewReport={(s) => { setReportData({ current: s, previous: null }); setView('report'); }} />
                        </div>
                    )}

                    {/* Evolução removida conforme solicitação */}

                    {view === 'assessments' && (
                        <div className="p-4 pb-24">
                            <AssessmentHistory studentId={user.id} />
                        </div>
                    )}

                    {view === 'report' && reportData.current && (
                        <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe">
                            <WorkoutReport
                                session={reportData.current}
                                previousSession={reportData.previous}
                                onClose={() => setView('dashboard')}
                            />
                        </div>
                    )}

                    {view === 'chat' && (
                        <div className="absolute inset-0 z-50 bg-neutral-900">
                            <ChatScreen user={user} onClose={() => setView('dashboard')} />
                        </div>
                    )}

                    {view === 'admin' && (
                        <div className="fixed inset-0 z-[60]">
                            <AdminPanelV2 user={user} onClose={() => setView('dashboard')} />
                        </div>
                    )}
                </div>

                {/* Modals & Overlays */}
                {showImportModal && (
                    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
                        <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800">
                            <h3 className="font-bold text-white mb-4">Importar Treino (Código)</h3>
                            <input
                                value={importCode}
                                onChange={e => setImportCode(e.target.value)}
                                placeholder="Cole o código do treino aqui"
                                className="w-full bg-neutral-800 p-4 rounded-xl mb-4 text-white font-mono text-center uppercase"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setShowImportModal(false)} className="flex-1 p-3 bg-neutral-800 rounded-xl font-bold text-neutral-400">Cancelar</button>
                                <button onClick={handleImportWorkout} className="flex-1 p-3 bg-blue-600 rounded-xl font-bold text-white">Importar</button>
                            </div>
                        </div>
                    </div>
                )}
                
                {showJsonImportModal && (
                     <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4">
                        <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 text-center">
                            <Upload size={48} className="mx-auto text-blue-500 mb-4" />
                            <h3 className="font-bold text-white mb-2 text-xl">Restaurar Backup</h3>
                            <p className="text-neutral-400 text-sm mb-6">Selecione o arquivo .json que você salvou anteriormente.</p>
                            
                            <label className="block w-full cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-colors">
                                Selecionar Arquivo
                                <input type="file" accept=".json" onChange={handleJsonUpload} className="hidden" />
                            </label>
                            
                            <button onClick={() => setShowJsonImportModal(false)} className="mt-4 text-neutral-500 text-sm hover:text-white">Cancelar</button>
                        </div>
                    </div>
                )}

                {shareCode && (
                    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
                        <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 text-center">
                            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-black"><Check size={32} /></div>
                            <h3 className="font-bold text-white mb-2">Link Gerado!</h3>
                            <p className="text-neutral-400 text-sm mb-6">Envie este código para seu aluno ou amigo.</p>
                            <div className="bg-black p-4 rounded-xl font-mono text-yellow-500 text-xl mb-4 tracking-widest select-all">
                                {shareCode}
                            </div>
                            <button onClick={() => setShareCode(null)} className="w-full p-3 bg-neutral-800 rounded-xl font-bold text-white">Fechar</button>
                        </div>
                    </div>
                )}

                {quickViewWorkout && (
                    <div className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQuickViewWorkout(null)}>
                        <div className="bg-neutral-900 w-full max-w-lg rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                                <h3 className="font-bold text-white">{quickViewWorkout.title}</h3>
                                <button className="p-2 hover:bg-neutral-800 rounded-full" onClick={() => setQuickViewWorkout(null)}><X size={18} className="text-neutral-400" /></button>
                            </div>
                            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar">
                                {quickViewWorkout.exercises?.map((ex, idx) => (
                                    <div key={idx} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-bold text-white text-sm">{ex.name}</h4>
                                            <span className="text-xs text-neutral-400">{(parseInt(ex.sets) || 0)} x {ex.reps || '-'}</span>
                                        </div>
                                        <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                                            <Clock size={14} className="text-yellow-500" /><span>Descanso: {ex.restTime ? `${parseInt(ex.restTime)}s` : '-'}</span>
                                        </div>
                                        {ex.notes && <p className="text-sm text-neutral-300 mt-2">{ex.notes}</p>}
                                    </div>
                                ))}
                                {(!quickViewWorkout.exercises || quickViewWorkout.exercises.length === 0) && (
                                    <p className="text-neutral-400 text-sm">Este treino não tem exercícios.</p>
                                )}
                            </div>
                            <div className="p-4 border-t border-neutral-800 flex gap-2">
                                <button onClick={() => { const w = quickViewWorkout; setQuickViewWorkout(null); handleStartSession(w); }} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl">Iniciar Treino</button>
                                <button onClick={() => setQuickViewWorkout(null)} className="flex-1 p-3 bg-neutral-800 text-white font-bold rounded-xl">Fechar</button>
                            </div>
                        </div>
                    </div>
                )}

                {activeSession?.timerTargetTime && (
                    <RestTimerOverlay
                        targetTime={activeSession.timerTargetTime}
                        onClose={handleCloseTimer}
                        onFinish={handleCloseTimer}
                    />
                )}

                {notification && (
                    <NotificationToast
                        message={notification.text}
                        sender={notification.senderName}
                        onClick={() => { setView('chat'); setNotification(null); }}
                        onClose={() => setNotification(null)}
                    />
                )}

                {/* Admin Panel Modal controlled by State */}
                {showAdminPanel && (
                    <AdminPanelV2 user={user} onClose={() => setShowAdminPanel(false)} />
                )}
            </div>
        </TeamWorkoutProvider>
    );
}

export default function Home() {
    return (
        <ErrorBoundary>
            <DialogProvider>
                <IronTracksApp />
                <GlobalDialog />
            </DialogProvider>
        </ErrorBoundary>
    );
}
