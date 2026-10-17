export type Order =
  | { type: 'move'; x: number; y: number }
  | { type: 'attackMove'; x: number; y: number }
  | { type: 'attack'; targetId: string }
  | { type: 'patrol'; x: number; y: number; ox: number; oy: number; going: boolean }
  | { type: 'gather'; nodeId: string }
  | { type: 'return' }
  | { type: 'build'; buildingId: string }

export interface Unit {
  id: string
  defId: string
  owner: 0 | 1
  x: number
  y: number
  hp: number
  facing: number
  orders: Order[]
  holding: boolean
  carryWood: number
  carryGold: number
  carryIron: number
  gatherTimer: number
  lastGatherId: string | null
  attackCooldown: number
  plantReady: number
  curseReady: number
  drainReady: number
  healReady: number
  plantedUntil: number
  hasteUntil: number
  revealUntil: number
  path: Array<{ x: number; y: number }>
  goalTx: number
  goalTy: number
  repathAt: number
  anchorX: number
  anchorY: number
  anchored: boolean
}
