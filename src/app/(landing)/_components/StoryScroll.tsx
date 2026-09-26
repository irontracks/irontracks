'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReelVideo from './ReelVideo'
import SectionHeader from './SectionHeader'
import { EASE_OUT } from './motion'
import { capaDo, reelPorSlug, videoDo } from './reels'
import { etapaAtiva } from './etapaAtiva'

const CAPITULOS = [
  {
    n: '01',
    verbo: 'Monte',
    titulo: 'Seu treino pronto em segundos.',
    texto:
      'Responda 4 perguntas e a IA monta o treino. Tem a ficha do professor no papel? Tire uma foto e ela vira treino no app. Pouco tempo? O Treino Express cabe em 15 a 45 minutos.',
    funcoes: ['dia01', 'dia12', 'dia11'],
    reel: 'dia01',
  },
  {
    n: '02',
    verbo: 'Execute',
    titulo: 'Na academia, tudo a um toque.',
    texto:
      'O descanso começa sozinho, com o tempo certo de cada exercício. A calculadora mostra as anilhas de cada lado. Drop-set, rest-pause e cluster têm registro próprio. Dúvida no meio da série? Toque no ? e pergunte.',
    funcoes: ['dia09', 'dia03', 'dia05', 'dia13'],
    reel: 'dia09',
  },
  {
    n: '03',
    verbo: 'Evolua',
    titulo: 'Veja o progresso acontecer.',
    texto:
      'Relatório depois de cada treino, avaliação física com protocolo de 7 dobras, Iron Rank somando cada quilo levantado — e, no VIP, periodização de 4 a 8 semanas.',
    funcoes: ['dia04', 'dia08', 'dia10', 'dia15'],
    reel: 'dia04',
  },
]

type Capitulo = (typeof CAPITULOS)[number]

function Etapa({ c }: { c: Capitulo }) {
  const reel = reelPorSlug(c.reel)
  return (
    <div className="flex flex-col justify-center py-12 lg:min-h-[85svh]">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
      >
        <p className="font-mono text-sm tracking-[0.15em] text-gold">
          {c.n} · {c.verbo.toUpperCase()}
        </p>
        <h3 className="mt-3 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-bold leading-[1.04] tracking-[-0.03em]">
          {c.titulo}
        </h3>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/70">{c.texto}</p>
        <ul className="mt-7 flex flex-wrap gap-2">
          {c.funcoes.map((slug) => (
            <li key={slug} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/80">
              {reelPorSlug(slug).titulo}
            </li>
          ))}
        </ul>
        {/* No celular não há vídeo fixo ao lado: cada etapa mostra o seu. */}
        <div className="mt-10 w-[min(72vw,300px)] overflow-hidden rounded-[28px] border border-white/10 bg-ink-2 lg:hidden">
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
  )
}

export default function StoryScroll() {
  const [ativo, setAtivo] = useState(0)
  const reel = reelPorSlug(CAPITULOS[ativo].reel)

  // Qual etapa está no meio da tela sai do PROGRESSO da rolagem sobre a coluna
  // de etapas: 0 quando o topo dela cruza o centro da tela, 1 quando o fim
  // cruza. Conta direta num ouvinte de rolagem, por dois motivos medidos no
  // navegador (26/09/2026): (1) a detecção por visibilidade de cada etapa
  // falhava com etapas altas (85svh) e prendia o vídeo na etapa anterior;
  // (2) o `useScroll` do Motion 12 anima pela linha do tempo NATIVA do
  // navegador (ViewTimeline) e aí não entrega o progresso ao JavaScript — o
  // `change` nunca disparava e o vídeo nunca trocava.
  const coluna = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let quadro = 0
    const medir = () => {
      quadro = 0
      const el = coluna.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const i = etapaAtiva(r.top, r.height, window.innerHeight, CAPITULOS.length)
      setAtivo((atual) => (atual === i ? atual : i))
    }
    const agendar = () => {
      if (!quadro) quadro = window.requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', agendar, { passive: true })
    window.addEventListener('resize', agendar)
    return () => {
      window.removeEventListener('scroll', agendar)
      window.removeEventListener('resize', agendar)
      if (quadro) window.cancelAnimationFrame(quadro)
    }
  }, [])

  return (
    <section id="como-funciona" className="relative scroll-mt-20 py-24 md:py-32">
      <div aria-hidden="true" className="absolute left-1/2 top-1/3 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-gold/[0.06] blur-[160px]" />
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeader
          eyebrow="como funciona"
          titulo={
            <>
              Monte. Execute. <span className="lp-gold-text">Evolua.</span>
            </>
          }
          texto="Do primeiro treino ao próximo recorde, cada etapa tem uma ferramenta feita pra academia — com a barra na mão e 30 segundos de descanso."
        />

        <div className="mt-8 grid gap-10 lg:mt-4 lg:grid-cols-2 lg:gap-24">
          <div ref={coluna}>
            {CAPITULOS.map((c) => (
              <Etapa key={c.n} c={c} />
            ))}
          </div>

          <div className="relative hidden lg:block">
            <div className="sticky top-24 flex h-[calc(100svh-8rem)] items-center justify-center">
              <div className="relative w-[320px]">
                <div aria-hidden="true" className="absolute -inset-10 rounded-[56px] bg-gold/15 blur-3xl" />
                <div className="relative aspect-[9/16] overflow-hidden rounded-[34px] border border-white/10 bg-ink-2">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={reel.slug}
                      initial={{ opacity: 0, scale: 1.04 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.45, ease: EASE_OUT }}
                      className="absolute inset-0"
                    >
                      <ReelVideo
                        src={videoDo(reel.slug)}
                        poster={capaDo(reel.slug)}
                        label={`Vídeo: ${reel.titulo}`}
                        className="h-full w-full object-cover"
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div aria-hidden="true" className="mt-6 flex justify-center gap-2">
                  {CAPITULOS.map((c, i) => (
                    <span
                      key={c.n}
                      className={`h-1.5 rounded-full transition-all duration-500 ${i === ativo ? 'w-8 bg-gold' : 'w-1.5 bg-white/25'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
