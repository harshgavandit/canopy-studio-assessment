import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { useEffect, useRef, useState } from 'react'
import { paintPanel, panelRatio } from './art.ts'
import { sections, variantFor, visibleSections, clamp, type Configuration, type PanelId, type VariantId } from './catalog.ts'

type Rect = [number, number, number, number]
const fabricRects: Record<VariantId, Rect[]> = {
  '5x5': [
    [.2548,.535,.7447,.8715], [.5288,.2477,.8672,.7352], [.256,.1302,.7408,.4663], [.1169,.257,.4523,.7409],
    [.2557,.8815,.7464,.9695], [.8768,.2432,.9646,.7325], [.2564,.0336,.7408,.1212], [.0205,.2573,.1082,.7407],
  ],
  '6.5x6.5': [
    [.2718,.5191,.731,.8819], [.5206,.2692,.8836,.7288], [.2669,.1196,.7266,.4837], [.1186,.2719,.4814,.7315],
    [.2688,.8894,.7295,.9955], [.8898,.2687,.9957,.7296], [.2633,.0067,.7242,.1131], [.0056,.2738,.1115,.7349],
  ],
  '8x8': [
    [.2104,.5365,.7843,.8918], [.5297,.2278,.8852,.8021], [.2165,.1154,.7901,.4734], [.104,.2251,.4597,.7994],
    [.2116,.8997,.7842,.975], [.896,.227,.9716,.7999], [.2173,.0318,.7897,.1074], [.0132,.2253,.0886,.7981],
  ],
}

const axes = [
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0),
]
const right = (side: number) => new THREE.Vector3(axes[side].z, 0, -axes[side].x)
const tile = 512
const atlasSize = tile * 4
const margin = 4
const tileWidth = tile - 2 * margin

function mapUV(index: number, x: number, y: number, ratio: number) {
  return [
    (index % 4 * tile + margin + clamp(x, 0, 1) * tileWidth) / atlasSize,
    (Math.floor(index / 4) * tile + margin + clamp(y, 0, 1) * tileWidth * ratio) / atlasSize,
  ]
}

function remapFabric(geometry: THREE.BufferGeometry, variant: VariantId, walls: string) {
  const uv = geometry.getAttribute('uv')
  const position = geometry.getAttribute('position')
  const groups: number[][] = Array.from({ length: 8 }, () => [])
  const rects = fabricRects[variant]
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    let nearest = -1
    let best = Infinity
    for (const [index, [l, t, r, b]] of rects.entries()) {
      const distance = Math.max(l - u, u - r, t - v, v - b, 0)
      if (distance < best) { best = distance; nearest = index }
    }
    if (best > .001) throw new Error('A fabric vertex is outside its mapped panel.')
    groups[nearest].push(i)
  }
  const output = new Float32Array(uv.count * 2)
  const roofBounds: THREE.Vector4[] = []
  for (const [index, vertices] of groups.entries()) {
    if (!vertices.length) throw new Error('A canopy panel is missing from the model.')
    const horizontal = right(sections[index].side)
    const coordinate = (i: number) => position.getX(i) * horizontal.x + position.getZ(i) * horizontal.z
    const x = vertices.map(coordinate)
    const y = vertices.map(i => position.getY(i))
    const minX = Math.min(...x)
    const maxX = Math.max(...x)
    const minY = Math.min(...y)
    const maxY = Math.max(...y)
    if (index < 4) roofBounds.push(new THREE.Vector4(minX, maxX, minY, maxY))
    for (const i of vertices) {
      output.set(mapUV(index, (coordinate(i) - minX) / (maxX - minX),
        (maxY - position.getY(i)) / (maxY - minY), panelRatio(sections[index], walls)), i * 2)
    }
  }
  geometry.setAttribute('uv1', new THREE.BufferAttribute(output, 2))
  return roofBounds
}

// The exported roof islands have uneven shared edges. Project the printed
// roof seams continuously in model space while keeping the original fabric normals.
function projectRoof(material: THREE.MeshStandardMaterial, roofBounds: THREE.Vector4[]) {
  material.onBeforeCompile = shader => {
    shader.uniforms.roofPrintBounds = { value: roofBounds }
    shader.vertexShader = 'varying vec3 vRoofPrintPoint;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvRoofPrintPoint = position;',
    )
    shader.fragmentShader = [
      'varying vec3 vRoofPrintPoint;',
      'uniform vec4 roofPrintBounds[4];',
      shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 printUv = vMapUv;
          if (vMapUv.y < 0.125) {
            float panelX = vRoofPrintPoint.x;
            float panelIndex = 0.0;
            vec4 bounds = roofPrintBounds[0];
            if (abs(vRoofPrintPoint.x) > abs(vRoofPrintPoint.z)) {
              if (vRoofPrintPoint.x >= 0.0) {
                panelIndex = 1.0;
                bounds = roofPrintBounds[1];
                panelX = -vRoofPrintPoint.z;
              } else {
                panelIndex = 3.0;
                bounds = roofPrintBounds[3];
                panelX = vRoofPrintPoint.z;
              }
            } else if (vRoofPrintPoint.z < 0.0) {
              panelIndex = 2.0;
              bounds = roofPrintBounds[2];
              panelX = -vRoofPrintPoint.x;
            }
            vec2 panelUv = clamp(vec2(
              (panelX - bounds.x) / (bounds.y - bounds.x),
              (bounds.w - vRoofPrintPoint.y) / (bounds.w - bounds.z)
            ), 0.0, 1.0);
            printUv = vec2(
              panelIndex * ${tile}.0 + ${margin}.0 + panelUv.x * ${tileWidth}.0,
              ${margin}.0 + panelUv.y * ${tileWidth}.0 * ${panelRatio(sections[0], 'none')}
            ) / ${atlasSize}.0;
          }
          diffuseColor *= texture2D(map, printUv);
        #endif
      `),
    ].join('\n')
  }
}

function disposeObject(object: THREE.Object3D) {
  const maps = new Set<THREE.Texture>()
  object.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.geometry.dispose()
    const list = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const material of list) {
      for (const field of Object.values(material)) if (field instanceof THREE.Texture) maps.add(field)
      material.dispose()
    }
  })
  for (const map of maps) {
    map.dispose()
    if (map.source.data instanceof ImageBitmap) map.source.data.close()
  }
}

export type PreviewApi = { capture: () => string | undefined; reset: () => void; focus: (id: PanelId) => void }
type PreviewStatus = { kind: 'loading' | 'ready' | 'error'; message?: string }

export default function Preview({ config, revision, onApi, onSelect, onStatus }: {
  config: Configuration; revision: number; onApi: (api: PreviewApi | null) => void
  onSelect: (id: PanelId) => void; onStatus: (state: PreviewStatus) => void
}) {
  const mount = useRef<HTMLDivElement>(null)
  const latest = useRef({ config, onSelect })
  latest.current = { config, onSelect }
  const update = useRef<(() => void) | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const variant = config.variantId

  useEffect(() => {
    const container = mount.current!
    let renderer: THREE.WebGLRenderer
    setError('')
    onStatus({ kind: 'loading' })
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    } catch {
      const message = '3D rendering is unavailable on this device.'
      setError(message)
      onStatus({ kind: 'error', message })
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = .96
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D canopy preview. Drag or use arrow keys to orbit.')
    renderer.domElement.tabIndex = 0
    container.append(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(31, 1, .035, 90)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.maxPolarAngle = Math.PI * .51
    controls.minPolarAngle = .15
    const pmrem = new THREE.PMREMGenerator(renderer)
    const studio = new RoomEnvironment()
    const environment = pmrem.fromScene(studio, 0.06)
    scene.environment = environment.texture
    scene.environmentIntensity = .56
    studio.dispose()
    pmrem.dispose()

    const sky = new THREE.HemisphereLight('#fef8ed', '#93a3a9', 1.23)
    const key = new THREE.DirectionalLight('#fff0db', 1.60)
    key.position.set(-3, 7, 5)
    const fill = new THREE.DirectionalLight('#dce7ff', .78)
    fill.position.set(4, 4, -4)
    scene.add(sky, key, fill)

    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = shadowCanvas.height = 256
    const sh = shadowCanvas.getContext('2d')!
    const gradient = sh.createRadialGradient(128, 128, 5, 128, 128, 124)
    gradient.addColorStop(0, 'rgba(34,51,47,.50)')
    gradient.addColorStop(.45, 'rgba(34,51,47,.32)')
    gradient.addColorStop(.75, 'rgba(34,51,47,.14)')
    gradient.addColorStop(1, 'rgba(34,51,47,0)')
    sh.fillStyle = gradient
    sh.fillRect(0, 0, 256, 256)
    const shadowMap = new THREE.CanvasTexture(shadowCanvas)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -.015
    scene.add(shadow)

    const modelGroup = new THREE.Group()
    const wallGroup = new THREE.Group()
    const lightGroup = new THREE.Group()
    scene.add(modelGroup, wallGroup, lightGroup)
    const atlas = document.createElement('canvas')
    atlas.width = atlas.height = atlasSize
    const ctx = atlas.getContext('2d')!
    const texture = new THREE.CanvasTexture(atlas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false
    texture.channel = 1
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    let gltf: THREE.Object3D | undefined
    let exterior: THREE.Mesh | undefined
    let frameObjects: THREE.Object3D[] = []
    let bounds = new THREE.Box3()
    let eave = 1.55
    let span = 2.4
    let distance = 5
    let cancelled = false
    let scheduled = 0
    let wallKey = ''
    const wallParts: THREE.Mesh[] = []
    const lightParts: THREE.Mesh[] = []
    const painted = new Map<number, Configuration['panels'][PanelId]>()

    function draw() {
      if (!scheduled && !cancelled) scheduled = requestAnimationFrame(() => {
        scheduled = 0
        renderer.render(scene, camera)
      })
    }
    function aim(side?: number) {
      camera.position.copy(controls.target).add(side === undefined
        ? new THREE.Vector3(.56, .37, 1).normalize().multiplyScalar(distance)
        : axes[side].clone().add(new THREE.Vector3(0, .22, 0)).normalize().multiplyScalar(distance))
      controls.update()
      draw()
    }
    function resize() {
      const w = Math.max(1, container.clientWidth)
      const h = Math.max(1, container.clientHeight)
      const oldDistance = distance
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      if (gltf) {
        const height = bounds.max.y - bounds.min.y
        distance = Math.max(height * 1.60, span * 1.50 / Math.min(1.32, camera.aspect)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
        controls.minDistance = distance * .49
        controls.maxDistance = distance * 2.5
        if (oldDistance && camera.position.length()) {
          camera.position.sub(controls.target).multiplyScalar(distance / oldDistance).add(controls.target)
          controls.update()
        }
      }
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    controls.addEventListener('change', draw)
    resize()

    function refreshOptions() {
      const design = latest.current.config
      const key = [design.frame, design.walls, design.doubleSided].join('|')
      if (key === wallKey || !gltf) return
      wallKey = key
      for (const object of frameObjects) object.visible = design.frame !== 'canopy-only'
      for (const mesh of [...wallParts, ...lightParts]) {
        mesh.geometry.dispose()
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose()
        mesh.removeFromParent()
      }
      wallParts.length = 0
      lightParts.length = 0
      painted.clear()
      const fullHeight = Math.max(.45, eave - .15)
      for (const section of visibleSections(design).filter(item => item.kind === 'wall')) {
        const index = sections.indexOf(section)
        const height = design.walls === 'half' ? fullHeight * .52 : fullHeight
        const geometry = new THREE.PlaneGeometry(span * .96, height, 1, 1)
        const uv = geometry.getAttribute('uv')
        const points = new Float32Array(uv.count * 2)
        for (let i = 0; i < uv.count; i++) {
          points.set(mapUV(index, uv.getX(i), 1 - uv.getY(i), panelRatio(section, design.walls)), i * 2)
        }
        geometry.setAttribute('uv1', new THREE.BufferAttribute(points, 2))
        const plane = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: .89, side: THREE.FrontSide }))
        const outward = axes[section.side]
        plane.position.copy(outward).multiplyScalar(span * .465)
        plane.position.y = design.walls === 'half' ? Math.min(eave - height / 2, height / 2 + .28) : eave - height / 2
        plane.rotation.y = Math.atan2(outward.x, outward.z)
        plane.userData.panelId = section.id
        wallParts.push(plane)
        wallGroup.add(plane)
        const lining = new THREE.Mesh(geometry.clone(), design.doubleSided
          ? plane.material.clone()
          : new THREE.MeshStandardMaterial({ color: '#e9e1d2', roughness: .94 }))
        lining.position.copy(plane.position).addScaledVector(outward, -.002)
        lining.rotation.y = plane.rotation.y + Math.PI
        lining.userData.panelId = section.id
        wallParts.push(lining)
        wallGroup.add(lining)
      }
      if (design.frame === 'lighted') for (const axis of axes) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(span * .9, .023, .026),
          new THREE.MeshStandardMaterial({ color: '#fff3ca', emissive: '#ffe1a0', emissiveIntensity: 1.65 }))
        light.position.copy(axis).multiplyScalar(span * .451)
        light.position.y = eave - .024
        light.rotation.y = Math.atan2(axis.x, axis.z)
        lightParts.push(light)
        lightGroup.add(light)
      }
    }

    update.current = () => {
      if (!gltf) return
      refreshOptions()
      const design = latest.current.config
      let changed = false
      for (const [index, section] of sections.entries()) {
        const panel = design.panels[section.id]
        if (painted.get(index) === panel) continue
        painted.set(index, panel)
        ctx.save()
        ctx.translate(index % 4 * tile + margin, Math.floor(index / 4) * tile + margin)
        ctx.fillStyle = panel.color
        ctx.fillRect(-margin, -margin, tile, tile)
        paintPanel(ctx, panel, section, tileWidth, tileWidth * panelRatio(section, design.walls), { clip: false })
        ctx.restore()
        changed = true
      }
      if (changed) texture.needsUpdate = true
      draw()
    }
    const loader = new GLTFLoader()
    const url = import.meta.env.BASE_URL + 'glb/' + encodeURIComponent(variantFor(variant).asset)
    loader.load(url, asset => {
      if (cancelled) { disposeObject(asset.scene); return }
      try {
        gltf = asset.scene
        modelGroup.add(gltf)
        bounds = new THREE.Box3().setFromObject(gltf)
        span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z)
        gltf.traverse(child => {
          if (/^(leg|mechanism)/i.test(child.name)) frameObjects.push(child)
          if (child instanceof THREE.Mesh && !Array.isArray(child.material) && child.material.name === 'fabric_Mat') exterior = child
        })
        if (!exterior) throw new Error('The canopy fabric material is missing.')
        exterior.geometry.computeBoundingBox()
        const fabricBounds = exterior.geometry.boundingBox!
        const pos = exterior.geometry.getAttribute('position')
        const uvs = exterior.geometry.getAttribute('uv')
        eave = -Infinity
        const [left, top, right, bottom] = fabricRects[variant][4]
        for (let i = 0; i < uvs.count; i++) {
          const u = uvs.getX(i), v = uvs.getY(i)
          if (u >= left - .00015 && u <= right + .00015 && v >= top - .00015 && v <= bottom + .00015) {
            eave = Math.max(eave, pos.getY(i))
          }
        }
        if (!Number.isFinite(eave)) eave = fabricBounds.min.y + span * .13
        const roofBounds = remapFabric(exterior.geometry, variant, latest.current.config.walls)
        const fabric = exterior.material as THREE.MeshStandardMaterial
        fabric.map?.dispose()
        fabric.map = texture
        fabric.color.set('#ffffff')
        fabric.vertexColors = false
        fabric.metalness = 0
        fabric.roughness = .88
        fabric.normalScale.set(.45, .45)
        projectRoof(fabric, roofBounds)
        fabric.needsUpdate = true
        shadow.scale.set(span * 1.87, span * 1.75, 1)
        controls.target.set(0, bounds.max.y * .46, 0)
        resize()
        aim()
        update.current?.()
        onStatus({ kind: 'ready' })
        onApi({
          capture: () => {
            try {
              renderer.render(scene, camera)
              const canvas = document.createElement('canvas')
              const source = renderer.domElement
              canvas.width = Math.min(source.width, 1200)
              canvas.height = Math.round(canvas.width * source.height / source.width)
              const background = canvas.getContext('2d')!
              background.fillStyle = '#e9eeeb'
              background.fillRect(0, 0, canvas.width, canvas.height)
              background.drawImage(source, 0, 0, canvas.width, canvas.height)
              return canvas.toDataURL('image/jpeg', .93)
            } catch { return undefined }
          },
          reset: () => aim(),
          focus: id => aim(sections.find(section => section.id === id)?.side),
        })
      } catch (e) {
        const message = (e as Error).message
        setError(message)
        onStatus({ kind: 'error', message })
      }
    }, undefined, () => {
      if (cancelled) return
      const message = 'The tent model could not load.'
      onStatus({ kind: 'error', message })
      setError(message)
    })

    let press: [number, number] | undefined
    const ray = new THREE.Raycaster()
    function down(event: PointerEvent) { press = [event.clientX, event.clientY] }
    function up(event: PointerEvent) {
      if (!press || Math.hypot(press[0] - event.clientX, press[1] - event.clientY) > 5 || !exterior) return
      const rect = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1)), camera)
      const hit = ray.intersectObjects([exterior, ...wallParts])[0]
      if (!hit) return
      const panel = hit.object.userData.panelId as PanelId | undefined
      if (panel) { latest.current.onSelect(panel); return }
      if (!hit.uv) return
      const index = fabricRects[variant].findIndex(([l, t, r, b]) =>
        hit.uv!.x >= l - .0002 && hit.uv!.x <= r + .0002 && hit.uv!.y >= t - .0002 && hit.uv!.y <= b + .0002)
      if (index < 0) return
      const point = exterior.worldToLocal(hit.point.clone())
      const side = Math.abs(point.x) > Math.abs(point.z) ? (point.x >= 0 ? 1 : 3) : (point.z >= 0 ? 0 : 2)
      latest.current.onSelect(sections[index < 4 ? side : index].id)
    }
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointerup', up)
    renderer.domElement.addEventListener('keydown', event => {
      const movement = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
      switch (event.key) {
        case 'ArrowLeft': movement.theta -= .16; break
        case 'ArrowRight': movement.theta += .16; break
        case 'ArrowUp': movement.phi -= .12; break
        case 'ArrowDown': movement.phi += .12; break
        case '+': case '=': movement.radius *= .9; break
        case '-': movement.radius *= 1.1; break
        case 'Home': event.preventDefault(); aim(); return
        default: return
      }
      event.preventDefault()
      movement.phi = clamp(movement.phi, controls.minPolarAngle, controls.maxPolarAngle)
      movement.radius = clamp(movement.radius, controls.minDistance, controls.maxDistance)
      camera.position.setFromSpherical(movement).add(controls.target)
      controls.update()
      draw()
    })
    const contextLost = (event: Event) => {
      event.preventDefault()
      onApi(null)
      setError('The 3D renderer lost its connection.')
      onStatus({ kind: 'error', message: 'The 3D renderer lost its connection.' })
    }
    renderer.domElement.addEventListener('webglcontextlost', contextLost)
    return () => {
      cancelled = true
      update.current = null
      onApi(null)
      if (scheduled) cancelAnimationFrame(scheduled)
      observer.disconnect()
      controls.dispose()
      environment.dispose()
      disposeObject(scene)
      if (!gltf) texture.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [variant, attempt, onApi, onStatus])

  useEffect(() => { update.current?.() }, [config])
  useEffect(() => {
    if (revision) {
      const saved = latest.current.config
      latest.current.config = { ...saved, panels: Object.fromEntries(
        Object.entries(saved.panels).map(([id, panel]) => [id, { ...panel }]),
      ) as Configuration['panels'] }
      update.current?.()
      latest.current.config = saved
    }
  }, [revision])

  return <div className="webgl-stage" ref={mount}>{error && <div className="render-error"><strong>{error}</strong><button onClick={() => setAttempt(n => n + 1)}>Retry 3D</button></div>}</div>
}
