import Phaser from 'phaser'

export function createShapes(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const paint = (key: string, draw: () => void) => {
    g.clear()
    draw()
    g.generateTexture(key, 48, 48)
  }
  paint('shape-circle', () => {
    g.fillStyle(0xffffff)
    g.fillCircle(24, 24, 16)
    g.lineStyle(3, 0x1b1b1b, 0.45)
    g.strokeCircle(24, 24, 16)
  })
  paint('shape-square', () => {
    g.fillStyle(0xffffff)
    g.fillRoundedRect(8, 8, 32, 32, 6)
    g.lineStyle(3, 0x1b1b1b, 0.45)
    g.strokeRoundedRect(8, 8, 32, 32, 6)
  })
  paint('shape-triangle', () => {
    g.fillStyle(0xffffff)
    g.fillTriangle(24, 6, 42, 40, 6, 40)
    g.lineStyle(3, 0x1b1b1b, 0.45)
    g.strokeTriangle(24, 6, 42, 40, 6, 40)
  })
  paint('shape-diamond', () => {
    g.fillStyle(0xffffff)
    g.fillPoints([
      { x: 24, y: 4 },
      { x: 44, y: 24 },
      { x: 24, y: 44 },
      { x: 4, y: 24 },
    ], true)
    g.lineStyle(3, 0x1b1b1b, 0.45)
    g.strokePoints([
      { x: 24, y: 4 },
      { x: 44, y: 24 },
      { x: 24, y: 44 },
      { x: 4, y: 24 },
    ], true)
  })
  paint('shape-star', () => {
    const points: Array<{ x: number; y: number }> = []
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? 20 : 9
      const angle = -Math.PI / 2 + (i * Math.PI) / 5
      points.push({ x: 24 + Math.cos(angle) * radius, y: 24 + Math.sin(angle) * radius })
    }
    g.fillStyle(0xffffff)
    g.fillPoints(points, true)
    g.lineStyle(2, 0x1b1b1b, 0.45)
    g.strokePoints(points, true)
  })
  paint('shape-plant', () => {
    g.fillStyle(0x2f7d32)
    g.fillRect(21, 20, 6, 18)
    g.fillStyle(0x67d36a)
    g.fillCircle(24, 16, 12)
    g.fillStyle(0x8be38c)
    g.fillCircle(18, 18, 6)
    g.fillCircle(30, 18, 6)
  })
  g.destroy()
}
