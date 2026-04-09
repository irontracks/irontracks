import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'IronTracks para Professores — Gerencie, Cobre e Evolua seus Alunos',
  description:
    'A plataforma completa para personal trainers: prescrição de treinos, acompanhamento em tempo real, cobranças automáticas e muito mais.',
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const MockCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl ${className}`}
  >
    {/* Fake top bar */}
    <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-neutral-800/80 bg-neutral-950/50">
      <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
      <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
      <div className="ml-3 flex-1 h-4 bg-neutral-800 rounded-md" />
    </div>
    {children}
  </div>
)

const Tag = ({ children, color = 'yellow' }: { children: React.ReactNode; color?: string }) => {
  const cls =
    color === 'green'
      ? 'bg-green-500/15 text-green-400 border-green-500/30'
      : color === 'blue'
      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
      : color === 'violet'
      ? 'bg-violet-500/15 text-violet-400 border-violet-500/30'
      : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${cls}`}>
      {children}
    </span>
  )
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="w-1 h-6 rounded-full bg-yellow-500" />
    <span className="text-[11px] font-black uppercase tracking-[0.3em] text-yellow-500/80">{children}</span>
  </div>
)

// ─── Mockup: Dashboard ────────────────────────────────────────────────────────

const DashboardMockup = () => (
  <MockCard>
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Painel de Controle</p>
          <p className="text-lg font-black text-white">Visão Geral</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-yellow-500 flex items-center justify-center text-black font-black text-sm">
          IT
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[['28', 'Alunos'], ['6', 'Ativos Hoje'], ['R$4.2k', 'Receita/mês']].map(([v, l]) => (
          <div key={l} className="bg-neutral-800/60 rounded-xl p-3 border border-neutral-700/50">
            <p className="text-base font-black text-white">{v}</p>
            <p className="text-[9px] text-neutral-500 uppercase tracking-wide mt-0.5">{l}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { name: 'Lucas Alves', status: 'pago', last: 'Ontem' },
          { name: 'Marina Costa', status: 'atrasado', last: '3 dias' },
          { name: 'Pedro Lima', status: 'pago', last: 'Hoje' },
        ].map((s) => (
          <div key={s.name} className="flex items-center gap-3 px-3 py-2 bg-neutral-800/40 rounded-xl">
            <div className="w-8 h-8 rounded-xl bg-neutral-700 flex items-center justify-center text-xs font-black text-white">
              {s.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{s.name}</p>
              <p className="text-[9px] text-neutral-500">Último treino: {s.last}</p>
            </div>
            <span
              className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                s.status === 'pago'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  </MockCard>
)

// ─── Mockup: Workout Builder ──────────────────────────────────────────────────

const WorkoutBuilderMockup = () => (
  <MockCard>
    <div className="p-5 space-y-3">
      <div>
        <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Editor de Treino</p>
        <p className="text-base font-black text-white">Treino A — Peito & Tríceps</p>
      </div>
      {[
        { name: 'Supino Reto', sets: '4', reps: '8-10', rpe: '8', method: 'Normal' },
        { name: 'Crucifixo Inclinado', sets: '3', reps: '12', rpe: '7', method: 'Drop' },
        { name: 'Tríceps Pulley', sets: '4', reps: '12', rpe: '8', method: 'Bi-Set' },
      ].map((ex) => (
        <div key={ex.name} className="bg-neutral-800/60 rounded-xl p-3 border border-neutral-700/40">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-white">{ex.name}</p>
            <span className="text-[9px] px-2 py-0.5 bg-yellow-500/15 text-yellow-400 rounded-full font-bold">
              {ex.method}
            </span>
          </div>
          <div className="flex gap-4 mt-1.5">
            {[['Séries', ex.sets], ['Reps', ex.reps], ['RPE', ex.rpe]].map(([l, v]) => (
              <div key={l}>
                <p className="text-[8px] text-neutral-600 uppercase">{l}</p>
                <p className="text-xs font-black text-neutral-200">{v}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <button className="w-full py-2.5 rounded-xl bg-yellow-500 text-black font-black text-xs">
        + Adicionar Exercício
      </button>
    </div>
  </MockCard>
)

// ─── Mockup: Live Mirror ──────────────────────────────────────────────────────

const LiveMirrorMockup = () => (
  <MockCard>
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-widest text-green-400">Ao Vivo</span>
        <span className="ml-auto text-xs font-black text-neutral-400 tabular-nums">32:14</span>
      </div>
      <div>
        <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Lucas Alves — Treino A</p>
        <p className="text-lg font-black text-white">Supino Reto</p>
        <p className="text-[10px] text-neutral-500 mt-0.5">Exercício 2 / 6</p>
      </div>
      <div className="space-y-1.5">
        {[
          { s: 'AQ', kg: '40', reps: '12', rpe: '5', done: true },
          { s: 'S1', kg: '80', reps: '10', rpe: '8', done: true },
          { s: 'S2', kg: '80', reps: '9', rpe: '9', done: true },
          { s: 'S3', kg: '77.5', reps: '—', rpe: '—', done: false },
          { s: 'S4', kg: '—', reps: '—', rpe: '—', done: false },
        ].map((row) => (
          <div
            key={row.s}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${
              row.done
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-neutral-800/40 border-neutral-700/40'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${row.done ? 'bg-green-400' : 'bg-neutral-600'}`} />
            <span className="text-[10px] font-black text-neutral-500 w-6">{row.s}</span>
            <span className="text-xs font-black text-white flex-1">{row.kg} kg × {row.reps}</span>
            <span className={`text-[10px] font-bold ${row.done ? 'text-yellow-400' : 'text-neutral-600'}`}>
              RPE {row.rpe}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <div className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-[10px] text-neutral-400">
          🔥 Volume: 1.580 kg
        </div>
        <div className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-[10px] text-neutral-400">
          ⏱ Rest: 2:30
        </div>
      </div>
    </div>
  </MockCard>
)

// ─── Mockup: Billing ──────────────────────────────────────────────────────────

const BillingMockup = () => (
  <MockCard>
    <div className="p-5 space-y-3">
      <div>
        <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Cobranças</p>
        <p className="text-base font-black text-white">Plano Mensal Premium</p>
        <p className="text-xs text-neutral-400 mt-0.5">R$ 197,00 · Mensal · 3× treinos/sem</p>
      </div>
      <div className="space-y-2">
        {[
          { name: 'Lucas Alves', status: 'pago', valor: 'R$197', venc: '10/Mai' },
          { name: 'Marina Costa', status: 'vencido', valor: 'R$197', venc: '01/Mai' },
          { name: 'Pedro Lima', status: 'pendente', valor: 'R$149', venc: '15/Mai' },
        ].map((r) => (
          <div key={r.name} className="flex items-center gap-3 px-3 py-2 bg-neutral-800/40 rounded-xl">
            <div className="w-7 h-7 rounded-xl bg-neutral-700 flex items-center justify-center text-[10px] font-black text-white">
              {r.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{r.name}</p>
              <p className="text-[9px] text-neutral-500">{r.valor} · Vence {r.venc}</p>
            </div>
            <span
              className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                r.status === 'pago'
                  ? 'bg-green-500/20 text-green-400'
                  : r.status === 'vencido'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
      <button className="w-full py-2 rounded-xl bg-yellow-500 text-black font-black text-[10px]">
        💳 Gerar Cobrança PIX
      </button>
    </div>
  </MockCard>
)

// ─── Mockup: Assessment ───────────────────────────────────────────────────────

const AssessmentMockup = () => (
  <MockCard>
    <div className="p-5 space-y-3">
      <div>
        <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Avaliação Física</p>
        <p className="text-base font-black text-white">Lucas Alves</p>
        <p className="text-[10px] text-neutral-500 mt-0.5">09/Abr/2026 · Dobras 7 pontos</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Gordura Corporal', value: '14.2%', color: 'text-green-400' },
          { label: 'Massa Magra', value: '71.3 kg', color: 'text-blue-400' },
          { label: 'Massa Gorda', value: '11.8 kg', color: 'text-yellow-400' },
          { label: 'TMB', value: '1.840 kcal', color: 'text-violet-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-neutral-800/60 rounded-xl p-3 border border-neutral-700/40">
            <p className={`text-sm font-black ${color}`}>{value}</p>
            <p className="text-[9px] text-neutral-500 mt-0.5 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1.5">Circunferências (cm)</p>
        <div className="flex flex-wrap gap-1.5">
          {[['Peito', '98'], ['Cintura', '79'], ['Quadril', '96'], ['Braço', '38']].map(([p, v]) => (
            <div key={p} className="bg-neutral-800/50 rounded-lg px-2 py-1 text-[9px]">
              <span className="text-neutral-500">{p}: </span>
              <span className="font-black text-white">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </MockCard>
)

// ─── Pricing ──────────────────────────────────────────────────────────────────

const plans = [
  { id: 'free', name: 'Free', price: 0, students: 2, highlight: false, tag: '' },
  { id: 'starter', name: 'Starter', price: 49, students: 15, highlight: false, tag: '' },
  { id: 'pro', name: 'Pro', price: 97, students: 40, highlight: true, tag: 'Mais Popular' },
  { id: 'elite', name: 'Elite', price: 179, students: 100, highlight: false, tag: '' },
  { id: 'unlimited', name: 'Unlimited', price: 249, students: 0, highlight: false, tag: 'Academias' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParaProfessoresPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ── Sticky nav ──────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <span className="text-black font-black text-sm">IT</span>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-yellow-500/80">IronTracks</p>
              <p className="text-sm font-black text-white leading-none">para Professores</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden sm:inline-flex px-4 py-2 rounded-xl border border-neutral-700 text-sm text-neutral-300 hover:border-neutral-600 hover:text-white transition-colors font-bold"
            >
              Entrar
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-black transition-colors shadow-lg shadow-yellow-500/20"
            >
              Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-yellow-500/5 rounded-full blur-3xl" />
          <div className="absolute top-20 right-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 pt-20 pb-16 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-400">
                Plataforma para Personal Trainers
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-black text-white leading-[1.05] tracking-tight mb-6">
              Seu negócio de{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">
                personal trainer
              </span>{' '}
              no próximo nível.
            </h1>

            <p className="text-lg text-neutral-400 max-w-2xl leading-relaxed mb-8">
              Prescreva treinos, acompanhe seus alunos em tempo real, cobre com PIX automático
              e veja a evolução de cada um — tudo em uma única plataforma profissional.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="px-6 py-3.5 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm transition-all shadow-2xl shadow-yellow-500/30 active:scale-95"
              >
                Começar Grátis →
              </Link>
              <a
                href="#funcionalidades"
                className="px-6 py-3.5 rounded-2xl bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 text-white font-black text-sm transition-all active:scale-95"
              >
                Ver Funcionalidades
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-6 mt-8 pt-8 border-t border-neutral-800/60">
              {[
                ['✓', 'Grátis para começar'],
                ['✓', 'Sem cartão de crédito'],
                ['✓', 'Suporte via WhatsApp'],
              ].map(([icon, text]) => (
                <div key={text} className="flex items-center gap-2 text-sm text-neutral-500">
                  <span className="text-green-400 font-black">{icon}</span>
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <section className="border-y border-neutral-800 bg-neutral-900/40">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: '2.000+', label: 'Treinos prescritos' },
              { value: '95%', label: 'Retenção de alunos' },
              { value: 'R$0', label: 'Taxa por cobrança PIX' },
              { value: '5 min', label: 'Para cadastrar um aluno' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-black text-yellow-400">{value}</p>
                <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="funcionalidades" className="max-w-6xl mx-auto px-4 md:px-8 py-20 space-y-28">

        {/* 1. Dashboard */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionLabel>Dashboard</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-4">
              Todos os seus alunos. Uma visão. Zero caos.
            </h2>
            <p className="text-neutral-400 leading-relaxed mb-6">
              Veja em tempo real quem treinou hoje, quem está inadimplente e qual é a
              sua receita mensal. O painel inteligente destaca quem precisa de atenção
              para que você nunca perca um aluno por desatenção.
            </p>
            <div className="flex flex-wrap gap-2">
              <Tag>Receita Mensal</Tag>
              <Tag>Status de Pagamento</Tag>
              <Tag>Atividade Recente</Tag>
              <Tag color="green">Prioridades IA</Tag>
            </div>
          </div>
          <DashboardMockup />
        </div>

        {/* 2. Workout Builder */}
        <div className="grid md:grid-cols-2 gap-12 items-center md:[&>*:first-child]:order-2">
          <div>
            <SectionLabel>Prescrição de Treinos</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-4">
              Crie treinos profissionais em minutos, não em horas.
            </h2>
            <p className="text-neutral-400 leading-relaxed mb-6">
              Editor completo com séries, repetições, RPE, cadência, tempo de descanso
              e métodos avançados (Bi-Set, Drop-Set, Super-Set e mais). Salve templates
              e aplique o mesmo treino a múltiplos alunos com um clique.
            </p>
            <div className="flex flex-wrap gap-2">
              <Tag>RPE por Série</Tag>
              <Tag>Métodos Avançados</Tag>
              <Tag>Templates Reutilizáveis</Tag>
              <Tag color="blue">Biblioteca de Exercícios</Tag>
            </div>
          </div>
          <WorkoutBuilderMockup />
        </div>

        {/* 3. Live Mirror — DESTAQUE */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-transparent to-transparent rounded-3xl" />
          <div className="relative grid md:grid-cols-2 gap-12 items-center bg-neutral-900/30 border border-yellow-500/15 rounded-3xl p-8 md:p-12">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 mb-5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-400">
                  Novo — Exclusivo IronTracks
                </span>
              </div>
              <SectionLabel>Espelhamento de Treino</SectionLabel>
              <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-4">
                Acompanhe o treino do aluno em tempo real, de qualquer lugar.
              </h2>
              <p className="text-neutral-400 leading-relaxed mb-6">
                Enquanto seu aluno treina, você vê cada série executada: peso, repetições,
                RPE, exercício atual e cronômetro de descanso — tudo sincronizado ao vivo
                no seu celular. Intervenha na hora certa, antes que a forma quebre.
              </p>
              <ul className="space-y-2 mb-6">
                {[
                  'Peso e reps de cada série em tempo real',
                  'RPE automaticamente calculado pelo aluno',
                  'Exercício atual e progresso do treino',
                  'Volume total acumulado na sessão',
                  'Funciona mesmo quando você não está presente',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-neutral-300">
                    <span className="text-yellow-400 font-black mt-0.5">→</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Tag color="green">Ao Vivo</Tag>
                <Tag>Supabase Realtime</Tag>
                <Tag color="violet">Sem delay</Tag>
              </div>
            </div>
            <LiveMirrorMockup />
          </div>
        </div>

        {/* 4. Billing */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionLabel>Cobranças & Financeiro</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-4">
              Chega de cobrar aluno por WhatsApp. Automatize tudo.
            </h2>
            <p className="text-neutral-400 leading-relaxed mb-6">
              Crie planos de serviço personalizados com o valor que você cobra, a
              frequência (mensal, trimestral, anual), os dias de treino e gere o QR Code
              PIX na hora. O aluno paga direto no app — sem intermediários.
            </p>
            <div className="space-y-3">
              {[
                { icon: '💳', title: 'PIX sem taxa', desc: 'Você recebe 100% do valor. Sem taxas de plataforma.' },
                { icon: '📆', title: 'Planos flexíveis', desc: 'Avulso, mensal, trimestral, semestral ou anual.' },
                { icon: '🔔', title: 'Status em tempo real', desc: 'Saiba quem pagou, quem está atrasado e quem cancelou.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 p-3 bg-neutral-900/50 rounded-xl border border-neutral-800">
                  <span className="text-xl mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm font-bold text-white">{title}</p>
                    <p className="text-xs text-neutral-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <BillingMockup />
        </div>

        {/* 5. Assessments */}
        <div className="grid md:grid-cols-2 gap-12 items-center md:[&>*:first-child]:order-2">
          <div>
            <SectionLabel>Avaliação Física</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-4">
              Avaliações completas que provam a evolução do seu aluno.
            </h2>
            <p className="text-neutral-400 leading-relaxed mb-6">
              Registre e compare avaliações físicas completas: protocolo de dobras cutâneas
              em 7 pontos, 12 circunferências, composição corporal, TMB e TDEE calculados
              automaticamente. Mostre resultados concretos e justifique cada centavo do
              seu serviço.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Dobras Cutâneas', '7 pontos (Jackson & Pollock)'],
                ['Circunferências', '12 pontos corporais'],
                ['% Gordura', 'Cálculo automático'],
                ['Massa Magra', 'Evolução histórica'],
                ['TMB & TDEE', 'Necessidade calórica'],
                ['Comparativo', 'Antes × Depois'],
              ].map(([title, desc]) => (
                <div key={title} className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800">
                  <p className="text-xs font-black text-white">{title}</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
          <AssessmentMockup />
        </div>

        {/* 6. More features grid */}
        <div>
          <div className="text-center mb-10">
            <SectionLabel>Mais Funcionalidades</SectionLabel>
            <h2 className="text-3xl font-black text-white">Tudo que um personal trainer precisa.</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: '💬',
                title: 'Chat com Alunos',
                desc: 'Conversa direta dentro do app. Envie feedback, fotos de exercícios e motivação sem sair da plataforma.',
              },
              {
                icon: '🎥',
                title: 'Vídeos de Execução',
                desc: 'Alunos enviam vídeos das execuções para correção. Você revisa e dá feedback com marcação precisa.',
              },
              {
                icon: '📊',
                title: 'Evolução Detalhada',
                desc: 'Gráficos de carga, volume e frequência para cada exercício. Mostre ao aluno o progresso real.',
              },
              {
                icon: '🎯',
                title: 'Prioridades Inteligentes',
                desc: 'IA identifica alunos que precisam de atenção: longa ausência, pagamento atrasado ou estagnação.',
              },
              {
                icon: '📋',
                title: 'Templates de Treino',
                desc: 'Crie uma biblioteca de treinos-base e aplique para novos alunos em segundos, sem recriar do zero.',
              },
              {
                icon: '✅',
                title: 'Check-ins Diários',
                desc: 'Alunos registram energia, disposição e sensação muscular antes de treinar. Você vê tudo no painel.',
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-colors"
              >
                <div className="text-2xl mb-3">{icon}</div>
                <h3 className="text-sm font-black text-white mb-1.5">{title}</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section className="border-t border-neutral-800 bg-neutral-900/20">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-20">
          <div className="text-center mb-12">
            <SectionLabel>Planos</SectionLabel>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">
              Comece de graça. Cresça sem limites.
            </h2>
            <p className="text-neutral-400 max-w-lg mx-auto">
              Escolha o plano que combina com a sua carteira de alunos. Upgrade ou downgrade a qualquer momento.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border flex flex-col ${
                  plan.tag ? 'pt-8 px-5 pb-5' : 'p-5'
                } ${
                  plan.highlight
                    ? 'bg-gradient-to-b from-yellow-500/15 to-amber-500/5 border-yellow-500/40 shadow-[0_0_40px_rgba(234,179,8,0.15)]'
                    : 'bg-neutral-900/50 border-neutral-800'
                }`}
              >
                {plan.tag && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="px-3 py-1 rounded-full bg-yellow-500 text-black text-[10px] font-black uppercase tracking-wide shadow-lg">
                      {plan.tag}
                    </span>
                  </div>
                )}
                <div className="mb-4">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">{plan.name}</p>
                  <div className="flex items-end gap-1 mt-2">
                    {plan.price === 0 ? (
                      <span className="text-2xl font-black text-white">Grátis</span>
                    ) : (
                      <>
                        <span className="text-xs text-neutral-500 mb-1">R$</span>
                        <span className="text-2xl font-black text-white">{plan.price}</span>
                        <span className="text-xs text-neutral-500 mb-1">/mês</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    {plan.students === 0 ? 'Alunos ilimitados' : `Até ${plan.students} alunos`}
                  </p>
                </div>
                <Link
                  href="/login"
                  className={`mt-auto w-full py-2.5 rounded-xl font-black text-xs text-center transition-all ${
                    plan.highlight
                      ? 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg shadow-yellow-500/20'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
                  }`}
                >
                  {plan.price === 0 ? 'Começar Grátis' : 'Assinar Agora'}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-neutral-600 mt-6">
            Todos os planos incluem suporte, treinos ilimitados e atualizações gratuitas.
          </p>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="border-t border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-24 text-center">
          <div className="w-16 h-16 rounded-3xl bg-yellow-500 mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-yellow-500/30">
            <span className="text-black font-black text-xl">IT</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-4 leading-tight">
            Transforme sua prática em{' '}
            <span className="text-yellow-400">negócio profissional</span>.
          </h2>
          <p className="text-neutral-400 text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            Mais de 2.000 treinos prescritos. Personal trainers que usam IronTracks retêm
            95% dos seus alunos. Junte-se agora — é grátis para começar.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-base transition-all shadow-2xl shadow-yellow-500/30 active:scale-95"
          >
            Criar minha conta grátis →
          </Link>
          <p className="text-xs text-neutral-600 mt-4">
            Sem cartão de crédito. Sem burocracia. Começe em 5 minutos.
          </p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-800 bg-neutral-950">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-yellow-500 flex items-center justify-center">
              <span className="text-black font-black text-[10px]">IT</span>
            </div>
            <span className="text-sm font-black text-neutral-300">IronTracks</span>
          </div>
          <p className="text-xs text-neutral-600">
            © {new Date().getFullYear()} IronTracks. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs text-neutral-500 hover:text-white transition-colors">
              Entrar
            </Link>
            <Link href="/para-professores" className="text-xs text-neutral-500 hover:text-white transition-colors">
              Para Professores
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
