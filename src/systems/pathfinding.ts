export const TILE = 32
export const COLS = 72
export const ROWS = 48
export const MAP_W = COLS * TILE
export const MAP_H = ROWS * TILE

export function tileOf(x: number, y: number): { x: number; y: number } {
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) }
}

export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }
}

type Tile = { x: number; y: number }

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx)
  const dy = Math.abs(ay - by)
  return dx + dy + (1.414 - 2) * Math.min(dx, dy)
}

function lineClear(blocked: (x: number, y: number) => boolean, a: Tile, b: Tile): boolean {
  let x0 = a.x
  let y0 = a.y
  const x1 = b.x
  const y1 = b.y
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  while (x0 !== x1 || y0 !== y1) {
    if (!(x0 === a.x && y0 === a.y) && blocked(x0, y0)) return false
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
  return !blocked(x1, y1)
}

function smooth(blocked: (x: number, y: number) => boolean, path: Tile[]): Tile[] {
  if (path.length < 3) return path
  const result: Tile[] = []
  let i = 0
  while (i < path.length - 1) {
    let j = path.length - 1
    while (j > i + 1 && !lineClear(blocked, path[i], path[j])) j -= 1
    result.push(path[j])
    i = j
  }
  return result
}

export function findPath(
  blocked: (x: number, y: number) => boolean,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): Tile[] {
  if (sx === gx && sy === gy) return []
  if (sx < 0 || sy < 0 || gx < 0 || gy < 0 || sx >= COLS || sy >= ROWS || gx >= COLS || gy >= ROWS) return []
  const key = (x: number, y: number) => y * COLS + x
  const open: number[] = []
  const gScore = new Map<number, number>()
  const fScore = new Map<number, number>()
  const parent = new Map<number, number>()
  const startKey = key(sx, sy)
  const goalKey = key(gx, gy)
  gScore.set(startKey, 0)
  fScore.set(startKey, heuristic(sx, sy, gx, gy))
  open.push(startKey)
  const dirs: Array<[number, number, number]> = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ]
  let guard = 0
  while (open.length && guard < 6000) {
    guard += 1
    let bestIndex = 0
    let bestF = fScore.get(open[0]) ?? 1e9
    for (let i = 1; i < open.length; i += 1) {
      const score = fScore.get(open[i]) ?? 1e9
      if (score < bestF) {
        bestF = score
        bestIndex = i
      }
    }
    const current = open.splice(bestIndex, 1)[0]
    if (current === goalKey) break
    const cx = current % COLS
    const cy = Math.floor(current / COLS)
    for (const [dx, dy, stepCost] of dirs) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
      if (blocked(nx, ny)) continue
      if (dx !== 0 && dy !== 0 && (blocked(cx + dx, cy) || blocked(cx, cy + dy))) continue
      const nextKey = key(nx, ny)
      const nextG = (gScore.get(current) ?? 1e9) + stepCost
      if (nextG < (gScore.get(nextKey) ?? 1e9)) {
        parent.set(nextKey, current)
        gScore.set(nextKey, nextG)
        fScore.set(nextKey, nextG + heuristic(nx, ny, gx, gy))
        if (!open.includes(nextKey)) open.push(nextKey)
      }
    }
  }
  if (!gScore.has(goalKey)) return []
  const path: Tile[] = []
  let cursor: number | undefined = goalKey
  while (cursor !== undefined && cursor !== startKey) {
    path.push({ x: cursor % COLS, y: Math.floor(cursor / COLS) })
    cursor = parent.get(cursor)
  }
  path.reverse()
  return smooth(blocked, path)
}
