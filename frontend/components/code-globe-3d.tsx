'use client'

import { useEffect, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

function CodeGlobe() {
  const groupRef = useRef<THREE.Group>(null)
  const particlesRef = useRef<THREE.Points>(null)

  useEffect(() => {
    if (!particlesRef.current) return

    // Characters to use
    const chars = ['[', ']', '{', '}', '(', ')', 'L', 'r', 'F', 'T', 'f', '|', '—', '├', '┤', 'r']
    
    // Create canvas textures for each character
    const textureCache: { [key: string]: THREE.Texture } = {}
    
    const createCharTexture = (char: string) => {
      if (textureCache[char]) return textureCache[char]
      
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')!
      
      ctx.fillStyle = 'transparent'
      ctx.fillRect(0, 0, 64, 64)
      
      ctx.fillStyle = 'rgba(150, 150, 150, 0.8)'
      ctx.font = 'bold 48px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(char, 32, 32)
      
      const texture = new THREE.CanvasTexture(canvas)
      texture.magFilter = THREE.LinearFilter
      texture.minFilter = THREE.LinearFilter
      textureCache[char] = texture
      
      return texture
    }

    // Generate positions in a sphere
    const count = 500
    const positions = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    const charIndices = new Float32Array(count)
    
    for (let i = 0; i < count; i++) {
      // Random position on sphere
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      const radius = 3
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)
      
      // Random scale
      scales[i] = 0.3 + Math.random() * 0.7
      
      // Random character
      charIndices[i] = Math.floor(Math.random() * chars.length)
    }

    particlesRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particlesRef.current.geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1))
  }, [])

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.0005
    }
  })

  return (
    <group ref={groupRef}>
      <points ref={particlesRef}>
        <bufferGeometry />
        <pointsMaterial
          size={0.5}
          sizeAttenuation
          color="#999999"
          transparent
          opacity={0.6}
        />
      </points>
    </group>
  )
}

export function CodeGlobeViewer() {
  return (
    <Canvas className="w-full h-full" dpr={[1, 2]}>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} />
      <CodeGlobe />
      <OrbitControls 
        autoRotate 
        autoRotateSpeed={2}
        enableZoom={false}
        enablePan={false}
      />
    </Canvas>
  )
}
