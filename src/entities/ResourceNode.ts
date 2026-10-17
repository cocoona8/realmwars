export interface ResourceNode {
  id: string
  kind: 'forest' | 'mine'
  tileX: number
  tileY: number
  tilesW: number
  tilesH: number
  wood: number
  ore: number
  shaftId?: string
}
