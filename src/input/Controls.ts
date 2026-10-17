import Phaser from 'phaser'
import { canAfford, getBuildingDef, getRace, getUnitDef } from '../data/races'
import type { Sounds } from '../audio/sounds'
import { tileCenter, tileOf } from '../systems/pathfinding'
import type { World } from '../systems/world'

export class UiState {
  selection: string[] = []
  focusNode: string | null = null
  groups = new Map<number, string[]>()
  armed: 'attack' | 'move' | 'patrol' | null = null
  buildMenu = false
  placing: string | null = null
  drag = { active: false, x: 0, y: 0, sx: 0, sy: 0 }
  lastClickId = ''
  lastClickTime = 0
  lastGroup = -1
  lastGroupTime = 0
}

export class Controls {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys

  constructor(
    private scene: Phaser.Scene,
    private world: World,
    readonly ui: UiState,
    private sounds: Sounds,
  ) {}

  attach(): void {
    this.cursors = this.scene.input.keyboard?.createCursorKeys()
    this.scene.input.keyboard?.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE'])
    this.scene.input.mouse?.disableContextMenu()
    this.scene.input.on('pointerdown', this.onDown, this)
    this.scene.input.on('pointerup', this.onUp, this)
    this.scene.input.on('pointermove', this.onMove, this)
    this.scene.input.keyboard?.on('keydown', this.onKey, this)
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this)
    this.scene.input.off('pointerup', this.onUp, this)
    this.scene.input.off('pointermove', this.onMove, this)
    this.scene.input.keyboard?.off('keydown', this.onKey, this)
  }

  update(dt: number): void {
    const camera = this.scene.cameras.main
    const speed = 560 * dt
    let dx = 0
    let dy = 0
    if (this.cursors?.left.isDown) dx -= speed
    if (this.cursors?.right.isDown) dx += speed
    if (this.cursors?.up.isDown) dy -= speed
    if (this.cursors?.down.isDown) dy += speed
    const pointer = this.scene.input.activePointer
    const width = this.scene.scale.width
    const height = this.scene.scale.height
    const margin = 16
    const bottom = document.querySelector<HTMLElement>('#bottom')
    const playAreaBottom = bottom ? bottom.getBoundingClientRect().top : height - 176
    const isTouch = pointer.event instanceof PointerEvent && pointer.event.pointerType === 'touch'
    if (!isTouch && pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= playAreaBottom) {
      if (pointer.x < margin) dx -= speed
      else if (pointer.x > width - margin) dx += speed
      if (pointer.y < margin) dy -= speed
      else if (pointer.y > playAreaBottom - margin && pointer.y < playAreaBottom) dy += speed
    }
    if (dx || dy) {
      camera.scrollX += dx
      camera.scrollY += dy
    }
  }

  train(unitId: string): void {
    const building = this.onlyOwnBuilding()
    if (!building) return
    this.world.train(building.id, unitId)
  }

  upgrade(): void {
    const building = this.onlyOwnBuilding()
    if (building) this.world.upgrade(building.id)
  }

  cancel(): void {
    if (this.ui.placing) {
      this.ui.placing = null
      return
    }
    if (this.ui.armed) {
      this.ui.armed = null
      return
    }
    const building = this.onlyOwnBuilding()
    if (building) this.world.cancelTrain(building.id)
  }

  arm(mode: 'attack' | 'move' | 'patrol'): void {
    this.ui.armed = mode
    this.ui.placing = null
    this.ui.buildMenu = false
    this.sounds.play('command')
  }

  stop(): void {
    this.world.stopUnits(this.ownUnits())
    this.ui.armed = null
    this.sounds.play('command')
  }

  hold(): void {
    this.world.holdUnits(this.ownUnits())
    this.ui.armed = null
    this.sounds.play('command')
  }

  openBuild(): void {
    if (!this.ownUnits().some((unit) => this.world.unitDef(unit).role === 'worker')) {
      this.world.toast('Select a worker, then press B to build.')
      return
    }
    this.ui.buildMenu = true
    this.ui.placing = null
    this.ui.armed = null
  }

  closeBuild(): void {
    this.ui.buildMenu = false
    this.ui.placing = null
  }

  startPlace(defId: string): void {
    this.ui.placing = defId
    this.ui.armed = null
    this.sounds.play('command')
  }

  private get me(): 0 | 1 {
    return this.world.me
  }

  private get foe(): 0 | 1 {
    return this.world.me === 0 ? 1 : 0
  }

  centerOn(x: number, y: number): void {
    this.scene.cameras.main.centerOn(x, y)
  }

  cameraView(): { x: number; y: number; width: number; height: number } {
    const view = this.scene.cameras.main.worldView
    return { x: view.x, y: view.y, width: view.width, height: view.height }
  }

  onAgain: () => void = () => {}
  onMenu: () => void = () => {}

  sceneStartAgain(): void {
    this.onAgain()
  }

  sceneStartMenu(): void {
    this.onMenu()
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.sounds.resume()
    const shift = pointer.event.shiftKey
    const worldPoint = this.worldPoint(pointer.x, pointer.y)
    if (pointer.rightButtonDown() && !isTypeClick(pointer)) {
      if (this.ui.placing || this.ui.armed) {
        this.ui.placing = null
        this.ui.armed = null
        return
      }
      this.smart(worldPoint.x, worldPoint.y, shift)
      return
    }
    if (pointer.button !== 0) return
    if (this.ui.placing) {
      this.confirmPlace(worldPoint.x, worldPoint.y, shift)
      return
    }
    if (this.ui.armed) {
      this.armedClick(worldPoint.x, worldPoint.y, shift)
      return
    }
    this.ui.drag.active = true
    this.ui.drag.sx = pointer.x
    this.ui.drag.sy = pointer.y
    this.ui.drag.x = pointer.x
    this.ui.drag.y = pointer.y
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.ui.drag.active) return
    this.ui.drag.x = pointer.x
    this.ui.drag.y = pointer.y
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (!this.ui.drag.active || pointer.button !== 0) return
    const dragged = Math.hypot(pointer.x - this.ui.drag.sx, pointer.y - this.ui.drag.sy) > 6
    this.ui.drag.active = false
    if (dragged) this.boxSelect()
    else this.clickSelect(pointer)
  }

  private onKey(event: KeyboardEvent): void {
    if (event.repeat) return
    const key = event.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault()
    if (event.ctrlKey && !event.metaKey && event.key >= '1' && event.key <= '9') {
      const group = Number(event.key)
      this.ui.groups.set(group, this.ui.selection.filter((id) => this.alive(id)))
      this.world.toast(`Group ${group} saved.`)
      this.sounds.play('select')
      event.preventDefault()
      return
    }
    if (!event.ctrlKey && !event.metaKey && event.key >= '1' && event.key <= '9') {
      const group = Number(event.key)
      const ids = (this.ui.groups.get(group) ?? []).filter((id) => this.alive(id))
      this.ui.groups.set(group, ids)
      this.ui.selection = [...ids]
      this.ui.focusNode = null
      this.ui.buildMenu = false
      this.ui.placing = null
      const now = performance.now()
      if (this.ui.lastGroup === group && now - this.ui.lastGroupTime < 420) this.centerSelection()
      this.ui.lastGroup = group
      this.ui.lastGroupTime = now
      this.sounds.play('select')
      return
    }
    if (event.key === 'Escape') {
      if (this.ui.placing) this.ui.placing = null
      else if (this.ui.buildMenu) this.ui.buildMenu = false
      else if (this.ui.armed) this.ui.armed = null
      else this.ui.selection = []
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const building = this.onlyOwnBuilding()
    if (building && !this.ui.buildMenu && !this.ui.placing) {
      const def = this.world.buildingDef(building)
      if (def.upgradeHotkey && key === def.upgradeHotkey.toLowerCase()) {
        this.world.upgrade(building.id)
        return
      }
      if (key === 'x') {
        this.world.cancelTrain(building.id)
        return
      }
      for (const unitId of def.trains) {
        const unitDef = getUnitDef(this.world.raceOf(building.owner), unitId)
        if (unitDef.hotkey.toLowerCase() === key) {
          this.world.train(building.id, unitId)
          return
        }
      }
    }
    if (this.ui.buildMenu || this.ui.placing) {
      const race = getRace(this.world.raceOf(this.me))
      for (const def of race.buildings) {
        if (!def.buildable || !def.hotkey) continue
        if (def.hotkey.toLowerCase() === key) {
          this.startPlace(def.id)
          return
        }
      }
    }
    const own = this.ownUnits()
    if (!own.length) return
    if (key === 'a') this.arm('attack')
    else if (key === 'm') this.arm('move')
    else if (key === 'p') this.arm('patrol')
    else if (key === 's') this.stop()
    else if (key === 'h') this.hold()
    else if (key === 'b') this.openBuild()
    else if (key === 'g') this.gatherKind('forest')
    else if (key === 'i') this.gatherKind('mine')
  }

  gatherKind(kind: 'forest' | 'mine'): void {
    const workers = this.ownUnits().filter((unit) => this.world.unitDef(unit).role === 'worker')
    if (!workers.length) {
      this.world.toast('Select workers first, then click Gather Wood or Mine.')
      return
    }
    const x = workers.reduce((sum, unit) => sum + unit.x, 0) / workers.length
    const y = workers.reduce((sum, unit) => sum + unit.y, 0) / workers.length
    const node = this.world.preferredNode(kind, x, y, workers)
    if (!node) {
      this.world.toast(kind === 'forest' ? 'No forest wood left nearby.' : 'No mining spots left nearby.')
      return
    }
    if (kind === 'mine' && this.ensureMineShaft(node.id, workers, false)) return
    this.world.command(workers, { type: 'gather', nodeId: node.id }, false)
    this.sounds.play('command')
  }

  private clickSelect(pointer: Phaser.Input.Pointer): void {
    const point = this.worldPoint(pointer.x, pointer.y)
    const shift = pointer.event.shiftKey
    const unit = this.world.unitAt(point.x, point.y, this.me)
    if (unit) {
      if (isTypeClick(pointer) || this.isDouble(unit.id)) this.selectSameType(unit.defId)
      else if (shift) this.toggle(unit.id)
      else this.ui.selection = [unit.id]
      this.ui.focusNode = null
      this.ui.buildMenu = false
      this.sounds.play('select')
      return
    }
    const building = this.world.buildingAtPoint(point.x, point.y)
    if (building) {
      if (shift) this.toggle(building.id)
      else this.ui.selection = [building.id]
      this.ui.focusNode = null
      this.ui.buildMenu = false
      this.sounds.play('select')
      return
    }
    const node = this.world.nodeAt(point.x, point.y)
    const workers = this.ownUnits().filter((unit) => this.world.unitDef(unit).role === 'worker')
    if (node && workers.length) {
      this.smart(point.x, point.y, shift)
      return
    }
    if (!shift) {
      this.ui.selection = []
      this.ui.focusNode = node?.id ?? null
      this.ui.buildMenu = false
    }
  }

  private boxSelect(): void {
    const a = this.worldPoint(this.ui.drag.sx, this.ui.drag.sy)
    const b = this.worldPoint(this.ui.drag.x, this.ui.drag.y)
    const left = Math.min(a.x, b.x)
    const right = Math.max(a.x, b.x)
    const top = Math.min(a.y, b.y)
    const bottom = Math.max(a.y, b.y)
    const units = this.world.units.filter((unit) => unit.owner === this.me && this.world.isVisibleTo(unit, this.me) && this.world.unitOverlaps(unit, left, top, right, bottom))
    if (units.length) {
      this.ui.selection = units.map((unit) => unit.id)
      this.ui.focusNode = null
      this.sounds.play('select')
      return
    }
    const buildings = this.world.buildings.filter((building) => {
      if (building.owner !== this.me) return false
      const center = this.world.centerOf(building)
      return center.x >= left && center.x <= right && center.y >= top && center.y <= bottom
    })
    this.ui.selection = buildings.map((building) => building.id)
    this.ui.focusNode = null
    if (buildings.length) this.sounds.play('select')
  }

  private smart(x: number, y: number, queue: boolean): void {
    const own = this.ownUnits()
    const workers = own.filter((unit) => this.world.unitDef(unit).role === 'worker')
    const fighters = own.filter((unit) => this.world.unitDef(unit).role !== 'worker')
    const hitUnit = this.world.unitAt(x, y, this.me)
    if (hitUnit && hitUnit.owner === this.foe) {
      this.world.command(own, { type: 'attack', targetId: hitUnit.id }, queue)
      this.sounds.play('command')
      return
    }
    const hitBuilding = this.world.buildingAtPoint(x, y)
    if (hitBuilding && hitBuilding.owner === this.foe) {
      this.world.command(own, { type: 'attack', targetId: hitBuilding.id }, queue)
      this.sounds.play('command')
      return
    }
    if (hitBuilding && hitBuilding.owner === this.me && hitBuilding.progress < 1 && workers.length) {
      this.world.command(workers, { type: 'build', buildingId: hitBuilding.id }, queue)
      this.sounds.play('command')
      return
    }
    if (hitBuilding && hitBuilding.owner === this.me && this.world.buildingDef(hitBuilding).mineShaft && hitBuilding.mineId && workers.length) {
      this.world.command(workers, { type: 'gather', nodeId: hitBuilding.mineId }, queue)
      this.sounds.play('command')
      return
    }
    const node = this.world.nodeAt(x, y)
    if (node && workers.length && (node.kind === 'forest' || node.kind === 'mine')) {
      if (node.kind === 'mine' && this.ensureMineShaft(node.id, workers, queue)) {
        if (fighters.length) this.world.command(fighters, { type: 'move', x, y }, queue)
        return
      }
      this.world.command(workers, { type: 'gather', nodeId: node.id }, queue)
      if (fighters.length) this.world.command(fighters, { type: 'move', x, y }, queue)
      this.sounds.play('command')
      return
    }
    const ownBuildings = this.selectedBuildings().filter((building) => building.owner === this.me)
    if (!own.length && ownBuildings.length) {
      this.world.setRally(ownBuildings.map((building) => building.id), x, y)
      this.world.toast('Rally point set.')
      this.sounds.play('command')
      return
    }
    if (own.length) {
      this.world.command(own, { type: 'move', x, y }, queue)
      this.sounds.play('command')
    }
  }

  private armedClick(x: number, y: number, queue: boolean): void {
    const own = this.ownUnits()
    if (!own.length || !this.ui.armed) return
    if (this.ui.armed === 'attack') {
      const unit = this.world.unitAt(x, y, this.me)
      const building = this.world.buildingAtPoint(x, y)
      if (unit && unit.owner === this.foe) this.world.command(own, { type: 'attack', targetId: unit.id }, queue)
      else if (building && building.owner === this.foe) this.world.command(own, { type: 'attack', targetId: building.id }, queue)
      else this.world.command(own, { type: 'attackMove', x, y }, queue)
    } else if (this.ui.armed === 'move') this.world.command(own, { type: 'move', x, y }, queue)
    else this.world.command(own, { type: 'patrol', x, y, ox: 0, oy: 0, going: true }, queue)
    this.sounds.play('command')
    if (!queue) this.ui.armed = null
  }

  private ensureMineShaft(nodeId: string, workers: ReturnType<Controls['ownUnits']>, queue: boolean): boolean {
    const node = this.world.nodes.find((entry) => entry.id === nodeId)
    if (!node) return false
    const shaft = node.shaftId ? this.world.buildings.find((building) => building.id === node.shaftId) : undefined
    if (shaft && shaft.owner === this.me && shaft.progress >= 1) return false
    if (shaft && shaft.owner === this.me && shaft.progress < 1) {
      this.world.command(workers, { type: 'build', buildingId: shaft.id }, queue)
      this.world.toast('Workers will mine after the shaft is built.')
      this.sounds.play('command')
      return true
    }
    const def = getBuildingDef(this.world.raceOf(this.me), 'mine_shaft')
    if (!canAfford(this.world.players[this.me], def.cost)) {
      this.world.toast('Chop wood first. A Mine Shaft costs 50 wood.')
      this.sounds.play('error')
      return true
    }
    const snap = this.world.snapPlacement(this.me, def, node.tileX, node.tileY)
    if (!snap) {
      this.world.toast('Cannot fit a Mine Shaft on that spot.')
      this.sounds.play('error')
      return true
    }
    this.world.placeBuilding(this.me, def.id, snap.tx, snap.ty, workers[0], queue, workers.slice(1))
    const built = this.world.buildings.find((building) => building.mineId === node.id)
    if (built && workers.length > 1) this.world.command(workers.slice(1), { type: 'build', buildingId: built.id }, queue)
    this.world.toast('Building a Mine Shaft. Workers will mine when it is done.')
    this.sounds.play('command')
    return true
  }

  private confirmPlace(x: number, y: number, queue: boolean): void {
    if (!this.ui.placing) return
    const def = getBuildingDef(this.world.raceOf(this.me), this.ui.placing)
    const tile = tileOf(x, y)
    const snapped = this.world.snapPlacement(this.me, def, tile.x, tile.y)
    const workers = this.ownUnits().filter((unit) => this.world.unitDef(unit).role === 'worker')
    if (!workers.length) {
      this.world.toast('Select a worker to build.')
      this.sounds.play('error')
      return
    }
    if (!snapped) {
      this.world.toast(def.mineShaft ? 'Mine Shafts must be placed on an open mining spot.' : 'Cannot build there.')
      this.sounds.play('error')
      return
    }
    const spot = tileCenter(snapped.tx, snapped.ty)
    workers.sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y))
    const placed = this.world.placeBuilding(this.me, def.id, snapped.tx, snapped.ty, workers[0], queue, workers.slice(1))
    if (placed && !queue) {
      this.ui.placing = null
      this.ui.buildMenu = false
    }
    if (!placed) this.sounds.play('error')
  }

  minimap(x: number, y: number, right: boolean, shift: boolean): void {
    if (right) {
      if (this.ui.armed || this.ui.placing) {
        this.ui.armed = null
        this.ui.placing = null
        return
      }
      this.smart(x, y, shift)
    } else if (this.ui.armed) this.armedClick(x, y, shift)
    else this.centerOn(x, y)
  }

  private worldPoint(x: number, y: number): { x: number; y: number } {
    const scene = this.scene as Phaser.Scene & { pickWorld?: (sx: number, sy: number) => { x: number; y: number } | null }
    return scene.pickWorld?.(x, y) ?? this.scene.cameras.main.getWorldPoint(x, y)
  }

  private ownUnits() {
    return this.world.units.filter((unit) => unit.owner === this.me && this.ui.selection.includes(unit.id))
  }

  private selectedBuildings() {
    return this.world.buildings.filter((building) => this.ui.selection.includes(building.id))
  }

  private onlyOwnBuilding() {
    const buildings = this.selectedBuildings()
    if (buildings.length !== 1 || buildings[0].owner !== this.me) return null
    if (this.ownUnits().length) return null
    return buildings[0]
  }

  private alive(id: string): boolean {
    return this.world.units.some((unit) => unit.id === id) || this.world.buildings.some((building) => building.id === id)
  }

  private toggle(id: string): void {
    if (this.ui.selection.includes(id)) this.ui.selection = this.ui.selection.filter((entry) => entry !== id)
    else this.ui.selection = [...this.ui.selection, id]
  }

  private isDouble(id: string): boolean {
    const now = performance.now()
    const hit = this.ui.lastClickId === id && now - this.ui.lastClickTime < 320
    this.ui.lastClickId = id
    this.ui.lastClickTime = now
    return hit
  }

  private selectSameType(defId: string): void {
    const view = this.scene.cameras.main.worldView
    this.ui.selection = this.world.units
      .filter((unit) => unit.owner === this.me && unit.defId === defId && view.contains(unit.x, unit.y))
      .map((unit) => unit.id)
  }

  private centerSelection(): void {
    const units = this.ownUnits()
    const buildings = this.selectedBuildings()
    const points = [
      ...units.map((unit) => ({ x: unit.x, y: unit.y })),
      ...buildings.map((building) => this.world.centerOf(building)),
    ]
    if (!points.length) return
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
    this.centerOn(x, y)
  }
}

// Phaser reports Ctrl+left-click as a right click on macOS, but Ctrl/Cmd+click means "select this type".
function isTypeClick(pointer: Phaser.Input.Pointer): boolean {
  const event = pointer.event as MouseEvent
  return event.button === 0 && (event.ctrlKey || event.metaKey)
}
