<script lang="ts">
  import { ArrowRight, X } from "@lucide/svelte"
  import { tick } from "svelte"
  import type { ChatMessage } from "./call/chat.svelte"

  interface Props {
    messages: ChatMessage[]
    onSend: (text: string) => void
    onClose: () => void
    sheet?: boolean
  }

  let { messages, onSend, onClose, sheet = false }: Props = $props()
  let draft = $state("")
  let list = $state<HTMLDivElement>()

  $effect(() => {
    messages.length
    tick().then(() => { if (list) list.scrollTop = list.scrollHeight })
  })

  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })

  function send(event: SubmitEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    draft = ""
  }
</script>

<aside
  class={["panel", sheet && "fixed inset-0 z-40 w-auto animate-slide-up rounded-none border-0 bg-canvas pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"]}
  aria-label="Chat"
>
  <header class={["panel-header", sheet && "py-4"]}>
    <h2 class="font-semibold">Chat</h2>
    <button type="button" class="icon-btn" aria-label="Close chat" onclick={onClose}><X size={16} /></button>
  </header>

  <div bind:this={list} class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" aria-live="polite">
    {#each messages as message (message.id)}
      <article class="flex flex-col gap-1">
        <div class="flex items-baseline gap-2">
          <strong class="text-caption font-semibold">{message.own ? "You" : message.senderName}</strong>
          <time class="text-2xs text-dim" datetime={new Date(message.timestamp).toISOString()}>{timeFormat.format(message.timestamp)}</time>
        </div>
        <p class="leading-[1.45] wrap-anywhere whitespace-pre-wrap text-ink-2">{message.text}</p>
      </article>
    {:else}
      <p class="my-auto text-center text-caption text-faint">Messages are visible to everyone in the call.</p>
    {/each}
  </div>

  <form class="flex gap-2 border-t border-line p-3" onsubmit={send}>
    <label for="chat-input" class="sr-only">Message</label>
    <input id="chat-input" class="field h-11 rounded-field bg-surface-3 px-3.5 text-sm" bind:value={draft} maxlength="4000" placeholder="Send a message" autocomplete="off" />
    <button type="submit" class="grid size-11 shrink-0 place-items-center rounded-field bg-ink text-canvas" aria-label="Send" disabled={!draft.trim()}>
      <ArrowRight size={16} strokeWidth={2.2} />
    </button>
  </form>
</aside>
