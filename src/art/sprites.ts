import Phaser from 'phaser'
import { RACE_IDS, getRace } from '../data/races'
import { TILE } from '../systems/pathfinding'

type G = Phaser.GameObjects.Graphics

export const TEAM_COLORS = [0x3d7ec9, 0xc4473a] as const
export const UNIT_ART = 64
export const ROOF = 30

const INK = 0x1a140e

export function unitKey(id: string, owner: number): string {
  return `u-${id}-${owner}`
}

export function buildingKey(id: string, owner: number): string {
  return `b-${id}-${owner}`
}

export function createSprites(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  for (const raceId of RACE_IDS) {
    const race = getRace(raceId)
    for (let owner = 0; owner < 2; owner += 1) {
      const team = TEAM_COLORS[owner]
      for (const unit of race.units) {
        const key = unitKey(unit.id, owner)
        if (scene.textures.exists(key)) continue
        g.clear()
        ;(UNITS[unit.id] ?? drawFallbackUnit)(g, team)
        g.generateTexture(key, UNIT_ART, UNIT_ART)
      }
      for (const building of race.buildings) {
        const key = buildingKey(building.id, owner)
        if (scene.textures.exists(key)) continue
        const w = building.tilesW * TILE
        const h = building.tilesH * TILE + ROOF
        g.clear()
        ;(BUILDINGS[building.id] ?? drawFallbackBuilding)(g, w, h, team)
        g.generateTexture(key, w, h)
      }
    }
  }
  g.destroy()
}

function shade(color: number, amount: number): number {
  const r = (color >> 16) & 0xff
  const gr = (color >> 8) & 0xff
  const b = color & 0xff
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))))
  return (f(r) << 16) | (f(gr) << 8) | f(b)
}

function ink(g: G, width = 2, alpha = 0.85): void {
  g.lineStyle(width, INK, alpha)
}

function blob(g: G, color: number, x: number, y: number, r: number): void {
  g.fillStyle(color)
  g.fillCircle(x, y, r)
  ink(g)
  g.strokeCircle(x, y, r)
}

function box(g: G, color: number, x: number, y: number, w: number, h: number, radius = 3): void {
  g.fillStyle(color)
  g.fillRoundedRect(x, y, w, h, radius)
  ink(g)
  g.strokeRoundedRect(x, y, w, h, radius)
}

function poly(g: G, color: number, points: number[], stroke = true): void {
  const pts: Phaser.Types.Math.Vector2Like[] = []
  for (let i = 0; i < points.length; i += 2) pts.push({ x: points[i], y: points[i + 1] })
  g.fillStyle(color)
  g.fillPoints(pts, true)
  if (stroke) {
    ink(g)
    g.strokePoints(pts, true)
  }
}

function stick(g: G, color: number, x1: number, y1: number, x2: number, y2: number, width: number): void {
  g.lineStyle(width + 2, INK, 0.85)
  g.lineBetween(x1, y1, x2, y2)
  g.lineStyle(width, color, 1)
  g.lineBetween(x1, y1, x2, y2)
}

/* ---------------------------------------------------------------- people */

interface Body {
  skin: number
  shirt: number
  pants: number
  boots?: number
  headR?: number
  headY?: number
  torsoTop?: number
  torsoHalf?: number
  hips?: number
  legGap?: number
  robe?: boolean
}

interface Pose {
  head: { x: number; y: number; r: number }
  hand: { x: number; y: number }
  backHand: { x: number; y: number }
}

function person(g: G, b: Body): Pose {
  const headR = b.headR ?? 8
  const headY = b.headY ?? 19
  const top = b.torsoTop ?? headY + headR - 1
  const half = b.torsoHalf ?? 9
  const hips = b.hips ?? 45
  const gap = b.legGap ?? 3
  const backHand = { x: 32 - half - 2, y: top + 13 }
  blob(g, b.skin, backHand.x, backHand.y, 3.5)
  if (b.robe) {
    poly(g, b.shirt, [32 - half, top, 32 + half, top, 32 + half + 5, 58, 32 - half - 5, 58])
    g.fillStyle(shade(b.shirt, -0.25))
    g.fillRect(32 - 2, top + 6, 4, 58 - top - 7)
  } else {
    box(g, b.pants, 32 - gap - 6, hips - 3, 6, 58 - hips + 1, 2)
    box(g, b.pants, 32 + gap, hips - 3, 6, 58 - hips + 1, 2)
    if (b.boots !== undefined) {
      box(g, b.boots, 32 - gap - 7, 53, 8, 5, 2)
      box(g, b.boots, 32 + gap, 53, 8, 5, 2)
    }
    box(g, b.shirt, 32 - half, top, half * 2, hips - top + 1, 4)
  }
  blob(g, b.skin, 32, headY, headR)
  g.fillStyle(INK)
  g.fillCircle(32 + headR * 0.45, headY - 1, 1.4)
  const hand = { x: 32 + half + 4, y: top + 12 }
  return { head: { x: 32, y: headY, r: headR }, hand, backHand }
}

function frontArm(g: G, pose: Pose, sleeve: number, skin: number): void {
  stick(g, sleeve, pose.hand.x - 6, pose.hand.y - 9, pose.hand.x, pose.hand.y, 4)
  blob(g, skin, pose.hand.x, pose.hand.y, 3.5)
}

function belt(g: G, color: number, y: number, half = 9): void {
  g.fillStyle(color)
  g.fillRect(32 - half, y, half * 2, 3)
}

function sash(g: G, team: number, top: number, half = 9): void {
  g.lineStyle(4, team, 1)
  g.lineBetween(32 - half + 2, top + 1, 32 + half - 2, top + 14)
}

function hood(g: G, color: number, pose: Pose): void {
  const { x, y, r } = pose.head
  g.fillStyle(color)
  g.beginPath()
  g.arc(x, y, r + 2.5, Math.PI * 0.85, Math.PI * 2.15, false)
  g.closePath()
  g.fillPath()
  poly(g, color, [x - r - 2, y - 2, x - r - 6, y + r + 4, x - r + 3, y + r - 1])
  g.fillStyle(INK)
  g.fillCircle(x + r * 0.45, y, 1.4)
}

function pointyEars(g: G, skin: number, pose: Pose): void {
  const { x, y, r } = pose.head
  poly(g, skin, [x - r + 2, y - 1, x - r - 7, y - 7, x - r + 1, y + 3])
}

function bigEars(g: G, skin: number, pose: Pose): void {
  const { x, y, r } = pose.head
  poly(g, skin, [x - r + 3, y - 2, x - r - 9, y - 4, x - r + 1, y + 4])
  poly(g, skin, [x + r - 4, y - 5, x + r + 4, y - 13, x + r - 1, y - 1])
}

function beard(g: G, color: number, pose: Pose): void {
  const { x, y, r } = pose.head
  poly(g, color, [x - r + 1, y + 1, x + r, y + 1, x + 3, y + r + 9])
}

function tusks(g: G, pose: Pose): void {
  const { x, y, r } = pose.head
  poly(g, 0xf3ecd8, [x + r - 4, y + 4, x + r - 1, y + 4, x + r - 1, y - 1])
  poly(g, 0xf3ecd8, [x + 1, y + 5, x + 4, y + 5, x + 4, y])
}

function pointedHat(g: G, color: number, band: number, pose: Pose, tall = 20): void {
  const { x, y, r } = pose.head
  poly(g, color, [x - r - 5, y - r + 4, x + r + 5, y - r + 4, x - 4, y - r - tall])
  g.fillStyle(band)
  g.fillRect(x - r - 3, y - r + 1, r * 2 + 6, 3)
}

function helmet(g: G, color: number, pose: Pose, plume?: number): void {
  const { x, y, r } = pose.head
  g.fillStyle(color)
  g.beginPath()
  g.arc(x, y - 1, r + 1.5, Math.PI, Math.PI * 2, false)
  g.closePath()
  g.fillPath()
  ink(g)
  g.strokePath()
  g.fillStyle(shade(color, -0.3))
  g.fillRect(x + 1, y - 1, 3, 7)
  if (plume !== undefined) poly(g, plume, [x - 3, y - r - 1, x + 2, y - r - 10, x - 12, y - r - 4])
}

function shield(g: G, team: number, x: number, y: number, r = 7): void {
  blob(g, shade(team, -0.15), x, y, r)
  g.fillStyle(shade(team, 0.35))
  g.fillCircle(x, y, r * 0.45)
}

function crossbow(g: G, hand: Pose['hand']): void {
  stick(g, 0x6b4423, hand.x - 6, hand.y + 1, hand.x + 12, hand.y - 1, 3)
  g.lineStyle(2, 0x9aa3ad, 1)
  g.lineBetween(hand.x + 9, hand.y - 8, hand.x + 9, hand.y + 7)
  g.lineStyle(1, 0xe8e2d0, 1)
  g.lineBetween(hand.x + 9, hand.y - 8, hand.x + 2, hand.y)
  g.lineBetween(hand.x + 9, hand.y + 7, hand.x + 2, hand.y)
}

function staff(g: G, hand: Pose['hand'], orb: number, wood = 0x7a5230): void {
  stick(g, wood, hand.x + 1, hand.y + 16, hand.x + 1, hand.y - 30, 3)
  g.fillStyle(orb, 0.35)
  g.fillCircle(hand.x + 1, hand.y - 32, 8)
  blob(g, orb, hand.x + 1, hand.y - 32, 4.5)
  g.fillStyle(0xffffff, 0.8)
  g.fillCircle(hand.x - 0.5, hand.y - 33.5, 1.5)
}

const UNITS: Record<string, (g: G, team: number) => void> = {
  worker(g, team) {
    const skin = 0xe8b98a
    const pose = person(g, { skin, shirt: 0x9a7444, pants: 0x5b4630, boots: 0x3d2c1c })
    sash(g, team, pose.head.y + 7)
    poly(g, 0xd9b45a, [18, 13, 46, 13, 38, 7, 26, 7])
    stick(g, 0x7a5230, pose.hand.x, pose.hand.y + 6, pose.hand.x + 2, pose.hand.y - 18, 3)
    poly(g, 0x9aa3ad, [pose.hand.x - 4, pose.hand.y - 19, pose.hand.x + 9, pose.hand.y - 22, pose.hand.x + 4, pose.hand.y - 13])
    frontArm(g, pose, 0x9a7444, skin)
  },
  warrior(g, team) {
    const skin = 0xd9a477
    const pose = person(g, { skin, shirt: 0x8a5a33, pants: 0x6e4a2c, boots: 0x3d2c1c, torsoHalf: 10 })
    g.fillStyle(0xb98b55)
    for (let i = 0; i < 4; i += 1) g.fillTriangle(22 + i * 5, 45, 27 + i * 5, 45, 24.5 + i * 5, 50)
    belt(g, team, 40, 10)
    g.fillStyle(0x5a3a22)
    g.fillRect(24, 10, 16, 4)
    stick(g, 0x6b4423, pose.hand.x - 2, pose.hand.y + 4, pose.hand.x + 8, pose.hand.y - 18, 4)
    blob(g, 0x7a5230, pose.hand.x + 9, pose.hand.y - 20, 6)
    g.fillStyle(0xe8e2d0)
    g.fillCircle(pose.hand.x + 6, pose.hand.y - 23, 1.5)
    g.fillCircle(pose.hand.x + 13, pose.hand.y - 19, 1.5)
    frontArm(g, pose, skin, skin)
  },
  soldier(g, team) {
    const skin = 0xe2b08a
    const pose = person(g, { skin, shirt: team, pants: 0x4a4e57, boots: 0x2b2b30, torsoHalf: 10 })
    g.fillStyle(0x9aa3ad)
    g.fillRect(23, pose.head.y + 8, 18, 5)
    belt(g, 0x3d2c1c, 41, 10)
    helmet(g, 0xa5adb6, pose)
    stick(g, 0x7a5230, pose.hand.x, pose.hand.y + 16, pose.hand.x, pose.hand.y - 32, 2.5)
    poly(g, 0xd4dae0, [pose.hand.x - 3, pose.hand.y - 31, pose.hand.x + 3, pose.hand.y - 31, pose.hand.x, pose.hand.y - 40])
    frontArm(g, pose, team, skin)
    shield(g, team, 22, 38, 8)
  },
  knight(g, team) {
    const steel = 0xc3cad2
    const pose = person(g, { skin: steel, shirt: steel, pants: 0x8f98a2, boots: 0x6d757e, torsoHalf: 11, headR: 9 })
    g.fillStyle(team)
    g.fillRect(25, pose.head.y + 11, 14, 14)
    g.fillStyle(0xf0d35a)
    g.fillRect(31, pose.head.y + 13, 2, 10)
    g.fillRect(28, pose.head.y + 16, 8, 2)
    g.fillStyle(INK)
    g.fillRect(33, pose.head.y - 2, 8, 2)
    poly(g, team, [28, pose.head.y - 8, 34, pose.head.y - 20, 22, pose.head.y - 14])
    stick(g, 0xe9eef3, pose.hand.x, pose.hand.y, pose.hand.x + 6, pose.hand.y - 26, 3)
    stick(g, 0xb08d57, pose.hand.x - 4, pose.hand.y - 1, pose.hand.x + 5, pose.hand.y - 4, 2.5)
    frontArm(g, pose, steel, steel)
    poly(g, shade(team, -0.1), [14, 29, 28, 29, 28, 41, 21, 49, 14, 41])
    g.fillStyle(0xf0d35a)
    g.fillRect(20, 32, 2, 12)
  },
  crossbowman(g, team) {
    const skin = 0xe2b08a
    const pose = person(g, { skin, shirt: 0x7b5b3a, pants: 0x4a3a2a, boots: 0x2e2216 })
    sash(g, 0x3d2c1c, pose.head.y + 7)
    hood(g, team, pose)
    g.fillStyle(0x6b4423)
    g.fillRect(19, 26, 5, 16)
    g.fillStyle(0xe8e2d0)
    g.fillRect(20, 23, 1, 4)
    g.fillRect(22, 23, 1, 4)
    crossbow(g, pose.hand)
    frontArm(g, pose, 0x7b5b3a, skin)
  },
  stalker(g, team) {
    const skin = 0xc79a72
    const cloak = 0x2f4a2c
    const pose = person(g, { skin, shirt: 0x3b5a35, pants: 0x283d24, boots: 0x1c2618 })
    poly(g, cloak, [23, pose.head.y + 4, 41, pose.head.y + 4, 44, 54, 20, 54])
    g.fillStyle(0x4f7a45)
    for (let i = 0; i < 6; i += 1) g.fillEllipse(24 + (i % 3) * 7, 32 + Math.floor(i / 3) * 10, 6, 3)
    hood(g, cloak, pose)
    g.fillStyle(team)
    g.fillRect(24, pose.head.y + 6, 16, 2)
    g.fillStyle(0xd8f7a0)
    g.fillCircle(pose.head.x + 4, pose.head.y, 1.6)
    crossbow(g, pose.hand)
    frontArm(g, pose, cloak, skin)
  },

  drone(g, team) {
    const skin = 0x8d7b5e
    const pose = person(g, { skin, shirt: 0x5a4a35, pants: 0x4a3c2b, headR: 9, headY: 24, hips: 47, torsoHalf: 10 })
    bigEars(g, skin, pose)
    g.fillStyle(0xf7e27a)
    g.fillCircle(pose.head.x + 4, pose.head.y - 1, 2)
    belt(g, team, 41, 10)
    poly(g, 0x6b5a45, [18, 34, 26, 30, 28, 44, 20, 46])
    stick(g, 0x6b4423, pose.hand.x, pose.hand.y + 6, pose.hand.x + 2, pose.hand.y - 16, 3)
    poly(g, 0x8a9096, [pose.hand.x - 6, pose.hand.y - 16, pose.hand.x + 10, pose.hand.y - 20, pose.hand.x + 2, pose.hand.y - 13])
    frontArm(g, pose, skin, skin)
  },
  goblin(g, team) {
    const skin = 0x7fb04a
    const pose = person(g, { skin, shirt: 0x6b4f2e, pants: 0x4d3a22, headR: 10, headY: 22, hips: 47, torsoHalf: 8 })
    bigEars(g, skin, pose)
    g.fillStyle(0xffe14a)
    g.fillCircle(pose.head.x + 5, pose.head.y - 2, 2.2)
    g.fillStyle(INK)
    g.fillCircle(pose.head.x + 5.5, pose.head.y - 2, 1)
    poly(g, 0xffffff, [36, pose.head.y + 5, 41, pose.head.y + 5, 38, pose.head.y + 8], false)
    belt(g, team, 41, 8)
    stick(g, 0x5a3a22, pose.hand.x - 1, pose.hand.y + 2, pose.hand.x + 2, pose.hand.y - 2, 2)
    poly(g, 0xc6ccd2, [pose.hand.x, pose.hand.y - 2, pose.hand.x + 4, pose.hand.y - 2, pose.hand.x + 6, pose.hand.y - 16])
    frontArm(g, pose, skin, skin)
  },
  troll(g, team) {
    const skin = 0x6f8fa0
    const pose = person(g, { skin, shirt: skin, pants: 0x5b4630, headR: 8, headY: 22, torsoTop: 24, torsoHalf: 13, hips: 46 })
    g.fillStyle(shade(skin, -0.2))
    g.fillEllipse(32, 36, 16, 10)
    tusks(g, pose)
    g.fillStyle(0x3d4e57)
    g.fillRect(24, 13, 14, 3)
    belt(g, team, 42, 13)
    stick(g, 0x5a3a22, pose.hand.x, pose.hand.y + 6, pose.hand.x + 6, pose.hand.y - 22, 5)
    blob(g, 0x6b4423, pose.hand.x + 7, pose.hand.y - 24, 7)
    frontArm(g, pose, skin, skin)
  },
  orc(g, team) {
    const skin = 0x4d7a3a
    const pose = person(g, { skin, shirt: 0x5a4a3a, pants: 0x3a2e24, boots: 0x22190f, torsoHalf: 11, headR: 9 })
    blob(g, team, 21, pose.head.y + 10, 5)
    blob(g, team, 43, pose.head.y + 10, 5)
    g.fillStyle(0x8a9096)
    g.fillRect(24, pose.head.y + 14, 16, 4)
    belt(g, 0x22190f, 41, 11)
    tusks(g, pose)
    g.fillStyle(0xff4a2a)
    g.fillCircle(pose.head.x + 4, pose.head.y - 2, 1.6)
    g.fillStyle(INK)
    g.fillRect(25, 9, 14, 3)
    stick(g, 0x5a3a22, pose.hand.x, pose.hand.y + 8, pose.hand.x + 2, pose.hand.y - 24, 3)
    poly(g, 0xb8bec4, [pose.hand.x + 2, pose.hand.y - 26, pose.hand.x + 14, pose.hand.y - 30, pose.hand.x + 14, pose.hand.y - 14, pose.hand.x + 2, pose.hand.y - 17])
    frontArm(g, pose, skin, skin)
  },
  land_giant(g, team) {
    const skin = 0x8f8574
    const pose = person(g, { skin, shirt: skin, pants: 0x5f5648, headR: 7, headY: 20, torsoTop: 22, torsoHalf: 14, hips: 46, legGap: 4 })
    g.fillStyle(shade(skin, -0.2))
    g.fillCircle(26, 32, 3)
    g.fillCircle(37, 38, 4)
    g.fillCircle(30, 42, 2.5)
    g.fillStyle(0x7fb04a, 0.9)
    g.fillCircle(24, 25, 3)
    g.fillCircle(41, 27, 2.5)
    belt(g, team, 43, 14)
    stick(g, skin, 22, 26, 20, 10, 6)
    stick(g, skin, 42, 26, 44, 10, 6)
    blob(g, 0x7a7266, 32, 7, 10)
    g.fillStyle(0x9a9284)
    g.fillCircle(29, 4, 4)
    g.fillStyle(0xffb347)
    g.fillCircle(pose.head.x + 3, pose.head.y - 1, 1.6)
  },
  dragon(g, team) {
    const body = 0x8a2f2a
    const wing = shade(team, -0.1)
    poly(g, wing, [30, 30, 12, 4, 2, 22, 10, 26, 6, 36, 20, 34])
    g.lineStyle(1.5, shade(wing, -0.4), 1)
    g.lineBetween(30, 30, 12, 4)
    g.lineBetween(30, 30, 4, 24)
    g.lineBetween(30, 30, 8, 35)
    poly(g, body, [6, 44, 18, 40, 28, 44, 14, 48])
    poly(g, 0xe8c25a, [2, 46, 8, 41, 8, 49])
    g.fillStyle(body)
    g.fillEllipse(30, 42, 30, 16)
    ink(g)
    g.strokeEllipse(30, 42, 30, 16)
    g.fillStyle(0xe8c25a)
    g.fillEllipse(32, 46, 18, 6)
    stick(g, body, 40, 38, 48, 26, 7)
    poly(g, body, [44, 20, 58, 23, 58, 28, 46, 30])
    poly(g, 0xe8c25a, [44, 20, 41, 13, 47, 19])
    g.fillStyle(0xffe14a)
    g.fillCircle(50, 23, 1.8)
    g.fillStyle(0xff8a2a, 0.9)
    g.fillTriangle(58, 25, 64, 21, 64, 30)
    poly(g, shade(wing, 0.15), [34, 30, 46, 4, 54, 20, 46, 22, 48, 30])
    stick(g, body, 24, 48, 22, 55, 3)
    stick(g, body, 36, 48, 38, 55, 3)
  },

  pixie(g, team) {
    g.fillStyle(0xbff4ff, 0.55)
    g.fillEllipse(22, 26, 18, 24)
    g.fillEllipse(42, 26, 18, 24)
    g.fillStyle(0xe3c9ff, 0.55)
    g.fillEllipse(24, 40, 12, 14)
    g.fillEllipse(40, 40, 12, 14)
    g.fillStyle(0xfff7b0, 0.35)
    g.fillCircle(32, 32, 16)
    const skin = 0xf6d5c0
    const pose = person(g, { skin, shirt: shade(team, 0.25), pants: 0x7fc6a0, headR: 7, headY: 22, torsoTop: 28, torsoHalf: 6, hips: 44, legGap: 2, robe: true })
    g.fillStyle(0xf7e27a)
    g.fillCircle(pose.head.x - 3, pose.head.y - 6, 4)
    g.fillCircle(pose.head.x + 2, pose.head.y - 7, 4)
    g.fillStyle(0xffffff)
    g.fillCircle(pose.hand.x + 3, pose.hand.y - 6, 2)
    g.fillStyle(0xfff3a0, 0.6)
    g.fillCircle(pose.hand.x + 3, pose.hand.y - 6, 4)
    frontArm(g, pose, skin, skin)
  },
  elf(g, team) {
    const skin = 0xf1d2b6
    const pose = person(g, { skin, shirt: 0x3f8a4a, pants: 0x5b4630, boots: 0x6b4a2a, torsoHalf: 8, headR: 7.5 })
    g.fillStyle(0xf2e49a)
    g.fillEllipse(30, pose.head.y - 4, 16, 8)
    g.fillRect(23, pose.head.y - 4, 4, 14)
    pointyEars(g, skin, pose)
    g.fillStyle(team)
    g.fillRect(24, pose.head.y + 8, 16, 3)
    belt(g, 0x6b4a2a, 40, 8)
    stick(g, 0x8a6a3a, pose.hand.x + 1, pose.hand.y + 14, pose.hand.x + 1, pose.hand.y - 26, 2.5)
    poly(g, 0x6bd36a, [pose.hand.x + 1, pose.hand.y - 26, pose.hand.x - 6, pose.hand.y - 34, pose.hand.x + 2, pose.hand.y - 38, pose.hand.x + 8, pose.hand.y - 32])
    g.fillStyle(0xd7ffb0, 0.5)
    g.fillCircle(pose.hand.x + 1, pose.hand.y - 32, 7)
    frontArm(g, pose, 0x3f8a4a, skin)
  },
  gnome(g, team) {
    const skin = 0xf0c4a0
    const pose = person(g, { skin, shirt: 0x5a7fb0, pants: 0x6b4a2a, boots: 0x3d2c1c, headR: 9, headY: 25, torsoTop: 32, torsoHalf: 10, hips: 48 })
    beard(g, 0xf3f3f3, pose)
    g.fillStyle(0xf09a7a)
    g.fillCircle(pose.head.x + 7, pose.head.y + 1, 2.5)
    pointedHat(g, team, shade(team, -0.3), pose, 18)
    stick(g, 0x7a5230, pose.hand.x, pose.hand.y + 4, pose.hand.x + 2, pose.hand.y - 14, 3)
    box(g, 0x9aa3ad, pose.hand.x - 4, pose.hand.y - 20, 12, 7, 2)
    frontArm(g, pose, 0x5a7fb0, skin)
  },
  wizard(g, team) {
    drawMage(g, team, 0x3b4fa8, 0x6be3ff)
  },
  enchanter(g, team) {
    drawMage(g, team, 0x3b4fa8, 0xff9be8)
  },
  dark_wizard(g, team) {
    const skin = 0xcdbfd6
    const robe = 0x2a1f3a
    const pose = person(g, { skin, shirt: robe, pants: robe, robe: true, torsoHalf: 9 })
    g.fillStyle(team)
    g.fillRect(29, pose.head.y + 8, 6, 30)
    beard(g, 0x8f8a99, pose)
    pointedHat(g, robe, 0x7a2a9a, pose, 22)
    g.fillStyle(0xff3a3a)
    g.fillCircle(pose.head.x + 4, pose.head.y - 1, 1.8)
    staff(g, pose.hand, 0xc23aff, 0x3a2a3a)
    poly(g, 0xe8e2d0, [pose.hand.x - 4, pose.hand.y - 27, pose.hand.x + 6, pose.hand.y - 27, pose.hand.x + 1, pose.hand.y - 22])
    frontArm(g, pose, robe, skin)
  },
}

function drawMage(g: G, team: number, robe: number, orb: number): void {
  const skin = 0xf0c8a8
  const pose = person(g, { skin, shirt: robe, pants: robe, robe: true, torsoHalf: 9 })
  g.fillStyle(team)
  g.fillRect(29, pose.head.y + 8, 6, 30)
  g.fillStyle(0xf7e27a)
  g.fillCircle(25, 44, 1.6)
  g.fillCircle(39, 50, 1.6)
  beard(g, 0xe8e8ee, pose)
  pointedHat(g, robe, team, pose, 22)
  g.fillStyle(0xf7e27a)
  g.fillCircle(29, 4, 1.8)
  staff(g, pose.hand, orb)
  frontArm(g, pose, robe, skin)
}

function drawFallbackUnit(g: G, team: number): void {
  const pose = person(g, { skin: 0xe2b08a, shirt: team, pants: 0x4a4e57 })
  frontArm(g, pose, team, 0xe2b08a)
}

/* ------------------------------------------------------------- buildings */

function pad(g: G, w: number, h: number, color: number): void {
  g.fillStyle(color, 0.9)
  g.fillRoundedRect(2, ROOF + 4, w - 4, h - ROOF - 6, 8)
}

function flag(g: G, x: number, y: number, team: number, tall = 16): void {
  stick(g, 0x4a3420, x, y, x, y - tall, 2)
  poly(g, team, [x + 1, y - tall, x + 13, y - tall + 4, x + 1, y - tall + 9])
}

function house(g: G, x: number, y: number, w: number, h: number, wall: number, roof: number, roofH: number, door = 0x4a3420): void {
  box(g, wall, x, y, w, h, 2)
  poly(g, roof, [x - 4, y + 2, x + w + 4, y + 2, x + w / 2, y - roofH])
  g.fillStyle(shade(roof, -0.25))
  g.fillTriangle(x + w / 2, y - roofH, x + w + 4, y + 2, x + w / 2 + 3, y + 2)
  box(g, door, x + w / 2 - 4, y + h - 11, 8, 11, 2)
}

function tower(g: G, x: number, y: number, w: number, h: number, wall: number, roof: number, team?: number): void {
  box(g, wall, x, y, w, h, 2)
  g.fillStyle(shade(wall, -0.3))
  for (let i = 0; i < 2; i += 1) g.fillRect(x + w / 2 - 2, y + 8 + i * 14, 4, 6)
  poly(g, roof, [x - 3, y + 1, x + w + 3, y + 1, x + w / 2, y - w * 0.9])
  if (team !== undefined) flag(g, x + w / 2, y - w * 0.9, team, 10)
}

function bricks(g: G, x: number, y: number, w: number, h: number, color: number): void {
  g.lineStyle(1, shade(color, -0.3), 0.7)
  for (let row = y + 7; row < y + h - 2; row += 7) g.lineBetween(x + 2, row, x + w - 2, row)
  for (let row = y, n = 0; row < y + h - 7; row += 7, n += 1) {
    for (let col = x + (n % 2 ? 6 : 12); col < x + w - 3; col += 12) g.lineBetween(col, row, col, row + 7)
  }
}

function mound(g: G, cx: number, base: number, w: number, h: number, color: number): void {
  g.fillStyle(color)
  g.beginPath()
  g.arc(cx, base, w / 2, Math.PI, Math.PI * 2, false)
  g.closePath()
  g.fillPath()
  ink(g)
  g.strokePath()
  g.fillStyle(shade(color, 0.15))
  g.fillEllipse(cx - w * 0.15, base - h * 0.55, w * 0.35, h * 0.25)
  void h
}

function archDoor(g: G, cx: number, base: number, r: number, color = 0x120c08): void {
  g.fillStyle(color)
  g.beginPath()
  g.arc(cx, base - r * 0.6, r, Math.PI, Math.PI * 2, false)
  g.lineTo(cx + r, base)
  g.lineTo(cx - r, base)
  g.closePath()
  g.fillPath()
}

function spikes(g: G, x: number, y: number, w: number, color: number, step = 8, tall = 8): void {
  for (let i = x; i < x + w - 1; i += step) poly(g, color, [i, y, i + step, y, i + step / 2, y - tall])
}

function rock(g: G, x: number, y: number, r: number, color: number): void {
  blob(g, color, x, y, r)
  g.fillStyle(shade(color, 0.2))
  g.fillCircle(x - r * 0.3, y - r * 0.35, r * 0.35)
}

function swirl(g: G, cx: number, cy: number, r: number, colors: number[]): void {
  colors.forEach((color, i) => {
    g.fillStyle(color, 0.95)
    g.fillCircle(cx + Math.sin(i * 1.7) * 2, cy + Math.cos(i * 1.3) * 2, r * (1 - i / (colors.length + 1)))
  })
}

const BUILDINGS: Record<string, (g: G, w: number, h: number, team: number) => void> = {
  wood_fort(g, w, h, team) {
    pad(g, w, h, 0x6b5a3a)
    house(g, w / 2 - 22, 40, 44, 50, 0x9a6b3c, 0x6b3f1f, 24)
    flag(g, w / 2, 16, team, 18)
    tower(g, 4, 46, 18, h - 50, 0x8b5a2b, 0x5a3a1f, team)
    tower(g, w - 22, 46, 18, h - 50, 0x8b5a2b, 0x5a3a1f, team)
    for (let x = 22; x < w - 22; x += 8) {
      const color = (x / 8) % 2 ? 0xa0703f : 0x8b5a2b
      box(g, color, x, 88, 8, h - 90, 2)
      poly(g, color, [x, 89, x + 8, 89, x + 4, 82])
    }
    archDoor(g, w / 2, h - 2, 9)
    stick(g, 0x5a3a1f, w / 2 - 9, h - 14, w / 2 + 9, h - 14, 2)
  },
  village(g, w, h, team) {
    pad(g, w, h, 0x7a6a45)
    house(g, 4, 44, 30, 30, 0xd9c49a, 0xc79a3c, 18, shade(team, -0.2))
    house(g, 28, 60, 32, 30, 0xe3d2aa, 0xb88a34, 18, shade(team, -0.2))
    g.fillStyle(0x5aa0d8)
    g.fillRect(10, 52, 6, 6)
    g.fillRect(34, 68, 6, 6)
    box(g, 0x7a6a5a, 40, 26, 6, 14, 1)
    g.fillStyle(0xd0d0d0, 0.5)
    g.fillCircle(44, 20, 4)
    g.fillCircle(48, 14, 3)
  },
  mine_shaft(g, w, h, team) {
    pad(g, w, h, 0x5a554c)
    mound(g, w / 2, h - 6, w - 8, 40, 0x7a7266)
    archDoor(g, w / 2, h - 6, 12)
    stick(g, 0x7a5230, w / 2 - 18, h - 6, w / 2 - 4, ROOF - 6, 4)
    stick(g, 0x7a5230, w / 2 + 18, h - 6, w / 2 + 4, ROOF - 6, 4)
    stick(g, 0x7a5230, w / 2 - 14, ROOF + 6, w / 2 + 14, ROOF + 6, 3)
    g.lineStyle(3, INK, 0.9)
    g.strokeCircle(w / 2, ROOF - 4, 7)
    g.lineStyle(1.5, 0xcfc6b0, 1)
    g.lineBetween(w / 2, ROOF - 4, w / 2, h - 18)
    box(g, 0x6b4423, w - 22, h - 18, 18, 10, 2)
    g.fillStyle(0xf0d35a)
    g.fillCircle(w - 17, h - 19, 3)
    g.fillStyle(0xaab4bf)
    g.fillCircle(w - 10, h - 19, 3)
    flag(g, 8, h - 12, team, 18)
  },
  war_temple(g, w, h, team) {
    pad(g, w, h, 0x6e6458)
    box(g, 0x9a948a, 2, h - 12, w - 4, 10, 1)
    box(g, 0xb8b2a6, 6, ROOF + 12, w - 12, h - ROOF - 24, 1)
    for (let x = 10; x < w - 10; x += 12) box(g, 0xd8d2c6, x, ROOF + 14, 6, h - ROOF - 28, 1)
    poly(g, 0xa33b3b, [0, ROOF + 14, w, ROOF + 14, w / 2, ROOF - 16])
    stick(g, 0x6b4423, w / 2 - 8, ROOF + 8, w / 2 + 8, ROOF - 6, 3)
    stick(g, 0x6b4423, w / 2 + 8, ROOF + 8, w / 2 - 8, ROOF - 6, 3)
    archDoor(g, w / 2, h - 12, 7)
    g.fillStyle(team)
    g.fillRect(8, ROOF + 18, 6, 18)
    g.fillRect(w - 14, ROOF + 18, 6, 18)
  },
  battle_station(g, w, h, team) {
    pad(g, w, h, 0x5f5a50)
    box(g, 0x7d838a, 4, ROOF + 6, w - 8, h - ROOF - 8, 2)
    bricks(g, 4, ROOF + 6, w - 8, h - ROOF - 8, 0x7d838a)
    poly(g, 0x4a4e57, [0, ROOF + 8, w, ROOF + 8, w - 10, ROOF - 12, 10, ROOF - 12])
    g.fillStyle(0xc9ced4)
    for (let x = 12; x < w - 8; x += 10) g.fillCircle(x, ROOF - 2, 1.5)
    shield(g, team, 16, ROOF + 20, 6)
    shield(g, team, w - 16, ROOF + 20, 6)
    box(g, 0x2b2b30, w / 2 - 8, h - 22, 16, 20, 2)
    stick(g, 0x7a5230, w / 2 - 14, ROOF - 10, w / 2 - 14, ROOF - 28, 2)
    stick(g, 0x7a5230, w / 2 + 14, ROOF - 10, w / 2 + 14, ROOF - 28, 2)
    g.fillStyle(0xd4dae0)
    g.fillTriangle(w / 2 - 17, ROOF - 27, w / 2 - 11, ROOF - 27, w / 2 - 14, ROOF - 30)
    g.fillTriangle(w / 2 + 11, ROOF - 27, w / 2 + 17, ROOF - 27, w / 2 + 14, ROOF - 30)
    flag(g, w / 2, ROOF - 10, team, 18)
  },
  armory(g, w, h, team) {
    pad(g, w, h, 0x655d50)
    box(g, 0xa39a8a, 6, ROOF + 4, w - 12, h - ROOF - 8, 2)
    bricks(g, 6, ROOF + 4, w - 12, h - ROOF - 8, 0xa39a8a)
    poly(g, 0x6b4a3a, [0, ROOF + 6, w, ROOF + 6, w - 14, ROOF - 16, 14, ROOF - 16])
    box(g, 0x7a7266, w - 30, ROOF - 28, 10, 18, 1)
    g.fillStyle(0xbdbdbd, 0.5)
    g.fillCircle(w - 25, ROOF - 32, 4)
    g.fillCircle(w - 21, ROOF - 38, 3)
    g.fillStyle(0xff8a2a)
    g.fillRect(14, h - 24, 14, 10)
    box(g, 0x2b2b30, w / 2 - 9, h - 24, 18, 20, 2)
    g.fillStyle(0x3a3a40)
    g.fillRect(w - 30, h - 16, 18, 6)
    g.fillRect(w - 26, h - 10, 10, 6)
    stick(g, 0xe9eef3, w / 2 - 12, ROOF - 12, w / 2 + 12, ROOF + 2, 2)
    stick(g, 0xe9eef3, w / 2 + 12, ROOF - 12, w / 2 - 12, ROOF + 2, 2)
    shield(g, team, w / 2, ROOF - 5, 6)
  },
  totem(g, w, h, team) {
    pad(g, w, h, 0x4f4560)
    rock(g, w / 2 - 14, h - 8, 7, 0x7a7266)
    rock(g, w / 2 + 14, h - 8, 7, 0x7a7266)
    const faces = [0x8b5a2b, 0x5c4a72, 0xa33b3b, 0x8b5a2b]
    const top = 4
    const step = (h - 10 - top) / faces.length
    faces.forEach((color, i) => {
      const y = top + i * step
      box(g, color, w / 2 - 10, y, 20, step, 3)
      g.fillStyle(0xf0d35a)
      g.fillCircle(w / 2 - 4, y + step * 0.35, 2.5)
      g.fillCircle(w / 2 + 4, y + step * 0.35, 2.5)
      g.fillStyle(INK)
      g.fillRect(w / 2 - 5, y + step * 0.65, 10, 2.5)
    })
    poly(g, team, [w / 2 - 10, top + 6, w / 2 - 28, top - 2, w / 2 - 10, top + 16])
    poly(g, team, [w / 2 + 10, top + 6, w / 2 + 28, top - 2, w / 2 + 10, top + 16])
    g.fillStyle(0x9be36a, 0.35)
    g.fillCircle(w / 2, top + step * 0.35, 9)
  },

  den(g, w, h, team) {
    pad(g, w, h, 0x4a3a2a)
    mound(g, w / 2, h - 4, w - 6, h - 20, 0x6b5238)
    mound(g, w / 2 + 18, h - 4, 40, 30, 0x5a4530)
    archDoor(g, w / 2 - 6, h - 4, 18)
    spikes(g, w / 2 - 22, h - 34, 32, 0xe8e2d0, 8, 7)
    stick(g, 0x5a3a22, 12, h - 6, 12, h - 40, 3)
    blob(g, 0xe8e2d0, 12, h - 44, 6)
    g.fillStyle(INK)
    g.fillCircle(10, h - 45, 1.6)
    g.fillCircle(14, h - 45, 1.6)
    stick(g, 0x5a3a22, w / 2 + 6, 22, w / 2 + 6, 2, 2)
    poly(g, team, [w / 2 + 7, 2, w / 2 + 22, 5, w / 2 + 16, 8, w / 2 + 22, 12, w / 2 + 7, 12])
  },
  hole(g, w, h, team) {
    g.fillStyle(0x5a4530)
    g.fillEllipse(w / 2, h - 22, w - 6, 34)
    ink(g)
    g.strokeEllipse(w / 2, h - 22, w - 6, 34)
    g.fillStyle(0x120c08)
    g.fillEllipse(w / 2, h - 20, w - 22, 22)
    stick(g, 0x6b4423, w / 2 - 6, h - 32, w / 2 - 2, h - 12, 2)
    stick(g, 0x6b4423, w / 2 + 6, h - 32, w / 2 + 10, h - 12, 2)
    for (let i = 0; i < 3; i += 1) stick(g, 0x6b4423, w / 2 - 4 + i * 1.5, h - 28 + i * 6, w / 2 + 8 + i * 1.5, h - 28 + i * 6, 1.5)
    rock(g, 10, h - 26, 5, 0x7a7266)
    rock(g, w - 10, h - 18, 6, 0x7a7266)
    flag(g, w - 12, h - 28, team, 22)
  },
  lair(g, w, h, team) {
    pad(g, w, h, 0x3d3a2a)
    mound(g, w / 2, h - 4, w - 6, 50, 0x5a6b3a)
    spikes(g, 10, h - 26, w - 20, 0x4a5a2f, 9, 12)
    archDoor(g, w / 2, h - 4, 11)
    g.fillStyle(0xffe14a)
    g.fillCircle(w / 2 - 4, h - 14, 2)
    g.fillCircle(w / 2 + 4, h - 14, 2)
    flag(g, w / 2 + 16, h - 40, team, 22)
  },
  cave(g, w, h, team) {
    pad(g, w, h, 0x4a4a4a)
    rock(g, w / 2 - 12, h - 26, 22, 0x7d7d80)
    rock(g, w / 2 + 14, h - 22, 18, 0x6d6d70)
    rock(g, w / 2, h - 40, 16, 0x8a8a8d)
    archDoor(g, w / 2, h - 4, 14)
    g.fillStyle(0xcfcfd2)
    for (let i = -10; i <= 10; i += 5) g.fillTriangle(w / 2 + i - 2, h - 25, w / 2 + i + 2, h - 25, w / 2 + i, h - 19)
    flag(g, w / 2 + 6, h - 54, team, 18)
  },
  fortress(g, w, h, team) {
    pad(g, w, h, 0x2a2420)
    box(g, 0x3a3230, 6, h - 40, w - 12, 38, 2)
    bricks(g, 6, h - 40, w - 12, 38, 0x3a3230)
    spikes(g, 6, h - 40, w - 12, 0x2a2420, 8, 10)
    box(g, 0x2f2826, w / 2 - 16, 18, 32, h - 40, 2)
    spikes(g, w / 2 - 16, 18, 32, 0x1f1a18, 8, 14)
    g.fillStyle(0xff4a2a)
    g.fillRect(w / 2 - 8, 34, 5, 8)
    g.fillRect(w / 2 + 3, 34, 5, 8)
    g.fillRect(16, h - 30, 6, 6)
    g.fillRect(w - 22, h - 30, 6, 6)
    archDoor(g, w / 2, h - 2, 10, 0x1a0a06)
    flag(g, w / 2, 4, team, 4)
    poly(g, team, [w / 2 - 14, 26, w / 2 - 4, 26, w / 2 - 4, 50, w / 2 - 9, 46, w / 2 - 14, 50])
  },
  mountain(g, w, h, team) {
    pad(g, w, h, 0x4f4a42)
    poly(g, 0x7a7266, [0, h - 2, w * 0.38, 8, w * 0.62, 30, w, h - 2])
    poly(g, 0x8f877a, [w * 0.38, 8, w * 0.62, 30, w * 0.48, h - 2, 6, h - 2], false)
    poly(g, 0xf3f3f3, [w * 0.3, 24, w * 0.38, 8, w * 0.47, 20, w * 0.42, 26, w * 0.36, 22])
    poly(g, 0x6d675e, [w * 0.55, h - 2, w * 0.75, 40, w, h - 2])
    archDoor(g, w * 0.5, h - 2, 12)
    flag(g, w * 0.38, 8, team, 2)
    poly(g, team, [w * 0.38, 2, w * 0.38 + 12, 5, w * 0.38, 9])
  },
  portal(g, w, h, team) {
    pad(g, w, h, 0x2f2a3a)
    box(g, 0x6d6870, 8, h - 14, w - 16, 12, 2)
    const cx = w / 2
    const cy = h / 2 + 4
    const r = Math.min(w, h) / 2 - 10
    swirl(g, cx, cy, r - 4, [0x3a1a6a, 0x6a2ab0, 0x9a4ae0, 0xd08aff, 0xffffff])
    g.lineStyle(10, 0x6d6870, 1)
    g.strokeCircle(cx, cy, r)
    ink(g)
    g.strokeCircle(cx, cy, r + 5)
    g.strokeCircle(cx, cy, r - 5)
    g.fillStyle(team)
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2
      g.fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3)
    }
  },

  castle(g, w, h, team) {
    pad(g, w, h, 0x6f7a6a)
    box(g, 0xe8e4dc, 10, 52, w - 20, h - 54, 2)
    bricks(g, 10, 52, w - 20, h - 54, 0xe8e4dc)
    tower(g, w / 2 - 12, 22, 24, 40, 0xf2eee6, team, team)
    tower(g, 2, 46, 18, h - 48, 0xf2eee6, 0x3b4fa8, team)
    tower(g, w - 20, 46, 18, h - 48, 0xf2eee6, 0x3b4fa8, team)
    archDoor(g, w / 2, h - 2, 10, 0x3a2a5a)
    g.fillStyle(0x9be3ff)
    g.fillCircle(w / 2, 40, 3)
  },
  hut(g, w, h, team) {
    pad(g, w, h, 0x5a7a4a)
    box(g, 0xf3ead2, w / 2 - 14, h - 36, 28, 32, 6)
    archDoor(g, w / 2, h - 4, 6, 0x6b4a2a)
    g.fillStyle(0x9be3ff)
    g.fillCircle(w / 2 + 8, h - 24, 3)
    g.fillStyle(0xd8483a)
    g.beginPath()
    g.arc(w / 2, h - 32, w / 2 - 4, Math.PI, Math.PI * 2, false)
    g.closePath()
    g.fillPath()
    ink(g)
    g.strokePath()
    g.fillStyle(0xffffff)
    g.fillCircle(w / 2 - 14, h - 42, 4)
    g.fillCircle(w / 2 + 4, h - 54, 5)
    g.fillCircle(w / 2 + 18, h - 40, 3.5)
    g.fillStyle(team)
    g.fillRect(w / 2 - 14, h - 34, 28, 3)
  },
  guard(g, w, h, team) {
    pad(g, w, h, 0x4a6a3a)
    stick(g, 0x7a5230, w / 2, h - 4, w / 2, 30, 10)
    stick(g, 0x7a5230, w / 2, h - 10, w / 2 - 14, h - 2, 4)
    stick(g, 0x7a5230, w / 2, h - 10, w / 2 + 14, h - 2, 4)
    blob(g, 0x3f8a4a, w / 2 - 12, 26, 13)
    blob(g, 0x4fa05a, w / 2 + 12, 22, 14)
    blob(g, 0x5ab865, w / 2, 12, 12)
    box(g, 0xa07a4a, w / 2 - 16, 34, 32, 6, 2)
    g.fillStyle(0xfff3a0, 0.6)
    g.fillCircle(w / 2 + 14, 46, 6)
    blob(g, 0xf7e27a, w / 2 + 14, 46, 3)
    flag(g, w / 2 - 12, 34, team, 14)
  },
  garden(g, w, h, team) {
    g.fillStyle(0x6b4a2a)
    g.fillRoundedRect(4, ROOF + 8, w - 8, h - ROOF - 12, 4)
    const flowers = [0xff7ab0, 0xf7e27a, 0xb38aff, 0xff8a5a, 0x7ad8ff]
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = 12 + col * ((w - 24) / 3)
        const y = ROOF + 16 + row * ((h - ROOF - 28) / 2)
        g.fillStyle(0x3f8a4a)
        g.fillEllipse(x, y + 3, 10, 5)
        blob(g, flowers[(row * 4 + col) % flowers.length], x, y, 3.5)
      }
    }
    g.lineStyle(2, 0xe8d8b0, 1)
    g.strokeRoundedRect(3, ROOF + 6, w - 6, h - ROOF - 9, 4)
    for (let x = 6; x < w - 4; x += 8) g.lineBetween(x, ROOF + 2, x, ROOF + 8)
    stick(g, 0x7a5230, w / 2, ROOF + 6, w / 2, 4, 2)
    blob(g, 0xd8483a, w / 2, 6, 6)
    flag(g, w - 8, ROOF + 6, team, 18)
  },
  magic_temple(g, w, h, team) {
    drawTemple(g, w, h, team, 0xe6e0f0, 0x8a7ad8, 0x6be3ff)
  },
  dark_temple(g, w, h, team) {
    drawTemple(g, w, h, team, 0x3a2f48, 0x1f1828, 0xc23aff)
    spikes(g, 10, h - 46, w - 20, 0x1f1828, 10, 8)
    g.fillStyle(0xff3a3a)
    g.fillCircle(w / 2 - 20, h - 30, 2)
    g.fillCircle(w / 2 + 20, h - 30, 2)
  },
}

function drawTemple(g: G, w: number, h: number, team: number, stone: number, dome: number, crystal: number): void {
  pad(g, w, h, shade(stone, -0.5))
  box(g, shade(stone, -0.15), 4, h - 10, w - 8, 8, 1)
  box(g, stone, 10, h - 46, w - 20, 36, 2)
  for (let x = 14; x < w - 14; x += 11) box(g, shade(stone, 0.1), x, h - 44, 5, 32, 1)
  g.fillStyle(dome)
  g.beginPath()
  g.arc(w / 2, h - 46, w / 2 - 14, Math.PI, Math.PI * 2, false)
  g.closePath()
  g.fillPath()
  ink(g)
  g.strokePath()
  g.fillStyle(team)
  g.fillRect(12, h - 50, w - 24, 4)
  archDoor(g, w / 2, h - 10, 8, shade(dome, -0.4))
  const cy = 14
  g.fillStyle(crystal, 0.3)
  g.fillCircle(w / 2, cy, 13)
  poly(g, crystal, [w / 2, cy - 12, w / 2 + 7, cy, w / 2, cy + 12, w / 2 - 7, cy])
  g.fillStyle(0xffffff, 0.7)
  g.fillTriangle(w / 2, cy - 10, w / 2 + 3, cy - 2, w / 2 - 2, cy)
}

function drawFallbackBuilding(g: G, w: number, h: number, team: number): void {
  pad(g, w, h, 0x5a5a5a)
  house(g, 8, ROOF + 10, w - 16, h - ROOF - 14, 0xb0a490, 0x7a5a3a, 22)
  flag(g, w / 2, ROOF - 10, team, 16)
}
