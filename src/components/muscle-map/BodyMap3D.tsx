'use client'

import React, { memo, useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MUSCLE_GROUPS, type MuscleId } from '@/utils/muscleMapConfig'

/**
 * Mapa muscular 3D — o mesmo dado do BodyMapSvg, girável com o dedo e o mouse.
 *
 * O modelo (`/models/body-map.glb`) sai de `scripts/muscle-map-3d/build-glb.py`
 * a partir do Z-Anatomy (CC BY-SA 4.0). Cada grupo é uma malha nomeada com o
 * MuscleId do app: o casamento é POR NOME, então renomear no pipeline apaga a
 * pintura aqui SEM erro nenhum — a tela continua bonita e mente sobre o volume
 * da semana. Guard: `__tests__/bodyMap3dModelContract.test.ts`.
 *
 * A cor vem pronta do servidor (`muscles[id].color`), a mesma do 2D: a escala
 * NENHUM/BAIXO/NA META/ALTO/ACIMA não é reimplementada aqui.
 *
 * three.js PURO, sem @react-three/fiber nem drei, de propósito: os dois
 * estendem `JSX.IntrinsicElements` e, com o React 19 deste projeto, isso derruba
 * 14 arquivos que nada têm a ver com 3D (admin-panel, ProfilePage...) com
 * `Type 'number' is not assignable to type 'never'`. Medido pacote a pacote —
 * basta um arquivo importar o fiber para o typecheck do app inteiro quebrar.
 */

const MODEL_URL = '/models/body-map.glb'
/** O decoder é servido pelo próprio app: a CSP bloqueia CDN e o app nativo não
 *  pode depender de terceiro para desenhar a tela. */
const DRACO_PATH = '/draco/'

const MUSCLE_IDS = new Set<string>(MUSCLE_GROUPS.map((m) => m.id))

const BODY_COLOR = 0x3a3a3c
const UNTRAINED_COLOR = 0x434347

type MuscleState = { color?: string; sets?: number; ratio?: number; label?: string }

type Props = {
  view: 'front' | 'back'
  muscles: Record<string, MuscleState>
  onSelect?: (muscleId: MuscleId) => void
  selected?: MuscleId | null
  className?: string
}

/** Ângulo do corpo, em radianos, para cada vista dos botões FRENTE/COSTAS. */
const VIEW_ANGLE: Record<'front' | 'back', number> = { front: 0, back: Math.PI }

type Stage = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  pivot: THREE.Group
  meshes: Map<string, THREE.Mesh>
  materials: Map<string, THREE.MeshStandardMaterial>
  raycaster: THREE.Raycaster
  targetAngle: number
}

function buildLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(2, 3, 4)
  const fill = new THREE.DirectionalLight(0xffffff, 0.6)
  fill.position.set(-3, 1, 2)
  const rim = new THREE.DirectionalLight(0xffffff, 0.9)
  rim.position.set(0, 1, -4)
  scene.add(key, fill, rim)
}

const BodyMap3D = memo(function BodyMap3D({ view, muscles, onSelect, selected, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const needsRenderRef = useRef(true)
  // Props lidas de dentro do loop e dos handlers: sem ref, a closure do efeito
  // de montagem congelaria os valores do primeiro render.
  const musclesRef = useRef(muscles)
  const selectedRef = useRef(selected)
  const onSelectRef = useRef(onSelect)
  musclesRef.current = muscles
  selectedRef.current = selected
  onSelectRef.current = onSelect

  const paint = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.materials.forEach((mat, name) => {
      if (name === 'body') {
        mat.color.setHex(BODY_COLOR)
        return
      }
      if (!MUSCLE_IDS.has(name)) return
      const state = musclesRef.current[name]
      const ratio = Number(state?.ratio || 0)
      const isSelected = name === selectedRef.current
      if (ratio <= 0) {
        mat.color.setHex(UNTRAINED_COLOR)
      } else {
        mat.color.set(state?.color || '#434347')
        // Selecionado clareia, não muda de matiz — a cor codifica o volume.
        if (isSelected) mat.color.offsetHSL(0, 0.05, 0.12)
      }
      mat.emissive.setHex(isSelected ? 0x241a08 : 0x000000)
    })
    needsRenderRef.current = true
  }, [])

  // ---- montagem: cria a cena uma vez e destrói tudo no cleanup
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let frame = 0

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(host.clientWidth || 280, host.clientHeight || 280, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    // Sem isto, arrastar sobre o modelo rola a página no iPhone em vez de girar.
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    buildLights(scene)

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
    camera.position.set(0, 0, 2.1)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = true
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.minDistance = 1.4
    controls.maxDistance = 3.2
    // Trava a inclinação: olhar o boneco de cima ou de baixo não informa nada e
    // desorienta — o gesto útil aqui é girar em torno do eixo vertical.
    controls.minPolarAngle = Math.PI / 2.6
    controls.maxPolarAngle = Math.PI / 1.7
    controls.rotateSpeed = 0.7
    controls.zoomSpeed = 0.6
    controls.addEventListener('change', () => { needsRenderRef.current = true })

    const pivot = new THREE.Group()
    scene.add(pivot)

    const stage: Stage = {
      renderer, scene, camera, controls, pivot,
      meshes: new Map(), materials: new Map(),
      raycaster: new THREE.Raycaster(),
      targetAngle: VIEW_ANGLE[view],
    }
    stageRef.current = stage

    const draco = new DRACOLoader()
    draco.setDecoderPath(DRACO_PATH)
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)

    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return
        gltf.scene.traverse((child: THREE.Object3D) => {
          if (!(child instanceof THREE.Mesh)) return
          const mat = new THREE.MeshStandardMaterial({
            color: child.name === 'body' ? BODY_COLOR : UNTRAINED_COLOR,
            roughness: 0.78,
            metalness: 0.02,
          })
          child.material = mat
          stage.materials.set(child.name, mat)
          stage.meshes.set(child.name, child)
        })
        pivot.add(gltf.scene)
        paint()
        needsRenderRef.current = true
      },
      undefined,
      (err) => {
        // Falhar aqui não pode derrubar a tela: o card cai no mapa 2D.
        console.error('[BodyMap3D] falha ao carregar o modelo', err)
      },
    )

    const resize = () => {
      const w = host.clientWidth || 280
      const h = host.clientHeight || 280
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      needsRenderRef.current = true
    }
    // jsdom não tem ResizeObserver, e o app roda testes lá.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(host)
    resize()

    // Só desenha quando algo mudou — RAF contínuo com o boneco parado é
    // bateria queimada à toa num app que fica aberto durante o treino inteiro.
    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (disposed) return
      const changed = controls.update()
      const diff = Math.atan2(
        Math.sin(stage.targetAngle - pivot.rotation.y),
        Math.cos(stage.targetAngle - pivot.rotation.y),
      )
      if (Math.abs(diff) > 0.002) {
        pivot.rotation.y += diff * 0.12
        needsRenderRef.current = true
      }
      if (changed || needsRenderRef.current) {
        renderer.render(scene, camera)
        needsRenderRef.current = false
      }
    }
    frame = requestAnimationFrame(tick)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      ro?.disconnect()
      controls.dispose()
      draco.dispose()
      stage.materials.forEach((m) => m.dispose())
      stage.meshes.forEach((m) => m.geometry.dispose())
      renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
      stageRef.current = null
    }
    // Monta uma vez. `view` e as props de dados entram por refs/efeitos próprios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- repinta quando o volume da semana ou a seleção mudam
  useEffect(() => { paint() }, [paint, muscles, selected])

  // ---- gira para a vista escolhida nos botões FRENTE/COSTAS
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.targetAngle = VIEW_ANGLE[view]
    needsRenderRef.current = true
  }, [view])

  // ---- seleção por toque/clique
  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    const select = onSelectRef.current
    if (!stage || !select) return
    const rect = stage.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    stage.raycaster.setFromCamera(pointer, stage.camera)
    const hits = stage.raycaster.intersectObjects(
      Array.from(stage.meshes.values()).filter((m) => MUSCLE_IDS.has(m.name)),
      false,
    )
    if (hits.length > 0) select(hits[0].object.name as MuscleId)
  }, [])

  const label = view === 'front'
    ? 'Mapa muscular em 3D, vista frontal. Arraste para girar.'
    : 'Mapa muscular em 3D, vista posterior. Arraste para girar.'

  return (
    <div
      ref={hostRef}
      onPointerUp={onSelect ? handlePointerUp : undefined}
      className={className ?? 'relative w-full max-w-[280px] mx-auto select-none overflow-hidden rounded-2xl bg-black aspect-square'}
      style={{ touchAction: 'none' }}
      role="img"
      aria-label={label}
    />
  )
})

export default BodyMap3D
export { MUSCLE_IDS, MODEL_URL, DRACO_PATH }
