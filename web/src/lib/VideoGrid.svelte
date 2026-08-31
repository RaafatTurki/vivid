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
</script>

<div class="grid">
  <VideoTile stream={localStream} voiceTrack={processedAudioTrack} name={`${username} (You)`} device={deviceType} {microphoneMuted} {noiseCancellationEnabled} {cameraStopped} local mirrored={cameraFacing !== "environment"} />
  {#if screenSharing && displayStream}
    <VideoTile stream={displayStream} name="Your screen" screenSharing screenOnly local mirrored={false} />
  {/if}
  {#each [...peers.values()] as peer (peer.id)}
    <VideoTile stream={peer.stream} name={peer.name} device={peer.device} microphoneMuted={peer.microphoneMuted} noiseCancellationEnabled={peer.noiseCancellationEnabled} cameraStopped={peer.cameraStopped} locallyMuted={peer.locallyMuted} onToggleMute={() => onTogglePeerPlayback(peer.id)} />
    {#if peer.screenSharing && peer.screenStream}
      <VideoTile stream={peer.screenStream} name={`${peer.name}'s screen`} screenSharing screenOnly locallyMuted={peer.locallyMuted} />
    {/if}
  {/each}
  {#if peers.size === 0}
    <div class="empty-room">
      <span class="waiting-ring" aria-hidden="true"></span>
      <strong>Waiting for someone to join</strong>
      <span>Share the invite link to start the call.</span>
    </div>
  {/if}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-rows: auto;
    grid-auto-flow: row;
    gap: var(--space-3);
  }

  .empty-room {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;
    border: 1px solid var(--line-soft);
    border-radius: 2px;
    color: var(--muted);
    background: var(--bg-soft);
    text-align: center;
    aspect-ratio: 16 / 10;
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
</style>
