'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import ReelVideo from './ReelVideo'
import SectionHeader from './SectionHeader'
import { WatchIcon, WifiOffIcon } from './icons'
import { EASE_OUT } from './motion'
import { capaDo, reelPorSlug, videoDo } from './reels'

function Bloco({ children, className = '', atraso = 0 }: { children: ReactNode; className?: string; atraso?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, ease: EASE_OUT, delay: atraso }}
      className={`group relative overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-b from-ink-3 to-ink-2 p-7 transition-colors duration-500 hover:border-gold/35 md:p-9 ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold/10 opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100"
      />
      {children}
    </motion.div>
  )
}

function BlocoComVideo({
  slug,
  destaque,
  texto,
  largo = false,
  atraso,
}: {
  slug: string
  destaque: string
  texto: string
  largo?: boolean
  atraso?: number
}) {
  const reel = reelPorSlug(slug)
  return (
    <Bloco className={largo ? 'lg:col-span-2' : ''} atraso={atraso}>
      {/* Lado a lado só no bloco LARGO: no estreito (1/3 da grade) o texto
          ficava com ~120px e o título quebrava palavra por palavra. */}
      <div className={`relative flex h-full flex-col gap-8 ${largo ? 'sm:flex-row sm:items-center' : ''}`}>
        <div className="flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold">{reel.titulo}</p>
          <h3 className="mt-3 font-display text-[clamp(1.6rem,2.6vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.02em]">
            {destaque}
          </h3>
          <p className="mt-3 max-w-md leading-relaxed text-white/70">{texto}</p>
        </div>
        <div
          className={`mx-auto w-[min(56vw,190px)] shrink-0 overflow-hidden rounded-[22px] border border-white/10 bg-ink ${
            largo ? 'sm:mx-0 sm:w-[150px] lg:w-[170px]' : ''
          }`}
        >
          <div className="aspect-[9/16]">
            <ReelVideo
              src={videoDo(reel.slug)}
              poster={capaDo(reel.slug)}
              label={`Vídeo: ${reel.titulo}`}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>
    </Bloco>
  )
}

export default function Highlights() {
  return (
    <section id="alem" className="relative scroll-mt-20 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeader
          eyebrow="além do treino"
          titulo={
            <>
              O que acontece <span className="lp-gold-text">fora da série</span> também conta.
            </>
          }
          texto="Cardio, alimentação, stories e relógio — no mesmo app, sem pular de um para outro."
        />

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <BlocoComVideo
            slug="dia07"
            largo
            destaque="Corrida, bike ou caminhada com mapa ao vivo."
            texto="Distância, ritmo e rota no mapa enquanto você se move — e tudo salvo no histórico junto com a musculação."
          />
          <BlocoComVideo
            slug="dia14"
            atraso={0.08}
            destaque="Meta do dia com o que você já come."
            texto="Calorias e proteína do dia, montadas a partir dos alimentos que você registra."
          />
          <BlocoComVideo
            slug="dia06"
            destaque="O treino vira story em um toque."
            texto="Estilos prontos com os números da sessão, do jeito certo pra postar."
          />
          <BlocoComVideo
            slug="dia02"
            largo
            atraso={0.08}
            destaque="Aparelho ocupado? Troque sem perder o treino."
            texto="O app sugere o exercício equivalente para o mesmo músculo, e você segue do ponto em que parou."
          />
          <Bloco>
            <div className="relative">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
                <WatchIcon className="h-6 w-6" />
              </span>
              <h3 className="mt-6 font-display text-2xl font-bold leading-tight">Apple Watch e Apple Health</h3>
              <p className="mt-3 leading-relaxed text-white/70">
                Batimentos, frequência de repouso, HRV, calorias e passos entram no app pelo Apple Health.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/60">
                Requer iPhone com Apple Watch. No Android, a integração de saúde ainda não está disponível.
              </p>
            </div>
          </Bloco>
          <Bloco className="lg:col-span-2" atraso={0.08}>
            <div className="relative flex h-full flex-col justify-between gap-8 md:flex-row md:items-center">
              <div className="max-w-lg">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
                  <WifiOffIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-6 font-display text-[clamp(1.6rem,2.6vw,2.2rem)] font-bold leading-tight">
                  Academia sem sinal? Tanto faz.
                </h3>
                <p className="mt-3 leading-relaxed text-white/70">
                  Registre as séries normalmente. O app sincroniza quando a conexão voltar, sem perder um dado.
                </p>
              </div>
              <div aria-hidden="true" className="flex gap-3 font-mono text-sm">
                {['Offline', 'Sincroniza', 'Salvo'].map((t, i) => (
                  <span
                    key={t}
                    className={`rounded-xl border px-4 py-3 ${
                      i === 2 ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/10 bg-white/[0.03] text-white/70'
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </Bloco>
        </div>
      </div>
    </section>
  )
}
