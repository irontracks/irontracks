import Image from 'next/image'
import Link from 'next/link'
import { APP } from './links'

const LINKS = [
  { rotulo: 'Privacidade', href: '/privacy' },
  { rotulo: 'Termos', href: '/terms' },
  { rotulo: 'Excluir conta', href: '/excluir-conta' },
  { rotulo: 'Para professores', href: '/para-professores' },
  { rotulo: 'Entrar', href: APP },
]

export default function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex h-11 items-center gap-2.5">
          <Image src="/logo-irontracks.png" alt="" width={26} height={26} className="rounded-md" />
          <span className="font-display text-sm font-bold tracking-[0.1em]">
            IRON<span className="italic text-gold">TRACKS</span>
          </span>
        </Link>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-2 gap-y-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex h-11 items-center rounded-lg px-3 text-sm text-white/65 transition-colors hover:text-white"
            >
              {l.rotulo}
            </Link>
          ))}
        </nav>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/60">© 2026 IronTracks</p>
      </div>
    </footer>
  )
}
