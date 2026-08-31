import type { NoiseSuppression } from "../noiseSuppression"
import {
  asError,
  createCameraConstraints,
  getCameraErrorMsg,
  getScreenShareErrorMsg,
  getUserMediaWithRetry,
  createMicrophoneConstraints,
  createVideoConstraints,
} from "../utils"
import type { MediaDeviceOption, Peer } from "../types"

export interface MediaContext {
  peers: () => IterableIterator<Peer>
  renegotiateAll: () => Promise<void>
  broadcastState: () => void
  setCameraError: (message: string) => void
}

export class MediaController {
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
  canShareScreen = $state(typeof navigator.mediaDevices?.getDisplayMedia === "function")
  screenSharing = $state(false)
  sharingScreen = $state(false)
  processedAudioTrack = $state<MediaStreamTrack | null>(null)

  private cameraTrack: MediaStreamTrack | null = null
  private displayTrack: MediaStreamTrack | null = null
  private noiseSuppression: NoiseSuppression | null = null
  private noiseSuppressionLoad: Promise<NoiseSuppression> | null = null
  private generation = 0
  private joinWithAudio = true
  private joinWithVideo = true

  constructor(private readonly ctx: MediaContext) {}

  get screenShare(): { stream: MediaStream; track: MediaStreamTrack } | null {
    return this.screenSharing && this.displayStream && this.displayTrack
      ? { stream: this.displayStream, track: this.displayTrack }
      : null
  }

  async startCall(joinWithAudio: boolean, joinWithVideo: boolean): Promise<MediaStream> {
    this.joinWithAudio = joinWithAudio
    this.joinWithVideo = joinWithVideo
    this.generation += 1
    this.localStream = await this.acquireCallMedia()
    await this.updateNoiseCancellation()
    this.cameraTrack = this.localStream.getVideoTracks()[0] || null
    this.microphoneMuted = !joinWithAudio
    this.cameraStopped = !joinWithVideo
    this.cameraFacing = this.trackFacing(this.localStream.getVideoTracks()[0], this.cameraFacing)
    await this.refreshDevices()
    return this.localStream
  }

  resetUI(): void {
    this.microphoneMuted = false
    this.cameraStopped = false
    this.screenSharing = false
    this.sharingScreen = false
  }

  stop(): void {
    this.generation += 1
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
    this.screenSharing = false
    this.sharingScreen = false
  }

  private async acquireCallMedia(): Promise<MediaStream> {
    if (!this.joinWithAudio && !this.joinWithVideo) return new MediaStream()
    const audio = this.joinWithAudio ? createMicrophoneConstraints() : false
    return getUserMediaWithRetry(
      { audio, video: this.joinWithVideo ? createVideoConstraints(this.cameraFacing) : false },
      { audio, video: this.joinWithVideo },
    )
  }

  private async swapTrack(
    kind: "audio" | "video",
    newTrack: MediaStreamTrack | null,
    localStreamForAdd: MediaStream,
  ): Promise<void> {
    const replacements: Promise<void>[] = []
    let addedSender = false
    for (const peer of this.ctx.peers()) {
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
    if (addedSender) await this.ctx.renegotiateAll()
  }

  async toggleMicrophone(): Promise<void> {
    const track = this.localStream?.getAudioTracks()[0]
    if (!track) {
      await this.enableMicrophone()
      return
    }
    track.enabled = !track.enabled
    this.microphoneMuted = !track.enabled
    this.ctx.broadcastState()
  }

  async toggleCamera(): Promise<void> {
    const track = this.cameraTrack
    if (!track) {
      await this.enableCamera()
      return
    }
    track.enabled = !track.enabled
    this.cameraStopped = !track.enabled
    this.ctx.broadcastState()
  }

  async enableMicrophone(): Promise<void> {
    this.ctx.setCameraError("")
    try {
      const audio = createMicrophoneConstraints(this.selectedAudioDeviceID)
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
      const track = stream.getAudioTracks()[0]
      if (!track) throw new Error("No microphone was available.")
      if (!this.localStream) throw new Error("The call is no longer active.")
      track.enabled = true
      if (this.noiseCancellationEnabled) await this.updateNoiseCancellation(track)
      const localStream = this.setLocalTrack("audio", track)
      await this.swapTrack("audio", this.processedAudioTrack || track, localStream)
      this.microphoneMuted = false
      this.ctx.broadcastState()
      await this.refreshDevices()
    } catch (error) {
      this.ctx.setCameraError(asError(error).message || "Could not start the microphone.")
    }
  }

  async enableCamera(): Promise<void> {
    this.ctx.setCameraError("")
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
      await this.replaceVideoTrack(track)
      this.cameraTrack = track
      this.cameraFacing = this.trackFacing(track, this.cameraFacing)
      this.cameraStopped = false
      this.ctx.broadcastState()
      await this.refreshDevices()
    } catch (error) {
      this.ctx.setCameraError(getCameraErrorMsg(error))
    }
  }

  async switchCamera(): Promise<void> {
    const oldTrack = this.cameraTrack
    if (!oldTrack || this.switchingCamera) return

    this.switchingCamera = true
    this.ctx.setCameraError("")
    const previousFacing = this.cameraFacing
    const nextFacing = previousFacing === "environment" ? "user" : "environment"
    const wasEnabled = oldTrack.enabled
    let oldTrackStopped = false

    const requestFacingStream = () => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: createVideoConstraints(nextFacing, true),
    })

    try {
      let cameraStream
      try {
        cameraStream = await requestFacingStream()
      } catch (error) {
        const issue = asError(error)
        if (issue.name !== "NotReadableError" && issue.name !== "AbortError") throw error
        oldTrack.stop()
        oldTrackStopped = true
        cameraStream = await requestFacingStream()
      }

      const newTrack = cameraStream.getVideoTracks()[0]
      if (!newTrack) throw new Error("The selected camera did not provide video.")
      newTrack.enabled = wasEnabled
      await this.replaceVideoTrack(newTrack)
      this.cameraTrack = newTrack
      if (!oldTrackStopped) oldTrack.stop()
      this.cameraFacing = this.trackFacing(newTrack, nextFacing)
      this.cameraStopped = !newTrack.enabled
      await this.refreshDevices()
    } catch (error) {
      if (oldTrackStopped) await this.restoreCamera(previousFacing, wasEnabled)
      this.ctx.setCameraError(getCameraErrorMsg(error))
    } finally {
      this.switchingCamera = false
    }
  }

  private async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    const localStream = this.setLocalTrack("video", newTrack)
    await this.swapTrack("video", newTrack, localStream)
  }

  private setLocalTrack(kind: "audio" | "video", track: MediaStreamTrack): MediaStream {
    if (!this.localStream) throw new Error("The call is no longer active.")
    this.localStream = kind === "audio"
      ? new MediaStream([track, ...this.localStream.getVideoTracks()])
      : new MediaStream([...this.localStream.getAudioTracks(), track])
    return this.localStream
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
    this.ctx.setCameraError("")
    let newTrack = null
    let oldTrack = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: createMicrophoneConstraints(deviceID), video: false })
      newTrack = stream.getAudioTracks()[0]
      if (!newTrack) throw new Error("The selected microphone did not provide audio.")

      oldTrack = this.localStream.getAudioTracks()[0]
      newTrack.enabled = oldTrack?.enabled ?? true
      if (this.noiseCancellationEnabled) await this.updateNoiseCancellation(newTrack)
      const localStream = this.setLocalTrack("audio", newTrack)

      await this.swapTrack("audio", this.processedAudioTrack || newTrack, localStream)
      oldTrack?.stop()
      this.selectedAudioDeviceID = newTrack.getSettings().deviceId || deviceID
      await this.refreshDevices()
    } catch (error) {
      if (newTrack && this.localStream?.getTracks().includes(newTrack)) {
        await this.swapTrack("audio", newTrack, this.localStream).catch(() => {})
        oldTrack?.stop()
      }
      if (newTrack && !this.localStream?.getTracks().includes(newTrack)) newTrack.stop()
      this.ctx.setCameraError(asError(error).message || "Could not switch microphones.")
    } finally {
      this.switchingAudioDevice = false
    }
  }

  async changeVideoDevice(deviceID: string): Promise<void> {
    if (!deviceID || this.switchingVideoDevice || !this.localStream) return
    this.switchingVideoDevice = true
    this.ctx.setCameraError("")
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
      await this.refreshDevices()
    } catch (error) {
      if (newTrack && newTrack !== this.cameraTrack) newTrack.stop()
      this.ctx.setCameraError(getCameraErrorMsg(error))
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
    this.ctx.broadcastState()
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
    this.noiseSuppressionLoad ??= import("../noiseSuppression").then(({ NoiseSuppression }) => new NoiseSuppression())
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
    this.ctx.setCameraError("")
    const generation = this.generation
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
      if (generation !== this.generation || !this.localStream) {
        for (const sharedTrack of sharedStream.getTracks()) sharedTrack.stop()
        return
      }

      if (track.readyState === "ended") throw new Error("Screen sharing ended before it started.")
      this.displayStream = sharedStream
      this.displayTrack = track
      this.screenSharing = true
      track.onended = () => this.stopScreenShare()
      const screenAudioTrack = sharedStream.getAudioTracks()[0] || null
      for (const peer of this.ctx.peers()) {
        peer.screenSenders = [peer.connection.addTrack(track, sharedStream)]
        if (screenAudioTrack) peer.screenSenders.push(peer.connection.addTrack(screenAudioTrack, sharedStream))
      }
      this.ctx.broadcastState()
      await this.ctx.renegotiateAll()
      if (!screenAudioTrack) {
        this.ctx.setCameraError("This browser did not provide screen audio. Enable 'Share audio' in the sharing dialog if available.")
      }
    } catch (error) {
      for (const peer of this.ctx.peers()) {
        for (const sender of peer.screenSenders) peer.connection.removeTrack(sender)
        peer.screenSenders = []
      }
      for (const sharedTrack of sharedStream?.getTracks() || []) sharedTrack.stop()
      this.displayTrack = null
      this.displayStream = null
      this.screenSharing = false
      this.ctx.broadcastState()
      if (generation === this.generation) this.ctx.setCameraError(getScreenShareErrorMsg(error))
    } finally {
      if (generation === this.generation) this.sharingScreen = false
    }
  }

  private async stopScreenShare(): Promise<void> {
    if (!this.screenSharing || this.sharingScreen) return
    this.sharingScreen = true
    this.ctx.setCameraError("")
    const track = this.displayTrack
    const stream = this.displayStream
    this.displayTrack = null
    this.displayStream = null
    this.screenSharing = false
    if (track) track.onended = null

    try {
      for (const peer of this.ctx.peers()) {
        for (const sender of peer.screenSenders) peer.connection.removeTrack(sender)
        peer.screenSenders = []
      }
      this.ctx.broadcastState()
      await this.ctx.renegotiateAll()
    } catch (error) {
      this.ctx.setCameraError(asError(error).message || "Could not stop screen sharing cleanly.")
    } finally {
      for (const sharedTrack of stream?.getTracks() || []) sharedTrack.stop()
      this.sharingScreen = false
    }
  }

  async refreshDevices(): Promise<void> {
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
}
