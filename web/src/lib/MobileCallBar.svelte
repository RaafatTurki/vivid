<script lang="ts">
  import { LogOut, MessageCircle, Mic, MicOff, MoreHorizontal, Video, VideoOff } from "@lucide/svelte"
  import Button from "./Button.svelte"

  interface Props {
    microphoneMuted: boolean
    cameraStopped: boolean
    chatOpen: boolean
    unreadChatMessages: number
    onToggleMicrophone: () => void | Promise<void>
    onToggleCamera: () => void | Promise<void>
    onToggleChat: () => void
    onLeave: () => void
    onMore: () => void
  }

  let {
    microphoneMuted,
    cameraStopped,
    chatOpen,
    unreadChatMessages,
    onToggleMicrophone,
    onToggleCamera,
    onToggleChat,
    onLeave,
    onMore,
  }: Props = $props()
</script>

<div class="mobile-call-bar" aria-label="Call controls">
  <Button size="icon" aria-label={microphoneMuted ? "Unmute microphone" : "Mute microphone"} pressed={microphoneMuted} onclick={onToggleMicrophone}>
    {#if microphoneMuted}<MicOff aria-hidden="true" />{:else}<Mic aria-hidden="true" />{/if}
  </Button>
  <Button size="icon" aria-label={cameraStopped ? "Start camera" : "Stop camera"} pressed={cameraStopped} onclick={onToggleCamera}>
    {#if cameraStopped}<VideoOff aria-hidden="true" />{:else}<Video aria-hidden="true" />{/if}
  </Button>
  <Button size="icon" kind="danger" aria-label="Leave call" onclick={onLeave}>
    <LogOut aria-hidden="true" />
  </Button>
  <Button size="icon" aria-label={chatOpen ? "Close chat" : "Open chat"} aria-expanded={chatOpen} onclick={onToggleChat}>
    <MessageCircle aria-hidden="true" />
    {#if unreadChatMessages && !chatOpen}<span class="badge">{unreadChatMessages}</span>{/if}
  </Button>
  <Button size="icon" aria-label="More call options" onclick={onMore}>
    <MoreHorizontal aria-hidden="true" />
  </Button>
</div>

<style>
  .mobile-call-bar {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 30;
    display: flex;
    gap: var(--space-2);
    justify-content: space-around;
    padding: var(--space-2) var(--space-3) calc(var(--space-2) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--line-soft);
    background: var(--surface);
  }

  .mobile-call-bar :global(.ui-button) {
    position: relative;
  }

  .badge {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    color: var(--bg);
    background: var(--accent);
    font-size: 0.6rem;
    font-weight: 800;
  }
</style>
