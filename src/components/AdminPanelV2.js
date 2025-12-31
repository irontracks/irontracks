import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
    Crown, X, UserCog, AlertCircle, Trash2, Megaphone, Plus, Copy, ArrowLeft,
    MessageSquare, Send, RefreshCw, Dumbbell, Share2, UserPlus, AlertTriangle, Edit3, ShieldAlert,
    ChevronDown, FileText, Download, History, Search
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import AdminWorkoutEditor from './AdminWorkoutEditor';
import { workoutPlanHtml } from '@/utils/report/templates';
import { useDialog } from '@/contexts/DialogContext';
import { sendBroadcastMessage, clearAllStudents, clearAllTeachers, clearAllWorkouts, deleteTeacher, updateTeacher, addTeacher, exportAllData, importAllData } from '@/actions/admin-actions';
import { updateWorkout, deleteWorkout } from '@/actions/workout-actions';
import AssessmentButton from '@/components/assessment/AssessmentButton';
import HistoryList from '@/components/HistoryList';

const ADMIN_EMAIL = 'djmkapple@gmail.com';

const AdminPanelV2 = ({ user, onClose }) => {
    const { alert, confirm } = useDialog();
    const supabaseRef = useRef(null);
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;
    
    // Permission Logic
    const isAdmin = user?.role === 'admin' || user?.email?.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
    const isTeacher = user?.role === 'teacher';
    const unauthorized = !isAdmin && !isTeacher;

    const getSetsCount = (value) => {
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    };

    const router = useRouter();

    useEffect(() => {
        if (unauthorized) onClose && onClose();
    }, [unauthorized, onClose]);

    const [tab, setTab] = useState('dashboard');
    const [usersList, setUsersList] = useState([]);
    const [teachersList, setTeachersList] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [myWorkoutsCount, setMyWorkoutsCount] = useState(0);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [subTab, setSubTab] = useState('workouts');
    const [studentWorkouts, setStudentWorkouts] = useState([]);
    const [syncedWorkouts, setSyncedWorkouts] = useState([]);
    const [assessments, setAssessments] = useState([]);
    const [editingStudent, setEditingStudent] = useState(false);
    const [editedStudent, setEditedStudent] = useState({ name: '', email: '' });
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [editingStudentWorkout, setEditingStudentWorkout] = useState(null);
    const [viewWorkout, setViewWorkout] = useState(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const loadedStudentInfo = useRef(new Set());
    const [systemExporting, setSystemExporting] = useState(false);
    const [systemImporting, setSystemImporting] = useState(false);
    const systemFileInputRef = useRef(null);
    const [dangerOpen, setDangerOpen] = useState(false);
    const [moreTabsOpen, setMoreTabsOpen] = useState(false);

    const [studentQuery, setStudentQuery] = useState('');
    const [studentStatusFilter, setStudentStatusFilter] = useState('all');
    const [teacherQuery, setTeacherQuery] = useState('');
    const [teacherStatusFilter, setTeacherStatusFilter] = useState('all');
    const [templateQuery, setTemplateQuery] = useState('');

    const normalizeText = useCallback((value) => String(value || '').toLowerCase(), []);

    const statusMatches = useCallback((rowStatus, selected) => {
        if (!selected || selected === 'all') return true;
        return normalizeText(rowStatus) === normalizeText(selected);
    }, [normalizeText]);

    const studentMatchesQuery = useCallback((s) => {
        const q = normalizeText(studentQuery).trim();
        if (!q) return true;
        return normalizeText(s?.name).includes(q) || normalizeText(s?.email).includes(q);
    }, [normalizeText, studentQuery]);

    const teacherMatchesQuery = useCallback((t) => {
        const q = normalizeText(teacherQuery).trim();
        if (!q) return true;
        return normalizeText(t?.name).includes(q) || normalizeText(t?.email).includes(q);
    }, [normalizeText, teacherQuery]);

    const templateMatchesQuery = useCallback((t) => {
        const q = normalizeText(templateQuery).trim();
        if (!q) return true;
        return normalizeText(t?.name).includes(q);
    }, [normalizeText, templateQuery]);

    const studentsWithTeacherFiltered = useMemo(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        return list
            .filter((s) => !!s?.teacher_id)
            .filter(studentMatchesQuery)
            .filter((s) => statusMatches(s?.status || 'pendente', studentStatusFilter));
    }, [studentStatusFilter, studentMatchesQuery, statusMatches, usersList]);

    const studentsWithoutTeacherFiltered = useMemo(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        return list
            .filter((s) => !s?.teacher_id)
            .filter(studentMatchesQuery)
            .filter((s) => statusMatches(s?.status || 'pendente', studentStatusFilter));
    }, [studentStatusFilter, studentMatchesQuery, statusMatches, usersList]);

    const teachersFiltered = useMemo(() => {
        const list = Array.isArray(teachersList) ? teachersList : [];
        return list
            .filter(teacherMatchesQuery)
            .filter((t) => statusMatches(t?.status || 'pendente', teacherStatusFilter));
    }, [statusMatches, teacherMatchesQuery, teacherStatusFilter, teachersList]);

    const templatesFiltered = useMemo(() => {
        const list = Array.isArray(templates) ? templates : [];
        return list.filter(templateMatchesQuery);
    }, [templateMatchesQuery, templates]);

    useEffect(() => {
        if (!selectedStudent) setHistoryOpen(false);
    }, [selectedStudent]);

    const handleExportSystem = async () => {
        try {
            setSystemExporting(true);
            const res = await exportAllData();
            if (res?.error) throw new Error(res.error);
            const json = JSON.stringify(res.data || {}, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `irontracks_full_backup_${new Date().toISOString()}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch (e) {
            await alert('Erro ao exportar: ' + e.message);
        } finally {
            setSystemExporting(false);
        }
    };

    const handleImportSystemClick = () => {
        systemFileInputRef.current?.click();
    };

    const handleImportSystem = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setSystemImporting(true);
            const text = await file.text();
            const data = JSON.parse(text);
            if (!(await confirm('Importar backup completo do sistema?', 'Importar Backup'))) return;
            const res = await importAllData(data);
            if (res?.error) throw new Error(res.error);
            await alert('Backup importado com sucesso!');
        } catch (err) {
            await alert('Erro ao importar: ' + err.message);
        } finally {
            setSystemImporting(false);
            if (e?.target) e.target.value = '';
        }
    };

    const handleExportPdf = async () => {
        try {
            const html = workoutPlanHtml({
                title: viewWorkout.name,
                exercises: (viewWorkout.exercises || []).map(ex => ({
                    name: ex.name,
                    sets: getSetsCount(ex?.sets),
                    reps: ex.reps ?? '10',
                    rpe: ex.rpe ?? 8,
                    cadence: ex.cadence || '2020',
                    restTime: ex.rest_time ?? ex.restTime,
                    method: ex.method,
                    notes: ex.notes
                }))
            }, user);
            const win = window.open('', '_blank');
            if (!win) return;
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => { try { win.print(); } catch {} }, 300);
            setExportOpen(false);
        } catch (e) {
            await alert('Erro ao gerar PDF: ' + e.message);
        }
    };

    const handleExportJson = () => {
        const json = JSON.stringify({
            workout: {
                title: viewWorkout.name,
                exercises: (viewWorkout.exercises || []).map(ex => ({
                    name: ex.name,
                    sets: getSetsCount(ex?.sets),
                    reps: ex.reps,
                    rpe: ex.rpe,
                    cadence: ex.cadence,
                    restTime: ex.rest_time ?? ex.restTime,
                    method: ex.method,
                    videoUrl: ex.video_url || ex.videoUrl,
                    notes: ex.notes
                }))
            }
        }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(viewWorkout.name || 'treino').replace(/\s+/g,'_')}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        setExportOpen(false);
    };

    const openEditWorkout = (e, w) => {
        e?.stopPropagation?.();
        setEditingStudentWorkout({
            id: w.id,
            title: w.name,
            exercises: (w.exercises || []).map(ex => ({
                name: ex.name || '',
                sets: getSetsCount(ex?.sets) || 4,
                reps: ex.reps ?? '10',
                rpe: ex.rpe ?? 8,
                cadence: ex.cadence || '2020',
                restTime: ex.rest_time ?? 60,
                method: ex.method || 'Normal',
                videoUrl: ex.video_url || '',
                notes: ex.notes || ''
            }))
        });
    };

    const openEditTemplate = (t) => {
        setEditingTemplate({
            id: t.id,
            title: t.name,
            exercises: (t.exercises || []).map(ex => ({
                name: ex.name || '',
                sets: getSetsCount(ex?.sets) || 4,
                reps: ex.reps ?? '10',
                rpe: ex.rpe ?? 8,
                cadence: ex.cadence || '2020',
                restTime: ex.rest_time ?? 60,
                method: ex.method || 'Normal',
                videoUrl: ex.video_url || '',
                notes: ex.notes || ''
            }))
        });
    };
    const [loading, setLoading] = useState(false);

    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newStudent, setNewStudent] = useState({ name: '', email: '' });
    const [registering, setRegistering] = useState(false);

    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);

    const [showTeacherModal, setShowTeacherModal] = useState(false);
    const [newTeacher, setNewTeacher] = useState({ name: '', email: '', phone: '', birth_date: '' });
    const [addingTeacher, setAddingTeacher] = useState(false);
    const [editingTeacher, setEditingTeacher] = useState(null); // For edit modal/state

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
    }, [supabase]);

    useEffect(() => {
        const fetchStudents = async () => {
            setLoading(true);
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) { setLoading(false); return; }
            try {
                let list = [];
                if (isAdmin) {
                    const res = await fetch('/api/admin/students/list');
                    const json = await res.json();
                    if (json.ok) list = json.students || [];
                    const legacyRes = await fetch('/api/admin/legacy-students');
                    const legacyJson = await legacyRes.json();
                    if (legacyJson.ok && legacyJson.students) {
                        const existingIds = new Set(list.map(s => s.user_id || s.id));
                        const newLegacy = legacyJson.students.filter(s => !existingIds.has(s.id));
                        list = [...list, ...newLegacy];

                        // Dedup by email, prefer entries that already have teacher_id
                        const byEmail = new Map();
                        for (const s of (list || [])) {
                            const key = (s.email || '').toLowerCase();
                            const prev = byEmail.get(key);
                            if (!prev || (!!s.teacher_id && !prev.teacher_id)) {
                                byEmail.set(key, s);
                            }
                        }
                        list = Array.from(byEmail.values());
                    }
                    if (list.length === 0) {
                        const { data: profiles } = await supabase
                            .from('profiles')
                            .select('id, display_name, email, role')
                            .neq('role', 'teacher')
                            .order('display_name');
                        // Fetch teachers via admin API to exclude
                        let teacherEmails = new Set();
                        try {
                            const tRes = await fetch('/api/admin/teachers/list');
                            const tJson = await tRes.json();
                            if (tJson.ok) teacherEmails = new Set((tJson.teachers || []).map(t => (t.email || '').toLowerCase()));
                        } catch {}
                        list = (profiles || [])
                            .filter(p => !p.email || !teacherEmails.has(p.email.toLowerCase()))
                            .map(p => ({ id: p.id, name: p.display_name, email: p.email, teacher_id: null, user_id: p.id }));
                        // FINAL FALLBACK: students table (teacher/created_by), same do branch não-admin
                        if ((list || []).length === 0) {
                            let query = supabase
                                .from('students')
                                .select('*, workouts(*)')
                                .order('name');
                            query = query.or(`teacher_id.eq.${currentUser.id},created_by.eq.${currentUser.id}`);
                            const { data: studentsData } = await query;
                            list = (studentsData || []).filter(s => (s.email || '').toLowerCase() !== (currentUser.email || '').toLowerCase());
                        }
                    }
                    // Extra client-side filter: exclude teachers
                    const { data: tList } = await supabase.from('teachers').select('id, name, email, user_id');
                    const tEmails = new Set((tList || []).map(t => (t.email || '').toLowerCase()));
                    const filtered = (list || []).filter(s => {
                        const email = (s.email || '').toLowerCase();
                        const uid = s.user_id || s.id;
                        if (email && tEmails.has(email)) return false;
                        return true;
                    });
                    // Overlay cached teacher assignment by email to ensure UI reflects recent changes
                    try {
                        list = (filtered || []).map(s => {
                            const key = 'student_teacher_' + (s.email || '');
                            let tid = null;
                            try { tid = localStorage.getItem(key) || null; } catch {}
                            return tid && !s.teacher_id ? { ...s, teacher_id: tid } : s;
                        });
                    } catch { list = filtered; }
                    // Ensure dropdown has teachers (enriched with profiles.id mapping)
                    if (teachersList.length === 0) {
                        const resT = await fetch('/api/admin/teachers/list');
                        const jsonT = await resT.json();
                        if (jsonT.ok) {
                            const base = jsonT.teachers || [];
                            try {
                                const emails = base.map(t => t.email).filter(Boolean);
                                if (emails.length > 0) {
                                    const { data: profilesMap } = await supabase
                                        .from('profiles')
                                        .select('id, email')
                                        .in('email', emails);
                                    const idByEmail = new Map((profilesMap || []).map(p => [p.email, p.id]));
                                    const enriched = base.map(t => ({ ...t, user_id: idByEmail.get(t.email) || null }));
                                    // Ensure currently assigned teacher appears in dropdown
                                    if (selectedStudent?.teacher_id && !enriched.some(t => t.user_id === selectedStudent.teacher_id)) {
                                        const { data: curProfile } = await supabase
                                            .from('profiles')
                                            .select('id, display_name, email')
                                            .eq('id', selectedStudent.teacher_id)
                                            .maybeSingle();
                                        if (curProfile) enriched.unshift({ id: curProfile.id, name: curProfile.display_name, email: curProfile.email, user_id: curProfile.id, status: 'active' })
                                    }
                                    setTeachersList(enriched);
                                } else {
                                    setTeachersList(base);
                                }
                            } catch { setTeachersList(base); }
                        }
                    }
                } else {
                    let query = supabase
                        .from('students')
                        .select('*, workouts(*)')
                        .order('name');
                    query = query.or(`teacher_id.eq.${currentUser.id},created_by.eq.${currentUser.id}`);
                    const { data: studentsData } = await query;
                    list = (studentsData || []).filter(s => (s.email || '').toLowerCase() !== (currentUser.email || '').toLowerCase());
                    // Overlay cached teacher assignment by email to ensure UI reflects recent changes
                    try {
                        list = (list || []).map(s => {
                            const key = 'student_teacher_' + (s.email || '');
                            let tid = null;
                            try { tid = localStorage.getItem(key) || null; } catch {}
                            return tid && !s.teacher_id ? { ...s, teacher_id: tid } : s;
                        });
                    } catch {}
                }
                setUsersList(list || []);
            } finally { setLoading(false); }
        };
        fetchStudents();
    }, [registering, isAdmin, supabase, selectedStudent?.teacher_id, teachersList.length]);

    useEffect(() => {
        if (tab === 'teachers' && isAdmin) {
            const fetchTeachers = async () => {
                const res = await fetch('/api/admin/teachers/list');
                const json = await res.json();
                if (json.ok) {
                    const list = json.teachers || [];
                    const dedup = [];
                    const seen = new Set();
                    for (const t of list) {
                        const key = (t.email || '').toLowerCase();
                        if (!seen.has(key)) { seen.add(key); dedup.push(t); }
                    }
                    try {
                        const emails = dedup.map(t => t.email).filter(Boolean);
                        if (emails.length > 0) {
                            const { data: profilesMap } = await supabase
                                .from('profiles')
                                .select('id, email')
                                .in('email', emails);
                            const idByEmail = new Map((profilesMap || []).map(p => [p.email, p.id]));
                            const enriched = dedup.map(t => ({ ...t, user_id: idByEmail.get(t.email) || null }));
                            setTeachersList(enriched);
                        } else {
                            setTeachersList(dedup);
                        }
                    } catch {
                        setTeachersList(dedup);
                    }
                }
            };
            fetchTeachers();
        }
    }, [tab, isAdmin, addingTeacher, editingTeacher, supabase]);

    // URL Persistence for Tabs (Fixed)
    useEffect(() => {
       if (typeof window === 'undefined') return;
       const sp = new URLSearchParams(window.location.search);
       const t = sp.get('tab');
       // Only restore if valid tab, otherwise default to dashboard
       if (t && ['dashboard','students','teachers','templates','broadcast','system'].includes(t)) {
           setTab(t);
       }
    }, []);

    useEffect(() => {
       if (typeof window === 'undefined') return;
       const sp = new URLSearchParams(window.location.search);
       if (sp.get('tab') !== tab) {
           sp.set('tab', tab);
           // Use replaceState to avoid cluttering history, unless user wants back button support
           // Here we use replaceState to just keep URL in sync
           const url = `${window.location.pathname}?${sp.toString()}`;
           window.history.replaceState(null, '', url);
       }
    }, [tab]);

    useEffect(() => {
        if (tab !== 'templates') return;
        const fetchTemplates = async () => {
            try {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) return;
                let list = [];
                if (isAdmin || isTeacher) {
                    try {
                        const res = await fetch('/api/admin/workouts/mine');
                        const json = await res.json();
                        if (json.ok) {
                            list = (json.rows || []).filter(
                                w => w?.is_template === true && (w?.created_by === currentUser.id || w?.user_id === currentUser.id)
                            );
                        }
                    } catch (e) { console.error("API fetch error", e); }

                    if ((list || []).length === 0) {
                        try {
                            const { data } = await supabase
                                .from('workouts')
                                .select('*, exercises(*, sets(*))')
                                .eq('is_template', true)
                                .or(`created_by.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
                                .order('name');
                            list = (data || []).filter(
                                w => w?.is_template === true && (w?.created_by === currentUser.id || w?.user_id === currentUser.id)
                            );
                        } catch (e) { console.error("Supabase fetch error", e); }
                    }
                } else {
                    try {
                        const { data } = await supabase
                            .from('workouts')
                            .select('*, exercises(*, sets(*))')
                            .eq('is_template', true)
                            .eq('user_id', currentUser.id)
                            .order('name');
                        list = data || [];
                    } catch (e) { console.error("Supabase fetch error", e); }
                }
                try {
                    const resLegacy = await fetch('/api/workouts/list');
                    const jsonLegacy = await resLegacy.json();
                    if (jsonLegacy.ok) {
                        const legacy = (jsonLegacy.rows || []).map(w => ({ id: w.id || w.uuid, name: w.name, exercises: [] }));
                        list = [...list, ...legacy];
                    }
                } catch {}
                // Deduplicar por título, priorizando treinos completos (maior número de exercícios)
                const normalize = (s) => (s || '')
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g,' ')
                    .trim();
                const score = (w) => {
                    const exs = Array.isArray(w.exercises) ? w.exercises : [];
                    const exCount = exs.length;
                    return exCount;
                };
                const byTitle = new Map();
                for (const w of (list || [])) {
                    if (!w || !w.name) continue; // Defensive check
                    try {
                        const key = normalize(w.name);
                        const prev = byTitle.get(key);
                        if (!prev || score(w) > score(prev) || (score(w) === score(prev) && !!w.is_template && !prev.is_template)) {
                            byTitle.set(key, w);
                        }
                    } catch (e) { console.error("Error processing workout", w, e); }
                }
                const deduped = Array.from(byTitle.values()).sort((a,b) => (a.name||'').localeCompare(b.name||''));
                setTemplates(deduped || []);
            } catch (err) {
                console.error("Critical error fetching templates", err);
            }
        };
        fetchTemplates();
    }, [tab, isAdmin, isTeacher, supabase]);

    useEffect(() => {
        const fetchMyWorkoutsCount = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) { setMyWorkoutsCount(0); return; }
            try {
                if (isAdmin) {
                    const res = await fetch('/api/admin/workouts/mine');
                    const json = await res.json();
                    if (json.ok) {
                        const normalize = (s) => (s || '')
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/\s+/g,' ')
                            .trim();
                        const byTitle = new Map();
                        for (const w of (json.rows || [])) {
                            const key = normalize(w.name);
                            if (!byTitle.has(key)) byTitle.set(key, w);
                        }
                        const count = byTitle.size;
                        if (count > 0) setMyWorkoutsCount(count);
                        else {
                            const { data } = await supabase
                                .from('workouts')
                                .select('id, name, is_template, created_by, user_id')
                                .or(`created_by.eq.${currentUser.id},user_id.eq.${currentUser.id},is_template.eq.true`)
                                .order('name');
                            const list = (data || []).filter(w => (w.is_template === true || w.created_by === currentUser.id || w.user_id === currentUser.id));
                            setMyWorkoutsCount(list.length);
                        }
                    } else {
                        const { data } = await supabase
                            .from('workouts')
                            .select('id, name, is_template, created_by, user_id')
                            .or(`created_by.eq.${currentUser.id},user_id.eq.${currentUser.id},is_template.eq.true`)
                            .order('name');
                        const list = (data || []).filter(w => (w.is_template === true || w.created_by === currentUser.id || w.user_id === currentUser.id));
                        setMyWorkoutsCount(list.length);
                    }
                } else {
                    const { data } = await supabase
                        .from('workouts')
                        .select('id, name, is_template, created_by, user_id')
                        .or(`created_by.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
                        .order('name');
                    const list = (data || []).filter(w => (w.is_template === true || w.created_by === currentUser.id || w.user_id === currentUser.id));
                    setMyWorkoutsCount(list.length);
                }
            } catch {
                setMyWorkoutsCount(0);
            }
        };
        if (tab === 'dashboard') fetchMyWorkoutsCount();
    }, [tab, isAdmin, supabase]);

    useEffect(() => {
        if (!selectedStudent) return;
        const fetchDetails = async () => {
            setLoading(true);
            let targetId = selectedStudent.user_id || selectedStudent.id;
            if (!targetId && selectedStudent.email) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', selectedStudent.email)
                    .maybeSingle();
                targetId = profile?.id || targetId;
            }
            try {
                const key = selectedStudent?.id || selectedStudent?.email || targetId;
                if (key && !loadedStudentInfo.current.has(key)) {
                    const resp = await fetch('/api/admin/students/list');
                    const js = await resp.json();
                    if (js.ok) {
                        const row = (js.students || []).find(s => (s.id === selectedStudent.id) || (s.user_id && s.user_id === (selectedStudent.user_id || targetId)) || ((s.email || '').toLowerCase() === (selectedStudent.email || '').toLowerCase()));
                        if (row) {
                            const nextTeacher = row.teacher_id || null;
                            const nextUserId = row.user_id || selectedStudent.user_id || null;
                            const shouldUpdate = (nextTeacher !== selectedStudent.teacher_id) || (nextUserId !== selectedStudent.user_id);
                            if (shouldUpdate) {
                                setSelectedStudent(prev => ({ ...prev, teacher_id: nextTeacher, user_id: nextUserId || prev.user_id }));
                            }
                        }
                        loadedStudentInfo.current.add(key);
                    }
                }
            } catch {}
            try {
                if (!selectedStudent.teacher_id && selectedStudent.email) {
                    const cached = localStorage.getItem('student_teacher_'+selectedStudent.email);
                    if (cached != null && cached !== String(selectedStudent.teacher_id || '')) {
                        setSelectedStudent(prev => ({ ...prev, teacher_id: cached || null }));
                    }
                }
            } catch {}
            let wData = [];
            if (isAdmin || isTeacher) {
                try {
                    const res = await fetch(`/api/admin/workouts/by-student?${targetId ? `id=${encodeURIComponent(targetId)}` : `email=${encodeURIComponent(selectedStudent.email || '')}`}`);
                    const json = await res.json();
                    if (json.ok) wData = json.rows || [];
                    if ((!wData || wData.length === 0) && selectedStudent.email) {
                        const res2 = await fetch(`/api/admin/workouts/by-student?email=${encodeURIComponent(selectedStudent.email)}`);
                        const json2 = await res2.json();
                        if (json2.ok) wData = json2.rows || [];
                    }
                } catch {}
            } else {
                const { data } = await supabase
                    .from('workouts')
                    .select('*, exercises(*, sets(*))')
                    .eq('user_id', targetId)
                    .eq('is_template', true)
                    .order('name');
                wData = data || [];
            }
            
            const studentDeduped = (wData || []).sort((a,b) => (a.name||'').localeCompare(b.name||''));
            const synced = (studentDeduped || []).filter(w => (w?.created_by && w.created_by === user.id));
            const syncedIds = new Set((synced || []).map(w => w?.id).filter(Boolean));
            const others = (studentDeduped || []).filter(w => !syncedIds.has(w?.id));
            setStudentWorkouts(others || []);
            setSyncedWorkouts(synced || []);

            // Load "Meus Treinos" for assignment list
            const { data: { user: me } } = await supabase.auth.getUser();
            if (me) {
                let my = [];
                try {
                    const resMine = await fetch('/api/admin/workouts/mine');
                    const jsonMine = await resMine.json();
                    if (jsonMine.ok) my = jsonMine.rows || [];
                    else {
                        const { data } = await supabase
                            .from('workouts')
                            .select('*, exercises(*, sets(*))')
                            .or(`created_by.eq.${me.id},user_id.eq.${me.id}`)
                            .order('name');
                        my = data || [];
                    }
                } catch {
                    const { data } = await supabase
                        .from('workouts')
                        .select('*, exercises(*, sets(*))')
                        .or(`created_by.eq.${me.id},user_id.eq.${me.id},is_template.eq.true`)
                        .order('name');
                    my = data || [];
                }

                my = (my || []).filter(w => (w?.user_id === me.id) && (w?.is_template === true) && !w?.student_id);
                
                // Helper reintroduzido para deduplicação de TEMPLATES (Meus Treinos)
                const normalizeTitle = (s) => (s || '')
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g,' ')
                    .trim();

                const tMap = new Map();
                for (const w of (my || [])) {
                    const key = normalizeTitle(w.name);
                    const prev = tMap.get(key);
                    const exs = Array.isArray(w.exercises) ? w.exercises : [];
                    const prevExs = Array.isArray(prev?.exercises) ? prev.exercises : [];
                    const score = (x) => (Array.isArray(x) ? x.length : 0);
                    if (!prev || score(exs) > score(prevExs) || (score(exs) === score(prevExs) && !!w.is_template && !prev?.is_template)) {
                        tMap.set(key, w);
                    }
                }
                try {
                    const resLegacy = await fetch('/api/workouts/list');
                    const jsonLegacy = await resLegacy.json();
                    if (jsonLegacy.ok) {
                        for (const r of (jsonLegacy.rows || [])) {
                            const key = normalizeTitle(r.name);
                            const prev = tMap.get(key);
                            const candidate = { id: r.id || r.uuid, name: r.name, exercises: [] };
                            const prevExs = Array.isArray(prev?.exercises) ? prev.exercises : [];
                            if (!prev || prevExs.length < 1) tMap.set(key, candidate);
                        }
                    }
                } catch {}
                const dedupTemplates = Array.from(tMap.values()).sort((a,b) => (a.name||'').localeCompare(b.name||''));
                setTemplates(dedupTemplates || []);
            }
            const { data: aData } = await supabase
                .from('assessments')
                .select('*')
                .or(`student_id.eq.${targetId},user_id.eq.${targetId}`)
                .order('date', { ascending: false });
            setAssessments(aData || []);
            setLoading(false);
        };
        fetchDetails();
    }, [selectedStudent, supabase, user?.id, isAdmin, isTeacher]);

    // Ensure teachers list available when viewing a student (for assignment)
    useEffect(() => {
        if (!selectedStudent || !isAdmin) return;
        const loadTeachers = async () => {
            try {
                const res = await fetch('/api/admin/teachers/list');
                const json = await res.json();
                if (json.ok) {
                    const base = json.teachers || [];
                    let enriched = base;
                    try {
                        const emails = base.map(t => t.email).filter(Boolean);
                        if (emails.length > 0) {
                            const { data: profilesMap } = await supabase
                                .from('profiles')
                                .select('id, email')
                                .in('email', emails);
                            const idByEmail = new Map((profilesMap || []).map(p => [p.email, p.id]));
                            enriched = base.map(t => ({ ...t, user_id: idByEmail.get(t.email) || null }));
                        }
                    } catch {}
                    const currentUid = selectedStudent?.teacher_id || '';
                    if (currentUid && !enriched.some(t => t.user_id === currentUid)) {
                        try {
                            const { data: curProfile } = await supabase
                                .from('profiles')
                                .select('id, display_name, email')
                                .eq('id', currentUid)
                                .maybeSingle();
                            if (curProfile) {
                                enriched = [{ id: curProfile.id, name: curProfile.display_name, email: curProfile.email, user_id: curProfile.id, status: 'active' }, ...enriched];
                            } else {
                                enriched = [{ id: currentUid, name: 'Professor atribuído', email: '', user_id: currentUid, status: 'active' }, ...enriched];
                            }
                        } catch {
                            enriched = [{ id: currentUid, name: 'Professor atribuído', email: '', user_id: currentUid, status: 'active' }, ...enriched];
                        }
                    }
                    setTeachersList(enriched);
                }
            } catch {}
        };
        loadTeachers();
    }, [selectedStudent, isAdmin, supabase]);

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
        if (!targetId && !selectedStudent.email) { await alert('Não foi possível identificar o aluno alvo.'); return; }
        if (!(await confirm(`Adicionar treino "${template?.name || 'Treino'}" para ${selectedStudent.name || selectedStudent.email}?`))) return;
        try {
            const payload = {
                user_id: selectedStudent?.user_id ? targetId : null,
                student_id: selectedStudent?.user_id ? null : targetId,
                created_by: user?.id,
                is_template: true,
                name: template?.name || '',
                notes: template?.notes || ''
            };
            const { data: newWorkout, error: wErr } = await supabase
                .from('workouts')
                .insert(payload)
                .select()
                .single();
            if (wErr) throw wErr;
            const toInsert = (template?.exercises || []).map(e => ({
                workout_id: newWorkout.id,
                name: e?.name || '',
                sets: getSetsCount(e?.sets) || 4,
                reps: e?.reps ?? '10',
                rpe: e?.rpe ?? 8,
                cadence: e?.cadence || '2020',
                rest_time: e?.rest_time ?? 60,
                method: e?.method || 'Normal',
                video_url: e?.video_url || '',
                notes: e?.notes || ''
            }));
            let newExs = [];
            if (toInsert.length) {
                const { data: exRows, error: exErr } = await supabase.from('exercises').insert(toInsert).select();
                if (exErr) throw exErr;
                newExs = exRows || [];
            }
            for (let i = 0; i < (template?.exercises || []).length; i++) {
                const srcEx = template?.exercises?.[i] || {};
                const dstEx = newExs[i] || null;
                const setsArr = Array.isArray(srcEx?.sets) ? srcEx.sets : [];
                if (dstEx && setsArr.length) {
                    const newSets = setsArr.map(s => ({
                        exercise_id: dstEx.id,
                        weight: s?.weight ?? null,
                        reps: s?.reps ?? null,
                        rpe: s?.rpe ?? null,
                        set_number: s?.set_number ?? 1,
                        completed: s?.completed ?? false
                    }));
                    if (newSets.length) {
                        const { error: setErr } = await supabase.from('sets').insert(newSets);
                        if (setErr) throw setErr;
                    }
                }
            }
            let refreshed = [];
            if (isAdmin || isTeacher) {
                try {
                    const res = await fetch(`/api/admin/workouts/by-student?${targetId ? `id=${encodeURIComponent(targetId)}` : `email=${encodeURIComponent(selectedStudent.email || '')}`}`);
                    const json = await res.json();
                    if (json.ok) refreshed = json.rows || [];
                    if ((!refreshed || refreshed.length === 0) && selectedStudent.email) {
                        const res2 = await fetch(`/api/admin/workouts/by-student?email=${encodeURIComponent(selectedStudent.email)}`);
                        const json2 = await res2.json();
                        if (json2.ok) refreshed = json2.rows || [];
                    }
                } catch {}
            } else {
                const { data } = await supabase
                    .from('workouts')
                    .select('*, exercises(*, sets(*))')
                    .eq('user_id', targetId)
                    .eq('is_template', true)
                    .order('name');
                refreshed = data || [];
            }
            setStudentWorkouts(refreshed || []);
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
            const res = await addTeacher(newTeacher.name, newTeacher.email, newTeacher.phone, newTeacher.birth_date);
            if (res.error) throw new Error(res.error);
            
            await alert('Professor adicionado com sucesso!');
            setShowTeacherModal(false);
            setNewTeacher({ name: '', email: '', phone: '', birth_date: '' });
            // Trigger refresh (simple way)
            setTab('dashboard'); setTimeout(() => setTab('teachers'), 100);
        } catch (e) {
            await alert('Erro ao adicionar professor: ' + e.message);
        } finally {
            setAddingTeacher(false);
        }
    };

    const handleUpdateTeacher = async () => {
        if (!editingTeacher || !editingTeacher.name || !editingTeacher.email) return await alert('Preencha nome e email.');
        try {
            const res = await updateTeacher(editingTeacher.id, {
                name: editingTeacher.name,
                email: editingTeacher.email,
                phone: editingTeacher.phone,
                birth_date: editingTeacher.birth_date
            });
            if (res.error) throw new Error(res.error);
            await alert('Professor atualizado com sucesso!');
            setEditingTeacher(null);
            // Trigger refresh
            setTab('dashboard'); setTimeout(() => setTab('teachers'), 100);
        } catch (e) {
            await alert('Erro ao atualizar professor: ' + e.message);
        }
    };

    const handleDangerAction = async (actionName, actionFn) => {
        if (!(await confirm(`Tem certeza que deseja ${actionName}?`, 'ATENÇÃO - PERIGO'))) return;
        if (!(await confirm(`Esta ação é IRREVERSÍVEL. Todos os dados serão perdidos. Confirmar mesmo?`, 'CONFIRMAÇÃO FINAL'))) return;
        
        try {
            const res = await actionFn();
            if (res.error) throw new Error(res.error);
            await alert(`${actionName} realizado com sucesso.`, 'Sucesso');
            // Refresh data
            setUsersList([]);
            setTeachersList([]);
            setTemplates([]);
        } catch (e) {
            await alert(`Erro ao executar ${actionName}: ` + e.message);
        }
    };

    if (!isAdmin && !isTeacher) return null;

    let TAB_LABELS = { dashboard: 'VISÃO', students: 'ALUNOS', templates: 'TREINOS' };
    if (isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, teachers: 'PROFS', system: 'SISTEMA' };
    }

    const MAIN_TABS = ['dashboard', 'students', 'templates'];
    const extraTabs = Object.keys(TAB_LABELS).filter((k) => !MAIN_TABS.includes(k));
    const isExtraTabActive = extraTabs.includes(tab);

    const totalStudents = Array.isArray(usersList) ? usersList.length : 0;
    const studentsWithTeacher = Array.isArray(usersList) ? usersList.filter(s => !!s.teacher_id).length : 0;
    const studentsWithoutTeacher = Array.isArray(usersList) ? usersList.filter(s => !s.teacher_id).length : 0;
    const totalTeachers = Array.isArray(teachersList) ? teachersList.length : 0;

    return (
        <div className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col overflow-hidden">
            <div className="sticky top-0 z-50 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800 shadow-[0_16px_40px_rgba(0,0,0,0.55)] pt-safe flex-shrink-0">
                {debugError && (
                    <div className="bg-red-600 text-white font-bold p-4 text-center text-xs break-all mb-2 rounded-xl">
                        DIAGNOSTIC MODE: {debugError}
                    </div>
                )}
                <div className="px-4 md:px-8 py-3">
                    <div className="w-full max-w-6xl mx-auto flex justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => { setSelectedStudent(null); setTab('dashboard'); }}
                                className="flex items-center gap-3 cursor-pointer group active:scale-[0.99] transition-transform"
                            >
                                <div className="w-10 h-10 rounded-2xl bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20 border border-yellow-400/40">
                                    <Crown size={20} className="text-black" />
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-yellow-500/80">IronTracks</span>
                                    <span className="text-sm md:text-base font-black text-white leading-tight">Painel de Controle</span>
                                </div>
                            </button>
                            <div className="hidden md:block text-[11px] uppercase tracking-widest text-neutral-500 font-bold">Operações do seu negócio</div>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="flex-1 min-w-0">
                                <div className="hidden md:flex items-center gap-2 justify-end flex-wrap">
                                    {Object.entries(TAB_LABELS).map(([key, label]) => (
                                        <button
                                            key={key}
                                            onClick={() => { setTab(key); setSelectedStudent(null); setMoreTabsOpen(false); }}
                                            className={`min-h-[40px] px-3.5 md:px-4 py-2 rounded-full font-black text-[11px] uppercase tracking-wide whitespace-nowrap transition-all duration-300 border active:scale-95 ${
                                                tab === key
                                                    ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/20'
                                                    : 'bg-neutral-900/70 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                <div className="md:hidden flex items-center gap-2">
                                    <div className="flex-1 bg-neutral-900/70 border border-neutral-800 rounded-full p-1 flex items-center gap-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                                        {MAIN_TABS.map((key) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => { setTab(key); setSelectedStudent(null); setMoreTabsOpen(false); }}
                                                className={`flex-1 min-h-[40px] px-2 rounded-full font-black text-[11px] uppercase tracking-wide transition-all duration-300 active:scale-95 ${
                                                    tab === key
                                                        ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                                        : 'text-neutral-200'
                                                }`}
                                            >
                                                {TAB_LABELS[key] || key}
                                            </button>
                                        ))}
                                    </div>
                                    {extraTabs.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setMoreTabsOpen(true)}
                                            className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300 active:scale-95 ${
                                                isExtraTabActive
                                                    ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/20'
                                                    : 'bg-neutral-900/70 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                            }`}
                                            aria-label="Mais"
                                        >
                                            <ChevronDown size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => onClose && onClose()}
                                className="flex-shrink-0 w-10 h-10 rounded-full bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center transition-all border border-neutral-800 active:scale-95"
                            >
                                <X size={18} className="font-bold" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-20 pb-safe">
                {tab === 'dashboard' && !selectedStudent && (
                    <div className="w-full max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div
                            className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                            onClick={() => { setTab('students'); setSelectedStudent(null); }}
                        >
                            <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest">Total Alunos</h3>
                            <p className="text-3xl font-black text-white mt-1">{totalStudents}</p>
                        </div>
                        <div className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 transition-colors">
                            <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest">Com Professor</h3>
                            <p className="text-3xl font-black text-green-400 mt-1">{studentsWithTeacher}</p>
                        </div>
                        <div
                            className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                            onClick={() => { setTab('students'); setSelectedStudent(null); }}
                        >
                            <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest">Sem Professor</h3>
                            <p className="text-3xl font-black text-yellow-500 mt-1">{studentsWithoutTeacher}</p>
                        </div>
                        <div
                            className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                            onClick={() => { setTab('templates'); setSelectedStudent(null); }}
                        >
                            <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest">Treinos Criados</h3>
                            <p className="text-3xl font-black text-white mt-1">{myWorkoutsCount ?? '-'}</p>
                        </div>
                        {isAdmin && (
                            <div
                                className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                onClick={() => { setTab('teachers'); setSelectedStudent(null); }}
                            >
                                <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest">Professores Ativos</h3>
                                <p className="text-3xl font-black text-white mt-1">{totalTeachers}</p>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'students' && !selectedStudent && (
                    <div className="w-full max-w-6xl mx-auto space-y-4">
                        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <UserCog size={18} className="text-yellow-500" />
                                        <h2 className="text-base md:text-lg font-black tracking-tight">Alunos</h2>
                                    </div>
                                    <div className="mt-1 text-xs text-neutral-400 font-semibold">
                                        {totalStudents} no total • {studentsWithTeacher} com professor • {studentsWithoutTeacher} sem professor
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                        onClick={() => setShowRegisterModal(true)}
                                        className="min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-yellow-500/15 active:scale-95"
                                    >
                                        <UserPlus size={18} /> CADASTRAR
                                    </button>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-2">
                                <div className="relative lg:col-span-2">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                    <input
                                        value={studentQuery}
                                        onChange={(e) => setStudentQuery(e.target.value)}
                                        placeholder="Buscar aluno por nome ou email"
                                        className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                    />
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                    {[
                                        { key: 'all', label: 'Todos' },
                                        { key: 'pago', label: 'Pago' },
                                        { key: 'pendente', label: 'Pendente' },
                                        { key: 'atrasado', label: 'Atrasado' },
                                        { key: 'cancelar', label: 'Cancelar' }
                                    ].map((opt) => (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => setStudentStatusFilter(opt.key)}
                                            className={`whitespace-nowrap min-h-[40px] px-3 py-2 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all duration-300 active:scale-95 ${
                                                studentStatusFilter === opt.key
                                                    ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/15'
                                                    : 'bg-neutral-900/60 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500">Com Professor</h3>
                                    <span className="text-[11px] font-bold text-neutral-400">{studentsWithTeacherFiltered.length}</span>
                                </div>
                                {studentsWithTeacherFiltered.length === 0 ? (
                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4">
                                        <p className="text-neutral-500 text-sm">Nenhum aluno encontrado.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {studentsWithTeacherFiltered.map(s => (
                                            <div key={s.id} onClick={() => setSelectedStudent(s)} className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700 hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300 cursor-pointer w-full max-w-[100vw] overflow-hidden">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center font-black text-lg text-neutral-200 flex-shrink-0">{(s.name || s.email || '?')[0]}</div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="font-black text-white truncate">{s.name || s.email}</h3>
                                                        <p className="text-xs text-neutral-400 truncate">{s.email}</p>
                                                    </div>
                                                </div>

                                                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                                                    <span className="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 w-fit">
                                                        {isTeacher && s.teacher_id === user.id ? 'Seu aluno' : 'Vinculado'}
                                                    </span>
                                                    {(isAdmin || (isTeacher && s.teacher_id === user.id)) && (
                                                        <select
                                                            value={s.status || 'pendente'}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onPointerDown={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onChange={async (e) => {
                                                                const newStatus = e.target.value;
                                                                try {
                                                                    const res = await fetch('/api/admin/students/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status: newStatus }) });
                                                                    const json = await res.json();
                                                                    if (json.ok) setUsersList(prev => prev.map(x => x.id === s.id ? { ...x, status: newStatus } : x));
                                                                } catch {}
                                                            }}
                                                            className="min-h-[40px] bg-neutral-900/70 text-neutral-200 rounded-xl px-3 py-2 text-xs w-full sm:w-auto max-w-full border border-neutral-700 focus:border-yellow-500 focus:outline-none"
                                                        >
                                                            <option value="pago">pago</option>
                                                            <option value="pendente">pendente</option>
                                                            <option value="atrasado">atrasado</option>
                                                            <option value="cancelar">cancelar</option>
                                                        </select>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500">Sem Professor</h3>
                                    <span className="text-[11px] font-bold text-neutral-400">{studentsWithoutTeacherFiltered.length}</span>
                                </div>
                                {studentsWithoutTeacherFiltered.length === 0 ? (
                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4">
                                        <p className="text-neutral-500 text-sm">Nenhum aluno encontrado.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {studentsWithoutTeacherFiltered.map(s => (
                                            <div key={s.id} onClick={() => setSelectedStudent(s)} className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700 hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300 cursor-pointer w-full max-w-[100vw] overflow-hidden">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center font-black text-lg text-neutral-200 flex-shrink-0">{(s.name || s.email || '?')[0]}</div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="font-black text-white truncate">{s.name || s.email}</h3>
                                                        <p className="text-xs text-neutral-400 truncate">{s.email}</p>
                                                    </div>
                                                </div>

                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                    <span className="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide bg-neutral-900 text-neutral-300 border border-neutral-700 w-fit">Sem professor</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'templates' && !selectedStudent && (
                    <div className="w-full max-w-6xl mx-auto space-y-4">
                        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Dumbbell size={18} className="text-yellow-500" />
                                        <h2 className="text-base md:text-lg font-black tracking-tight">Treinos</h2>
                                    </div>
                                    <div className="mt-1 text-xs text-neutral-400 font-semibold">{(Array.isArray(templates) ? templates.length : 0)} no total</div>
                                </div>
                                <div className="text-[11px] font-bold text-neutral-400">{templatesFiltered.length} visíveis</div>
                            </div>
                            <div className="mt-4 relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                <input
                                    value={templateQuery}
                                    onChange={(e) => setTemplateQuery(e.target.value)}
                                    placeholder="Buscar treino por nome"
                                    className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                />
                            </div>
                        </div>

                        {templatesFiltered.length === 0 ? (
                            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center">
                                <p className="text-neutral-500">Nenhum treino encontrado.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {templatesFiltered.map(t => (
                                    <div
                                        key={t.id}
                                        className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700 flex justify-between items-center cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                        onClick={() => openEditTemplate(t)}
                                    >
                                        <div className="min-w-0">
                                            <h3 className="font-black text-white truncate">{t.name}</h3>
                                            <p className="text-xs text-neutral-500">{t.exercises?.length || 0} exercícios</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openEditTemplate(t); }}
                                                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 hover:border-yellow-500/40 hover:bg-yellow-500/10 text-neutral-300 hover:text-yellow-400 flex items-center justify-center transition-all duration-300 active:scale-95"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (!(await confirm('Excluir este treino?', 'Apagar Treino'))) return;
                                                    try {
                                                        await deleteWorkout(t.id);
                                                        setTemplates(prev => prev.filter(x => x.id !== t.id));
                                                    } catch (err) {
                                                        await alert('Erro ao excluir: ' + err.message);
                                                    }
                                                }}
                                                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 hover:border-red-500/40 hover:bg-red-900/20 text-neutral-300 hover:text-red-400 flex items-center justify-center transition-all duration-300 active:scale-95"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {tab === 'system' && !selectedStudent && (
                    <div className="space-y-8">
                        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-4">
                            <h3 className="font-bold text-white flex items-center gap-2"><Download size={20} className="text-yellow-500"/> BACKUP DO SISTEMA</h3>
                            <div className="flex gap-2">
                                <button onClick={handleExportSystem} disabled={systemExporting} className="flex-1 min-h-[44px] py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl disabled:opacity-50">Exportar JSON</button>
                                <button onClick={handleImportSystemClick} disabled={systemImporting} className="flex-1 min-h-[44px] py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl hover:bg-neutral-700 disabled:opacity-50">Importar JSON</button>
                                <input ref={systemFileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportSystem} />
                            </div>
                        </div>
                        {/* Broadcast Section */}
                        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-4">
                            <h3 className="font-bold text-white flex items-center gap-2"><Megaphone size={20} className="text-yellow-500"/> ENVIAR COMUNICADO</h3>
                            <div>
                                <label className="text-xs font-bold text-neutral-500 uppercase">Título do Aviso</label>
                                <input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} className="w-full bg-neutral-900 p-3 rounded-lg text-white font-bold mt-1 border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-neutral-500 uppercase">Mensagem</label>
                                <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} className="w-full bg-neutral-900 p-3 rounded-lg text-white mt-1 border border-neutral-700 focus:border-yellow-500 outline-none h-32" />
                            </div>
                            <button onClick={handleSendBroadcast} disabled={sendingBroadcast} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                                {sendingBroadcast ? 'Enviando...' : 'ENVIAR AVISO'}
                            </button>
                        </div>

                        <div className="bg-neutral-900/40 p-4 rounded-2xl border border-red-500/25">
                            <button
                                type="button"
                                onClick={() => setDangerOpen(v => !v)}
                                className="w-full flex items-center justify-between gap-3 active:scale-[0.99] transition-transform"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center flex-shrink-0">
                                        <ShieldAlert size={18} className="text-red-400" />
                                    </div>
                                    <div className="min-w-0 text-left">
                                        <div className="font-black text-red-400 tracking-tight">Danger Zone</div>
                                        <div className="text-xs text-neutral-400 font-semibold">Ações irreversíveis com confirmação dupla</div>
                                    </div>
                                </div>
                                <div className={`w-9 h-9 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center transition-all duration-300 ${dangerOpen ? 'rotate-180' : ''}`}>
                                    <ChevronDown size={16} className="text-neutral-400" />
                                </div>
                            </button>

                            {dangerOpen && (
                                <div className="mt-4 space-y-2">
                                    <button
                                        onClick={() => handleDangerAction('ZERAR TODOS OS ALUNOS', clearAllStudents)}
                                        className="w-full min-h-[44px] px-4 py-3 bg-red-900/20 border border-red-500/40 hover:bg-red-900/35 text-red-300 font-black rounded-xl flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
                                    >
                                        <Trash2 size={18} /> ZERAR TODOS OS ALUNOS
                                    </button>

                                    <button
                                        onClick={() => handleDangerAction('ZERAR TODOS OS PROFESSORES', clearAllTeachers)}
                                        className="w-full min-h-[44px] px-4 py-3 bg-red-900/20 border border-red-500/40 hover:bg-red-900/35 text-red-300 font-black rounded-xl flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
                                    >
                                        <Trash2 size={18} /> ZERAR TODOS OS PROFESSORES
                                    </button>

                                    <button
                                        onClick={() => handleDangerAction('ZERAR TODOS OS TREINOS', clearAllWorkouts)}
                                        className="w-full min-h-[44px] px-4 py-3 bg-red-900/20 border border-red-500/40 hover:bg-red-900/35 text-red-300 font-black rounded-xl flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
                                    >
                                        <Trash2 size={18} /> ZERAR TODOS OS TREINOS
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'teachers' && isAdmin && !selectedStudent && (
                    <div className="w-full max-w-6xl mx-auto space-y-4">
                        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <UserCog size={18} className="text-yellow-500" />
                                        <h2 className="text-base md:text-lg font-black tracking-tight">Professores</h2>
                                    </div>
                                    <div className="mt-1 text-xs text-neutral-400 font-semibold">{(Array.isArray(teachersList) ? teachersList.length : 0)} cadastrados</div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                        onClick={() => setShowTeacherModal(true)}
                                        className="min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-yellow-500/15 active:scale-95"
                                    >
                                        <Plus size={18} /> ADICIONAR
                                    </button>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-2">
                                <div className="relative lg:col-span-2">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                    <input
                                        value={teacherQuery}
                                        onChange={(e) => setTeacherQuery(e.target.value)}
                                        placeholder="Buscar professor por nome ou email"
                                        className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                    />
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                    {[
                                        { key: 'all', label: 'Todos' },
                                        { key: 'pago', label: 'Pago' },
                                        { key: 'pendente', label: 'Pendente' },
                                        { key: 'atrasado', label: 'Atrasado' },
                                        { key: 'cancelar', label: 'Cancelar' }
                                    ].map((opt) => (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => setTeacherStatusFilter(opt.key)}
                                            className={`whitespace-nowrap min-h-[40px] px-3 py-2 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all duration-300 active:scale-95 ${
                                                teacherStatusFilter === opt.key
                                                    ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/15'
                                                    : 'bg-neutral-900/60 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {teachersFiltered.length === 0 ? (
                            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center">
                                <p className="text-neutral-500">Nenhum professor encontrado.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {teachersFiltered.map(t => (
                                    <div
                                        key={t.id}
                                        className="bg-neutral-800 p-4 rounded-2xl flex justify-between items-center border border-neutral-700 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                        onClick={() => setEditingTeacher(t)}
                                    >
                                        <div className="min-w-0">
                                            <h3 className="font-black text-white truncate">{t.name}</h3>
                                            <p className="text-xs text-neutral-400 truncate">{t.email}</p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <span className="px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-700 text-[11px] font-black uppercase tracking-wide text-neutral-200">
                                                    {t.status || 'pendente'}
                                                </span>
                                                <span className="text-[11px] font-semibold text-neutral-500">{t.phone || 'Sem telefone'}</span>
                                                <span className="text-[11px] font-semibold text-neutral-500">Nascimento: {t.birth_date ? new Date(t.birth_date).toLocaleDateString() : '-'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => setEditingTeacher(t)}
                                                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 hover:border-yellow-500/40 hover:bg-yellow-500/10 text-neutral-300 hover:text-yellow-400 flex items-center justify-center transition-all duration-300 active:scale-95"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <select
                                                value={t.status || 'pendente'}
                                                onChange={async (e) => {
                                                    const newStatus = e.target.value;
                                                    const res = await fetch('/api/admin/teachers/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, status: newStatus }) });
                                                    const json = await res.json();
                                                    if (json.ok) setTeachersList(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x));
                                                }}
                                                className="min-h-[40px] bg-neutral-900/70 text-neutral-200 rounded-xl px-3 py-2 text-xs border border-neutral-700 focus:border-yellow-500 focus:outline-none"
                                            >
                                                <option value="pago">pago</option>
                                                <option value="pendente">pendente</option>
                                                <option value="atrasado">atrasado</option>
                                                <option value="cancelar">cancelar</option>
                                            </select>
                                            <button
                                                onClick={async () => {
                                                    if (await confirm(`Excluir professor ${t.name}?`)) {
                                                        try {
                                                            const res = await fetch('/api/admin/teachers/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) });
                                                            const json = await res.json();
                                                            if (!json.ok) throw new Error(json.error || 'Falha ao excluir');
                                                            setTeachersList(prev => prev.filter(x => x.id !== t.id));
                                                        } catch (err) {
                                                            await alert('Erro: ' + err.message);
                                                        }
                                                    }
                                                }}
                                                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 hover:border-red-500/40 hover:bg-red-900/20 text-neutral-300 hover:text-red-400 flex items-center justify-center transition-all duration-300 active:scale-95"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            {isAdmin && (t.status === 'pending' || t.status === 'pendente') && (
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch('/api/admin/teachers/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, status: 'active' }) });
                                                            const json = await res.json();
                                                            if (!json.ok) throw new Error(json.error || '');
                                                            setTeachersList(prev => prev.map(x => x.id === t.id ? { ...x, status: 'active' } : x));
                                                        } catch (err) {
                                                            await alert('Erro ao aprovar: ' + err.message);
                                                        }
                                                    }}
                                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                                >
                                                    Aprovar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {selectedStudent && (
                    <div className="animate-slide-up">
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
                                    {isAdmin && teachersList.length > 0 && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-xs text-neutral-400">Professor:</span>
                                            {(() => {
                                                const currentUid = selectedStudent.teacher_id || '';
                                                const list = Array.isArray(teachersList) ? [...teachersList] : [];
                                                if (currentUid && !list.some(t => t.user_id === currentUid)) {
                                                    list.unshift({ id: currentUid, name: 'Professor atribuído', email: '', user_id: currentUid, status: 'active' });
                                                }
                                                return (
                                            <select value={currentUid} onChange={async (e) => {
                                                const teacherUserId = e.target.value || '';
                                                const opt = Array.from(e.target.options).find(o => o.selected)
                                                const teacherEmail = opt ? opt.getAttribute('data-email') || '' : ''
                                                try {
                                                    const res = await fetch('/api/admin/students/assign-teacher', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: selectedStudent.id || selectedStudent.user_id, email: selectedStudent.email || '', teacher_user_id: teacherUserId || null, teacher_email: teacherEmail })});
                                                    const json = await res.json();
                                                    if (json.ok) {
                                                        const nextTid = json.teacher_user_id || teacherUserId || null;
                                                        setSelectedStudent(prev => ({ ...prev, teacher_id: nextTid }));
                                                        setUsersList(prev => prev.map(x => (
                                                            (x.id === selectedStudent.id)
                                                            || (x.user_id === selectedStudent.user_id)
                                                            || ((x.email || '').toLowerCase() === (selectedStudent.email || '').toLowerCase())
                                                        ) ? { ...x, teacher_id: nextTid } : x));
                                                        try { if (selectedStudent.email) localStorage.setItem('student_teacher_'+selectedStudent.email, nextTid || ''); } catch {}
                                                        try {
                                                            const resp = await fetch('/api/admin/students/list');
                                                            const js = await resp.json();
                                                            if (js.ok) setUsersList(js.students || []);
                                                        } catch {}
                                                    } else {
                                                        await alert('Erro: ' + (json.error || 'Falha ao atualizar professor'))
                                                    }
                                                } catch {}
                                            }} className="bg-neutral-800 text-neutral-200 rounded-lg px-2 py-1 text-xs border border-neutral-700">
                                                <option value="">Sem Professor</option>
                                                {list.map(t => (
                                                    <option key={t.id || t.user_id || t.email || Math.random().toString(36).slice(2)} value={t.user_id || ''} data-email={t.email || ''}>
                                                        {t.name || t.email || (t.user_id ? t.user_id.slice(0,8) : 'Professor')}
                                                    </option>
                                                ))}
                                            </select>
                                                )
                                            })()}
                                        </div>
                                    )}
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
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-white">Treinos do Aluno</h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setHistoryOpen(true)} className="px-3 py-2 bg-neutral-800 border border-yellow-500/30 text-yellow-500 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-yellow-500/10">
                                            <History size={16} /> Histórico
                                        </button>
                                        <button onClick={() => setShowImportModal(true)} className="px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg text-xs font-bold">Importar Template</button>
                                        <button onClick={() => setEditingStudentWorkout({ id: null, title: '', exercises: [] })} className="px-3 py-2 bg-yellow-500 text-black rounded-lg text-xs font-bold">Criar Treino</button>
                                    </div>
                                </div>
                                {templates.length > 0 && (
                                    <button onClick={async () => {
                                            const targetId = selectedStudent.user_id || selectedStudent.id;
                                            try {
                                                const normalize = (s) => (s || '')
                                                    .toLowerCase()
                                                    .normalize('NFD')
                                                    .replace(/[\u0300-\u036f]/g, '')
                                                    .replace(/\s+/g, ' ')
                                                    .trim();
                                            const extractLetter = (rawName) => {
                                                const nn = normalize(rawName);
                                                if (!nn) return null;
                                                const m = nn.match(/^treino\s*\(?([a-z])/);
                                                if (m && m[1]) return m[1];
                                                const m2 = nn.match(/\(([a-z])\)/);
                                                if (m2 && m2[1]) return m2[1];
                                                return null;
                                            };
                                            const matchesLetter = (rawName, letterRaw) => {
                                                const nn = normalize(rawName);
                                                const letter = String(letterRaw || '').toLowerCase();
                                                if (!nn || !letter) return false;
                                                return nn.startsWith(`treino (${letter}`) || nn.startsWith(`treino ${letter}`) || nn.includes(`(${letter})`) || nn.includes(`(${letter} `);
                                            };
                                            const pickBest = (rows, letter) => {
                                                const list = Array.isArray(rows) ? rows : [];
                                                const candidates = list.filter(r => matchesLetter(r?.name || '', letter));
                                                candidates.sort((a, b) => ((b?.exercises || []).length - (a?.exercises || []).length));
                                                return candidates[0] || null;
                                            };
                                            let letters = Array.from(new Set(
                                                (templates || [])
                                                    .map(t => extractLetter(t?.name || ''))
                                                    .filter(Boolean)
                                            ));
                                            if (!letters.length) {
                                                letters = ['a', 'b', 'c', 'd', 'e', 'f'];
                                            }

                                            const picked = letters
                                                .map(l => pickBest(templates, l))
                                                .filter(Boolean);
                                            const templateIds = picked.map(t => t?.id).filter(Boolean);
                                            const res = await fetch('/api/admin/workouts/sync-templates', {
                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    id: targetId,
                                                    email: selectedStudent.email || '',
                                                    names: letters.map(l => String(l).toUpperCase()),
                                                    template_ids: templateIds
                                                })
                                            })
                                            const json = await res.json();
                                            if (json.ok) {
                                                // Se rota retorna vazio, reforçar fetch direto por OR user_id/student_id
                                                let rows = json.rows || [];
                                                if (!rows || rows.length === 0) {
                                                    try {
                                                        const { data: refreshed } = await supabase
                                                            .from('workouts')
                                                            .select('*, exercises(*, sets(*))')
                                                            .or(`user_id.eq.${targetId},student_id.eq.${targetId}`)
                                                            .eq('is_template', true)
                                                            .order('name');
                                                        rows = refreshed || [];
                                                    } catch {}
                                                }
                                                const synced = (rows || []).filter(w => {
                                                    const nn = (w?.name || '')
                                                        .toLowerCase()
                                                        .normalize('NFD')
                                                        .replace(/[\u0300-\u036f]/g, '')
                                                        .replace(/\s+/g, ' ')
                                                        .trim()
                                                    const okName = (letters || []).some((l) => {
                                                        const letter = String(l || '').toLowerCase();
                                                        if (!letter) return false;
                                                        return nn.startsWith(`treino (${letter}`) ||
                                                            nn.startsWith(`treino ${letter}`) ||
                                                            nn.includes(`(${letter})`) ||
                                                            nn.includes(`(${letter} `);
                                                    });
                                                    return okName && (w?.created_by === user.id);
                                                })
                                                const syncedIds = new Set((synced || []).map(w => w?.id).filter(Boolean));
                                                const others = (rows || []).filter(w => !syncedIds.has(w?.id));
                                                setStudentWorkouts(others)
                                                setSyncedWorkouts(synced)
                                                const msg = `Sincronizado: ${json.created_count || 0} criado(s), ${json.updated_count || 0} atualizado(s)`
                                                if ((json.created_count || 0) + (json.updated_count || 0) === 0 && json.debug) {
                                                    const d = json.debug || {}
                                                    const extra = `\n\nDiagnóstico:\n- sourceUserId: ${d.sourceUserId || '-'}\n- source_mode: ${d.source_mode || '-'}\n- owner_raw: ${d.owner_raw_count ?? '-'}\n- owner_matched: ${d.owner_matched_count ?? '-'}\n- source_count: ${d.source_count ?? '-'}\n- picked: ${d.picked_count ?? '-'}\n- picked_names: ${(d.picked_names || []).slice(0, 3).join(' | ') || '-'}\n- sample: ${(d.source_sample_names || []).slice(0, 3).join(' | ') || '-'}`
                                                    await alert(msg + extra)
                                                } else {
                                                    await alert(msg)
                                                }
                                            } else {
                                                await alert('Erro: ' + (json.error || 'Falha ao sincronizar'))
                                            }
                                        } catch (e) { await alert('Erro ao sincronizar: ' + e.message) }
                                    }} className="px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg text-xs font-bold">Sincronizar com Meus Treinos</button>
                                )}
                                {syncedWorkouts.length > 0 && (
                                    <div className="mt-4">
                                        <h3 className="font-bold text-yellow-500 text-xs uppercase tracking-widest mb-2">Treinos sincronizados</h3>
                                        {syncedWorkouts.map(w => (
                                            <div key={w.id} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center cursor-pointer" onClick={() => setViewWorkout(w)}>
                                                <div>
                                                    <h4 className="font-bold text-white">{w.name}</h4>
                                                    <p className="text-xs text-neutral-500">{w.exercises?.length || 0} exercícios</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={(e) => openEditWorkout(e, w)} className="p-2 bg-neutral-700 hover:bg-yellow-500 text-neutral-300 hover:text-black rounded"><Edit3 size={16}/></button>
                                                    <button onClick={async (e) => { e.stopPropagation(); if (!(await confirm('Remover este treino do aluno?'))) return; try { const res = await fetch('/api/admin/workouts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: w.id }) }); const json = await res.json(); if (!json.ok) throw new Error(json.error || 'Falha ao remover'); setStudentWorkouts(prev => prev.filter(x => x.id !== w.id)); setSyncedWorkouts(prev => prev.filter(x => x.id !== w.id)); } catch (e) { await alert('Erro ao remover: ' + e.message); } }} className="p-2 text-red-500 hover:bg-red-900/20 rounded"><Trash2 size={18}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {studentWorkouts.length === 0 && <p className="text-neutral-500 text-sm">Nenhum treino atribuído.</p>}
                                {studentWorkouts.map(w => (
                            <div key={w.id} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center cursor-pointer" onClick={() => setViewWorkout(w)}>
                                <div>
                                    <h4 className="font-bold text-white">{w.name}</h4>
                                    <p className="text-xs text-neutral-500">{w.exercises?.length || 0} exercícios</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={(e) => openEditWorkout(e, w)} className="p-2 bg-neutral-700 hover:bg-yellow-500 text-neutral-300 hover:text-black rounded"><Edit3 size={16}/></button>
                                    <button onClick={async (e) => { e.stopPropagation(); if (!(await confirm('Remover este treino do aluno?'))) return; try { const res = await fetch('/api/admin/workouts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: w.id }) }); const json = await res.json(); if (!json.ok) throw new Error(json.error || 'Falha ao remover'); setStudentWorkouts(prev => prev.filter(x => x.id !== w.id)); } catch (e) { await alert('Erro ao remover: ' + e.message); } }} className="p-2 text-red-500 hover:bg-red-900/20 rounded"><Trash2 size={18}/></button>
                        </div>
                    </div>
                ))}
                <div className="mt-6">
                    <h3 className="font-bold text-yellow-500 text-xs uppercase tracking-widest mb-2">Meus Treinos</h3>
                    {templates.length === 0 && <p className="text-neutral-500 text-sm">Nenhum treino seu encontrado.</p>}
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

        {showImportModal && (
            <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
                <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                        <h3 className="font-bold text-white">Importar Template</h3>
                        <button onClick={() => setShowImportModal(false)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300"><ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span></button>
                    </div>
                    <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
                        {templates.filter(t => t?.is_template === true).length === 0 && (
                            <p className="text-neutral-500 text-sm">Nenhum template encontrado.</p>
                        )}
                        {templates.filter(t => t?.is_template === true).map(t => (
                            <button key={t.id} onClick={async () => { setShowImportModal(false); await handleAddTemplateToStudent(t); }} className="w-full text-left p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl border border-neutral-700 flex justify-between group">
                                <span>{t.name}</span>
                                <Plus className="text-neutral-500 group-hover:text-yellow-500"/>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}

                {editingTemplate && (
                    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingTemplate(null)}>
                        <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                                <h3 className="font-bold text-white">Editar Treino</h3>
                                <button onClick={() => setEditingTemplate(null)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300"><ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span></button>
                            </div>
                            <div className="p-4 max-h-[75vh] overflow-y-auto">
                                <AdminWorkoutEditor
                                    initialData={editingTemplate}
                                    onSave={async (data) => {
                                        try {
                                            await updateWorkout(editingTemplate.id, data);
                                            const { data: refreshed } = await supabase
                                                .from('workouts')
                                                .select('*, exercises(*, sets(*))')
                                                .or(`created_by.eq.${user.id},user_id.eq.${user.id}`)
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

                {historyOpen && selectedStudent && (
                    <div className="fixed inset-0 z-[1500] bg-neutral-900 overflow-y-auto">
                        <HistoryList
                            user={user}
                            targetId={selectedStudent?.user_id || selectedStudent?.id}
                            targetEmail={selectedStudent?.email || ''}
                            readOnly
                            title={`Histórico - ${selectedStudent?.name || selectedStudent?.email || 'Aluno'}`}
                            onBack={() => setHistoryOpen(false)}
                        />
                    </div>
                )}

                {editingStudentWorkout && (
                    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingStudentWorkout(null)}>
                        <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                                <h3 className="font-bold text-white">Editar Treino do Aluno</h3>
                                <button onClick={() => setEditingStudentWorkout(null)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300"><ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span></button>
                            </div>
                            <div className="p-4 max-h-[75vh] overflow-y-auto">
                                <AdminWorkoutEditor
                                    initialData={editingStudentWorkout}
                                    onSave={async (data) => {
                                        try {
                                            const targetId = selectedStudent.user_id || selectedStudent.id;
                                            if (editingStudentWorkout.id) {
                                                await updateWorkout(editingStudentWorkout.id, data);
                                            } else {
                                            const { data: nw } = await supabase
                                                .from('workouts')
                                                .insert({ user_id: targetId, name: data.title || 'Novo Treino', notes: '', created_by: user.id, is_template: true })
                                                .select()
                                                .single();
                                                const toInsert = (data.exercises || []).map(e => ({
                                                    workout_id: nw.id,
                                                    name: e.name || '',
                                                    sets: getSetsCount(e?.sets) || 4,
                                                    reps: e.reps ?? '10',
                                                    rpe: e.rpe ?? 8,
                                                    cadence: e.cadence || '2020',
                                                    rest_time: e.restTime ?? e.rest_time ?? 60,
                                                    method: e.method || 'Normal',
                                                    video_url: e.videoUrl || e.video_url || '',
                                                    notes: e.notes || ''
                                                }));
                                                if (toInsert.length) await supabase.from('exercises').insert(toInsert);
                                            }
                const { data: refreshed } = await supabase
                    .from('workouts')
                    .select('*, exercises(*, sets(*))')
                    .or(`user_id.eq.${targetId},student_id.eq.${targetId}`)
                    .eq('is_template', true)
                    .order('name');
                setStudentWorkouts(refreshed || []);
                setEditingStudentWorkout(null);
            } catch (e) { await alert('Erro ao salvar: ' + e.message); }
                                    }}
                                    onCancel={() => setEditingStudentWorkout(null)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {viewWorkout && (
                    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewWorkout(null)}>
                        <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                                <h3 className="font-bold text-white">Treino: {viewWorkout.name}</h3>
                                <button onClick={() => setViewWorkout(null)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300"><ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span></button>
                            </div>
                            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
                                <div className="space-y-2">
                                    {(viewWorkout.exercises || []).map((e, i) => (
                                        <div key={i} className="bg-neutral-800 p-3 rounded-lg border border-neutral-700">
                                            <div className="font-bold text-white">{e.name}</div>
                                            <div className="text-xs text-neutral-400">Sets {getSetsCount(e?.sets)} • Reps {e.reps ?? '-'} • RPE {e.rpe ?? '-'} • Rest {e.rest_time ?? e.restTime ?? '-'}s • Cad {e.cadence ?? '-'}</div>
                                            {e.notes && <div className="text-xs text-neutral-300 mt-1">{e.notes}</div>}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <div className="relative">
                                        <button onClick={() => setExportOpen(true)} className="px-4 py-2 bg-yellow-500 text-black font-bold rounded-lg inline-flex items-center gap-2">
                                            <Download size={16}/> Salvar / Exportar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {exportOpen && viewWorkout && (
                    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setExportOpen(false)}>
                        <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                                <h3 className="font-bold text-white">Como deseja salvar?</h3>
                                <button onClick={() => setExportOpen(false)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300"><ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span></button>
                            </div>
                            <div className="p-4 space-y-3">
                                <button onClick={handleExportPdf} className="w-full px-4 py-3 bg-yellow-500 text-black font-bold rounded-xl inline-flex items-center justify-center gap-2">
                                    <FileText size={18}/> Baixar PDF
                                </button>
                                <button onClick={handleExportJson} className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl inline-flex items-center justify-center gap-2">
                                    <Download size={18}/> Baixar JSON
                                </button>
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

            {showTeacherModal && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl">
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2"><UserPlus size={24} className="text-yellow-500"/> Novo Professor</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input value={newTeacher.name} onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input value={newTeacher.email} onChange={e => setNewTeacher({ ...newTeacher, email: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">WhatsApp / Telefone</label>
                                <input value={newTeacher.phone} onChange={e => setNewTeacher({ ...newTeacher, phone: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowTeacherModal(false)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700">Cancelar</button>
                            <button onClick={handleAddTeacher} disabled={addingTeacher} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50">{addingTeacher ? 'Salvando...' : 'ADICIONAR'}</button>
                        </div>
                    </div>
                </div>
            )}

            {editingTeacher && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl">
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2"><Edit3 size={24} className="text-yellow-500"/> Editar Professor</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input value={editingTeacher.name} onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input value={editingTeacher.email} onChange={e => setEditingTeacher({ ...editingTeacher, email: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">WhatsApp / Telefone</label>
                                <input value={editingTeacher.phone || ''} onChange={e => setEditingTeacher({ ...editingTeacher, phone: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Data de Nascimento</label>
                                <input type="date" value={editingTeacher.birth_date || ''} onChange={e => setEditingTeacher({ ...editingTeacher, birth_date: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setEditingTeacher(null)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700">Cancelar</button>
                            <button onClick={handleUpdateTeacher} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400">SALVAR</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanelV2;
