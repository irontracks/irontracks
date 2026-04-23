import Image from 'next/image'
import Link from 'next/link'
import {
  Dumbbell, Zap, BarChart3, MapPin, ChefHat, Users,
  Crown, Star, Globe, Check, ArrowRight, Flame,
  Trophy, Target, Smartphone, Activity, Camera,
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'IronTracks — O app de treino que funciona de verdade',
  description: 'Treinos avançados, Coach IA, Cardio GPS, Diário Nutricional e comunidade. Gratuito para iOS, Android e Web.',
  openGraph: {
    title: 'IronTracks — Alta Performance. Resultados Reais.',
    description: 'Monitore cargas, bata recordes, treine com IA. Grátis na App Store e Google Play.',
    url: 'https://irontracks.com.br/comercial',
    images: [{ url: '/logo-irontracks.png' }],
  },
}

const APPLE = 'https://apps.apple.com/br/app/irontracks/id6758735356'
const PLAY  = 'https://play.google.com/store/apps/details?id=com.irontracks.app'
const WEB   = 'https://irontracks.com.br'

const features = [
  {
    icon: Dumbbell,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    title: 'Treinos Avançados',
    desc: 'Séries, repetições, pesos e métodos de intensidade como Drop Set, Heavy Duty, Rest-Pause e mais. Tudo num toque.',
  },
  {
    icon: BarChart3,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.1)',
    title: 'Progresso Visual',
    desc: 'Gráficos de evolução por exercício, histórico completo e recordes pessoais (PRs) celebrados em tempo real.',
  },
  {
    icon: MapPin,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.1)',
    title: 'Cardio GPS',
    desc: 'Corrida e cardio com mapa ao vivo, distância precisa, pace, ritmo cardíaco e análise de rota em OpenStreetMap.',
  },
  {
    icon: Camera,
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.1)',
    title: 'Diário Nutricional',
    desc: 'Foto o rótulo, a IA lê os macros. Acompanhe proteína, carboidratos e calorias diárias de forma inteligente.',
  },
  {
    icon: Users,
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.1)',
    title: 'Social & Desafios',
    desc: 'Stories de treino, treinos em grupo com amigos, convites, leaderboards e IronRank por nível de performance.',
  },
  {
    icon: Zap,
    color: '#f97316',
    bg: 'rgba(249,115,22,0.1)',
    title: 'IA no Treino',
    desc: 'Sugestão de carga com IA, troca de exercício inteligente e criação de treinos personalizados por IA em segundos.',
  },
]

const vipFeatures = [
  'Coach IA com acesso ao seu histórico completo',
  'Periodização automática de 4–6 semanas',
  'Diagnóstico profundo de performance',
  'Análise de suplementação personalizada',
  'Resumo semanal com insights avançados',
  'Mapa de calor de frequência de treinos',
  'Créditos ilimitados de Chat com o Coach',
]

const stats = [
  { value: '18.970', label: 'Dispositivos\ncompatíveis', icon: Smartphone },
  { value: '5,0 ★', label: 'Rating na\nApp Store', icon: Star },
  { value: '100%', label: 'Gratuito\npara baixar', icon: Trophy },
  { value: '3×', label: 'Plataformas:\niOS · Android · Web', icon: Globe },
]

export default function ComercialPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5">
          <Image src="/icone.png" alt="IronTracks" width={32} height={32} className="rounded-xl" />
          <span className="font-black text-white text-lg tracking-tight">IronTracks</span>
        </div>
        <Link href={APPLE}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black text-black transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
          Baixar grátis
          <ArrowRight size={14} />
        </Link>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">

        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)' }} />
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }} />
        </div>

        {/* Grid pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        {/* Badge */}
        <div className="relative z-10 flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-black uppercase tracking-widest"
          style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
          <Flame size={12} />
          Alta Performance · Resultados Reais
        </div>

        {/* Headline */}
        <h1 className="relative z-10 text-center font-black leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.5rem, 8vw, 5rem)' }}>
          Treine com{' '}
          <span style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24,#f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            inteligência.
          </span>
          <br />
          Evolua sem parar.
        </h1>

        {/* Subtitle */}
        <p className="relative z-10 text-center text-neutral-400 mb-10 max-w-xl leading-relaxed"
          style={{ fontSize: 'clamp(1rem, 2.5vw, 1.2rem)' }}>
          O companheiro definitivo para quem leva a musculação a sério. Registre treinos, bata recordes, treine com IA e acompanhe nutrição — tudo em um lugar.
        </p>

        {/* CTA Buttons */}
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 mb-16">
          <Link href={APPLE}
            className="flex items-center gap-3 px-6 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#1a1a1a,#111)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            <div className="text-left">
              <div className="text-[10px] text-neutral-400 leading-none">Baixar na</div>
              <div className="text-white leading-tight">App Store</div>
            </div>
          </Link>

          <Link href={PLAY}
            className="flex items-center gap-3 px-6 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#1a1a1a,#111)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M3.18 23.76c.3.17.65.2.99.1L14.08 12 3.18.14c-.34-.1-.69-.07-.99.1C1.61.64 1.22 1.4 1.22 2.3v19.4c0 .9.39 1.66 1 2.06z" fill="#4285F4"/><path d="M17.97 15.79l2.76-1.6c.77-.44.77-1.14 0-1.58l-2.76-1.6-3.5 3.39 3.5 3.39z" fill="#FBBC04"/><path d="M3.18 23.76l10.9-11.76L3.18.14a1.19 1.19 0 0 0-.96.48l10.9 11.38L3.18 23.76z" fill="#34A853"/><path d="M3.18.14l10.9 11.76 3.89-3.76L6.1.24c-.93-.54-2.1-.46-2.92.1-.03.02-.03-.1 0 0z" fill="#EA4335"/></svg>
            <div className="text-left">
              <div className="text-[10px] text-neutral-400 leading-none">Disponível no</div>
              <div className="text-white leading-tight">Google Play</div>
            </div>
          </Link>

          <Link href={WEB}
            className="flex items-center gap-3 px-6 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 8px 30px rgba(245,158,11,0.25)' }}>
            <Globe size={20} className="text-black" />
            <div className="text-left">
              <div className="text-[10px] text-black/70 leading-none">Usar no</div>
              <div className="text-black leading-tight">Navegador</div>
            </div>
          </Link>
        </div>

        {/* Phone Mockup */}
        <div className="relative z-10 flex items-end justify-center gap-4">
          {/* Main phone */}
          <div className="relative" style={{ filter: 'drop-shadow(0 40px 80px rgba(245,158,11,0.2))' }}>
            <div className="relative w-[240px] h-[500px] rounded-[42px] overflow-hidden"
              style={{ border: '2px solid rgba(255,255,255,0.12)', background: 'linear-gradient(180deg,#0f0f0f 0%, #0a0a0a 100%)', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)' }}>

              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-6 rounded-b-2xl z-10"
                style={{ background: '#0a0a0a' }} />

              {/* App chrome — header */}
              <div className="px-4 pt-8 pb-3"
                style={{ background: 'linear-gradient(180deg, rgba(245,158,11,0.08) 0%, transparent 100%)' }}>
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">Quinta-feira</div>
                <div className="text-white font-black text-lg leading-tight">Peito & Tríceps</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1 rounded-full flex-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-1 rounded-full w-[68%]" style={{ background: 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
                  </div>
                  <span className="text-[10px] text-yellow-500 font-black">68%</span>
                </div>
              </div>

              {/* Exercise cards */}
              <div className="px-3 space-y-2 mt-1">
                {[
                  { name: 'Supino Reto', sets: '4×8', kg: '80kg', done: true },
                  { name: 'Crucifixo Incl.', sets: '3×12', kg: '20kg', done: true },
                  { name: 'Tríceps Corda', sets: '4×15', kg: '35kg', done: false },
                ].map((ex, i) => (
                  <div key={i} className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                    style={{ background: ex.done ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${ex.done ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.07)'}` }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: ex.done ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)' }}>
                      {ex.done && <Check size={10} className="text-yellow-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-black text-white truncate">{ex.name}</div>
                      <div className="text-[9px] text-neutral-500">{ex.sets} · {ex.kg}</div>
                    </div>
                    {!ex.done && (
                      <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#f59e0b' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* PR Badge */}
              <div className="absolute bottom-20 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.9),rgba(217,119,6,0.9))', boxShadow: '0 4px 20px rgba(245,158,11,0.5)' }}>
                <Trophy size={10} className="text-black" />
                <span className="text-[10px] font-black text-black">Novo PR!</span>
              </div>

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-center justify-between"
                style={{ background: 'rgba(10,10,10,0.95)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-[10px] text-neutral-500 font-black">3/5 exercícios</span>
                <div className="px-3 py-1.5 rounded-lg text-[10px] font-black text-black"
                  style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                  Continuar
                </div>
              </div>
            </div>

            {/* Reflection */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[180px] h-[30px] rounded-full blur-xl"
              style={{ background: 'rgba(245,158,11,0.15)' }} />
          </div>

          {/* Side phone (nutrition) — hidden on small screens */}
          <div className="hidden md:block relative opacity-60 scale-90 origin-bottom"
            style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))' }}>
            <div className="relative w-[200px] h-[420px] rounded-[36px] overflow-hidden"
              style={{ border: '2px solid rgba(255,255,255,0.08)', background: '#0a0a0a' }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 rounded-b-xl" style={{ background: '#0a0a0a' }} />
              <div className="px-3 pt-7 pb-2" style={{ background: 'rgba(16,185,129,0.06)' }}>
                <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-black">Hoje</div>
                <div className="text-white font-black text-base">Nutrição</div>
              </div>
              <div className="px-3 mt-2 space-y-2">
                {[
                  { label: 'Proteína', v: 142, max: 180, color: '#3b82f6' },
                  { label: 'Carbs', v: 210, max: 300, color: '#f97316' },
                  { label: 'Gordura', v: 55, max: 80, color: '#eab308' },
                ].map(m => (
                  <div key={m.label} className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[9px] text-neutral-400 font-black">{m.label}</span>
                      <span className="text-[9px] font-black" style={{ color: m.color }}>{m.v}g</span>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-1 rounded-full transition-all" style={{ width: `${(m.v/m.max)*100}%`, background: m.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="relative z-10 mt-12 flex flex-col items-center gap-2 opacity-40">
          <span className="text-xs text-neutral-500">Explorar</span>
          <div className="w-px h-8 rounded-full" style={{ background: 'linear-gradient(180deg,rgba(245,158,11,0.5),transparent)' }} />
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────────── */}
      <section className="px-6 py-16" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.label} className="text-center">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Icon size={18} className="text-yellow-500" />
                </div>
                <div className="font-black text-2xl text-white mb-1">{s.value}</div>
                <div className="text-xs text-neutral-500 leading-tight whitespace-pre-line">{s.label}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4"
              style={{ border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.06)', color: '#f59e0b' }}>
              <Target size={11} />
              Funcionalidades
            </div>
            <h2 className="font-black text-white mb-4" style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', lineHeight: 1.1 }}>
              Tudo que você precisa.<br />
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Nada que você não precisa.</span>
            </h2>
            <p className="text-neutral-500 max-w-xl mx-auto">
              Construído por quem treina de verdade. Cada feature foi pensada para funcionar na academia, não só no papel.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title}
                  className="group rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 cursor-default"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: f.bg, border: `1px solid ${f.color}30` }}>
                    <Icon size={20} style={{ color: f.color }} />
                  </div>
                  <h3 className="font-black text-white text-base mb-2">{f.title}</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── VIP SECTION ─────────────────────────────────────────────────── */}
      <section className="px-6 py-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(245,158,11,0.08) 0%, transparent 70%)' }} />

        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl overflow-hidden relative"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(15,15,14,0.99) 50%, rgba(217,119,6,0.06) 100%)', border: '1px solid rgba(245,158,11,0.2)', boxShadow: '0 0 80px rgba(245,158,11,0.06)' }}>

            {/* Top gold line */}
            <div className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.8), transparent)' }} />

            <div className="flex flex-col lg:flex-row items-center gap-10 p-8 md:p-12">
              {/* Left — image + badge */}
              <div className="flex-shrink-0 text-center">
                <Image src="/vip-crown.png" alt="VIP" width={180} height={180}
                  className="mx-auto object-contain"
                  style={{ filter: 'drop-shadow(0 0 40px rgba(245,158,11,0.4))' }} />
                <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black"
                  style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(217,119,6,0.1))', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}>
                  <Crown size={12} />
                  IronTracks VIP
                </div>
              </div>

              {/* Right — content */}
              <div className="flex-1">
                <div className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#f59e0b' }}>
                  Premium · Desbloqueie tudo
                </div>
                <h2 className="font-black text-white mb-3 leading-tight" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)' }}>
                  Seu Coach IA pessoal.<br />Periodização no piloto automático.
                </h2>
                <p className="text-neutral-400 text-sm mb-6 leading-relaxed max-w-lg">
                  O VIP transforma dados dos seus treinos em planos inteligentes, análise de performance e orientação nutricional personalizada — como ter um preparador físico no bolso.
                </p>

                <ul className="space-y-2.5 mb-8">
                  {vipFeatures.map(item => (
                    <li key={item} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
                        <Check size={11} className="text-yellow-400" />
                      </div>
                      <span className="text-sm text-neutral-300">{item}</span>
                    </li>
                  ))}
                </ul>

                <Link href={WEB}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm text-black transition-all active:scale-95 hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 8px 30px rgba(245,158,11,0.3)' }}>
                  Experimentar VIP
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ────────────────────────────────────────────────── */}
      <section className="px-6 py-16" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
            <div>
              <div className="flex items-center gap-1 mb-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={18} fill="#f59e0b" className="text-yellow-500" />
                ))}
                <span className="ml-2 text-yellow-500 font-black text-lg">5,0</span>
              </div>
              <div className="text-white font-black text-xl mb-1">Avaliado com 5 estrelas</div>
              <div className="text-neutral-500 text-sm">na App Store Brasil</div>
            </div>

            <div className="flex flex-wrap gap-3 justify-center sm:justify-end">
              {[
                { icon: Activity, label: 'Treinos ilimitados', color: '#3b82f6' },
                { icon: Zap, label: 'IA integrada', color: '#f59e0b' },
                { icon: Globe, label: 'Funciona offline', color: '#22c55e' },
                { icon: ChefHat, label: 'Nutrição com IA', color: '#ec4899' },
              ].map(b => {
                const Icon = b.icon
                return (
                  <div key={b.label}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Icon size={13} style={{ color: b.color }} />
                    <span className="text-neutral-300">{b.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── DOWNLOAD CTA ────────────────────────────────────────────────── */}
      <section className="px-6 py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.07) 0%, transparent 70%)' }} />
        <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative max-w-3xl mx-auto text-center">
          <Image src="/logo-irontracks.png" alt="IronTracks" width={80} height={80}
            className="mx-auto mb-6 rounded-3xl"
            style={{ boxShadow: '0 0 40px rgba(245,158,11,0.3)' }} />

          <h2 className="font-black text-white mb-4 leading-tight" style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}>
            Pronto para treinar<br />
            <span style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              de verdade?
            </span>
          </h2>
          <p className="text-neutral-400 mb-10 max-w-md mx-auto">
            Grátis. Sem anúncios. Disponível em qualquer dispositivo. Comece agora.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href={APPLE}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl font-black transition-all active:scale-95 hover:opacity-90"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              <div className="text-left">
                <div className="text-xs text-neutral-400">Baixar na</div>
                <div className="text-white text-base">App Store</div>
              </div>
            </Link>

            <Link href={PLAY}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl font-black transition-all active:scale-95 hover:opacity-90"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
              <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><path d="M3.18 23.76c.3.17.65.2.99.1L14.08 12 3.18.14c-.34-.1-.69-.07-.99.1C1.61.64 1.22 1.4 1.22 2.3v19.4c0 .9.39 1.66 1 2.06z" fill="#4285F4"/><path d="M17.97 15.79l2.76-1.6c.77-.44.77-1.14 0-1.58l-2.76-1.6-3.5 3.39 3.5 3.39z" fill="#FBBC04"/><path d="M3.18 23.76l10.9-11.76L3.18.14a1.19 1.19 0 0 0-.96.48l10.9 11.38L3.18 23.76z" fill="#34A853"/><path d="M3.18.14l10.9 11.76 3.89-3.76L6.1.24c-.93-.54-2.1-.46-2.92.1-.03.02-.03-.1 0 0z" fill="#EA4335"/></svg>
              <div className="text-left">
                <div className="text-xs text-neutral-400">Disponível no</div>
                <div className="text-white text-base">Google Play</div>
              </div>
            </Link>

            <Link href={WEB}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-black transition-all active:scale-95 hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 8px 40px rgba(245,158,11,0.35)' }}>
              <Globe size={24} className="text-black" />
              <div className="text-left">
                <div className="text-xs text-black/70">Acessar no</div>
                <div className="text-black text-base">Navegador</div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="px-6 py-8 text-center"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center justify-center gap-2 mb-3">
          <Image src="/icone.png" alt="IronTracks" width={24} height={24} className="rounded-lg opacity-60" />
          <span className="text-neutral-500 text-sm font-black">IronTracks</span>
        </div>
        <p className="text-neutral-700 text-xs">
          © {new Date().getFullYear()} IronTracks · Construído com 🔥 para quem treina de verdade
        </p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <Link href="/privacy" className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">Privacidade</Link>
          <Link href={WEB} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">Entrar</Link>
        </div>
      </footer>

    </div>
  )
}
