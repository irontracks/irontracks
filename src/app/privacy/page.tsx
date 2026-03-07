import { ArrowLeft, ShieldCheck, Database, Lock, UserCheck, Mail } from 'lucide-react'
import Link from 'next/link'

export default function PrivacyPolicy() {
  const sections = [
    {
      id: 'coleta',
      icon: <Database className="w-6 h-6 text-yellow-500" />,
      title: '1. Dados que Coletamos',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>Para oferecer a melhor experiência de treino, coletamos apenas o estritamente necessário:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-neutral-200">Identificação básica:</strong> Nome e endereço de e-mail para manter sua conta segura.</li>
            <li><strong className="text-neutral-200">Progresso e Performance:</strong> Seu histórico de treinos, cargas, repetições e notas pessoais.</li>
            <li><strong className="text-neutral-200">Mídia e Compartilhamento:</strong> Fotos e vídeos que você envia voluntariamente no seu registro e acompanhamento de treinos.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'uso',
      icon: <UserCheck className="w-6 h-6 text-yellow-500" />,
      title: '2. Como Usamos Seus Dados',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>Seu progresso é seu. Utilizamos suas informações exclusivamente para o funcionamento do app e para melhorar sua jornada como atleta:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Fornecer a funcionalidade central do IronTracks (registro de treinos, periodização, gráficos).</li>
            <li>Garantir a funcionalidade das funções sociais e a interação entre alunos e professores autorizados.</li>
            <li>Autenticar sua conta e assegurar a proteção constante do seu ambiente online.</li>
          </ul>
          <p className="border-l-2 border-yellow-500 pl-4 text-neutral-300 font-medium italic mt-4">
            Em nenhuma hipótese vendemos, negociamos ou compartilhamos seus dados com terceiros para fins publicitários.
          </p>
        </div>
      )
    },
    {
      id: 'seguranca',
      icon: <Lock className="w-6 h-6 text-yellow-500" />,
      title: '3. Segurança e Armazenamento',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>
            Seus dados estão protegidos. Utilizamos infraestrutura de ponta e criptografia avançada (via Supabase)
            para que ninguém além de você ou do seu professor tenha acesso ao seu desempenho.
          </p>
          <p>
            Aplicamos políticas de segurança RLS (Row Level Security) rigorosas em nível de banco de dados para
            garantir privacidade e isolamento total das informações entre usuários.
          </p>
        </div>
      )
    },
    {
      id: 'direitos',
      icon: <ShieldCheck className="w-6 h-6 text-yellow-500" />,
      title: '4. Seus Direitos na Nossa Plataforma',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>O controle está nas suas mãos. A qualquer momento, você pode:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Acessar, exportar ou modificar todas as suas informações pessoais e registros de treino diretamente no aplicativo.</li>
            <li>Solicitar a exclusão permanente e completa de sua conta (e todos os dados atrelados a ela) pelo próprio app.</li>
            <li>Gerenciar suas preferências de notificação e comunicação na aba Ajustes.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'contato',
      icon: <Mail className="w-6 h-6 text-yellow-500" />,
      title: '5. Fale com a Gente',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>
            Ficou com alguma dúvida ou precisa de ajuda com relação aos seus dados? Estamos à disposição.
          </p>
          <p>
            Entre em contato pelo e-mail oficial listado na nossa página de suporte, na App Store, ou através
            do seu próprio professor caso utilize o IronTracks por meio da sua consultoria.
          </p>
        </div>
      )
    }
  ]

  return (
    <div className="min-h-[100dvh] bg-neutral-950 font-sans selection:bg-yellow-500/30">
      {/* HEADER SECTION */}
      <header className="sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5 pt-safe-top">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 -ml-2 text-neutral-400 hover:text-yellow-500 transition-colors rounded-full hover:bg-white/5 active:scale-95"
              aria-label="Voltar"
            >
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-xl md:text-2xl font-black italic tracking-tighter">
              IRON<span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">TRACKS</span>
            </h1>
          </div>
          <p className="text-[10px] md:text-xs font-bold text-neutral-500 uppercase tracking-widest hidden md:block">
            Segurança em 1º Lugar
          </p>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-4xl mx-auto px-4 md:px-8 py-10 md:py-16">
        {/* Title Area */}
        <div className="mb-14">
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Política de Privacidade
          </h2>
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-sm font-semibold text-neutral-500">
            <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 rounded-full w-fit">
              Válido e em Vigor
            </span>
            <span>Atualizado em: {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
          <p className="mt-6 text-lg text-neutral-400 leading-relaxed max-w-3xl">
            Bem-vindo ao centro de segurança e privacidade. Queremos que você foque 100% no seu treino.
            É por isso que levamos a proteção dos seus dados tão a sério quanto você leva a sua periodização.
            Abaixo, explicamos de forma transparente como cuidamos da sua conta.
          </p>
        </div>

        {/* Dynamic Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-12">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="group bg-neutral-900/30 border border-white/5 rounded-3xl p-6 md:p-8 hover:bg-neutral-900/50 hover:border-yellow-500/20 transition-all duration-500"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-neutral-800 rounded-2xl group-hover:bg-yellow-500/10 transition-colors duration-300">
                  {section.icon}
                </div>
                <h3 className="text-2xl font-bold text-white tracking-tight">
                  {section.title}
                </h3>
              </div>
              <div className="text-[15px] md:text-base">
                {section.content}
              </div>
            </section>
          ))}
        </div>

        {/* Footer info inside Privacy */}
        <div className="mt-20 pt-8 border-t border-white/5 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-bold text-neutral-600 uppercase tracking-widest mb-2">
            Equipe IronTracks
          </p>
          <p className="text-sm text-neutral-500">
            © {new Date().getFullYear()} Todos os direitos reservados.
          </p>
        </div>
      </main>
    </div>
  )
}
