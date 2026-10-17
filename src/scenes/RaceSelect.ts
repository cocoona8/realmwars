import { RACE_IDS, getRace, type Difficulty, type RaceId } from '../data/races'
import type { RoomInfo } from '../net/protocol'

export class RaceSelect {
  readonly root: HTMLElement
  race: RaceId = 'human'
  difficulty: Difficulty = 'normal'
  onVsComputer: (race: RaceId, difficulty: Difficulty) => void = () => undefined
  onCreate: (name: string, race: RaceId) => void = () => undefined
  onJoin: (id: string, race: RaceId) => void = () => undefined
  onCancelWait: () => void = () => undefined
  private rooms: RoomInfo[] = []
  private status = 'Connecting to the game list…'
  private waiting: { id: string; name: string } | null = null

  constructor() {
    this.root = document.createElement('div')
    this.root.id = 'menu'
    const cards = RACE_IDS.map((id) => {
      const race = getRace(id)
      return `<button type="button" data-race="${id}" class="${id === this.race ? 'selected' : ''}"><strong>${race.name}</strong><span>${race.blurb}</span></button>`
    }).join('')
    this.root.innerHTML = `
      <aside class="lobby-side">
        <h2>Open games</h2>
        <p class="lobby-status"></p>
        <ul class="game-list"></ul>
        <p class="lobby-hint">Name a game, then a friend on this same address can click it to join.</p>
      </aside>
      <div class="panel">
        <h1>Realm Wars</h1>
        <p class="lead">Pick a people, then create an online game or fight the computer.</p>
        <div class="races">${cards}</div>
        <div class="diffs">
          <button type="button" data-diff="easy"><strong>Easy</strong><span>The enemy builds and attacks slowly.</span></button>
          <button type="button" data-diff="normal" class="selected"><strong>Normal</strong><span>A steady opponent.</span></button>
          <button type="button" data-diff="hard"><strong>Hard</strong><span>The enemy builds and attacks quickly.</span></button>
        </div>
        <div class="create-row">
          <input id="game-name" type="text" maxlength="24" placeholder="Name your game" autocomplete="off" />
          <button id="create-game" type="button">Create Game</button>
        </div>
        <p class="wait-note hidden"></p>
        <button id="start-battle" type="button">Play vs Computer</button>
        <p class="help">Click or tap to select. Use the on-screen command buttons, or right-click for quick commands. On phones, tap the minimap to move the view.</p>
      </div>
    `
    document.body.appendChild(this.root)
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      if (!button) return
      const race = button.dataset.race as RaceId | undefined
      const diff = button.dataset.diff as Difficulty | undefined
      const join = button.dataset.join
      if (race) {
        this.race = race
        this.mark('data-race', race)
      }
      if (diff) {
        this.difficulty = diff
        this.mark('data-diff', diff)
      }
      if (join) this.onJoin(join, this.race)
      if (button.id === 'create-game') this.submitCreate()
      if (button.id === 'cancel-wait') this.onCancelWait()
      if (button.id === 'start-battle') this.onVsComputer(this.race, this.difficulty)
    })
    this.root.querySelector('#game-name')?.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') this.submitCreate()
    })
    this.paint()
  }

  setLobby(rooms: RoomInfo[], status: string, waiting: { id: string; name: string } | null): void {
    this.rooms = rooms
    this.status = status
    this.waiting = waiting
    this.paint()
  }

  show(): void {
    this.root.classList.remove('hidden')
  }

  hide(): void {
    this.root.classList.add('hidden')
  }

  private submitCreate(): void {
    const input = this.root.querySelector('#game-name') as HTMLInputElement
    const name = input.value.trim() || `${getRace(this.race).name} battle`
    input.value = name
    this.onCreate(name, this.race)
  }

  private paint(): void {
    const status = this.root.querySelector('.lobby-status')
    const list = this.root.querySelector('.game-list')
    const wait = this.root.querySelector('.wait-note')
    const create = this.root.querySelector('#create-game') as HTMLButtonElement | null
    if (status) status.textContent = this.status
    if (list) {
      const open = this.rooms.filter((room) => room.status === 'open')
      if (!open.length) list.innerHTML = `<li class="empty">No games yet. Create one and it will show up here.</li>`
      else {
        list.innerHTML = open.map((room) => {
          const race = getRace(room.hostRace).name
          const label = room.yours ? 'Your game · waiting' : 'Click to join'
          return `<li><button type="button" data-join="${room.id}" ${room.yours ? 'disabled' : ''}><strong>${escapeHtml(room.name)}</strong><span>${race} · ${label}</span></button></li>`
        }).join('')
      }
    }
    if (wait) {
      if (this.waiting) {
        wait.classList.remove('hidden')
        wait.innerHTML = `Waiting for someone to join <strong>${escapeHtml(this.waiting.name)}</strong>. <button id="cancel-wait" type="button">Cancel</button>`
      } else {
        wait.classList.add('hidden')
        wait.innerHTML = ''
      }
    }
    if (create) create.disabled = !!this.waiting
  }

  private mark(attr: string, value: string): void {
    const buttons = this.root.querySelectorAll<HTMLButtonElement>(`button[${attr}]`)
    buttons.forEach((button) => button.classList.toggle('selected', button.getAttribute(attr) === value))
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
