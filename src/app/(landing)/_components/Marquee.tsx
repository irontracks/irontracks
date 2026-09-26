import { REELS } from './reels'

/** Faixa infinita com o nome das 15 funções. A 2ª cópia é só visual (aria-hidden). */
export default function Marquee() {
  const itens = REELS.map((r) => r.titulo)
  return (
    <section aria-label="Funções do IronTracks" className="relative overflow-hidden border-y border-white/5 bg-ink-2 py-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink-2 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink-2 to-transparent" />
      <ul className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
        {[...itens, ...itens].map((t, i) => (
          <li
            key={`${t}-${i}`}
            aria-hidden={i >= itens.length ? true : undefined}
            className="flex items-center gap-10 whitespace-nowrap pr-10 font-display text-xl font-semibold text-white/80 md:text-2xl"
          >
            {t}
            <span className="text-gold" aria-hidden="true">✦</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
