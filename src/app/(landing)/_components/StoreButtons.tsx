'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { APP, APPLE } from './links'
import { AppleIcon, GlobeIcon, PlayIcon } from './icons'

/**
 * Os três jeitos de ter o app. O Android abre o passo a passo do teste fechado
 * (`AndroidModal`) em vez de mandar direto para a Play Store — sem entrar no
 * grupo de testadores, a loja responde "item não encontrado".
 */
export default function StoreButtons({
  onAndroid,
  centralizar = false,
}: {
  onAndroid: () => void
  centralizar?: boolean
}) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap ${centralizar ? 'sm:justify-center' : ''}`}>
      <motion.a
        href={APPLE}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        className="group flex h-14 items-center gap-3 rounded-2xl bg-gradient-to-br from-gold-soft via-gold to-ember px-6 text-black shadow-[0_10px_40px_-10px_rgba(245,184,0,0.7)]"
      >
        <AppleIcon className="h-6 w-6" />
        <span className="flex flex-col leading-none">
          <span className="text-[11px] font-medium opacity-80">Baixar na</span>
          <span className="font-display text-lg font-bold">App Store</span>
        </span>
      </motion.a>

      <motion.button
        type="button"
        onClick={onAndroid}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        className="flex h-14 items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-6 text-left text-white backdrop-blur-md transition-colors hover:border-gold/50 hover:bg-white/[0.07]"
      >
        <PlayIcon className="h-6 w-6" />
        <span className="flex flex-col leading-none">
          <span className="text-[11px] font-medium text-white/70">Disponível no</span>
          <span className="font-display text-lg font-bold">Google Play</span>
        </span>
      </motion.button>

      <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
        <Link
          href={APP}
          className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 px-6 text-white transition-colors hover:border-white/30"
        >
          <GlobeIcon className="h-6 w-6 text-gold" />
          <span className="flex flex-col leading-none">
            <span className="text-[11px] font-medium text-white/70">Usar no</span>
            <span className="font-display text-lg font-bold">Navegador</span>
          </span>
        </Link>
      </motion.div>
    </div>
  )
}
