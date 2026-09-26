'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'
import ReelVideo from './ReelVideo'
import StoreButtons from './StoreButtons'
import { StarIcon } from './icons'
import { EASE_OUT } from './motion'
import { HERO_CAPA, HERO_VIDEO } from './reels'

const PALAVRAS = ['Pare', 'de', 'treinar', 'feito']

// Ancorados pela BORDA do vídeo (entram só 24px nele), longe do topo: cada reel
// traz a própria legenda lá em cima, e um balão por cima dela a escondia.
const CHIPS = [
  { texto: 'IA monta o treino', pos: 'right-[calc(100%-24px)] top-[36%]', atraso: 0 },
  { texto: 'Descanso automático', pos: 'left-[calc(100%-24px)] top-[58%]', atraso: 1.2 },
  { texto: 'Iron Rank', pos: 'right-[calc(100%-24px)] bottom-[12%]', atraso: 2.4 },
]

export default function Hero({ onAndroid }: { onAndroid: () => void }) {
  const secao = useRef<HTMLElement>(null)
  const reduzir = useReducedMotion()

  // Luz dourada que acompanha o ponteiro.
  const luzX = useMotionValue(62)
  const luzY = useMotionValue(38)
  const luz = useMotionTemplate`radial-gradient(640px circle at ${luzX}% ${luzY}%, rgba(245,184,0,0.13), transparent 62%)`

  // Inclinação 3D do vídeo (só com mouse — no toque ela brigaria com a rolagem).
  const giroX = useSpring(0, { stiffness: 110, damping: 16 })
  const giroY = useSpring(0, { stiffness: 110, damping: 16 })

  const aoMover = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    luzX.set(px * 100)
    luzY.set(py * 100)
    if (!reduzir && e.pointerType === 'mouse') {
      giroY.set((px - 0.5) * 16)
      giroX.set(-(py - 0.5) * 10)
    }
  }
  const aoSair = () => {
    giroX.set(0)
    giroY.set(0)
  }

  // Profundidade na rolagem só em tela larga: no celular texto e vídeo ficam
  // EMPILHADOS, e o texto descendo enquanto o vídeo sobe fazia o vídeo cobrir a
  // linha de plataformas (visto a 375px).
  const [telaLarga, setTelaLarga] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const atualizar = () => setTelaLarga(mq.matches)
    atualizar()
    mq.addEventListener('change', atualizar)
    return () => mq.removeEventListener('change', atualizar)
  }, [])

  const { scrollYProgress } = useScroll({ target: secao, offset: ['start start', 'end start'] })
  const textoY = useTransform(scrollYProgress, [0, 1], [0, 140])
  const textoOpacidade = useTransform(scrollYProgress, [0, 0.75], [1, 0])
  const videoY = useTransform(scrollYProgress, [0, 1], [0, -80])

  return (
    <section
      ref={secao}
      onPointerMove={aoMover}
      onPointerLeave={aoSair}
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden pb-20 pt-32 md:pt-36"
    >
      {/* Fundo: grade, luz que segue o ponteiro e dois brilhos. */}
      <div aria-hidden="true" className="lp-grid absolute inset-0 -z-10" />
      <motion.div aria-hidden="true" style={{ background: luz }} className="absolute inset-0 -z-10" />
      <div aria-hidden="true" className="absolute -right-40 top-10 -z-10 h-[520px] w-[520px] rounded-full bg-gold/15 blur-[140px]" />
      <div aria-hidden="true" className="absolute -left-40 bottom-0 -z-10 h-[420px] w-[420px] rounded-full bg-ember/10 blur-[140px]" />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-16 px-5 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.div style={{ y: telaLarga ? textoY : 0, opacity: textoOpacidade }}>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/75 backdrop-blur"
          >
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-[#2ae870] shadow-[0_0_12px_#2ae870]" />
            Sem desculpas · Sem preguiça
          </motion.p>

          <h1 className="mt-7 font-display text-[clamp(3.1rem,8.4vw,6.9rem)] font-bold leading-[0.93] tracking-[-0.045em]">
            {PALAVRAS.map((p, i) => (
              <span key={p} className="mr-[0.22em] inline-block overflow-hidden pb-[0.1em] align-bottom">
                <motion.span
                  className="inline-block"
                  initial={{ y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.9, ease: EASE_OUT }}
                >
                  {p}
                </motion.span>
              </span>
            ))}
            <span className="relative inline-block overflow-hidden pb-[0.1em] align-bottom">
              <motion.span
                className="lp-gold-text inline-block"
                initial={{ y: '110%' }}
                animate={{ y: 0 }}
                transition={{ delay: 0.15 + PALAVRAS.length * 0.08, duration: 0.9, ease: EASE_OUT }}
              >
                amador.
              </motion.span>
              <motion.span
                aria-hidden="true"
                className="absolute bottom-[0.04em] left-0 h-[0.07em] w-full origin-left rounded-full bg-gradient-to-r from-gold to-ember"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.95, duration: 0.8, ease: EASE_OUT }}
              />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8, ease: EASE_OUT }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-white/70 md:text-xl"
          >
            Cansou de planilha no papel e de app que trava? O IronTracks é a ferramenta de quem leva ferro a sério:
            a IA monta o treino, o descanso corre sozinho e cada quilo vira progresso.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.8, ease: EASE_OUT }}
            className="mt-10"
          >
            <StoreButtons onAndroid={onAndroid} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.05, duration: 0.8 }}
            className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70"
          >
            <span className="flex gap-0.5 text-gold">
              {Array.from({ length: 5 }).map((_, i) => (
                <StarIcon key={i} />
              ))}
            </span>
            <span className="font-medium text-white">Nota 5,0 na App Store</span>
            <span aria-hidden="true" className="h-4 w-px bg-white/15" />
            <span>iPhone · Android · Navegador</span>
          </motion.div>
        </motion.div>

        <motion.div
          style={{ y: telaLarga ? videoY : 0, rotateX: giroX, rotateY: giroY, transformPerspective: 1200 }}
          initial={{ opacity: 0, scale: 0.9, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 1.1, ease: EASE_OUT }}
          className="relative mx-auto w-[min(76vw,340px)]"
        >
          <div aria-hidden="true" className="absolute -inset-12 rounded-[56px] bg-gold/20 blur-3xl" />
          {/* Borda de luz girando em volta do vídeo. */}
          <div aria-hidden="true" className="absolute -inset-[2px] overflow-hidden rounded-[36px]">
            <div className="absolute inset-[-60%] animate-spin-slow bg-[conic-gradient(from_0deg,transparent_0deg,rgba(245,184,0,0.95)_50deg,rgba(255,122,26,0.6)_90deg,transparent_140deg,transparent_360deg)] motion-reduce:animate-none" />
          </div>
          <div className="relative aspect-[9/16] overflow-hidden rounded-[34px] bg-ink-2 ring-1 ring-white/10">
            <ReelVideo
              prioritario
              src={HERO_VIDEO}
              poster={HERO_CAPA}
              label="Vídeo: a IA do IronTracks montando um treino"
              className="h-full w-full object-cover"
            />
          </div>

          {CHIPS.map((c) => (
            <motion.div
              key={c.texto}
              aria-hidden="true"
              className={`absolute hidden items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-black/70 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.9)] backdrop-blur-md sm:flex ${c.pos}`}
              animate={reduzir ? undefined : { y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: c.atraso }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_10px_#f5b800]" />
              {c.texto}
            </motion.div>
          ))}
        </motion.div>
      </div>

      <motion.a
        href="#funcoes"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 1 }}
        className="absolute bottom-6 left-1/2 hidden h-11 -translate-x-1/2 flex-col items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/60 md:flex"
      >
        Role
        <span className="relative h-8 w-px overflow-hidden bg-white/15">
          <motion.span
            className="absolute left-0 top-0 h-3 w-px bg-gold"
            animate={reduzir ? undefined : { y: [-12, 32] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </span>
      </motion.a>
    </section>
  )
}
