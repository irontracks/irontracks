import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
    Crown, X, UserCog, AlertCircle, Trash2, Megaphone, Plus, Copy, ArrowLeft,
    MessageSquare, Send, RefreshCw, Dumbbell, Share2, UserPlus, AlertTriangle, Edit3
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import AdminWorkoutEditor from './AdminWorkoutEditor';
import { useDialog } from '@/contexts/DialogContext';
import { sendBroadcastMessage } from '@/actions/admin-actions';
import AssessmentButton from '@/components/assessment/AssessmentButton';

const appId = 'irontracks-production';
const ADMIN_EMAIL = 'djmkapple@gmail.com';

const AdminPanelV2 = ({ user, onClose }) => {
    const { alert, confirm, prompt } = useDialog();
    const isAdmin = user?.email === ADMIN_EMAIL;
    const [tab, setTab] = useState('dashboard');
    const [usersList, setUsersList] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Broadcast State
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);

    // Register Student State
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newStudent, setNewStudent] = useState({ name: '', email: '' });
    const [registering, setRegistering] = useState(false);

    // Student Details State
    const [subTab, setSubTab] = useState('workouts');
    const [studentWorkouts, setStudentWorkouts] = useState([]);
    const [assessments, setAssessments] = useState([]);
    const [editingStudent, setEditingStudent] = useState(false);
    const [editedStudent, setEditedStudent] = useState({});
    
    const isSuperAdmin = user.email === ADMIN_EMAIL;
    const supabase = createClient();

    // 1. Fetch Students (students table with RLS)
    useEffect(() => {
        const fetchStudents = async () => {
            let query = supabase.from('students').select('id, name, email, teacher_id').order('name');
            if (!isAdmin) query = query.eq('teacher_id', user.id);
            const { data, error } = await query;
            if (error) console.error('Students query error:', error.message);
            setUsersList(data || []);
        };
        fetchStudents();
    }, [registering, isAdmin, user.id]);

    // 2. Fetch Templates (Admin Workouts)
    useEffect(() => {
        if (tab !== 'templates') return;
        const fetchTemplates = async () => {
            const { data } = await supabase
                .from('workouts')
                .select('*, exercises(*)')
                .eq('user_id', user.id)
                .eq('is_template', true)
                .order('name');
            if (data) setTemplates(data);
        };
        fetchTemplates();
    }, [tab, user.id]);

    // 3. Fetch Student Details when selected
    useEffect(() => {
        if (!selectedStudent) return;
        
        const fetchDetails = async () => {
            setLoading(true);
            // Workouts
            const { data: wData } = await supabase
                .from('workouts')
                .select('*, exercises(*)')
                .eq('user_id', selectedStudent.id)
                .eq('is_template', true)
                .order('name');
            if (wData) setStudentWorkouts(wData);

            // Assessments
            const { data: aData } = await supabase
                .from('assessments')
                .select('*')
                .eq('user_id', selectedStudent.id)
                .order('date', { ascending: false });
            if (aData) setAssessments(aData);
            
            setLoading(false);
        };
        fetchDetails();
    }, [selectedStudent]);

    // ACTIONS
    
    const handleAddTemplateToStudent = async (template) => {
        if (!selectedStudent) return;
        if (!(await confirm(`Adicionar treino "${template.name}" para ${selectedStudent.name || selectedStudent.display_name}?`))) return;

        try {
            // Clone Workout
            const { data: newWorkout, error: wError } = await supabase
                .from('workouts')
                .insert({
                    user_id: selectedStudent.user_id || selectedStudent.id,
                    name: template.name,
                    notes: template.notes,
                    is_template: true
                })
                .select()
                .single();
            
            if (wError) throw wError;

            // Clone Exercises
            if (template.exercises && template.exercises.length > 0) {
                 const exercisesToInsert = template.exercises.map(ex => ({
                    workout_id: newWorkout.id,
                    name: ex.name,
                    muscle_group: ex.muscle_group,
                    notes: ex.notes,
                    video_url: ex.video_url,
                    rest_time: ex.rest_time,
                    cadence: ex.cadence,
                    method: ex.method,
                    "order": ex.order
                }));
                await supabase.from('exercises').insert(exercisesToInsert);
            }

            await alert("Treino enviado com sucesso!");
            // Refresh list
            setStudentWorkouts(prev => [...prev, newWorkout]); // Optimistic update (exercises missing but ok for list)
        } catch (e) {
            await alert("Erro ao enviar: " + e.message);
        }
    };

    const handleDeleteStudentWorkout = async (wId) => {
        if (!(await confirm("Remover este treino do aluno?"))) return;
        await supabase.from('workouts').delete().eq('id', wId);
        setStudentWorkouts(prev => prev.filter(w => w.id !== wId));
    };

    const handleCreateAssessment = async () => {
        const weight = await prompt("Peso (kg):");
        if (!weight) return;
        const bf = await prompt("% Gordura:");
        
        try {
            const { data, error } = await supabase.from('assessments').insert({
                user_id: selectedStudent.id,
                weight: parseFloat(weight),
                bf: parseFloat(bf),
                date: new Date()
            }).select().single();

            if (error) throw error;
            setAssessments(prev => [data, ...prev]);
            await alert("Avaliação registrada!");
        } catch (e) {
            await alert("Erro: " + e.message);
        }
    };

    const handleEditStudent = async () => {
        if (!selectedStudent) return;
        
        setEditedStudent({
            display_name: selectedStudent.display_name,
            email: selectedStudent.email
        });
        setEditingStudent(true);
    };

    const handleSaveStudentEdit = async () => {
        if (!selectedStudent || !editedStudent.display_name || !editedStudent.email) {
            await alert("Por favor, preencha todos os campos.");
            return;
        }

        try {
            const { error } = await supabase
                .from('students')
                .update({
                    name: editedStudent.name,
                    email: editedStudent.email
                })
                .eq('id', selectedStudent.id);

            if (error) throw error;

            // Atualizar o aluno selecionado
            setSelectedStudent(prev => ({
                ...prev,
                name: editedStudent.name,
                email: editedStudent.email
            }));

            // Atualizar a lista de alunos
            setUsersList(prev => prev.map(student => 
                student.id === selectedStudent.id 
                    ? { ...student, name: editedStudent.name, email: editedStudent.email }
                    : student
            ));

            await alert("Informações do aluno atualizadas com sucesso!");
            setEditingStudent(false);
        } catch (error) {
            await alert("Erro ao atualizar informações: " + error.message);
        }
    };

    const handleSendBroadcast = async () => {
        if (!broadcastTitle || !broadcastMsg) return await alert("Preencha título e mensagem.");
        if (!(await confirm("⚠️ ATENÇÃO: Isso enviará uma notificação para TODOS os usuários do sistema. Tem certeza?", "Confirmar Envio em Massa"))) return;

        setSendingBroadcast(true);
        try {
            const result = await sendBroadcastMessage(broadcastTitle, broadcastMsg);
            if (result.error) throw new Error(result.error);
            
            await alert(`Mensagem enviada para ${result.count} usuários!`, "Sucesso");
            setBroadcastTitle('');
            setBroadcastMsg('');
        } catch (e) {
            await alert("Erro ao enviar: " + e.message);
        } finally {
            setSendingBroadcast(false);
        }
    };

    const handleRegisterStudent = async () => {
        if (!newStudent?.name || !newStudent?.email) return await alert('Preencha nome e email.');
        setRegistering(true);
        try {
            const { data, error } = await supabase
                .from('students')
                .insert({ name: newStudent.name, email: newStudent.email, teacher_id: user.id })
                .select();
            if (error) throw error;
            await alert(`Aluno ${newStudent.name} cadastrado com sucesso!`, 'Sucesso');
            setNewStudent({ name: '', email: '' });
            setShowRegisterModal(false);
            setUsersList(prev => (data?.[0] ? [data[0], ...prev] : prev));
        } catch (e) {
            await alert('Erro ao cadastrar: ' + e.message);
        } finally {
            setRegistering(false);
        }
    };

    const TAB_LABELS = { 'dashboard': 'VISÃO GERAL', 'students': 'ALUNOS', 'templates': 'MEUS TREINOS', 'broadcast': 'AVISOS' };

    return (
        <div className="fixed inset-0 z-50 bg-neutral-900 overflow-y-auto animate-slide-up text-white">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500/95 backdrop-blur-xl shadow-2xl rounded-b-[2rem] pt-safe pb-4 px-6 transition-all border-b border-yellow-600/20">
                <div className="h-2 w-full"></div>
                <div className="flex justify-between items-center">
                    <h2 className="font-black text-xl flex items-center gap-2 text-black"><Crown size={24} /> CENTRO DE COMANDO</h2>
                    <button onClick={onClose} className="bg-black/10 p-2 rounded-full hover:bg-black/20 text-black transition-colors"><X size={24} /></button>
                </div>
                {/* Tabs */}
                {!selectedStudent && (
                    <div className="flex gap-2 mt-4 overflow-x-auto pb-2 no-scrollbar">
                        {Object.entries(TAB_LABELS).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className={`px-4 py-2 rounded-full font-bold text-xs whitespace-nowrap transition-all ${tab === key ? 'bg-black text-yellow-500' : 'bg-black/10 text-black/60 hover:bg-black/20'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 pb-20 pt-[180px]">
                
                {/* DASHBOARD */}
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

                {/* STUDENTS LIST */}
                {tab === 'students' && !selectedStudent && (
                    <div className="space-y-3">
                        <button 
                            onClick={() => setShowRegisterModal(true)}
                            className="w-full py-3 bg-neutral-800 border border-yellow-500/30 text-yellow-500 rounded-xl font-bold flex items-center justify-center gap-2 mb-4 hover:bg-yellow-500/10"
                        >
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

                {/* TEMPLATES LIST */}
                {tab === 'templates' && !selectedStudent && (
                    <div className="space-y-3">
                        <p className="text-sm text-neutral-400 mb-4">Estes são seus treinos modelo. Você pode copiá-los para qualquer aluno.</p>
                        {templates.map(t => (
                            <div key={t.id} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
                                <h3 className="font-bold text-white">{t.name}</h3>
                                <p className="text-xs text-neutral-500">{t.exercises?.length || 0} exercícios</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* BROADCAST TAB */}
                {tab === 'broadcast' && !selectedStudent && (
                    <div className="space-y-4">
                        <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="text-red-500 shrink-0" size={24} />
                            <div>
                                <h3 className="font-bold text-red-500">ZONA DE PERIGO</h3>
                                <p className="text-xs text-red-200 mt-1">
                                    Mensagens enviadas aqui aparecerão para <strong>TODOS</strong> os usuários cadastrados no sistema. Use com cautela.
                                </p>
                            </div>
                        </div>

                        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-neutral-500 uppercase">Título do Aviso</label>
                                <input 
                                    value={broadcastTitle}
                                    onChange={e => setBroadcastTitle(e.target.value)}
                                    className="w-full bg-neutral-900 p-3 rounded-lg text-white font-bold mt-1 border border-neutral-700 focus:border-yellow-500 outline-none"
                                    placeholder="Ex: Manutenção Programada"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-neutral-500 uppercase">Mensagem</label>
                                <textarea 
                                    value={broadcastMsg}
                                    onChange={e => setBroadcastMsg(e.target.value)}
                                    className="w-full bg-neutral-900 p-3 rounded-lg text-white mt-1 border border-neutral-700 focus:border-yellow-500 outline-none h-32"
                                    placeholder="Digite sua mensagem para todos os alunos..."
                                />
                            </div>
                            <button 
                                onClick={handleSendBroadcast}
                                disabled={sendingBroadcast}
                                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-900/20 disabled:opacity-50"
                            >
                                {sendingBroadcast ? 'Enviando...' : <><Megaphone size={20} /> ENVIAR PARA TODOS</>}
                            </button>
                        </div>
                    </div>
                )}

                {/* STUDENT DETAILS VIEW */}
                {selectedStudent && (
                    <div className="animate-slide-up">
                        <button onClick={() => setSelectedStudent(null)} className="mb-4 flex items-center gap-2 text-yellow-500 font-bold"><ArrowLeft size={20}/> Voltar para Lista</button>
                        
                        {editingStudent ? (
                            <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 mb-6">
                                <h3 className="text-lg font-bold text-white mb-4">Editar Informações do Aluno</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">Nome</label>
                                        <input
                                            type="text"
                                            value={editedStudent.name || ''}
                                            onChange={(e) => setEditedStudent(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-300 mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={editedStudent.email || ''}
                                            onChange={(e) => setEditedStudent(prev => ({ ...prev, email: e.target.value }))}
                                            className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2 text-white focus:border-yellow-500 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button
                                            onClick={handleSaveStudentEdit}
                                            className="flex-1 py-2 bg-yellow-500 text-black rounded-lg font-bold hover:bg-yellow-400 transition-colors"
                                        >
                                            Salvar
                                        </button>
                                        <button
                                            onClick={() => setEditingStudent(false)}
                                            className="flex-1 py-2 bg-neutral-700 text-neutral-300 rounded-lg font-bold hover:bg-neutral-600 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-2xl">{(selectedStudent.name || selectedStudent.display_name || '?')[0]}</div>
                                <div className="flex-1">
                                    <h2 className="text-2xl font-black text-white">{selectedStudent.name || selectedStudent.display_name}</h2>
                                    <p className="text-neutral-400 text-sm">{selectedStudent.email}</p>
                                </div>
                                <button
                                    onClick={handleEditStudent}
                                    className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors"
                                    title="Editar informações do aluno"
                                >
                                    <Edit3 size={18} className="text-neutral-300" />
                                </button>
                            </div>
                        )}

                        <div className="flex gap-2 mb-6">
                            <button onClick={() => setSubTab('workouts')} className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase ${subTab === 'workouts' ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400'}`}>Treinos</button>
                            <button onClick={() => setSubTab('evolution')} className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase ${subTab === 'evolution' ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400'}`}>Evolução</button>
                        </div>

                        {loading && <p className="text-center animate-pulse">Carregando dados...</p>}

                        {!loading && subTab === 'workouts' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-white">Treinos do Aluno</h3>
                                </div>
                                {studentWorkouts.length === 0 && <p className="text-neutral-500 text-sm">Nenhum treino atribuído.</p>}
                                {studentWorkouts.map(w => (
                                    <div key={w.id} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold text-white">{w.name}</h4>
                                            <p className="text-xs text-neutral-500">{w.exercises?.length || 0} exercícios</p>
                                        </div>
                                        <button onClick={() => handleDeleteStudentWorkout(w.id)} className="p-2 text-red-500 hover:bg-red-900/20 rounded"><Trash2 size={18}/></button>
                                    </div>
                                ))}

                                <div className="mt-8">
                                    <h3 className="font-bold text-yellow-500 mb-4 text-sm uppercase tracking-widest">Enviar Treino Modelo</h3>
                                    <div className="space-y-2">
                                        {templates.map(t => (
                                            <button key={t.id} onClick={() => handleAddTemplateToStudent(t)} className="w-full text-left p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl border border-neutral-700 flex justify-between group">
                                                <span>{t.name}</span>
                                                <Plus className="text-neutral-500 group-hover:text-yellow-500"/>
                                            </button>
                                        ))}
                                         {templates.length === 0 && <p className="text-neutral-500 text-xs">Você não tem modelos criados. Crie treinos na sua conta primeiro.</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!loading && subTab === 'evolution' && (
                            <div className="space-y-4">
                                <AssessmentButton
                                    studentId={selectedStudent.id}
                                    studentName={selectedStudent.display_name}
                                    variant="card"
                                />
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
            </div>

            {/* REGISTER MODAL */}
            {showRegisterModal && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl animate-scale-in">
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2"><UserPlus size={24} className="text-yellow-500"/> Novo Aluno</h3>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input 
                                    value={newStudent.name}
                                    onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input 
                                    value={newStudent.email}
                                    onChange={e => setNewStudent({...newStudent, email: e.target.value})}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                            
                        </div>

                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowRegisterModal(false)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700">Cancelar</button>
                            <button 
                                onClick={handleRegisterStudent}
                                disabled={registering}
                                className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50"
                            >
                                {registering ? 'Cadastrando...' : 'CADASTRAR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanelV2;
