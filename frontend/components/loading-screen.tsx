'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const ANIMATION_DURATION = 2000
const SAFETY_TIMEOUT = 5000

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let renderer: THREE.WebGLRenderer | null = null
    let knot: THREE.Mesh | null = null
    let dots: THREE.Points | null = null
    let raf = 0

    try {
      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(
        45, canvas.clientWidth / canvas.clientHeight, 0.1, 100,
      )
      camera.position.z = 6

      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
      renderer.setSize(canvas.clientWidth, canvas.clientHeight)
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

      const geo = new THREE.TorusKnotGeometry(1.2, 0.4, 128, 16)
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#34d399'),
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      })
      knot = new THREE.Mesh(geo, mat)
      scene.add(knot)

      const dotPositions = new Float32Array(600 * 3)
      for (let i = 0; i < dotPositions.length; i++) dotPositions[i] = (Math.random() - 0.5) * 30
      const dotGeo = new THREE.BufferGeometry()
      dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3))
      dots = new THREE.Points(
        dotGeo,
        new THREE.PointsMaterial({ color: '#34d399', size: 0.03, transparent: true, opacity: 0.3 }),
      )
      scene.add(dots)

      const start = performance.now()

      function animate(now: number) {
        const elapsed = (now - start) / 1000
        const pct = Math.min((now - start) / ANIMATION_DURATION, 1)

        knot!.rotation.x = elapsed * 0.3
        knot!.rotation.y = elapsed * 0.5
        knot!.rotation.z = elapsed * 0.15
        dots!.rotation.y = elapsed * 0.02
        knot!.scale.setScalar(1 - 0.15 * pct)
        knot!.material.opacity = 0.3 + 0.4 * (1 - pct)

        renderer!.render(scene!, camera!)
        setProgress(pct)

        if (pct >= 1) {
          cancelAnimationFrame(raf)
          renderer!.dispose()
          onDone()
          return
        }
        raf = requestAnimationFrame(animate)
      }

      raf = requestAnimationFrame(animate)

      const onResize = () => {
        camera!.aspect = canvas!.clientWidth / canvas!.clientHeight
        camera!.updateProjectionMatrix()
        renderer!.setSize(canvas!.clientWidth, canvas!.clientHeight)
      }
      window.addEventListener('resize', onResize)

      return () => {
        cancelAnimationFrame(raf)
        renderer?.dispose()
        window.removeEventListener('resize', onResize)
      }
    } catch {
      // Three.js init failed — bail out immediately
      onDone()
      return
    }
  }, [onDone])

  // Safety timeout: force-dismiss if animation hangs
  useEffect(() => {
    const t = setTimeout(onDone, SAFETY_TIMEOUT)
    return () => clearTimeout(t)
  }, [onDone])

  const pct = Math.round(progress * 100)

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
          <h1 className="bg-linear-to-r from-emerald-400 via-emerald-300 to-emerald-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
            CodeSpectra
          </h1>
        </div>

        <div className="w-48 sm:w-64">
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300 transition-[width] duration-150 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="mt-2 block text-center font-mono text-xs tracking-widest text-zinc-500">
            {pct}%
          </span>
        </div>
      </div>
    </div>
  )
}
