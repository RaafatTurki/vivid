<script lang="ts">
  import { AudioLines, ScreenShare, ScreenShareOff, SwitchCamera, X } from "@lucide/svelte"
  import Button from "./Button.svelte"
  import Popup from "./Popup.svelte"
  import DeviceControls from "./DeviceControls.svelte"
  import type { MediaDeviceOption } from "./types"

  interface Props {
    open: boolean
    noiseCancellationEnabled: boolean
    canShareScreen: boolean
    screenSharing: boolean
    sharingScreen: boolean
    canSwitchCamera: boolean
    switchingCamera: boolean
    audioDevices: MediaDeviceOption[]
    videoDevices: MediaDeviceOption[]
    selectedAudioDeviceID: string
    selectedVideoDeviceID: string
    switchingAudioDevice: boolean
    switchingVideoDevice: boolean
    onToggleNoiseCancellation: () => void | Promise<void>
    onToggleScreenShare: () => void | Promise<void>
    onStartScreenShare: (frameRate: 30 | 60 | 120) => void | Promise<void>
    onSwitchCamera: () => void | Promise<void>
    onAudioChange: (deviceID: string) => void | Promise<void>
    onVideoChange: (deviceID: string) => void | Promise<void>
    onClose: () => void
  }

  let {
    open,
    noiseCancellationEnabled,
    canShareScreen,
    screenSharing,
    sharingScreen,
    canSwitchCamera,
    switchingCamera,
    audioDevices,
    videoDevices,
    selectedAudioDeviceID,
    selectedVideoDeviceID,
    switchingAudioDevice,
    switchingVideoDevice,
    onToggleNoiseCancellation,
    onToggleScreenShare,
    onStartScreenShare,
    onSwitchCamera,
    onAudioChange,
    onVideoChange,
    onClose,
  }: Props = $props()

  let dialog = $state<HTMLDialogElement>()
  let frameRatePopupOpen = $state(false)

  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  })

  function cancel(event: Event) {
    event.preventDefault()
    onClose()
  }

  function clickBackdrop(event: MouseEvent) {
    if (event.target === dialog) onClose()
  }

  async function chooseFrameRate(value: string) {
    frameRatePopupOpen = false
    onClose()
    await onStartScreenShare(Number(value) as 30 | 60 | 120)
  }
</script>

<dialog bind:this={dialog} class="more-sheet" aria-labelledby="more-sheet-title" oncancel={cancel} onclose={onClose} onclick={clickBackdrop}>
  <header>
    <h2 id="more-sheet-title">More options</h2>
    <Button size="icon" kind="ghost" aria-label="Close" onclick={onClose}><X aria-hidden="true" /></Button>
  </header>

  <div class="rows">
    <Button fullWidth aria-label={noiseCancellationEnabled ? "Disable noise cancellation" : "Enable noise cancellation"} pressed={!noiseCancellationEnabled} onclick={onToggleNoiseCancellation}>
      <AudioLines aria-hidden="true" />
      {noiseCancellationEnabled ? "Noise canceling on" : "Noise canceling off"}
    </Button>

    {#if canShareScreen}
      {#if screenSharing}
        <Button fullWidth pressed disabled={sharingScreen} onclick={onToggleScreenShare}>
          <ScreenShareOff aria-hidden="true" />
          Stop sharing screen
        </Button>
      {:else}
        <Button fullWidth disabled={sharingScreen} onclick={() => frameRatePopupOpen = true}>
          <ScreenShare aria-hidden="true" />
          Share screen
        </Button>
      {/if}
    {/if}

    {#if canSwitchCamera}
      <Button fullWidth disabled={switchingCamera} onclick={onSwitchCamera}>
        <SwitchCamera aria-hidden="true" />
        {switchingCamera ? "Switching…" : "Switch camera"}
      </Button>
    {/if}
  </div>

  <DeviceControls
    {audioDevices}
    {videoDevices}
    {selectedAudioDeviceID}
    {selectedVideoDeviceID}
    {switchingAudioDevice}
    {switchingVideoDevice}
    {onAudioChange}
    {onVideoChange}
  />
</dialog>

<Popup
  open={frameRatePopupOpen}
  title="Screen share quality"
  options={[{ value: "30", label: "Share at 30 FPS" }, { value: "60", label: "Share at 60 FPS" }, { value: "120", label: "Share at 120 FPS" }]}
  onSelect={chooseFrameRate}
  onClose={() => frameRatePopupOpen = false}
/>

<style>
  .more-sheet {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    max-width: 100%;
    max-height: min(80vh, 80dvh);
    margin: 0;
    padding: var(--space-4) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
    overflow-y: auto;
    border: 0;
    border-top: 1px solid var(--accent-border);
    border-radius: 0.75rem 0.75rem 0 0;
    color: var(--ink);
    background: var(--surface);
  }

  .more-sheet[open] { animation: sheet-in 200ms ease-out; }
  @keyframes sheet-in { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .more-sheet[open] { animation: none; } }

  .more-sheet::backdrop { background: var(--surface-soft); }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
  h2 { margin: 0; font-size: 1rem; }
  .rows { display: grid; gap: var(--space-2); margin-bottom: var(--space-3); }
  .rows :global(.ui-button) { justify-content: flex-start; }
</style>
