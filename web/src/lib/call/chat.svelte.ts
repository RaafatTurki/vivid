export interface ChatMessage {
  id: string
  senderID: string
  senderName: string
  text: string
  timestamp: number
  own: boolean
}

const MAX_CHAT_CHARS = 4000
const MAX_CHAT_BYTES = 16 << 10

function isValidChatText(text: string): boolean {
  return !!text && Array.from(text).length <= MAX_CHAT_CHARS && new TextEncoder().encode(text).length <= MAX_CHAT_BYTES
}

export interface ChatContext {
  selfPeerID: () => string
  username: () => string
  isConnected: () => boolean
  sendSignal: (type: string, to: string, payload: unknown) => void
}

export class ChatController {
  messages = $state<ChatMessage[]>([])
  open = $state(true)
  unread = $state(0)

  constructor(private readonly ctx: ChatContext) {}

  startCall(): void {
    this.open = true
  }

  reset(): void {
    this.messages = []
    this.open = false
    this.unread = 0
  }

  receiveHistory(history: Array<{ from?: string; payload?: unknown }>): void {
    this.messages = []
    for (const item of history) this.append(item.from || "", item.payload, false)
  }

  send(text: string): void {
    if (!this.ctx.isConnected() || !isValidChatText(text)) return
    const payload = { text, senderName: this.ctx.username(), timestamp: Date.now() }
    this.ctx.sendSignal("chat-message", "", payload)
    this.append(this.ctx.selfPeerID(), payload, false)
  }

  receive(senderID: string, payload: unknown): void {
    this.append(senderID, payload, true)
  }

  toggle(): void {
    this.open = !this.open
    if (this.open) this.unread = 0
  }

  private append(senderID: string, payload: unknown, notify: boolean): void {
    const { text, senderName, timestamp } = payload as { text: string; senderName: string; timestamp: number }
    if (!isValidChatText(text)) return
    this.messages = [...this.messages, {
      id: `${senderID}-${Date.now()}-${Math.random()}`,
      senderID,
      senderName,
      text,
      timestamp,
      own: senderID === this.ctx.selfPeerID(),
    }].slice(-500)
    if (notify && !this.open) this.unread += 1
  }
}
