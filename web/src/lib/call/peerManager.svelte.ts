import { SvelteMap } from "svelte/reactivity"
import type { Peer, PeerState } from "../types"
import { DeviceType } from "../types"
import { cleanString } from "../utils"

export interface PeerManagerContext {
  selfPeerID: () => string
  iceServers: () => RTCIceServer[]
  localStream: () => MediaStream | null
  outboundAudioTrack: () => MediaStreamTrack | null
  screenShare: () => { stream: MediaStream; track: MediaStreamTrack } | null
  username: () => string
  deviceType: () => DeviceType
  microphoneMuted: () => boolean
  noiseCancellationEnabled: () => boolean
  cameraStopped: () => boolean
  screenSharing: () => boolean
  screenStreamID: () => string
  sendSignal: (type: string, to: string, payload: unknown) => void
  onPeerCountChanged: (totalInCall: number) => void
}

export class PeerManager {
  readonly peers = new SvelteMap<string, Peer>()

  constructor(private readonly ctx: PeerManagerContext) {}

  createPeer(peerID: string): Peer {
    if (!peerID) throw new Error("Peer ID is required")
    const existing = this.peers.get(peerID)
    if (existing) return existing
    const localStream = this.ctx.localStream()
    if (!localStream) throw new Error("Local media is not ready")

    const connection = new RTCPeerConnection({ iceServers: this.ctx.iceServers() })
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
      polite: this.ctx.selfPeerID() > peerID,
      pendingCandidates: [],
    }
    this.peers.set(peerID, peer)

    for (const track of localStream.getTracks()) {
      const outboundTrack = track.kind === "audio" ? this.ctx.outboundAudioTrack() || track : track
      const sender = connection.addTrack(outboundTrack, localStream)
      if (track.kind === "video") peer.cameraSender = sender
      if (track.kind === "audio") peer.microphoneSender = sender
    }
    if (localStream.getAudioTracks().length === 0) {
      connection.addTransceiver("audio", { direction: "recvonly" })
    }
    if (localStream.getVideoTracks().length === 0) {
      connection.addTransceiver("video", { direction: "recvonly" })
    }
    const screenShare = this.ctx.screenShare()
    if (screenShare) {
      peer.screenSenders = [connection.addTrack(screenShare.track, screenShare.stream)]
      const screenAudioTrack = screenShare.stream.getAudioTracks()[0]
      if (screenAudioTrack) peer.screenSenders.push(connection.addTrack(screenAudioTrack, screenShare.stream))
    }

    connection.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate) this.ctx.sendSignal("ice-candidate", peerID, candidate.toJSON())
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
      updatePeerStreams(currentPeer)
      this.peers.set(peerID, { ...currentPeer })
    })

    connection.addEventListener("connectionstatechange", () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        this.removePeer(peerID)
      } else if (connection.connectionState === "connected") {
        this.ctx.onPeerCountChanged(this.peers.size + 1)
      }
    })

    return peer
  }

  removePeer(peerID: string): void {
    const peer = this.peers.get(peerID)
    if (!peer) return
    this.peers.delete(peerID)
    peer.connection.close()
    this.ctx.onPeerCountChanged(this.peers.size ? this.peers.size + 1 : 0)
  }

  closeAll(): void {
    for (const peerID of [...this.peers.keys()]) this.removePeer(peerID)
  }

  async sendOffer(peerID: string): Promise<void> {
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
      this.ctx.sendSignal("offer", peerID, peer.connection.localDescription!.toJSON())
    } finally {
      peer.makingOffer = false
    }
  }

  async receiveOffer(peerID: string, description: RTCSessionDescriptionInit): Promise<void> {
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
    this.ctx.sendSignal("answer", peerID, peer.connection.localDescription!.toJSON())
    if (peer.renegotiate) await this.sendOffer(peerID)
  }

  async receiveAnswer(peerID: string, description: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(peerID)
    if (!peer) throw new Error(`Answer received for unknown peer ${peerID}`)
    if (peer.connection.signalingState !== "have-local-offer") return
    await peer.connection.setRemoteDescription(description)
    await this.flushCandidates(peer)
    if (peer.renegotiate) await this.sendOffer(peerID)
  }

  async receiveCandidate(peerID: string, candidate: RTCIceCandidateInit): Promise<void> {
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

  async renegotiateAll(): Promise<void> {
    for (const peerID of this.peers.keys()) await this.sendOffer(peerID)
  }

  togglePlayback(peerID: string): void {
    const peer = this.peers.get(peerID)
    if (!peer) return
    peer.locallyMuted = !peer.locallyMuted
    this.peers.set(peerID, { ...peer })
  }

  sendState(peerID: string): void {
    this.ctx.sendSignal("peer-state", peerID, {
      name: this.ctx.username(),
      device: this.ctx.deviceType(),
      microphoneMuted: this.ctx.microphoneMuted(),
      noiseCancellationEnabled: this.ctx.noiseCancellationEnabled(),
      cameraStopped: this.ctx.cameraStopped(),
      screenSharing: this.ctx.screenSharing(),
      screenStreamID: this.ctx.screenStreamID(),
    })
  }

  broadcastState(): void {
    for (const peerID of this.peers.keys()) this.sendState(peerID)
  }

  receiveState(peerID: string, state: PeerState): void {
    const peer = this.createPeer(peerID)
    peer.name = cleanString(state?.name) || peer.name
    peer.device = state?.device === DeviceType.MOBILE ? DeviceType.MOBILE : DeviceType.COMPUTER
    peer.microphoneMuted = state?.microphoneMuted === true
    peer.noiseCancellationEnabled = state?.noiseCancellationEnabled !== false
    peer.cameraStopped = state?.cameraStopped === true
    peer.screenSharing = state?.screenSharing === true
    peer.screenStreamID = typeof state?.screenStreamID === "string" ? state.screenStreamID.slice(0, 128) : ""
    updatePeerStreams(peer)
    this.peers.set(peerID, { ...peer })
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate)
    }
  }
}

function updatePeerStreams(peer: Peer): void {
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
