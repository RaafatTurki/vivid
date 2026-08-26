import { SvelteMap } from "svelte/reactivity"
import type { NoiseSuppression } from "./noiseSuppression"
import {
  asError,
  cleanString,
  createCameraConstraints,
  getCameraErrorMsg,
  getMediaErrorMsg,
  getScreenShareErrorMsg,
  getUserMediaWithRetry,
  createMicrophoneConstraints,
  createVideoConstraints,
} from "./utils"
import type { MediaDeviceOption, Peer, PeerState } from "./types"
import { ConnectionStatus, DeviceType } from "./types"

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

export interface ChatMessage {
  id: string
  senderID: string
  senderName: string
  text: string
  timestamp: number
  own: boolean
}

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
  readonly peers = new SvelteMap<string, Peer>()
  localStream = $state<MediaStream | null>(null)
  displayStream = $state<MediaStream | null>(null)
  microphoneMuted = $state(false)
  noiseCancellationEnabled = $state(true)
  cameraStopped = $state(false)
  cameraFacing = $state<VideoFacingModeEnum>("user")
  canSwitchCamera = $state(false)
  switchingCamera = $state(false)
  audioDevices = $state<MediaDeviceOption[]>([])
  videoDevices = $state<MediaDeviceOption[]>([])
  selectedAudioDeviceID = $state("")
  selectedVideoDeviceID = $state("")
  switchingAudioDevice = $state(false)
  switchingVideoDevice = $state(false)
  canShareScreen = $state(false)
  screenSharing = $state(false)
  sharingScreen = $state(false)
  chatOpen = $state(true)
  unreadChatMessages = $state(0)
  chatMessages = $state<ChatMessage[]>([])
  deviceType = $state<DeviceType>(DeviceType.COMPUTER)

  private socket: WebSocket | null = null
  private selfPeerID = ""
  private iceServers: RTCIceServer[] = []
  private leaving = false
  private welcomed = false
  private signalQueue = Promise.resolve()
  private callEpoch = 0
  private joinSound: HTMLAudioElement | null = null
  private cameraTrack: MediaStreamTrack | null = null
  private displayTrack: MediaStreamTrack | null = null
  processedAudioTrack = $state<MediaStreamTrack | null>(null)
  private noiseSuppression: NoiseSuppression | null = null
  private noiseSuppressionLoad: Promise<NoiseSuppression> | null = null

  private readonly hooks: CallEngineHooks
  private username = ""
  private joinWithAudio = true
  private joinWithVideo = true

  constructor(hooks: CallEngineHooks) {
    this.hooks = hooks
    this.canShareScreen = typeof navigator.mediaDevices?.getDisplayMedia === "function"
  }

  prepareJoinSound(): void {
    this.joinSound = new Audio("/join.opus")
    this.joinSound.preload = "auto"
    this.joinSound.volume = 0.65
  }

  destroyJoinSound(): void {
    this.joinSound = null
  }

  private emitStatus(state: ConnectionStatus, text: string): void {
    this.hooks.onStatus?.(state, text)
  }

  private setCameraError(message: string): void {
    this.hooks.onCameraError?.(message)
  }

  async join(options: JoinOptions, signalInput: string, roomID: string): Promise<boolean> {
    this.username = cleanString(options.username)
    this.deviceType = options.deviceType
    this.joinWithAudio = options.joinWithAudio
    this.joinWithVideo = options.joinWithVideo

    if (!this.username) {
      this.hooks.onSetupError?.("Enter your name before joining.")
      return false
    }

    if (!/^[A-Za-z0-9]{6}$/.test(roomID)) {
      this.hooks.onSetupError?.("Room IDs must be exactly 6 letters or numbers.")
      return false
    }

    let signalURL
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
    this.leaving = false
    this.welcomed = false
    this.callEpoch += 1
    this.signalQueue = Promise.resolve()

    this.emitStatus(ConnectionStatus.CONNECTING, "Preparing call")

    try {
      this.localStream = await this.acquireCallMedia()
      await this.updateNoiseCancellation()
      this.cameraTrack = this.localStream.getVideoTracks()[0] || null
      this.microphoneMuted = !this.joinWithAudio
      this.cameraStopped = !this.joinWithVideo
      this.chatOpen = true
      this.cameraFacing = this.trackFacing(this.localStream.getVideoTracks()[0], this.cameraFacing)
      await this.refreshMediaDevices()

      signalURL.searchParams.set("room", roomID)
      await this.openSignalingSocket(signalURL)

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

  private async acquireCallMedia(): Promise<MediaStream> {
    if (!this.joinWithAudio && !this.joinWithVideo) return new MediaStream()
    return getUserMediaWithRetry(
      {
        audio: this.joinWithAudio ? createMicrophoneConstraints() : false,
        video: this.joinWithVideo ? createVideoConstraints(this.cameraFacing) : false,
      },
      { audio: this.joinWithAudio ? createMicrophoneConstraints() : false, video: this.joinWithVideo },
    )
  }

  resetCallUI(): void {
    this.welcomed = false
    this.selfPeerID = ""
    this.microphoneMuted = false
    this.cameraStopped = false
    this.screenSharing = false
    this.sharingScreen = false
    this.setCameraError("")
    this.emitStatus(ConnectionStatus.IDLE, "Ready to rejoin")
  }

  close(): void {
    this.leaving = true
    this.closeConnections()
  }


  private openSignalingSocket(url: URL): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const candidate = new WebSocket(url)
      let settled = false

      candidate.addEventListener("open", () => {
        settled = true
        this.socket = candidate
        candidate.addEventListener("message", this.queueSignalMessage)
        candidate.addEventListener("close", this.onSocketClose)
        candidate.addEventListener("error", this.onSocketError)
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

  private queueSignalMessage = (event: MessageEvent<string>): void => {
    if (event.currentTarget !== this.socket) return
    const epoch = this.callEpoch
    this.signalQueue = this.signalQueue.then(() => {
      if (epoch === this.callEpoch) return this.onSignalMessage(event, epoch)
    })
  }

  private async onSignalMessage(event: MessageEvent<string>, epoch: number): Promise<void> {
    try {
      const message = JSON.parse(event.data) as SignalMessage
      switch (message.type) {
        case "welcome":
          this.welcomed = true
          this.selfPeerID = message.peerId || ""
          this.iceServers = Array.isArray(message.iceServers) ? message.iceServers : []
          this.emitStatus(ConnectionStatus.CONNECTED, "Connected")
          this.chatMessages = []
          for (const item of message.chatHistory ?? []) this.appendChatMessage(item.from || "", item.payload, false)
          for (const peerID of message.peers ?? []) {
            this.createPeer(peerID)
            this.sendPeerState(peerID)
            this.sendSignal("peer-ready", peerID, true)
          }
          break
        case "chat-message":
          this.appendChatMessage(message.from || "", message.payload, true)
          break
        case "peer-joined":
          if (!message.peerId) break
          this.createPeer(message.peerId)
          this.sendPeerState(message.peerId)
          this.playJoinSound()
          break
        case "peer-state":
          if (message.from) this.receivePeerState(message.from, message.payload as PeerState)
          break
        case "peer-ready":
          if (message.from) await this.sendOffer(message.from)
          break
        case "peer-left":
          if (message.peerId) this.removePeer(message.peerId)
          break
        case "offer":
          if (message.from) await this.receiveOffer(message.from, message.payload as RTCSessionDescriptionInit)
          break
        case "answer":
          if (message.from) await this.receiveAnswer(message.from, message.payload as RTCSessionDescriptionInit)
          break
        case "ice-candidate":
          if (message.from) await this.receiveCandidate(message.from, message.payload as RTCIceCandidateInit)
          break
        case "error":
          this.emitStatus(ConnectionStatus.ERROR, message.message || "Signaling error")
          break
        default:
          console.warn("Unknown signaling message", message)
      }
    } catch (error) {
      if (epoch !== this.callEpoch) return
      console.error("Could not process signaling message", error)
      this.emitStatus(ConnectionStatus.ERROR, "Signaling error")
    }
  }

  private onSocketClose = (event: CloseEvent): void => {
    if (event.currentTarget !== this.socket) return
    if (this.leaving) return
    if (!this.welcomed) {
      this.closeConnections()
      const message = event.reason || "The signaling server closed the connection."
      if (this.hooks.isOnCallPage()) this.hooks.onCameraError?.(message)
      else this.hooks.onSetupError?.(message)
    }
    this.emitStatus(ConnectionStatus.ERROR, event.reason || "Disconnected")
  }

  private onSocketError = (event: Event): void => {
    if (event.currentTarget !== this.socket) return
    if (!this.leaving) this.emitStatus(ConnectionStatus.ERROR, "Connection problem")
  }


  private createPeer(peerID: string): Peer {
    if (!peerID) throw new Error("Peer ID is required")
    const existing = this.peers.get(peerID)
    if (existing) return existing
    if (!this.localStream) throw new Error("Local media is not ready")
    const stream = this.localStream

    const connection = new RTCPeerConnection({ iceServers: this.iceServers })
    const peer: Peer = {
      id: peerID,
      name: `Guest ${peerID.slice(0, 6)}`,
      device: DeviceType.COMPUTER,
      microphoneMuted: false,
      noiseCancellationEnabled: true,
      cameraStopped: false,
      screenSharing: false,
      connection,
      stream: null,
      screenStream: null,
      cameraStreamID: "",
      screenStreamID: "",
      streams: new Map(),
      cameraSender: null,
      microphoneSender: null,
      screenSenders: [],
      locallyMuted: false,
      renegotiate: false,
      makingOffer: false,
      ignoreOffer: false,
      polite: this.selfPeerID > peerID,
      pendingCandidates: [],
    }
    this.peers.set(peerID, peer)

    for (const track of stream.getTracks()) {
      const outboundTrack = track.kind === "audio" ? this.processedAudioTrack || track : track
      const sender = connection.addTrack(outboundTrack, stream)
      if (track.kind === "video") peer.cameraSender = sender
      if (track.kind === "audio") peer.microphoneSender = sender
    }
    if (stream.getAudioTracks().length === 0) {
      connection.addTransceiver("audio", { direction: "recvonly" })
    }
    if (stream.getVideoTracks().length === 0) {
      connection.addTransceiver("video", { direction: "recvonly" })
    }
    if (this.screenSharing && this.displayStream && this.displayTrack) {
      peer.screenSenders = [connection.addTrack(this.displayTrack, this.displayStream)]
      const screenAudioTrack = this.displayStream.getAudioTracks()[0]
      if (screenAudioTrack) peer.screenSenders.push(connection.addTrack(screenAudioTrack, this.displayStream))
    }

    connection.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate) this.sendSignal("ice-candidate", peerID, candidate.toJSON())
    })

    connection.addEventListener("track", (event) => {
      const currentPeer = this.peers.get(peerID)
      if (!currentPeer) return
      if (event.streams[0]) {
        currentPeer.streams.set(event.streams[0].id, event.streams[0])
        if (!currentPeer.cameraStreamID && (
          !currentPeer.screenSharing || event.streams[0].id !== currentPeer.screenStreamID
        )) {
          currentPeer.cameraStreamID = event.streams[0].id
        }
      } else {
        const stream = currentPeer.stream || new MediaStream()
        stream.addTrack(event.track)
        currentPeer.streams.set(stream.id, stream)
        if (!currentPeer.cameraStreamID) currentPeer.cameraStreamID = stream.id
      }
      this.updatePeerStreams(currentPeer)
      this.peers.set(peerID, { ...currentPeer })
    })

    connection.addEventListener("connectionstatechange", () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        this.removePeer(peerID)
      } else if (connection.connectionState === "connected") {
        this.emitStatus(ConnectionStatus.CONNECTED, `${this.peers.size + 1} people in call`)
      }
    })

    return peer
  }


  private async sendOffer(peerID: string): Promise<void> {
    const peer = this.createPeer(peerID)
    if (peer.connection.signalingState !== "stable") {
      peer.renegotiate = true
      return
    }
    peer.renegotiate = false
    peer.makingOffer = true
    try {
      const offer = await peer.connection.createOffer()
      await peer.connection.setLocalDescription(offer)
      this.sendSignal("offer", peerID, peer.connection.localDescription!.toJSON())
    } finally {
      peer.makingOffer = false
    }
  }

  private async receiveOffer(peerID: string, description: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.createPeer(peerID)
    const collision = peer.makingOffer || peer.connection.signalingState !== "stable"
    peer.ignoreOffer = !peer.polite && collision
    if (peer.ignoreOffer) return
    if (collision) {
      peer.renegotiate = true
      await peer.connection.setLocalDescription({ type: "rollback" })
    }
    await peer.connection.setRemoteDescription(description)
    await this.flushCandidates(peer)
    const answer = await peer.connection.createAnswer()
    await peer.connection.setLocalDescription(answer)
    this.sendSignal("answer", peerID, peer.connection.localDescription!.toJSON())
    if (peer.renegotiate) await this.sendOffer(peerID)
  }

  private async receiveAnswer(peerID: string, description: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(peerID)
    if (!peer) throw new Error(`Answer received for unknown peer ${peerID}`)
    if (peer.connection.signalingState !== "have-local-offer") return
    await peer.connection.setRemoteDescription(description)
    await this.flushCandidates(peer)
    if (peer.renegotiate) await this.sendOffer(peerID)
  }

  private async receiveCandidate(peerID: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.createPeer(peerID)
    try {
      if (peer.connection.remoteDescription) {
        await peer.connection.addIceCandidate(candidate)
      } else {
        peer.pendingCandidates.push(candidate)
      }
    } catch (error) {
      if (!peer.ignoreOffer) throw error
    }
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate)
    }
  }

  private sendSignal(type: string, to: string, payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, to, payload }))
    }
  }

  private removePeer(peerID: string): void {
    const peer = this.peers.get(peerID)
    if (!peer) return
    this.peers.delete(peerID)
    peer.connection.close()
    this.emitStatus(ConnectionStatus.CONNECTED, this.peers.size ? `${this.peers.size + 1} people in call` : "Connected")
  }

  private async renegotiatePeers(): Promise<void> {
    for (const peerID of this.peers.keys()) await this.sendOffer(peerID)
  }


  sendChat(text: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    if (!text || Array.from(text).length > 4000 || new TextEncoder().encode(text).length > 16 * 1024) return
    const payload = { text, senderName: this.username, timestamp: Date.now() }
    this.sendSignal("chat-message", "", payload)
    this.appendChatMessage(this.selfPeerID, payload, false)
  }

  private appendChatMessage(senderID: string, payload: unknown, notify: boolean): void {
    const text = typeof payload === "object" && payload !== null && "text" in payload && typeof payload.text === "string" ? payload.text : ""
    const senderName = typeof payload === "object" && payload !== null && "senderName" in payload && typeof payload.senderName === "string" ? payload.senderName : "Guest"
    const timestamp = typeof payload === "object" && payload !== null && "timestamp" in payload && typeof payload.timestamp === "number" ? payload.timestamp : Date.now()
    if (!text || Array.from(text).length > 4000 || new TextEncoder().encode(text).length > 16 * 1024) return
    this.chatMessages = [...this.chatMessages, { id: `${senderID}-${Date.now()}-${Math.random()}`, senderID, senderName, text, timestamp, own: senderID === this.selfPeerID }].slice(-500)
    if (notify && !this.chatOpen) {
      this.unreadChatMessages += 1
    }
  }

  toggleChat(): void {
    this.chatOpen = !this.chatOpen
    if (this.chatOpen) {
      this.unreadChatMessages = 0
    }
  }

  togglePeerPlayback(peerID: string): void {
    const peer = this.peers.get(peerID)
    if (!peer) return
    peer.locallyMuted = !peer.locallyMuted
    this.peers.set(peerID, { ...peer })
  }

  private sendPeerState(peerID: string): void {
    this.sendSignal("peer-state", peerID, {
      name: this.username,
      device: this.deviceType,
      microphoneMuted: this.microphoneMuted,
      noiseCancellationEnabled: this.noiseCancellationEnabled,
      cameraStopped: this.cameraStopped,
      screenSharing: this.screenSharing,
      screenStreamID: this.displayStream?.id || "",
    })
  }

  private broadcastPeerState(): void {
    for (const peerID of this.peers.keys()) this.sendPeerState(peerID)
  }

  private receivePeerState(peerID: string, state: PeerState): void {
    const peer = this.createPeer(peerID)
    peer.name = cleanString(state?.name) || peer.name
    peer.device = state?.device === DeviceType.MOBILE ? DeviceType.MOBILE : DeviceType.COMPUTER
    peer.microphoneMuted = state?.microphoneMuted === true
    peer.noiseCancellationEnabled = state?.noiseCancellationEnabled !== false
    peer.cameraStopped = state?.cameraStopped === true
    peer.screenSharing = state?.screenSharing === true
    peer.screenStreamID = typeof state?.screenStreamID === "string" ? state.screenStreamID.slice(0, 128) : ""
    this.updatePeerStreams(peer)
    this.peers.set(peerID, { ...peer })
  }

  private updatePeerStreams(peer: Peer): void {
    const streams = [...peer.streams.values()]
    const claimedScreen = streams.find(({ id }) => id === peer.screenStreamID) || null
    peer.stream = streams.find(({ id }) => id === peer.cameraStreamID)
      || streams.find(stream => stream !== claimedScreen && stream.getAudioTracks().length > 0)
      || streams.find(stream => stream !== claimedScreen)
      || null
    if (peer.stream && !peer.cameraStreamID) peer.cameraStreamID = peer.stream.id
    peer.screenStream = peer.screenSharing
      ? claimedScreen || streams.find(stream => stream !== peer.stream && stream.getVideoTracks().length > 0) || null
      : null
  }


  private async swapTrack(
    kind: "audio" | "video",
    newTrack: MediaStreamTrack | null,
    localStreamForAdd: MediaStream,
  ): Promise<void> {
    const replacements: Promise<void>[] = []
    let addedSender = false
    for (const peer of this.peers.values()) {
      const sender = kind === "video" ? peer.cameraSender : peer.microphoneSender
      if (sender) {
        replacements.push(sender.replaceTrack(newTrack))
      } else if (newTrack) {
        const computed = peer.connection.addTrack(newTrack, localStreamForAdd)
        if (kind === "video") peer.cameraSender = computed
        else peer.microphoneSender = computed
        addedSender = true
      }
    }
    await Promise.all(replacements)
    if (addedSender) await this.renegotiatePeers()
  }

  async toggleMicrophone(): Promise<void> {
    const track = this.localStream?.getAudioTracks()[0]
    if (!track) {
      await this.enableMicrophone()
      return
    }
    track.enabled = !track.enabled
    this.microphoneMuted = !track.enabled
    this.broadcastPeerState()
  }

  async toggleCamera(): Promise<void> {
    const track = this.cameraTrack
    if (!track) {
      await this.enableCamera()
      return
    }
    track.enabled = !track.enabled
    this.cameraStopped = !track.enabled
    this.broadcastPeerState()
  }

  async enableMicrophone(): Promise<void> {
    this.setCameraError("")
    try {
      const audio = createMicrophoneConstraints(this.selectedAudioDeviceID)
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
      const track = stream.getAudioTracks()[0]
      if (!track) throw new Error("No microphone was available.")
      if (!this.localStream) throw new Error("The call is no longer active.")
      track.enabled = true
      if (this.noiseCancellationEnabled) await this.updateNoiseCancellation(track)
      this.localStream = new MediaStream([track, ...this.localStream.getVideoTracks()])
      await this.swapTrack("audio", this.processedAudioTrack || track, this.localStream)
      this.microphoneMuted = false
      this.broadcastPeerState()
      await this.refreshMediaDevices()
    } catch (error) {
      this.setCameraError(asError(error).message || "Could not start the microphone.")
    }
  }

  async enableCamera(): Promise<void> {
    this.setCameraError("")
    try {
      const video = this.selectedVideoDeviceID
        ? createCameraConstraints(this.selectedVideoDeviceID)
        : createVideoConstraints(this.cameraFacing)
      const stream = await getUserMediaWithRetry(
        { audio: false, video },
        { audio: false, video: this.selectedVideoDeviceID ? undefined : true },
      )
      const track = stream.getVideoTracks()[0]
      if (!track) throw new Error("No camera was available.")
      if (!this.localStream) throw new Error("The call is no longer active.")
      track.enabled = true
      this.localStream = new MediaStream([...this.localStream.getAudioTracks(), track])
      this.cameraTrack = track
      await this.swapTrack("video", track, this.localStream)
      this.cameraFacing = this.trackFacing(track, this.cameraFacing)
      this.cameraStopped = false
      this.broadcastPeerState()
      await this.refreshMediaDevices()
    } catch (error) {
      this.setCameraError(getCameraErrorMsg(error))
    }
  }


  async switchCamera(): Promise<void> {
    const oldTrack = this.cameraTrack
    if (!oldTrack || this.switchingCamera) return

    this.switchingCamera = true
    this.setCameraError("")
    const previousFacing = this.cameraFacing
    const nextFacing = previousFacing === "environment" ? "user" : "environment"
    const wasEnabled = oldTrack.enabled
    let oldTrackStopped = false

    try {
      let cameraStream
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: createVideoConstraints(nextFacing, true),
        })
      } catch (error) {
        const issue = asError(error)
        if (issue.name !== "NotReadableError" && issue.name !== "AbortError") throw error
        oldTrack.stop()
        oldTrackStopped = true
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: createVideoConstraints(nextFacing, true),
        })
      }

      const newTrack = cameraStream.getVideoTracks()[0]
      if (!newTrack) throw new Error("The selected camera did not provide video.")
      newTrack.enabled = wasEnabled
      await this.replaceVideoTrack(newTrack)
      this.cameraTrack = newTrack
      if (!oldTrackStopped) oldTrack.stop()
      this.cameraFacing = this.trackFacing(newTrack, nextFacing)
      this.cameraStopped = !newTrack.enabled
      await this.refreshMediaDevices()
    } catch (error) {
      if (oldTrackStopped) await this.restoreCamera(previousFacing, wasEnabled)
      this.setCameraError(getCameraErrorMsg(error))
    } finally {
      this.switchingCamera = false
    }
  }

  private async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (!this.localStream) throw new Error("The call is no longer active.")
    this.localStream = new MediaStream([
      ...this.localStream.getAudioTracks(),
      newTrack,
    ])
    await this.swapTrack("video", newTrack, this.localStream)
  }

  private async restoreCamera(facingMode: VideoFacingModeEnum, enabled: boolean): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: createVideoConstraints(facingMode) })
      const track = stream.getVideoTracks()[0]
      if (!track) return
      track.enabled = enabled
      await this.replaceVideoTrack(track)
      this.cameraTrack = track
      this.cameraFacing = this.trackFacing(track, facingMode)
    } catch (error) {
      console.error("Could not restore the previous camera", error)
    }
  }

  async changeAudioDevice(deviceID: string): Promise<void> {
    if (!deviceID || this.switchingAudioDevice || !this.localStream) return
    this.switchingAudioDevice = true
    this.setCameraError("")
    let newTrack = null
    let oldTrack = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: createMicrophoneConstraints(deviceID), video: false })
      newTrack = stream.getAudioTracks()[0]
      if (!newTrack) throw new Error("The selected microphone did not provide audio.")

      oldTrack = this.localStream.getAudioTracks()[0]
      newTrack.enabled = oldTrack?.enabled ?? true
      if (this.noiseCancellationEnabled) await this.updateNoiseCancellation(newTrack)
      this.localStream = new MediaStream([newTrack, ...this.localStream.getVideoTracks()])

      await this.swapTrack("audio", this.processedAudioTrack || newTrack, this.localStream)
      oldTrack?.stop()
      this.selectedAudioDeviceID = newTrack.getSettings().deviceId || deviceID
      await this.refreshMediaDevices()
    } catch (error) {
      if (newTrack && this.localStream?.getTracks().includes(newTrack)) {
        await this.swapTrack("audio", newTrack, this.localStream).catch(() => {})
        oldTrack?.stop()
      }
      if (newTrack && !this.localStream?.getTracks().includes(newTrack)) newTrack.stop()
      this.setCameraError(asError(error).message || "Could not switch microphones.")
    } finally {
      this.switchingAudioDevice = false
    }
  }

  async changeVideoDevice(deviceID: string): Promise<void> {
    if (!deviceID || this.switchingVideoDevice || !this.localStream) return
    this.switchingVideoDevice = true
    this.setCameraError("")
    let newTrack = null

    try {
      const stream = await getUserMediaWithRetry(
        { audio: false, video: createCameraConstraints(deviceID) },
        { audio: false, video: { deviceId: { exact: deviceID } } },
      )
      newTrack = stream.getVideoTracks()[0]
      if (!newTrack) throw new Error("The selected camera did not provide video.")

      const oldTrack = this.cameraTrack
      newTrack.enabled = oldTrack?.enabled ?? true
      await this.replaceVideoTrack(newTrack)
      this.cameraTrack = newTrack
      oldTrack?.stop()
      this.cameraFacing = this.trackFacing(newTrack, this.cameraFacing)
      this.selectedVideoDeviceID = newTrack.getSettings().deviceId || deviceID
      await this.refreshMediaDevices()
    } catch (error) {
      if (newTrack && newTrack !== this.cameraTrack) newTrack.stop()
      this.setCameraError(getCameraErrorMsg(error))
    } finally {
      this.switchingVideoDevice = false
    }
  }


  async toggleNoiseCancellation(): Promise<void> {
    this.noiseCancellationEnabled = !this.noiseCancellationEnabled
    if (this.noiseCancellationEnabled) {
      await this.updateNoiseCancellation()
    } else {
      this.processedAudioTrack?.stop()
      this.processedAudioTrack = null
      await this.noiseSuppression?.stop()
      this.noiseSuppression = null
    }
    this.broadcastPeerState()
    await this.swapTrack(
      "audio",
      this.noiseCancellationEnabled ? this.processedAudioTrack : this.localStream?.getAudioTracks()[0] || null,
      this.localStream!,
    )
  }

  private async updateNoiseCancellation(track = this.localStream?.getAudioTracks()[0] || null): Promise<void> {
    if (!track || !this.noiseCancellationEnabled) return
    try {
      this.noiseSuppression ??= await this.loadNoiseSuppression()
      this.processedAudioTrack?.stop()
      this.processedAudioTrack = await this.noiseSuppression.start(track)
    } catch (error) {
      this.noiseCancellationEnabled = false
      this.processedAudioTrack?.stop()
      this.processedAudioTrack = null
      await this.noiseSuppression?.stop()
      this.noiseSuppression = null
      console.warn("Noise cancellation is unavailable; using the microphone directly.", error)
    }
  }

  private async loadNoiseSuppression(): Promise<NoiseSuppression> {
    this.noiseSuppressionLoad ??= import("./noiseSuppression").then(({ NoiseSuppression }) => new NoiseSuppression())
    try {
      return await this.noiseSuppressionLoad
    } catch (error) {
      this.noiseSuppressionLoad = null
      throw error
    }
  }


  async toggleScreenShare(): Promise<void> {
    if (this.screenSharing) {
      await this.stopScreenShare()
    }
  }

  async startScreenShare(frameRate: 30 | 60 | 120): Promise<void> {
    if (!this.canShareScreen || this.sharingScreen || !this.localStream) return
    this.sharingScreen = true
    this.setCameraError("")
    const epoch = this.callEpoch
    let track = null
    let sharedStream = null

    try {
      const displayOptions: DisplayMediaStreamOptions & {
        systemAudio: "include"
        windowAudio: "system"
      } = {
        video: { frameRate: { ideal: frameRate, max: frameRate } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: "include",
        windowAudio: "system",
      }
      sharedStream = await navigator.mediaDevices.getDisplayMedia(displayOptions)
      track = sharedStream.getVideoTracks()[0]
      if (!track) throw new Error("Screen sharing did not provide video.")
      if (epoch !== this.callEpoch || !this.localStream) {
        for (const sharedTrack of sharedStream.getTracks()) sharedTrack.stop()
        return
      }

      if (track.readyState === "ended") throw new Error("Screen sharing ended before it started.")
      this.displayStream = sharedStream
      this.displayTrack = track
      this.screenSharing = true
      track.onended = () => this.stopScreenShare()
      const screenAudioTrack = sharedStream.getAudioTracks()[0] || null
      for (const peer of this.peers.values()) {
        peer.screenSenders = [peer.connection.addTrack(track, sharedStream)]
        if (screenAudioTrack) peer.screenSenders.push(peer.connection.addTrack(screenAudioTrack, sharedStream))
      }
      this.broadcastPeerState()
      await this.renegotiatePeers()
      if (!screenAudioTrack) {
        this.setCameraError("This browser did not provide screen audio. Enable ‘Share audio’ in the sharing dialog if available.")
      }
    } catch (error) {
      for (const peer of this.peers.values()) {
        for (const sender of peer.screenSenders) peer.connection.removeTrack(sender)
        peer.screenSenders = []
      }
      for (const sharedTrack of sharedStream?.getTracks() || []) sharedTrack.stop()
      this.displayTrack = null
      this.displayStream = null
      this.screenSharing = false
      this.broadcastPeerState()
      if (epoch === this.callEpoch) this.setCameraError(getScreenShareErrorMsg(error))
    } finally {
      if (epoch === this.callEpoch) this.sharingScreen = false
    }
  }

  private async stopScreenShare(): Promise<void> {
    if (!this.screenSharing || this.sharingScreen) return
    this.sharingScreen = true
    this.setCameraError("")
    const track = this.displayTrack
    const stream = this.displayStream
    this.displayTrack = null
    this.displayStream = null
    this.screenSharing = false
    if (track) track.onended = null

    try {
      for (const peer of this.peers.values()) {
        for (const sender of peer.screenSenders) peer.connection.removeTrack(sender)
        peer.screenSenders = []
      }
      this.broadcastPeerState()
      await this.renegotiatePeers()
    } catch (error) {
      this.setCameraError(asError(error).message || "Could not stop screen sharing cleanly.")
    } finally {
      for (const sharedTrack of stream?.getTracks() || []) sharedTrack.stop()
      this.sharingScreen = false
    }
  }

  async refreshMediaDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      this.audioDevices = devices
        .filter(({ kind }) => kind === "audioinput")
        .map(({ deviceId, label }, index) => ({ deviceId, label: label || `Microphone ${index + 1}` }))
      this.videoDevices = devices
        .filter(({ kind }) => kind === "videoinput")
        .map(({ deviceId, label }, index) => ({ deviceId, label: label || `Camera ${index + 1}` }))
      this.canSwitchCamera = this.videoDevices.length > 1
      this.selectedAudioDeviceID = this.localStream?.getAudioTracks()[0]?.getSettings().deviceId || this.selectedAudioDeviceID
      this.selectedVideoDeviceID = this.cameraTrack?.getSettings().deviceId || this.selectedVideoDeviceID
    } catch {
      this.audioDevices = []
      this.videoDevices = []
      this.canSwitchCamera = false
    }
  }

  private trackFacing(track: MediaStreamTrack | undefined, fallback: VideoFacingModeEnum): VideoFacingModeEnum {
    const facingMode = track?.getSettings().facingMode
    if (facingMode === "user" || facingMode === "environment" || facingMode === "left" || facingMode === "right") {
      return facingMode
    }
    return fallback
  }

  private playJoinSound(): void {
    if (!this.joinSound) return
    this.joinSound.currentTime = 0
    this.joinSound.play().catch(() => {})
  }

  private closeConnections(): void {
    this.callEpoch += 1
    for (const peerID of [...this.peers.keys()]) this.removePeer(peerID)

    const currentSocket = this.socket
    this.socket = null
    if (currentSocket && currentSocket.readyState < WebSocket.CLOSING) {
      currentSocket.close(1000, "left call")
    }

    if (this.displayTrack) this.displayTrack.onended = null
    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) track.stop()
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop()
    }
    this.processedAudioTrack?.stop()
    this.noiseSuppression?.stop().catch(() => {})
    this.localStream = null
    this.cameraTrack = null
    this.displayTrack = null
    this.displayStream = null
    this.processedAudioTrack = null
    this.noiseSuppression = null
    this.chatMessages = []
    this.chatOpen = false
    this.unreadChatMessages = 0
    this.screenSharing = false
    this.sharingScreen = false
  }
}

