import Phaser from 'phaser'
import { Lobby } from './net/lobby'
import type { StartMatch } from './net/protocol'
import { GameScene, type StartData } from './scenes/Game'
import { RaceSelect } from './scenes/RaceSelect'
import { Hud } from './ui/hud'
import './style.css'

const hudElement = document.getElementById('hud')
if (!hudElement) throw new Error('Missing game HUD')
const hudRoot: HTMLElement = hudElement

const hud = new Hud(hudRoot)
const lobby = new Lobby()
const menu = new RaceSelect()
const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game-root',
  backgroundColor: '#00000000',
  transparent: true,
  banner: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [],
})
game.scene.add('game', GameScene, false)
game.registry.set('hud', hud)
game.registry.set('lobby', lobby)
;(window as unknown as { __GAME?: Phaser.Game }).__GAME = game

function syncMenu(): void {
  menu.setLobby(lobby.rooms, lobby.status, lobby.waiting)
}

function launch(start: StartData): void {
  menu.hide()
  hudRoot.classList.remove('hidden')
  game.registry.set('start', start)
  if (game.scene.isActive('game') || game.scene.isPaused('game')) game.scene.stop('game')
  game.scene.start('game')
}

menu.onVsComputer = (race, difficulty) => {
  lobby.leave()
  launch({ race, difficulty })
}
menu.onCreate = (name, race) => lobby.create(name, race)
menu.onJoin = (id, race) => lobby.join(id, race)
menu.onCancelWait = () => lobby.leave()

lobby.onRooms = syncMenu
lobby.onStart = (match: StartMatch) => {
  launch({
    race: match.role === 'host' ? match.hostRace : match.guestRace,
    difficulty: 'normal',
    online: match,
  })
}
lobby.onLeft = (reason) => {
  if (game.scene.isActive('game') || game.scene.isPaused('game')) {
    game.scene.stop('game')
    hudRoot.classList.add('hidden')
    menu.show()
  }
  lobby.status = reason
  syncMenu()
}

hud.onMenu = () => {
  lobby.disconnectPlay()
  game.scene.stop('game')
  hudRoot.classList.add('hidden')
  menu.show()
  syncMenu()
}

hud.onRematch = () => {
  const start = game.registry.get('start') as StartData | undefined
  if (!start || start.online) {
    hud.onMenu()
    return
  }
  launch(start)
}

lobby.connect()
syncMenu()

window.addEventListener('contextmenu', (event) => {
  if ((event.target as HTMLElement).closest('#minimap, #game-root')) event.preventDefault()
})
