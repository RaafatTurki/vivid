<script lang="ts">
  import CallControls from "../lib/CallControls.svelte"
  import CallHeader from "../lib/CallHeader.svelte"
  import DeviceControls from "../lib/DeviceControls.svelte"
  import VideoGrid from "../lib/VideoGrid.svelte"
  import ChatPanel, { type ChatMessage } from "../lib/ChatPanel.svelte"
  import type { DeviceType, MediaDeviceOption, Peer } from "../lib/types"

  interface Session { roomID: string; copyLabel: string; username: string; deviceType: DeviceType; peers: Map<string, Peer>; cameraError: string; onCopy: () => void | Promise<void>; onTogglePeerPlayback: (peerID: string) => void; onLeave: () => void }
  interface Media { localStream: MediaStream | null; displayStream: MediaStream | null; processedAudioTrack: MediaStreamTrack | null; microphoneMuted: boolean; noiseCancellationEnabled: boolean; cameraStopped: boolean; cameraFacing: VideoFacingModeEnum; screenSharing: boolean; audioDevices: MediaDeviceOption[]; videoDevices: MediaDeviceOption[]; selectedAudioDeviceID: string; selectedVideoDeviceID: string; switchingAudioDevice: boolean; switchingVideoDevice: boolean; canShareScreen: boolean; sharingScreen: boolean; canSwitchCamera: boolean; switchingCamera: boolean; onAudioDeviceChange: (deviceID: string) => void | Promise<void>; onVideoDeviceChange: (deviceID: string) => void | Promise<void>; onToggleMicrophone: () => void | Promise<void>; onToggleNoiseCancellation: () => void | Promise<void>; onToggleCamera: () => void | Promise<void>; onToggleScreenShare: () => void | Promise<void>; onStartScreenShare: (frameRate: 30 | 60 | 120) => void | Promise<void>; onSwitchCamera: () => void | Promise<void> }
  interface Chat { messages: ChatMessage[]; open: boolean; unread: number; onSend: (text: string) => void; onToggle: () => void }
  let { session, media, chat }: { session: Session; media: Media; chat: Chat } = $props()
</script>

<div class="call-page">
  <section class="video-column" aria-label="Vivid call">
    <CallHeader roomID={session.roomID} copyLabel={session.copyLabel} onCopy={session.onCopy} />
    <CallControls {...media} onLeave={session.onLeave} chatOpen={chat.open} unreadChatMessages={chat.unread} onToggleChat={chat.onToggle} />
    <DeviceControls audioDevices={media.audioDevices} videoDevices={media.videoDevices} selectedAudioDeviceID={media.selectedAudioDeviceID} selectedVideoDeviceID={media.selectedVideoDeviceID} switchingAudioDevice={media.switchingAudioDevice} switchingVideoDevice={media.switchingVideoDevice} onAudioChange={media.onAudioDeviceChange} onVideoChange={media.onVideoDeviceChange} />
    {#if session.cameraError}<p role="alert">{session.cameraError}</p>{/if}
    <VideoGrid localStream={media.localStream} processedAudioTrack={media.processedAudioTrack} username={session.username} deviceType={session.deviceType} microphoneMuted={media.microphoneMuted} noiseCancellationEnabled={media.noiseCancellationEnabled} cameraStopped={media.cameraStopped} cameraFacing={media.cameraFacing} screenSharing={media.screenSharing} displayStream={media.displayStream} peers={session.peers} onTogglePeerPlayback={session.onTogglePeerPlayback} />
  </section>
  <section class="chat-column" aria-label="Room chat"><ChatPanel messages={chat.messages} open={chat.open} onSend={chat.onSend} /></section>
</div>

<style>
  .call-page { display: grid; grid-template-columns: minmax(0, 1fr) minmax(17rem, 23rem); gap: var(--space-4); align-items: start; padding-top: clamp(2.375rem, 7vh, 4.5rem); }
  .video-column, .chat-column { min-width: 0; } p { margin: var(--space-3) auto 0; color: var(--danger); font-size: .84rem; text-align: center; }
  @media (max-width: 60em) { .call-page { grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem); } }
  @media (max-width: 47.5em) { .call-page { grid-template-columns: 1fr; } }
</style>
