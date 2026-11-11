<script lang="ts">
  import { Check, Copy, Mic, MicOff, Video, VideoOff } from "@lucide/svelte"
  import Logo from "../lib/Logo.svelte"
  import DeviceSelects from "../lib/DeviceSelects.svelte"
  import { mediaStream } from "../lib/mediaElement"
  import { observeVoiceActivity } from "../lib/voiceActivity"
  import { initials } from "../lib/utils"
  import type { MediaController } from "../lib/call/media.svelte"

  interface Props {
    roomID: string
    inviteURL: string
    media: MediaController
    username: string
    joining: boolean
    error: string
    onJoin: () => void
    onHome: () => void
    onCopy: () => Promise<boolean>
  }

  let { roomID, inviteURL, media, username = $bindable(), joining, error, onJoin, onHome, onCopy }: Props = $props()

  let copied = $state(false)
  let speaking = $state(false)
  const displayName = $derived(username.trim() || "Guest")
  const cameraOn = $derived(!!media.localStream?.getVideoTracks().length && !media.cameraStopped)

  $effect(() => {
    const track = media.localStream?.getAudioTracks()[0]
    if (!track || media.microphoneMuted) {
      speaking = false
      return
    }
    return observeVoiceActivity(new MediaStream([track]), value => speaking = value)
  })

  async function copy() {
    if (!await onCopy()) return
    copied = true
    setTimeout(() => copied = false, 1500)
  }

  // Bar heights (px) and animation offsets for the mic level meter.
  const levelBars = [[5, "0s"], [9, "-.2s"], [12, "-.35s"], [7, "-.1s"]] as const

  function submit(event: SubmitEvent) {
    event.preventDefault()
    onJoin()
  }
</script>

<div class="flex min-h-dvh flex-col">
  <header class="page-header max-sm:px-4">
    <a href="/" onclick={(event) => { event.preventDefault(); onHome() }} aria-label="Vivid home"><Logo /></a>
    <button
      type="button"
      class="flex h-9 max-w-full min-w-0 items-center gap-2 rounded-field border border-line-strong bg-surface px-3 text-caption text-ink-2 hover:border-focus"
      onclick={copy}
      aria-label="Copy invite link"
    >
      <span class="truncate font-mono">{inviteURL.replace(/^https?:\/\//, "")}</span>
      {#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}
      <span class="text-accent max-sm:hidden">{copied ? "Copied" : "Copy"}</span>
    </button>
  </header>

  <main class="flex flex-1 items-start justify-center px-4 pt-2 pb-8 sm:items-center sm:px-6 sm:py-8">
    <!-- On phones the preview column is flattened so the name + Join button sit right under the preview. -->
    <div class="flex w-full max-w-[1080px] flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-12">
      <section class="contents sm:flex sm:min-w-0 sm:flex-[999_1_560px] sm:flex-col sm:gap-4" aria-label="Camera preview">
        <div class="relative grid aspect-4/5 max-h-[48dvh] w-full place-items-center overflow-hidden rounded-[20px] border border-line bg-surface sm:aspect-16/10 sm:max-h-none">
          <video
            use:mediaStream={media.localStream}
            class={["video-fill", !cameraOn && "opacity-0", media.cameraFacing !== "environment" && "-scale-x-100"]}
            autoplay
            playsinline
            muted
          ></video>
          {#if !cameraOn}
            <div class="flex flex-col items-center gap-3 text-muted">
              <div class="grid size-22 place-items-center rounded-full bg-avatar text-3xl font-medium text-ink" aria-hidden="true">{initials(displayName)}</div>
              <span>{media.localStream ? "Camera is off" : "Starting camera…"}</span>
            </div>
          {/if}

          <div class="video-tag bottom-19 left-4 max-w-[calc(100%-32px)] gap-2 px-2.5 py-1.5 text-caption sm:bottom-4 sm:max-w-[calc(50%-72px)]">
            <span class="flex h-3 items-end gap-0.5" aria-hidden="true">
              {#each levelBars as [height, delay], index (index)}
                <i
                  class={["w-0.75 origin-bottom rounded-xs", media.microphoneMuted ? "bg-focus" : "bg-accent", speaking && "animate-level"]}
                  style:height="{height}px"
                  style:animation-delay={delay}
                ></i>
              {/each}
            </span>
            <span class="truncate">{displayName}</span>
          </div>

          <div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2.5">
            {@render toggle(media.microphoneMuted, media.microphoneMuted ? "Turn on microphone" : "Turn off microphone", () => media.toggleMicrophone(), media.microphoneMuted ? MicOff : Mic)}
            {@render toggle(!cameraOn, cameraOn ? "Turn off camera" : "Turn on camera", () => media.toggleCamera(), cameraOn ? Video : VideoOff)}
          </div>
        </div>
        <DeviceSelects {media} class="order-2 sm:order-none" />
      </section>

      <form class="order-1 flex min-w-0 flex-none flex-col gap-5 sm:order-none sm:flex-[1_1_320px] sm:gap-7" onsubmit={submit} novalidate>
        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-semibold tracking-[-0.02em] sm:text-[28px]">Ready to join?</h1>
          <p class="text-muted">Room <span class="font-mono text-ink-2">{roomID}</span></p>
        </div>
        <div class="label">
          <label for="name">Your name</label>
          <input id="name" class="field" bind:value={username} maxlength="32" autocomplete="name" placeholder="Enter your name" required />
        </div>
        <button type="submit" class="btn btn-primary w-full" disabled={joining || !username.trim()}>{joining ? "Joining…" : "Join now"}</button>
        {#if error}<p class="alert" role="alert">{error}</p>{/if}
        <p class="text-xs leading-normal text-faint">Audio and video travel directly between browsers, encrypted. Nothing is recorded.</p>
      </form>
    </div>
  </main>
</div>

{#snippet toggle(off: boolean, label: string, onclick: () => void, Icon: typeof Mic)}
  <button
    type="button"
    class={[
      "grid size-12 place-items-center rounded-full border backdrop-blur-sm",
      off ? "border-danger bg-danger text-white" : "border-ink/18 bg-ink/12 text-ink hover:bg-ink/18",
    ]}
    data-off={off}
    aria-pressed={off}
    aria-label={label}
    {onclick}
  >
    <Icon size={20} />
  </button>
{/snippet}
