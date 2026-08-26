type Listener = { analyser: AnalyserNode; samples: Float32Array<ArrayBuffer>; quietTicks: number; onChange: (speaking: boolean) => void; speaking: boolean; source: MediaStreamAudioSourceNode }
let context: AudioContext | null = null
let timer: number | null = null
const listeners = new Set<Listener>()

const SPEAKING_THRESHOLD = .025
const QUIET_TICKS_BEFORE_SILENT = 4

function sample(): void {
  for (const listener of listeners) {
    listener.analyser.getFloatTimeDomainData(listener.samples)
    let sum = 0
    for (const value of listener.samples) sum += value * value
    const loud = Math.sqrt(sum / listener.samples.length) > SPEAKING_THRESHOLD
    if (loud) listener.quietTicks = 0
    else listener.quietTicks++
    const next = loud || (listener.speaking && listener.quietTicks < QUIET_TICKS_BEFORE_SILENT)
    if (next !== listener.speaking) { listener.speaking = next; listener.onChange(next) }
  }
}

export function observeVoiceActivity(stream: MediaStream, onChange: (speaking: boolean) => void): () => void {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return () => {}
  context ??= new AudioContextClass()
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = .65
  const source = context.createMediaStreamSource(stream)
  source.connect(analyser)
  context.resume().catch(() => {})
  const listener: Listener = { analyser, samples: new Float32Array(analyser.fftSize), quietTicks: 0, onChange, speaking: false, source }
  listeners.add(listener)
  timer ??= window.setInterval(sample, 80)
  return () => {
    listeners.delete(listener)
    source.disconnect()
    onChange(false)
    if (listeners.size === 0) {
      if (timer !== null) window.clearInterval(timer)
      timer = null
      const activeContext = context
      context = null
      activeContext?.close().catch(() => {})
    }
  }
}
