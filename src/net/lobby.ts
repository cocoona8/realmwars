import type { RaceId } from '../data/races'
import type { Snapshot } from '../systems/world'
import type { ClientMsg, NetOp, RoomInfo, ServerMsg, StartMatch } from './protocol'

export class Lobby {
  rooms: RoomInfo[] = []
  status = 'Connecting to the game list…'
  waiting: { id: string; name: string } | null = null
  connected = false
  onRooms: () => void = () => undefined
  onStart: (match: StartMatch) => void = () => undefined
  onLeft: (reason: string) => void = () => undefined
  onError: (text: string) => void = () => undefined
  onSnap: (state: Snapshot) => void = () => undefined
  onInput: (op: NetOp) => void = () => undefined
  private socket: WebSocket | null = null
  private closed = false
  private pendingCreate: { name: string; race: RaceId } | null = null

  connect(): void {
    if (this.socket || this.closed) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${proto}://${location.host}/lobby`)
    this.socket = socket
    socket.addEventListener('open', () => {
      this.connected = true
      this.status = this.waiting
        ? `Waiting for someone to join “${this.waiting.name}”.`
        : 'Connected. Create a game or join one from the list.'
      this.onRooms()
      if (this.pendingCreate) this.send({ t: 'create', name: this.pendingCreate.name, race: this.pendingCreate.race })
    })
    socket.addEventListener('message', (event) => {
      let msg: ServerMsg
      try {
        msg = JSON.parse(String(event.data)) as ServerMsg
      } catch {
        return
      }
      this.handle(msg)
    })
    socket.addEventListener('close', () => {
      this.socket = null
      this.connected = false
      this.waiting = null
      this.status = 'Disconnected from the game list. Retrying…'
      this.onRooms()
      if (!this.closed) window.setTimeout(() => this.connect(), 1200)
    })
    socket.addEventListener('error', () => {
      this.status = 'Could not reach the game list.'
      this.onRooms()
    })
  }

  create(name: string, race: RaceId): void {
    const room: RoomInfo = {
      id: this.waiting?.id ?? 'local',
      name,
      hostRace: race,
      guestRace: null,
      players: 1,
      status: 'open',
      yours: true,
    }
    this.waiting = { id: room.id, name }
    this.rooms = [room, ...this.rooms.filter((entry) => !entry.yours)]
    this.status = this.connected
      ? `Waiting for someone to join “${name}”.`
      : `Your game “${name}” is on the list. Connecting so others can see it…`
    this.pendingCreate = { name, race }
    this.onRooms()
    this.send({ t: 'create', name, race })
  }

  join(id: string, race: RaceId): void {
    this.send({ t: 'join', id, race })
  }

  leave(): void {
    this.waiting = null
    this.pendingCreate = null
    this.rooms = this.rooms.filter((room) => !room.yours)
    this.status = this.connected ? 'Connected. Create a game or join one from the list.' : this.status
    this.send({ t: 'leave' })
    this.onRooms()
  }

  sendInput(op: NetOp): void {
    this.send({ t: 'input', op })
  }

  sendSnap(state: Snapshot): void {
    this.send({ t: 'snap', state })
  }

  disconnectPlay(): void {
    this.waiting = null
    this.send({ t: 'leave' })
  }

  private handle(msg: ServerMsg): void {
    if (msg.t === 'welcome') {
      this.connected = true
      this.status = 'Connected. Create a game or join one from the list.'
      this.onRooms()
    } else if (msg.t === 'rooms') {
      this.rooms = msg.rooms
      this.onRooms()
    } else if (msg.t === 'created') {
      this.waiting = { id: msg.id, name: msg.name }
      this.status = `Waiting for someone to join “${msg.name}”.`
      this.onRooms()
    } else if (msg.t === 'start') {
      this.waiting = null
      this.pendingCreate = null
      this.onStart(msg)
    } else if (msg.t === 'left') {
      this.waiting = null
      this.status = msg.reason
      this.onLeft(msg.reason)
      this.onRooms()
    } else if (msg.t === 'error') {
      this.status = msg.text
      this.onError(msg.text)
      this.onRooms()
    } else if (msg.t === 'snap') this.onSnap(msg.state as Snapshot)
    else if (msg.t === 'input') this.onInput(msg.op)
  }

  private send(msg: ClientMsg): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(msg))
  }
}
