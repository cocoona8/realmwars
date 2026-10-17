import type { Difficulty, RaceId } from '../data/races'
import {
  costLabel,
  getBuildingDef,
  getRace,
  getUnitDef,
  missingResource,
  pay,
  refund,
  type BuildingDef,
  type Cost,
  type UnitDef,
} from '../data/races'
import type { Building } from '../entities/Building'
import type { ResourceNode } from '../entities/ResourceNode'
import type { Order, Unit } from '../entities/Unit'
import type { NetOp } from '../net/protocol'
import { EnemyAI } from '../ai/EnemyAI'
import { COLS, MAP_H, MAP_W, ROWS, TILE, findPath, tileCenter, tileOf } from './pathfinding'

export interface PlayerState extends Cost {
  id: 0 | 1
  race: RaceId
  ai: boolean
}

export interface Fx {
  kind: 'line' | 'circle' | 'text'
  x: number
  y: number
  x2: number
  y2: number
  r: number
  color: number
  text: string
  life: number
  max: number
}

export interface Toast {
  text: string
  until: number
}

export interface WorldOptions {
  me?: 0 | 1
  vsHuman?: boolean
  puppet?: boolean
  hostRace?: RaceId
  guestRace?: RaceId
}

export interface Snapshot {
  time: number
  nextId: number
  winner: 0 | 1 | null
  players: [PlayerState, PlayerState]
  units: Unit[]
  buildings: Building[]
  nodes: ResourceNode[]
  fx: Fx[]
  toasts: Toast[]
  sounds: string[]
}

const GATHER_TIME = 2.4
const WOOD_TRIP = 8
const ORE_TRIP = 10

export class World {
  readonly players: [PlayerState, PlayerState]
  readonly units: Unit[] = []
  readonly buildings: Building[] = []
  readonly nodes: ResourceNode[] = []
  readonly fx: Fx[] = []
  readonly sounds: string[] = []
  readonly toasts: Toast[] = []
  readonly me: 0 | 1
  readonly vsHuman: boolean
  readonly puppet: boolean
  time = 0
  ended: 'win' | 'lose' | null = null
  winner: 0 | 1 | null = null
  readonly difficulty: Difficulty
  private nextId = 1
  private outbox: NetOp[] = []
  private grid = new Uint8Array(COLS * ROWS)
  private readonly explored: [Uint8Array, Uint8Array] = [new Uint8Array(COLS * ROWS), new Uint8Array(COLS * ROWS)]
  private readonly sight: [Uint8Array, Uint8Array] = [new Uint8Array(COLS * ROWS), new Uint8Array(COLS * ROWS)]
  private lastToast = ''
  private lastToastAt = -10
  private alertAt = 0
  private nextAttackSound = 0
  private readonly ai: EnemyAI

  constructor(playerRace: RaceId, difficulty: Difficulty, options: WorldOptions = {}) {
    this.difficulty = difficulty
    this.me = options.me ?? 0
    this.vsHuman = options.vsHuman ?? false
    this.puppet = options.puppet ?? false
    const hostRace = options.hostRace ?? playerRace
    const guestRace = options.guestRace ?? (['human', 'magic', 'monster'] as RaceId[])[Math.floor(Math.random() * 3)]
    this.players = [
      { id: 0, race: hostRace, wood: 0, gold: 0, iron: 0, ai: false },
      { id: 1, race: guestRace, wood: 0, gold: 0, iron: 0, ai: !this.vsHuman },
    ]
    this.ai = new EnemyAI(this)
    if (this.puppet) return
    this.createMap()
    this.spawnBase(0, 7, 21)
    this.spawnBase(1, 62, 21)
    this.ensureGrid()
    this.sendStartingWorkers()
    this.refreshFog()
  }

  update(dt: number): void {
    if (this.puppet) {
      this.refreshFog()
      this.toasts.splice(0, this.toasts.length, ...this.toasts.filter((toast) => toast.until > this.time))
      this.decayFx(dt)
      return
    }
    this.time += dt
    this.toasts.splice(0, this.toasts.length, ...this.toasts.filter((toast) => toast.until > this.time))
    if (this.ended) {
      this.decayFx(dt)
      return
    }
    this.ensureGrid()
    for (const building of [...this.buildings]) this.updateBuilding(building, dt)
    for (const unit of [...this.units]) {
      if (unit.hp > 0) this.updateUnit(unit, dt)
    }
    this.separate()
    this.refreshFog()
    if (!this.vsHuman) this.ai.update(dt)
    this.decayFx(dt)
    this.checkEnd()
  }

  unitDef(unit: Unit): UnitDef {
    return getUnitDef(this.players[unit.owner].race, unit.defId)
  }

  buildingDef(building: Building): BuildingDef {
    return getBuildingDef(this.players[building.owner].race, building.defId)
  }

  raceOf(owner: 0 | 1): RaceId {
    return this.players[owner].race
  }

  supplyUsed(owner: 0 | 1): number {
    return this.units.filter((unit) => unit.owner === owner).length
  }

  supplyMax(owner: 0 | 1): number {
    let total = 0
    for (const building of this.buildings) {
      if (building.owner === owner && building.progress >= 1) total += this.buildingDef(building).supplyBonus
    }
    return total
  }

  pendingSupply(owner: 0 | 1): number {
    return this.buildings.filter((building) => building.owner === owner).reduce((sum, building) => sum + building.queue.length, 0)
  }

  isFlying(unit: Unit): boolean {
    if (unit.plantedUntil > this.time) return false
    return this.unitDef(unit).flying
  }

  isVisibleTo(unit: Unit, viewer: 0 | 1): boolean {
    if (unit.owner === viewer) return true
    if (!this.inSight(viewer, unit.x, unit.y)) return false
    const def = this.unitDef(unit)
    if (!def.camouflage) return true
    if (unit.revealUntil > this.time) return true
    for (const building of this.buildings) {
      if (building.owner !== viewer || building.progress < 1) continue
      if (this.distanceToBuilding(unit.x, unit.y, building) < 70) return true
    }
    return false
  }

  inSight(viewer: 0 | 1, x: number, y: number): boolean {
    return this.tileSight(viewer, Math.floor(x / TILE), Math.floor(y / TILE))
  }

  isExplored(viewer: 0 | 1, x: number, y: number): boolean {
    return this.tileExplored(viewer, Math.floor(x / TILE), Math.floor(y / TILE))
  }

  tileSight(viewer: 0 | 1, tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false
    return this.sight[viewer][ty * COLS + tx] === 1
  }

  tileExplored(viewer: 0 | 1, tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false
    return this.explored[viewer][ty * COLS + tx] === 1
  }

  isBuildingRevealed(building: Building, viewer: 0 | 1): boolean {
    if (building.owner === viewer) return true
    const def = this.buildingDef(building)
    for (let y = building.tileY; y < building.tileY + def.tilesH; y += 1) {
      for (let x = building.tileX; x < building.tileX + def.tilesW; x += 1) {
        if (this.tileExplored(viewer, x, y)) return true
      }
    }
    return false
  }

  refreshFog(): void {
    this.sight[0].fill(0)
    this.sight[1].fill(0)
    for (const unit of this.units) {
      if (unit.hp <= 0) continue
      this.paintSight(unit.owner, unit.x, unit.y, this.unitSight(unit))
    }
    for (const building of this.buildings) {
      if (building.hp <= 0) continue
      const center = this.centerOf(building)
      this.paintSight(building.owner, center.x, center.y, this.buildingSight(building))
    }
  }

  private unitSight(unit: Unit): number {
    const def = this.unitDef(unit)
    if (def.flying) return 250
    if (def.role === 'worker') return 150
    if (def.role === 'giant') return 190
    return 185
  }

  private buildingSight(building: Building): number {
    const def = this.buildingDef(building)
    if (building.progress < 1) return 90
    if (def.dropoff) return 270
    return 200 + Math.max(def.tilesW, def.tilesH) * 10
  }

  private paintSight(owner: 0 | 1, wx: number, wy: number, radius: number): void {
    const rTiles = Math.ceil(radius / TILE)
    const tx = Math.floor(wx / TILE)
    const ty = Math.floor(wy / TILE)
    const r2 = radius * radius
    for (let y = ty - rTiles; y <= ty + rTiles; y += 1) {
      for (let x = tx - rTiles; x <= tx + rTiles; x += 1) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue
        const dx = (x + 0.5) * TILE - wx
        const dy = (y + 0.5) * TILE - wy
        if (dx * dx + dy * dy > r2) continue
        const i = y * COLS + x
        this.sight[owner][i] = 1
        this.explored[owner][i] = 1
      }
    }
  }

  toast(text: string): void {
    if (this.lastToast === text && this.time < this.lastToastAt + 1.4) return
    this.lastToast = text
    this.lastToastAt = this.time
    this.toasts.push({ text, until: this.time + 3.2 })
  }

  centerOf(building: Building): { x: number; y: number } {
    const def = this.buildingDef(building)
    return {
      x: (building.tileX + def.tilesW / 2) * TILE,
      y: (building.tileY + def.tilesH / 2) * TILE,
    }
  }

  distanceToBuilding(x: number, y: number, building: Building): number {
    const def = this.buildingDef(building)
    const left = building.tileX * TILE
    const top = building.tileY * TILE
    const right = left + def.tilesW * TILE
    const bottom = top + def.tilesH * TILE
    const cx = Math.max(left, Math.min(x, right))
    const cy = Math.max(top, Math.min(y, bottom))
    return Math.hypot(x - cx, y - cy)
  }

  canPlace(_owner: 0 | 1, def: BuildingDef, tileX: number, tileY: number): boolean {
    if (tileX < 1 || tileY < 1 || tileX + def.tilesW >= COLS - 1 || tileY + def.tilesH >= ROWS - 1) return false
    for (let y = tileY; y < tileY + def.tilesH; y += 1) {
      for (let x = tileX; x < tileX + def.tilesW; x += 1) {
        if (this.forestAt(x, y) || this.buildingAtTile(x, y)) return false
      }
    }
    if (def.mineShaft) return this.nodes.some((node) => node.kind === 'mine' && !node.shaftId && this.covers(tileX, tileY, def, node))
    return !this.nodes.some((node) => node.kind === 'mine' && this.covers(tileX, tileY, def, node))
  }

  snapPlacement(owner: 0 | 1, def: BuildingDef, tileX: number, tileY: number): { tx: number; ty: number } | null {
    if (!def.mineShaft) return this.canPlace(owner, def, tileX, tileY) ? { tx: tileX, ty: tileY } : null
    let best: ResourceNode | null = null
    let bestD = 7
    for (const node of this.nodes) {
      if (node.kind !== 'mine' || node.shaftId) continue
      const dist = Math.abs(node.tileX - tileX) + Math.abs(node.tileY - tileY)
      if (dist < bestD) {
        bestD = dist
        best = node
      }
    }
    if (!best) return null
    for (let dy = 0; dy > -def.tilesH; dy -= 1) {
      for (let dx = 0; dx > -def.tilesW; dx -= 1) {
        const tx = best.tileX + dx
        const ty = best.tileY + dy
        if (this.canPlace(owner, def, tx, ty)) return { tx, ty }
      }
    }
    return null
  }

  findSpot(owner: 0 | 1, defId: string, originTx: number, originTy: number): { tx: number; ty: number } | null {
    const def = getBuildingDef(this.players[owner].race, defId)
    if (def.mineShaft) {
      const origin = tileCenter(originTx, originTy)
      const mines = this.nodes.filter((node) => node.kind === 'mine' && !node.shaftId)
      mines.sort((a, b) => Math.hypot(a.tileX * TILE - origin.x, a.tileY * TILE - origin.y) - Math.hypot(b.tileX * TILE - origin.x, b.tileY * TILE - origin.y))
      for (const mine of mines) {
        for (let dy = 0; dy > -def.tilesH; dy -= 1) {
          for (let dx = 0; dx > -def.tilesW; dx -= 1) {
            const tx = mine.tileX + dx
            const ty = mine.tileY + dy
            if (this.canPlace(owner, def, tx, ty)) return { tx, ty }
          }
        }
      }
      return null
    }
    for (let radius = 3; radius < 18; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
          const tx = originTx + dx
          const ty = originTy + dy
          if (this.canPlace(owner, def, tx, ty)) return { tx, ty }
        }
      }
    }
    return null
  }

  placeBuilding(owner: 0 | 1, defId: string, tileX: number, tileY: number, worker: Unit | null, queue: boolean, extra: Unit[] = []): boolean {
    if (this.puppet && owner === this.me) {
      const workerIds = [worker, ...extra].filter((unit): unit is Unit => !!unit).map((unit) => unit.id)
      this.outbox.push({ op: 'place', defId, tileX, tileY, workerIds, queue })
      return true
    }
    const def = getBuildingDef(this.players[owner].race, defId)
    if (!this.canPlace(owner, def, tileX, tileY)) {
      if (owner === 0) this.toast('Cannot build there.')
      return false
    }
    const missing = missingResource(this.players[owner], def.cost)
    if (missing) {
      if (owner === 0) this.toast(missing)
      return false
    }
    pay(this.players[owner], def.cost)
    const building = this.addBuilding(owner, def, tileX, tileY, 0)
    const crew = [worker, ...extra].filter((unit): unit is Unit => !!unit && unit.owner === owner)
    if (def.mineShaft) {
      const mine = this.nodes.find((node) => node.kind === 'mine' && !node.shaftId && this.covers(tileX, tileY, def, node))
      if (mine) {
        mine.shaftId = building.id
        building.mineId = mine.id
        for (const unit of crew) unit.lastGatherId = mine.id
      }
    }
    this.gridDirty()
    if (crew[0]) this.command([crew[0]], { type: 'build', buildingId: building.id }, queue)
    if (crew.length > 1) this.command(crew.slice(1), { type: 'build', buildingId: building.id }, queue)
    if (owner === this.me) this.sounds.push('command')
    return true
  }

  train(buildingId: string, unitId: string): boolean {
    if (this.puppet) {
      this.outbox.push({ op: 'train', buildingId, unitId })
      return true
    }
    const building = this.buildings.find((entry) => entry.id === buildingId)
    if (!building || building.progress < 1) {
      if (building?.owner === 0) this.toast('That building is still under construction.')
      return false
    }
    const def = this.buildingDef(building)
    if (!def.trains.includes(unitId)) return false
    if (building.queue.length >= 5) {
      if (building.owner === 0) this.toast('Training queue is full (5).')
      return false
    }
    const unitDef = getUnitDef(this.players[building.owner].race, unitId)
    const missing = missingResource(this.players[building.owner], unitDef.cost)
    if (missing) {
      if (building.owner === 0) this.toast(missing)
      return false
    }
    if (this.supplyUsed(building.owner) + this.pendingSupply(building.owner) + unitDef.supply > this.supplyMax(building.owner)) {
      if (building.owner === 0) {
        const supply = getBuildingDef(this.players[building.owner].race, getRace(this.players[building.owner].race).supplyBuildingId)
        this.toast(`Unit limit reached. Build a ${supply.name} (${costLabel(supply.cost)}) for 4 more slots.`)
      }
      return false
    }
    pay(this.players[building.owner], unitDef.cost)
    building.queue.push(unitId)
    if (building.owner === 0) this.sounds.push('train')
    return true
  }

  cancelTrain(buildingId: string): boolean {
    if (this.puppet) {
      this.outbox.push({ op: 'cancelTrain', buildingId })
      return true
    }
    const building = this.buildings.find((entry) => entry.id === buildingId)
    const unitId = building?.queue.pop()
    if (!building || !unitId) return false
    if (!building.queue.length) building.trainTime = 0
    refund(this.players[building.owner], getUnitDef(this.players[building.owner].race, unitId).cost)
    if (building.owner === 0) this.sounds.push('command')
    return true
  }

  upgrade(buildingId: string): boolean {
    if (this.puppet) {
      this.outbox.push({ op: 'upgrade', buildingId })
      return true
    }
    const building = this.buildings.find((entry) => entry.id === buildingId)
    if (!building || building.progress < 1) return false
    const def = this.buildingDef(building)
    if (!def.upgradeTo || !def.upgradeCost) return false
    const missing = missingResource(this.players[building.owner], def.upgradeCost)
    if (missing) {
      if (building.owner === 0) this.toast(missing)
      return false
    }
    pay(this.players[building.owner], def.upgradeCost)
    building.defId = def.upgradeTo
    const next = this.buildingDef(building)
    building.hp = next.hp
    if (building.owner === 0) this.sounds.push('complete')
    return true
  }

  command(units: Unit[], order: Order, queue: boolean): void {
    if (this.puppet) this.outbox.push({ op: 'command', unitIds: units.map((unit) => unit.id), order, queue })
    units.forEach((unit, index) => {
      if (unit.hp <= 0 || unit.plantedUntil > this.time) return
      unit.holding = false
      unit.anchored = false
      unit.path = []
      unit.goalTx = -1
      if (!queue) unit.gatherTimer = 0
      const next = structuredClone(this.withSpread(order, index))
      if (next.type === 'patrol') {
        next.ox = unit.x
        next.oy = unit.y
        next.going = true
      }
      if (next.type === 'gather') unit.lastGatherId = next.nodeId
      if (queue && unit.orders.length) unit.orders.push(next)
      else unit.orders = [next]
    })
  }

  stopUnits(units: Unit[]): void {
    if (this.puppet) this.outbox.push({ op: 'stop', unitIds: units.map((unit) => unit.id) })
    for (const unit of units) {
      unit.orders = []
      unit.holding = false
      unit.path = []
      unit.anchored = true
      unit.anchorX = unit.x
      unit.anchorY = unit.y
    }
  }

  holdUnits(units: Unit[]): void {
    if (this.puppet) this.outbox.push({ op: 'hold', unitIds: units.map((unit) => unit.id) })
    for (const unit of units) {
      unit.orders = []
      unit.holding = true
      unit.path = []
      unit.anchored = false
    }
  }

  unitAt(x: number, y: number, viewer: 0 | 1): Unit | null {
    let best: Unit | null = null
    let bestD = 1e9
    for (const unit of this.units) {
      if (!this.isVisibleTo(unit, viewer)) continue
      if (!this.unitContains(unit, x, y)) continue
      const dist = Math.hypot(unit.x - x, unit.y - y)
      if (dist < bestD) {
        best = unit
        bestD = dist
      }
    }
    return best
  }

  unitOverlaps(unit: Unit, left: number, top: number, right: number, bottom: number): boolean {
    const box = this.bodyBox(unit)
    return box.left < right && box.right > left && box.top < bottom && box.bottom > top
  }

  private unitContains(unit: Unit, x: number, y: number): boolean {
    const box = this.bodyBox(unit)
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
  }

  private bodyBox(unit: Unit): { left: number; right: number; top: number; bottom: number } {
    const def = this.unitDef(unit)
    if (unit.plantedUntil > this.time) {
      const r = def.radius + 10
      return { left: unit.x - r, right: unit.x + r, top: unit.y - r, bottom: unit.y + r }
    }
    const feet = unit.y + def.radius * 0.55
    const height = 28 + Math.max(0, def.radius * def.scale - 10) * 1.8
    const half = Math.max(def.radius + 10, height * 0.32)
    return { left: unit.x - half, right: unit.x + half, top: feet - height - 6, bottom: feet + 10 }
  }

  private sendStartingWorkers(): void {
    for (const owner of [0, 1] as const) {
      const workers = this.units.filter((unit) => unit.owner === owner && this.unitDef(unit).role === 'worker')
      if (!workers.length) continue
      const x = workers.reduce((sum, unit) => sum + unit.x, 0) / workers.length
      const y = workers.reduce((sum, unit) => sum + unit.y, 0) / workers.length
      const forest = this.nearestNode('forest', x, y)
      if (forest) this.command(workers, { type: 'gather', nodeId: forest.id }, false)
    }
  }

  buildingAtPoint(x: number, y: number): Building | null {
    const tile = tileOf(x, y)
    for (let i = this.buildings.length - 1; i >= 0; i -= 1) {
      const building = this.buildings[i]
      if (!this.isBuildingRevealed(building, this.me)) continue
      const def = this.buildingDef(building)
      if (tile.x >= building.tileX && tile.x < building.tileX + def.tilesW && tile.y >= building.tileY && tile.y < building.tileY + def.tilesH) {
        return building
      }
    }
    return null
  }

  nodeAt(x: number, y: number): ResourceNode | null {
    if (!this.isExplored(this.me, x, y)) return null
    const tile = tileOf(x, y)
    let best: ResourceNode | null = null
    let bestD = 1e9
    for (const node of this.nodes) {
      if (node.kind === 'mine') {
        const center = tileCenter(node.tileX, node.tileY)
        const dist = Math.hypot(center.x - x, center.y - y)
        if (dist <= 28 && dist < bestD) {
          best = node
          bestD = dist
        }
        continue
      }
      const pad = 1
      if (tile.x >= node.tileX - pad && tile.x < node.tileX + node.tilesW + pad && tile.y >= node.tileY - pad && tile.y < node.tileY + node.tilesH + pad) {
        const cx = (node.tileX + node.tilesW / 2) * TILE
        const cy = (node.tileY + node.tilesH / 2) * TILE
        const dist = Math.hypot(cx - x, cy - y)
        if (dist < bestD) {
          best = node
          bestD = dist
        }
      }
    }
    return best
  }

  nearestNode(kind: ResourceNode['kind'], x: number, y: number): ResourceNode | null {
    return this.closestNode(kind, x, y, false, 0)
  }

  preferredNode(kind: ResourceNode['kind'], x: number, y: number, workers: Unit[]): ResourceNode | null {
    const owner = workers[0]?.owner ?? this.me
    for (const unit of workers) {
      const remembered = unit.lastGatherId ? this.nodes.find((node) => node.id === unit.lastGatherId) : undefined
      if (remembered && this.nodeHasResource(remembered, kind)) return remembered
    }
    if (kind === 'mine') {
      const owned = this.closestNode(kind, x, y, true, owner)
      if (owned) return owned
    }
    return this.nearestNode(kind, x, y)
  }

  hasMineToResume(owner: 0 | 1, workers: Unit[]): boolean {
    if (workers.some((unit) => {
      const node = unit.lastGatherId ? this.nodes.find((entry) => entry.id === unit.lastGatherId) : undefined
      return !!node && this.nodeHasResource(node, 'mine')
    })) return true
    return !!this.closestNode('mine', 0, 0, true, owner)
  }

  private nodeHasResource(node: ResourceNode, kind: ResourceNode['kind']): boolean {
    if (node.kind !== kind) return false
    return kind === 'forest' ? node.wood > 0 : node.ore > 0
  }

  private closestNode(kind: ResourceNode['kind'], x: number, y: number, ownedShaftOnly: boolean, owner: 0 | 1): ResourceNode | null {
    let best: ResourceNode | null = null
    let bestD = 1e9
    for (const node of this.nodes) {
      if (!this.nodeHasResource(node, kind)) continue
      if (ownedShaftOnly) {
        const shaft = node.shaftId ? this.buildings.find((building) => building.id === node.shaftId) : undefined
        if (!shaft || shaft.owner !== owner) continue
      }
      const cx = (node.tileX + node.tilesW / 2) * TILE
      const cy = (node.tileY + node.tilesH / 2) * TILE
      const dist = Math.hypot(cx - x, cy - y)
      if (dist < bestD) {
        best = node
        bestD = dist
      }
    }
    return best
  }

  private createMap(): void {
    const forest = (tileX: number, tileY: number, tilesW: number, tilesH: number, wood: number) => {
      this.nodes.push({ id: this.nid('forest'), kind: 'forest', tileX, tileY, tilesW, tilesH, wood, ore: 0 })
    }
    const mine = (tileX: number, tileY: number, ore = 520) => {
      this.nodes.push({ id: this.nid('mine'), kind: 'mine', tileX, tileY, tilesW: 1, tilesH: 1, wood: 0, ore })
    }
    forest(13, 18, 5, 6, 900)
    forest(52, 18, 5, 6, 900)
    forest(31, 9, 10, 30, 5000)
    mine(8, 16)
    mine(63, 16)
    for (const spot of [
      [2, 2],
      [18, 2],
      [36, 2],
      [68, 2],
      [2, 24],
      [69, 24],
      [2, 45],
      [18, 45],
      [36, 45],
      [68, 45],
    ] as Array<[number, number]>) {
      mine(spot[0], spot[1], 460)
    }
  }

  private spawnBase(owner: 0 | 1, tileX: number, tileY: number): void {
    const race = getRace(this.players[owner].race)
    const main = getBuildingDef(race.id, race.mainBuildingId)
    this.addBuilding(owner, main, tileX, tileY, 1)
    if (race.id === 'human') {
      const village = getBuildingDef(race.id, race.supplyBuildingId)
      this.addBuilding(owner, village, tileX, tileY + 4, 1)
    }
    const worker = getUnitDef(race.id, race.workerId)
    const side = owner === 0 ? 1 : -1
    for (let i = 0; i < 3; i += 1) {
      this.spawnUnit(owner, worker, (tileX + (side > 0 ? 4 : -1)) * TILE + 16, (tileY + 1 + i) * TILE + 8)
    }
  }

  private addBuilding(owner: 0 | 1, def: BuildingDef, tileX: number, tileY: number, progress: number): Building {
    const building: Building = {
      id: this.nid('b'),
      defId: def.id,
      owner,
      tileX,
      tileY,
      hp: def.hp,
      progress,
      queue: [],
      trainTime: 0,
      rallyX: 0,
      rallyY: 0,
    }
    const center = {
      x: (tileX + def.tilesW / 2) * TILE,
      y: (tileY + def.tilesH / 2) * TILE,
    }
    const angle = Math.atan2(MAP_H / 2 - center.y, MAP_W / 2 - center.x)
    building.rallyX = center.x + Math.cos(angle) * 90
    building.rallyY = center.y + Math.sin(angle) * 90
    this.buildings.push(building)
    return building
  }

  private spawnUnit(owner: 0 | 1, def: UnitDef, x: number, y: number): Unit {
    const unit: Unit = {
      id: this.nid('u'),
      defId: def.id,
      owner,
      x,
      y,
      hp: def.hp,
      facing: owner === 0 ? 0 : Math.PI,
      orders: [],
      holding: false,
      carryWood: 0,
      carryGold: 0,
      carryIron: 0,
      gatherTimer: 0,
      lastGatherId: null,
      attackCooldown: 0.2,
      plantReady: 0,
      curseReady: 4,
      drainReady: 2,
      healReady: 0.4,
      plantedUntil: 0,
      hasteUntil: 0,
      revealUntil: 0,
      path: [],
      goalTx: -1,
      goalTy: -1,
      repathAt: 0,
      anchorX: x,
      anchorY: y,
      anchored: true,
    }
    this.units.push(unit)
    return unit
  }

  private updateBuilding(building: Building, dt: number): void {
    const def = this.buildingDef(building)
    if (building.progress >= 1 && getRace(this.players[building.owner].race).regenBuildings && building.hp < def.hp) {
      building.hp = Math.min(def.hp, building.hp + 3 * dt)
    }
    if (building.progress < 1 || building.queue.length === 0) return
    const unitDef = getUnitDef(this.players[building.owner].race, building.queue[0])
    if (this.supplyUsed(building.owner) + unitDef.supply > this.supplyMax(building.owner)) return
    building.trainTime += dt
    if (building.trainTime < unitDef.trainTime) return
    building.trainTime = 0
    building.queue.shift()
    const spot = this.approachBuilding(building, building.rallyX, building.rallyY)
    const unit = this.spawnUnit(building.owner, unitDef, spot.x, spot.y)
    if (Math.hypot(unit.x - building.rallyX, unit.y - building.rallyY) > 24) {
      unit.orders = [{ type: 'move', x: building.rallyX, y: building.rallyY }]
      unit.anchored = false
    }
    if (building.owner === 0) this.sounds.push('complete')
  }

  private updateUnit(unit: Unit, dt: number): void {
    const def = this.unitDef(unit)
    if (unit.attackCooldown > 0) unit.attackCooldown -= dt
    if (unit.plantedUntil > this.time) return
    if (unit.holding) {
      if (def.role !== 'worker') this.strikeNearest(unit, def.range, false)
      return
    }
    const engaged = unit.orders[0]
    if (engaged?.type === 'attack' || (def.role !== 'worker' && (engaged?.type === 'attackMove' || engaged?.type === 'patrol'))) {
      if (this.performCombat(unit, dt)) return
    }
    const order = unit.orders[0]
    if (!order) {
      if (def.role !== 'worker') this.idleCombat(unit, dt)
      return
    }
    if (order.type === 'move' || order.type === 'attackMove') {
      if (Math.hypot(unit.x - order.x, unit.y - order.y) < 14) {
        unit.orders.shift()
        unit.anchored = true
        unit.anchorX = unit.x
        unit.anchorY = unit.y
        return
      }
      this.moveToward(unit, order.x, order.y, dt)
      return
    }
    if (order.type === 'patrol') {
      const dest = order.going ? { x: order.x, y: order.y } : { x: order.ox, y: order.oy }
      if (Math.hypot(unit.x - dest.x, unit.y - dest.y) < 16) order.going = !order.going
      else this.moveToward(unit, dest.x, dest.y, dt)
      return
    }
    if (order.type === 'gather') this.gather(unit, order.nodeId, dt)
    else if (order.type === 'return') this.returnCargo(unit, dt)
    else if (order.type === 'build') this.construct(unit, order.buildingId, dt)
    else if (order.type === 'attack') unit.orders.shift()
  }

  private performCombat(unit: Unit, dt: number): boolean {
    const order = unit.orders[0]
    if (order?.type === 'attack') {
      const target = this.targetById(order.targetId)
      if (!target || !this.canAttack(unit, target)) {
        if (unit.owner === 0 && target?.kind === 'unit' && this.isFlying(target.unit) && !this.unitDef(unit).canHitAir) {
          this.toast('That unit cannot hit air units.')
        }
        unit.orders.shift()
        return true
      }
      this.chaseOrHit(unit, target, dt, true)
      return true
    }
    const found = this.findTarget(unit, 190)
    if (!found) return false
    this.chaseOrHit(unit, found, dt, true)
    return true
  }

  private idleCombat(unit: Unit, dt: number): void {
    if (!unit.anchored) {
      unit.anchored = true
      unit.anchorX = unit.x
      unit.anchorY = unit.y
    }
    const target = this.findTarget(unit, this.unitDef(unit).range + 36)
    if (target) {
      const spot = this.targetPoint(target)
      if (Math.hypot(spot.x - unit.anchorX, spot.y - unit.anchorY) < 210) {
        this.chaseOrHit(unit, target, dt, false)
        return
      }
    }
    if (Math.hypot(unit.x - unit.anchorX, unit.y - unit.anchorY) > 18) this.moveToward(unit, unit.anchorX, unit.anchorY, dt)
  }

  private strikeNearest(unit: Unit, range: number, chase: boolean): void {
    const target = this.findTarget(unit, range)
    if (!target) return
    this.chaseOrHit(unit, target, 0, chase)
  }

  private chaseOrHit(unit: Unit, target: { kind: 'unit'; unit: Unit } | { kind: 'building'; building: Building }, dt: number, chase: boolean): void {
    const def = this.unitDef(unit)
    const point = this.targetPoint(target)
    const dist = target.kind === 'unit' ? Math.hypot(unit.x - point.x, unit.y - point.y) : this.distanceToBuilding(unit.x, unit.y, target.building)
    unit.facing = Math.atan2(point.y - unit.y, point.x - unit.x)
    if (dist <= def.range) {
      this.tryHit(unit, target)
      return
    }
    if (chase) this.moveToward(unit, point.x, point.y, dt)
  }

  private tryHit(unit: Unit, target: { kind: 'unit'; unit: Unit } | { kind: 'building'; building: Building }): void {
    const def = this.unitDef(unit)
    if (unit.attackCooldown > 0) return
    unit.attackCooldown = def.attackInterval
    if (def.camouflage) unit.revealUntil = this.time + 2.5
    const point = this.targetPoint(target)
    if (def.healer) this.castHeal(unit)
    if (def.plantDuration > 0 && target.kind === 'unit' && this.time >= unit.plantReady) {
      target.unit.plantedUntil = this.time + def.plantDuration
      target.unit.orders = []
      target.unit.path = []
      unit.plantReady = this.time + def.plantCooldown
      this.fx.push({ kind: 'circle', x: point.x, y: point.y, x2: 0, y2: 0, r: 22, color: 0x7dce6a, text: '', life: 0.4, max: 0.4 })
      this.fx.push({ kind: 'text', x: point.x, y: point.y - 18, x2: 0, y2: 0, r: 0, color: 0xb6f5a8, text: 'Planted', life: 0.8, max: 0.8 })
      return
    }
    if (def.dark && target.kind === 'unit') {
      this.castDark(unit, target.unit, point)
      return
    }
    if (def.cone) {
      this.castCone(unit, def)
      if (this.time >= this.nextAttackSound) {
        this.sounds.push('attack')
        this.nextAttackSound = this.time + 0.18
      }
      return
    }
    let amount = def.damage
    if (def.bonusVsPlant && target.kind === 'unit' && target.unit.plantedUntil > this.time) amount *= 3
    this.applyDamage(target, amount, unit)
    if (def.splash > 0 && target.kind === 'unit') {
      for (const other of this.units) {
        if (other.owner === unit.owner || other.id === target.unit.id || other.hp <= 0) continue
        if (!this.canAttack(unit, { kind: 'unit', unit: other })) continue
        if (Math.hypot(other.x - point.x, other.y - point.y) <= def.splash) this.applyDamage({ kind: 'unit', unit: other }, Math.round(def.damage * 0.55), unit)
      }
      this.fx.push({ kind: 'circle', x: point.x, y: point.y, x2: 0, y2: 0, r: def.splash, color: 0xff8a3d, text: '', life: 0.2, max: 0.2 })
    }
    this.fx.push({ kind: 'line', x: unit.x, y: unit.y, x2: point.x, y2: point.y, r: 0, color: def.role === 'caster' ? 0xffd56a : 0xfff4d2, text: '', life: 0.12, max: 0.12 })
    if (this.time >= this.nextAttackSound) {
      this.sounds.push('attack')
      this.nextAttackSound = this.time + 0.18
    }
  }

  private castHeal(unit: Unit): void {
    if (this.time < unit.healReady) return
    unit.healReady = this.time + 2
    let wounded: Unit | null = null
    let worst = 0.999
    for (const ally of this.units) {
      if (ally.owner !== unit.owner || ally.hp <= 0 || ally.id === unit.id) continue
      if (Math.hypot(ally.x - unit.x, ally.y - unit.y) > 180) continue
      const ratio = ally.hp / this.unitDef(ally).hp
      if (ratio < worst) {
        worst = ratio
        wounded = ally
      }
    }
    if (wounded && worst < 1) {
      const def = this.unitDef(wounded)
      wounded.hp = Math.min(def.hp, wounded.hp + 14)
      wounded.hasteUntil = Math.max(wounded.hasteUntil, this.time + 8)
      this.fx.push({ kind: 'line', x: unit.x, y: unit.y, x2: wounded.x, y2: wounded.y, r: 0, color: 0x9dffb0, text: '', life: 0.2, max: 0.2 })
      return
    }
    for (const ally of this.units) {
      if (ally.owner !== unit.owner || ally.id === unit.id) continue
      if (Math.hypot(ally.x - unit.x, ally.y - unit.y) > 180) continue
      ally.hasteUntil = Math.max(ally.hasteUntil, this.time + 8)
      break
    }
  }

  private castDark(unit: Unit, target: Unit, point: { x: number; y: number }): void {
    const nearby = this.units.filter((other) => other.owner !== unit.owner && other.hp > 0 && this.canAttack(unit, { kind: 'unit', unit: other }) && Math.hypot(other.x - point.x, other.y - point.y) < 90)
    if (this.time >= unit.curseReady && nearby.length >= 2) {
      unit.curseReady = this.time + 7
      for (const other of nearby) this.applyDamage({ kind: 'unit', unit: other }, 16, unit)
      this.fx.push({ kind: 'circle', x: point.x, y: point.y, x2: 0, y2: 0, r: 90, color: 0x7a4dff, text: '', life: 0.28, max: 0.28 })
      return
    }
    if (this.time >= unit.drainReady && unit.hp < this.unitDef(unit).hp * 0.85) {
      unit.drainReady = this.time + 6
      this.applyDamage({ kind: 'unit', unit: target }, 18, unit)
      unit.hp = Math.min(this.unitDef(unit).hp, unit.hp + 18)
      this.fx.push({ kind: 'line', x: point.x, y: point.y, x2: unit.x, y2: unit.y, r: 0, color: 0xd08cff, text: '', life: 0.2, max: 0.2 })
      return
    }
    this.applyDamage({ kind: 'unit', unit: target }, this.unitDef(unit).damage, unit)
    this.fx.push({ kind: 'line', x: unit.x, y: unit.y, x2: point.x, y2: point.y, r: 0, color: 0x6d4aff, text: '', life: 0.14, max: 0.14 })
  }

  private castCone(unit: Unit, def: UnitDef): void {
    const half = 0.48
    for (const other of [...this.units]) {
      if (other.owner === unit.owner || other.hp <= 0) continue
      if (!this.inCone(unit, other.x, other.y, def.range, half)) continue
      if (!this.canAttack(unit, { kind: 'unit', unit: other })) continue
      this.applyDamage({ kind: 'unit', unit: other }, def.damage, unit)
    }
    for (const building of [...this.buildings]) {
      if (building.owner === unit.owner || building.hp <= 0) continue
      const edge = this.distanceToBuilding(unit.x, unit.y, building)
      const center = this.centerOf(building)
      const near = this.nearestPointOn(building, unit.x, unit.y)
      const hit = edge < 4 || (edge <= def.range && (this.inCone(unit, near.x, near.y, def.range, half) || this.inCone(unit, center.x, center.y, Infinity, half)))
      if (hit) this.applyDamage({ kind: 'building', building }, def.damage, unit)
    }
    const x2 = unit.x + Math.cos(unit.facing) * def.range
    const y2 = unit.y + Math.sin(unit.facing) * def.range
    this.fx.push({ kind: 'line', x: unit.x, y: unit.y, x2, y2, r: 18, color: 0xff6a2a, text: '', life: 0.18, max: 0.18 })
  }

  private nearestPointOn(building: Building, x: number, y: number): { x: number; y: number } {
    const def = this.buildingDef(building)
    const left = building.tileX * TILE
    const top = building.tileY * TILE
    return {
      x: Math.max(left, Math.min(x, left + def.tilesW * TILE)),
      y: Math.max(top, Math.min(y, top + def.tilesH * TILE)),
    }
  }

  private inCone(unit: Unit, x: number, y: number, range: number, half: number): boolean {
    const dx = x - unit.x
    const dy = y - unit.y
    const dist = Math.hypot(dx, dy)
    if (dist > range || dist < 4) return false
    const angle = Math.atan2(dy, dx)
    const diff = Math.atan2(Math.sin(angle - unit.facing), Math.cos(angle - unit.facing))
    return Math.abs(diff) <= half
  }

  private applyDamage(target: { kind: 'unit'; unit: Unit } | { kind: 'building'; building: Building }, amount: number, attacker: Unit): void {
    if (target.kind === 'unit') {
      target.unit.hp -= amount
      if (target.unit.hp <= 0) this.killUnit(target.unit)
      return
    }
    target.building.hp -= amount
    if (target.building.owner === 0 && attacker.owner === 1 && this.time > this.alertAt) {
      this.alertAt = this.time + 8
      this.toast('Your buildings are under attack.')
      this.sounds.push('alert')
    }
    if (target.building.hp <= 0) this.killBuilding(target.building)
    void attacker
  }

  private killUnit(unit: Unit): void {
    const index = this.units.indexOf(unit)
    if (index < 0) return
    this.units.splice(index, 1)
    this.clearTarget(unit.id)
  }

  private killBuilding(building: Building): void {
    const index = this.buildings.indexOf(building)
    if (index < 0) return
    const race = this.players[building.owner].race
    for (const unitId of building.queue) refund(this.players[building.owner], getUnitDef(race, unitId).cost)
    if (building.mineId) {
      const mine = this.nodes.find((node) => node.id === building.mineId)
      if (mine) mine.shaftId = undefined
    }
    this.buildings.splice(index, 1)
    this.gridDirty()
    this.clearTarget(building.id)
    for (const unit of this.units) {
      unit.orders = unit.orders.filter((order) => order.type !== 'build' || order.buildingId !== building.id)
    }
  }

  private clearTarget(id: string): void {
    for (const unit of this.units) {
      unit.orders = unit.orders.filter((order) => order.type !== 'attack' || order.targetId !== id)
    }
  }

  private gather(unit: Unit, nodeId: string, dt: number): void {
    const node = this.nodes.find((entry) => entry.id === nodeId)
    if (!node) {
      unit.orders.shift()
      return
    }
    unit.lastGatherId = node.id
    if (node.kind === 'mine') {
      const shaft = node.shaftId ? this.buildings.find((building) => building.id === node.shaftId) : undefined
      if (!shaft || shaft.owner !== unit.owner) {
        if (unit.owner === this.me) this.toast('Build a Mine Shaft here first. It costs 50 wood.')
        unit.orders.shift()
        return
      }
      if (shaft.progress < 1) {
        unit.orders[0] = { type: 'build', buildingId: shaft.id }
        return
      }
      if (node.ore <= 0) {
        unit.orders.shift()
        if (this.cargo(unit) > 0) unit.orders.unshift({ type: 'return' })
        return
      }
    } else if (node.wood <= 0) {
      unit.orders.shift()
      if (this.cargo(unit) > 0) unit.orders.unshift({ type: 'return' })
      return
    }
    const spot = node.kind === 'mine'
      ? this.approachBuilding(this.buildings.find((building) => building.id === node.shaftId)!, unit.x, unit.y)
      : this.approachRect(node.tileX, node.tileY, node.tilesW, node.tilesH, unit.x, unit.y)
    if (Math.hypot(unit.x - spot.x, unit.y - spot.y) > 24) {
      this.moveToward(unit, spot.x, spot.y, dt)
      return
    }
    unit.gatherTimer += dt
    if (unit.gatherTimer < GATHER_TIME) return
    unit.gatherTimer = 0
    if (node.kind === 'forest') {
      const taken = Math.min(WOOD_TRIP, node.wood)
      node.wood -= taken
      unit.carryWood += taken
    } else {
      const taken = Math.min(ORE_TRIP, node.ore)
      node.ore -= taken
      const gold = Math.ceil(taken / 2)
      unit.carryGold += gold
      unit.carryIron += taken - gold
      if (unit.owner === 0) this.sounds.push('mine')
    }
    if (unit.owner === 0 && node.kind === 'forest') this.sounds.push('chop')
    if (node.kind === 'forest' && node.wood <= 0) this.gridDirty()
    unit.orders.unshift({ type: 'return' })
  }

  private returnCargo(unit: Unit, dt: number): void {
    const drop = this.nearestDropoff(unit.owner, unit.x, unit.y)
    if (!drop) {
      if (unit.owner === 0) this.toast('No building left to drop resources at.')
      return
    }
    if (this.distanceToBuilding(unit.x, unit.y, drop) > 24) {
      const spot = this.approachBuilding(drop, unit.x, unit.y)
      this.moveToward(unit, spot.x, spot.y, dt)
      return
    }
    const player = this.players[unit.owner]
    const text = [
      unit.carryWood ? `+${unit.carryWood} wood` : '',
      unit.carryGold ? `+${unit.carryGold} gold` : '',
      unit.carryIron ? `+${unit.carryIron} iron` : '',
    ].filter(Boolean).join(' ')
    player.wood += unit.carryWood
    player.gold += unit.carryGold
    player.iron += unit.carryIron
    unit.carryWood = 0
    unit.carryGold = 0
    unit.carryIron = 0
    unit.orders.shift()
    if (unit.owner === 0 && text) {
      this.fx.push({ kind: 'text', x: unit.x, y: unit.y - 16, x2: 0, y2: 0, r: 0, color: 0xffe7a3, text, life: 0.9, max: 0.9 })
      this.sounds.push('deposit')
    }
  }

  private construct(unit: Unit, buildingId: string, dt: number): void {
    const building = this.buildings.find((entry) => entry.id === buildingId)
    if (!building || building.owner !== unit.owner) {
      unit.orders.shift()
      return
    }
    if (building.progress >= 1) {
      unit.orders.shift()
      return
    }
    if (this.distanceToBuilding(unit.x, unit.y, building) > 24) {
      const spot = this.approachBuilding(building, unit.x, unit.y)
      this.moveToward(unit, spot.x, spot.y, dt)
      return
    }
    const def = this.buildingDef(building)
    building.progress = Math.min(1, building.progress + dt / def.buildTime)
    if (building.progress >= 1 && unit.owner === 0) this.sounds.push('complete')
    if (building.progress >= 1) {
      unit.orders.shift()
      if (this.buildingDef(building).mineShaft && building.mineId) {
        unit.lastGatherId = building.mineId
        unit.orders.push({ type: 'gather', nodeId: building.mineId })
      }
    }
  }

  private nearestDropoff(owner: 0 | 1, x: number, y: number): Building | null {
    const ready = this.buildings.filter((building) => building.owner === owner && building.progress >= 1)
    if (!ready.length) return null
    ready.sort((a, b) => {
      const prefer = Number(this.buildingDef(b).dropoff) - Number(this.buildingDef(a).dropoff)
      if (prefer) return prefer
      return this.distanceToBuilding(x, y, a) - this.distanceToBuilding(x, y, b)
    })
    return ready[0]
  }

  private moveToward(unit: Unit, x: number, y: number, dt: number): void {
    const def = this.unitDef(unit)
    if (def.flying && unit.plantedUntil <= this.time) {
      this.step(unit, x, y, dt, true)
      return
    }
    let goal = tileOf(x, y)
    if (this.blocked(goal.x, goal.y)) {
      const open = this.nearestOpen(goal.x, goal.y)
      if (open) goal = open
    }
    if (unit.goalTx !== goal.x || unit.goalTy !== goal.y || unit.path.length === 0) {
      if (this.time >= unit.repathAt) {
        let start = tileOf(unit.x, unit.y)
        if (this.blocked(start.x, start.y)) {
          const open = this.nearestOpen(start.x, start.y)
          if (open) start = open
        }
        const tiles = findPath((tx, ty) => this.blocked(tx, ty), start.x, start.y, goal.x, goal.y)
        unit.path = tiles.map((tile) => tileCenter(tile.x, tile.y))
        unit.goalTx = goal.x
        unit.goalTy = goal.y
        unit.repathAt = this.time + 0.45
      }
    }
    const waypoint = unit.path[0]
    if (!waypoint) {
      this.step(unit, x, y, dt, false)
      return
    }
    if (Math.hypot(unit.x - waypoint.x, unit.y - waypoint.y) < 8) unit.path.shift()
    const next = unit.path[0] ?? { x, y }
    this.step(unit, next.x, next.y, dt, false)
  }

  private step(unit: Unit, x: number, y: number, dt: number, flying: boolean): void {
    const dx = x - unit.x
    const dy = y - unit.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.5) return
    const speed = this.unitDef(unit).speed * (unit.hasteUntil > this.time ? 1.45 : 1)
    const mag = Math.min(dist, speed * dt)
    const nx = unit.x + (dx / dist) * mag
    const ny = unit.y + (dy / dist) * mag
    unit.facing = Math.atan2(dy, dx)
    if (!flying && this.pointBlocked(nx, ny)) {
      if (!this.pointBlocked(nx, unit.y)) unit.x = nx
      else if (!this.pointBlocked(unit.x, ny)) unit.y = ny
      else {
        unit.path = []
        unit.goalTx = -1
      }
    } else {
      unit.x = nx
      unit.y = ny
    }
    unit.x = Math.max(10, Math.min(MAP_W - 10, unit.x))
    unit.y = Math.max(10, Math.min(MAP_H - 10, unit.y))
  }

  private separate(): void {
    for (let i = 0; i < this.units.length; i += 1) {
      for (let j = i + 1; j < this.units.length; j += 1) {
        const a = this.units[i]
        const b = this.units[j]
        if (a.plantedUntil > this.time || b.plantedUntil > this.time) continue
        if (this.isFlying(a) !== this.isFlying(b)) continue
        const min = this.unitDef(a).radius + this.unitDef(b).radius
        let dx = b.x - a.x
        let dy = b.y - a.y
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
          const angle = (i * 7 + j * 13) % 360 * (Math.PI / 180)
          dx = Math.cos(angle) * 0.5
          dy = Math.sin(angle) * 0.5
        }
        const dist = Math.hypot(dx, dy)
        if (dist >= min) continue
        const push = (min - dist) / 2
        const ox = (dx / dist) * push
        const oy = (dy / dist) * push
        if (this.isFlying(a) || !this.pointBlocked(a.x - ox, a.y - oy)) {
          a.x -= ox
          a.y -= oy
        }
        if (this.isFlying(b) || !this.pointBlocked(b.x + ox, b.y + oy)) {
          b.x += ox
          b.y += oy
        }
      }
    }
  }

  private findTarget(unit: Unit, radius: number): { kind: 'unit'; unit: Unit } | { kind: 'building'; building: Building } | null {
    let bestUnit: Unit | null = null
    let bestD = radius
    for (const other of this.units) {
      if (other.owner === unit.owner || other.hp <= 0) continue
      if (!this.canAttack(unit, { kind: 'unit', unit: other })) continue
      const dist = Math.hypot(other.x - unit.x, other.y - unit.y)
      if (dist < bestD) {
        bestD = dist
        bestUnit = other
      }
    }
    if (bestUnit) return { kind: 'unit', unit: bestUnit }
    let bestBuilding: Building | null = null
    bestD = radius
    for (const building of this.buildings) {
      if (building.owner === unit.owner || building.hp <= 0) continue
      const dist = this.distanceToBuilding(unit.x, unit.y, building)
      if (dist < bestD) {
        bestD = dist
        bestBuilding = building
      }
    }
    return bestBuilding ? { kind: 'building', building: bestBuilding } : null
  }

  private canAttack(attacker: Unit, target: { kind: 'unit'; unit: Unit } | { kind: 'building'; building: Building }): boolean {
    if (target.kind === 'building') return target.building.hp > 0
    if (target.unit.hp <= 0) return false
    if (!this.isVisibleTo(target.unit, attacker.owner)) return false
    if (this.isFlying(target.unit) && !this.unitDef(attacker).canHitAir) return false
    return true
  }

  private targetById(id: string): { kind: 'unit'; unit: Unit } | { kind: 'building'; building: Building } | null {
    const unit = this.units.find((entry) => entry.id === id)
    if (unit && unit.hp > 0) return { kind: 'unit', unit }
    const building = this.buildings.find((entry) => entry.id === id)
    if (building && building.hp > 0) return { kind: 'building', building }
    return null
  }

  private targetPoint(target: { kind: 'unit'; unit: Unit } | { kind: 'building'; building: Building }): { x: number; y: number } {
    return target.kind === 'unit' ? { x: target.unit.x, y: target.unit.y } : this.centerOf(target.building)
  }

  private approachBuilding(building: Building, fromX: number, fromY: number): { x: number; y: number } {
    const def = this.buildingDef(building)
    return this.approachRect(building.tileX, building.tileY, def.tilesW, def.tilesH, fromX, fromY)
  }

  private approachRect(tileX: number, tileY: number, tilesW: number, tilesH: number, fromX: number, fromY: number): { x: number; y: number } {
    let best = { x: fromX, y: fromY }
    let bestD = 1e9
    for (let y = tileY - 1; y <= tileY + tilesH; y += 1) {
      for (let x = tileX - 1; x <= tileX + tilesW; x += 1) {
        const inside = x >= tileX && x < tileX + tilesW && y >= tileY && y < tileY + tilesH
        if (inside || this.blocked(x, y)) continue
        const center = tileCenter(x, y)
        const dist = Math.hypot(center.x - fromX, center.y - fromY)
        if (dist < bestD) {
          bestD = dist
          best = center
        }
      }
    }
    return best
  }

  private withSpread(order: Order, index: number): Order {
    if (order.type !== 'move' && order.type !== 'attackMove' && order.type !== 'patrol') return order
    const col = (index % 5) - 2
    const row = Math.floor(index / 5)
    const next = { ...order, x: order.x + col * 22, y: order.y + row * 22 }
    return next
  }

  private cargo(unit: Unit): number {
    return unit.carryWood + unit.carryGold + unit.carryIron
  }

  setRally(buildingIds: string[], x: number, y: number): void {
    if (this.puppet) this.outbox.push({ op: 'rally', buildingIds, x, y })
    for (const id of buildingIds) {
      const building = this.buildings.find((entry) => entry.id === id && entry.owner === this.me)
      if (building) {
        building.rallyX = x
        building.rallyY = y
      }
    }
  }

  takeOutbox(): NetOp[] {
    const ops = this.outbox
    this.outbox = []
    return ops
  }

  snapshot(): Snapshot {
    return {
      time: this.time,
      nextId: this.nextId,
      winner: this.winner,
      players: structuredClone(this.players),
      units: structuredClone(this.units),
      buildings: structuredClone(this.buildings),
      nodes: structuredClone(this.nodes),
      fx: structuredClone(this.fx),
      toasts: structuredClone(this.toasts),
      sounds: [...this.sounds],
    }
  }

  applySnapshot(snap: Snapshot): void {
    this.time = snap.time
    this.nextId = snap.nextId
    this.winner = snap.winner
    this.ended = snap.winner === null ? null : snap.winner === this.me ? 'win' : 'lose'
    this.players[0] = snap.players[0]
    this.players[1] = snap.players[1]
    this.units.length = 0
    this.units.push(...snap.units)
    for (const unit of this.units) {
      if (unit.lastGatherId === undefined) unit.lastGatherId = null
    }
    this.buildings.length = 0
    this.buildings.push(...snap.buildings)
    this.nodes.length = 0
    this.nodes.push(...snap.nodes)
    this.fx.length = 0
    this.fx.push(...snap.fx)
    this.toasts.length = 0
    this.toasts.push(...snap.toasts)
    this.sounds.push(...snap.sounds)
    this.refreshFog()
  }

  applyRemote(op: NetOp, owner: 0 | 1): void {
    const mine = (ids: string[]) => this.units.filter((unit) => ids.includes(unit.id) && unit.owner === owner)
    if (op.op === 'command') this.command(mine(op.unitIds), op.order, op.queue)
    else if (op.op === 'stop') this.stopUnits(mine(op.unitIds))
    else if (op.op === 'hold') this.holdUnits(mine(op.unitIds))
    else if (op.op === 'train' || op.op === 'cancelTrain' || op.op === 'upgrade') {
      const building = this.buildings.find((entry) => entry.id === op.buildingId && entry.owner === owner)
      if (!building) return
      if (op.op === 'train') this.train(op.buildingId, op.unitId)
      else if (op.op === 'cancelTrain') this.cancelTrain(op.buildingId)
      else this.upgrade(op.buildingId)
    }
    else if (op.op === 'place') {
      const workers = mine(op.workerIds)
      this.placeBuilding(owner, op.defId, op.tileX, op.tileY, workers[0] ?? null, op.queue, workers.slice(1))
    } else if (op.op === 'rally') {
      for (const id of op.buildingIds) {
        const building = this.buildings.find((entry) => entry.id === id && entry.owner === owner)
        if (building) {
          building.rallyX = op.x
          building.rallyY = op.y
        }
      }
    }
  }

  private checkEnd(): void {
    if (this.winner !== null) return
    const alive = (owner: 0 | 1) => this.buildings.some((building) => building.owner === owner)
    if (!alive(1)) this.winner = 0
    else if (!alive(0)) this.winner = 1
    else return
    this.ended = this.winner === this.me ? 'win' : 'lose'
    this.sounds.push(this.ended === 'win' ? 'win' : 'lose')
  }

  private decayFx(dt: number): void {
    for (const effect of this.fx) effect.life -= dt
    for (let i = this.fx.length - 1; i >= 0; i -= 1) if (this.fx[i].life <= 0) this.fx.splice(i, 1)
    if (this.sounds.length > 8) this.sounds.splice(0, this.sounds.length - 8)
  }

  private forestAt(x: number, y: number): boolean {
    return this.nodes.some((node) => node.kind === 'forest' && node.wood > 0 && x >= node.tileX && x < node.tileX + node.tilesW && y >= node.tileY && y < node.tileY + node.tilesH)
  }

  private buildingAtTile(x: number, y: number): boolean {
    return this.buildings.some((building) => {
      const def = this.buildingDef(building)
      return x >= building.tileX && x < building.tileX + def.tilesW && y >= building.tileY && y < building.tileY + def.tilesH
    })
  }

  private covers(tileX: number, tileY: number, def: BuildingDef, node: ResourceNode): boolean {
    return node.tileX >= tileX && node.tileX < tileX + def.tilesW && node.tileY >= tileY && node.tileY < tileY + def.tilesH
  }

  private gridIsDirty = true

  private gridDirty(): void {
    this.gridIsDirty = true
  }

  private ensureGrid(): void {
    if (!this.gridIsDirty) return
    this.grid.fill(0)
    const mark = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) this.grid[y * COLS + x] = 1
    }
    for (const node of this.nodes) {
      if (node.kind !== 'forest' || node.wood <= 0) continue
      for (let y = node.tileY; y < node.tileY + node.tilesH; y += 1) {
        for (let x = node.tileX; x < node.tileX + node.tilesW; x += 1) mark(x, y)
      }
    }
    for (const building of this.buildings) {
      const def = this.buildingDef(building)
      for (let y = building.tileY; y < building.tileY + def.tilesH; y += 1) {
        for (let x = building.tileX; x < building.tileX + def.tilesW; x += 1) mark(x, y)
      }
    }
    this.gridIsDirty = false
  }

  private blocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true
    return this.grid[y * COLS + x] === 1
  }

  private pointBlocked(x: number, y: number): boolean {
    const tile = tileOf(x, y)
    return this.blocked(tile.x, tile.y)
  }

  private nearestOpen(tx: number, ty: number): { x: number; y: number } | null {
    for (let radius = 1; radius < 8; radius += 1) {
      for (let y = ty - radius; y <= ty + radius; y += 1) {
        for (let x = tx - radius; x <= tx + radius; x += 1) {
          if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== radius) continue
          if (!this.blocked(x, y)) return { x, y }
        }
      }
    }
    return null
  }

  private nid(prefix: string): string {
    this.nextId += 1
    return `${prefix}${this.nextId}`
  }
}
