'use client'

import { motion } from 'framer-motion'
import { EASE_OUT } from './motion'

/** Só números verificáveis — nada de "milhares de usuários". */
const NUMEROS = [
  { valor: '12+', rotulo: 'métodos de treino avançados' },
  { valor: '5,0', rotulo: 'estrelas de nota na App Store' },
  { valor: 'Grátis', rotulo: 'para baixar e começar' },
  { valor: '3', rotulo: 'plataformas: iPhone, Android e web' },
]

export default function Numbers() {
  return (
    <section aria-label="IronTracks em números" className="border-y border-white/5 bg-ink-2">
      <div className="mx-auto grid max-w-7xl grid-cols-2 lg:grid-cols-4">
        {NUMEROS.map((n, i) => (
          <motion.div
            key={n.rotulo}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7, ease: EASE_OUT, delay: i * 0.08 }}
            className="border-white/5 px-5 py-10 text-center odd:border-r lg:border-r lg:py-14 lg:last:border-r-0"
          >
            <p className="lp-gold-text font-display text-[clamp(2.4rem,5vw,3.6rem)] font-bold leading-none tracking-[-0.03em]">
              {n.valor}
            </p>
            <p className="mx-auto mt-3 max-w-[16ch] text-sm leading-snug text-white/70">{n.rotulo}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
