import { canAfford, getBuildingDef, getRace, getUnitDef } from '../data/races'
import type { Unit } from '../entities/Unit'
import type { World } from '../systems/world'

export class EnemyAI {
  private think = 0
  private attack = 0
  private wavesSent = 0
  private readonly firstWaveAt: number
  private readonly thinkEvery: number
  private readonly attackEvery: number
  private readonly workerTarget: number
  private readonly waveSize: number

  constructor(private readonly world: World) {
    if (world.difficulty === 'easy') {
      this.firstWaveAt = 300
      this.thinkEvery = 2.4
      this.attackEvery = 48
      this.workerTarget = 4
      this.waveSize = 5
    } else if (world.difficulty === 'hard') {
      this.firstWaveAt = 120
      this.thinkEvery = 0.55
      this.attackEvery = 16
      this.workerTarget = 8
      this.waveSize = 2
    } else {
      this.firstWaveAt = 200
      this.thinkEvery = 1.15
      this.attackEvery = 30
      this.workerTarget = 6
      this.waveSize = 3
    }
  }

  update(dt: number): void {
    this.think += dt
    this.attack += dt
    if (this.think >= this.thinkEvery) {
      this.think = 0
      this.economy()
      this.build()
      this.train()
    }
    if (this.world.time >= this.firstWaveAt && this.attack >= this.attackEvery) {
      this.attack = 0
      this.sendWave()
    }
  }

  private economy(): void {
    const site = this.world.buildings.find((building) => building.owner === 1 && building.progress < 1)
    if (site) {
      const busy = this.world.units.some((unit) => unit.owner === 1 && unit.orders.some((order) => order.type === 'build' && order.buildingId === site.id))
      if (!busy) {
        const builder = this.nearestWorker(site.tileX, site.tileY)
        if (builder) this.world.command([builder], { type: 'build', buildingId: site.id }, false)
      }
    }
    const workers = this.workers()
    workers.forEach((worker, index) => {
      if (worker.orders.length || worker.holding) return
      const mine = this.openShaft()
      const base = this.base()
      if (mine && (this.world.players[1].wood > 120 || index % 2 === 1)) {
        this.world.command([worker], { type: 'gather', nodeId: mine }, false)
        return
      }
      const forest = this.nearestForest(base ? base.tileX : 62, base ? base.tileY : 21)
      if (forest) this.world.command([worker], { type: 'gather', nodeId: forest }, false)
    })
  }

  private build(): void {
    if (this.world.buildings.some((building) => building.owner === 1 && building.progress < 1)) return
    const worker = this.workers()[0]
    const base = this.base()
    if (!worker || !base) return
    const race = getRace(this.world.raceOf(1))
    const used = this.world.supplyUsed(1) + this.world.pendingSupply(1)
    const max = this.world.supplyMax(1)
    if (used >= max - 1 && this.count('mine_shaft') > 0) {
      const cost = getBuildingDef(race.id, race.supplyBuildingId).cost
      if (canAfford(this.world.players[1], cost)) {
        this.place(worker, race.supplyBuildingId, base.tileX, base.tileY)
        return
      }
    }
    const steps = ['mine_shaft', race.supplyBuildingId, ...race.militaryBuildingIds]
    const seen: Record<string, number> = {}
    for (const step of steps) {
      seen[step] = (seen[step] || 0) + 1
      if (step === race.supplyBuildingId && seen[step] === 1 && race.id !== 'human') {
        if (this.count(step) >= 1) continue
      }
      if (this.count(step) >= seen[step]) continue
      const def = getBuildingDef(race.id, step)
      if (!def.buildable) continue
      if (!canAfford(this.world.players[1], def.cost)) return
      this.place(worker, step, base.tileX, base.tileY)
      return
    }
    const temple = this.world.buildings.find((building) => building.owner === 1 && building.progress >= 1 && this.world.buildingDef(building).upgradeTo)
    if (temple) {
      const cost = this.world.buildingDef(temple).upgradeCost
      if (cost && canAfford(this.world.players[1], cost)) this.world.upgrade(temple.id)
    }
  }

  private train(): void {
    const race = getRace(this.world.raceOf(1))
    const base = this.world.buildings.find((building) => building.owner === 1 && building.defId === race.mainBuildingId && building.progress >= 1)
    if (base && this.workerCount(race.workerId) < this.workerTarget && !base.queue.includes(race.workerId)) {
      this.world.train(base.id, race.workerId)
    }
    for (const building of this.world.buildings) {
      if (building.owner !== 1 || building.progress < 1 || building.queue.length >= 2) continue
      const trains = this.world.buildingDef(building).trains.filter((id) => id !== race.workerId)
      if (!trains.length) continue
      let choice = trains[0]
      for (let i = trains.length - 1; i >= 0; i -= 1) {
        const def = getUnitDef(race.id, trains[i])
        const room = this.world.supplyUsed(1) + this.world.pendingSupply(1) + def.supply <= this.world.supplyMax(1)
        if (room && canAfford(this.world.players[1], def.cost)) {
          choice = trains[i]
          break
        }
      }
      this.world.train(building.id, choice)
    }
  }

  private sendWave(): void {
    const target = this.baseOf(0)
    if (!target) return
    const fighters = this.world.units.filter((unit) => unit.owner === 1 && this.world.unitDef(unit).role !== 'worker')
    const need = Math.min(12, this.waveSize + this.wavesSent * 2)
    if (fighters.length < need) return
    const center = this.world.centerOf(target)
    this.world.command(fighters, { type: 'attackMove', x: center.x, y: center.y }, false)
    this.wavesSent += 1
  }

  private place(worker: Unit, defId: string, originX: number, originY: number): void {
    const spot = this.world.findSpot(1, defId, originX, originY)
    if (!spot) return
    this.world.placeBuilding(1, defId, spot.tx, spot.ty, worker, false)
  }

  private workers(): Unit[] {
    return this.world.units.filter((unit) => unit.owner === 1 && this.world.unitDef(unit).role === 'worker')
  }

  private workerCount(workerId: string): number {
    const alive = this.workers().length
    const queued = this.world.buildings.filter((building) => building.owner === 1).reduce((sum, building) => sum + building.queue.filter((id) => id === workerId).length, 0)
    return alive + queued
  }

  private nearestWorker(tileX: number, tileY: number): Unit | null {
    let best: Unit | null = null
    let bestD = Infinity
    for (const worker of this.workers()) {
      const dist = Math.hypot(worker.x - tileX * 32, worker.y - tileY * 32)
      if (dist < bestD) {
        bestD = dist
        best = worker
      }
    }
    return best
  }

  private base() {
    return this.baseOf(1)
  }

  private baseOf(owner: 0 | 1) {
    const race = getRace(this.world.raceOf(owner))
    return this.world.buildings.find((building) => building.owner === owner && building.defId === race.mainBuildingId)
  }

  private count(defId: string): number {
    return this.world.buildings.filter((building) => building.owner === 1 && building.defId === defId).length
  }

  private openShaft(): string {
    for (const building of this.world.buildings) {
      if (building.owner !== 1 || building.progress < 1 || !building.mineId) continue
      if (!this.world.buildingDef(building).mineShaft) continue
      const node = this.world.nodes.find((entry) => entry.id === building.mineId)
      if (node && node.ore > 0) return node.id
    }
    return ''
  }

  private nearestForest(tileX: number, tileY: number): string {
    let best = ''
    let bestD = Infinity
    for (const node of this.world.nodes) {
      if (node.kind !== 'forest' || node.wood <= 0) continue
      const dist = Math.hypot(node.tileX - tileX, node.tileY - tileY)
      if (dist < bestD) {
        bestD = dist
        best = node.id
      }
    }
    return best
  }
}
