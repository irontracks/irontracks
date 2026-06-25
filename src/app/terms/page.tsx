import { ArrowLeft, FileText, RefreshCw, CreditCard, Ban, Mail } from 'lucide-react'
import Link from 'next/link'

const APPLE_STD_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'

export default function TermsOfUse() {
  const sections = [
    {
      id: 'aceitacao',
      icon: <FileText className="w-6 h-6 text-yellow-500" />,
      title: '1. Aceitação dos Termos',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>
            Ao criar uma conta, acessar ou assinar o IronTracks, você concorda com estes Termos de Uso
            (EULA) e com a nossa{' '}
            <Link href="/privacy" className="underline font-semibold text-yellow-500 hover:text-yellow-400">
              Política de Privacidade
            </Link>
            . Se não concordar, não utilize o aplicativo.
          </p>
          <p>
            Nas compras feitas pela App Store, aplica-se também o Contrato de Licença de Usuário Final
            padrão da Apple (EULA):{' '}
            <a
              href={APPLE_STD_EULA}
              className="underline font-semibold text-yellow-500 hover:text-yellow-400"
            >
              apple.com/legal/.../stdeula
            </a>
            .
          </p>
        </div>
      ),
    },
    {
      id: 'assinatura',
      icon: <RefreshCw className="w-6 h-6 text-yellow-500" />,
      title: '2. Assinatura VIP (renovação automática)',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-neutral-200">Título:</strong> IronTracks VIP.</li>
            <li><strong className="text-neutral-200">Duração:</strong> mensal ou anual, conforme o plano escolhido no checkout.</li>
            <li><strong className="text-neutral-200">Preço:</strong> exibido no checkout antes da confirmação, na moeda local da sua conta.</li>
            <li><strong className="text-neutral-200">Renovação automática:</strong> a assinatura renova automaticamente ao fim de cada período, salvo cancelamento.</li>
          </ul>
          <p className="border-l-2 border-yellow-500 pl-4 text-neutral-300 font-medium mt-4">
            A cobrança é feita na sua conta da App Store na confirmação da compra. A renovação ocorre a
            menos que seja cancelada até 24 horas antes do fim do período vigente.
          </p>
        </div>
      ),
    },
    {
      id: 'cancelamento',
      icon: <CreditCard className="w-6 h-6 text-yellow-500" />,
      title: '3. Gerenciamento e Cancelamento',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>
            Você pode gerenciar ou cancelar a assinatura a qualquer momento em{' '}
            <strong className="text-neutral-200">Ajustes → [seu nome] → Assinaturas</strong> no seu
            dispositivo Apple. O cancelamento entra em vigor ao fim do período já pago, sem reembolso
            do período corrente.
          </p>
        </div>
      ),
    },
    {
      id: 'uso',
      icon: <Ban className="w-6 h-6 text-yellow-500" />,
      title: '4. Uso Aceitável',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>
            O acesso é pessoal e intransferível. É proibido tentar burlar mecanismos de segurança,
            cobrança ou de controle de acesso, ou usar o app para fins ilícitos. Podemos suspender
            contas que violem estes termos.
          </p>
        </div>
      ),
    },
    {
      id: 'contato',
      icon: <Mail className="w-6 h-6 text-yellow-500" />,
      title: '5. Contato',
      content: (
        <div className="space-y-4 text-neutral-400 leading-relaxed group">
          <p>
            Dúvidas sobre estes Termos ou sobre sua assinatura? Fale com a gente em{' '}
            <a href="mailto:suporte@irontracks.com.br" className="underline font-semibold text-yellow-500 hover:text-yellow-400">
              suporte@irontracks.com.br
            </a>
            .
          </p>
        </div>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-neutral-950 font-sans selection:bg-yellow-500/30">
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
            Termos de Uso
          </p>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-4xl mx-auto px-4 md:px-8 py-10 md:py-16">
        <div className="mb-14">
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Termos de Uso (EULA)
          </h2>
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-sm font-semibold text-neutral-500">
            <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 rounded-full w-fit">
              Válido e em Vigor
            </span>
            <span>Atualizado em: {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
          <p className="mt-6 text-lg text-neutral-400 leading-relaxed max-w-3xl">
            Estes termos regem o uso do IronTracks e a assinatura VIP com renovação automática.
            Leia com atenção antes de assinar.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12">
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
      </main>
    </div>
  )
}
