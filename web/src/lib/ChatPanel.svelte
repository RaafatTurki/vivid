<script lang="ts">
  import { Send, X } from "@lucide/svelte"
  import { tick } from "svelte"
  import Button from "./Button.svelte"
  import type { ChatMessage } from "./call/chat.svelte"

  interface Props {
    messages: ChatMessage[]
    open: boolean
    onSend: (text: string) => void
    variant?: "panel" | "sheet"
    onClose?: () => void
  }

  let { messages, open, onSend, variant = "panel", onClose = () => {} }: Props = $props()
  let text = $state("")
  let messagesElement = $state<HTMLDivElement>()

  $effect(() => {
    messages.length
    if (!open) return
    tick().then(() => {
      if (messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight
    })
  })

  function formatTime(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp)
  }

  function send(event: SubmitEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    onSend(value)
    text = ""
  }
</script>

{#if open}
  <aside class="chat-panel" class:sheet={variant === "sheet"} aria-label="Room chat">
    <header>
      <div class="chat-title"><strong>Chat</strong><span>{messages.length} messages</span></div>
      {#if variant === "sheet"}
        <Button size="icon" kind="ghost" aria-label="Close chat" onclick={onClose}><X aria-hidden="true" /></Button>
      {/if}
    </header>
    <div bind:this={messagesElement} class="messages" aria-live="polite">
      {#if messages.length === 0}<p class="empty">No messages yet.</p>{/if}
      {#each messages as message (message.id)}
        <article class:own={message.own}>
          <strong>{message.own ? "You" : message.senderName}</strong>
          <time datetime={new Date(message.timestamp).toISOString()}>{formatTime(message.timestamp)}</time>
          <p>{message.text}</p>
        </article>
      {/each}
    </div>
    <form onsubmit={send}>
      <input class="ui-field" bind:value={text} maxlength="4000" placeholder="Write a message" aria-label="Message" />
      <Button size="icon" type="submit" aria-label="Send message"><Send aria-hidden="true" /></Button>
    </form>
  </aside>
{/if}

<style>
  .chat-panel { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: 100%; height: 40rem; max-height: 75vh; border: 1px solid var(--accent-border); border-radius: 2px; background: var(--surface); }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border-bottom: 1px solid var(--line-soft); }
  header span { color: var(--muted); font-size: 0.72rem; }
  .chat-title { display: flex; gap: var(--space-2); align-items: baseline; }
  .messages { overflow-y: auto; padding: var(--space-3); }
  article { width: fit-content; max-width: 90%; margin-bottom: var(--space-3); padding: 0.45rem 0.6rem; border: 1px solid var(--line-soft); background: var(--surface-faint); }
  article.own { border-color: var(--accent-border); background: var(--accent-subtle); }
  article strong { color: var(--accent); font-size: 0.7rem; }
  article p { margin: 0.2rem 0 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  .empty { color: var(--muted); font-size: 0.82rem; text-align: center; }
  form { display: flex; gap: var(--space-2); padding: var(--space-3); border-top: 1px solid var(--line-soft); }
  input { min-width: 0; flex: 1; }
  time { margin-left: var(--space-2); color: var(--muted); font-size: 0.65rem; }

  .chat-panel.sheet {
    position: fixed;
    inset: 0;
    z-index: 40;
    height: 100%;
    max-height: 100dvh;
    border: 0;
    border-radius: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    animation: sheet-slide-up 200ms ease-out;
  }

  @keyframes sheet-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .chat-panel.sheet { animation: none; } }
</style>
