'use client'

import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useScroll } from 'framer-motion'
import ReelCard from './ReelCard'
import SectionHeader from './SectionHeader'
import { ArrowIcon } from './icons'
import { CATEGORIAS, REELS, type Categoria } from './reels'

export default function ReelCarousel() {
  const [categoria, setCategoria] = useState<Categoria | 'todas'>('todas')
  const lista = useMemo(
    () => (categoria === 'todas' ? REELS : REELS.filter((r) => r.categoria === categoria)),
    [categoria],
  )
  const trilho = useRef<HTMLDivElement>(null)
  const { scrollXProgress } = useScroll({ container: trilho })

  const rolar = (sentido: 1 | -1) => {
    const el = trilho.current
    if (!el) return
    el.scrollBy({ left: sentido * Math.min(el.clientWidth * 0.8, 640), behavior: 'smooth' })
  }

  const escolher = (id: Categoria | 'todas') => {
    setCategoria(id)
    trilho.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }

  return (
    <section id="funcoes" className="relative scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeader
          eyebrow="15 funções"
          titulo={
            <>
              Uma função por dia.
              <br />
              <span className="lp-gold-text">Quinze motivos</span> pra trocar de app.
            </>
          }
          texto="Cada vídeo mostra a função de verdade, gravada direto do app. Arraste para o lado."
        />

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label="Filtrar funções" className="flex flex-wrap gap-2">
            {CATEGORIAS.map((c) => {
              const ativo = categoria === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => escolher(c.id)}
                  className={`relative h-11 rounded-full px-5 text-sm font-medium transition-colors ${
                    ativo ? 'text-black' : 'border border-white/10 text-white/75 hover:text-white'
                  }`}
                >
                  {ativo && (
                    <motion.span
                      layoutId="lp-filtro-ativo"
                      className="absolute inset-0 rounded-full bg-gold"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{c.rotulo}</span>
                </button>
              )
            })}
          </div>

          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              aria-label="Funções anteriores"
              onClick={() => rolar(-1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 transition-colors hover:border-gold/60 hover:text-gold"
            >
              <ArrowIcon direcao="esquerda" />
            </button>
            <button
              type="button"
              aria-label="Próximas funções"
              onClick={() => rolar(1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 transition-colors hover:border-gold/60 hover:text-gold"
            >
              <ArrowIcon />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={trilho}
        className="scrollbar-none mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 [scroll-padding-inline:1.25rem] md:gap-6 xl:px-[calc((100vw_-_80rem)/2_+_1.25rem)]"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {lista.map((r, i) => (
            <motion.article
              key={r.slug}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.04 }}
              className="w-[70vw] max-w-[300px] shrink-0 snap-start sm:w-[260px] lg:w-[280px]"
            >
              <ReelCard reel={r} />
            </motion.article>
          ))}
        </AnimatePresence>
      </div>

      <div className="mx-auto mt-6 max-w-7xl px-5">
        <div aria-hidden="true" className="h-px w-full overflow-hidden rounded-full bg-white/10">
          <motion.div style={{ scaleX: scrollXProgress }} className="h-full origin-left bg-gold" />
        </div>
      </div>
    </section>
  )
}
