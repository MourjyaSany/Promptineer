import { useEffect, useRef } from 'react'

interface GlobeProps {
  /** idle | thinking */
  mode?: 'idle' | 'thinking'
  size?: number
  className?: string
}

interface Dot {
  theta: number
  phi: number
  base: number // base brightness
}

/**
 * Dotted 3-D globe rendered on a 2-D canvas: ~1300 points on a sphere,
 * slow rotation, mouse tilt, expansion + pulse while the AI is thinking,
 * and orbiting particles.
 */
export default function Globe({ mode = 'idle', size = 460, className = '' }: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Fibonacci sphere distribution
    const COUNT = 1300
    const dots: Dot[] = []
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2
      const radius = Math.sqrt(1 - y * y)
      const theta = golden * i
      dots.push({
        theta: Math.atan2(radius * Math.sin(theta), radius * Math.cos(theta)),
        phi: Math.acos(y),
        base: 0.35 + Math.random() * 0.65,
      })
    }

    const orbiters = Array.from({ length: 14 }, (_, i) => ({
      angle: (i / 14) * Math.PI * 2,
      tilt: Math.random() * Math.PI,
      speed: 0.004 + Math.random() * 0.006,
      dist: 1.18 + Math.random() * 0.22,
    }))

    let rotation = 0
    let tiltX = 0
    let tiltY = 0
    let targetTiltX = 0
    let targetTiltY = 0
    let scale = 1
    let energy = 0 // 0 idle → 1 thinking
    let raf = 0
    let time = 0

    const onMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      targetTiltY = nx * 0.95
      targetTiltX = ny * 0.75
    }
    window.addEventListener('mousemove', onMove)

    const onScroll = () => {
      rotation += 0.0018
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const cx = size / 2
    const cy = size / 2
    const baseRadius = size * 0.34

    const tick = () => {
      time += 1
      const thinking = modeRef.current === 'thinking'
      energy += ((thinking ? 1 : 0) - energy) * 0.045
      const targetScale = 1 + energy * 0.1 + (thinking ? Math.sin(time * 0.08) * 0.02 : 0)
      scale += (targetScale - scale) * 0.08
      rotation += 0.0022 + energy * 0.006
      tiltX += (targetTiltX - tiltX) * 0.11
      tiltY += (targetTiltY - tiltY) * 0.11

      ctx.clearRect(0, 0, size, size)

      // halo
      const haloRadius = baseRadius * scale * (1.25 + energy * 0.2)
      const halo = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, haloRadius)
      halo.addColorStop(0, `rgba(57, 135, 229, ${0.05 + energy * 0.09})`)
      halo.addColorStop(1, 'rgba(57, 135, 229, 0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2)
      ctx.fill()

      // connection wave rings while thinking
      if (energy > 0.04) {
        for (let ring = 0; ring < 2; ring++) {
          const progress = ((time * 0.012 + ring * 0.5) % 1)
          const rr = baseRadius * scale * (1 + progress * 0.45)
          ctx.beginPath()
          ctx.setLineDash([2, 7])
          ctx.arc(cx, cy, rr, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(42, 120, 214, ${(1 - progress) * 0.35 * energy})`
          ctx.lineWidth = 1.1
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      const radius = baseRadius * scale
      const sinR = Math.sin(rotation)
      const cosR = Math.cos(rotation)
      const sinTX = Math.sin(tiltX)
      const cosTX = Math.cos(tiltX)
      const sinTY = Math.sin(tiltY)
      const cosTY = Math.cos(tiltY)

      for (const dot of dots) {
        const sp = Math.sin(dot.phi)
        let x = sp * Math.cos(dot.theta)
        let y = Math.cos(dot.phi)
        let z = sp * Math.sin(dot.theta)

        // rotate around Y
        let x1 = x * cosR - z * sinR
        let z1 = x * sinR + z * cosR
        // mouse tilt (X then Y axes)
        let y1 = y * cosTX - z1 * sinTX
        let z2 = y * sinTX + z1 * cosTX
        const x2 = x1 * cosTY - z2 * sinTY
        const z3 = x1 * sinTY + z2 * cosTY

        const depth = (z3 + 1) / 2 // 0 back → 1 front
        const px = cx + x2 * radius
        const py = cy + y1 * radius
        const twinkle = thinking ? 0.75 + 0.25 * Math.sin(time * 0.12 + dot.theta * 7) : 1
        const alpha = (0.08 + depth * 0.75) * dot.base * twinkle * (0.75 + energy * 0.45)
        const dotSize = (0.6 + depth * 1.15) * (1 + energy * 0.25)

        ctx.beginPath()
        ctx.arc(px, py, dotSize, 0, Math.PI * 2)
        ctx.fillStyle =
          depth > 0.82
            ? `rgba(28, 92, 171, ${alpha})`
            : `rgba(57, 135, 229, ${alpha})`
        ctx.fill()
      }

      // orbiting particles
      for (const orbiter of orbiters) {
        orbiter.angle += orbiter.speed * (1 + energy * 2.4)
        const ox = Math.cos(orbiter.angle) * radius * orbiter.dist
        const oz = Math.sin(orbiter.angle) * radius * orbiter.dist
        const oy = Math.sin(orbiter.angle * 0.7 + orbiter.tilt) * radius * 0.18
        const depth = (oz / (radius * orbiter.dist) + 1) / 2
        ctx.beginPath()
        ctx.arc(cx + ox, cy + oy, 1.3 + depth * 1.4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(42, 120, 214, ${0.15 + depth * 0.5})`
        ctx.fill()
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('scroll', onScroll)
    }
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}
