import { Signaling } from "./call/signaling"
import type { SignalMessage } from "./call/types"
import { PeerManager } from "./call/peerManager.svelte"
import { MediaController } from "./call/media.svelte"
import { ChatController } from "./call/chat.svelte"
import { cleanString, getMediaErrorMsg } from "./utils"
import type { PeerState } from "./types"
import { ConnectionStatus, DeviceType } from "./types"

export type { ChatMessage } from "./call/chat.svelte"

export interface CallEngineHooks {
  isOnCallPage: () => boolean
  onStatus?: (state: ConnectionStatus, text: string) => void
  onJoined?: () => void
  onSetupError?: (message: string) => void
  onCameraError?: (message: string) => void
}

export interface JoinOptions {
  username: string
  deviceType: DeviceType
  joinWithAudio: boolean
  joinWithVideo: boolean
}

export class CallEngine {
  deviceType = $state<DeviceType>(DeviceType.COMPUTER)

  readonly media: MediaController
  readonly chat: ChatController
  private readonly peerManager: PeerManager
  private readonly signaling: Signaling

  private selfPeerID = ""
  private iceServers: RTCIceServer[] = []
  private username = ""
  private joinSound: HTMLAudioElement | null = null

  private readonly hooks: CallEngineHooks

  constructor(hooks: CallEngineHooks) {
    this.hooks = hooks

    this.media = new MediaController({
      peers: () => this.peerManager.peers.values(),
      renegotiateAll: () => this.peerManager.renegotiateAll(),
      broadcastState: () => this.peerManager.broadcastState(),
      setCameraError: (message) => this.setCameraError(message),
    })

    this.chat = new ChatController({
      selfPeerID: () => this.selfPeerID,
      username: () => this.username,
      isConnected: () => this.signaling.connected,
      sendSignal: (type, to, payload) => this.signaling.send(type, to, payload),
    })

    this.peerManager = new PeerManager({
      selfPeerID: () => this.selfPeerID,
      iceServers: () => this.iceServers,
      localStream: () => this.media.localStream,
      outboundAudioTrack: () => this.media.processedAudioTrack,
      screenShare: () => this.media.screenShare,
      username: () => this.username,
      deviceType: () => this.deviceType,
      microphoneMuted: () => this.media.microphoneMuted,
      noiseCancellationEnabled: () => this.media.noiseCancellationEnabled,
      cameraStopped: () => this.media.cameraStopped,
      screenSharing: () => this.media.screenSharing,
      screenStreamID: () => this.media.displayStream?.id || "",
      sendSignal: (type, to, payload) => this.signaling.send(type, to, payload),
      onPeerCountChanged: (totalInCall) => {
        this.emitStatus(ConnectionStatus.CONNECTED, totalInCall ? `${totalInCall} people in call` : "Connected")
      },
    })

    this.signaling = new Signaling({
      onMessage: (message) => this.handleMessage(message),
      onUnwelcomedClose: (reason) => {
        this.closeConnections()
        if (this.hooks.isOnCallPage()) this.hooks.onCameraError?.(reason)
        else this.hooks.onSetupError?.(reason)
      },
      onStatusChange: (reason) => this.emitStatus(ConnectionStatus.ERROR, reason),
    })
  }

  get peers() {
    return this.peerManager.peers
  }

  prepareJoinSound(): void {
    this.joinSound = new Audio("/join.opus")
    this.joinSound.preload = "auto"
    this.joinSound.volume = 0.65
  }

  destroyJoinSound(): void {
    this.joinSound = null
  }

  async join(options: JoinOptions, signalInput: string, roomID: string): Promise<boolean> {
    this.username = cleanString(options.username)
    this.deviceType = options.deviceType

    if (!this.username) {
      this.hooks.onSetupError?.("Enter your name before joining.")
      return false
    }

    if (!/^[A-Za-z0-9]{6}$/.test(roomID)) {
      this.hooks.onSetupError?.("Room IDs must be exactly 6 letters or numbers.")
      return false
    }

    let signalURL: URL
    try {
      signalURL = new URL(signalInput.trim())
      if (signalURL.protocol !== "ws:" && signalURL.protocol !== "wss:") {
        throw new Error("unsupported protocol")
      }
    } catch {
      this.hooks.onSetupError?.("Enter a valid ws:// or wss:// signaling URL.")
      return false
    }

    this.closeConnections()
    this.setCameraError("")

    this.emitStatus(ConnectionStatus.CONNECTING, "Preparing call")

    try {
      await this.media.startCall(options.joinWithAudio, options.joinWithVideo)
      this.chat.startCall()

      signalURL.searchParams.set("room", roomID)
      await this.signaling.open(signalURL)

      this.hooks.onJoined?.()
      this.emitStatus(ConnectionStatus.CONNECTING, "Joining room")
      return true
    } catch (error) {
      this.closeConnections()
      this.emitStatus(ConnectionStatus.ERROR, "Could not join")
      const message = getMediaErrorMsg(error)
      if (this.hooks.isOnCallPage()) this.hooks.onCameraError?.(message)
      else this.hooks.onSetupError?.(message)
      return false
    }
  }

  resetCallUI(): void {
    this.selfPeerID = ""
    this.media.resetUI()
    this.setCameraError("")
    this.emitStatus(ConnectionStatus.IDLE, "Ready to rejoin")
  }

  close(): void {
    this.closeConnections()
  }

  togglePeerPlayback(peerID: string): void {
    this.peerManager.togglePlayback(peerID)
  }

  async refreshMediaDevices(): Promise<void> {
    await this.media.refreshDevices()
  }

  private async handleMessage(message: SignalMessage): Promise<void> {
    switch (message.type) {
      case "welcome":
        this.selfPeerID = message.peerId || ""
        this.iceServers = Array.isArray(message.iceServers) ? message.iceServers : []
        this.emitStatus(ConnectionStatus.CONNECTED, "Connected")
        this.chat.receiveHistory(message.chatHistory ?? [])
        for (const peerID of message.peers ?? []) {
          this.peerManager.createPeer(peerID)
          this.peerManager.sendState(peerID)
          this.signaling.send("peer-ready", peerID, true)
        }
        break
      case "chat-message":
        this.chat.receive(message.from || "", message.payload)
        break
      case "peer-joined":
        if (!message.peerId) break
        this.peerManager.createPeer(message.peerId)
        this.peerManager.sendState(message.peerId)
        this.playJoinSound()
        break
      case "peer-state":
        if (message.from) this.peerManager.receiveState(message.from, message.payload as PeerState)
        break
      case "peer-ready":
        if (message.from) await this.peerManager.sendOffer(message.from)
        break
      case "peer-left":
        if (message.peerId) this.peerManager.removePeer(message.peerId)
        break
      case "offer":
        if (message.from) await this.peerManager.receiveOffer(message.from, message.payload as RTCSessionDescriptionInit)
        break
      case "answer":
        if (message.from) await this.peerManager.receiveAnswer(message.from, message.payload as RTCSessionDescriptionInit)
        break
      case "ice-candidate":
        if (message.from) await this.peerManager.receiveCandidate(message.from, message.payload as RTCIceCandidateInit)
        break
      case "error":
        this.emitStatus(ConnectionStatus.ERROR, message.message || "Signaling error")
        break
      default:
        console.warn("Unknown signaling message", message)
    }
  }

  private emitStatus(state: ConnectionStatus, text: string): void {
    this.hooks.onStatus?.(state, text)
  }

  private setCameraError(message: string): void {
    this.hooks.onCameraError?.(message)
  }

  private playJoinSound(): void {
    if (!this.joinSound) return
    this.joinSound.currentTime = 0
    this.joinSound.play().catch(() => {})
  }

  private closeConnections(): void {
    this.peerManager.closeAll()
    this.signaling.close()
    this.media.stop()
    this.chat.reset()
  }
}
