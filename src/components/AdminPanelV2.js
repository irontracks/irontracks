import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
    Crown, X, UserCog, AlertCircle, Trash2, Megaphone, Plus, Copy, ArrowLeft,
    MessageSquare, Send, RefreshCw, Dumbbell, Share2, UserPlus, AlertTriangle, Edit3
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import AdminWorkoutEditor from './AdminWorkoutEditor';
import { useDialog } from '@/contexts/DialogContext';
import { sendBroadcastMessage } from '@/actions/admin-actions';
import { updateWorkout, deleteWorkout } from '@/actions/workout-actions';
import AssessmentButton from '@/components/assessment/AssessmentButton';

const ADMIN_EMAIL = 'djmkapple@gmail.com';

const AdminPanelV2 = ({ user, onClose }) => {
    const { alert, confirm } = useDialog();
    const supabase = createClient();
    const isAdmin = user?.email?.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
    const router = useRouter();

    const [tab, setTab] = useState('dashboard');
    const [usersList, setUsersList] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [subTab, setSubTab] = useState('workouts');
    const [studentWorkouts, setStudentWorkouts] = useState([]);
    const [assessments, setAssessments] = useState([]);
    const [editingStudent, setEditingStudent] = useState(false);
    const [editedStudent, setEditedStudent] = useState({ name: '', email: '' });
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [loading, setLoading] = useState(false);

    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newStudent, setNewStudent] = useState({ name: '', email: '' });
    const [registering, setRegistering] = useState(false);

    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);

    const [teachersList, setTeachersList] = useState([]);
    const [showTeacherModal, setShowTeacherModal] = useState(false);
    const [newTeacher, setNewTeacher] = useState({ name: '', email: '', phone: '' });
    const [addingTeacher, setAddingTeacher] = useState(false);

    // DIAGNOSTIC MODE: Connection Test
    const [debugError, setDebugError] = useState(null);

    useEffect(() => {
        const testConnection = async () => {
            try {
                // AÇÃO 2: Teste agressivo sem filtros
                const { data, error } = await supabase.from('workouts').select('*').limit(1);
                
                if (error) {
                    console.error("ERRO CRÍTICO SUPABASE:", error);
                    setDebugError("Erro Supabase: " + error.message + " | Detalhes: " + JSON.stringify(error));
                } else if (!data || data.length === 0) {
                    // Se não retornar nada, pode ser RLS ou tabela vazia, mas a conexão funcionou
                    // setDebugError("Conexão OK, mas tabela vazia ou bloqueada por RLS.");
                    console.log("Conexão OK (tabela vazia ou RLS)");
                } else {
                    console.log("Conexão OK (dados encontrados)");
                }
            } catch (e) {
                console.error("ERRO DE CONEXÃO/FETCH:", e);
                setDebugError("Erro Catch: " + e.message);
            }
        };
        testConnection();
    }, []);

    useEffect(() => {
        const fetchStudents = async () => {
            setLoading(true);
            
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) {
                 setLoading(false);
                 return;
            }

            console.log("DASHBOARD (Admin): Buscando alunos para usuário:", currentUser.id);

            try {
                // Try dedicated students registry first
                let query = supabase.from('students').select('id, name, email, teacher_id, user_id').order('name');
                if (!isAdmin) query = query.eq('teacher_id', currentUser.id);
                
                const { data: studentsData, error } = await query;
                
                if (error) {
                    console.error('[AdminPanel] Students query error:', error.message);
                } else {
                    console.log("ALUNOS ENCONTRADOS:", studentsData?.length);
                }
                
                let list = studentsData || [];

                // Fallback: for master admin, if registry is empty or incomplete, check legacy workouts
                if (isAdmin) {
                    // Fetch legacy students from API
                    try {
                        const res = await fetch('/api/admin/legacy-students');
                        const json = await res.json();
                        if (json.ok && json.students) {
                            // Merge avoiding duplicates (by email or id)
                            const existingIds = new Set(list.map(s => s.user_id || s.id));
                            const newLegacy = json.students.filter(s => !existingIds.has(s.id));
                            list = [...list, ...newLegacy];
                        }
                    } catch (err) {
                        console.warn('Failed to fetch legacy students', err);
                    }
                    
                    // If still empty, show all profiles (last resort)
                    if (list.length === 0) {
                        const { data: profiles } = await supabase
                            .from('profiles')
                            .select('id, display_name, email, photo_url')
                            .order('display_name');
                        list = (profiles || []).map(p => ({ id: p.id, name: p.display_name, email: p.email, teacher_id: null, user_id: p.id }));
                    }
                }
                setUsersList(list || []);
            } finally {
                setLoading(false);
            }
        };
        fetchStudents();
    }, [registering, isAdmin]);

    useEffect(() => {
        if (tab === 'teachers' && isAdmin) {
            const fetchTeachers = async () => {
                console.log("DASHBOARD (Admin): Buscando professores...");
                const { data, error } = await supabase.from('teachers').select('*').order('name');
                if (error) console.error(error);
                setTeachersList(data || []);
            };
            fetchTeachers();
        }
    }, [tab, isAdmin, addingTeacher]);

    // Remove URL persistence to prevent "black screen" loops on refresh
    // useEffect(() => {
    //    if (typeof window === 'undefined') return;
    //    const sp = new URLSearchParams(window.location.search);
    //    const t = sp.get('tab');
    //    if (t && ['dashboard','students','teachers','templates','broadcast'].includes(t)) setTab(t);
    // }, []);
    // useEffect(() => {
    //    if (typeof window === 'undefined') return;
    //    const sp = new URLSearchParams(window.location.search);
    //    sp.set('tab', tab);
    //    const url = `${window.location.pathname}?${sp.toString()}`;
    //    window.history.replaceState(null, '', url);
    // }, [tab]);

    useEffect(() => {
        if (tab !== 'templates') return;
        const fetchTemplates = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) return;

            console.log('[AdminPanel] Fetching templates for user:', currentUser.id);
            const { data, error } = await supabase
                .from('workouts')
                .select('*, exercises(*)')
                // Modified to prioritize created_by as per user request, but keep fallback
                .or(`created_by.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
                .order('name');
            
            if (error) {
                 console.error('[AdminPanel] Templates error:', error);
                 // alert('Debug: Erro ao buscar treinos: ' + error.message);
            } else {
                 console.log('[AdminPanel] Templates raw data:', data?.length);
            }

            let list = (data || []).filter(w => (w.is_template === true || w.created_by === currentUser.id || w.user_id === currentUser.id) && w.is_deleted !== true);
            if ((!list || list.length === 0) || error) {
                const { data: legacy } = await supabase
                    .from('workouts')
                    .select('id, uuid, name, athlete_uuid, is_deleted')
                    .eq('athlete_uuid', currentUser.id)
                    .order('name');
                list = (legacy || []).filter(w => w.is_deleted !== true).map(w => ({ id: w.id || w.uuid, name: w.name, exercises: [] }));
            }
            setTemplates(list || []);
        };
        fetchTemplates();
    }, [tab]);

    useEffect(() => {
        if (!selectedStudent) return;
        const fetchDetails = async () => {
            setLoading(true);
            const targetId = selectedStudent.user_id || selectedStudent.id;
            const { data: wData } = await supabase
                .from('workouts')
                .select('*, exercises(*)')
                .eq('user_id', targetId)
                .order('name');
            setStudentWorkouts(wData || []);
            const { data: aData } = await supabase
                .from('assessments')
                .select('*')
                .or(`student_id.eq.${targetId},user_id.eq.${targetId}`)
                .order('date', { ascending: false });
            setAssessments(aData || []);
            setLoading(false);
        };
        fetchDetails();
    }, [selectedStudent]);

    const handleRegisterStudent = async () => {
        if (!newStudent.name || !newStudent.email) return await alert('Preencha nome e email.');
        setRegistering(true);
        try {
            const { data, error } = await supabase
                .from('students')
                .insert({ name: newStudent.name, email: newStudent.email, teacher_id: user.id })
                .select();
            if (error) throw error;
            setUsersList(prev => (data?.[0] ? [data[0], ...prev] : prev));
            setShowRegisterModal(false);
            setNewStudent({ name: '', email: '' });
            await alert('Aluno cadastrado com sucesso!', 'Sucesso');
        } catch (e) {
            await alert('Erro ao cadastrar: ' + e.message);
        } finally {
            setRegistering(false);
        }
    };

    // Assign template workout to selected student (clone workout and exercises)
    const handleAddTemplateToStudent = async (template) => {
        if (!selectedStudent) return;
        const targetId = selectedStudent.user_id || selectedStudent.id;
        if (!(await confirm(`Adicionar treino "${template.name}" para ${selectedStudent.name || selectedStudent.email}?`))) return;
        try {
            const { data: newWorkout, error: wErr } = await supabase
                .from('workouts')
                .insert({ user_id: targetId, name: template.name, notes: template.notes })
                .select()
                .single();
            if (wErr) throw wErr;
            const toInsert = (template.exercises || []).map(e => ({
                workout_id: newWorkout.id,
                name: e.name || '',
                sets: e.sets ?? 4,
                reps: e.reps ?? '10',
                rpe: e.rpe ?? 8,
                cadence: e.cadence || '2020',
                rest_time: e.rest_time ?? 60,
                method: e.method || 'Normal',
                video_url: e.video_url || '',
                notes: e.notes || ''
            }));
            if (toInsert.length) {
                const { error: exErr } = await supabase.from('exercises').insert(toInsert);
                if (exErr) throw exErr;
            }
            const { data: wData } = await supabase
                .from('workouts')
                .select('*, exercises(*)')
                .eq('user_id', targetId)
                .order('name');
            setStudentWorkouts(wData || []);
            await alert('Treino enviado com sucesso!', 'Sucesso');
        } catch (e) {
            await alert('Erro ao enviar: ' + e.message);
        }
    };

    const handleSendBroadcast = async () => {
        if (!broadcastTitle || !broadcastMsg) return await alert('Preencha título e mensagem.');
        setSendingBroadcast(true);
        try {
            const res = await sendBroadcastMessage(broadcastTitle, broadcastMsg);
            if (res.error) throw new Error(res.error);
            await alert('Aviso enviado!', 'Sucesso');
            setBroadcastTitle('');
            setBroadcastMsg('');
        } catch (e) {
            await alert('Erro ao enviar: ' + e.message);
        } finally {
            setSendingBroadcast(false);
        }
    };

    const handleEditStudent = () => {
        if (!selectedStudent) return;
        setEditedStudent({ name: selectedStudent.name || '', email: selectedStudent.email || '' });
        setEditingStudent(true);
    };

    const handleSaveStudentEdit = async () => {
        if (!selectedStudent || !editedStudent.name || !editedStudent.email) return await alert('Preencha todos os campos.');
        try {
            const { error } = await supabase
                .from('students')
                .update({ name: editedStudent.name, email: editedStudent.email })
                .eq('id', selectedStudent.id);
            if (error) throw error;
            setSelectedStudent(prev => ({ ...prev, name: editedStudent.name, email: editedStudent.email }));
            setUsersList(prev => prev.map(s => s.id === selectedStudent.id ? { ...s, name: editedStudent.name, email: editedStudent.email } : s));
            setEditingStudent(false);
            await alert('Dados do aluno atualizados.');
        } catch (e) {
            await alert('Erro ao salvar: ' + e.message);
        }
    };

    const handleAddTeacher = async () => {
        if (!newTeacher.name || !newTeacher.email) return await alert('Preencha nome e email.');
        setAddingTeacher(true);
        try {
            const { error } = await supabase.from('teachers').insert({
                name: newTeacher.name,
                email: newTeacher.email,
                phone: newTeacher.phone,
                status: 'active'
            });
            if (error) throw error;
            await alert('Professor adicionado com sucesso!');
            setShowTeacherModal(false);
            setNewTeacher({ name: '', email: '', phone: '' });
        } catch (e) {
            await alert('Erro ao adicionar professor: ' + e.message);
        } finally {
            setAddingTeacher(false);
        }
    };

    const TAB_LABELS = { dashboard: 'VISÃO GERAL', students: 'ALUNOS', templates: 'MEUS TREINOS', broadcast: 'AVISOS' };

    return (
        <div className="fixed inset-0 z-50 bg-neutral-900 overflow-y-auto text-white">
            <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500/95 shadow-2xl rounded-b-[2rem] pt-safe pb-4 px-6 border-b border-yellow-600/20">
                {debugError && (
                    <div className="bg-red-600 text-white font-bold p-4 text-center text-xs break-all mb-2 rounded-xl">
                        DIAGNOSTIC MODE: {debugError}
                    </div>
                )}
                <div className="flex justify-between items-center">
                    <h2 
                        className="font-black text-xl flex items-center gap-2 text-black cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.location.reload()}
                    >
                        <Crown size={24} /> CENTRO DE COMANDO
                    </h2>
                    <button onClick={() => { onClose && onClose(); }} className="bg-black/10 p-2 rounded-full hover:bg-black/20 text-black transition-colors"><X size={24} /></button>
                </div>
                <div className="flex gap-2 mt-4 overflow-x-auto pb-2 no-scrollbar">
                    {Object.entries(TAB_LABELS).map(([key, label]) => (
                        <button key={key} onClick={() => { setTab(key); setSelectedStudent(null); }} className={`px-4 py-2 rounded-full font-bold text-xs whitespace-nowrap transition-all ${tab === key ? 'bg-black text-yellow-500' : 'bg-black/10 text-black/60 hover:bg-black/20'}`}>{label}</button>
                    ))}
                </div>
            </div>

            <div className="p-4 pb-20 pt-[160px]">
                {tab === 'dashboard' && !selectedStudent && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
                            <h3 className="text-neutral-400 text-xs font-bold uppercase">Total Alunos</h3>
                            <p className="text-3xl font-black text-white">{usersList.length}</p>
                        </div>
                        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
                            <h3 className="text-neutral-400 text-xs font-bold uppercase">Treinos Criados</h3>
                            <p className="text-3xl font-black text-yellow-500">{templates.length || '-'}</p>
                        </div>
                    </div>
                )}

                {tab === 'students' && !selectedStudent && (
                    <div className="space-y-3">
                        <button onClick={() => setShowRegisterModal(true)} className="w-full py-3 bg-neutral-800 border border-yellow-500/30 text-yellow-500 rounded-xl font-bold flex items-center justify-center gap-2 mb-4 hover:bg-yellow-500/10">
                            <UserPlus size={20} /> CADASTRAR NOVO ALUNO
                        </button>
                        {usersList.map(s => (
                            <div key={s.id} onClick={() => setSelectedStudent(s)} className="bg-neutral-800 p-4 rounded-xl flex items-center gap-4 border border-neutral-700 hover:border-yellow-500 cursor-pointer">
                                <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-lg text-neutral-300">{(s.name || s.email || '?')[0]}</div>
                                <div>
                                    <h3 className="font-bold text-white">{s.name || s.email}</h3>
                                    <p className="text-xs text-neutral-400">{s.email}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {tab === 'templates' && !selectedStudent && (
                    <div className="space-y-3">
                        {templates.map(t => (
                            <div key={t.id} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-white">{t.name}</h3>
                                    <p className="text-xs text-neutral-500">{t.exercises?.length || 0} exercícios</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setEditingTemplate({ id: t.id, title: t.name, exercises: (t.exercises || []).map(e => ({ name: e.name || '', sets: e.sets ?? 4, reps: e.reps ?? '10', rpe: e.rpe ?? 8, cadence: e.cadence || '2020', restTime: e.rest_time ?? 60, method: e.method || 'Normal', videoUrl: e.video_url || '', notes: e.notes || '' })) })} className="w-8 h-8 rounded-full bg-neutral-700 hover:bg-yellow-500 text-neutral-300 hover:text-black flex items-center justify-center"><Edit3 size={16} /></button>
                                    <button onClick={async () => { if (!(await confirm('Excluir este treino?', 'Apagar Treino'))) return; try { await deleteWorkout(t.id); setTemplates(prev => prev.filter(x => x.id !== t.id)); } catch (e) { await alert('Erro ao excluir: ' + e.message); } }} className="w-8 h-8 rounded-full bg-neutral-700 hover:bg-red-600 text-neutral-300 hover:text-white flex items-center justify-center"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {tab === 'broadcast' && !selectedStudent && (
                    <div className="space-y-4">
                        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-neutral-500 uppercase">Título do Aviso</label>
                                <input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} className="w-full bg-neutral-900 p-3 rounded-lg text-white font-bold mt-1 border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-neutral-500 uppercase">Mensagem</label>
                                <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} className="w-full bg-neutral-900 p-3 rounded-lg text-white mt-1 border border-neutral-700 focus:border-yellow-500 outline-none h-32" />
                            </div>
                            <button onClick={handleSendBroadcast} disabled={sendingBroadcast} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                                {sendingBroadcast ? 'Enviando...' : (<><Megaphone size={20} /> ENVIAR AVISO</>)}
                            </button>
                        </div>
                    </div>
                )}

                {tab === 'teachers' && isAdmin && !selectedStudent && (
                    <div className="space-y-3">
                        <button onClick={() => setShowTeacherModal(true)} className="w-full py-3 bg-neutral-800 border border-yellow-500/30 text-yellow-500 rounded-xl font-bold flex items-center justify-center gap-2 mb-4 hover:bg-yellow-500/10">
                            <Plus size={20} /> ADICIONAR PROFESSOR
                        </button>
                        {teachersList.length === 0 && <p className="text-neutral-500 text-center py-10">Nenhum professor cadastrado.</p>}
                        {teachersList.map(t => (
                            <div key={t.id} className="bg-neutral-800 p-4 rounded-xl flex justify-between items-center border border-neutral-700">
                                <div>
                                    <h3 className="font-bold text-white">{t.name}</h3>
                                    <p className="text-xs text-neutral-400">{t.email}</p>
                                    <p className="text-xs text-neutral-500">{t.phone}</p>
                                </div>
                                <div className="px-3 py-1 rounded-full bg-neutral-700 text-xs font-bold uppercase">{t.status}</div>
                            </div>
                        ))}
                    </div>
                )}

                {selectedStudent && (
                    <div className="animate-slide-up">
                        <button onClick={() => setSelectedStudent(null)} className="mb-4 flex items-center gap-2 text-yellow-500 font-bold"><ArrowLeft size={20}/> Voltar para Lista</button>
                        {editingStudent ? (
                            <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 mb-6">
                                <h3 className="text-lg font-bold text-white mb-4">Editar Informações do Aluno</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">Nome</label>
                                        <input type="text" value={editedStudent.name || ''} onChange={(e) => setEditedStudent(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">Email</label>
                                        <input type="email" value={editedStudent.email || ''} onChange={(e) => setEditedStudent(prev => ({ ...prev, email: e.target.value }))} className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500 focus:outline-none" />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button onClick={handleSaveStudentEdit} className="flex-1 py-2 bg-yellow-500 text-black rounded-lg font-bold hover:bg-yellow-400 transition-colors">Salvar</button>
                                        <button onClick={() => setEditingStudent(false)} className="flex-1 py-2 bg-neutral-700 text-neutral-300 rounded-lg font-bold hover:bg-neutral-600 transition-colors">Cancelar</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-2xl">{(selectedStudent.name || selectedStudent.email || '?')[0]}</div>
                                <div className="flex-1">
                                    <h2 className="text-2xl font-black text-white">{selectedStudent.name || selectedStudent.email}</h2>
                                    <p className="text-neutral-400 text-sm">{selectedStudent.email}</p>
                                </div>
                                <button onClick={() => setEditingStudent(true)} className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors" title="Editar"><Edit3 size={18} className="text-neutral-300" /></button>
                            </div>
                        )}

                        <div className="flex gap-2 mb-6">
                            <button onClick={() => setSubTab('workouts')} className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase ${subTab === 'workouts' ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400'}`}>Treinos</button>
                            <button onClick={() => setSubTab('evolution')} className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase ${subTab === 'evolution' ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400'}`}>Evolução</button>
                        </div>

                        {loading && <p className="text-center animate-pulse">Carregando dados...</p>}

                        {!loading && subTab === 'workouts' && (
                            <div className="space-y-4">
                                <h3 className="font-bold text-white">Treinos do Aluno</h3>
                                {studentWorkouts.length === 0 && <p className="text-neutral-500 text-sm">Nenhum treino atribuído.</p>}
                                {studentWorkouts.map(w => (
                                    <div key={w.id} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold text-white">{w.name}</h4>
                                            <p className="text-xs text-neutral-500">{w.exercises?.length || 0} exercícios</p>
                                        </div>
                                        <button onClick={async () => { if (!(await confirm('Remover este treino do aluno?'))) return; try { await supabase.from('workouts').delete().eq('id', w.id); setStudentWorkouts(prev => prev.filter(x => x.id !== w.id)); } catch (e) { await alert('Erro ao remover: ' + e.message); } }} className="p-2 text-red-500 hover:bg-red-900/20 rounded"><Trash2 size={18}/></button>
                                    </div>
                                ))}
                                <div className="mt-6">
                                    <h3 className="font-bold text-yellow-500 text-xs uppercase tracking-widest mb-2">Enviar Treino Modelo</h3>
                                    {templates.map(t => (
                                        <button key={t.id} onClick={() => handleAddTemplateToStudent(t)} className="w-full text-left p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl border border-neutral-700 flex justify-between group">
                                            <span>{t.name}</span>
                                            <Plus className="text-neutral-500 group-hover:text-yellow-500"/>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!loading && subTab === 'evolution' && (
                            <div className="space-y-4">
                                <AssessmentButton studentId={selectedStudent.user_id || selectedStudent.id} studentName={selectedStudent.name} variant="card" />
                                {assessments.length > 0 && (
                                    <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
                                        <h4 className="font-bold text-white mb-3">Avaliações Anteriores</h4>
                                        {assessments.map(a => (
                                            <div key={a.id} className="flex justify-between items-center py-2 border-b border-neutral-700 last:border-0">
                                                <span className="text-neutral-400">{new Date(a.date).toLocaleDateString()}</span>
                                                <div className="text-right">
                                                    <span className="block font-bold text-white">{a.bf}% Gordura</span>
                                                    <span className="text-xs text-neutral-500">{a.weight}kg</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {editingTemplate && (
                    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingTemplate(null)}>
                        <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                                <h3 className="font-bold text-white">Editar Treino</h3>
                                <button onClick={() => setEditingTemplate(null)} className="p-2 hover:bg-neutral-800 rounded-full"><X size={18} className="text-neutral-400"/></button>
                            </div>
                            <div className="p-4 max-h-[75vh] overflow-y-auto">
                                <AdminWorkoutEditor
                                    initialData={editingTemplate}
                                    onSave={async (data) => {
                                        try {
                                            await updateWorkout(editingTemplate.id, data);
                                            const { data: refreshed } = await supabase
                                                .from('workouts')
                                                .select('*, exercises(*)')
                                                .eq('user_id', user.id)
                                                .order('name');
                                            setTemplates(refreshed || []);
                                            setEditingTemplate(null);
                                        } catch (e) { await alert('Erro ao salvar: ' + e.message); }
                                    }}
                                    onCancel={() => setEditingTemplate(null)}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showRegisterModal && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl">
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2"><UserPlus size={24} className="text-yellow-500"/> Novo Aluno</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input value={newStudent.email} onChange={e => setNewStudent({ ...newStudent, email: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowRegisterModal(false)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700">Cancelar</button>
                            <button onClick={handleRegisterStudent} disabled={registering} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50">{registering ? 'Cadastrando...' : 'CADASTRAR'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanelV2;
