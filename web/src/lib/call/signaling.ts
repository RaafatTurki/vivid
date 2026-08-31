import type { SignalMessage } from "./types"

export interface SignalingHandlers {
  onMessage: (message: SignalMessage) => void | Promise<void>
  onUnwelcomedClose: (reason: string) => void
  onStatusChange: (reason: string) => void
}

export class Signaling {
  private socket: WebSocket | null = null
  private queue: Promise<void> = Promise.resolve()
  private generation = 0
  private welcomed = false
  private leaving = false

  constructor(private readonly handlers: SignalingHandlers) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  open(url: URL): Promise<void> {
    this.generation += 1
    const generation = this.generation
    this.queue = Promise.resolve()
    this.welcomed = false
    this.leaving = false

    return new Promise<void>((resolve, reject) => {
      const candidate = new WebSocket(url)
      let settled = false

      candidate.addEventListener("open", () => {
        settled = true
        this.socket = candidate
        candidate.addEventListener("message", (event: MessageEvent<string>) => this.enqueue(event, candidate, generation))
        candidate.addEventListener("close", (event) => this.handleClose(event, candidate))
        candidate.addEventListener("error", () => this.handleError(candidate))
        resolve()
      }, { once: true })

      candidate.addEventListener("error", () => {
        if (!settled) {
          settled = true
          reject(new Error("The signaling server could not be reached."))
        }
      }, { once: true })

      candidate.addEventListener("close", (event) => {
        if (!settled) {
          settled = true
          reject(new Error(event.reason || "The signaling server closed the connection."))
        }
      }, { once: true })
    })
  }

  send(type: string, to: string, payload: unknown): void {
    if (this.connected) this.socket!.send(JSON.stringify({ type, to, payload }))
  }

  close(): void {
    this.generation += 1
    this.leaving = true
    const current = this.socket
    this.socket = null
    if (current && current.readyState < WebSocket.CLOSING) {
      current.close(1000, "left call")
    }
  }

  private enqueue(event: MessageEvent<string>, socket: WebSocket, generation: number): void {
    if (socket !== this.socket) return
    this.queue = this.queue.then(() => {
      if (generation === this.generation) return this.process(event.data, generation)
    })
  }

  private async process(data: string, generation: number): Promise<void> {
    try {
      const message = JSON.parse(data) as SignalMessage
      if (message.type === "welcome") this.welcomed = true
      await this.handlers.onMessage(message)
    } catch (error) {
      if (generation !== this.generation) return
      console.error("Could not process signaling message", error)
      this.handlers.onStatusChange("Signaling error")
    }
  }

  private handleClose(event: CloseEvent, socket: WebSocket): void {
    if (socket !== this.socket) return
    if (this.leaving) return
    if (!this.welcomed) {
      this.handlers.onUnwelcomedClose(event.reason || "The signaling server closed the connection.")
    }
    this.handlers.onStatusChange(event.reason || "Disconnected")
  }

  private handleError(socket: WebSocket): void {
    if (socket !== this.socket) return
    if (!this.leaving) this.handlers.onStatusChange("Connection problem")
  }
}
