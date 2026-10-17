import type { RaceId } from '../data/races'
import type { Order } from '../entities/Unit'

export interface RoomInfo {
  id: string
  name: string
  hostRace: RaceId
  guestRace: RaceId | null
  players: number
  status: 'open' | 'playing'
  yours: boolean
}

export interface StartMatch {
  id: string
  name: string
  role: 'host' | 'guest'
  hostRace: RaceId
  guestRace: RaceId
}

export type NetOp =
  | { op: 'command'; unitIds: string[]; order: Order; queue: boolean }
  | { op: 'stop'; unitIds: string[] }
  | { op: 'hold'; unitIds: string[] }
  | { op: 'train'; buildingId: string; unitId: string }
  | { op: 'cancelTrain'; buildingId: string }
  | { op: 'upgrade'; buildingId: string }
  | { op: 'place'; defId: string; tileX: number; tileY: number; workerIds: string[]; queue: boolean }
  | { op: 'rally'; buildingIds: string[]; x: number; y: number }

export type ClientMsg =
  | { t: 'create'; name: string; race: RaceId }
  | { t: 'join'; id: string; race: RaceId }
  | { t: 'leave' }
  | { t: 'input'; op: NetOp }
  | { t: 'snap'; state: unknown }

export type ServerMsg =
  | { t: 'welcome'; id: string }
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'created'; id: string; name: string }
  | { t: 'start'; id: string; name: string; role: 'host' | 'guest'; hostRace: RaceId; guestRace: RaceId }
  | { t: 'left'; reason: string }
  | { t: 'error'; text: string }
  | { t: 'input'; op: NetOp }
  | { t: 'snap'; state: unknown }
