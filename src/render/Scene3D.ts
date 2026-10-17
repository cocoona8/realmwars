import * as THREE from 'three'
import type { UiState } from '../input/Controls'
import { COLS, MAP_H, MAP_W, ROWS, TILE } from '../systems/pathfinding'
import type { World } from '../systems/world'
import { getBuildingDef } from '../data/races'
import {
  makeBar,
  makeBuilding,
  makeMine,
  makePlant,
  makeRing,
  makeTree,
  makeUnit,
  paintBar,
} from './models'

const TEAM = [0x3d7ec9, 0xc4473a]

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000)
  private readonly raycaster = new THREE.Raycaster()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly hit = new THREE.Vector3()
  private readonly ndc = new THREE.Vector2()
  private readonly sun = new THREE.DirectionalLight(0xfff1d0, 1.15)
  private readonly units = new Map<string, THREE.Group>()
  private readonly buildings = new Map<string, THREE.Group>()
  private readonly bars = new Map<string, THREE.Sprite>()
  private readonly rings = new Map<string, THREE.Mesh>()
  private readonly trees = new Map<string, THREE.Group>()
  private readonly mines = new Map<string, THREE.Group>()
  private readonly fx: THREE.Object3D[] = []
  private ghost: THREE.Group | null = null
  private ghostId = ''
  private readonly drag = document.createElement('div')
  private readonly lastPos = new Map<string, { x: number; y: number; moving: number }>()
  private readonly fogCanvas = document.createElement('canvas')
  private readonly fogTex: THREE.CanvasTexture
  private width = 1
  private height = 1

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.setSize(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'view3d'
    parent.prepend(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x05070a)
    this.makeSky()

    const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x3d6b32, 0.85)
    this.scene.add(hemi)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 20
    this.sun.shadow.camera.far = 2200
    this.sun.shadow.camera.left = -900
    this.sun.shadow.camera.right = 900
    this.sun.shadow.camera.top = 900
    this.sun.shadow.camera.bottom = -900
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.makeGround()
    this.fogTex = this.makeFog()
    this.drag.className = 'drag3d'
    parent.appendChild(this.drag)
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.renderer.setSize(this.width, this.height)
  }

  pick(screenX: number, screenY: number): { x: number; y: number } | null {
    this.ndc.x = (screenX / this.width) * 2 - 1
    this.ndc.y = -(screenY / this.height) * 2 + 1
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const meshes = [...this.buildings.values(), ...this.mines.values(), ...this.trees.values(), ...this.units.values()]
    const hits = this.raycaster.intersectObjects(meshes, true)
    if (hits[0]) {
      let obj: THREE.Object3D | null = hits[0].object
      while (obj && obj.parent && obj.parent !== this.scene) obj = obj.parent
      if (obj) return { x: obj.position.x, y: obj.position.z }
    }
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.hit)
    if (!hit) return null
    return { x: hit.x, y: hit.z }
  }

  sync(world: World, ui: UiState, view: { x: number; y: number; width: number; height: number }, pointer: { x: number; y: number }): void {
    this.aim(view)
    this.syncFog(world)
    this.syncTerrain(world)
    this.syncBuildings(world, ui)
    this.syncUnits(world, ui)
    this.syncFx(world)
    this.syncGhost(world, ui, pointer)
    this.syncDrag(ui)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.drag.remove()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private aim(view: { x: number; y: number; width: number; height: number }): void {
    const cx = view.x + view.width / 2
    const cz = view.y + view.height / 2
    const halfW = Math.max(1, view.width / 2)
    const halfH = Math.max(1, view.height / 2)
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.near = 1
    this.camera.far = 8000
    this.camera.updateProjectionMatrix()
    this.camera.up.set(0, 0, -1)
    this.camera.position.set(cx, 1400, cz)
    this.camera.lookAt(cx, 0, cz)
    this.sun.position.set(cx - 280, 900, cz - 180)
    this.sun.target.position.set(cx, 0, cz)
    this.sun.target.updateMatrixWorld()
  }

  private makeGround(): void {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#2f8a3c'
      ctx.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 80; i += 1) {
        ctx.fillStyle = i % 2 ? '#277a34' : '#3a9a45'
        ctx.beginPath()
        ctx.arc((i * 47) % 256, (i * 29) % 256, 6 + (i % 5), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(MAP_W / 180, MAP_H / 180)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.set(MAP_W / 2, 0, MAP_H / 2)
    ground.receiveShadow = true
    this.scene.add(ground)
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W + 400, MAP_H + 400), new THREE.MeshStandardMaterial({ color: 0x1e5a28 }))
    rim.rotation.x = -Math.PI / 2
    rim.position.set(MAP_W / 2, -1.2, MAP_H / 2)
    this.scene.add(rim)
  }

  private makeFog(): THREE.CanvasTexture {
    this.fogCanvas.width = COLS
    this.fogCanvas.height = ROWS
    const tex = new THREE.CanvasTexture(this.fogCanvas)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.flipY = false
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W, MAP_H),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(MAP_W / 2, 2.2, MAP_H / 2)
    mesh.renderOrder = 4
    this.scene.add(mesh)
    return tex
  }

  private syncFog(world: World): void {
    const ctx = this.fogCanvas.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(COLS, ROWS)
    const me = world.me
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = (y * COLS + x) * 4
        const sight = world.tileSight(me, x, y)
        const explored = world.tileExplored(me, x, y)
        img.data[i] = 6
        img.data[i + 1] = 8
        img.data[i + 2] = 10
        img.data[i + 3] = sight ? 0 : explored ? 155 : 255
      }
    }
    ctx.putImageData(img, 0, 0)
    this.fogTex.needsUpdate = true
  }

  private makeSky(): void {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(5000, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x7eb7e0, side: THREE.BackSide, fog: false }),
    )
    this.scene.add(sky)
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(70, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }))
    sunBall.position.set(-900, 1100, -700)
    this.scene.add(sunBall)
    for (let i = 0; i < 10; i += 1) {
      const cloud = new THREE.Group()
      const puff = (x: number, y: number, z: number, s: number) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 1, transparent: true, opacity: 0.78 }))
        mesh.position.set(x, y, z)
        mesh.scale.set(s * 1.6, s * 0.55, s)
        cloud.add(mesh)
      }
      puff(0, 0, 0, 40 + (i % 3) * 8)
      puff(36, 4, 8, 28)
      puff(-32, 2, -6, 24)
      cloud.position.set((i * 420) % MAP_W, 220 + (i % 4) * 30, ((i * 310) % MAP_H) - 80)
      this.scene.add(cloud)
    }
  }

  private syncTerrain(world: World): void {
    const seen = new Set<string>()
    for (const node of world.nodes) {
      if (node.kind === 'forest') {
        for (let y = 0; y < node.tilesH; y += 1) {
          for (let x = 0; x < node.tilesW; x += 1) {
            const key = `${node.id}-${x}-${y}`
            seen.add(key)
            let tree = this.trees.get(key)
            if (!tree) {
              const seed = hash(node.tileX + x, node.tileY + y)
              tree = makeTree(seed)
              tree.position.set(
                node.tileX * TILE + x * TILE + 16 + ((seed % 7) - 3),
                0,
                node.tileY * TILE + y * TILE + 16 + (((seed >> 3) % 5) - 2),
              )
              this.scene.add(tree)
              this.trees.set(key, tree)
            }
            tree.visible = node.wood > 0 && world.tileExplored(world.me, node.tileX + x, node.tileY + y)
          }
        }
      } else {
        seen.add(node.id)
        let mine = this.mines.get(node.id)
        const rich = node.ore > 0
        if (!mine || mine.userData.rich !== rich) {
          if (mine) {
            this.scene.remove(mine)
            this.mines.delete(node.id)
          }
          mine = makeMine(rich)
          mine.userData.rich = rich
          mine.position.set(node.tileX * TILE + 16, 0, node.tileY * TILE + 16)
          this.scene.add(mine)
          this.mines.set(node.id, mine)
        }
        mine.visible = world.tileExplored(world.me, node.tileX, node.tileY)
      }
    }
    for (const [id, obj] of this.trees) {
      if (seen.has(id)) continue
      this.scene.remove(obj)
      this.trees.delete(id)
    }
    for (const [id, obj] of this.mines) {
      if (seen.has(id)) continue
      this.scene.remove(obj)
      this.mines.delete(id)
    }
  }

  private syncBuildings(world: World, ui: UiState): void {
    const seen = new Set<string>()
    for (const building of world.buildings) {
      seen.add(building.id)
      const def = world.buildingDef(building)
      const key = `${def.id}-${building.owner}`
      let mesh = this.buildings.get(building.id)
      if (!mesh || mesh.userData.key !== key) {
        if (mesh) this.scene.remove(mesh)
        mesh = makeBuilding(def.id, building.owner, def.tilesW, def.tilesH)
        mesh.userData.key = key
        this.scene.add(mesh)
        this.buildings.set(building.id, mesh)
      }
      const x = building.tileX * TILE + (def.tilesW * TILE) / 2
      const z = building.tileY * TILE + (def.tilesH * TILE) / 2
      mesh.position.set(x, 0, z)
      const grow = building.progress < 1 ? 0.2 + 0.8 * building.progress : 1
      mesh.scale.set(1, grow, 1)
      const revealed = world.isBuildingRevealed(building, world.me)
      const live = world.tileSight(world.me, building.tileX, building.tileY) || building.owner === world.me
      mesh.visible = revealed
      const selected = ui.selection.includes(building.id)
      this.mark(building.id, x, z, Math.max(def.tilesW, def.tilesH) * 22, selected && revealed, TEAM[building.owner])
      const pct = building.progress < 1 ? building.progress : building.hp / def.hp
      if (revealed && live) this.bar(building.id, x, 80, z - Math.max(18, def.tilesH * 10), pct, building.progress < 1)
      else this.hideBar(building.id)
    }
    this.prune(this.buildings, seen)
  }

  private syncUnits(world: World, ui: UiState): void {
    const seen = new Set<string>()
    for (const unit of world.units) {
      seen.add(unit.id)
      const visible = world.isVisibleTo(unit, world.me)
      const def = world.unitDef(unit)
      const planted = unit.plantedUntil > world.time
      const key = planted ? 'plant' : `${def.id}-${unit.owner}`
      let mesh = this.units.get(unit.id)
      if (!mesh || mesh.userData.key !== key) {
        if (mesh) this.scene.remove(mesh)
        mesh = planted ? makePlant() : makeUnit(def.id, unit.owner)
        mesh.userData.key = key
        this.scene.add(mesh)
        this.units.set(unit.id, mesh)
      }
      mesh.visible = visible
      const last = this.lastPos.get(unit.id)
      const step = last ? Math.hypot(unit.x - last.x, unit.y - last.y) : 0
      const moving = step > 0.2 ? 0.15 : Math.max(0, (last?.moving ?? 0) - 1 / 60)
      this.lastPos.set(unit.id, { x: unit.x, y: unit.y, moving })
      const phase = world.time * (def.flying ? 4 : 13) + hashId(unit.id) % 10
      const bob = def.flying ? Math.sin(phase) * 4 : moving > 0 ? Math.abs(Math.sin(phase)) * 2 : 0
      const lift = def.flying && !planted ? 22 : 0
      mesh.position.set(unit.x, lift + bob, unit.y)
      mesh.rotation.y = planted ? 0 : -unit.facing
      mesh.scale.setScalar(planted ? 1.4 : 16 + def.radius * 0.55)
      if (def.camouflage && unit.owner === world.me && !mesh.userData.faded) {
        mesh.traverse((child: THREE.Object3D) => {
          if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.Material)) return
          child.material = child.material.clone()
          child.material.transparent = true
          child.material.opacity = 0.55
        })
        mesh.userData.faded = true
      }
      const selected = ui.selection.includes(unit.id)
      this.mark(unit.id, unit.x, unit.y, def.radius + 10, selected && visible, unit.owner === world.me ? 0x8ec2ff : 0xff9b90)
      if (visible) this.bar(unit.id, unit.x, lift + bob + 36, unit.y - 18, unit.hp / def.hp, false)
      else this.hideBar(unit.id)
    }
    this.prune(this.units, seen)
    for (const id of [...this.lastPos.keys()]) if (!seen.has(id)) this.lastPos.delete(id)
  }

  private syncFx(world: World): void {
    for (const obj of this.fx) this.scene.remove(obj)
    this.fx.length = 0
    for (const effect of world.fx) {
      if (!world.inSight(world.me, effect.x, effect.y)) continue
      const alpha = effect.max > 0 ? Math.max(0, effect.life / effect.max) : 1
      if (effect.kind === 'line') {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(effect.x, 12, effect.y),
          new THREE.Vector3(effect.x2, 12, effect.y2),
        ])
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: effect.color, transparent: true, opacity: alpha }))
        this.scene.add(line)
        this.fx.push(line)
      } else if (effect.kind === 'circle') {
        const ring = makeRing(effect.color, effect.r)
        ring.position.set(effect.x, 2, effect.y)
        if (ring.material instanceof THREE.MeshBasicMaterial) ring.material.opacity = alpha
        this.scene.add(ring)
        this.fx.push(ring)
      } else if (effect.kind === 'text' && effect.text) {
        const sprite = textSprite(effect.text, effect.color, alpha)
        sprite.position.set(effect.x, 26, effect.y)
        this.scene.add(sprite)
        this.fx.push(sprite)
      }
    }
  }

  private syncGhost(world: World, ui: UiState, pointer: { x: number; y: number }): void {
    if (!ui.placing) {
      if (this.ghost) this.ghost.visible = false
      return
    }
    const point = this.pick(pointer.x, pointer.y)
    if (!point) return
    const def = getBuildingDef(world.raceOf(world.me), ui.placing)
    const tx = Math.floor(point.x / TILE)
    const ty = Math.floor(point.y / TILE)
    const snapped = world.snapPlacement(world.me, def, tx, ty)
    const gx = snapped ? snapped.tx : tx
    const gy = snapped ? snapped.ty : ty
    const ok = !!snapped && world.canPlace(world.me, def, gx, gy)
    const id = `${def.id}-${world.me}`
    if (!this.ghost || this.ghostId !== id) {
      if (this.ghost) this.scene.remove(this.ghost)
      this.ghost = makeBuilding(def.id, world.me, def.tilesW, def.tilesH)
      this.ghost.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
          child.castShadow = false
        }
      })
      this.ghostId = id
      this.scene.add(this.ghost)
    }
    this.ghost.visible = true
    this.ghost.position.set(gx * TILE + (def.tilesW * TILE) / 2, 0, gy * TILE + (def.tilesH * TILE) / 2)
    this.ghost.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.color.setHex(ok ? 0x7dff6a : 0xff5a4a)
      }
    })
  }

  private syncDrag(ui: UiState): void {
    if (!ui.drag.active) {
      this.drag.style.display = 'none'
      return
    }
    const left = Math.min(ui.drag.sx, ui.drag.x)
    const top = Math.min(ui.drag.sy, ui.drag.y)
    this.drag.style.display = 'block'
    this.drag.style.left = `${left}px`
    this.drag.style.top = `${top}px`
    this.drag.style.width = `${Math.abs(ui.drag.x - ui.drag.sx)}px`
    this.drag.style.height = `${Math.abs(ui.drag.y - ui.drag.sy)}px`
  }

  private mark(id: string, x: number, z: number, radius: number, on: boolean, color: number): void {
    let ring = this.rings.get(id)
    if (!on) {
      if (ring) ring.visible = false
      return
    }
    if (!ring) {
      ring = makeRing(color, radius)
      this.scene.add(ring)
      this.rings.set(id, ring)
    }
    ring.visible = true
    ring.position.set(x, 0.7, z)
    if (ring.material instanceof THREE.MeshBasicMaterial) ring.material.color.setHex(color)
  }

  private bar(id: string, x: number, y: number, z: number, pct: number, construction: boolean): void {
    let sprite = this.bars.get(id)
    if (!sprite) {
      sprite = makeBar()
      this.scene.add(sprite)
      this.bars.set(id, sprite)
    }
    sprite.visible = true
    sprite.position.set(x, y, z)
    paintBar(sprite, pct, construction)
  }

  private hideBar(id: string): void {
    const sprite = this.bars.get(id)
    if (sprite) sprite.visible = false
  }

  private prune(map: Map<string, THREE.Object3D>, seen: Set<string>): void {
    for (const [id, obj] of map) {
      if (seen.has(id)) continue
      this.scene.remove(obj)
      map.delete(id)
      const ring = this.rings.get(id)
      if (ring) {
        this.scene.remove(ring)
        this.rings.delete(id)
      }
      const bar = this.bars.get(id)
      if (bar) {
        this.scene.remove(bar)
        this.bars.delete(id)
      }
    }
  }
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0
  return h >>> 0
}

function textSprite(text: string, color: number, alpha: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = 'bold 28px Georgia, serif'
    ctx.strokeStyle = '#1b140c'
    ctx.lineWidth = 6
    ctx.textAlign = 'center'
    ctx.strokeText(text, 128, 40)
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
    ctx.globalAlpha = alpha
    ctx.fillText(text, 128, 40)
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }))
  sprite.scale.set(48, 12, 1)
  return sprite
}
