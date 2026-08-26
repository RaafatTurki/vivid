<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { cleanString, createRoomID, detectDeviceType, checkRoomID } from "./lib/utils"

  import { CallEngine } from "./lib/callEngine.svelte"
  import { ConnectionStatus, PageName } from "./lib/types"
  import TopBar from "./lib/TopBar.svelte"
  import CallPage from "./pages/CallPage.svelte"
  import HomePage from "./pages/HomePage.svelte"
  import Popup from "./lib/Popup.svelte"

  let roomInput = $state("")
  let signalInput = $state("")
  let username = $state("")
  let roomID = $state("")
  let currentPage = $state<PageName>(PageName.HOME)
  let joining = $state(false)
  let setupError = $state("")
  let statusState = $state<ConnectionStatus>(ConnectionStatus.IDLE)
  let statusText = $state("Ready")
  let copyLabel = $state("Copy invite link")
  let joinWithAudio = $state(true)
  let joinWithVideo = $state(true)
  let cameraError = $state("")
  let leavePromptOpen = $state(false)
  let installHint = $state("")

  let installPrompt: BeforeInstallPromptEvent | null = null
  let engine = $state.raw<CallEngine | null>(null)

  function handleDeviceChange(): void {
    engine?.refreshMediaDevices()
  }

  onMount(() => {
    engine = new CallEngine({
      isOnCallPage: () => currentPage === PageName.CALL,
      onStatus: (state, text) => { statusState = state; statusText = text },
      onJoined: () => { currentPage = PageName.CALL; navigateToCall() },
      onSetupError: (message) => { setupError = message },
      onCameraError: (message) => { cameraError = message },
    })
    engine.prepareJoinSound()

    const query = new URLSearchParams(window.location.search)
    const requestedRoom = query.get("room")
    signalInput = query.get("signal") || defaultSignalURL()
    username = localStorage.getItem("vivid-username") || ""
    window.addEventListener("beforeunload", closeConnections)
    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)
    window.addEventListener("popstate", handleRouteChange)
    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange)

    const routeRoom = roomFromPath()
    if (routeRoom) {
      roomInput = routeRoom
      roomID = routeRoom
      currentPage = PageName.CALL
      if (!username) username = `Guest ${createRoomID().slice(0, 4)}`
      joinCall()
    } else {
      roomInput = checkRoomID(requestedRoom) ? requestedRoom : createRoomID()
      if (window.location.pathname !== "/") window.history.replaceState({}, "", "/")
    }
  })

  onDestroy(() => {
    window.removeEventListener("beforeunload", closeConnections)
    window.removeEventListener("beforeinstallprompt", handleInstallPrompt)
    window.removeEventListener("appinstalled", handleAppInstalled)
    window.removeEventListener("popstate", handleRouteChange)
    navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange)
    closeConnections()
    engine?.destroyJoinSound()
  })

  function closeConnections(): void {
    engine?.close()
    engine?.resetCallUI()
  }

  async function joinCall(event?: SubmitEvent): Promise<void> {
    event?.preventDefault()
    if (!engine || joining) return
    setupError = ""
    joining = true
    const trimmedRoom = roomInput.trim()
    username = cleanString(username)
    roomID = trimmedRoom
    const ok = await engine.join(
      { username, deviceType: detectDeviceType(), joinWithAudio, joinWithVideo },
      signalInput,
      trimmedRoom,
    )
    if (ok) {
      localStorage.setItem("vivid-signal-url", signalInput.trim())
      localStorage.setItem("vivid-username", username)
    } else {
      joining = false
    }
  }

  function leaveCall(): void {
    if (!engine) return
    if (engine.peers.size === 0 && engine.chatMessages.length > 0) {
      leavePromptOpen = true
      return
    }
    goHome(true)
  }

  function handleLeavePrompt(value: string): void {
    leavePromptOpen = false
    if (value === "leave") goHome(true)
  }

  function goHome(pushHistory: boolean): void {
    closeConnections()
    joining = false
    currentPage = PageName.HOME
    roomInput = roomID
    cameraError = ""
    if (pushHistory) window.history.pushState({}, "", "/")
  }

  function handleRouteChange(): void {
    const nextRoom = roomFromPath()
    if (!nextRoom) {
      goHome(false)
      return
    }
    if (currentPage === PageName.CALL && roomID === nextRoom) return

    closeConnections()
    joining = false
    cameraError = ""
    roomInput = nextRoom
    roomID = nextRoom
    currentPage = PageName.CALL
    if (!username) username = `Guest ${createRoomID().slice(0, 4)}`
    joinCall()
  }

  function navigateToCall(): void {
    const nextPath = `/${encodeURIComponent(roomID)}`
    if (window.location.pathname !== nextPath || window.location.search || window.location.hash) {
      window.history.pushState({}, "", nextPath)
    }
  }

  function roomFromPath(): string {
    const parts = window.location.pathname.split("/").filter(Boolean)
    if (parts.length !== 1) return ""
    try {
      const value = decodeURIComponent(parts[0])
      return checkRoomID(value) ? value : ""
    } catch {
      return ""
    }
  }

  async function copyInviteLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteURL())
      copyLabel = "Copied"
    } catch {
      window.prompt("Copy this invite link:", inviteURL())
    }
    window.setTimeout(() => copyLabel = "Copy invite link", 1600)
  }

  function inviteURL(): string {
    const url = new URL(window.location.href)
    url.search = ""
    url.hash = ""
    url.pathname = `/${encodeURIComponent(roomID)}`
    return url.toString()
  }

  function defaultSignalURL(): string {
    const saved = localStorage.getItem("vivid-signal-url")
    if (saved) return saved
    if (window.location.hostname === "raafat.io" || window.location.hostname.endsWith(".raafat.io")) {
      return "wss://signal.raafat.io/v1/ws"
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${window.location.hostname || "localhost"}:8080/v1/ws`
  }

  function handleInstallPrompt(event: Event): void {
    event.preventDefault()
    installPrompt = event as BeforeInstallPromptEvent
  }

  function handleAppInstalled(): void {
    installPrompt = null
  }

  async function installApp(): Promise<void> {
    if (!installPrompt) {
      installHint = "Install is available from your browser menu when this site is open over HTTPS."
      return
    }
    const prompt = installPrompt
    installPrompt = null
    installHint = ""
    await prompt.prompt()
    await prompt.userChoice
  }


</script>

<svelte:head><title>{currentPage === PageName.CALL ? `${roomID} · Vivid` : "Vivid"}</title></svelte:head>

<main class:shell-wide={currentPage === PageName.CALL} class="shell">
  <TopBar state={statusState} text={statusText} />

  {#if currentPage === PageName.HOME}
    <HomePage
      bind:roomInput
      bind:signalInput
      bind:username
      bind:joinWithAudio
      bind:joinWithVideo
      {joining}
      {setupError}
      {installHint}
      onJoin={joinCall}
      onInstall={installApp}
    />
  {:else if engine}
    <CallPage
      session={{
        roomID,
        copyLabel,
        username,
        deviceType: engine.deviceType,
        peers: engine.peers,
        cameraError,
        onCopy: copyInviteLink,
        onTogglePeerPlayback: engine.togglePeerPlayback.bind(engine),
        onLeave: leaveCall,
      }}
      media={{
        localStream: engine.localStream,
        displayStream: engine.displayStream,
        processedAudioTrack: engine.processedAudioTrack,
        microphoneMuted: engine.microphoneMuted,
        noiseCancellationEnabled: engine.noiseCancellationEnabled,
        cameraStopped: engine.cameraStopped,
        cameraFacing: engine.cameraFacing,
        screenSharing: engine.screenSharing,
        audioDevices: engine.audioDevices,
        videoDevices: engine.videoDevices,
        selectedAudioDeviceID: engine.selectedAudioDeviceID,
        selectedVideoDeviceID: engine.selectedVideoDeviceID,
        switchingAudioDevice: engine.switchingAudioDevice,
        switchingVideoDevice: engine.switchingVideoDevice,
        canShareScreen: engine.canShareScreen,
        sharingScreen: engine.sharingScreen,
        canSwitchCamera: engine.canSwitchCamera,
        switchingCamera: engine.switchingCamera,
        onAudioDeviceChange: (id: string) => engine!.changeAudioDevice(id),
        onVideoDeviceChange: (id: string) => engine!.changeVideoDevice(id),
        onToggleMicrophone: () => engine!.toggleMicrophone(),
        onToggleNoiseCancellation: () => engine!.toggleNoiseCancellation(),
        onToggleCamera: () => engine!.toggleCamera(),
        onToggleScreenShare: () => engine!.toggleScreenShare(),
        onStartScreenShare: (frameRate: 30 | 60 | 120) => engine!.startScreenShare(frameRate),
        onSwitchCamera: () => engine!.switchCamera(),
      }}
      chat={{
        messages: engine.chatMessages,
        open: engine.chatOpen,
        unread: engine.unreadChatMessages,
        onSend: (text: string) => engine!.sendChat(text),
        onToggle: () => engine!.toggleChat(),
      }}
    />
  {/if}
</main>

<Popup
  open={leavePromptOpen}
  title="Leave room?"
  message="You are the last person in this room. Leaving will permanently delete the chat messages."
  options={[{ value: "cancel", label: "Stay in room" }, { value: "leave", label: "Leave room" }]}
  onSelect={handleLeavePrompt}
  onClose={() => leavePromptOpen = false}
/>


<style>
  .shell {
    width: min(var(--content-width), calc(100% - 2rem));
    min-height: 100vh;
    margin: 0 auto;
    padding: 2rem 0 6rem;
  }

  .shell-wide {
    width: 100%;
    padding: clamp(1rem, 2vw, 2rem);
  }

  @media (max-width: 50em) {
    .shell {
      width: min(var(--content-width), calc(100% - 1rem));
      padding: 2rem 0 4rem;
    }

    .shell-wide {
      width: 100%;
      padding: 1rem;
    }
  }
</style>

