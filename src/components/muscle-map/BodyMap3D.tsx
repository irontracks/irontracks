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

/**
 * O corpo é UM corpo. O material nunca muda de cor — o volume da semana entra
 * como LUZ PRÓPRIA (emissive) sobre esta base. Pintar o albedo de laranja é o
 * que fazia o manequim parecer plástico: em 2D a cor é um véu translúcido sobre
 * uma textura que já tem sombra; a tradução física disso em 3D é emissão.
 *
 * Warm black, da mesma família dos fundos do app (#0f0f0e / #151514 / #1a1a18).
 * O cinza azulado anterior (#3a3a3c) destoava de toda a paleta.
 */
const BODY_COLOR = 0x4a4a42
/**
 * Fundo do palco. Precisa ser MAIS FUNDO que o corpo, senão o manequim neutro
 * some: metade da superfície não pertence a grupo nenhum, e se ela não é
 * visível as ilhas coloridas ficam boiando no vazio. Medido em tela.
 */
const STAGE_COLOR = 0x0f0f0e

/**
 * A cor entra por DOIS canais, e cada um faz uma coisa que o outro não faz:
 *
 *  - `tint` mistura a cor no ALBEDO. É o que preserva o sombreamento: superfície
 *    tingida ainda recebe luz, então o relevo do corpo continua legível.
 *  - `glow` é a EMISSÃO. É o que faz o grupo "acender" e dá vida ao dado.
 *
 * Emissão sozinha não recebe shading e achata o corpo numa silhueta chapada
 * (medido); tinta sozinha é plástico pintado, que foi a primeira versão.
 */
const MAX_TINT = 0.46
const MIN_TINT = 0.12
const MAX_GLOW = 0.34
const MIN_GLOW = 0.06
/** Quanto os outros grupos recuam quando um está selecionado. Hierarquia se
 *  faz tirando: o escolhido não precisa gritar se os demais sussurram. */
const DIMMED = 0.3

type MuscleState = { color?: string; sets?: number; ratio?: number; label?: string }

type FalloffUniforms = {
  uTint: { value: THREE.Color }
  uTintAmount: { value: number }
  uGlow: { value: THREE.Color }
  uGlowAmount: { value: number }
}

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

/**
 * Faz o peso de borda (gravado como cor de vértice pelo pipeline) modular a
 * tinta e a emissão, em vez de multiplicar o albedo como o three faria por
 * padrão com `vertexColors`.
 *
 * A multiplicação padrão escureceria o corpo até o preto na fronteira, que é o
 * oposto do desejado: ali o músculo tem que virar PELE, não sombra. Por isso o
 * `color_fragment` é substituído, não complementado.
 */
function applyFalloffShader(mat: THREE.MeshStandardMaterial) {
  const uniforms = {
    uTint: { value: new THREE.Color(0x000000) },
    uTintAmount: { value: 0 },
    uGlow: { value: new THREE.Color(0x000000) },
    uGlowAmount: { value: 0 },
  }
  // Guardado no material para o repinte atualizar sem recompilar o shader.
  ;(mat as THREE.MeshStandardMaterial & { userData: { uniforms?: typeof uniforms } })
    .userData.uniforms = uniforms

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFalloff;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvFalloff = color.r;')

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying float vFalloff;
         uniform vec3 uTint;
         uniform float uTintAmount;
         uniform vec3 uGlow;
         uniform float uGlowAmount;`,
      )
      // Substitui a multiplicação padrão do vertexColor: aqui a cor do vértice
      // é PESO, não pigmento.
      .replace(
        '#include <color_fragment>',
        'diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintAmount * vFalloff);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * (uGlowAmount * vFalloff);',
      )
  }
  mat.needsUpdate = true
}

function buildLights(scene: THREE.Scene) {
  // Luz baixa de propósito: quem informa é a EMISSÃO do músculo, não o quanto
  // a lâmpada bate na pele. Com key forte, a luz difusa lava a cor e o volume
  // da semana some — foi o que aconteceu na primeira versão.
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))

  const key = new THREE.DirectionalLight(0xfff4e0, 0.95)
  key.position.set(2, 3, 4)

  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.3)
  fill.position.set(-3, 1, 2)

  // Contraluz: separa a silhueta do fundo. É o que dá corpo ao manequim escuro
  // e evita que ele vire mancha chapada sobre a superfície do card.
  const rim = new THREE.DirectionalLight(0xffffff, 0.7)
  rim.position.set(0, 2, -4)

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
    const selectedId = selectedRef.current
    stage.materials.forEach((mat, name) => {
      // Base idêntica para tudo, sempre: manequim e músculo são a mesma pele.
      mat.color.setHex(BODY_COLOR)
      mat.emissiveIntensity = 0

      if (name === 'body' || !MUSCLE_IDS.has(name)) {
        mat.emissive.setHex(0x000000)
        mat.emissiveIntensity = 0
        return
      }

      const state = musclesRef.current[name]
      const ratio = Number(state?.ratio || 0)
      if (ratio <= 0) {
        // Sem volume não é cinza diferente — é corpo. Silêncio, não ruído.
        mat.emissive.setHex(0x000000)
        mat.emissiveIntensity = 0
        return
      }

      // A cor é a MESMA que o 2D recebe do servidor. O que muda é o papel dela.
      const c = new THREE.Color(state?.color || '#eab308')

      // sqrt abre a faixa baixa, onde mora a maioria das semanas reais; linear
      // achatava tudo que não fosse volume alto.
      const t = Math.sqrt(Math.min(1, Math.max(0, ratio)))
      const dim = selectedId && name !== selectedId ? DIMMED : 1
      const tint = (MIN_TINT + (MAX_TINT - MIN_TINT) * t) * dim
      const glow = (MIN_GLOW + (MAX_GLOW - MIN_GLOW) * t) * dim

      const u = (mat as THREE.MeshStandardMaterial & {
        userData: { uniforms?: FalloffUniforms }
      }).userData.uniforms

      if (u) {
        // Com falloff, quem aplica a cor é o shader — por vértice, desvanecendo
        // na fronteira. O material fica neutro de propósito.
        u.uTint.value.copy(c)
        u.uTintAmount.value = tint
        u.uGlow.value.copy(c)
        u.uGlowAmount.value = glow
      } else {
        // Modelo antigo, sem peso de borda gravado: mantém o caminho direto,
        // com borda dura, em vez de simplesmente não pintar nada.
        mat.color.lerp(c, tint)
        mat.emissive.copy(c)
        mat.emissiveIntensity = glow
      }
    })
    needsRenderRef.current = true
  }, [])

  // ---- montagem: cria a cena uma vez e destrói tudo no cleanup
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let frame = 0

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    // Sem tone mapping, laranja e vermelho saturados estouram sem rolloff — é
    // metade da sensação de "plástico pintado". ACES devolve o ombro da curva.
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.setClearColor(STAGE_COLOR, 1)
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
            color: BODY_COLOR,
            roughness: 0.92,   // pele fosca; brilho especular aqui lê como plástico
            metalness: 0,
            emissive: 0x000000,
            emissiveIntensity: 0,
            // O modelo traz, por vértice, o quanto ele está no NÚCLEO do músculo
            // (1) ou na fronteira da região (0). Sem isso a região tem borda
            // dura de recorte — cada grupo é um conjunto fechado de faces.
            vertexColors: child.name !== 'body' && MUSCLE_IDS.has(child.name),
          })
          if (mat.vertexColors) applyFalloffShader(mat)
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
      className={className ?? 'relative w-full max-w-[280px] mx-auto select-none overflow-hidden rounded-2xl bg-depth-1 aspect-square'}
      style={{ touchAction: 'none' }}
      role="img"
      aria-label={label}
    />
  )
})

export default BodyMap3D
export { MUSCLE_IDS, MODEL_URL, DRACO_PATH }
