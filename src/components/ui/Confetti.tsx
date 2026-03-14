'use client'

import React, { useEffect, useRef, memo } from 'react'

type ConfettiProps = {
  /** Whether the confetti animation is active */
  active: boolean
  /** Duration in ms before auto-hiding (default 2500) */
  duration?: number
  /** Number of particles (default 40) */
  count?: number
  /** Color palette (default: gold/amber tones) */
  colors?: string[]
  /** Called when animation completes */
  onComplete?: () => void
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
  opacity: number
  shape: 'rect' | 'circle' | 'star'
}

const GOLD_COLORS = [
  '#fbbf24', '#f59e0b', '#d97706', '#fde68a',
  '#fef3c7', '#92400e', '#ffffff', '#f0c850',
]

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2
    const method = i === 0 ? 'moveTo' : 'lineTo'
    ctx[method](cx + r * Math.cos(angle), cy + r * Math.sin(angle))
  }
  ctx.closePath()
  ctx.fill()
}

const Confetti = memo(function Confetti({
  active,
  duration = 2500,
  count = 40,
  colors = GOLD_COLORS,
  onComplete,
}: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (!active) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to viewport
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    const w = rect.width
    const h = rect.height

    // Create particles — burst from center-top
    const particles: Particle[] = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 3 + Math.random() * 8
      const shapes: Particle['shape'][] = ['rect', 'circle', 'star']
      return {
        x: w / 2 + (Math.random() - 0.5) * 60,
        y: h * 0.35 + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        opacity: 1,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
      }
    })

    startRef.current = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)

      ctx.clearRect(0, 0, w, h)

      particles.forEach((p) => {
        // Physics
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.15 // gravity
        p.vx *= 0.99 // air resistance
        p.rotation += p.rotationSpeed
        p.opacity = Math.max(0, 1 - progress * 1.2)

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        } else if (p.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          drawStar(ctx, 0, 0, p.size / 2)
        }

        ctx.restore()
      })

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        ctx.clearRect(0, 0, w, h)
        onComplete?.()
      }
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
    }
  }, [active, duration, count, colors, onComplete])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[9999] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
      aria-hidden="true"
    />
  )
})

export default Confetti
