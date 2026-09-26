'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import ReelVideo from './ReelVideo'
import { APP } from './links'
import { ArrowIcon, CrownIcon } from './icons'
import { EASE_OUT } from './motion'
import { capaDo, reelPorSlug, videoDo } from './reels'

export default function VipSection() {
  const reel = reelPorSlug('dia15')
  return (
    <section id="vip" className="relative scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          className="lp-gold-border relative grid items-center gap-12 overflow-hidden rounded-[36px] p-8 md:grid-cols-[1.25fr_0.75fr] md:p-14"
        >
          <div aria-hidden="true" className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gold/15 blur-[120px]" />
          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-gold">
              <CrownIcon className="h-4 w-4" />
              IronTracks VIP
            </p>
            <h2 className="mt-6 font-display text-[clamp(2.4rem,5.2vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.03em]">
              Periodização <span className="lp-gold-text">de verdade.</span>
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/70">
              Programas de 4, 6 ou 8 semanas, com progressão linear ou ondulatória — o planejamento que um treinador
              faria, montado a partir do seu objetivo, nível e frequência.
            </p>
            <Link
              href={APP}
              className="mt-9 inline-flex h-12 items-center gap-2 rounded-xl bg-gold px-6 font-semibold text-black transition-transform hover:-translate-y-0.5"
            >
              Conhecer o VIP
              <ArrowIcon className="h-4 w-4" />
            </Link>
          </div>
          <div className="relative mx-auto w-[min(62vw,260px)] overflow-hidden rounded-[28px] border border-white/10 bg-ink">
            <div className="aspect-[9/16]">
              <ReelVideo
                src={videoDo(reel.slug)}
                poster={capaDo(reel.slug)}
                label={`Vídeo: ${reel.titulo}`}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
