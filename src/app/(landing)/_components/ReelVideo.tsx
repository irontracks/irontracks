'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Vídeo de reel que só baixa e toca quando está na tela.
 *
 * A página tem ~20 vídeos. Com `src` desde o início, o navegador começaria a
 * baixar todos (~15 MB) na abertura — num 4G de academia, a página travaria
 * antes de mostrar o primeiro. Aqui o `src` só entra quando o vídeo chega perto
 * da tela, e o vídeo pausa ao sair (não gasta bateria nem banda tocando o que
 * ninguém vê). Até lá aparece a capa (`poster`).
 *
 * `muted` + `playsInline` são obrigatórios para o iPhone deixar tocar sozinho.
 * Quem pede "reduzir movimento" no sistema vê só a capa.
 *
 * Guard: _components/__tests__/ReelVideo.test.tsx.
 */
export default function ReelVideo({
  src,
  poster,
  label,
  className,
  prioritario = false,
}: {
  src: string
  poster: string
  label: string
  className?: string
  /** O vídeo do topo: entra já com `src` para tocar assim que a página abrir. */
  prioritario?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const reduzir = useReducedMotion()
  const [perto, setPerto] = useState(prioritario)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) setPerto(true)
        setVisivel(entrada.isIntersecting && entrada.intersectionRatio > 0.25)
      },
      { rootMargin: '300px 0px', threshold: [0, 0.25, 0.6] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || !perto) return
    if (visivel && !reduzir) {
      el.play().catch(() => {
        // Autoplay recusado (economia de dados, modo de baixa energia): fica a capa.
      })
    } else {
      el.pause()
    }
  }, [perto, visivel, reduzir])

  // O `src` depende SÓ de `perto` — nunca da preferência de movimento. Ela vale
  // `null` no servidor e o valor real no navegador: misturá-la aqui fazia o HTML
  // do servidor (com src) divergir da hidratação (sem src), e o React não corrige
  // atributo divergente. A preferência decide só se TOCA; sem play, `preload`
  // none/metadata não baixa o vídeo.
  return (
    <video
      ref={ref}
      className={className}
      src={perto ? src : undefined}
      poster={poster}
      muted
      loop
      playsInline
      preload={prioritario ? 'metadata' : 'none'}
      disablePictureInPicture
      disableRemotePlayback
      aria-label={label}
      tabIndex={-1}
    />
  )
}
