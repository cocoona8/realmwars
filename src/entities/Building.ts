export interface Building {
  id: string
  defId: string
  owner: 0 | 1
  tileX: number
  tileY: number
  hp: number
  progress: number
  queue: string[]
  trainTime: number
  rallyX: number
  rallyY: number
  mineId?: string
}
