import { createHash } from 'crypto'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export function realmLobby() {
  return {
    name: 'realm-lobby',
    configureServer(server) {
      if (server.httpServer) attachLobby(server.httpServer)
    },
    configurePreviewServer(server) {
      if (server.httpServer) attachLobby(server.httpServer)
    },
  }
}

export function attachLobby(httpServer) {
  if (httpServer.__realmLobby) return
  httpServer.__realmLobby = true

  /** @type {Map<string, Client>} */
  const clients = new Map()
  /** @type {Map<string, Room>} */
  const rooms = new Map()
  let nextRoom = 1
  let nextClient = 1

  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0]
    if (path !== '/lobby') return
    const key = req.headers['sec-websocket-key']
    if (!key || req.headers.upgrade !== 'websocket') {
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(String(key) + GUID).digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    if (head.length) socket.unshift(head)
    const client = makeClient(socket, `p${nextClient}`)
    nextClient += 1
    clients.set(client.id, client)
    send(client, { t: 'welcome', id: client.id })
    send(client, { t: 'rooms', rooms: publicRooms(client.id) })

    client.onMessage = (raw) => {
      let msg
      try {
        msg = JSON.parse(raw)
      } catch {
        return
      }
      handle(client, msg)
    }
    client.onClose = () => {
      clients.delete(client.id)
      leave(client, 'left')
    }
  })

  function publicRooms(viewerId) {
    return [...rooms.values()]
      .filter((room) => room.status === 'open' || room.host === viewerId || room.guest === viewerId)
      .map((room) => ({
        id: room.id,
        name: room.name,
        hostRace: room.hostRace,
        guestRace: room.guestRace,
        players: room.guest ? 2 : 1,
        status: room.status,
        yours: room.host === viewerId || room.guest === viewerId,
      }))
  }

  function broadcastRooms() {
    for (const client of clients.values()) send(client, { t: 'rooms', rooms: publicRooms(client.id) })
  }

  function roomOf(client) {
    return [...rooms.values()].find((room) => room.host === client.id || room.guest === client.id)
  }

  function leave(client, reason) {
    const room = roomOf(client)
    if (!room) return
    const otherId = room.host === client.id ? room.guest : room.host
    const other = otherId ? clients.get(otherId) : undefined
    rooms.delete(room.id)
    if (other) send(other, { t: 'left', reason: reason || 'Your opponent left.' })
    broadcastRooms()
  }

  function handle(client, msg) {
    if (!msg || typeof msg.t !== 'string') return
    if (msg.t === 'create') {
      if (roomOf(client)) leave(client, 'cancelled')
      const name = String(msg.name || '').trim().slice(0, 24) || 'Unnamed battle'
      const race = raceOf(msg.race)
      const room = {
        id: `g${nextRoom}`,
        name,
        host: client.id,
        guest: null,
        hostRace: race,
        guestRace: null,
        status: 'open',
      }
      nextRoom += 1
      rooms.set(room.id, room)
      send(client, { t: 'created', id: room.id, name: room.name })
      broadcastRooms()
      return
    }
    if (msg.t === 'join') {
      const room = rooms.get(String(msg.id || ''))
      if (!room || room.status !== 'open' || room.guest || room.host === client.id) {
        send(client, { t: 'error', text: 'That game is gone or already full.' })
        return
      }
      if (roomOf(client)) leave(client, 'cancelled')
      room.guest = client.id
      room.guestRace = raceOf(msg.race)
      room.status = 'playing'
      const payload = {
        t: 'start',
        id: room.id,
        name: room.name,
        hostRace: room.hostRace,
        guestRace: room.guestRace,
      }
      const host = clients.get(room.host)
      if (host) send(host, { ...payload, role: 'host' })
      send(client, { ...payload, role: 'guest' })
      broadcastRooms()
      return
    }
    if (msg.t === 'leave') {
      leave(client, 'cancelled')
      return
    }
    if (msg.t === 'input' || msg.t === 'snap') {
      const room = roomOf(client)
      if (!room || room.status !== 'playing') return
      const otherId = room.host === client.id ? room.guest : room.host
      const other = otherId ? clients.get(otherId) : undefined
      if (!other) return
      if (msg.t === 'input' && client.id !== room.guest) return
      if (msg.t === 'snap' && client.id !== room.host) return
      send(other, msg)
    }
  }

  function raceOf(value) {
    if (value === 'magic' || value === 'monster' || value === 'human') return value
    return 'human'
  }
}

/**
 * @typedef {{ id: string, name: string, host: string, guest: string | null, hostRace: string, guestRace: string | null, status: 'open' | 'playing' }} Room
 * @typedef {{ id: string, send: (text: string) => void, onMessage: (raw: string) => void, onClose: () => void }} Client
 */

function send(client, msg) {
  try {
    client.send(JSON.stringify(msg))
  } catch {
    /* closed */
  }
}

function makeClient(socket, id) {
  let extra = Buffer.alloc(0)
  let closed = false
  const client = {
    id,
    send(text) {
      if (closed) return
      socket.write(encodeText(text))
    },
    onMessage: () => undefined,
    onClose: () => undefined,
  }
  socket.on('data', (chunk) => {
    extra = Buffer.concat([extra, chunk])
    while (true) {
      const frame = decodeFrame(extra)
      if (!frame) break
      extra = extra.subarray(frame.bytes)
      if (frame.opcode === 8) {
        close()
        return
      }
      if (frame.opcode === 9) {
        socket.write(encodePong(frame.payload))
        continue
      }
      if (frame.opcode === 1) client.onMessage(frame.payload.toString('utf8'))
    }
  })
  socket.on('close', close)
  socket.on('end', close)
  socket.on('error', close)
  function close() {
    if (closed) return
    closed = true
    client.onClose()
    try {
      socket.destroy()
    } catch {
      /* already closed */
    }
  }
  return client
}

function encodeText(text) {
  const payload = Buffer.from(text, 'utf8')
  return encodeFrame(1, payload)
}

function encodePong(payload) {
  return encodeFrame(10, payload)
}

function encodeFrame(opcode, payload) {
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.alloc(2)
    header[0] = 0x80 | opcode
    header[1] = len
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeUInt32BE(0, 2)
    header.writeUInt32BE(len, 6)
  }
  return Buffer.concat([header, payload])
}

function decodeFrame(buf) {
  if (buf.length < 2) return null
  const opcode = buf[0] & 15
  const masked = (buf[1] & 128) !== 0
  let len = buf[1] & 127
  let offset = 2
  if (len === 126) {
    if (buf.length < 4) return null
    len = buf.readUInt16BE(2)
    offset = 4
  } else if (len === 127) {
    if (buf.length < 10) return null
    len = buf.readUInt32BE(6)
    offset = 10
  }
  const maskLen = masked ? 4 : 0
  if (buf.length < offset + maskLen + len) return null
  let payload = buf.subarray(offset + maskLen, offset + maskLen + len)
  if (masked) {
    const mask = buf.subarray(offset, offset + 4)
    payload = Buffer.from(payload)
    for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4]
  }
  return { opcode, payload, bytes: offset + maskLen + len }
}
