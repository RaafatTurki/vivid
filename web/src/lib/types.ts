export enum PageName {
  HOME = "home",
  LOBBY = "lobby",
  CALL = "call",
}

export interface MediaDeviceOption {
  deviceId: string
  label: string
}

export interface PeerState {
  name?: string
  microphoneMuted?: boolean
  noiseCancellationEnabled?: boolean
  cameraStopped?: boolean
  screenSharing?: boolean
  screenStreamID?: string
}

export interface Peer {
  id: string
  name: string
  microphoneMuted: boolean
  noiseCancellationEnabled: boolean
  cameraStopped: boolean
  screenSharing: boolean
  connection: RTCPeerConnection
  stream: MediaStream | null
  screenStream: MediaStream | null
  cameraStreamID: string
  screenStreamID: string
  streams: Map<string, MediaStream>
  cameraSender: RTCRtpSender | null
  microphoneSender: RTCRtpSender | null
  screenSenders: RTCRtpSender[]
  renegotiate: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  polite: boolean
  pendingCandidates: RTCIceCandidateInit[]
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
