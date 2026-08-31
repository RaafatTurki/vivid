<script lang="ts">
  import { AudioLines, LogOut, MessageCircle, Mic, MicOff, ScreenShare, ScreenShareOff, SwitchCamera, Video, VideoOff } from "@lucide/svelte"
  import Popup from "./Popup.svelte"
  import Button from "./Button.svelte"

  interface Props {
    microphoneMuted: boolean
    noiseCancellationEnabled: boolean
    cameraStopped: boolean
    canShareScreen: boolean
    screenSharing: boolean
    sharingScreen: boolean
    canSwitchCamera: boolean
    switchingCamera: boolean
    onToggleMicrophone: () => void | Promise<void>
    onToggleNoiseCancellation: () => void | Promise<void>
    onToggleCamera: () => void | Promise<void>
    onToggleScreenShare: () => void | Promise<void>
    onStartScreenShare: (frameRate: 30 | 60 | 120) => void | Promise<void>
    onSwitchCamera: () => void | Promise<void>
    onLeave: () => void
    chatOpen: boolean
    unreadChatMessages: number
    onToggleChat: () => void
  }

  let {
    microphoneMuted,
    noiseCancellationEnabled,
    cameraStopped,
    canShareScreen,
    screenSharing,
    sharingScreen,
    canSwitchCamera,
    switchingCamera,
    onToggleMicrophone,
    onToggleNoiseCancellation,
    onToggleCamera,
    onToggleScreenShare,
    onStartScreenShare,
    onSwitchCamera,
    onLeave,
    chatOpen,
    unreadChatMessages,
    onToggleChat,
  }: Props = $props()

  let frameRatePopupOpen = $state(false)

  async function chooseFrameRate(value: string) {
    frameRatePopupOpen = false
    await onStartScreenShare(Number(value) as 30 | 60 | 120)
  }
</script>

<div class="controls" aria-label="Call controls">
  <Button aria-label={microphoneMuted ? "Unmute microphone" : "Mute microphone"} pressed={microphoneMuted} onclick={onToggleMicrophone}>
    {#if microphoneMuted}<MicOff aria-hidden="true" />{:else}<Mic aria-hidden="true" />{/if}
    <span>{microphoneMuted ? "Unmute" : "Mute"}</span>
  </Button>
  <Button aria-label={cameraStopped ? "Start camera" : "Stop camera"} pressed={cameraStopped} onclick={onToggleCamera}>
    {#if cameraStopped}<VideoOff aria-hidden="true" />{:else}<Video aria-hidden="true" />{/if}
    <span>{cameraStopped ? "Start video" : "Stop video"}</span>
  </Button>
  <Button aria-label={noiseCancellationEnabled ? "Disable noise cancellation" : "Enable noise cancellation"} pressed={!noiseCancellationEnabled} onclick={onToggleNoiseCancellation}>
    <AudioLines aria-hidden="true" />
    <span>{noiseCancellationEnabled ? "Noise canceling" : "Noise off"}</span>
  </Button>
  {#if canShareScreen}
    <div class="screen-tools">
      {#if screenSharing}
        <Button aria-label="Stop screen sharing" pressed disabled={sharingScreen} onclick={onToggleScreenShare}>
          <ScreenShareOff aria-hidden="true" />
          <span>Stop sharing</span>
        </Button>
      {:else}
        <Button aria-label="Choose screen share frame rate" disabled={sharingScreen} onclick={() => frameRatePopupOpen = true}>
          <ScreenShare aria-hidden="true" />
          <span>Share screen</span>
        </Button>
      {/if}
    </div>
  {/if}
  {#if canSwitchCamera}
    <Button aria-label={switchingCamera ? "Switching camera" : "Switch camera"} disabled={switchingCamera} onclick={onSwitchCamera}>
      <SwitchCamera aria-hidden="true" />
      <span>{switchingCamera ? "Switching…" : "Switch camera"}</span>
    </Button>
  {/if}
  <Button kind="danger" aria-label="Leave call" onclick={onLeave}>
    <LogOut aria-hidden="true" />
    <span>Leave</span>
  </Button>
  <Button aria-label={chatOpen ? "Close chat" : "Open chat"} aria-expanded={chatOpen} onclick={onToggleChat}>
    <MessageCircle aria-hidden="true" />
    <span>{chatOpen ? "Hide chat" : "Chat"}{unreadChatMessages && !chatOpen ? ` · ${unreadChatMessages}` : ""}</span>
  </Button>
</div>

<Popup
  open={frameRatePopupOpen}
  title="Screen share quality"
  options={[{ value: "30", label: "Share at 30 FPS" }, { value: "60", label: "Share at 60 FPS" }, { value: "120", label: "Share at 120 FPS" }]}
  onSelect={chooseFrameRate}
  onClose={() => frameRatePopupOpen = false}
/>

<style>
  .controls {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: center;
    width: fit-content;
    max-width: 100%;
    overflow-x: auto;
    margin: var(--space-4) auto 0;
    padding: var(--space-2);
    border: 1px solid rgb(var(--white-rgb) / 14%);
    border-radius: 2px;
    background: var(--surface);
  }

  .screen-tools {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }
</style>
