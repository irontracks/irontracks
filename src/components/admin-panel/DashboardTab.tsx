import React, { useEffect, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
} from 'chart.js';
import {
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Clock,
    Crown,
    Dumbbell,
    UserCheck,
    UserPlus,
    UserX,
    Users,
    Zap,
} from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import { useTeacherPlan } from '@/hooks/useTeacherPlan';
import { normalizarStatus } from '@/lib/admin/studentStatus';
import dynamic from 'next/dynamic';

/**
 * Saudação por horário (BRT). "Bom dia / Boa tarde / Boa noite" — usado
 * na hero do dashboard. Decidido em BRT pra alinhar com o resto do
 * sistema (crons, datas, etc).
 */
function greetingForNowBrt(): string {
    try {
        const hourString = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            hour: 'numeric',
            hour12: false,
        }).format(new Date());
        const hour = Number(hourString);
        if (Number.isFinite(hour)) {
            if (hour >= 5 && hour < 12) return 'Bom dia';
            if (hour >= 12 && hour < 18) return 'Boa tarde';
        }
    } catch { /* fallback below */ }
    return 'Boa noite';
}

const TeacherUpgradeModal = dynamic(() => import('@/components/teacher/TeacherUpgradeModal'), { ssr: false });

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

export const DashboardTab: React.FC = () => {
    const {
        user,
        isAdmin,
        isTeacher,
        setTab,
        setStudentStatusFilter,
        usersList,
        teachersList,
        dashboardCharts,
        coachInboxItems,
        prioritiesItems,
        fetchPriorities,
        setSelectedStudent,
        setHistoryOpen,
        setShowRegisterModal,
        supabase,
    } = useAdminPanel();

    const planState = useTeacherPlan();



    // Mesma normalização do gráfico (`lib/admin/studentStatus.ts`). As duas
    // superfícies contavam "pendente" por regras DIFERENTES: aqui vazio não
    // contava, no gráfico vazio VIRAVA pendente. Com a base limpa os números
    // concordavam por sorte; bastava entrar um aluno sem status para o painel
    // se contradizer a uma rolagem de distância.
    const qtdPendentes = usersList.filter(u => normalizarStatus(u?.status) === 'pendente').length;
    const qtdPagantes = usersList.filter(u => normalizarStatus(u?.status) === 'pago').length;
    const temPendentes = qtdPendentes > 0;
    const [upgradeOpen, setUpgradeOpen] = useState(false);

    // Saudação contextual — o MESMO nome que o cabeçalho da Área do Professor
    // mostra dois centímetros acima (`displayName`). Antes começava por
    // `user.name`, que costuma vir vazio, e caía no e-mail: a tela dizia
    // "DJ MK Brasil" no topo e "Bom dia, djmkbrasil" logo abaixo. Handle
    // técnico não é como alguém se chama.
    const firstName = String(
        user?.displayName ?? user?.name ?? user?.email ?? '',
    ).split(/[ @]/)[0] || '';
    const greeting = greetingForNowBrt();

    // CTA dinâmico de solicitações pendentes. Busca quando admin abre o
    // dashboard. Fica oculto se não houver pendentes ou se o usuário
    // não for admin (só admin tem acesso à tela de Solicitações).
    const [pendingRequests, setPendingRequests] = useState<number>(0);
    useEffect(() => {
        let cancelled = false;
        if (!isAdmin || !supabase) return;
        (async () => {
            try {
                const { count } = await supabase
                    .from('access_requests')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'pending');
                if (!cancelled && typeof count === 'number') setPendingRequests(count);
            } catch { /* silent — banner é cosmético */ }
        })();
        return () => { cancelled = true; };
    }, [isAdmin, supabase]);

    // A fila de triagem é carregada AQUI, no Início — não mais só quando alguém
    // encontra "Mais → Prioridades". Ela é a informação mais acionável do
    // painel inteiro (alunos em risco, com nome e sobrenome), e estava a dois
    // toques de distância enquanto a primeira tela mostrava totais que não
    // pedem ação nenhuma.
    useEffect(() => {
        if (!isAdmin && !isTeacher) return;
        void fetchPriorities();
        // uma vez por abertura do painel: a fila não muda a cada render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, isTeacher]);

    const emRisco = Array.isArray(prioritiesItems) ? prioritiesItems.length : 0;
    const semProfessor = Math.max(0, dashboardCharts.totalStudents - usersList.filter(u => !!u?.teacher_id).length);

    // ⚠️ "Alunos sem professor" NÃO entra aqui, e a medição é o motivo: 26 dos
    // 55 alunos (47%) não têm professor, e 7 estão assim há mais de 90 dias —
    // o mais antigo desde dezembro. Isso não é pendência, é a característica de
    // quem baixou o app e treina sozinho. Como alerta, ficaria aceso para
    // sempre, e um bloco que sempre tem item deixa de ser lido. Se o número
    // interessar, ele é MÉTRICA (vive com os totais), não tarefa.

    /**
     * O que EXIGE decisão, em ordem de custo de ignorar.
     * Aluno em risco vem antes de solicitação porque churn é dinheiro saindo;
     * solicitação é dinheiro esperando na porta.
     */
    const pendencias = [
        emRisco > 0 && {
            chave: 'risco',
            icone: <AlertCircle size={18} className="text-red-400" />,
            cor: 'red' as const,
            titulo: emRisco === 1 ? '1 aluno precisa de atenção' : `${emRisco} alunos precisam de atenção`,
            desc: 'Sem treino registrado ou em risco de sair',
            ir: () => setTab('priorities'),
        },
        isAdmin && pendingRequests > 0 && {
            chave: 'solicitacoes',
            icone: <UserPlus size={18} className="text-amber-400" />,
            cor: 'amber' as const,
            titulo: pendingRequests === 1 ? '1 solicitação aguardando' : `${pendingRequests} solicitações aguardando`,
            desc: 'Revisar e aprovar acesso',
            ir: () => setTab('requests'),
        },
    ].filter(Boolean) as Array<{ chave: string; icone: React.ReactNode; cor: 'red' | 'amber'; titulo: string; desc: string; ir: () => void }>;

    const chartOptions = {
        responsive: true,
        // O Chart.js mantém proporção 2:1 por padrão, então o canvas NÃO
        // preenchia o container de 250px e sobrava metade do card em branco.
        // O vazio não era decisão de layout — era default de biblioteca.
        maintainAspectRatio: false,
        plugins: {
            // Legenda DESLIGADA de propósito. Os dois gráficos que usam estas
            // opções têm UM dataset ("Alunos") com um array de cores — uma cor
            // por barra. O Chart.js desenha a legenda com a PRIMEIRA cor do
            // array, então ela afirmava "verde = Alunos" enquanto o verde
            // significa "Pago" e as outras barras eram amarela, vermelha e
            // cinza. Legenda que descreve errado é pior que legenda nenhuma.
            //
            // O que a cor codifica já está rotulado no eixo X, abaixo de cada
            // barra. Se um dia estes gráficos ganharem uma SEGUNDA série, aí a
            // legenda volta a ter função — e a ligar de novo.
            legend: { display: false },
            title: { display: false }
        },
        scales: {
            x: { ticks: { color: '#a3a3a3', font: { size: 10, weight: 'bold' as const } }, grid: { color: '#262626' } },
            // `beginAtZero` NÃO é preferência: numa barra, o comprimento É o
            // dado. Sem isto o Chart.js escolhia a escala pelo intervalo dos
            // valores e o eixo começava em 10 — com 23 e 26 alunos, uma barra
            // aparecia mais do que o dobro da outra. Truncar a base de um
            // gráfico de barra distorce a leitura, e num painel de decisão
            // isso é pior que não ter gráfico.
            y: {
                beginAtZero: true,
                ticks: { color: '#a3a3a3', font: { size: 10, weight: 'bold' as const }, precision: 0 },
                grid: { color: '#262626' },
            }
        }
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right' as const, labels: { color: '#e5e5e5', font: { size: 11, weight: 'bold' as const } } }
        },
        cutout: '70%',
        elements: { arc: { borderWidth: 0 } }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* ── Hero: Saudação ─────────────────────────────────────────────
                Primeira coisa que o admin vê. Bem mais leve que o header
                duplicado antigo: nome + horário + uma frase do contexto.
            */}
            <div className="flex flex-col gap-1 pt-1">
                <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">
                    {greeting}{firstName ? `, ${firstName}` : ''}{' '}
                    <span className="text-2xl md:text-3xl">👋</span>
                </h1>
                <p className="text-sm text-neutral-400">
                    {isAdmin
                        ? 'Resumo do seu negócio hoje.'
                        : 'Como está o time? Veja seus alunos abaixo.'}
                </p>
            </div>

            {/* ── PRECISA DE VOCÊ ────────────────────────────────────────────
                O painel abria com 49 alunos / 7 professores — números que não
                pedem ação — enquanto os alunos em risco ficavam a dois toques,
                atrás de "Mais → Prioridades". Um painel de gestão deve começar
                pelo que custa caro ignorar; totais servem para conferir, não
                para decidir, e por isso desceram para o fim.

                Cada linha é um destino, não um aviso: leva direto para a tela
                que resolve. E o bloco SOME quando não há pendência — estado
                vazio de card cheio ocupa espaço nobre para dizer "nada aqui". */}
            {pendencias.length > 0 && (
                <div className="rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}>
                    <div className="px-4 pt-3.5 pb-2">
                        <p className="t-meta text-[10px]">Precisa de você</p>
                    </div>
                    {pendencias.map((p, i) => (
                        <button
                            key={p.chave}
                            type="button"
                            onClick={p.ir}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-white/[0.06] hover:bg-white/[0.03] ${i > 0 ? 'border-t border-white/5' : ''}`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${p.cor === 'red' ? 'bg-red-500/10 border-red-500/25' : 'bg-amber-500/10 border-amber-500/25'}`}>
                                {p.icone}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{p.titulo}</p>
                                <p className="text-xs text-neutral-400 truncate mt-0.5">{p.desc}</p>
                            </div>
                            <ArrowRight size={18} className="text-neutral-400 shrink-0" />
                        </button>
                    ))}
                </div>
            )}

            {/* Tudo em dia: uma linha, não um card. Ausência de trabalho não
                merece o mesmo peso visual que trabalho pendente. */}
            {pendencias.length === 0 && (isAdmin || isTeacher) && (
                <p className="text-xs text-neutral-400 flex items-center gap-1.5 px-1">
                    <CheckCircle2 size={13} className="text-green-500/70" />
                    Nada pendente por aqui.
                </p>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                    type="button"
                    onClick={() => setTab('students')}
                    className="rounded-2xl p-4 text-left transition-all duration-200 hover:bg-white/[0.04] active:scale-95 cursor-pointer group"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-yellow-500/10 rounded-lg group-hover:bg-yellow-500/20 transition-colors">
                            <Users size={18} className="text-yellow-500" />
                        </div>
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider group-hover:text-yellow-500 transition-colors">Total Alunos</span>
                    </div>
                    <div className="text-2xl font-black text-white ml-1 group-hover:text-yellow-400 transition-colors">
                        {dashboardCharts.totalStudents}
                    </div>
                    {/* Quantos treinam sem coach — 47% da base hoje. Vive AQUI,
                        colado ao total que ele divide, e não no bloco de
                        pendências: é característica da base, não tarefa. Como
                        alerta ficaria aceso para sempre (ver #795). */}
                    {isAdmin && semProfessor > 0 && (
                        <p className="text-[11px] text-neutral-400 ml-1 mt-1">
                            {semProfessor} sem professor
                        </p>
                    )}
                </button>

                {isAdmin && (
                    <button
                        type="button"
                        onClick={() => setTab('teachers')}
                        className="rounded-2xl p-4 text-left transition-all duration-200 hover:bg-white/[0.04] active:scale-95 cursor-pointer group"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-neutral-800 rounded-lg group-hover:bg-neutral-700 transition-colors">
                                <UserCheck size={18} className="text-neutral-400 group-hover:text-white transition-colors" />
                            </div>
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider group-hover:text-white transition-colors">Professores</span>
                        </div>
                        <div className="text-2xl font-black text-white ml-1">
                            {teachersList.length}
                        </div>
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setTab('students')}
                    className="rounded-2xl p-4 text-left transition-all duration-200 hover:bg-white/[0.04] active:scale-95 cursor-pointer group"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
                            <UserCheck size={18} className="text-green-500" />
                        </div>
                        {/* "Pagantes", não "Ativos": este card conta `pago`, e
                            existe um status `ativo` — 43% da base — que é outra
                            coisa. Os dois números apareciam na mesma tela, a uma
                            rolagem um do outro, com a mesma palavra. */}
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider group-hover:text-green-400 transition-colors">Pagantes</span>
                    </div>
                    <div className="text-2xl font-black text-white ml-1 group-hover:text-green-400 transition-colors">
                        {qtdPagantes}
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => { setTab('students'); setStudentStatusFilter('pendente'); }}
                    className="rounded-2xl p-4 text-left transition-all duration-200 hover:bg-white/[0.04] active:scale-95 cursor-pointer group"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                    {/* O vermelho acende com a PENDÊNCIA, não com a categoria.
                        Com zero pendentes — que é a boa notícia — o card ficava
                        vermelho do mesmo jeito, e o alerta perdia o sentido:
                        cor de alarme que está sempre ligada não alarma ninguém. */}
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg transition-colors ${temPendentes ? 'bg-red-500/10 group-hover:bg-red-500/20' : 'bg-white/5'}`}>
                            <UserX size={18} className={temPendentes ? 'text-red-500' : 'text-neutral-400'} />
                        </div>
                        <span className={`text-xs font-bold uppercase tracking-wider transition-colors ${temPendentes ? 'text-neutral-400 group-hover:text-red-400' : 'text-neutral-400'}`}>Pendentes</span>
                    </div>
                    <div className={`text-2xl font-black ml-1 transition-colors ${temPendentes ? 'text-red-400' : 'text-white'}`}>
                        {qtdPendentes}
                    </div>
                </button>
            </div>

            {/* ── Atalhos rápidos ─────────────────────────────────────────────
                3 ações que o admin faz com mais frequência. Resumido em
                botões grandes com ícone — bem mais óbvio que ter que
                lembrar a localização nos menus.
            */}
            <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 px-1">
                    Ações rápidas
                </p>
                <div className="grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        onClick={() => setShowRegisterModal(true)}
                        className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl border transition-all active:scale-[0.97] hover:bg-white/[0.05]"
                        style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                        <div className="w-10 h-10 rounded-xl bg-yellow-500/15 border border-yellow-400/25 flex items-center justify-center">
                            <UserPlus size={18} className="text-yellow-400" />
                        </div>
                        <span className="text-[11px] font-black text-white uppercase tracking-wide">+ Aluno</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('templates')}
                        className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl border transition-all active:scale-[0.97] hover:bg-white/[0.05]"
                        style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center">
                            <Dumbbell size={18} className="text-amber-400" />
                        </div>
                        <span className="text-[11px] font-black text-white uppercase tracking-wide">+ Treino</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab(isAdmin ? 'vip' : 'priorities')}
                        className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl border transition-all active:scale-[0.97] hover:bg-white/[0.05]"
                        style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center">
                            <Crown size={18} className="text-amber-400" />
                        </div>
                        <span className="text-[11px] font-black text-white uppercase tracking-wide">
                            {isAdmin ? 'VIP' : 'Coach'}
                        </span>
                    </button>
                </div>
            </div>

            {/* ── Plano do Professor ────────────────────────────────────────── */}
            {isTeacher && !planState.loading && (
                <div
                    className="rounded-2xl p-5 flex items-center justify-between gap-4"
                    style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)' }}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-yellow-500/10 rounded-xl">
                            <Zap size={20} className="text-yellow-500" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Seu Plano</p>
                            <p className="text-white font-black text-lg leading-tight">{planState.plan?.name ?? 'Free'}</p>
                        </div>
                        <div className="h-10 w-px bg-neutral-800" />
                        <div>
                            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Alunos</p>
                            <p className="text-white font-black text-lg leading-tight">
                                {planState.studentCount}
                                <span className="text-neutral-400 font-normal text-sm ml-1">
                                    / {planState.maxStudents === 0 ? '∞' : planState.maxStudents}
                                </span>
                            </p>
                        </div>
                        {planState.maxStudents > 0 && (
                            <div className="w-24 h-1.5 rounded-full bg-neutral-800 overflow-hidden hidden sm:block">
                                <div
                                    className={`h-full rounded-full transition-all ${
                                        !planState.canAddStudent ? 'bg-red-500' :
                                        planState.studentCount / planState.maxStudents >= 0.8 ? 'bg-yellow-400' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.round((planState.studentCount / planState.maxStudents) * 100))}%` }}
                                />
                            </div>
                        )}
                    </div>
                    {(planState.plan?.tier_key ?? 'free') !== 'unlimited' && (
                        <button
                            type="button"
                            onClick={() => setUpgradeOpen(true)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm transition-colors"
                        >
                            <Zap size={14} />
                            Upgrade
                        </button>
                    )}
                </div>
            )}

            {isTeacher && (
                <TeacherUpgradeModal
                    open={upgradeOpen}
                    onClose={() => { setUpgradeOpen(false); planState.refetch(); }}
                    planState={planState}
                />
            )}

            {/* Inbox do Coach */}
            {isTeacher && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-black text-white text-lg flex items-center gap-2">
                                <Clock size={20} className="text-yellow-500" />
                                Sua fila
                            </h3>
                            <span className="text-xs font-bold text-neutral-400 bg-neutral-900 px-3 py-1 rounded-full border border-neutral-800">
                                Alunos inativos (+7 dias)
                            </span>
                        </div>

                        {coachInboxItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                                <div className="p-4 bg-neutral-800/50 rounded-full">
                                    <UserCheck size={32} className="text-neutral-400" />
                                </div>
                                <p className="text-neutral-400 text-sm font-medium">Tudo em dia! Nenhum aluno inativo.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {coachInboxItems.map((item: Record<string, unknown>) => (
                                    <div key={item.id as string} className="flex items-center justify-between p-4 bg-neutral-900/80 border border-neutral-800 rounded-xl hover:border-yellow-500/30 transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 border border-neutral-700">
                                                {String(item.name ?? '').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-bold text-white group-hover:text-yellow-500 transition-colors">
                                                    {String(item.name ?? '')}
                                                </div>
                                                <div className="text-xs text-neutral-400 flex items-center gap-2">
                                                    <span className="text-red-400 font-bold">
                                                        {item.hasWorkouts ? `${item.daysSinceLastWorkout} dias sem treino` : 'Nunca treinou'}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{String(item.email ?? '')}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedStudent(item as import('@/types/admin').AdminUser);
                                                    setTab('students');
                                                }}
                                                className="px-3 py-2 text-xs font-bold text-neutral-400 bg-neutral-800 hover:bg-neutral-700 hover:text-white rounded-lg transition-all"
                                            >
                                                Ver Perfil
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedStudent(item as import('@/types/admin').AdminUser);
                                                    setHistoryOpen(true);
                                                }}
                                                className="px-3 py-2 text-xs font-bold text-black bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-all"
                                            >
                                                Histórico
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setTab('priorities')}
                                    className="w-full py-3 mt-2 text-xs font-bold text-neutral-400 hover:text-yellow-500 border-t border-neutral-800 transition-colors flex items-center justify-center gap-2"
                                >
                                    Ver todos em Prioridades <Clock size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm flex flex-col justify-center">
                        <h3 className="font-black text-white text-lg mb-6 flex items-center gap-2">
                            <AlertTriangle size={20} className="text-yellow-500" />
                            Status Geral
                        </h3>
                        <div className="relative aspect-square max-h-[250px] mx-auto">
                            <Doughnut data={dashboardCharts.statusDistribution.data} options={doughnutOptions} />
                            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                                <span className="text-3xl font-black text-white">{dashboardCharts.statusTotal}</span>
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Alunos</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Gráficos Admin
                "Distribuição por Professor" foi REMOVIDO: era um gráfico de
                210px para mostrar dois números — 24 com professor e 25 sem —
                que o card TOTAL ALUNOS, na mesma tela e a uma rolagem de
                distância, já diz em texto ("49" e "25 sem professor"). Um fato
                aparece uma vez (`docs/DESIGN_HIERARCHY.md`). */}
            {isAdmin && (
                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-neutral-900/50 p-5 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                        <h3 className="font-black text-white text-base mb-4">Status dos Alunos</h3>
                        <div className="h-[210px] w-full">
                            <Bar data={dashboardCharts.statusDistribution.data} options={chartOptions} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
