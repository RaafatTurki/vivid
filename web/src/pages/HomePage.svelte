<script lang="ts">
  import { Lock, Monitor, Shield, Video, Zap } from "@lucide/svelte"
  import Logo from "../lib/Logo.svelte"
  import { checkRoomID, roomFromInput } from "../lib/utils"

  let { onNewMeeting, onOpenRoom }: { onNewMeeting: () => void; onOpenRoom: (roomID: string) => void } = $props()

  let code = $state("")
  let error = $state("")
  const room = $derived(checkRoomID(code) ? code : "")

  const features = [
    { icon: Shield, label: "Private by default" },
    { icon: Zap, label: "Instant rooms" },
    { icon: Monitor, label: "Runs in the browser" },
  ]

  const INVALID_CODE = "Room codes are 6 letters or numbers."

  function join(event: SubmitEvent) {
    event.preventDefault()
    if (room) onOpenRoom(room)
    else error = INVALID_CODE
  }

  // Typing is limited to 6 letters/digits; pasting a full invite link drops in just its code.
  function sanitize() {
    code = code.replace(/[^A-Za-z0-9]/g, "").slice(0, 6)
    error = ""
  }

  function paste(event: ClipboardEvent) {
    const id = roomFromInput(event.clipboardData?.getData("text") ?? "")
    if (!id) return
    event.preventDefault()
    code = id
    error = ""
  }

  function validate() {
    error = code.trim() && !room ? INVALID_CODE : ""
  }
</script>

<div class="flex min-h-dvh flex-col">
  <header class="page-header max-xs:px-5">
    <Logo />
    <span class="flex items-center gap-2 text-caption text-muted"><Lock size={14} class="text-accent" />End-to-end encrypted</span>
  </header>

  <main class="flex flex-1 items-center justify-center px-6 py-6 xs:py-12">
    <div class="flex w-full max-w-110 flex-col gap-10">
      <div class="flex flex-col gap-3">
        <h1 class="text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] xs:text-[40px]">Simple. Secure.<br />Vivid.</h1>
        <p class="text-base leading-normal text-muted">Start a call in one click. No accounts, no downloads — just share the link.</p>
      </div>

      <div class="flex flex-col gap-4">
        <button type="button" class="btn btn-primary" onclick={onNewMeeting}><Video size={18} />New meeting</button>

        <div
          class="flex items-center gap-3 text-xs tracking-[0.08em] text-faint uppercase before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line"
          aria-hidden="true"
        >
          <span>or join</span>
        </div>

        <form class="flex gap-2" onsubmit={join} novalidate>
          <label for="code" class="sr-only">Meeting code or link</label>
          <input
            id="code"
            class="field flex-1 font-mono text-sm aria-invalid:border-danger-ink/50"
            bind:value={code}
            maxlength={6}
            oninput={sanitize}
            onpaste={paste}
            onblur={validate}
            placeholder="Enter code or paste link"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            aria-invalid={!!error}
            aria-describedby={error ? "code-error" : undefined}
          />
          <button type="submit" class={["btn btn-secondary", room ? "text-ink" : "text-dim"]}>Join</button>
        </form>
        {#if error}<p id="code-error" class="-mt-1.5 text-caption text-danger-ink" role="alert">{error}</p>{/if}
      </div>

      <ul class="grid grid-cols-3 gap-2 border-t border-surface-2 pt-2">
        {#each features as { icon: Icon, label } (label)}
          <li class="flex flex-col gap-1.5 pt-4 text-caption text-ink-2"><Icon size={18} strokeWidth={1.8} class="text-muted" />{label}</li>
        {/each}
      </ul>
    </div>
  </main>

  <footer class="px-8 py-5 text-xs text-faint max-xs:px-5">{window.location.host}</footer>
</div>
