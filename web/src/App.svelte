<script lang="ts">
  import { onMount } from "svelte"
  import { X } from "@lucide/svelte"
  import { CallEngine } from "./lib/callEngine.svelte"
  import { PageName } from "./lib/types"
  import { checkRoomID, cleanString, createRoomID } from "./lib/utils"
  import Popup from "./lib/Popup.svelte"
  import HomePage from "./pages/HomePage.svelte"
  import LobbyPage from "./pages/LobbyPage.svelte"
  import CallPage from "./pages/CallPage.svelte"

  let page = $state<PageName>(PageName.HOME)
  let roomID = $state("")
  let username = $state(readName())
  let joining = $state(false)
  let error = $state("")
  let leavePromptOpen = $state(false)

  const engine = new CallEngine({
    onError: (message) => error = message,
    onRejected: (reason) => {
      page = PageName.LOBBY
      error = reason
    },
  })

  const inviteURL = $derived(`${window.location.origin}/${roomID}`)

  onMount(() => {
    const room = roomFromPath()
    if (room) openRoom(room, false)
    else if (window.location.pathname !== "/") window.history.replaceState({}, "", "/")

    const close = () => engine.close()
    const refresh = () => engine.media.refreshDevices()
    window.addEventListener("beforeunload", close)
    window.addEventListener("popstate", handleRouteChange)
    navigator.mediaDevices?.addEventListener("devicechange", refresh)
    return () => {
      window.removeEventListener("beforeunload", close)
      window.removeEventListener("popstate", handleRouteChange)
      navigator.mediaDevices?.removeEventListener("devicechange", refresh)
      engine.close()
    }
  })

  // Auto-hide in-call errors; lobby errors stay until the next attempt.
  $effect(() => {
    if (!error || page !== PageName.CALL) return
    const timer = setTimeout(() => error = "", 6000)
    return () => clearTimeout(timer)
  })

  function openRoom(id: string, push: boolean): void {
    roomID = id
    error = ""
    page = PageName.LOBBY
    if (push) window.history.pushState({}, "", `/${id}`)
    engine.media.startPreview()
  }

  async function join(): Promise<void> {
    if (joining) return
    joining = true
    error = ""
    username = cleanString(username)
    if (await engine.join(username, roomID)) {
      page = PageName.CALL
      try { localStorage.setItem("vivid-username", username) } catch {}
    }
    joining = false
  }

  function leave(): void {
    if (engine.peers.size === 0 && engine.chat.messages.length > 0) leavePromptOpen = true
    else goHome(true)
  }

  function goHome(push: boolean): void {
    engine.close()
    page = PageName.HOME
    error = ""
    leavePromptOpen = false
    if (push) window.history.pushState({}, "", "/")
  }

  function handleRouteChange(): void {
    const room = roomFromPath()
    if (!room) goHome(false)
    else if (room !== roomID || page === PageName.HOME) {
      engine.close()
      openRoom(room, false)
    }
  }

  function roomFromPath(): string {
    const parts = window.location.pathname.split("/").filter(Boolean)
    return parts.length === 1 && checkRoomID(parts[0]) ? parts[0] : ""
  }

  function readName(): string {
    try { return localStorage.getItem("vivid-username") || "" } catch { return "" }
  }

  async function copyInvite(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(inviteURL)
      return true
    } catch {
      window.prompt("Copy this invite link:", inviteURL)
      return false
    }
  }
</script>

<svelte:head><title>{page === PageName.HOME ? "Vivid" : `${roomID} · Vivid`}</title></svelte:head>

{#if page === PageName.HOME}
  <HomePage onNewMeeting={() => openRoom(createRoomID(), true)} onOpenRoom={(id) => openRoom(id, true)} />
{:else if page === PageName.LOBBY}
  <LobbyPage
    {roomID}
    {inviteURL}
    media={engine.media}
    bind:username
    {joining}
    {error}
    onJoin={join}
    onHome={() => goHome(true)}
    onCopy={copyInvite}
  />
{:else}
  <CallPage {engine} {roomID} {username} onLeave={leave} onCopy={copyInvite} />
  {#if error}
    <div
      class="alert fixed top-[calc(16px+env(safe-area-inset-top))] left-1/2 z-50 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 bg-[#1c1012] shadow-float"
      role="alert"
    >
      <span>{error}</span>
      <button type="button" class="grid place-items-center p-0.5" aria-label="Dismiss" onclick={() => error = ""}><X size={14} /></button>
    </div>
  {/if}
{/if}

<Popup
  open={leavePromptOpen}
  title="Leave the call?"
  message="You're the last one here. Leaving ends the room and deletes the chat."
  options={[{ value: "leave", label: "Leave call", primary: true }, { value: "stay", label: "Stay" }]}
  onSelect={(value) => value === "leave" ? goHome(true) : leavePromptOpen = false}
  onClose={() => leavePromptOpen = false}
/>

