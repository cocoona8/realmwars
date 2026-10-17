import * as THREE from 'three'

const TEAM = [0x3d7ec9, 0xc4473a]

const mats = new Map<string, THREE.MeshStandardMaterial>()

function mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.transparent ? 1 : 0}|${opts.emissive || 0}`
  let material = mats.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08, ...opts })
    mats.set(key, material)
  }
  return material
}

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, extra?: THREE.MeshStandardMaterialParameters): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat(color, extra))
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function spin(mesh: THREE.Mesh, rx: number, ry: number, rz: number): THREE.Mesh {
  mesh.rotation.set(rx, ry, rz)
  return mesh
}

const box = new THREE.BoxGeometry(1, 1, 1)
const sphere = new THREE.SphereGeometry(1, 12, 10)
const cone = new THREE.ConeGeometry(1, 1, 10)
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10)

export function makeUnit(id: string, owner: number): THREE.Group {
  const team = TEAM[owner] ?? TEAM[0]
  const g = new THREE.Group()
  g.userData.kind = 'unit'
  const body = makeUnitBody(id, team)
  g.add(body)
  return g
}

function makeUnitBody(id: string, team: number): THREE.Group {
  const g = new THREE.Group()
  const badge = (y = 1.38, r = 0.14) => add(g, cyl, team, 0, y, 0, r, 0.08, r)
  if (id === 'worker') {
    add(g, cyl, 0x5b4630, -0.14, 0.26, 0, 0.09, 0.5, 0.09)
    add(g, cyl, 0x5b4630, 0.14, 0.26, 0, 0.09, 0.5, 0.09)
    add(g, box, 0x9a7444, 0, 0.7, 0, 0.5, 0.42, 0.32)
    add(g, box, 0x6b4423, 0, 0.82, -0.28, 0.36, 0.28, 0.22)
    add(g, sphere, 0xe8b98a, 0, 1.1, 0.06, 0.16, 0.16, 0.16)
    add(g, cyl, 0xc4a15a, 0, 1.22, 0.04, 0.28, 0.06, 0.28)
    spin(add(g, cyl, 0x6b4423, 0.38, 0.72, 0.18, 0.05, 0.7, 0.05), 0.4, 0, 0.9)
    add(g, box, 0x8a8a8a, 0.62, 0.52, 0.38, 0.18, 0.04, 0.12)
    badge()
  } else if (id === 'drone') {
    add(g, sphere, 0x6a5438, 0, 0.42, -0.08, 0.42, 0.28, 0.55)
    add(g, sphere, 0x8d7b5e, 0, 0.48, 0.42, 0.22, 0.18, 0.22)
    add(g, sphere, 0x1a120c, 0, 0.4, 0.58, 0.12, 0.1, 0.1)
    add(g, cyl, 0x4a3a28, -0.28, 0.18, 0.15, 0.05, 0.08, 0.32)
    add(g, cyl, 0x4a3a28, 0.28, 0.18, 0.15, 0.05, 0.08, 0.32)
    add(g, cyl, 0x4a3a28, -0.32, 0.18, -0.2, 0.05, 0.08, 0.32)
    add(g, cyl, 0x4a3a28, 0.32, 0.18, -0.2, 0.05, 0.08, 0.32)
    add(g, cyl, 0x3a2a18, -0.08, 0.7, 0.5, 0.02, 0.28, 0.02)
    add(g, cyl, 0x3a2a18, 0.08, 0.7, 0.5, 0.02, 0.28, 0.02)
    badge(0.78, 0.12)
  } else if (id === 'pixie') {
    add(g, sphere, 0xf6d5c0, 0, 0.42, 0, 0.12, 0.16, 0.12)
    add(g, box, 0x7fc6a0, 0, 0.28, 0, 0.14, 0.22, 0.1)
    spin(add(g, sphere, 0xd8fbff, -0.38, 0.48, 0, 0.34, 0.04, 0.22, { transparent: true, opacity: 0.7 }), 0.2, 0, 0.35)
    spin(add(g, sphere, 0xd8fbff, 0.38, 0.48, 0, 0.34, 0.04, 0.22, { transparent: true, opacity: 0.7 }), 0.2, 0, -0.35)
    add(g, sphere, 0xa8fff4, 0, 0.62, 0, 0.06, 0.06, 0.06, { emissive: 0x44aaaa })
    badge(0.72, 0.1)
  } else if (id === 'warrior') {
    add(g, cyl, 0x6e4a2c, -0.14, 0.28, 0, 0.1, 0.52, 0.1)
    add(g, cyl, 0x6e4a2c, 0.14, 0.28, 0, 0.1, 0.52, 0.1)
    add(g, box, 0x8a5a33, 0, 0.78, 0, 0.5, 0.5, 0.3)
    add(g, sphere, 0xd9a477, 0, 1.18, 0.06, 0.17, 0.17, 0.17)
    spin(add(g, cyl, 0x7a5230, -0.42, 0.72, 0.12, 0.34, 0.08, 0.34), 0, 0, Math.PI / 2)
    spin(add(g, box, 0xc9c4b8, 0.38, 0.72, 0.28, 0.08, 0.08, 0.7), 0.15, 0.2, 0)
    badge()
  } else if (id === 'goblin') {
    add(g, sphere, 0x5e8a32, 0, 0.32, 0, 0.28, 0.22, 0.34)
    add(g, sphere, 0x7fb04a, 0, 0.58, 0.18, 0.2, 0.18, 0.2)
    spin(add(g, cone, 0x6a9a38, -0.22, 0.72, 0.12, 0.08, 0.28, 0.08), 0, 0, 0.9)
    spin(add(g, cone, 0x6a9a38, 0.22, 0.72, 0.12, 0.08, 0.28, 0.08), 0, 0, -0.9)
    add(g, box, 0x5a3a22, 0.32, 0.4, 0.22, 0.06, 0.06, 0.36)
    add(g, sphere, 0x1a1208, 0.08, 0.6, 0.34, 0.04, 0.04, 0.04)
    badge(0.82, 0.1)
  } else if (id === 'soldier') {
    add(g, cyl, 0x4a4e57, -0.13, 0.28, 0, 0.1, 0.52, 0.1)
    add(g, cyl, 0x4a4e57, 0.13, 0.28, 0, 0.1, 0.52, 0.1)
    add(g, box, team, 0, 0.78, 0, 0.48, 0.5, 0.3)
    add(g, sphere, 0xe2b08a, 0, 1.16, 0.04, 0.16, 0.16, 0.16)
    add(g, sphere, 0xa5adb6, 0, 1.24, 0.04, 0.18, 0.12, 0.18)
    add(g, box, 0xc3cad2, 0, 1.4, 0, 0.06, 0.22, 0.16)
    spin(add(g, box, 0x8a9098, -0.4, 0.7, 0.08, 0.08, 0.42, 0.28), 0, 0.2, 0)
    spin(add(g, cyl, 0x7a5230, 0.28, 0.55, 0.55, 0.035, 1.1, 0.035), Math.PI / 2, 0, 0)
    spin(add(g, cone, 0xaab4bf, 0.28, 0.55, 1.14, 0.07, 0.2, 0.07), Math.PI / 2, 0, 0)
    badge(1.52, 0.1)
  } else if (id === 'knight') {
    add(g, sphere, 0x5a4630, 0, 0.32, -0.12, 0.22, 0.28, 0.38)
    add(g, box, 0x6b5340, 0, 0.38, 0.08, 0.36, 0.36, 0.9)
    add(g, sphere, 0x4a3828, 0, 0.34, 0.55, 0.16, 0.16, 0.16)
    add(g, box, 0xc3cad2, 0, 0.78, 0.05, 0.34, 0.42, 0.28)
    add(g, sphere, 0xc3cad2, 0, 1.08, 0.08, 0.16, 0.16, 0.16)
    add(g, box, team, 0, 0.82, 0.22, 0.22, 0.28, 0.06)
    spin(add(g, box, 0xb8c0c8, -0.38, 0.7, 0.12, 0.1, 0.46, 0.32), 0, 0.15, 0)
    spin(add(g, cyl, 0xc9c4b8, 0.2, 0.7, 0.72, 0.035, 1.05, 0.035), Math.PI / 2, 0, 0)
    badge(1.28, 0.12)
  } else if (id === 'orc') {
    add(g, box, 0x4d7a3a, 0, 0.55, 0, 0.7, 0.7, 0.42)
    add(g, sphere, 0x5a8a42, 0, 1.05, 0.08, 0.24, 0.22, 0.24)
    add(g, box, 0x5a4a3a, 0, 0.72, 0.24, 0.4, 0.28, 0.08)
    spin(add(g, cone, 0xf4efe2, -0.14, 0.98, 0.26, 0.05, 0.18, 0.05), 1.2, 0, 0)
    spin(add(g, cone, 0xf4efe2, 0.14, 0.98, 0.26, 0.05, 0.18, 0.05), 1.2, 0, 0)
    add(g, box, 0x6d757e, -0.42, 0.85, 0, 0.22, 0.22, 0.22)
    add(g, box, 0x6d757e, 0.42, 0.85, 0, 0.22, 0.22, 0.22)
    add(g, box, 0x8a8a8a, 0.55, 0.7, 0.15, 0.12, 0.12, 0.12)
    add(g, box, 0x6b4423, 0.55, 0.7, 0.5, 0.08, 0.08, 0.7)
    badge(1.32, 0.14)
  } else if (id === 'crossbowman') {
    add(g, cyl, 0x283d24, -0.12, 0.26, 0, 0.09, 0.5, 0.09)
    add(g, cyl, 0x283d24, 0.12, 0.26, 0, 0.09, 0.5, 0.09)
    add(g, box, 0x3b5a35, 0, 0.72, 0, 0.42, 0.44, 0.26)
    add(g, sphere, 0xe2b08a, 0, 1.1, 0.04, 0.15, 0.15, 0.15)
    add(g, box, 0x6b4423, 0, 0.78, 0.42, 0.12, 0.1, 0.55)
    add(g, box, 0x8a5a33, 0, 0.78, 0.62, 0.85, 0.08, 0.1)
    add(g, box, 0xc9c4b8, 0, 0.78, 0.78, 0.04, 0.04, 0.28)
    badge()
  } else if (id === 'stalker') {
    add(g, sphere, 0x1c2418, 0, 0.42, 0.05, 0.38, 0.28, 0.5)
    add(g, sphere, 0x2a3322, 0, 0.72, 0.28, 0.18, 0.16, 0.2)
    add(g, box, 0x1a1a14, 0, 0.55, -0.22, 0.46, 0.08, 0.4)
    add(g, box, 0x6b4423, 0.22, 0.5, 0.4, 0.06, 0.06, 0.4)
    add(g, sphere, 0x7dff6a, 0.06, 0.74, 0.42, 0.04, 0.04, 0.04, { emissive: 0x145014 })
    badge(0.95, 0.1)
  } else if (id === 'elf') {
    add(g, cyl, 0x283d24, -0.1, 0.32, 0, 0.08, 0.6, 0.08)
    add(g, cyl, 0x283d24, 0.1, 0.32, 0, 0.08, 0.6, 0.08)
    add(g, box, 0x3f8a4a, 0, 0.82, 0, 0.36, 0.55, 0.22)
    add(g, box, 0x2f6a38, 0, 0.7, -0.08, 0.5, 0.08, 0.36)
    add(g, sphere, 0xe2b08a, 0, 1.22, 0.04, 0.14, 0.16, 0.14)
    add(g, box, 0xd4c48a, 0, 1.18, -0.02, 0.22, 0.08, 0.18)
    add(g, box, 0x6b4423, -0.28, 0.85, 0.15, 0.06, 0.06, 0.95)
    add(g, box, 0xc4a15a, -0.28, 0.85, 0.2, 0.28, 0.04, 0.06)
    badge(1.42, 0.1)
  } else if (id === 'troll') {
    add(g, box, 0x6f8fa0, 0, 0.7, 0, 0.7, 0.9, 0.5)
    add(g, sphere, 0x7fa0b0, 0, 1.28, 0.12, 0.22, 0.2, 0.22)
    add(g, box, 0x5f7a88, -0.55, 0.45, 0.2, 0.18, 0.18, 0.7)
    add(g, box, 0x5f7a88, 0.55, 0.45, 0.2, 0.18, 0.18, 0.7)
    add(g, box, 0x6b4423, 0.62, 0.38, 0.7, 0.16, 0.16, 0.55)
    add(g, sphere, 0x4a3828, 0.62, 0.38, 1.02, 0.16, 0.16, 0.16)
    badge(1.52, 0.14)
  } else if (id === 'land_giant') {
    add(g, sphere, 0x8f8574, 0, 0.45, 0, 0.7, 0.5, 0.55)
    add(g, sphere, 0x7a7366, 0, 1.05, 0, 0.55, 0.48, 0.48)
    add(g, sphere, 0x6a6358, 0, 1.62, 0.08, 0.32, 0.28, 0.32)
    add(g, box, 0x5a5348, 0.72, 0.9, 0.1, 0.22, 0.9, 0.22)
    add(g, box, 0x4a4338, -0.55, 0.55, 0.15, 0.2, 0.7, 0.2)
    add(g, cyl, 0x3d6b32, 0.85, 1.2, 0.2, 0.12, 0.7, 0.12)
    add(g, sphere, 0x2f7d38, 0.85, 1.62, 0.2, 0.22, 0.18, 0.22)
    badge(1.95, 0.16)
  } else if (id === 'dragon') {
    add(g, sphere, 0x8a2f2a, 0, 0.45, 0, 0.38, 0.28, 0.7)
    spin(add(g, cone, 0x8a2f2a, 0, 0.5, 0.9, 0.2, 0.55, 0.2), Math.PI / 2, 0, 0)
    add(g, sphere, 0x6a1f1a, 0, 0.42, -0.7, 0.16, 0.12, 0.28)
    add(g, box, team, -0.95, 0.55, 0.05, 1.5, 0.08, 0.55)
    add(g, box, team, 0.95, 0.55, 0.05, 1.5, 0.08, 0.55)
    add(g, box, 0x5a1814, -0.95, 0.55, -0.18, 1.1, 0.05, 0.22)
    add(g, box, 0x5a1814, 0.95, 0.55, -0.18, 1.1, 0.05, 0.22)
    add(g, sphere, 0xffe14a, 0.1, 0.58, 1.12, 0.07, 0.07, 0.07, { emissive: 0xaa4400 })
    badge(0.82, 0.14)
  } else if (id === 'gnome') {
    add(g, cyl, 0x6b4a2a, -0.12, 0.18, 0, 0.08, 0.32, 0.08)
    add(g, cyl, 0x6b4a2a, 0.12, 0.18, 0, 0.08, 0.32, 0.08)
    add(g, box, 0x5a7fb0, 0, 0.48, 0, 0.4, 0.38, 0.28)
    add(g, sphere, 0xf0c4a0, 0, 0.82, 0.04, 0.16, 0.16, 0.16)
    add(g, box, 0xd8c4a0, 0, 0.72, 0.14, 0.22, 0.08, 0.08)
    add(g, cone, team, 0, 1.18, 0, 0.32, 0.7, 0.32)
    add(g, box, 0x8a8a8a, 0.32, 0.42, 0.22, 0.16, 0.16, 0.12)
    add(g, box, 0x6b4423, 0.32, 0.42, 0.42, 0.08, 0.08, 0.32)
    badge(1.52, 0.1)
  } else if (id === 'wizard') {
    add(g, cone, 0x3b4fa8, 0, 0.55, 0, 0.48, 1.1, 0.48)
    add(g, sphere, 0xf0c8a8, 0, 1.12, 0.04, 0.15, 0.15, 0.15)
    add(g, cone, 0x2a3a88, 0, 1.48, 0, 0.28, 0.62, 0.28)
    add(g, cyl, 0x2a3a88, 0, 1.2, 0, 0.34, 0.06, 0.34)
    add(g, cyl, 0x7a5230, 0.36, 0.75, 0.2, 0.04, 1.2, 0.04)
    add(g, sphere, 0x6be3ff, 0.36, 1.42, 0.2, 0.12, 0.12, 0.12, { emissive: 0x2266aa })
    badge(1.78, 0.12)
  } else if (id === 'enchanter') {
    add(g, cone, 0xa45a9a, 0, 0.52, 0, 0.45, 1.05, 0.45)
    add(g, sphere, 0xf0c8a8, 0, 1.08, 0.04, 0.15, 0.15, 0.15)
    add(g, sphere, 0xffc4f0, 0, 1.28, 0.02, 0.22, 0.1, 0.22)
    add(g, cyl, 0xd48acc, 0.34, 0.7, 0.18, 0.035, 1.0, 0.035)
    add(g, sphere, 0xff9be8, 0.34, 1.28, 0.18, 0.1, 0.1, 0.1, { emissive: 0x882266 })
    add(g, sphere, 0xffe8fb, 0.42, 0.55, -0.22, 0.08, 0.08, 0.08, { emissive: 0xaa4488 })
    add(g, sphere, 0xffe8fb, -0.4, 0.62, 0.18, 0.07, 0.07, 0.07, { emissive: 0xaa4488 })
    badge(1.42, 0.12)
  } else if (id === 'dark_wizard') {
    add(g, cone, 0x1a1228, 0, 0.55, 0, 0.5, 1.15, 0.5)
    add(g, sphere, 0xc8b8d8, 0, 1.12, 0.04, 0.15, 0.15, 0.15)
    add(g, cone, 0x2a1f3a, 0, 1.45, 0, 0.24, 0.5, 0.24)
    spin(add(g, cone, 0x4a1480, -0.16, 1.42, 0.04, 0.06, 0.32, 0.06), 0, 0, 0.55)
    spin(add(g, cone, 0x4a1480, 0.16, 1.42, 0.04, 0.06, 0.32, 0.06), 0, 0, -0.55)
    add(g, cyl, 0x2a1a22, 0.38, 0.72, 0.16, 0.045, 1.25, 0.045)
    add(g, sphere, 0xc23aff, 0.38, 1.42, 0.16, 0.12, 0.12, 0.12, { emissive: 0x4a1480 })
    badge(1.72, 0.12)
  } else {
    add(g, box, team, 0, 0.7, 0, 0.42, 0.5, 0.28)
    add(g, sphere, 0xe2b08a, 0, 1.12, 0.04, 0.16, 0.16, 0.16)
    badge()
  }
  return g
}

export function makePlant(): THREE.Group {
  const g = new THREE.Group()
  add(g, cyl, 0x2f7d32, 0, 0.2, 0, 0.05, 0.4, 0.05)
  add(g, sphere, 0x67d36a, 0, 0.48, 0, 0.22, 0.18, 0.22)
  return g
}

export function makeBuilding(id: string, owner: number, tilesW: number, tilesH: number): THREE.Group {
  const team = TEAM[owner] ?? TEAM[0]
  const g = new THREE.Group()
  g.userData.kind = 'building'
  const w = tilesW * 32
  const d = tilesH * 32
  const baseH = 34 + tilesH * 10
  if (id === 'portal') {
    add(g, cyl, 0x6d6870, 0, 4, 0, w * 0.42, 8, d * 0.42)
    add(g, cyl, 0x9a4ae0, 0, 22, 0, w * 0.28, 36, d * 0.28, { emissive: 0x4a1480, transparent: true, opacity: 0.85 })
  } else if (id === 'mountain' || id === 'cave') {
    add(g, cone, 0x7a7266, 0, 40, 0, w * 0.52, 80, d * 0.52)
    add(g, cone, 0x8f877a, -w * 0.18, 26, d * 0.1, w * 0.28, 44, d * 0.28)
    add(g, box, 0x120c08, 0, 12, d * 0.22, 16, 22, 10)
  } else if (id === 'den' || id === 'hole' || id === 'lair') {
    add(g, sphere, 0x6b5238, 0, 14, 0, w * 0.46, 26, d * 0.46)
    add(g, box, 0x120c08, 0, 10, d * 0.22, 18, 18, 14)
    add(g, box, team, 0, 32, -d * 0.1, 4, 24, 4)
  } else if (id === 'garden') {
    add(g, box, 0x6b4a2a, 0, 2, 0, w * 0.9, 4, d * 0.9)
    add(g, sphere, 0xff7ab0, -12, 8, -8, 4, 4, 4)
    add(g, sphere, 0xf7e27a, 10, 8, 6, 4, 4, 4)
    add(g, sphere, 0xb38aff, 0, 8, 10, 4, 4, 4)
  } else if (id === 'mine_shaft') {
    add(g, box, 0x7a7266, 0, 10, 0, w * 0.7, 20, d * 0.7)
    add(g, box, 0x120c08, 0, 8, d * 0.22, 14, 14, 10)
    add(g, cyl, 0x7a5230, -w * 0.2, 22, 0, 2, 28, 2)
    add(g, cyl, 0x7a5230, w * 0.2, 22, 0, 2, 28, 2)
  } else if (id === 'totem') {
    add(g, cyl, 0x8b5a2b, 0, 22, 0, 8, 44, 8)
    add(g, sphere, 0xf0d35a, -4, 36, 6, 2.2, 2.2, 2.2)
    add(g, sphere, 0xf0d35a, 4, 36, 6, 2.2, 2.2, 2.2)
    add(g, box, team, 0, 48, 0, 18, 4, 6)
  } else {
    const wall = id.includes('dark') ? 0x3a2f48 : id.includes('castle') || id.includes('temple') ? 0xe8e4dc : 0x9a6b3c
    add(g, box, wall, 0, baseH / 2, 0, w * 0.88, baseH, d * 0.88)
    add(g, box, team, 0, baseH + 5, 0, w * 0.96, 10, d * 0.96)
    add(g, cone, team, 0, baseH + 28, 0, w * 0.52, 32, d * 0.52)
    add(g, box, 0x3a2a1a, 0, 12, d * 0.42, 12, 22, 8)
    for (let i = -1; i <= 1; i += 1) {
      add(g, box, wall, i * w * 0.28, baseH + 10, -d * 0.4, 8, 12, 8)
    }
    if (tilesW >= 3) {
      add(g, box, wall, -w * 0.38, baseH * 0.85, -d * 0.32, 14, baseH * 1.15, 14)
      add(g, box, wall, w * 0.38, baseH * 0.85, -d * 0.32, 14, baseH * 1.15, 14)
      add(g, cone, team, -w * 0.38, baseH * 1.55, -d * 0.32, 10, 22, 10)
      add(g, cone, team, w * 0.38, baseH * 1.55, -d * 0.32, 10, 22, 10)
      add(g, box, team, -w * 0.38, baseH * 1.9, -d * 0.32, 3, 16, 3)
    }
  }
  return g
}

export function makeTree(seed: number): THREE.Group {
  const g = new THREE.Group()
  const size = 0.85 + (seed % 4) * 0.12
  add(g, cyl, 0x5a3a1f, 0, 8 * size, 0, 2.4 * size, 16 * size, 2.4 * size)
  add(g, cone, seed % 3 === 0 ? 0x1f5e2a : 0x23692e, 0, 22 * size, 0, 13 * size, 22 * size, 13 * size)
  add(g, cone, 0x2f7d38, 0, 32 * size, 0, 10 * size, 16 * size, 10 * size)
  add(g, cone, 0x3f9a48, 0, 40 * size, 0, 7 * size, 12 * size, 7 * size)
  return g
}

export function makeMine(rich: boolean): THREE.Group {
  const g = new THREE.Group()
  add(g, sphere, 0x6d675e, 0, 6, 0, 12, 8, 12)
  add(g, sphere, 0x7a7266, -8, 5, 4, 7, 6, 7)
  add(g, sphere, 0x8f877a, 6, 7, -3, 6, 5, 6)
  if (rich) {
    add(g, octa(0xf0d35a), 0xf0d35a, 4, 12, 2, 1, 1, 1)
    add(g, octa(0xaab4bf), 0xaab4bf, -5, 10, 3, 1, 1, 1)
  }
  return g
}

function octa(color: number): THREE.BufferGeometry {
  void color
  return new THREE.OctahedronGeometry(4, 0)
}

export function makeBar(): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 12
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }))
  sprite.scale.set(28, 5, 1)
  sprite.userData.canvas = canvas
  return sprite
}

export function paintBar(sprite: THREE.Sprite, pct: number, construction: boolean): void {
  const canvas = sprite.userData.canvas as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const amount = Math.max(0, Math.min(1, pct))
  ctx.clearRect(0, 0, 64, 12)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, 64, 12)
  ctx.fillStyle = construction ? '#f0d35a' : amount > 0.55 ? '#3ecf5a' : amount > 0.3 ? '#e6c15a' : '#d24a3a'
  ctx.fillRect(2, 2, 60 * amount, 8)
  const map = sprite.material.map
  if (map) map.needsUpdate = true
}

export function makeRing(color: number, radius: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(radius * 0.82, radius, 24)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.6
  return mesh
}
