'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const PROGRESS_DURATION = 2200

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
    camera.position.z = 6

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    })
    renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

    const geometry = new THREE.TorusKnotGeometry(1.2, 0.4, 128, 16)
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#34d399'),
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    })
    const knot = new THREE.Mesh(geometry, material)
    scene.add(knot)

    const dotGeo = new THREE.BufferGeometry()
    const dotCount = 600
    const positions = new Float32Array(dotCount * 3)
    for (let i = 0; i < dotCount * 3; i++) positions[i] = (Math.random() - 0.5) * 30
    dotGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const dotMat = new THREE.PointsMaterial({
      color: '#34d399',
      size: 0.03,
      transparent: true,
      opacity: 0.3,
    })
    const dots = new THREE.Points(dotGeo, dotMat)
    scene.add(dots)

    const start = performance.now()

    function animate(now: number) {
      const elapsed = (now - start) / 1000

      knot.rotation.x = elapsed * 0.3
      knot.rotation.y = elapsed * 0.5
      knot.rotation.z = elapsed * 0.15
      dots.rotation.y = elapsed * 0.02

      const prog = Math.min((now - start) / PROGRESS_DURATION, 1)
      progressRef.current = prog
      knot.material.opacity = 0.3 + 0.4 * (1 - prog)
      knot.scale.setScalar(1 - 0.15 * prog)

      renderer.render(scene, camera)
      rafRef.current = requestAnimationFrame(animate)

      if (prog >= 1) {
        cancelAnimationFrame(rafRef.current)
        renderer.dispose()
        onDone()
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    const handleResize = () => {
      camera.aspect = canvas.clientWidth / canvas.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      renderer.dispose()
      window.removeEventListener('resize', handleResize)
    }
  }, [onDone])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />

      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
          <h1 className="bg-linear-to-r from-emerald-400 via-emerald-300 to-emerald-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
            CodeSpectra
          </h1>
        </div>

        <div className="w-48 sm:w-64">
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300 transition-all duration-150 ease-linear"
              style={{ width: `${progressRef.current * 100}%` }}
            />
          </div>
          <LoadingProgress />
        </div>
      </div>
    </div>
  )
}

function LoadingProgress() {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const start = performance.now()
    let raf = 0

    function tick(now: number) {
      const pct = Math.min(((now - start) / PROGRESS_DURATION) * 100, 100)
      if (ref.current) ref.current.textContent = `${Math.round(pct)}%`
      if (pct < 100) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <span
      ref={ref}
      className="mt-2 block text-center font-mono text-xs tracking-widest text-zinc-500"
    >
      0%
    </span>
  )
}
