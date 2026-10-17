import { canAfford, costLabel, getBuildingDef, getRace, getUnitDef } from '../data/races'
import type { Controls, UiState } from '../input/Controls'
import { COLS, MAP_H, MAP_W, ROWS, TILE } from '../systems/pathfinding'
import type { World } from '../systems/world'

export class Hud {
  private controls: Controls | null = null
  private signature = ''
  private readonly root: HTMLElement
  private readonly minimap: HTMLCanvasElement
  private readonly info: HTMLElement
  private readonly commands: HTMLElement
  private readonly resources: HTMLElement
  private readonly toast: HTMLElement
  private readonly armed: HTMLElement
  private readonly overlay: HTMLElement
  onMenu: () => void = () => undefined
  onRematch: () => void = () => undefined

  constructor(root: HTMLElement) {
    this.root = root
    root.innerHTML = `
      <div id="topbar">
        <div id="resources"></div>
        <div class="race-line" id="race-line"></div>
      </div>
      <div id="toast" class="toast" hidden></div>
      <div id="armed" class="armed" hidden></div>
      <div id="bottom">
        <canvas id="minimap" width="220" height="146"></canvas>
        <div id="info"></div>
        <div id="commands"></div>
      </div>
      <div id="overlay" class="hidden"></div>
    `
    this.minimap = root.querySelector('#minimap') as HTMLCanvasElement
    this.info = root.querySelector('#info') as HTMLElement
    this.commands = root.querySelector('#commands') as HTMLElement
    this.resources = root.querySelector('#resources') as HTMLElement
    this.toast = root.querySelector('#toast') as HTMLElement
    this.armed = root.querySelector('#armed') as HTMLElement
    this.overlay = root.querySelector('#overlay') as HTMLElement
    this.commands.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      if (!button || !this.controls || button.disabled) return
      button.blur()
      const action = button.dataset.action || ''
      if (action === 'stop') this.controls.stop()
      else if (action === 'hold') this.controls.hold()
      else if (action === 'attack') this.controls.arm('attack')
      else if (action === 'move') this.controls.arm('move')
      else if (action === 'patrol') this.controls.arm('patrol')
      else if (action === 'build') this.controls.openBuild()
      else if (action === 'gather-wood') this.controls.gatherKind('forest')
      else if (action === 'gather-mine') this.controls.gatherKind('mine')
      else if (action === 'back') this.controls.closeBuild()
      else if (action === 'upgrade') this.controls.upgrade()
      else if (action.startsWith('train:')) this.controls.train(action.slice(6))
      else if (action.startsWith('place:')) this.controls.startPlace(action.slice(6))
      else if (action === 'cancel') this.controls.cancel()
    })
    this.minimap.addEventListener('pointerdown', (event) => {
      if (!this.controls) return
      const rect = this.minimap.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * MAP_W
      const y = ((event.clientY - rect.top) / rect.height) * MAP_H
      this.controls.minimap(x, y, event.button === 2, event.shiftKey)
      event.preventDefault()
    })
    this.minimap.addEventListener('contextmenu', (event) => event.preventDefault())
    this.overlay.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      if (!button) return
      if (button.dataset.action === 'menu') this.onMenu()
      if (button.dataset.action === 'rematch') this.onRematch()
    })
  }

  bind(controls: Controls): void {
    this.controls = controls
    this.signature = ''
  }

  show(): void {
    this.root.classList.remove('hidden')
  }

  hide(): void {
    this.root.classList.add('hidden')
    this.overlay.classList.add('hidden')
    this.signature = ''
  }

  refresh(world: World, ui: UiState, view: { x: number; y: number; width: number; height: number }): void {
    const me = world.me
    const foe: 0 | 1 = me === 0 ? 1 : 0
    const player = world.players[me]
    const enemy = getRace(world.raceOf(foe))
    const you = getRace(world.raceOf(me))
    const supply = `${world.supplyUsed(me) + world.pendingSupply(me)}/${world.supplyMax(me)}`
    this.resources.innerHTML = `
      <span class="res wood">Wood ${player.wood}</span>
      <span class="res gold">Gold ${player.gold}</span>
      <span class="res iron">Iron ${player.iron}</span>
      <span class="res pop">Units ${supply}</span>
    `
    const raceLine = this.root.querySelector('#race-line')
    if (raceLine) raceLine.textContent = world.vsHuman ? `${you.name} vs ${enemy.name} · online` : `${you.name} vs ${enemy.name} · ${world.difficulty}`
    const toast = world.toasts[world.toasts.length - 1]
    if (toast) {
      this.toast.hidden = false
      this.toast.textContent = toast.text
    } else this.toast.hidden = true
    if (ui.placing) {
      this.armed.hidden = false
      this.armed.textContent = `Placing ${getBuildingDef(you.id, ui.placing).name}. Left-click to build, right-click to cancel.`
    } else if (ui.armed) {
      this.armed.hidden = false
      this.armed.textContent = ui.armed === 'attack' ? 'Attack move: left-click a target or the ground.' : ui.armed === 'patrol' ? 'Patrol: left-click the far point.' : 'Move: left-click the ground.'
    } else if (ui.buildMenu) {
      this.armed.hidden = false
      this.armed.textContent = 'Build menu. Press a letter or click a building.'
    } else this.armed.hidden = true

    const workers = world.units.filter((unit) => unit.owner === me && ui.selection.includes(unit.id) && world.unitDef(unit).role === 'worker')
    const sig = `${ui.selection.join(',')}|${ui.buildMenu}|${ui.placing}|${ui.armed}|${player.wood}|${player.gold}|${player.iron}|${supply}|${world.ended}|${world.hasMineToResume(me, workers)}`
    if (sig !== this.signature) {
      this.signature = sig
      this.renderInfo(world, ui)
      this.renderCommands(world, ui)
    }
    this.drawMinimap(world, view)
    this.renderEnd(world)
  }

  private renderEnd(world: World): void {
    if (!world.ended) {
      this.overlay.classList.add('hidden')
      this.overlay.innerHTML = ''
      delete this.overlay.dataset.ended
      return
    }
    if (this.overlay.dataset.ended === world.ended) return
    this.overlay.dataset.ended = world.ended
    this.overlay.classList.remove('hidden')
    const title = world.ended === 'win' ? 'Victory' : 'Defeat'
    const text = world.ended === 'win' ? 'Every enemy building has fallen.' : 'All of your buildings have been destroyed.'
    this.overlay.innerHTML = `<div class="card"><h2>${title}</h2><p>${text}</p><button data-action="rematch" type="button">Play again</button><button data-action="menu" type="button">Change race</button></div>`
  }

  private renderInfo(world: World, ui: UiState): void {
    const units = world.units.filter((unit) => ui.selection.includes(unit.id))
    const buildings = world.buildings.filter((building) => ui.selection.includes(building.id))
    if (units.length === 1 && buildings.length === 0) {
      const unit = units[0]
      const def = world.unitDef(unit)
      const carry = [unit.carryWood ? `${unit.carryWood} wood` : '', unit.carryGold ? `${unit.carryGold} gold` : '', unit.carryIron ? `${unit.carryIron} iron` : ''].filter(Boolean).join(', ')
      this.info.innerHTML = `<h2>${def.name}</h2><p>${def.blurb}</p><div class="meta">${Math.ceil(unit.hp)} / ${def.hp} hp · ${def.weapon}${carry ? ` · Carrying ${carry}` : ''}</div>`
      return
    }
    if (units.length > 1) {
      const counts = new Map<string, number>()
      for (const unit of units) counts.set(world.unitDef(unit).name, (counts.get(world.unitDef(unit).name) || 0) + 1)
      const text = [...counts.entries()].map(([name, count]) => `${count} ${name}`).join(', ')
      this.info.innerHTML = `<h2>${units.length} units</h2><p>${text}</p>`
      return
    }
    if (buildings.length === 1) {
      const building = buildings[0]
      const def = world.buildingDef(building)
      const queue = building.queue.map((id) => getUnitDef(world.raceOf(building.owner), id).name).join(', ')
      const state = building.progress < 1 ? `Under construction ${Math.floor(building.progress * 100)}%` : `${Math.ceil(building.hp)} / ${def.hp} hp`
      this.info.innerHTML = `<h2>${def.name}</h2><p>${def.blurb}</p><div class="meta">${state}${queue ? ` · Training ${queue}` : ''}</div>`
      return
    }
    if (ui.focusNode) {
      const node = world.nodes.find((entry) => entry.id === ui.focusNode)
      if (node) {
        const text = node.kind === 'forest' ? `${node.wood} wood left` : `${node.ore} ore left. A Mine Shaft is required before you can mine.`
        this.info.innerHTML = `<h2>${node.kind === 'forest' ? 'Forest' : 'Mining spot'}</h2><p>${text}</p>`
        return
      }
    }
        this.info.innerHTML = `<h2>Realm Wars</h2><p>Workers start chopping wood. Select them, then click a forest or press G. Press I or click a mining spot to sink a Mine Shaft (50 wood).</p><div class="meta">A attack-move · B build · G wood · I mine · S stop · H hold · Ctrl+1-9 groups</div>`
  }

  private renderCommands(world: World, ui: UiState): void {
    const you = getRace(world.raceOf(world.me))
    const units = world.units.filter((unit) => unit.owner === world.me && ui.selection.includes(unit.id))
    const building = world.buildings.find((entry) => ui.selection.length === 1 && entry.id === ui.selection[0] && entry.owner === world.me)
    const buttons: string[] = []
    this.commands.dataset.building = building?.id || ''
    if (ui.buildMenu || ui.placing) {
      for (const def of you.buildings) {
        if (!def.buildable) continue
        buttons.push(this.button(`place:${def.id}`, def.hotkey, def.name, costLabel(def.cost), canAfford(world.players[world.me], def.cost)))
      }
      buttons.push(this.button('back', 'Esc', 'Back', '', true))
    } else if (building && units.length === 0) {
      const def = world.buildingDef(building)
      for (const unitId of def.trains) {
        const unit = getUnitDef(you.id, unitId)
        const room = world.supplyUsed(world.me) + world.pendingSupply(world.me) + unit.supply <= world.supplyMax(world.me)
        buttons.push(this.button(`train:${unit.id}`, unit.hotkey, unit.name, costLabel(unit.cost), building.progress >= 1 && room && canAfford(world.players[world.me], unit.cost)))
      }
      if (def.upgradeTo && def.upgradeCost && def.upgradeHotkey) {
        const next = getBuildingDef(you.id, def.upgradeTo)
        buttons.push(this.button('upgrade', def.upgradeHotkey, `Become ${next.name}`, costLabel(def.upgradeCost), canAfford(world.players[world.me], def.upgradeCost)))
      }
      if (building.queue.length) buttons.push(this.button('cancel', 'X', 'Cancel', 'Refund last', true))
    } else if (units.length) {
      buttons.push(this.button('move', 'M', 'Move', '', true))
      buttons.push(this.button('stop', 'S', 'Stop', '', true))
      buttons.push(this.button('hold', 'H', 'Hold', '', true))
      buttons.push(this.button('attack', 'A', 'Attack', '', true))
      buttons.push(this.button('patrol', 'P', 'Patrol', '', true))
      if (units.some((unit) => world.unitDef(unit).role === 'worker')) {
        const workers = units.filter((unit) => world.unitDef(unit).role === 'worker')
        const resumeMine = world.hasMineToResume(world.me, workers)
        buttons.push(this.button('gather-wood', 'G', 'Gather Wood', 'Nearest forest', true))
        buttons.push(this.button('gather-mine', 'I', resumeMine ? 'Resume Mine' : 'Mine', resumeMine ? 'Back to the last shaft' : 'Needs 50 wood', resumeMine || canAfford(world.players[world.me], { wood: 50, gold: 0, iron: 0 })))
        buttons.push(this.button('build', 'B', 'Build', '', true))
      }
    }
    this.commands.innerHTML = buttons.join('')
  }

  private button(action: string, key: string, name: string, detail: string, enabled: boolean): string {
    return `<button type="button" data-action="${action}" ${enabled ? '' : 'disabled'}><b><span class="key">${key}</span> ${name}</b>${detail}</button>`
  }

  private drawMinimap(world: World, view: { x: number; y: number; width: number; height: number }): void {
    const ctx = this.minimap.getContext('2d')
    if (!ctx) return
    const w = this.minimap.width
    const h = this.minimap.height
    const sx = w / MAP_W
    const sy = h / MAP_H
    ctx.fillStyle = '#05070a'
    ctx.fillRect(0, 0, w, h)
    const tw = TILE * sx
    const th = TILE * sy
    const me = world.me
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!world.tileExplored(me, x, y)) continue
        ctx.fillStyle = world.tileSight(me, x, y) ? '#245c30' : '#152418'
        ctx.fillRect(x * tw, y * th, tw + 0.4, th + 0.4)
      }
    }
    ctx.fillStyle = '#1b4a28'
    for (const node of world.nodes) {
      if (node.kind !== 'forest' || node.wood <= 0) continue
      if (!world.tileExplored(me, node.tileX, node.tileY)) continue
      ctx.fillRect(node.tileX * TILE * sx, node.tileY * TILE * sy, node.tilesW * TILE * sx, node.tilesH * TILE * sy)
    }
    ctx.fillStyle = '#e6c15a'
    for (const node of world.nodes) {
      if (node.kind !== 'mine') continue
      if (!world.tileExplored(me, node.tileX, node.tileY)) continue
      ctx.fillRect(node.tileX * TILE * sx - 2, node.tileY * TILE * sy - 2, 5, 5)
    }
    for (const building of world.buildings) {
      if (!world.isBuildingRevealed(building, me)) continue
      const def = world.buildingDef(building)
      ctx.fillStyle = building.owner === me ? '#3d7ec9' : '#c4473a'
      ctx.fillRect(building.tileX * TILE * sx, building.tileY * TILE * sy, Math.max(3, def.tilesW * TILE * sx), Math.max(3, def.tilesH * TILE * sy))
    }
    for (const unit of world.units) {
      if (!world.isVisibleTo(unit, world.me)) continue
      ctx.fillStyle = unit.owner === world.me ? '#d7e6ff' : '#ffd0c8'
      ctx.fillRect(unit.x * sx, unit.y * sy, 2, 2)
    }
    ctx.strokeStyle = '#ffe7a3'
    ctx.strokeRect(view.x * sx, view.y * sy, view.width * sx, view.height * sy)
  }
}
