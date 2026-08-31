<script lang="ts">
  import VideoTile from "./VideoTile.svelte"
  import type { DeviceType, Peer } from "./types"

  interface Props {
    localStream: MediaStream | null
    processedAudioTrack?: MediaStreamTrack | null
    username: string
    deviceType: DeviceType
    microphoneMuted: boolean
    noiseCancellationEnabled: boolean
    cameraStopped: boolean
    cameraFacing: VideoFacingModeEnum
    screenSharing: boolean
    displayStream: MediaStream | null
    peers: Map<string, Peer>
    onTogglePeerPlayback: (peerID: string) => void
  }

  let {
    localStream,
    processedAudioTrack = null,
    username,
    deviceType,
    microphoneMuted,
    noiseCancellationEnabled,
    cameraStopped,
    cameraFacing,
    screenSharing,
    displayStream,
    peers,
    onTogglePeerPlayback,
  }: Props = $props()

  interface Tile {
    key: string
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
    isScreen: boolean
  }

  let pinnedKey = $state<string | null>(null)

  const tiles = $derived.by<Tile[]>(() => {
    const list: Tile[] = [{
      key: "self",
      stream: localStream,
      voiceTrack: processedAudioTrack,
      name: `${username} (You)`,
      device: deviceType,
      microphoneMuted,
      noiseCancellationEnabled,
      cameraStopped,
      local: true,
      mirrored: cameraFacing !== "environment",
      isScreen: false,
    }]
    if (screenSharing && displayStream) {
      list.push({
        key: "self-screen",
        stream: displayStream,
        name: "Your screen",
        screenSharing: true,
        screenOnly: true,
        local: true,
        mirrored: false,
        isScreen: true,
      })
    }
    for (const peer of peers.values()) {
      list.push({
        key: peer.id,
        stream: peer.stream,
        name: peer.name,
        device: peer.device,
        microphoneMuted: peer.microphoneMuted,
        noiseCancellationEnabled: peer.noiseCancellationEnabled,
        cameraStopped: peer.cameraStopped,
        locallyMuted: peer.locallyMuted,
        onToggleMute: () => onTogglePeerPlayback(peer.id),
        isScreen: false,
      })
      if (peer.screenSharing && peer.screenStream) {
        list.push({
          key: `${peer.id}-screen`,
          stream: peer.screenStream,
          name: `${peer.name}'s screen`,
          screenSharing: true,
          screenOnly: true,
          locallyMuted: peer.locallyMuted,
          isScreen: true,
        })
      }
    }
    return list
  })

  const spotlightIndex = $derived.by(() => {
    if (tiles.length === 0) return -1
    const screenIndex = tiles.findIndex(tile => tile.isScreen)
    if (screenIndex !== -1) return screenIndex
    if (pinnedKey) {
      const pinnedIndex = tiles.findIndex(tile => tile.key === pinnedKey)
      if (pinnedIndex !== -1) return pinnedIndex
    }
    const firstRemote = tiles.findIndex(tile => !tile.local)
    return firstRemote !== -1 ? firstRemote : 0
  })

  const spotlight = $derived(spotlightIndex >= 0 ? tiles[spotlightIndex] : null)
  const thumbnails = $derived(tiles.filter((_, index) => index !== spotlightIndex))

  function pin(key: string): void {
    pinnedKey = key
  }
</script>

<div class="spotlight-layout">
  {#if spotlight}
    <div class="spotlight-tile">
      <VideoTile
        stream={spotlight.stream}
        voiceTrack={spotlight.voiceTrack}
        name={spotlight.name}
        device={spotlight.device}
        microphoneMuted={spotlight.microphoneMuted}
        noiseCancellationEnabled={spotlight.noiseCancellationEnabled}
        cameraStopped={spotlight.cameraStopped}
        screenSharing={spotlight.screenSharing}
        screenOnly={spotlight.screenOnly}
        local={spotlight.local}
        mirrored={spotlight.mirrored}
        locallyMuted={spotlight.locallyMuted}
        onToggleMute={spotlight.onToggleMute}
      />
    </div>
  {:else}
    <div class="empty-room">
      <span class="waiting-ring" aria-hidden="true"></span>
      <strong>Waiting for someone to join</strong>
      <span>Share the invite link to start the call.</span>
    </div>
  {/if}

  {#if thumbnails.length > 0}
    <div class="thumbnail-strip" aria-label="Other participants">
      {#each thumbnails as tile (tile.key)}
        <button
          type="button"
          class="thumbnail"
          aria-label={`Show ${tile.name} in spotlight`}
          onclick={() => pin(tile.key)}
        >
          <VideoTile
            stream={tile.stream}
            voiceTrack={tile.voiceTrack}
            name={tile.name}
            device={tile.device}
            microphoneMuted={tile.microphoneMuted}
            noiseCancellationEnabled={tile.noiseCancellationEnabled}
            cameraStopped={tile.cameraStopped}
            screenSharing={tile.screenSharing}
            screenOnly={tile.screenOnly}
            local={tile.local}
            mirrored={tile.mirrored}
            locallyMuted={tile.locallyMuted}
            compact
          />
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .spotlight-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
  }

  .spotlight-tile { min-height: 0; }
  .spotlight-tile :global(.video-card) { aspect-ratio: auto; height: min(60dvh, 32rem); }

  .empty-room {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
    justify-content: center;
    overflow: hidden;
    height: min(60dvh, 32rem);
    border: 1px solid var(--line-soft);
    border-radius: 2px;
    color: var(--muted);
    background: var(--bg-soft);
    text-align: center;
  }

  .empty-room strong { color: var(--accent); font-weight: 500; }

  .waiting-ring {
    width: 2.375rem;
    height: 2.375rem;
    margin-bottom: var(--space-3);
    border: 2px solid rgb(var(--accent-rgb) / 20%);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1.3s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    .waiting-ring { animation: none; }
  }

  .thumbnail-strip {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding-bottom: var(--space-1);
  }

  .thumbnail {
    flex: 0 0 auto;
    width: 6.5rem;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .thumbnail:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
