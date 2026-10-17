import Phaser from 'phaser'
import type { Difficulty, RaceId } from '../data/races'
import { Sounds } from '../audio/sounds'
import { Controls, UiState } from '../input/Controls'
import { MAP_H, MAP_W, TILE } from '../systems/pathfinding'
import { World } from '../systems/world'
import type { Lobby } from '../net/lobby'
import type { StartMatch } from '../net/protocol'
import { Scene3D } from '../render/Scene3D'
import type { Hud } from '../ui/hud'

export interface StartData {
  race: RaceId
  difficulty: Difficulty
  online?: StartMatch
}

export class GameScene extends Phaser.Scene {
  private world: World | null = null
  private controls: Controls | null = null
  private readonly ui = new UiState()
  private readonly sounds = new Sounds()
  private view3d: Scene3D | null = null
  private hud: Hud | null = null
  private lobby: Lobby | null = null
  private online: StartMatch | null = null
  private snapAcc = 0

  constructor() {
    super('game')
  }

  pickWorld(screenX: number, screenY: number): { x: number; y: number } | null {
    return this.view3d?.pick(screenX, screenY) ?? null
  }

  create(): void {
    const start = this.registry.get('start') as StartData | undefined
    if (!start) return
    this.online = start.online ?? null
    this.lobby = (this.registry.get('lobby') as Lobby | undefined) ?? null
    this.snapAcc = 0
    this.world = new World(start.race, start.difficulty, start.online
      ? {
        me: start.online.role === 'host' ? 0 : 1,
        vsHuman: true,
        puppet: start.online.role === 'guest',
        hostRace: start.online.hostRace,
        guestRace: start.online.guestRace,
      }
      : {})
    if (this.lobby && start.online) {
      this.lobby.onSnap = (state) => this.world?.applySnapshot(state)
      this.lobby.onInput = (op) => this.world?.applyRemote(op, 1)
    }
    this.ui.selection = []
    this.ui.armed = null
    this.ui.buildMenu = false
    this.ui.placing = null
    this.ui.focusNode = null
    const parent = this.game.canvas.parentElement
    if (parent) this.view3d = new Scene3D(parent)
    this.game.canvas.classList.add('input-layer')
    this.controls = new Controls(this, this.world, this.ui, this.sounds)
    this.controls.attach()
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H)
    this.cameras.main.setZoom(1)
    const base = this.world.buildings.find((building) => building.owner === this.world!.me && this.world!.buildingDef(building).dropoff)
    if (base) {
      const center = this.world.centerOf(base)
      this.cameras.main.centerOn(center.x, center.y)
    }
    if (!base && this.world.me === 1) this.cameras.main.centerOn(62 * TILE + 48, 21 * TILE + 48)
    this.hud = this.registry.get('hud') as Hud
    this.hud.bind(this.controls)
    ;(window as unknown as { __realm?: World }).__realm = this.world
    this.world.toast(this.online
      ? `Online match: ${this.online.name}. Workers are chopping. You are ${this.world.me === 0 ? 'blue' : 'red'}.`
      : 'Workers are already chopping. Select them and press G for wood, or I to start a mine.')
    if (this.online?.role === 'host') this.lobby?.sendSnap(this.world.snapshot())
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[], dx: number, dy: number) => {
      const next = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.65, 1.45)
      this.cameras.main.setZoom(next)
      void pointer
      void over
      void dx
    })
    this.scale.on('resize', this.onResize, this)
    this.onResize()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this)
      if (this.lobby) {
        this.lobby.onSnap = () => undefined
        this.lobby.onInput = () => undefined
      }
      this.controls?.destroy()
      this.controls = null
      this.view3d?.dispose()
      this.view3d = null
      this.world = null
      this.lobby = null
      this.online = null
    })
  }

  update(_time: number, delta: number): void {
    if (!this.world || !this.controls || !this.hud) return
    const dt = Math.min(0.05, delta / 1000)
    if (this.online?.role === 'guest') {
      for (const op of this.world.takeOutbox()) this.lobby?.sendInput(op)
    }
    this.world.update(dt)
    if (this.online?.role === 'host') {
      this.snapAcc += dt
      if (this.snapAcc >= 0.1) {
        this.snapAcc = 0
        this.lobby?.sendSnap(this.world.snapshot())
      }
    }
    this.controls.update(dt)
    while (this.world.sounds.length) {
      const name = this.world.sounds.shift()
      if (name) this.sounds.play(name)
    }
    const view = this.cameras.main.worldView
    const pointer = this.input.activePointer
    this.view3d?.sync(this.world, this.ui, { x: view.x, y: view.y, width: view.width, height: view.height }, { x: pointer.x, y: pointer.y })
    this.hud.refresh(this.world, this.ui, { x: view.x, y: view.y, width: view.width, height: view.height })
  }

  private onResize(): void {
    this.view3d?.resize(this.scale.width, this.scale.height)
  }
}
