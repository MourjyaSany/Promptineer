import { useEffect, useRef } from 'react'

/** Global ambient background: dotted grid, floating particles, mouse light. */
export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let width = 0
    let height = 0

    const particles = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.8 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.00022,
      vy: (Math.random() - 0.5) * 0.00016,
      alpha: 0.15 + Math.random() * 0.35,
    }))

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const tick = () => {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -0.02) p.x = 1.02
        if (p.x > 1.02) p.x = -0.02
        if (p.y < -0.02) p.y = 1.02
        if (p.y > 1.02) p.y = -0.02
        ctx.beginPath()
        ctx.arc(p.x * width, p.y * height, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(109, 167, 236, ${p.alpha})`
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onMove = (e: MouseEvent) => {
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${e.clientX - 300}px, ${e.clientY - 300}px)`
      }
    }
    window.addEventListener('mousemove', onMove)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[#1e1f22]" />
      <div className="absolute inset-0 dot-grid" />
      <div
        className="absolute -top-40 -left-40 h-[34rem] w-[34rem] rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(57,135,229,0.16) 0%, transparent 65%)' }}
      />
      <div
        className="absolute -bottom-52 -right-32 h-[38rem] w-[38rem] rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(28,92,171,0.20) 0%, transparent 65%)' }}
      />
      <div
        ref={glowRef}
        className="absolute h-[600px] w-[600px] rounded-full will-change-transform"
        style={{
          background: 'radial-gradient(circle, rgba(57,135,229,0.14) 0%, transparent 60%)',
          transition: 'transform 0.35s cubic-bezier(0.2, 0.8, 0.3, 1)',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
