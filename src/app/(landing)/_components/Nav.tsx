'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { EASE_OUT } from './motion'

const LINKS = [
  { rotulo: 'Funções', href: '#funcoes' },
  { rotulo: 'Como funciona', href: '#como-funciona' },
  { rotulo: 'Além do treino', href: '#alem' },
  { rotulo: 'VIP', href: '#vip' },
]

export default function Nav() {
  const { scrollY } = useScroll()
  const [rolou, setRolou] = useState(false)
  useMotionValueEvent(scrollY, 'change', (v) => setRolou(v > 24))

  return (
    <motion.header
      initial={{ y: -28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3"
    >
      <nav
        aria-label="Principal"
        className={`flex w-full max-w-6xl items-center justify-between rounded-2xl border px-2 py-1.5 transition-all duration-300 ${
          rolou
            ? 'border-white/10 bg-black/65 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl'
            : 'border-transparent bg-transparent'
        }`}
      >
        <Link href="/" className="flex h-11 items-center gap-2.5 px-2">
          <Image src="/logo-irontracks.png" alt="" width={30} height={30} className="rounded-lg" priority />
          <span className="font-display text-[15px] font-bold tracking-[0.08em]">
            IRON<span className="italic text-gold">TRACKS</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="flex h-11 items-center rounded-xl px-4 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.rotulo}
            </a>
          ))}
        </div>

        <a
          href="#baixar"
          className="flex h-11 items-center rounded-xl bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-gold"
        >
          Baixar grátis
        </a>
      </nav>
    </motion.header>
  )
}
