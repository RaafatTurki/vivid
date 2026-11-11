<script lang="ts">
  import { MicOff } from "@lucide/svelte"
  import { mediaStream } from "./mediaElement"
  import { observeVoiceActivity } from "./voiceActivity"
  import { initials, tileColor } from "./utils"

  interface Props {
    stream: MediaStream | null
    /** Track used for the speaking ring; defaults to the stream's own audio. */
    voiceTrack?: MediaStreamTrack | null
    name: string
    /** Name used for the initials avatar; defaults to the label. */
    avatarName?: string
    colorKey?: string
    microphoneMuted?: boolean
    cameraStopped?: boolean
    screen?: boolean
    local?: boolean
    mirrored?: boolean
    size?: "lg" | "sm"
    /** Show the name chip in the corner. */
    label?: boolean
    /** Extra classes, e.g. a corner radius to replace the default. */
    class?: string
  }

  let {
    stream,
    voiceTrack = null,
    name,
    avatarName = name,
    colorKey = name,
    microphoneMuted = false,
    cameraStopped = false,
    screen = false,
    local = false,
    mirrored = false,
    size = "lg",
    label = true,
    class: className = "",
  }: Props = $props()

  let speaking = $state(false)
  let audioTrack = $state<MediaStreamTrack | null>(null)
  let hasVideo = $state(false)

  // Track additions arrive after the stream is attached, so watch for them.
  $effect(() => {
    const current = stream
    if (!current) {
      audioTrack = null
      hasVideo = false
      return
    }
    const sync = () => {
      audioTrack = current.getAudioTracks()[0] ?? null
      hasVideo = current.getVideoTracks().length > 0
    }
    sync()
    current.addEventListener("addtrack", sync)
    current.addEventListener("removetrack", sync)
    return () => {
      current.removeEventListener("addtrack", sync)
      current.removeEventListener("removetrack", sync)
    }
  })

  $effect(() => {
    const track = screen ? null : voiceTrack ?? audioTrack
    if (!track || microphoneMuted) {
      speaking = false
      return
    }
    return observeVoiceActivity(new MediaStream([track]), value => speaking = value)
  })

  const showVideo = $derived(hasVideo && (screen || !cameraStopped))
</script>

<article
  class={[
    "relative grid size-full min-h-0 min-w-0 place-items-center overflow-hidden",
    className || (size === "sm" ? "rounded-xl" : "rounded-2xl"),
    // Speaking ring sits above the video so it never gets cropped.
    "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border-2 after:transition-colors",
    speaking ? "after:border-accent" : "after:border-transparent",
  ]}
  style:background={screen ? "var(--color-surface)" : tileColor(colorKey)}
>
  <!-- The video element stays mounted while the camera is off so remote audio keeps playing. -->
  <video
    use:mediaStream={stream}
    class={["video-fill", !showVideo && "opacity-0", mirrored && "-scale-x-100", screen && "object-contain"]}
    autoplay
    playsinline
    muted={local}
  ></video>
  {#if !showVideo}
    <div
      class={[
        "grid aspect-square place-items-center rounded-full bg-white/10",
        size === "sm" ? "w-11 text-md font-semibold" : "w-[clamp(44px,28%,96px)] text-[length:clamp(15px,3vw,32px)] font-medium",
      ]}
      aria-hidden="true"
    >
      {initials(avatarName)}
    </div>
  {/if}
  {#if label}
    <span
      class={[
        "video-tag",
        size === "sm"
          ? "bottom-2 left-2 max-w-[calc(100%-16px)] gap-1 rounded-md px-1.75 py-0.75 text-2xs"
          : "bottom-3 left-3 max-w-[calc(100%-24px)] gap-1.5 px-2.25 py-1.25 text-caption",
      ]}
    >
      {#if microphoneMuted && !screen}<MicOff size={size === "sm" ? 11 : 13} class="text-danger-ink" strokeWidth={2.4} aria-label="Muted" />{/if}
      <span class="truncate">{name}</span>
    </span>
  {/if}
</article>
