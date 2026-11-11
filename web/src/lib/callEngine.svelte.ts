import { Signaling } from "./call/signaling"
import type { SignalMessage } from "./call/types"
import { PeerManager } from "./call/peerManager.svelte"
import { MediaController } from "./call/media.svelte"
import { ChatController } from "./call/chat.svelte"
import { cleanString, getMediaErrorMsg } from "./utils"
import type { PeerState } from "./types"

export interface CallEngineHooks {
  onError: (message: string) => void
  /** The server closed the socket before welcoming us (e.g. room full). */
  onRejected: (reason: string) => void
}

export class CallEngine {
  /** Set when the signaling server welcomes us; used for the call timer. */
  joinedAt = $state<number | null>(null)

  readonly media: MediaController
  readonly chat: ChatController
  private readonly peerManager: PeerManager
  private readonly signaling: Signaling

  private selfPeerID = ""
  private iceServers: RTCIceServer[] = []
  private username = ""
  private readonly joinSound = new Audio("/join.opus")

  constructor(private readonly hooks: CallEngineHooks) {
    this.joinSound.preload = "auto"
    this.joinSound.volume = 0.65

    this.media = new MediaController({
      peers: () => this.peerManager.peers.values(),
      renegotiateAll: () => this.peerManager.renegotiateAll(),
      broadcastState: () => this.peerManager.broadcastState(),
      setCameraError: (message) => this.hooks.onError(message),
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
      microphoneMuted: () => this.media.microphoneMuted,
      noiseCancellationEnabled: () => this.media.noiseCancellationEnabled,
      cameraStopped: () => this.media.cameraStopped,
      screenSharing: () => this.media.screenSharing,
      screenStreamID: () => this.media.displayStream?.id || "",
      sendSignal: (type, to, payload) => this.signaling.send(type, to, payload),
    })

    this.signaling = new Signaling({
      onMessage: (message) => this.handleMessage(message),
      onUnwelcomedClose: (reason) => {
        this.leaveRoom()
        this.hooks.onRejected(reason)
      },
      onStatusChange: (reason) => this.hooks.onError(reason),
    })
  }

  get peers() {
    return this.peerManager.peers
  }

  /** Connects to the room using the media already running from the lobby preview. */
  async join(username: string, roomID: string): Promise<boolean> {
    this.username = cleanString(username)
    if (!this.username) {
      this.hooks.onError("Enter your name before joining.")
      return false
    }

    this.leaveRoom()
    try {
      await this.media.startCall()
      this.chat.startCall()
      const url = new URL(signalURL())
      url.searchParams.set("room", roomID)
      await this.signaling.open(url)
      return true
    } catch (error) {
      this.leaveRoom()
      this.hooks.onError(getMediaErrorMsg(error))
      return false
    }
  }

  /** Ends the call and releases the camera and microphone. */
  close(): void {
    this.leaveRoom()
    this.media.stop()
  }

  private leaveRoom(): void {
    this.peerManager.closeAll()
    this.signaling.close()
    this.chat.reset()
    this.selfPeerID = ""
    this.joinedAt = null
  }

  private async handleMessage(message: SignalMessage): Promise<void> {
    switch (message.type) {
      case "welcome":
        this.selfPeerID = message.peerId || ""
        this.iceServers = Array.isArray(message.iceServers) ? message.iceServers : []
        this.joinedAt = Date.now()
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
        this.joinSound.currentTime = 0
        this.joinSound.play().catch(() => {})
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
        this.hooks.onError(message.message || "Signaling error")
        break
      default:
        console.warn("Unknown signaling message", message)
    }
  }
}

function signalURL(): string {
  const { hostname, protocol } = window.location
  if (hostname === "raafat.io" || hostname.endsWith(".raafat.io")) return "wss://api.vivid.raafat.io/v1/ws"
  return `${protocol === "https:" ? "wss:" : "ws:"}//${hostname || "localhost"}:8080/v1/ws`
}
