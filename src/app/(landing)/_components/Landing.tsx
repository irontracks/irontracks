'use client'

import { useCallback, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import type { PlanosPublicos } from '@/lib/planos/publicos'
import AndroidModal from './AndroidModal'
import FinalCta from './FinalCta'
import Footer from './Footer'
import Hero from './Hero'
import Highlights from './Highlights'
import Marquee from './Marquee'
import Nav from './Nav'
import Numbers from './Numbers'
import Pricing from './Pricing'
import ReelCarousel from './ReelCarousel'
import StoryScroll from './StoryScroll'
import VipSection from './VipSection'

/**
 * Landing do IronTracks (raiz do domínio) — o cartão de visita do app.
 *
 * `planos` vem do servidor (`lerPlanosPublicos`); `null` = seção de preços some —
 * preço incompleto ou inventado é pior que nenhum.
 *
 * `MotionConfig reducedMotion="user"`: quem pede "reduzir movimento" no sistema
 * recebe a página sem deslocamentos (Motion desliga transformações e mantém só
 * opacidade), e os vídeos ficam na capa (ver `ReelVideo`).
 */
export default function Landing({ planos = null }: { planos?: PlanosPublicos | null }) {
  const [android, setAndroid] = useState(false)
  const abrirAndroid = useCallback(() => setAndroid(true), [])
  const fecharAndroid = useCallback(() => setAndroid(false), [])

  return (
    <MotionConfig reducedMotion="user">
      {android && <AndroidModal onClose={fecharAndroid} />}
      <Nav comPlanos={planos != null} />
      <main>
        <Hero onAndroid={abrirAndroid} />
        <Marquee />
        <ReelCarousel />
        <StoryScroll />
        <Highlights />
        <Numbers />
        <VipSection />
        {planos && <Pricing planos={planos} />}
        <FinalCta onAndroid={abrirAndroid} />
      </main>
      <Footer />
    </MotionConfig>
  )
}
