'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import StoreButtons from './StoreButtons'
import { EASE_OUT } from './motion'

export default function FinalCta({ onAndroid }: { onAndroid: () => void }) {
  const reduzir = useReducedMotion()
  return (
    <section id="baixar" className="relative isolate scroll-mt-20 overflow-hidden py-28 md:py-40">
      <div aria-hidden="true" className="lp-grid absolute inset-0 -z-10 opacity-70" />
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 -z-10 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/15 blur-[160px]" />

      <div className="mx-auto max-w-4xl px-5 text-center">
        <div className="relative mx-auto h-24 w-24">
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className="absolute inset-0 rounded-[28px] border border-gold/50"
              animate={reduzir ? undefined : { scale: [1, 1.7], opacity: [0.6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2, ease: 'easeOut' }}
            />
          ))}
          <Image
            src="/logo-irontracks.png"
            alt="IronTracks"
            width={96}
            height={96}
            className="relative rounded-[28px] shadow-[0_0_60px_rgba(245,184,0,0.35)]"
          />
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          className="mt-12 font-display text-[clamp(3rem,9.5vw,7.4rem)] font-bold leading-[0.92] tracking-[-0.045em]"
        >
          Chega de planejar.
          <br />
          <span className="lp-gold-text">Treina.</span>
        </motion.h2>

        <p className="mx-auto mt-7 max-w-md text-lg text-white/70">Grátis para baixar. Funciona offline. Sem anúncios.</p>

        <div className="mt-11">
          <StoreButtons onAndroid={onAndroid} centralizar />
        </div>

        <p className="mt-8 font-mono text-xs uppercase tracking-[0.22em] text-white/60">iPhone · Android · Navegador</p>
      </div>
    </section>
  )
}
