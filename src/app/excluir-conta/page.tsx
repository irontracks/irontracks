import { ArrowLeft, Mail, ShieldCheck, Trash2 } from 'lucide-react'
import Link from 'next/link'

const DELETE_REQUEST_EMAIL =
  'mailto:irontrackscompany@gmail.com?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20conta%20IronTracks&body=E-mail%20usado%20na%20conta%3A%20%0A%0ASolicito%20a%20exclus%C3%A3o%20da%20minha%20conta%20IronTracks%20e%20dos%20dados%20associados.'

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/5 bg-neutral-950/90">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-5 md:px-8">
          <Link
            href="/"
            aria-label="Voltar"
            className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-yellow-500"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-black italic tracking-tighter">
            IRON<span className="text-yellow-500">TRACKS</span>
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 md:px-8 md:py-16">
        <section>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
            <Trash2 aria-hidden="true" />
          </div>
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">Exclusão de conta e dados</h2>
          <p className="mt-4 leading-relaxed text-neutral-400">
            Esta página permite solicitar a exclusão da sua conta no aplicativo IronTracks,
            desenvolvido pela IronTracks Company.
          </p>
        </section>

        <section className="rounded-3xl border border-white/5 bg-neutral-900/40 p-6 md:p-8">
          <h3 className="text-xl font-bold">Excluir diretamente pelo aplicativo</h3>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-neutral-300">
            <li>Entre na sua conta do IronTracks.</li>
            <li>Abra o menu e acesse <strong>Ajustes</strong>.</li>
            <li>Toque em <strong>Excluir minha conta</strong>.</li>
            <li>Digite <strong>EXCLUIR</strong> para confirmar.</li>
          </ol>
          <p className="mt-4 text-sm leading-relaxed text-neutral-500">
            A exclusão iniciada no app é processada imediatamente e encerra a sessão da conta.
          </p>
        </section>

        <section className="rounded-3xl border border-yellow-500/20 bg-yellow-500/5 p-6 md:p-8">
          <div className="flex items-center gap-3">
            <Mail className="text-yellow-500" aria-hidden="true" />
            <h3 className="text-xl font-bold">Solicitar sem acessar o aplicativo</h3>
          </div>
          <p className="mt-4 leading-relaxed text-neutral-300">
            Envie a solicitação pelo botão abaixo usando, de preferência, o mesmo e-mail cadastrado
            na conta. Podemos pedir uma confirmação de identidade antes de concluir a exclusão.
          </p>
          <a
            href={DELETE_REQUEST_EMAIL}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-yellow-500 px-5 py-3 font-black text-black transition-colors hover:bg-yellow-400"
          >
            Solicitar exclusão por e-mail
          </a>
          <p className="mt-3 text-sm text-neutral-500">
            Contato: irontrackscompany@gmail.com · prazo de atendimento: até 30 dias.
          </p>
        </section>

        <section className="rounded-3xl border border-white/5 bg-neutral-900/40 p-6 md:p-8">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-yellow-500" aria-hidden="true" />
            <h3 className="text-xl font-bold">O que será excluído</h3>
          </div>
          <p className="mt-4 leading-relaxed text-neutral-300">
            A conta de acesso e os dados associados ao perfil, treinos, avaliações, agenda,
            mensagens e preferências são excluídos. Informações que precisem ser mantidas por
            obrigação legal, prevenção a fraude ou comprovação de transações poderão ser retidas
            apenas pelo prazo exigido e depois eliminadas.
          </p>
        </section>

        <p className="text-sm text-neutral-500">
          Saiba mais na nossa{' '}
          <Link href="/privacy" className="font-semibold text-yellow-500 underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </main>
    </div>
  )
}
