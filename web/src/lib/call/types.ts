export interface SignalMessage {
  type: string
  roomId?: string
  peerId?: string
  from?: string
  peers?: string[]
  iceServers?: RTCIceServer[]
  payload?: unknown
  chatHistory?: Array<{ from?: string; payload?: unknown }>
  code?: string
  message?: string
}
