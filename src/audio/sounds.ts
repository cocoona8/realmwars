export class Sounds {
  private ctx: AudioContext | null = null

  resume(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  play(name: string): void {
    this.resume()
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (name === 'attack') {
      this.noise(0.08, 0.05)
      return
    }
    if (name === 'error') {
      this.tone(150, now, 0.16, 'square', 0.05)
      return
    }
    if (name === 'deposit') {
      this.tone(520, now, 0.07, 'sine', 0.05)
      this.tone(700, now + 0.07, 0.09, 'sine', 0.05)
      return
    }
    if (name === 'complete' || name === 'win') {
      ;[523, 659, 784, 1046].forEach((freq, index) => this.tone(freq, now + index * 0.09, 0.12, 'triangle', 0.06))
      return
    }
    if (name === 'lose') {
      ;[392, 330, 262, 196].forEach((freq, index) => this.tone(freq, now + index * 0.12, 0.16, 'sawtooth', 0.04))
      return
    }
    if (name === 'train') {
      this.tone(420, now, 0.08, 'square', 0.04)
      return
    }
    if (name === 'chop') {
      this.noise(0.05, 0.04)
      this.tone(180, now, 0.06, 'triangle', 0.04)
      return
    }
    if (name === 'mine') {
      this.tone(220, now, 0.07, 'square', 0.03)
      return
    }
    if (name === 'spell') {
      this.tone(520, now, 0.08, 'sine', 0.05)
      this.tone(780, now + 0.06, 0.1, 'sine', 0.04)
      return
    }
    if (name === 'alert') {
      this.tone(320, now, 0.12, 'sawtooth', 0.05)
      this.tone(240, now + 0.14, 0.16, 'sawtooth', 0.05)
      return
    }
    if (name === 'select') {
      this.tone(680, now, 0.05, 'sine', 0.04)
      return
    }
    this.tone(440, now, 0.06, 'sine', 0.05)
  }

  private tone(freq: number, when: number, duration: number, type: OscillatorType, gainValue: number): void {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(gainValue, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(when)
    osc.stop(when + duration + 0.02)
  }

  private noise(duration: number, gainValue: number): void {
    if (!this.ctx) return
    const count = Math.floor(this.ctx.sampleRate * duration)
    const buffer = this.ctx.createBuffer(1, count, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < count; i += 1) data[i] = Math.random() * 2 - 1
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = gainValue
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 800
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.ctx.destination)
    source.start()
  }
}
