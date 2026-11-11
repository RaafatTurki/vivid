<script lang="ts">
  import { onMount } from "svelte"
  import { Check, Copy, Lock, MessageCircle, Mic, MicOff, PhoneOff, ScreenShare, SwitchCamera, Users, Video, VideoOff } from "@lucide/svelte"
  import Logo from "../lib/Logo.svelte"
  import VideoTile from "../lib/VideoTile.svelte"
  import ChatPanel from "../lib/ChatPanel.svelte"
  import PeoplePanel from "../lib/PeoplePanel.svelte"
  import SettingsMenu from "../lib/SettingsMenu.svelte"
  import { mediaQuery, MOBILE_BREAKPOINT } from "../lib/mediaQuery.svelte"
  import { formatDuration } from "../lib/utils"
  import type { CallEngine } from "../lib/callEngine.svelte"

  interface Props {
    engine: CallEngine
    roomID: string
    username: string
    onLeave: () => void
    onCopy: () => Promise<boolean>
  }

  let { engine, roomID, username, onLeave, onCopy }: Props = $props()
  const media = $derived(engine.media)
  const chat = $derived(engine.chat)

  interface Tile {
    key: string
    name: string
    stream: MediaStream | null
    voiceTrack?: MediaStreamTrack | null
    microphoneMuted: boolean
    cameraStopped: boolean
    screenSharing: boolean
    local?: boolean
    mirrored?: boolean
  }

  interface Screen { key: string; label: string; stream: MediaStream; local: boolean }

  const isMobile = mediaQuery(MOBILE_BREAKPOINT)
  let peopleOpen = $state(false)
  let spotlightKey = $state<string | null>(null)
  let copied = $state(false)
  let now = $state(Date.now())

  onMount(() => {
    if (isMobile.matches) chat.open = false
    const timer = setInterval(() => now = Date.now(), 1000)
    return () => clearInterval(timer)
  })

  const self = $derived<Tile>({
    key: "self",
    name: "You",
    stream: media.localStream,
    voiceTrack: media.processedAudioTrack,
    microphoneMuted: media.microphoneMuted,
    cameraStopped: media.cameraStopped,
    screenSharing: media.screenSharing,
    local: true,
    mirrored: media.cameraFacing !== "environment",
  })

  const remotes = $derived<Tile[]>([...engine.peers.values()].map(peer => ({
    key: peer.id,
    name: peer.name,
    stream: peer.stream,
    microphoneMuted: peer.microphoneMuted,
    cameraStopped: peer.cameraStopped,
    screenSharing: peer.screenSharing,
  })))

  const tiles = $derived([...remotes, self])

  const screens = $derived.by<Screen[]>(() => {
    const list: Screen[] = []
    for (const peer of engine.peers.values()) {
      if (peer.screenSharing && peer.screenStream) list.push({ key: `${peer.id}-screen`, label: `${peer.name}'s screen`, stream: peer.screenStream, local: false })
    }
    if (media.screenSharing && media.displayStream) list.push({ key: "self-screen", label: "Your screen", stream: media.displayStream, local: true })
    return list
  })

  const people = $derived([
    { ...self, name: `${username} (you)` },
    ...remotes,
  ])

  const columns = $derived(gridColumns(tiles.length + (remotes.length ? 0 : 1)))
  const elapsed = $derived(engine.joinedAt ? formatDuration(now - engine.joinedAt) : "00:00")

  // Mobile: one big tile, self as picture-in-picture, everyone else in a strip.
  const spotlight = $derived(remotes.find(tile => tile.key === spotlightKey) ?? remotes[0] ?? null)
  const strip = $derived(remotes.filter(tile => tile !== spotlight))

  function tileProps(tile: Tile) {
    return {
      stream: tile.stream,
      voiceTrack: tile.voiceTrack,
      name: tile.name,
      avatarName: tile.local ? username : tile.name,
      colorKey: tile.key,
      microphoneMuted: tile.microphoneMuted,
      cameraStopped: tile.cameraStopped,
      local: tile.local,
      mirrored: tile.mirrored,
    }
  }

  function gridColumns(count: number): number {
    if (count <= 1) return 1
    if (count <= 4) return 2
    if (count <= 9) return 3
    return 4
  }

  function toggleChat() {
    peopleOpen = false
    chat.toggle()
  }

  function togglePeople() {
    if (chat.open) chat.toggle()
    peopleOpen = !peopleOpen
  }

  async function copy() {
    if (!await onCopy()) return
    copied = true
    setTimeout(() => copied = false, 1500)
  }
</script>

{#snippet inviteCard(compact = false)}
  <div
    class={[
      "flex min-h-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong text-center text-caption text-muted",
      compact ? "shrink-0 p-4" : "p-6",
    ]}
  >
    <strong class="text-md font-semibold text-ink">Waiting for others</strong>
    <span>Share the link to invite people to this call.</span>
    <button type="button" class="btn btn-secondary mt-3 h-10 px-4 text-caption" onclick={copy}>
      {#if copied}<Check size={16} />Copied{:else}<Copy size={16} />Copy invite link{/if}
    </button>
  </div>
{/snippet}

{#snippet micButton(large: boolean)}
  <button type="button" class={["round", large && "size-14"]} data-off={media.microphoneMuted} aria-pressed={media.microphoneMuted} aria-label={media.microphoneMuted ? "Unmute microphone" : "Mute microphone"} onclick={() => media.toggleMicrophone()}>
    {#if media.microphoneMuted}<MicOff size={large ? 22 : 20} />{:else}<Mic size={large ? 22 : 20} />{/if}
  </button>
{/snippet}

{#snippet camButton(large: boolean)}
  <button type="button" class={["round", large && "size-14"]} data-off={media.cameraStopped} aria-pressed={media.cameraStopped} aria-label={media.cameraStopped ? "Turn on camera" : "Turn off camera"} onclick={() => media.toggleCamera()}>
    {#if media.cameraStopped}<VideoOff size={large ? 22 : 20} />{:else}<Video size={large ? 22 : 20} />{/if}
  </button>
{/snippet}

{#snippet chatButton(large: boolean)}
  <button type="button" class={["round", large && "size-14"]} aria-pressed={chat.open} aria-label="Chat" onclick={toggleChat}>
    <MessageCircle size={large ? 22 : 20} />
    {#if chat.unread && !chat.open}<span class="badge">{chat.unread}</span>{/if}
  </button>
{/snippet}

{#if isMobile.matches}
  <div class="flex h-dvh flex-col overflow-hidden">
    <header class="flex min-h-19 items-center justify-between px-5 pt-[calc(20px+env(safe-area-inset-top))] pb-3">
      <div class="flex flex-col gap-0.5 font-mono">
        <span class="text-md font-semibold">{roomID}</span>
        <span class="text-xs text-muted">{elapsed} · {tiles.length} {tiles.length === 1 ? "person" : "people"}</span>
      </div>
      {#if media.canSwitchCamera}
        <button type="button" class="round size-11" aria-label="Switch camera" disabled={media.switchingCamera} onclick={() => media.switchCamera()}><SwitchCamera size={18} /></button>
      {/if}
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-2 px-3">
      <div class="relative min-h-0 flex-1">
        {#if screens[0]}
          <VideoTile stream={screens[0].stream} name={screens[0].label} screen local={screens[0].local} class="rounded-[20px]" />
        {:else if spotlight}
          <VideoTile {...tileProps(spotlight)} class="rounded-[20px]" />
        {:else}
          <VideoTile {...tileProps(self)} class="rounded-[20px]" />
        {/if}
        {#if spotlight || screens[0]}
          <div class="absolute top-3 right-3 h-35 w-26 overflow-hidden rounded-[14px] border border-[#2a2a2f] shadow-[0_8px_24px_rgb(0_0_0/40%)]">
            <VideoTile {...tileProps(self)} size="sm" label={false} class="rounded-[14px]" />
          </div>
        {/if}
      </div>

      {#if !remotes.length}
        {@render inviteCard(true)}
      {:else if strip.length || screens[0]}
        <div class="flex h-33 shrink-0 snap-x snap-mandatory gap-2 overflow-x-auto">
          {#each screens[0] && spotlight ? [spotlight, ...strip] : strip as tile (tile.key)}
            <button type="button" class="h-full flex-[0_0_calc(50%-4px)] snap-start rounded-2xl" aria-label="Show {tile.name}" onclick={() => spotlightKey = tile.key}>
              <VideoTile {...tileProps(tile)} size="sm" class="rounded-2xl" />
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <nav class="flex items-center justify-between px-6 pt-5 pb-[calc(24px+env(safe-area-inset-bottom))]" aria-label="Call controls">
      {@render micButton(true)}
      {@render camButton(true)}
      {@render chatButton(true)}
      <button type="button" class="leave-btn h-14 w-18 px-0" aria-label="Leave call" onclick={onLeave}><PhoneOff size={24} /></button>
    </nav>

    {#if chat.open}
      <ChatPanel sheet messages={chat.messages} onSend={(text) => chat.send(text)} onClose={toggleChat} />
    {/if}
  </div>
{:else}
  <div class="flex h-dvh flex-col overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
      <div class="flex items-center gap-3 font-medium">
        <Logo size={26} label={false} />
        <span>Room <span class="font-mono font-normal">{roomID}</span></span>
        <span class="h-3.5 w-px bg-line-strong" aria-hidden="true"></span>
        <span class="font-mono text-caption font-normal text-muted" aria-label="Call duration">{elapsed}</span>
      </div>
      <div class="flex items-center gap-2">
        {#if media.screenSharing}
          <span class="pill bg-accent/12 font-medium text-accent"><span class="size-1.5 rounded-full bg-accent"></span>You are presenting</span>
        {/if}
        <span class="pill"><Lock size={12} class="text-accent" strokeWidth={2.2} />Encrypted</span>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 gap-3 px-5">
      <section class="flex min-w-0 flex-1 flex-col gap-3" aria-label="Participants">
        {#if screens.length}
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            <div class="min-h-0 flex-1">
              <VideoTile stream={screens[0].stream} name={screens[0].label} screen local={screens[0].local} label={false} class="rounded-none" />
            </div>
            <div class="border-t border-line px-3.5 py-2.5 text-xs text-muted">{screens[0].label}</div>
          </div>
          <div class="flex h-33 shrink-0 gap-3 overflow-x-auto">
            {#each tiles as tile (tile.key)}
              <div class="h-full w-55 flex-none"><VideoTile {...tileProps(tile)} size="sm" /></div>
            {/each}
          </div>
        {:else}
          <div
            class="grid min-h-0 flex-1 gap-3"
            style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
            style:grid-template-rows="repeat({Math.ceil((tiles.length + (remotes.length ? 0 : 1)) / columns)}, minmax(0, 1fr))"
          >
            {#each tiles as tile (tile.key)}
              <div class="tile-cell"><div><VideoTile {...tileProps(tile)} /></div></div>
            {/each}
            {#if !remotes.length}<div class="tile-cell">{@render inviteCard()}</div>{/if}
          </div>
        {/if}
      </section>

      {#if chat.open}
        <ChatPanel messages={chat.messages} onSend={(text) => chat.send(text)} onClose={toggleChat} />
      {:else if peopleOpen}
        <PeoplePanel {people} onClose={() => peopleOpen = false} />
      {/if}
    </div>

    <nav class="flex flex-wrap items-center justify-between gap-3 px-5 py-4" aria-label="Call controls">
      <div class="flex flex-[1_1_160px] gap-2">
        <button type="button" class="ghost-btn" onclick={copy}>
          {#if copied}<Check size={16} />Copied{:else}<Copy size={16} />Copy invite link{/if}
        </button>
      </div>
      <div class="flex items-center gap-2.5">
        {@render micButton(false)}
        {@render camButton(false)}
        {#if media.canShareScreen}
          <button type="button" class="round" aria-pressed={media.screenSharing} aria-label={media.screenSharing ? "Stop presenting" : "Share screen"} disabled={media.sharingScreen} onclick={() => media.toggleScreenShare()}>
            <ScreenShare size={20} />
          </button>
        {/if}
        {@render chatButton(false)}
        <button type="button" class="leave-btn" aria-label="Leave call" onclick={onLeave}><PhoneOff size={20} />Leave</button>
      </div>
      <div class="flex flex-[1_1_160px] justify-end gap-2">
        <button type="button" class="ghost-btn" aria-label="Participants" aria-pressed={peopleOpen} onclick={togglePeople}><Users size={18} />{tiles.length}</button>
        <SettingsMenu {media} />
      </div>
    </nav>
  </div>
{/if}
