'use client'
/**
 * TeacherManualTab — manual completo para professores com mockups visuais
 * de todas as funcionalidades do painel: alunos, treinos, cobranças e pagamentos.
 */
import React, { useState, useRef, useEffect } from 'react'
import {
  BookOpen, Users, Dumbbell, CreditCard, QrCode, BarChart3,
  ChevronRight, CheckCircle2, AlertCircle, Clock, Star,
  Plus, Edit2, Power, PowerOff, RefreshCw, Crown, Zap, Shield,
  ArrowRight, Info, Calendar, Repeat,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  id: string
  icon: React.ReactNode
  title: string
  color: string
}

// ─── Table of Contents ────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  { id: 'overview',   icon: <BarChart3 size={14} />,   title: 'Visão Geral do Painel',       color: 'text-yellow-400' },
  { id: 'students',   icon: <Users size={14} />,        title: 'Gerenciando Alunos',           color: 'text-blue-400' },
  { id: 'workouts',   icon: <Dumbbell size={14} />,     title: 'Treinos e Templates',          color: 'text-green-400' },
  { id: 'plans',      icon: <CreditCard size={14} />,   title: 'Planos de Serviço',            color: 'text-purple-400' },
  { id: 'intervals',  icon: <Repeat size={14} />,       title: 'Tipos de Cobrança',            color: 'text-orange-400' },
  { id: 'assign',     icon: <ArrowRight size={14} />,   title: 'Atribuindo Planos',            color: 'text-cyan-400' },
  { id: 'payment',    icon: <QrCode size={14} />,       title: 'Pagamento via PIX',            color: 'text-green-400' },
  { id: 'subs',       icon: <CheckCircle2 size={14} />, title: 'Acompanhar Assinaturas',       color: 'text-teal-400' },
  { id: 'myplan',     icon: <Crown size={14} />,        title: 'Seu Plano na Plataforma',      color: 'text-yellow-400' },
]

// ─── Reusable components ──────────────────────────────────────────────────────

function SectionTitle({ id, icon, title, color }: Section) {
  return (
    <div id={id} className="flex items-center gap-3 mb-5 scroll-mt-6">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-neutral-800 ${color} flex-shrink-0`}>
        {icon}
      </div>
      <h2 className="text-white font-black text-lg tracking-tight">{title}</h2>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-yellow-500 text-black font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
      <p className="text-sm text-neutral-300 leading-relaxed">{children}</p>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 mt-3">
      <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-blue-300 leading-relaxed">{children}</p>
    </div>
  )
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mt-3">
      <AlertCircle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-yellow-300 leading-relaxed">{children}</p>
    </div>
  )
}

function FieldRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-3 py-2 border-b border-neutral-800/60 last:border-0">
      <span className="text-xs font-bold text-white w-44 flex-shrink-0">{label}</span>
      <span className="text-xs text-neutral-400 leading-relaxed">{desc}</span>
    </div>
  )
}

// ─── Screen Mockup helpers ────────────────────────────────────────────────────

function MockupShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-700/60 bg-neutral-900 overflow-hidden my-4 shadow-xl">
      {/* fake title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800/80 border-b border-neutral-700/40">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span className="text-[10px] text-neutral-500 font-medium ml-2 uppercase tracking-widest">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function MockupBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${color}`}>{children}</span>
}

function MockupBtn({ yellow, children }: { yellow?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold ${yellow ? 'bg-yellow-500 text-black' : 'bg-neutral-800 border border-neutral-700 text-neutral-300'}`}>
      {children}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeacherManualTab() {
  const [activeSection, setActiveSection] = useState('overview')
  const contentRef = useRef<HTMLDivElement>(null)

  // Intersection observer to highlight active TOC item
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id) })
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    )
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex gap-6 animate-in fade-in duration-500">

      {/* ── Sticky TOC ─────────────────────────────────────────── */}
      <nav className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0 sticky top-4 self-start">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={14} className="text-yellow-400" />
          <span className="text-xs font-black text-yellow-400 uppercase tracking-widest">Manual</span>
        </div>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-semibold transition-all ${activeSection === s.id ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/25' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60'}`}
          >
            <span className={activeSection === s.id ? 'text-yellow-400' : 'text-neutral-600'}>{s.icon}</span>
            {s.title}
          </button>
        ))}
        <div className="mt-4 pt-4 border-t border-neutral-800">
          <p className="text-[10px] text-neutral-600 leading-relaxed">Manual IronTracks para Professores · v1.0</p>
        </div>
      </nav>

      {/* ── Content ────────────────────────────────────────────── */}
      <div ref={contentRef} className="flex-1 min-w-0 space-y-12 pb-24">

        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-br from-yellow-500/10 to-amber-600/5 border border-yellow-500/20 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/30">
              <BookOpen size={24} className="text-black" />
            </div>
            <div>
              <p className="text-xs text-yellow-500/70 uppercase tracking-widest font-bold">IronTracks</p>
              <h1 className="text-white font-black text-2xl leading-tight">Manual do Professor</h1>
            </div>
          </div>
          <p className="text-neutral-300 text-sm leading-relaxed max-w-xl">
            Guia completo de todas as funcionalidades disponíveis para professores: gestão de alunos, treinos, criação de planos de cobrança e acompanhamento de pagamentos via PIX.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900/80 border border-neutral-700 text-xs font-semibold ${s.color} hover:border-neutral-600 transition-colors`}
              >
                {s.icon} {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            1. VISÃO GERAL
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[0]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            Ao abrir o Painel de Controle (botão <strong className="text-white">Menu</strong> no topo da tela), você vê o <strong className="text-white">Dashboard</strong> com métricas e acesso rápido a todas as funções.
          </p>

          {/* Mockup: Dashboard overview */}
          <MockupShell title="PAINEL DE CONTROLE · VISÃO GERAL">
            {/* Fake tab bar */}
            <div className="flex gap-2 flex-wrap mb-4">
              {['VISÃO GERAL','ALUNOS','TREINOS','PRIORIDADES','COBRANÇAS','GUIA'].map((t,i) => (
                <span key={t} className={`px-3 py-1.5 rounded-full text-[10px] font-black border ${i === 0 ? 'bg-yellow-500 text-black border-yellow-400' : 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}>{t}</span>
              ))}
            </div>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Total Alunos', value: '12', color: 'text-yellow-400' },
                { label: 'Ativos', value: '8', color: 'text-green-400' },
                { label: 'Pendentes', value: '3', color: 'text-yellow-400' },
                { label: 'Atrasados', value: '1', color: 'text-red-400' },
              ].map(k => (
                <div key={k.label} className="rounded-xl bg-neutral-800/60 border border-neutral-700/40 p-3">
                  <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1">{k.label}</p>
                  <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
            {/* Plan badge */}
            <div className="rounded-xl bg-neutral-800/40 border border-neutral-700/40 p-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1">Seu Plano</p>
                <p className="text-xs font-bold text-yellow-400">Pro — 7/40 alunos</p>
                <div className="w-32 h-1.5 rounded-full bg-neutral-700 mt-1.5">
                  <div className="w-[17%] h-full rounded-full bg-green-500" />
                </div>
              </div>
              <MockupBtn yellow>Upgrade</MockupBtn>
            </div>
          </MockupShell>

          <div className="space-y-2">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">O que cada aba faz:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { tab: 'VISÃO GERAL', desc: 'Métricas gerais, KPIs de alunos e seu plano na plataforma.' },
                { tab: 'ALUNOS', desc: 'Lista completa de alunos, filtros por status e operações individuais.' },
                { tab: 'TREINOS', desc: 'Biblioteca de templates de treinos que você atribui aos alunos.' },
                { tab: 'PRIORIDADES', desc: 'Alunos que precisam de atenção: sem treino há dias, sem check-in, etc.' },
                { tab: 'COBRANÇAS', desc: 'Crie planos de serviço e acompanhe as assinaturas dos alunos.' },
                { tab: 'GUIA', desc: 'Este manual. Sempre disponível para consulta.' },
              ].map(item => (
                <div key={item.tab} className="rounded-xl bg-neutral-900/60 border border-neutral-800 px-4 py-3">
                  <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-1">{item.tab}</p>
                  <p className="text-xs text-neutral-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            2. GERENCIANDO ALUNOS
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[1]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            A aba <strong className="text-white">ALUNOS</strong> é o centro de controle para gerenciar todos os seus alunos. Você pode filtrar por status, buscar por nome, atualizar situações e acessar o histórico individual.
          </p>

          <MockupShell title="PAINEL · ALUNOS">
            {/* Search + filter */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 bg-neutral-800 rounded-xl px-3 py-2 text-[11px] text-neutral-500 border border-neutral-700">🔍 Buscar aluno...</div>
              <MockupBtn>+ Aluno</MockupBtn>
            </div>
            {/* Status pills */}
            <div className="flex gap-2 flex-wrap mb-3">
              {[
                { label: 'Pago (8)', cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
                { label: 'Pendente (3)', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
                { label: 'Atrasado (1)', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
                { label: 'Cancelado (0)', cls: 'text-neutral-400 bg-neutral-700/30 border-neutral-600/20' },
              ].map(p => (
                <span key={p.label} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${p.cls}`}>{p.label}</span>
              ))}
            </div>
            {/* Student rows */}
            {['Ana Souza','Bruno Lima','Carlos Mendes'].map((name, i) => (
              <div key={name} className="flex items-center justify-between py-2 border-b border-neutral-800/50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] font-bold text-white">{name[0]}</div>
                  <div>
                    <p className="text-xs font-semibold text-white">{name}</p>
                    <p className="text-[10px] text-neutral-500">{i === 0 ? 'último treino: 2d' : i === 1 ? 'último treino: 5d' : 'sem treino'}</p>
                  </div>
                </div>
                <MockupBadge color={i === 2 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' : 'text-green-400 bg-green-500/10 border-green-500/20'}>
                  {i === 2 ? 'Pendente' : 'Pago'}
                </MockupBadge>
              </div>
            ))}
          </MockupShell>

          <div className="space-y-3">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Status disponíveis:</p>
            <div className="grid gap-2">
              {[
                { status: 'Pago', color: 'text-green-400', desc: 'Aluno com mensalidade em dia.' },
                { status: 'Pendente', color: 'text-yellow-400', desc: 'Aguardando confirmação de pagamento ou cadastro recente.' },
                { status: 'Atrasado', color: 'text-red-400', desc: 'Pagamento em atraso — requer contato.' },
                { status: 'Cancelado', color: 'text-neutral-400', desc: 'Contrato encerrado. O aluno não aparece mais nas listas ativas.' },
              ].map(s => (
                <div key={s.status} className="flex items-start gap-3 rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3">
                  <span className={`text-xs font-bold w-20 flex-shrink-0 ${s.color}`}>{s.status}</span>
                  <p className="text-xs text-neutral-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Como adicionar um aluno:</p>
            <div className="space-y-2">
              <Step n={1}>Clique no botão <strong className="text-yellow-400">+ Aluno</strong> no canto superior direito da aba.</Step>
              <Step n={2}>Preencha o e-mail do aluno e defina o status inicial (<em>Pendente</em> é o padrão).</Step>
              <Step n={3}>O aluno receberá um convite e poderá criar a conta no app.</Step>
              <Step n={4}>Após aceitar, ele aparecerá na sua lista e você poderá atribuir treinos e planos de cobrança.</Step>
            </div>
            <Tip>O número máximo de alunos depende do seu plano na plataforma. Veja a seção <strong>Seu Plano</strong> para detalhes de cada faixa.</Tip>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            3. TREINOS E TEMPLATES
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[2]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            A aba <strong className="text-white">TREINOS</strong> é sua biblioteca de templates. Você cria modelos de treino uma vez e os reutiliza para múltiplos alunos, personalizando conforme necessário.
          </p>

          <MockupShell title="PAINEL · TREINOS">
            <div className="flex gap-2 mb-3">
              <div className="flex-1 bg-neutral-800 rounded-xl px-3 py-2 text-[11px] text-neutral-500 border border-neutral-700">🔍 Buscar treino...</div>
              <MockupBtn yellow><Plus size={10} /> Novo Treino</MockupBtn>
            </div>
            {[
              { name: 'Hipertrofia A — Peito/Tríceps', exercises: '6 exercícios', uses: '4 alunos' },
              { name: 'Hipertrofia B — Costas/Bíceps', exercises: '5 exercícios', uses: '4 alunos' },
              { name: 'Funcional Iniciante', exercises: '8 exercícios', uses: '2 alunos' },
            ].map(w => (
              <div key={w.name} className="flex items-center justify-between py-2.5 border-b border-neutral-800/50 last:border-0">
                <div>
                  <p className="text-xs font-semibold text-white">{w.name}</p>
                  <p className="text-[10px] text-neutral-500">{w.exercises} · {w.uses}</p>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400">Editar</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/25 text-yellow-400">Atribuir</span>
                </div>
              </div>
            ))}
          </MockupShell>

          <div className="space-y-2">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Fluxo de trabalho recomendado:</p>
            <div className="space-y-2">
              <Step n={1}>Crie um template de treino na aba <strong className="text-white">TREINOS</strong> com os exercícios, séries e repetições.</Step>
              <Step n={2}>Acesse o perfil do aluno clicando no seu nome na aba <strong className="text-white">ALUNOS</strong>.</Step>
              <Step n={3}>Dentro do perfil, clique em <strong className="text-white">Atribuir Treino</strong> e selecione o template desejado.</Step>
              <Step n={4}>O aluno verá o treino disponível no app assim que fizer login.</Step>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            4. PLANOS DE SERVIÇO
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[3]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            Na aba <strong className="text-white">COBRANÇAS</strong>, você cria <strong className="text-white">Planos de Serviço</strong> — pacotes personalizáveis que definem o que está incluso na assessoria para cada aluno, incluindo preço, frequência de pagamento e estrutura de treino.
          </p>

          {/* Mockup: plan creation form */}
          <MockupShell title="COBRANÇAS · NOVO PLANO">
            <div className="space-y-3">
              <div>
                <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">Nome do Plano *</p>
                <div className="bg-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-300 border border-neutral-700">Mensal Premium</div>
              </div>
              <div>
                <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">Valor (R$)</p>
                <div className="bg-neutral-800 rounded-xl px-3 py-2 text-xs text-yellow-400 font-bold border border-neutral-700">R$ 250,00</div>
              </div>
              <div>
                <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">Tipo de Cobrança</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Avulso','Mensal','Trimestral','Semestral','Anual'].map((t,i) => (
                    <span key={t} className={`px-2 py-1.5 rounded-lg text-[9px] font-bold text-center border ${i === 1 ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">Duração (dias)</p>
                  <div className="bg-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-300 border border-neutral-700">30</div>
                </div>
                <div>
                  <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">Sessões/semana</p>
                  <div className="bg-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-300 border border-neutral-700">3</div>
                </div>
              </div>
              <div>
                <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">Dias de Treino</p>
                <div className="flex gap-1.5">
                  {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d,i) => (
                    <span key={d} className={`w-9 h-7 rounded-lg text-[9px] font-bold flex items-center justify-center border ${[0,2,4].includes(i) ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}>{d}</span>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <MockupBtn yellow>💾 Criar Plano</MockupBtn>
              </div>
            </div>
          </MockupShell>

          {/* Field reference table */}
          <div className="rounded-2xl border border-neutral-800 overflow-hidden">
            <div className="px-4 py-3 bg-neutral-900/60 border-b border-neutral-800">
              <p className="text-xs font-black text-white uppercase tracking-widest">Campos do Plano — Referência Completa</p>
            </div>
            <div className="px-4 divide-y divide-neutral-800/60">
              <FieldRow label="Nome do Plano *" desc="Título que aparecerá para o aluno, ex: 'Mensal Premium', 'Trimestral Hipertrofia'." />
              <FieldRow label="Descrição" desc="Texto opcional detalhando o que está incluso: exercícios, acompanhamento, etc." />
              <FieldRow label="Valor (R$) *" desc="Preço cobrado pelo plano. Mínimo R$ 0,00 (plano gratuito, sem cobrança PIX)." />
              <FieldRow label="Tipo de Cobrança *" desc="Define a frequência e duração padrão. Pode ser alterada manualmente no campo Duração." />
              <FieldRow label="Duração (dias)" desc="Quantos dias o plano é válido após o pagamento. Preenchido automaticamente pelo Tipo de Cobrança." />
              <FieldRow label="Dias de Treino" desc="Quais dias da semana o aluno deve treinar (seg, ter, qua, qui, sex, sáb, dom). Informativo." />
              <FieldRow label="Duração/sessão (min)" desc="Tempo estimado de cada sessão de treino em minutos." />
              <FieldRow label="Sessões/semana" desc="Quantas sessões semanais estão previstas no plano. Informativo para o aluno." />
              <FieldRow label="Observações" desc="Regras, benefícios ou informações adicionais visíveis para o aluno no app." />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Como criar um plano:</p>
            <div className="space-y-2">
              <Step n={1}>Acesse a aba <strong className="text-white">COBRANÇAS</strong> no painel de controle.</Step>
              <Step n={2}>Clique no botão <strong className="text-yellow-400">Novo Plano</strong> na seção &ldquo;Planos de Serviço&rdquo;.</Step>
              <Step n={3}>Preencha o nome, valor e tipo de cobrança. Os demais campos são opcionais mas enriquecem a experiência do aluno.</Step>
              <Step n={4}>Clique em <strong className="text-yellow-400">Criar Plano</strong>. O plano aparece imediatamente na lista e já pode ser atribuído a alunos.</Step>
            </div>
            <Tip>Você pode criar quantos planos quiser — por exemplo, um plano mensal básico, um trimestral com desconto e um avulso para sessões individuais.</Tip>
          </div>

          {/* Manage plans mockup */}
          <MockupShell title="COBRANÇAS · LISTA DE PLANOS">
            {[
              { name: 'Mensal Premium', price: 'R$ 250,00', interval: 'Mensal · 30d', students: '3 alunos', active: true },
              { name: 'Trimestral Hipertrofia', price: 'R$ 650,00', interval: 'Trimestral · 90d', students: '1 aluno', active: true },
              { name: 'Sessão Avulsa', price: 'R$ 80,00', interval: 'Avulso · 1d', students: '0 alunos', active: false },
            ].map(p => (
              <div key={p.name} className={`rounded-xl border p-3 mb-2 last:mb-0 ${p.active ? 'bg-neutral-800/50 border-neutral-700' : 'bg-neutral-900/30 border-neutral-800/40 opacity-60'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-white">{p.name}</p>
                      {!p.active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-neutral-700 text-neutral-500 font-bold uppercase">Inativo</span>}
                    </div>
                    <p className="text-[10px] text-yellow-400 font-bold mt-0.5">{p.price} <span className="text-neutral-500 font-normal">· {p.interval} · {p.students}</span></p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <span className="p-1.5 rounded-lg bg-neutral-700 text-neutral-400"><Edit2 size={10} /></span>
                    <span className="p-1.5 rounded-lg bg-neutral-700 text-neutral-400"><PowerOff size={10} /></span>
                  </div>
                </div>
              </div>
            ))}
          </MockupShell>

          <div className="space-y-2">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Gerenciar planos existentes:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { icon: <Edit2 size={13} className="text-blue-400" />, action: 'Editar', desc: 'Altera qualquer campo do plano. Assinaturas existentes não são afetadas.' },
                { icon: <PowerOff size={13} className="text-red-400" />, action: 'Desativar', desc: 'Oculta o plano da lista de atribuição. Assinaturas ativas continuam válidas.' },
                { icon: <Power size={13} className="text-green-400" />, action: 'Reativar', desc: 'Torna o plano disponível novamente para novas atribuições.' },
                { icon: <RefreshCw size={13} className="text-neutral-400" />, action: 'Atualizar', desc: 'Botão de refresh no topo recarrega a lista mais recente do servidor.' },
              ].map(a => (
                <div key={a.action} className="flex gap-3 items-start rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3">
                  <div className="w-8 h-8 rounded-xl bg-neutral-800 flex items-center justify-center flex-shrink-0">{a.icon}</div>
                  <div>
                    <p className="text-xs font-bold text-white">{a.action}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Warn>Não é possível excluir um plano que tenha assinaturas vinculadas. Use <strong>Desativar</strong> para ocultá-lo sem perder o histórico de cobranças.</Warn>
        </section>

        {/* ══════════════════════════════════════════════════════
            5. TIPOS DE COBRANÇA
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[4]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            O <strong className="text-white">Tipo de Cobrança</strong> define a periodicidade e a duração padrão de cada plano. Você pode ajustar a duração manualmente após selecionar o tipo.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                key: 'once', label: 'Avulso', subtitle: 'Pagamento único',
                days: '1–30 dias (personalizável)', icon: <Star size={16} className="text-neutral-400" />,
                usecase: 'Ideal para sessões individuais, avaliações físicas ou pacotes pontuais.',
                color: 'border-neutral-700',
              },
              {
                key: 'monthly', label: 'Mensal', subtitle: 'Renovação mensal',
                days: '30 dias', icon: <Calendar size={16} className="text-blue-400" />,
                usecase: 'O mais comum. Aluno paga todo mês para manter acesso à assessoria.',
                color: 'border-blue-500/25',
              },
              {
                key: 'quarterly', label: 'Trimestral', subtitle: 'Pagamento a cada 3 meses',
                days: '90 dias', icon: <Repeat size={16} className="text-green-400" />,
                usecase: 'Desconto para compromisso de 3 meses. Menos cobrança, mais fidelidade.',
                color: 'border-green-500/25',
              },
              {
                key: 'semiannual', label: 'Semestral', subtitle: 'Pagamento a cada 6 meses',
                days: '180 dias', icon: <Zap size={16} className="text-yellow-400" />,
                usecase: 'Para alunos que preferem pagar menos vezes no ano.',
                color: 'border-yellow-500/25',
              },
              {
                key: 'yearly', label: 'Anual', subtitle: 'Pagamento único anual',
                days: '365 dias', icon: <Crown size={16} className="text-purple-400" />,
                usecase: 'Maior desconto. Ideal para alunos comprometidos de longo prazo.',
                color: 'border-purple-500/25',
              },
            ].map(t => (
              <div key={t.key} className={`rounded-2xl border bg-neutral-900/50 p-4 ${t.color}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-neutral-800 flex items-center justify-center">{t.icon}</div>
                  <div>
                    <p className="text-sm font-black text-white">{t.label}</p>
                    <p className="text-[10px] text-neutral-500">{t.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={10} className="text-neutral-600" />
                  <span className="text-[10px] text-neutral-400 font-medium">{t.days}</span>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">{t.usecase}</p>
              </div>
            ))}
          </div>

          <Tip>
            Ao selecionar um Tipo de Cobrança, o campo <strong>Duração (dias)</strong> é preenchido automaticamente. Você pode sobrescrever esse valor para criar planos personalizados, como um &ldquo;Mensal de 25 dias&rdquo; ou &ldquo;Trimestral de 100 dias&rdquo;.
          </Tip>
        </section>

        {/* ══════════════════════════════════════════════════════
            6. ATRIBUINDO PLANOS AOS ALUNOS
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[5]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            Depois de criar os planos, você os atribui individualmente a cada aluno na seção <strong className="text-white">Assinaturas dos Alunos</strong>, dentro da aba COBRANÇAS.
          </p>

          <MockupShell title="COBRANÇAS · ASSINATURAS DOS ALUNOS">
            {[
              { name: 'Ana Souza', status: null },
              { name: 'Bruno Lima', status: { label: 'Ativo', cls: 'text-green-400 bg-green-500/10 border-green-500/20', plan: 'Mensal Premium', expires: 'até 09/05/2026' } },
              { name: 'Carlos Mendes', status: { label: 'Pendente', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', plan: 'Mensal Premium', expires: '' } },
            ].map(row => (
              <div key={row.name} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 mb-2 last:mb-0">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-white">{row.name}</p>
                    {row.status ? (
                      <div className="flex items-center gap-2 mt-1">
                        <MockupBadge color={row.status.cls}>{row.status.label}</MockupBadge>
                        <span className="text-[10px] text-neutral-500">{row.status.plan} {row.status.expires && `· ${row.status.expires}`}</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-neutral-600 mt-0.5">Sem plano</p>
                    )}
                  </div>
                  <MockupBtn>
                    <CreditCard size={10} /> {row.status ? 'Trocar' : 'Atribuir'} <ChevronRight size={10} />
                  </MockupBtn>
                </div>
              </div>
            ))}
          </MockupShell>

          <div className="space-y-2">
            <div className="space-y-2">
              <Step n={1}>Role até a seção <strong className="text-white">&ldquo;Assinaturas dos Alunos&rdquo;</strong> na aba COBRANÇAS.</Step>
              <Step n={2}>Localize o aluno desejado. Se ele ainda não tem plano, aparece &ldquo;Sem plano&rdquo; abaixo do nome.</Step>
              <Step n={3}>Clique em <strong className="text-yellow-400">Atribuir</strong> (ou <strong className="text-yellow-400">Trocar</strong> para substituir o plano atual).</Step>
              <Step n={4}>Um dropdown expande mostrando todos os planos ativos. Selecione o plano desejado.</Step>
              <Step n={5}>A assinatura é criada com status <strong className="text-yellow-400">Pendente</strong> — aguardando o pagamento do aluno.</Step>
            </div>
            <Tip>Após a atribuição, o aluno receberá uma notificação no app informando que há um pagamento pendente, com a opção de pagar via PIX.</Tip>
          </div>

          {/* Status transition diagram */}
          <div className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4">
            <p className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-3">Ciclo de vida de uma assinatura:</p>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'Pendente', cls: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' },
                { arrow: true },
                { label: 'Ativo', cls: 'bg-green-500/10 border-green-500/30 text-green-400' },
                { arrow: true },
                { label: 'Em atraso', cls: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
                { arrow: true },
                { label: 'Expirado', cls: 'bg-red-500/10 border-red-500/30 text-red-400' },
              ].map((item, i) => (
                item.arrow
                  ? <ChevronRight key={i} size={14} className="text-neutral-600 flex-shrink-0" />
                  : <span key={i} className={`px-3 py-1.5 rounded-full text-[10px] font-bold border ${item.cls}`}>{item.label}</span>
              ))}
            </div>
            <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
              <strong className="text-yellow-400">Pendente</strong> → aguardando PIX · <strong className="text-green-400">Ativo</strong> → pago e dentro do prazo · <strong className="text-orange-400">Em atraso</strong> → prazo passado sem renovação · <strong className="text-red-400">Expirado</strong> → encerrado definitivamente
            </p>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            7. PAGAMENTO VIA PIX
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[6]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            Todo pagamento no IronTracks é realizado via <strong className="text-white">PIX instantâneo</strong> — seguro, sem taxas para o aluno e com confirmação automática. Quando um aluno paga, a assinatura é ativada automaticamente.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Teacher perspective */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-neutral-300 uppercase tracking-widest">Do lado do Professor:</p>
              <div className="space-y-2">
                {[
                  'Você cria um plano com o valor desejado.',
                  'Atribui o plano ao aluno (status: Pendente).',
                  'O aluno abre o app e vê o card de pagamento.',
                  'Após o pagamento PIX, a assinatura muda para Ativo automaticamente.',
                  'Você não precisa confirmar nada manualmente.',
                ].map((step, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <CheckCircle2 size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-neutral-400">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Student perspective */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-neutral-300 uppercase tracking-widest">Do lado do Aluno:</p>
              <MockupShell title="APP DO ALUNO · CARD DE PAGAMENTO">
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard size={14} className="text-yellow-400" />
                    <span className="text-xs font-bold text-white">Mensal Premium</span>
                    <MockupBadge color="text-yellow-400 bg-yellow-500/10 border-yellow-500/20"><Clock size={9}/> Pendente</MockupBadge>
                  </div>
                  <p className="text-[10px] text-neutral-500">Prof. Rafael · R$ 250,00 Mensal</p>
                </div>
                <MockupBtn yellow><QrCode size={10} /> Pagar via PIX</MockupBtn>
              </MockupShell>
            </div>
          </div>

          {/* PIX flow */}
          <MockupShell title="APP DO ALUNO · FLUXO DE PAGAMENTO PIX">
            <div className="grid grid-cols-3 gap-3">
              {/* Step 1: Form */}
              <div className="space-y-2">
                <p className="text-[9px] text-neutral-500 uppercase tracking-widest text-center font-bold">1 · Dados</p>
                <div className="rounded-xl bg-neutral-800/60 border border-neutral-700/40 p-2 space-y-1.5">
                  <div className="bg-neutral-700/50 rounded-lg px-2 py-1.5 text-[9px] text-neutral-400">Nome completo</div>
                  <div className="bg-neutral-700/50 rounded-lg px-2 py-1.5 text-[9px] text-neutral-400">CPF *</div>
                  <div className="bg-neutral-700/50 rounded-lg px-2 py-1.5 text-[9px] text-neutral-400">Celular + DDD *</div>
                  <div className="bg-yellow-500 rounded-lg px-2 py-1.5 text-[9px] font-bold text-black text-center">Gerar PIX</div>
                </div>
              </div>
              {/* Step 2: QR Code */}
              <div className="space-y-2">
                <p className="text-[9px] text-neutral-500 uppercase tracking-widest text-center font-bold">2 · QR Code</p>
                <div className="rounded-xl bg-neutral-800/60 border border-neutral-700/40 p-2 flex flex-col items-center gap-1.5">
                  <div className="bg-white rounded-lg p-1.5 w-16 h-16 grid grid-cols-4 gap-0.5">
                    {[1,0,1,1,0,1,0,1,1,0,1,0,0,1,1,0].map((v,i) => (
                      <div key={i} className={`rounded-[1px] ${v ? 'bg-black' : 'bg-white'}`} />
                    ))}
                  </div>
                  <div className="bg-neutral-700/50 rounded-lg px-2 py-1 text-[9px] text-neutral-400 text-center w-full">Copiar código</div>
                </div>
              </div>
              {/* Step 3: Confirmed */}
              <div className="space-y-2">
                <p className="text-[9px] text-neutral-500 uppercase tracking-widest text-center font-bold">3 · Confirmado</p>
                <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-2 flex flex-col items-center gap-2">
                  <CheckCircle2 size={24} className="text-green-400 mt-2" />
                  <p className="text-[9px] text-green-300 text-center font-bold">Pagamento confirmado!</p>
                  <MockupBadge color="text-green-400 bg-green-500/10 border-green-500/20"><CheckCircle2 size={8}/> Ativo</MockupBadge>
                </div>
              </div>
            </div>
          </MockupShell>

          <div className="space-y-2">
            <Step n={1}>O aluno abre o app e vê o card <strong className="text-white">&ldquo;Mensal Premium · Pendente&rdquo;</strong> no dashboard.</Step>
            <Step n={2}>Ele clica em <strong className="text-yellow-400">Pagar via PIX</strong>, informa nome, CPF e celular.</Step>
            <Step n={3}>Um QR Code é gerado instantaneamente via MercadoPago. O aluno escaneia no app do banco ou copia o código.</Step>
            <Step n={4}>Após o pagamento, o IronTracks recebe a confirmação em segundos e ativa automaticamente a assinatura.</Step>
            <Step n={5}>O aluno vê o status mudar para <strong className="text-green-400">Ativo</strong> com a data de vencimento calculada.</Step>
          </div>

          <Tip>O QR Code PIX expira em 1 dia. Se o aluno não pagar nesse prazo, ele pode gerar um novo clicando no botão novamente — a cobrança anterior é descartada.</Tip>
        </section>

        {/* ══════════════════════════════════════════════════════
            8. ACOMPANHAR ASSINATURAS
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[7]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            Na seção <strong className="text-white">Assinaturas dos Alunos</strong>, você acompanha em tempo real o status de pagamento de cada aluno, quando vence a assinatura e quando foi o último pagamento.
          </p>

          <MockupShell title="COBRANÇAS · STATUS DETALHADO">
            {[
              {
                name: 'Ana Souza',
                badge: { label: 'Ativo', cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
                plan: 'Mensal Premium', start: '10/04/2026', expires: '10/05/2026',
              },
              {
                name: 'Bruno Lima',
                badge: { label: 'Em atraso', cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
                plan: 'Trimestral', start: '10/01/2026', expires: '10/04/2026',
              },
              {
                name: 'Carlos Mendes',
                badge: { label: 'Pendente', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
                plan: 'Mensal Premium', start: '—', expires: '—',
              },
            ].map(row => (
              <div key={row.name} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 mb-2 last:mb-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-white">{row.name}</p>
                  <MockupBadge color={row.badge.cls}>{row.badge.label}</MockupBadge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div><p className="text-neutral-600">Plano</p><p className="text-neutral-300 font-medium">{row.plan}</p></div>
                  <div><p className="text-neutral-600">Início</p><p className="text-neutral-300 font-medium">{row.start}</p></div>
                  <div><p className="text-neutral-600">Venc.</p><p className="text-neutral-300 font-medium">{row.expires}</p></div>
                </div>
              </div>
            ))}
          </MockupShell>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                status: 'Ativo',
                cls: 'text-green-400',
                icon: <CheckCircle2 size={16} className="text-green-400" />,
                desc: 'Assinatura paga e dentro do prazo. O aluno tem acesso total ao serviço.',
                action: 'Nenhuma ação necessária.',
              },
              {
                status: 'Pendente',
                cls: 'text-yellow-400',
                icon: <Clock size={16} className="text-yellow-400" />,
                desc: 'Plano atribuído mas ainda não pago. O aluno vê o card de pagamento no app.',
                action: 'Aguardar pagamento ou entrar em contato com o aluno.',
              },
              {
                status: 'Em atraso',
                cls: 'text-orange-400',
                icon: <AlertCircle size={16} className="text-orange-400" />,
                desc: 'A assinatura expirou e o aluno ainda não renovou. O acesso pode ser limitado.',
                action: 'Contatar o aluno para renovação.',
              },
              {
                status: 'Expirado / Cancelado',
                cls: 'text-red-400',
                icon: <Shield size={16} className="text-red-400" />,
                desc: 'Assinatura encerrada definitivamente. Para reativar, atribua um novo plano.',
                action: 'Atribuir um novo plano se houver interesse em continuar.',
              },
            ].map(s => (
              <div key={s.status} className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  {s.icon}
                  <p className={`text-sm font-black ${s.cls}`}>{s.status}</p>
                </div>
                <p className="text-xs text-neutral-400 mb-2">{s.desc}</p>
                <div className="flex gap-1.5 items-center">
                  <ArrowRight size={10} className="text-neutral-600 flex-shrink-0" />
                  <p className="text-xs text-neutral-500 italic">{s.action}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            9. SEU PLANO NA PLATAFORMA
        ══════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionTitle {...SECTIONS[8]} />
          <p className="text-sm text-neutral-400 leading-relaxed">
            Para usar o IronTracks como professor, você assina um plano na plataforma que determina quantos alunos você pode gerenciar simultaneamente. O pagamento também é via PIX e o upgrade é instantâneo.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { tier: 'Free',      students: '2 alunos',   price: 'Grátis',     color: 'border-neutral-700', badge: 'bg-neutral-800 text-neutral-300', desc: 'Para experimentar a plataforma.' },
              { tier: 'Starter',   students: '15 alunos',  price: 'R$ 49/mês',  color: 'border-blue-500/30', badge: 'bg-blue-500/15 text-blue-400', desc: 'Para coaches iniciantes.' },
              { tier: 'Pro',       students: '40 alunos',  price: 'R$ 97/mês',  color: 'border-yellow-500/30', badge: 'bg-yellow-500/15 text-yellow-400 font-black', desc: 'O plano mais popular.' },
              { tier: 'Elite',     students: '100 alunos', price: 'R$ 179/mês', color: 'border-purple-500/30', badge: 'bg-purple-500/15 text-purple-400', desc: 'Para academia ou equipe.' },
              { tier: 'Unlimited', students: 'Ilimitado',  price: 'R$ 249/mês', color: 'border-amber-500/30', badge: 'bg-amber-500/15 text-amber-400', desc: 'Sem limites de alunos.' },
            ].map(p => (
              <div key={p.tier} className={`rounded-2xl border bg-neutral-900/50 p-4 ${p.color}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-black px-3 py-1 rounded-full ${p.badge}`}>{p.tier}</span>
                  <span className="text-sm font-black text-white">{p.price}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <Users size={12} className="text-neutral-400" />
                  <span className="text-sm font-bold text-neutral-200">{p.students}</span>
                </div>
                <p className="text-xs text-neutral-500">{p.desc}</p>
              </div>
            ))}
          </div>

          {/* Upgrade flow mockup */}
          <MockupShell title="CABEÇALHO DO APP · BADGE DE PLANO">
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 flex items-center gap-2">
                <div className="text-left">
                  <p className="text-[9px] text-neutral-500 uppercase tracking-widest">Pro</p>
                  <p className="text-xs font-bold text-white">7 / 40 alunos</p>
                  <div className="w-20 h-1 rounded-full bg-neutral-700 mt-1">
                    <div className="w-[17%] h-full rounded-full bg-green-500" />
                  </div>
                </div>
              </div>
              <div className="text-center text-[10px] text-neutral-600">→ limite 80%+</div>
              <div className="rounded-xl bg-neutral-800 border border-yellow-500/30 px-3 py-2 flex items-center gap-2">
                <div className="text-left">
                  <p className="text-[9px] text-neutral-500 uppercase tracking-widest">Pro</p>
                  <p className="text-xs font-bold text-white">33 / 40 alunos</p>
                  <div className="w-20 h-1 rounded-full bg-neutral-700 mt-1">
                    <div className="w-[82%] h-full rounded-full bg-yellow-500" />
                  </div>
                </div>
                <MockupBtn yellow>↑ Upgrade</MockupBtn>
              </div>
            </div>
          </MockupShell>

          <div className="space-y-2">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Como fazer upgrade:</p>
            <div className="space-y-2">
              <Step n={1}>Clique no badge do seu plano no cabeçalho do app, ou no botão <strong className="text-yellow-400">Upgrade</strong> que aparece quando você está próximo do limite.</Step>
              <Step n={2}>Na janela de upgrade, compare os planos e clique no que deseja assinar.</Step>
              <Step n={3}>Informe seu nome e CPF para gerar o PIX.</Step>
              <Step n={4}>Pague o QR Code. O upgrade é ativado automaticamente em segundos.</Step>
            </div>
            <Warn>Se você atingir o limite do seu plano, não será possível adicionar novos alunos até fazer upgrade. Os alunos existentes não são afetados.</Warn>
          </div>

          {/* Final summary */}
          <div className="rounded-3xl bg-gradient-to-br from-yellow-500/10 to-amber-600/5 border border-yellow-500/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Star size={16} className="text-yellow-400" />
              <p className="text-sm font-black text-white">Resumo Rápido</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { icon: <Users size={13} className="text-blue-400" />, text: 'Gerencie alunos na aba ALUNOS' },
                { icon: <Dumbbell size={13} className="text-green-400" />, text: 'Crie treinos na aba TREINOS' },
                { icon: <CreditCard size={13} className="text-purple-400" />, text: 'Crie planos de cobrança em COBRANÇAS' },
                { icon: <ArrowRight size={13} className="text-cyan-400" />, text: 'Atribua planos aos alunos' },
                { icon: <QrCode size={13} className="text-green-400" />, text: 'Aluno paga via PIX automaticamente' },
                { icon: <CheckCircle2 size={13} className="text-teal-400" />, text: 'Assinatura ativa em segundos após PIX' },
                { icon: <AlertCircle size={13} className="text-yellow-400" />, text: 'Acompanhe atrasos em COBRANÇAS' },
                { icon: <Crown size={13} className="text-yellow-400" />, text: 'Faça upgrade para mais alunos' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  {item.icon}
                  <p className="text-xs text-neutral-300">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
