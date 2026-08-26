<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { AudioLinesX, Maximize2, MicOff, Minimize2, Monitor, ScreenShare, Smartphone, VideoOff, Volume2, VolumeX } from "@lucide/svelte"
  import { DeviceType } from "./types"
  import { mediaStream } from "./mediaElement"
  import { observeVoiceActivity } from "./voiceActivity"

  interface Props {
    stream: MediaStream | null
    voiceTrack?: MediaStreamTrack | null
    name: string
    device?: DeviceType
    microphoneMuted?: boolean
    noiseCancellationEnabled?: boolean
    cameraStopped?: boolean
    screenSharing?: boolean
    screenOnly?: boolean
    local?: boolean
    mirrored?: boolean
    locallyMuted?: boolean
    onToggleMute?: () => void
  }

  let {
    stream,
    voiceTrack = null,
    name,
    device = DeviceType.COMPUTER,
    microphoneMuted = false,
    noiseCancellationEnabled = true,
    cameraStopped = false,
    screenSharing = false,
    screenOnly = false,
    local = false,
    mirrored = local,
    locallyMuted = false,
    onToggleMute = () => {},
  }: Props = $props()
  let card: HTMLElement
  let video: HTMLVideoElement
  let fullscreen = $state(false)
  let speaking = $state(false)
  let volume = $state(1)
  let streamAudioTrack = $state<MediaStreamTrack | null>(null)

  onMount(() => {
    document.addEventListener("fullscreenchange", updateFullscreenState)
  })

  onDestroy(() => {
    document.removeEventListener("fullscreenchange", updateFullscreenState)
  })

  $effect(() => {
    if (video) video.volume = volume
  })

  $effect(() => {
    const currentStream = stream
    if (!currentStream) {
      streamAudioTrack = null
      return
    }
    const sync = () => { streamAudioTrack = currentStream.getAudioTracks()[0] ?? null }
    sync()
    currentStream.addEventListener("addtrack", sync)
    currentStream.addEventListener("removetrack", sync)
    return () => {
      currentStream.removeEventListener("addtrack", sync)
      currentStream.removeEventListener("removetrack", sync)
    }
  })

  $effect(() => {
    const currentVoiceTrack = voiceTrack ?? streamAudioTrack
    if (!currentVoiceTrack) {
      speaking = false
      return
    }

    return observeVoiceActivity(new MediaStream([currentVoiceTrack]), value => speaking = value)
  })

  function updateFullscreenState() {
    fullscreen = document.fullscreenElement === card
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === card) {
        await document.exitFullscreen()
      } else {
        await card.requestFullscreen()
      }
    } catch (error) {
      console.error("Could not toggle fullscreen video", error)
    }
  }
</script>

<article bind:this={card} class:local-card={local} class:remote-card={!local} class:mirrored class:screen-sharing={screenSharing} class:speaking class="video-card">
  <video bind:this={video} use:mediaStream={stream} autoplay muted={local || locallyMuted} playsinline></video>
  <div class="video-meta" aria-label={`${device === DeviceType.MOBILE ? "Mobile" : "PC"}${microphoneMuted ? ", microphone muted" : ""}`}>
    {#if !screenOnly && microphoneMuted}
      <span class="video-badge muted-badge" title="Microphone off" aria-label="Microphone off">
        <MicOff class="badge-icon" aria-hidden="true" />
      </span>
    {/if}
    {#if !screenOnly && cameraStopped}
      <span class="video-badge muted-badge" title="Camera off" aria-label="Camera off">
        <VideoOff class="badge-icon" aria-hidden="true" />
      </span>
    {/if}
    {#if !screenOnly && !noiseCancellationEnabled}
      <span class="video-badge muted-badge" title="Noise cancellation off" aria-label="Noise cancellation off">
        <AudioLinesX class="badge-icon" aria-hidden="true" />
      </span>
    {/if}
    {#if screenSharing}
      <span class="video-badge sharing-badge" title="Screen sharing" aria-label="Screen sharing">
        <ScreenShare class="badge-icon" aria-hidden="true" />
      </span>
    {/if}
  </div>
  <div class="video-label">
    {#if !screenOnly}
      {#if device === DeviceType.MOBILE}<Smartphone class="device-icon" aria-hidden="true" />{:else}<Monitor class="device-icon" aria-hidden="true" />{/if}
    {/if}
    <span>{name}</span>
  </div>
  <div class="tile-actions">
    <button
      class="tile-fullscreen"
      type="button"
      aria-label={fullscreen ? `Exit fullscreen for ${name}` : `View ${name} fullscreen`}
      aria-pressed={fullscreen}
      onclick={toggleFullscreen}
    >
      {#if fullscreen}<Minimize2 aria-hidden="true" />{:else}<Maximize2 aria-hidden="true" />{/if}
    </button>
    {#if !local && !screenOnly}
      <div class="audio-controls">
        <label class="tile-volume" aria-label={`Volume for ${name}`}>
          <Volume2 aria-hidden="true" />
          <input bind:value={volume} style={`--volume-level: ${volume * 100}%`} type="range" min="0" max="1" step="0.05" disabled={locallyMuted}>
          <span>{Math.round(volume * 100)}%</span>
        </label>
        <button
          class="tile-mute"
          type="button"
          aria-pressed={locallyMuted}
          aria-label={locallyMuted ? `Unmute ${name} for you` : `Mute ${name} for you`}
          onclick={onToggleMute}
        >
          {#if locallyMuted}<VolumeX class="tile-mute-icon" aria-hidden="true" />{:else}<Volume2 class="tile-mute-icon" aria-hidden="true" />{/if}
        </button>
      </div>
    {/if}
  </div>
</article>

<style>
  .video-card,
  .video-label,
  .video-badge,
  .audio-controls {
    border: 1px solid var(--line-soft);
    border-radius: 2px;
  }

  .video-card {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    min-height: 0;
    background: var(--bg-soft);
    clip-path: inset(0 round 2px);
    aspect-ratio: 16 / 10;
  }

  .video-card.speaking::after {
    position: absolute;
    z-index: 10;
    inset: 0;
    border: 2px solid var(--accent);
    border-radius: inherit;
    pointer-events: none;
    content: "";
  }

  video {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: var(--bg);
    object-fit: cover;
  }

  .local-card.mirrored video { transform: scaleX(-1); }
  .screen-sharing video { object-fit: contain; }

  .video-card:fullscreen,
  .video-card:-webkit-full-screen {
    width: 100vw;
    height: 100vh;
    min-height: 100vh;
    border: 0;
    border-radius: 0;
    clip-path: none;
    aspect-ratio: auto;
  }

  .tile-fullscreen {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    display: grid;
    width: var(--overlay-height);
    height: var(--overlay-height);
    min-width: var(--overlay-height);
    min-height: var(--overlay-height);
    aspect-ratio: 1;
    place-items: center;
    padding: 0.4375rem;
    color: var(--ink);
    background: var(--surface-soft);
  }

  .tile-actions {
    position: absolute;
    z-index: 4;
    inset: 0;
    pointer-events: none;
    opacity: 1;
    transition: opacity 160ms ease;
  }

  .tile-actions > * { pointer-events: auto; }

  @media (hover: hover) and (pointer: fine) {
    .tile-fullscreen:hover { color: var(--accent); background: var(--accent-subtle); }
    .tile-mute:hover { color: var(--accent); }
  }
  .tile-fullscreen :global(svg) { width: 1rem; height: 1rem; }

  .video-label {
    position: absolute;
    bottom: var(--space-3);
    left: var(--space-3);
    max-width: calc(100% - 9.375rem);
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    height: var(--overlay-height);
    overflow: hidden;
    padding: 0 0.625rem;
    background: var(--surface-video);
    font-size: 0.76rem;
    font-weight: 720;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .video-label :global(.device-icon) { flex: 0 0 auto; width: 0.875rem; height: 0.875rem; color: var(--accent); }

  .video-meta {
    position: absolute;
    top: var(--space-3);
    left: var(--space-3);
    display: flex;
    gap: var(--space-2);
  }

  .video-badge {
    display: inline-flex;
    gap: 0.3125rem;
    align-items: center;
    padding: 0.3125rem var(--space-2);
    color: var(--ink);
    background: var(--surface-video);
    font-size: 0.68rem;
    font-weight: 750;
  }

  .video-badge :global(.badge-icon) { width: 0.8125rem; height: 0.8125rem; }
  .muted-badge,
  .sharing-badge { background: var(--surface-video); }
  .muted-badge { color: var(--danger); border-color: var(--danger-border); }
  .sharing-badge { color: var(--accent); border-color: rgb(var(--accent-rgb) / 30%); }

  .tile-mute {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    height: var(--overlay-height);
    min-height: var(--overlay-height);
    padding: 0 0.625rem;
    border: 0;
    border-left: 1px solid var(--line-soft);
    border-radius: 0;
    color: var(--ink);
    background: transparent;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .tile-mute[aria-pressed="true"] { color: var(--danger); border-color: var(--danger-border); background: rgb(var(--danger-rgb) / 10%); }
  .tile-mute :global(.tile-mute-icon) { width: 0.875rem; height: 0.875rem; }

  .tile-volume {
    display: flex;
    gap: 0.4375rem;
    align-items: center;
    width: min(11.125rem, 26vw);
    margin: 0;
    padding: 0 0.5625rem;
    border: 0;
    color: var(--ink);
    background: transparent;
    font-size: 0.68rem;
  }

  .tile-volume > :global(svg) { flex: 0 0 auto; width: 0.875rem; height: 0.875rem; }
  .tile-volume input {
    flex: 1;
    width: auto;
    height: 0.25rem;
    min-width: 0;
    min-height: 0;
    padding: 0;
    appearance: none;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(to right, var(--accent) var(--volume-level), var(--line-strong) var(--volume-level));
  }
  .tile-volume input:focus { outline: none; }
  .tile-volume input::-webkit-slider-thumb {
    width: 0.65rem;
    height: 0.65rem;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    appearance: none;
  }
  .tile-volume input::-moz-range-thumb {
    width: 0.65rem;
    height: 0.65rem;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
  }
  .tile-volume span { width: 1.875rem; text-align: right; }
  .tile-volume:has(input:disabled) { opacity: 0.55; }

  .audio-controls {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    display: flex;
    align-items: center;
    height: var(--overlay-height);
    max-width: calc(100% - 2rem);
    background: var(--surface-control);
  }

  @media (hover: hover) and (pointer: fine) {
    .tile-actions { opacity: 0; }
    .video-card:hover .tile-actions,
    .tile-actions:focus-within { opacity: 1; }
  }

  @media (max-width: 47.5em) {
    .video-card { min-height: clamp(10rem, 52vw, 14rem); }
  }
</style>
