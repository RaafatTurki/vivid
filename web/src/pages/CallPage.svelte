<script lang="ts">
  import CallControls from "../lib/CallControls.svelte"
  import CallHeader from "../lib/CallHeader.svelte"
  import DeviceControls from "../lib/DeviceControls.svelte"
  import VideoGrid from "../lib/VideoGrid.svelte"
  import VideoSpotlight from "../lib/VideoSpotlight.svelte"
  import ChatPanel from "../lib/ChatPanel.svelte"
  import MobileCallBar from "../lib/MobileCallBar.svelte"
  import MobileMoreSheet from "../lib/MobileMoreSheet.svelte"
  import { mediaQuery, MOBILE_BREAKPOINT } from "../lib/mediaQuery.svelte"
  import type { MediaController } from "../lib/call/media.svelte"
  import type { ChatController } from "../lib/call/chat.svelte"
  import type { DeviceType, Peer } from "../lib/types"

  interface Session { roomID: string; copyLabel: string; username: string; deviceType: DeviceType; peers: Map<string, Peer>; cameraError: string; onCopy: () => void | Promise<void>; onTogglePeerPlayback: (peerID: string) => void; onLeave: () => void }
  let { session, media, chat }: { session: Session; media: MediaController; chat: ChatController } = $props()

  const isMobile = mediaQuery(MOBILE_BREAKPOINT)
  let moreOpen = $state(false)
  let userChoseChatState = false

  function toggleChat(): void {
    userChoseChatState = true
    chat.toggle()
  }

  $effect(() => {
    if (isMobile.matches && chat.open && !userChoseChatState) chat.open = false
  })
</script>

{#if isMobile.matches}
  <div class="call-page-mobile">
    <CallHeader roomID={session.roomID} copyLabel={session.copyLabel} onCopy={session.onCopy} />
    {#if session.cameraError}<p role="alert">{session.cameraError}</p>{/if}
    <div class="mobile-video-area">
      <VideoSpotlight
        localStream={media.localStream}
        processedAudioTrack={media.processedAudioTrack}
        username={session.username}
        deviceType={session.deviceType}
        microphoneMuted={media.microphoneMuted}
        noiseCancellationEnabled={media.noiseCancellationEnabled}
        cameraStopped={media.cameraStopped}
        cameraFacing={media.cameraFacing}
        screenSharing={media.screenSharing}
        displayStream={media.displayStream}
        peers={session.peers}
        onTogglePeerPlayback={session.onTogglePeerPlayback}
      />
    </div>
  </div>

  <MobileCallBar
    microphoneMuted={media.microphoneMuted}
    cameraStopped={media.cameraStopped}
    chatOpen={chat.open}
    unreadChatMessages={chat.unread}
    onToggleMicrophone={() => media.toggleMicrophone()}
    onToggleCamera={() => media.toggleCamera()}
    onToggleChat={toggleChat}
    onLeave={session.onLeave}
    onMore={() => moreOpen = true}
  />

  <MobileMoreSheet
    open={moreOpen}
    noiseCancellationEnabled={media.noiseCancellationEnabled}
    canShareScreen={media.canShareScreen}
    screenSharing={media.screenSharing}
    sharingScreen={media.sharingScreen}
    canSwitchCamera={media.canSwitchCamera}
    switchingCamera={media.switchingCamera}
    audioDevices={media.audioDevices}
    videoDevices={media.videoDevices}
    selectedAudioDeviceID={media.selectedAudioDeviceID}
    selectedVideoDeviceID={media.selectedVideoDeviceID}
    switchingAudioDevice={media.switchingAudioDevice}
    switchingVideoDevice={media.switchingVideoDevice}
    onToggleNoiseCancellation={() => media.toggleNoiseCancellation()}
    onToggleScreenShare={() => media.toggleScreenShare()}
    onStartScreenShare={(frameRate) => media.startScreenShare(frameRate)}
    onSwitchCamera={() => media.switchCamera()}
    onAudioChange={(deviceID) => media.changeAudioDevice(deviceID)}
    onVideoChange={(deviceID) => media.changeVideoDevice(deviceID)}
    onClose={() => moreOpen = false}
  />

  <ChatPanel variant="sheet" messages={chat.messages} open={chat.open} onSend={(text) => chat.send(text)} onClose={toggleChat} />
{:else}
  <div class="call-page">
    <section class="video-column" aria-label="Vivid call">
      <CallHeader roomID={session.roomID} copyLabel={session.copyLabel} onCopy={session.onCopy} />
      <CallControls
        microphoneMuted={media.microphoneMuted}
        noiseCancellationEnabled={media.noiseCancellationEnabled}
        cameraStopped={media.cameraStopped}
        canShareScreen={media.canShareScreen}
        screenSharing={media.screenSharing}
        sharingScreen={media.sharingScreen}
        canSwitchCamera={media.canSwitchCamera}
        switchingCamera={media.switchingCamera}
        onToggleMicrophone={() => media.toggleMicrophone()}
        onToggleNoiseCancellation={() => media.toggleNoiseCancellation()}
        onToggleCamera={() => media.toggleCamera()}
        onToggleScreenShare={() => media.toggleScreenShare()}
        onStartScreenShare={(frameRate) => media.startScreenShare(frameRate)}
        onSwitchCamera={() => media.switchCamera()}
        onLeave={session.onLeave}
        chatOpen={chat.open}
        unreadChatMessages={chat.unread}
        onToggleChat={() => chat.toggle()}
      />
      <DeviceControls
        audioDevices={media.audioDevices}
        videoDevices={media.videoDevices}
        selectedAudioDeviceID={media.selectedAudioDeviceID}
        selectedVideoDeviceID={media.selectedVideoDeviceID}
        switchingAudioDevice={media.switchingAudioDevice}
        switchingVideoDevice={media.switchingVideoDevice}
        onAudioChange={(deviceID) => media.changeAudioDevice(deviceID)}
        onVideoChange={(deviceID) => media.changeVideoDevice(deviceID)}
      />
      {#if session.cameraError}<p role="alert">{session.cameraError}</p>{/if}
      <VideoGrid localStream={media.localStream} processedAudioTrack={media.processedAudioTrack} username={session.username} deviceType={session.deviceType} microphoneMuted={media.microphoneMuted} noiseCancellationEnabled={media.noiseCancellationEnabled} cameraStopped={media.cameraStopped} cameraFacing={media.cameraFacing} screenSharing={media.screenSharing} displayStream={media.displayStream} peers={session.peers} onTogglePeerPlayback={session.onTogglePeerPlayback} />
    </section>
    <section class="chat-column" aria-label="Room chat"><ChatPanel messages={chat.messages} open={chat.open} onSend={(text) => chat.send(text)} /></section>
  </div>
{/if}

<style>
  .call-page { display: grid; grid-template-columns: minmax(0, 1fr) minmax(17rem, 23rem); gap: var(--space-4); align-items: start; padding-top: clamp(2.375rem, 7vh, 4.5rem); }
  .video-column, .chat-column { min-width: 0; }
  p { margin: var(--space-3) auto 0; color: var(--danger); font-size: .84rem; text-align: center; }
  @media (max-width: 60em) { .call-page { grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem); } }

  .call-page-mobile {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-3);
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
  }

  .mobile-video-area { min-height: 0; }
</style>
