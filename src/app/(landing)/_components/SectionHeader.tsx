'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { surgir } from './motion'

export default function SectionHeader({
  eyebrow,
  titulo,
  texto,
  centralizar = false,
}: {
  eyebrow: string
  titulo: ReactNode
  texto?: string
  centralizar?: boolean
}) {
  return (
    <motion.div {...surgir} className={centralizar ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-gold">{'// '}{eyebrow}</p>
      <h2 className="mt-4 font-display text-[clamp(2.25rem,5.2vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.03em]">
        {titulo}
      </h2>
      {texto && (
        <p className={`mt-5 text-lg leading-relaxed text-white/70 ${centralizar ? 'mx-auto max-w-2xl' : 'max-w-2xl'}`}>
          {texto}
        </p>
      )}
    </motion.div>
  )
}
